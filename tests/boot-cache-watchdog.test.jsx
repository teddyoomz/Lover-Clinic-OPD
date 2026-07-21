// @vitest-environment jsdom
// ─── boot-cache-watchdog (2026-07-21) — "ครั้งแรกก็ไม่เจอ" ──────────────────
//
// The recovery ladder heals a wedge in ≤2 presses, but the user still SAW the
// failure. This watchdog removes the sighting: one cache-only read raced
// against 3s at boot. A cache read touches no network, so a hang can only be
// the local persistence layer → switch to memory cache + reload ONCE while the
// app is still on its loading screen.
//
// The dangerous half of this feature is the AUTO-RELOAD, so most of this bank
// is about when it must NOT fire (BW2/BW3): a healthy device, a device with an
// empty cache, an already-memory-cache device, and a device that already
// auto-reloaded recently must all be left alone.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const mockBeacon = vi.fn();
vi.mock('../src/lib/errorBeacon.js', () => ({
  reportTelemetryToBeacon: (...a) => mockBeacon(...a),
}));
const bw = await import('../src/lib/bootCacheWatchdog.js');
const mp = await import('../src/lib/machinePerf.js');

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const NOW = Date.parse('2026-07-21T13:23:00+07:00');
const hangs = () => new Promise(() => {});

beforeEach(() => { mockBeacon.mockReset(); bw._resetBootWatchdogForTests(); mp._resetMachinePerfForTests(); });
afterEach(() => { bw._resetBootWatchdogForTests(); mp._resetMachinePerfForTests(); });

describe('BW1 — wedged local layer → pre-emptive memory-cache reload', () => {
  it('BW1.1 a cache read that never settles flips to memory cache + reloads ONCE', async () => {
    const reload = vi.fn();
    const r = await bw.runBootCacheWatchdog({ cacheRead: hangs, enabled: true, reload, nowMs: NOW, timeoutMs: 20 });
    expect(r).toBe('wedged-reloading');
    expect(reload).toHaveBeenCalledTimes(1);
    const st = mp.getMachinePerfState(NOW);
    expect(st.noPersist).toBe(true);
    expect(st.reason).toBe('conn-wedge');            // NOT the slow-machine label
    expect(mockBeacon).toHaveBeenCalledWith(expect.stringContaining('boot-probe timeout'));
  });

  it('BW1.2 the flip is what makes the NEXT boot immune (memory cache = no IDB, no lease)', async () => {
    await bw.runBootCacheWatchdog({ cacheRead: hangs, enabled: true, reload: () => {}, nowMs: NOW, timeoutMs: 20 });
    // firebase.js: canPersist = idbHealthy() && !isNoPersistActive()
    expect(mp.isNoPersistActive(NOW)).toBe(true);
    // …and on that boot the watchdog disarms itself (enabled=false)
    const r2 = await bw.runBootCacheWatchdog({ cacheRead: hangs, enabled: false, reload: () => {}, nowMs: NOW + 1000, timeoutMs: 20 });
    expect(r2).toBe('skipped-no-persistence');
  });

  it('BW1.3 24h TTL — the device gets its offline cache back the next day', async () => {
    await bw.runBootCacheWatchdog({ cacheRead: hangs, enabled: true, reload: () => {}, nowMs: NOW, timeoutMs: 20 });
    expect(mp.isNoPersistActive(NOW + 23 * 3600 * 1000)).toBe(true);
    expect(mp.isNoPersistActive(NOW + 25 * 3600 * 1000)).toBe(false);
  });
});

describe('BW2 — it must NOT fire on healthy devices (false-positive guards)', () => {
  it('BW2.1 a found doc = healthy → no stamp, no reload, no telemetry', async () => {
    const reload = vi.fn();
    const r = await bw.runBootCacheWatchdog({ cacheRead: async () => ({ exists: () => true }), enabled: true, reload, nowMs: NOW });
    expect(r).toBe('healthy');
    expect(reload).not.toHaveBeenCalled();
    expect(mp.isNoPersistActive(NOW)).toBe(false);
    expect(mockBeacon).not.toHaveBeenCalled();
  });

  it('BW2.2 an EMPTY cache rejects instantly — that is healthy, not wedged (brand-new device)', async () => {
    const reload = vi.fn();
    const r = await bw.runBootCacheWatchdog({
      cacheRead: async () => { throw new Error('Failed to get document from cache.'); },
      enabled: true, reload, nowMs: NOW,
    });
    expect(r).toBe('healthy');
    expect(reload).not.toHaveBeenCalled();
    expect(mp.isNoPersistActive(NOW)).toBe(false);
  });

  it('BW2.3 a synchronous throw from the read is still healthy (never punish a working app)', async () => {
    const reload = vi.fn();
    const r = await bw.runBootCacheWatchdog({
      cacheRead: () => { throw new Error('boom'); }, enabled: true, reload, nowMs: NOW,
    });
    expect(r).toBe('healthy');
    expect(reload).not.toHaveBeenCalled();
  });

  it('BW2.4 persistence already off → the watchdog never runs at all', async () => {
    const cacheRead = vi.fn(hangs);
    const reload = vi.fn();
    const r = await bw.runBootCacheWatchdog({ cacheRead, enabled: false, reload, nowMs: NOW, timeoutMs: 20 });
    expect(r).toBe('skipped-no-persistence');
    expect(cacheRead).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('BW3 — anti-loop: an auto-reload can never spin', () => {
  it('BW3.1 canAutoReload honors the 10-minute cooldown', () => {
    expect(bw.canAutoReload(NOW, 0)).toBe(true);
    expect(bw.canAutoReload(NOW, NOW - 60_000)).toBe(false);
    expect(bw.canAutoReload(NOW, NOW - 11 * 60_000)).toBe(true);
  });

  it('BW3.2 a STILL-wedged boot right after an auto-reload does NOT reload again', async () => {
    const reload = vi.fn();
    await bw.runBootCacheWatchdog({ cacheRead: hangs, enabled: true, reload, nowMs: NOW, timeoutMs: 20 });
    expect(reload).toHaveBeenCalledTimes(1);
    mp._resetMachinePerfForTests();                    // pretend the flip did not take
    const r = await bw.runBootCacheWatchdog({ cacheRead: hangs, enabled: true, reload, nowMs: NOW + 5_000, timeoutMs: 20 });
    expect(r).toBe('wedged-cooldown');
    expect(reload).toHaveBeenCalledTimes(1);            // ← still ONE: the visible ladder owns it now
    expect(mockBeacon).toHaveBeenCalledWith(expect.stringContaining('cooldown'));
  });

  it('BW3.3 after the cooldown a fresh wedge may auto-heal again', async () => {
    const reload = vi.fn();
    await bw.runBootCacheWatchdog({ cacheRead: hangs, enabled: true, reload, nowMs: NOW, timeoutMs: 20 });
    mp._resetMachinePerfForTests();
    const r = await bw.runBootCacheWatchdog({ cacheRead: hangs, enabled: true, reload, nowMs: NOW + 11 * 60_000, timeoutMs: 20 });
    expect(r).toBe('wedged-reloading');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('BW3.4 blocked storage never throws (private mode)', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    await expect(bw.runBootCacheWatchdog({ cacheRead: hangs, enabled: true, reload: () => {}, nowMs: NOW, timeoutMs: 20 }))
      .resolves.toBeTruthy();
    spy.mockRestore();
  });
});

describe('BW4 — wiring', () => {
  const app = read('src/App.jsx');

  it('BW4.1 App.jsx runs the watchdog at boot with a CACHE-ONLY read', () => {
    expect(app).toMatch(/runBootCacheWatchdog\(\{/);
    expect(app).toMatch(/enabled: firestorePersistenceEnabled/);
    // SEGMENT form, byte-identical to the clinic-settings listener in the same
    // file. A path typo would reject instantly, count as "healthy" and make the
    // watchdog a silent no-op — so the probe path is locked to the proven one.
    expect(app).toMatch(/getDocFromCache\(doc\(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'main'\)\)/);
    const listener = app.match(/onSnapshot\(doc\(db, ('artifacts'[^)]*)\)/);
    const probe = app.match(/getDocFromCache\(doc\(db, ('artifacts'[^)]*)\)/);
    expect(listener?.[1]).toBe(probe?.[1]);   // same doc as the proven-working read
  });

  it('BW4.2 it is a mount-once effect (never re-armed mid-session)', () => {
    const i = app.indexOf('runBootCacheWatchdog({');
    const after = app.slice(i, i + 800);
    expect(after).toMatch(/\}, \[\]\);/);
  });

  it('BW4.3 the probe is cache-only — the watchdog must never depend on the network', () => {
    expect(read('src/lib/bootCacheWatchdog.js')).not.toMatch(/getDocs\(|fetch\(/);
  });

  it('BW4.4 the boot call exposes its verdict (proof it RAN — a no-op would be invisible)', async () => {
    expect(read('src/lib/bootCacheWatchdog.js')).toMatch(/export function getLastBootWatchdogVerdict/);
    bw._resetBootWatchdogForTests();
    expect(bw.getLastBootWatchdogVerdict()).toBe('not-run');
    await bw.runBootCacheWatchdog({ cacheRead: async () => ({}), enabled: true, reload: () => {}, nowMs: NOW });
    expect(bw.getLastBootWatchdogVerdict()).toBe('healthy');
  });
});
