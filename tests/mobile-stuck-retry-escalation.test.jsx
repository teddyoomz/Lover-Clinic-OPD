// ─── Mobile stuck-retry escalation (2026-07-20) — /systematic-debugging ──────
// Field report: iPhone PWA, สลับ frontend↔backend → hub ค้าง "กำลังโหลด" → banner
// "ลองใหม่" → กดแล้ว fail ซ้ำตลอด → ต้องฆ่าแอป. Root cause (evidence: beacon log
// EMPTY = silent hang, no throw): iOS freezes the background tab holding the
// persistentMultipleTabManager primary lease → every Firestore op on the
// foreground tab hangs → reconnectFirestore()'s awaited disableNetwork never
// settles → `toggling` latched TRUE forever → every later heal path (V17
// visibility, auto-retry, manual retry, branch-aware) silently no-ops → only an
// app kill recovers. TWO-LAYER FIX (mirror of the proven lazyRetry ladder):
//   L1 firestoreReconnect: 4s timebox — latch ALWAYS clears; timeout ⇒ wedge
//      marker + [conn-wedge] telemetry; a completed toggle clears the marker.
//   L2 useResilientLoad.retry(): press#1 = reconnect NOW + resubscribe;
//      wedged OR press-after-a-failed-press = hardReloadApp() — the automated
//      "ปิดแอปเข้าใหม่" that heals every wedge flavor.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'fs';

// ── R1 — firestoreReconnect timebox + wedge marker ──────────────────────────
describe('R1 — reconnectFirestore timebox (latch can never stick)', () => {
  let disableImpl;
  let enableImpl;
  const telemetry = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    disableImpl = vi.fn(async () => {});
    enableImpl = vi.fn(async () => {});
    vi.doMock('firebase/firestore', () => ({
      disableNetwork: (...a) => disableImpl(...a),
      enableNetwork: (...a) => enableImpl(...a),
    }));
    vi.doMock('../src/firebase.js', () => ({ db: {} }));
    vi.doMock('../src/lib/errorBeacon.js', () => ({
      reportTelemetryToBeacon: telemetry,
    }));
    telemetry.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('firebase/firestore');
    vi.doUnmock('../src/firebase.js');
    vi.doUnmock('../src/lib/errorBeacon.js');
  });

  async function load() {
    const mod = await import('../src/lib/firestoreReconnect.js');
    mod.__resetReconnectDebounceForTest();
    return mod;
  }

  it('R1.1 hanging disableNetwork → timebox resolves, latch clears, wedge marker set, telemetry sent', async () => {
    const mod = await load();
    disableImpl = vi.fn(() => new Promise(() => {})); // NEVER settles (the field hang)
    const p = mod.reconnectFirestore();
    await vi.advanceTimersByTimeAsync(4100);
    await p; // must RESOLVE (not hang) — the timebox
    expect(mod.isConnectionWedged()).toBe(true);
    expect(telemetry).toHaveBeenCalledWith(expect.stringContaining('[conn-wedge]'));
    // latch cleared: a later call (past debounce) reaches disableNetwork again
    await vi.advanceTimersByTimeAsync(2000);
    disableImpl = vi.fn(async () => {});
    enableImpl = vi.fn(async () => {});
    await mod.reconnectFirestore();
    expect(disableImpl).toHaveBeenCalledTimes(1);
  });

  it('R1.2 a COMPLETED toggle clears the wedge marker (queue proven alive)', async () => {
    const mod = await load();
    disableImpl = vi.fn(() => new Promise(() => {}));
    const p = mod.reconnectFirestore();
    await vi.advanceTimersByTimeAsync(4100);
    await p;
    expect(mod.isConnectionWedged()).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    disableImpl = vi.fn(async () => {});
    enableImpl = vi.fn(async () => {});
    await mod.reconnectFirestore();
    expect(mod.isConnectionWedged()).toBe(false);
  });

  it('R1.3 hanging enableNetwork also timeboxes + wedges', async () => {
    const mod = await load();
    enableImpl = vi.fn(() => new Promise(() => {}));
    const p = mod.reconnectFirestore();
    await vi.advanceTimersByTimeAsync(4100);
    await p;
    expect(mod.isConnectionWedged()).toBe(true);
  });

  it('R1.4 normal toggle behavior preserved (disable → enable, no wedge)', async () => {
    const mod = await load();
    await mod.reconnectFirestore();
    expect(disableImpl).toHaveBeenCalledTimes(1);
    expect(enableImpl).toHaveBeenCalledTimes(1);
    expect(mod.isConnectionWedged()).toBe(false);
  });
});

// ── R2/R3 — useResilientLoad escalation ladder ──────────────────────────────
describe('R2 — useResilientLoad retry escalation', () => {
  const mockReconnect = vi.fn();
  const mockHardReload = vi.fn();
  let wedgedState = false;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mockReconnect.mockClear();
    mockHardReload.mockClear();
    wedgedState = false;
    vi.doMock('../src/lib/firestoreReconnect.js', () => ({
      reconnectFirestore: mockReconnect,
      isConnectionWedged: () => wedgedState,
      hardReloadApp: mockHardReload,
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('../src/lib/firestoreReconnect.js');
  });

  async function mountHook() {
    const { useResilientLoad } = await import('../src/hooks/useResilientLoad.js');
    return renderHook(() => useResilientLoad());
  }
  const toError = async (hook) => {
    // soft-timeout ×2 (auto-retry then error)
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(hook.result.current.loadStatus).toBe('error');
  };

  it('R2.1 manual retry press#1 fires reconnectFirestore IMMEDIATELY (no 8s wait)', async () => {
    const hook = await mountHook();
    await toError(hook);
    const callsBefore = mockReconnect.mock.calls.length;
    act(() => { hook.result.current.retry(); });
    expect(mockReconnect.mock.calls.length).toBe(callsBefore + 1);
    expect(mockHardReload).not.toHaveBeenCalled();
    expect(hook.result.current.loadStatus).toBe('loading');
  });

  it('R2.2 connection WEDGED → press#1 escalates straight to hardReloadApp', async () => {
    const hook = await mountHook();
    await toError(hook);
    wedgedState = true;
    act(() => { hook.result.current.retry(); });
    expect(mockHardReload).toHaveBeenCalledTimes(1);
  });

  it('R2.3 press#1 fails again → press#2 escalates to hardReloadApp (ปิดแอปเข้าใหม่ อัตโนมัติ)', async () => {
    const hook = await mountHook();
    await toError(hook);
    act(() => { hook.result.current.retry(); });       // press#1
    expect(mockHardReload).not.toHaveBeenCalled();
    await toError(hook);                                // press#1's load fails too
    act(() => { hook.result.current.retry(); });       // press#2
    expect(mockHardReload).toHaveBeenCalledTimes(1);
  });

  it('R2.4 press#1 RECOVERS (markReady) → a later NEW-context failure starts the ladder over (no stale escalation)', async () => {
    const { useResilientLoad } = await import('../src/hooks/useResilientLoad.js');
    const hook = renderHook(({ k }) => useResilientLoad({ resetKey: k }), { initialProps: { k: 1 } });
    await toError(hook);
    act(() => { hook.result.current.retry(); });       // press#1
    act(() => { hook.result.current.markReady(); });    // recovered!
    expect(hook.result.current.loadStatus).toBe('ready');
    // ...later the load CONTEXT changes (branch switch) and fails again —
    // press#1 of the NEW context must NOT reload (ladder reset by markReady)
    act(() => { hook.rerender({ k: 2 }); });
    act(() => { hook.result.current.markError(); });
    act(() => { hook.result.current.markError(); });
    expect(hook.result.current.loadStatus).toBe('error');
    act(() => { hook.result.current.retry(); });
    expect(mockHardReload).not.toHaveBeenCalled();
  });

  it('R3.1 Rule I chain — hang→timeout→auto-retry(reconnect)→error→press1→still dead→press2→RELOAD', async () => {
    const hook = await mountHook();
    // initial hang: 8s → silent auto-retry (reconnect #1) ; 8s → error
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(mockReconnect).toHaveBeenCalledTimes(1);
    expect(hook.result.current.loadStatus).toBe('loading');
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(hook.result.current.loadStatus).toBe('error');
    // press#1: reconnect NOW + resubscribe
    act(() => { hook.result.current.retry(); });
    expect(mockReconnect).toHaveBeenCalledTimes(2);
    // still dead → soft-timeout ladder to error again
    await toError(hook);
    // press#2: the automated app-kill
    act(() => { hook.result.current.retry(); });
    expect(mockHardReload).toHaveBeenCalledTimes(1);
  });
});

// ── R4 — source-grep locks ──────────────────────────────────────────────────
describe('R4 — wiring locks', () => {
  it('R4.1 firestoreReconnect exports the wedge API + timebox', () => {
    const src = readFileSync('src/lib/firestoreReconnect.js', 'utf8');
    expect(src).toMatch(/export function isConnectionWedged/);
    expect(src).toMatch(/export function hardReloadApp/);
    expect(src).toMatch(/TOGGLE_TIMEOUT_MS/);
    expect(src).toMatch(/Promise\.race/);
  });
  it('R4.2 useResilientLoad wires the ladder (wedge check + failed-press escalation)', () => {
    const src = readFileSync('src/hooks/useResilientLoad.js', 'utf8');
    expect(src).toMatch(/isConnectionWedged\(\)/);
    expect(src).toMatch(/hardReloadApp\(/);
    expect(src).toMatch(/reconnectFirestore\(\)/);
  });
  it('R4.3 hardReloadApp beacons before reloading (field observability)', () => {
    const src = readFileSync('src/lib/firestoreReconnect.js', 'utf8');
    expect(src).toMatch(/reportTelemetryToBeacon/);
    expect(src).toMatch(/window\.location\.reload\(\)/);
  });
  it('R4.4 V17 + branch-aware + TFP heal paths still route through the (now un-latchable) shared reconnect', () => {
    expect(readFileSync('src/App.jsx', 'utf8')).toMatch(/reconnectFirestore\(\)/);
    expect(readFileSync('src/hooks/useBranchAwareListener.js', 'utf8')).toMatch(/reconnectFirestore\(\)/);
    expect(readFileSync('src/components/TreatmentFormPage.jsx', 'utf8')).toMatch(/reconnectFirestore\(\)/);
  });
});
