// @vitest-environment jsdom
// ─── wedge-escalation-ladder (2026-07-21) — the rung AV214 was missing ──────
//
// FIELD BEACON (iPhone PWA, real prod):
//   13:23:03 wedge → 13:23:09 hard-reload → 13:23:22 WEDGED AGAIN (13s later)
// The AV214 ladder ran correctly and still could not heal: a wedged IndexedDB /
// frozen multi-tab primary lease is ORIGIN STORAGE, so it survives the reload
// and the loop repeats forever ("ตายรัวๆ กดลองใหม่ก็ยังตาย").
//
// WE1 locks the pure decision, WE2 the storage ladder + the machinePerf stamp
// it reuses, WE3 the field sequence end-to-end (prove-red: without the new rung
// the ladder produces NO escape), WE4 the wiring + the bounded spinner.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const mockBeacon = vi.fn();
vi.mock('../src/lib/errorBeacon.js', () => ({
  reportTelemetryToBeacon: (...a) => mockBeacon(...a),
}));

const we = await import('../src/lib/wedgeEscalation.js');
const mp = await import('../src/lib/machinePerf.js');

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

beforeEach(() => {
  mockBeacon.mockReset();
  we._resetWedgeEscalationForTests();
  mp._resetMachinePerfForTests();
});
afterEach(() => {
  we._resetWedgeEscalationForTests();
  mp._resetMachinePerfForTests();
});

const NOW = Date.parse('2026-07-21T13:23:22+07:00');

describe('WE1 — decideWedgeEscalation (pure)', () => {
  it('WE1.1 wedge shortly after a wedge-reload → escalate (the field case)', () => {
    expect(we.decideWedgeEscalation({
      nowMs: NOW, lastReloadAt: NOW - 13_000, lastEscalatedAt: 0, noPersistActive: false,
    })).toBe('escalate');
  });

  it('WE1.2 a wedge with NO recent reload never escalates (first wedge = reload rung only)', () => {
    expect(we.decideWedgeEscalation({ nowMs: NOW, lastReloadAt: 0, noPersistActive: false })).toBe('no-recent-reload');
    expect(we.decideWedgeEscalation({
      nowMs: NOW, lastReloadAt: NOW - 10 * 60 * 1000, noPersistActive: false,   // 10 min ago = healed since
    })).toBe('no-recent-reload');
  });

  it('WE1.3 anti-loop cap — one downgrade per hour', () => {
    expect(we.decideWedgeEscalation({
      nowMs: NOW, lastReloadAt: NOW - 5_000, lastEscalatedAt: NOW - 60_000, noPersistActive: false,
    })).toBe('cooldown');
    expect(we.decideWedgeEscalation({
      nowMs: NOW, lastReloadAt: NOW - 5_000, lastEscalatedAt: NOW - 2 * 3600 * 1000, noPersistActive: false,
    })).toBe('escalate');
  });

  it('WE1.4 already booting memory-cache → nothing left to downgrade (no pointless churn)', () => {
    expect(we.decideWedgeEscalation({
      nowMs: NOW, lastReloadAt: NOW - 5_000, noPersistActive: true,
    })).toBe('already-memory-cache');
  });

  it('WE1.5 window boundary is exact (90s heals-window)', () => {
    expect(we.decideWedgeEscalation({ nowMs: NOW, lastReloadAt: NOW - we.RELOAD_HEAL_WINDOW_MS, noPersistActive: false })).toBe('escalate');
    expect(we.decideWedgeEscalation({ nowMs: NOW, lastReloadAt: NOW - we.RELOAD_HEAL_WINDOW_MS - 1, noPersistActive: false })).toBe('no-recent-reload');
  });
});

// fetch stubs for the reachability probe (the gate that separates
// "client state is wedged" from "the network to Firestore is blocked")
const reachable = async () => ({ ok: false, status: 403 });      // ANY HTTP answer = round trip proven
const unreachable = async () => { throw new TypeError('Failed to fetch'); };
const hangs = () => new Promise(() => {});                        // never settles → probe timeout

describe('WE2 — escalateWedgeIfReloadFailed (ladder → probe → stamp)', () => {
  it('WE2.1 escalation stamps lover.noPersist so the NEXT boot is memory-cache', async () => {
    expect(mp.isNoPersistActive()).toBe(false);
    we.noteWedgeReload(NOW - 13_000);
    expect(await we.escalateWedgeIfReloadFailed(NOW, reachable)).toBe('escalate');
    expect(mp.isNoPersistActive(NOW)).toBe(true);           // ← the actual escape: firebase.js boots memory-cache
    expect(mockBeacon).toHaveBeenCalledWith(expect.stringContaining('escalate=no-persist'));
  });

  it('WE2.2 no reload stamp → no escalation, no stamp, no telemetry, NO probe', async () => {
    const probe = vi.fn(reachable);
    expect(await we.escalateWedgeIfReloadFailed(NOW, probe)).toBe('no-recent-reload');
    expect(mp.isNoPersistActive(NOW)).toBe(false);
    expect(probe).not.toHaveBeenCalled();                  // ladder short-circuits before any network call
    expect(mockBeacon).not.toHaveBeenCalled();
  });

  it('WE2.3 repeated wedges inside the cooldown escalate exactly ONCE (no downgrade storm)', async () => {
    we.noteWedgeReload(NOW - 10_000);
    expect(await we.escalateWedgeIfReloadFailed(NOW, reachable)).toBe('escalate');
    mp._resetMachinePerfForTests();                          // simulate the user undoing it in the health card
    we.noteWedgeReload(NOW + 5_000);
    expect(await we.escalateWedgeIfReloadFailed(NOW + 6_000, reachable)).toBe('cooldown');
    expect(mp.isNoPersistActive(NOW + 6_000)).toBe(false);
    expect(mockBeacon).toHaveBeenCalledTimes(1);
  });

  it('WE2.4 wedge stamps carry the WEDGE reason + a 24h TTL — never the slow-machine label', async () => {
    we.noteWedgeReload(NOW - 5_000);
    await we.escalateWedgeIfReloadFailed(NOW, reachable);
    const st = mp.getMachinePerfState(NOW);
    expect(st.noPersist).toBe(true);
    expect(st.reason).toBe('conn-wedge');                                   // ← NOT 'idb-slow'
    expect(mp.isNoPersistActive(NOW + 23 * 3600 * 1000)).toBe(true);        // still on at 23h
    expect(mp.isNoPersistActive(NOW + 25 * 3600 * 1000)).toBe(false);       // persistence back within a day
    mp.setNoPersist(false, NOW);                                            // health-card "เปิดแคชกลับ"
    expect(mp.isNoPersistActive(NOW)).toBe(false);
  });

  it('WE2.5 blocked storage never throws (private mode / iOS lockdown)', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => we.noteWedgeReload(NOW)).not.toThrow();
    await expect(we.escalateWedgeIfReloadFailed(NOW, reachable)).resolves.toBeTruthy();
    spy.mockRestore();
  });
});

describe('WE2b — reachability probe (the fast-device guard)', () => {
  it('WE2b.1 ANY HTTP response proves the round trip (403/404 included)', async () => {
    expect(await we.probeFirestoreReachable(reachable)).toBe('reachable');
    expect(await we.probeFirestoreReachable(async () => ({ ok: true, status: 200 }))).toBe('reachable');
  });

  it('WE2b.2 network error / hang → unreachable (hang honors the timeout)', async () => {
    expect(await we.probeFirestoreReachable(unreachable)).toBe('unreachable');
    expect(await we.probeFirestoreReachable(hangs, 30)).toBe('unreachable');
  });

  it('WE2b.3 blocked backend → NO downgrade (a fast phone on bad WiFi keeps its cache)', async () => {
    we.noteWedgeReload(NOW - 10_000);
    expect(await we.escalateWedgeIfReloadFailed(NOW, unreachable)).toBe('backend-unreachable');
    expect(mp.isNoPersistActive(NOW)).toBe(false);                          // cache preserved — dropping it would be WORSE
    expect(mockBeacon).toHaveBeenCalledWith(expect.stringContaining('firestore-unreachable'));
  });

  it('WE2b.4 a blocked-backend verdict does NOT burn the hourly cooldown', async () => {
    we.noteWedgeReload(NOW - 10_000);
    expect(await we.escalateWedgeIfReloadFailed(NOW, unreachable)).toBe('backend-unreachable');
    // network recovers on the next wedge → the real escalation is still available
    expect(await we.escalateWedgeIfReloadFailed(NOW + 1_000, reachable)).toBe('escalate');
  });
});

describe('WE2c — machinePerf reason/TTL (backward compatible)', () => {
  it('WE2c.1 legacy bare-timestamp stamps decode as slow-machine + 14d TTL', () => {
    localStorage.setItem('lover.noPersist', String(NOW));
    expect(mp.isNoPersistActive(NOW)).toBe(true);
    expect(mp.getMachinePerfState(NOW).reason).toBe('idb-slow');
    expect(mp.isNoPersistActive(NOW + 13 * 24 * 3600 * 1000)).toBe(true);
    expect(mp.isNoPersistActive(NOW + 15 * 24 * 3600 * 1000)).toBe(false);
  });

  it('WE2c.2 the AV212 slow-machine ratchet still stamps its own reason + 14d TTL', () => {
    mp.recordCacheProbe(2000, { persistOn: true, nowMs: NOW });
    mp.recordCacheProbe(2000, { persistOn: true, nowMs: NOW + 1000 });
    const st = mp.getMachinePerfState(NOW + 2000);
    expect(st.noPersist).toBe(true);
    expect(st.reason).toBe('idb-slow');
    expect(mp.isNoPersistActive(NOW + 13 * 24 * 3600 * 1000)).toBe(true);   // NOT shortened by the wedge TTL
  });

  it('WE2c.3 corrupt stamp → treated as absent (never wedges the boot path itself)', () => {
    localStorage.setItem('lover.noPersist', '{not json');
    expect(mp.isNoPersistActive(NOW)).toBe(false);
    expect(mp.getMachinePerfState(NOW).reason).toBe(null);
  });
});

describe('WE3 — the field sequence, end to end (PROVE-RED without the rung)', () => {
  it('WE3.1 wedge → reload → wedge-again now produces the memory-cache escape', async () => {
    // 13:23:03 — first wedge. Ladder rung 1: no reload has happened yet.
    expect(await we.escalateWedgeIfReloadFailed(NOW - 19_000, reachable)).toBe('no-recent-reload');
    expect(mp.isNoPersistActive(NOW)).toBe(false);

    // 13:23:09 — user presses ลองใหม่ → hardReloadApp stamps + reloads.
    we.noteWedgeReload(NOW - 13_000);

    // 13:23:22 — wedged AGAIN 13s later (the reload did NOT heal).
    // PRE-FIX: nothing happened here → next press reloaded into the same wedge
    // → the infinite "ตายรัวๆ" loop. POST-FIX: the boot config changes.
    expect(await we.escalateWedgeIfReloadFailed(NOW, reachable)).toBe('escalate');
    expect(mp.isNoPersistActive(NOW)).toBe(true);
    // …and the device is NOT labelled slow for it (iPhone 17 Pro Max case)
    expect(mp.getMachinePerfState(NOW).reason).toBe('conn-wedge');
  });

  it('WE3.2 ≤2 presses honored — after the escalation the next boot has no IDB/lease to wedge on', async () => {
    we.noteWedgeReload(NOW - 13_000);
    await we.escalateWedgeIfReloadFailed(NOW, reachable);
    // firebase.js: canPersist = idbHealthy() && !isNoPersistActive() → memory cache
    expect(mp.isNoPersistActive(NOW)).toBe(true);
    // and a wedge on THAT boot no longer churns the ladder
    we.noteWedgeReload(NOW + 1000);
    expect(await we.escalateWedgeIfReloadFailed(NOW + 2000, reachable)).toBe('already-memory-cache');
  });
});

describe('WE4 — wiring locks', () => {
  const fr = read('src/lib/firestoreReconnect.js');
  const hub = read('src/components/admin/AppointmentHubView.jsx');
  const fb = read('src/firebase.js');

  it('WE4.1 hardReloadApp stamps the reload BEFORE reloading', () => {
    const i = fr.indexOf('noteWedgeReload()');
    const j = fr.indexOf('window.location.reload()');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it('WE4.2 the timebox branch escalates (detached) + re-enables the network', () => {
    expect(fr).toMatch(/escalateWedgeIfReloadFailed\(\)\.catch\(\(\) => \{\}\)/); // never extends the timebox
    expect(fr).toMatch(/enableNetwork\(db\)\.catch\(\(\) => \{\}\)/);
    const box = fr.slice(fr.indexOf('TIMEBOX_SENTINEL)) {'), fr.indexOf('} else {'));
    expect(box).toContain('escalateWedgeIfReloadFailed');
    expect(box).toContain('enableNetwork');
  });

  it('WE4.6 the health card wording follows the REASON (never calls a fast device slow)', () => {
    const card = read('src/components/backend/InfraHealthSection.jsx');
    expect(card).toMatch(/machinePerf\.reason === 'conn-wedge'/);
    expect(card).toMatch(/ไม่เกี่ยวกับความเร็วเครื่อง/);
    // the slow-machine wording must remain reachable ONLY on the slow branch
    const idx = card.indexOf('โหมดเครื่องช้า (ดึงข้อมูลสด');
    expect(idx).toBeGreaterThan(card.indexOf("machinePerf.reason === 'conn-wedge'"));
  });

  it('WE4.3 firebase.js honors the stamp at boot (the escape actually applies)', () => {
    expect(fb).toMatch(/isNoPersistActive\(\)/);
    expect(fb).toMatch(/canPersist = idbHealthy\(\) && !slowMachineNoPersist/);
  });

  it('WE4.4 hub spinner is bounded — setLoading(false) can no longer depend on a hung leg', () => {
    expect(hub).toMatch(/const LOAD_STALL_MS = 10000/);
    expect(hub).toMatch(/setTimeout\(\(\) => \{[\s\S]*?setLoading\(false\);[\s\S]*?setSyncing\(true\);[\s\S]*?\}, LOAD_STALL_MS\)/);
    expect(hub).toMatch(/clearTimeout\(stall\)/);
  });

  it('WE4.5 the stall timer only releases the spinner — applyCore stays the sole data writer', () => {
    const block = hub.slice(hub.indexOf('let settled = false;'), hub.indexOf('}, [wideRange.from'));
    expect(block).not.toMatch(/setAppts\(/);        // no data mutation in the bound path
    expect(block).not.toMatch(/setScheduleEntries\(/);
    expect(block).toMatch(/await swrRun\(/);        // legs still run + still apply when they settle
  });
});
