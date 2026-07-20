// ─── Machine-perf ratchet (AV212 rule 8, 2026-07-20) — unit bank ────────────
//
// The 10-year-laptop class: adaptive persistence driven by a MEASURED cache
// probe (TFP fast-paint times its pure-IDB read attempts). Flip rule: ≥2 of
// the last 3 probes > 1500ms while persistence is ON → lover.noPersist stamp →
// next boot = memory cache (matrix: M6 no-IDB 1.2s vs M12 warm-IDB ×20 14-35s).
// 14-day TTL retries persistence; manual override via the health card.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/errorBeacon.js', () => ({
  reportTelemetryToBeacon: vi.fn(),
}));

import {
  isNoPersistActive, setNoPersist, recordCacheProbe, getMachinePerfState,
  _resetMachinePerfForTests, NO_PERSIST_KEY, PROBE_HIST_KEY,
  NO_PERSIST_TTL_MS, PROBE_SLOW_MS,
} from '../src/lib/machinePerf.js';
import { reportTelemetryToBeacon } from '../src/lib/errorBeacon.js';

beforeEach(() => {
  _resetMachinePerfForTests();
  vi.clearAllMocks();
});

describe('R1 — flag lifecycle', () => {
  it('R1.1 inactive by default', () => {
    expect(isNoPersistActive()).toBe(false);
  });

  it('R1.2 manual set → active; manual clear → inactive + probe history cleared', () => {
    setNoPersist(true);
    expect(isNoPersistActive()).toBe(true);
    localStorage.setItem(PROBE_HIST_KEY, JSON.stringify([{ t: 1, ms: 9999 }]));
    setNoPersist(false);
    expect(isNoPersistActive()).toBe(false);
    // history cleared so stale slow samples can't instantly re-flip
    expect(localStorage.getItem(PROBE_HIST_KEY)).toBe(null);
  });

  it('R1.3 TTL expiry (14d) — stamp expires + is removed → persistence retried', () => {
    const t0 = 1_800_000_000_000;
    setNoPersist(true, t0);
    expect(isNoPersistActive(t0 + NO_PERSIST_TTL_MS - 1000)).toBe(true);
    expect(isNoPersistActive(t0 + NO_PERSIST_TTL_MS + 1000)).toBe(false);
    expect(localStorage.getItem(NO_PERSIST_KEY)).toBe(null); // self-cleared
  });
});

describe('R2 — recordCacheProbe flip rule', () => {
  it('R2.1 two slow probes of three → flipped + stamp set + telemetry fired', () => {
    expect(recordCacheProbe(PROBE_SLOW_MS + 500, { persistOn: true })).toBe('recorded');
    expect(recordCacheProbe(PROBE_SLOW_MS + 500, { persistOn: true })).toBe('flipped');
    expect(isNoPersistActive()).toBe(true);
    expect(reportTelemetryToBeacon).toHaveBeenCalledTimes(1);
    expect(String(reportTelemetryToBeacon.mock.calls[0][0])).toMatch(/auto-nopersist/);
  });

  it('R2.2 one slow among fast probes → no flip', () => {
    expect(recordCacheProbe(100, { persistOn: true })).toBe('recorded');
    expect(recordCacheProbe(PROBE_SLOW_MS + 500, { persistOn: true })).toBe('recorded');
    expect(recordCacheProbe(120, { persistOn: true })).toBe('recorded');
    expect(isNoPersistActive()).toBe(false);
  });

  it('R2.3 memory-cache session (persistOn=false) never records — the probe would measure NETWORK, not IDB', () => {
    expect(recordCacheProbe(9999, { persistOn: false })).toBe('skipped');
    expect(getMachinePerfState().probeHist.length).toBe(0);
  });

  it('R2.4 already-flipped machine → skipped (no double work, no beacon spam)', () => {
    setNoPersist(true);
    expect(recordCacheProbe(9999, { persistOn: true })).toBe('skipped');
    expect(reportTelemetryToBeacon).not.toHaveBeenCalled();
  });

  it('R2.5 history capped at 3 (old samples age out — a machine that recovered is not haunted)', () => {
    recordCacheProbe(9000, { persistOn: true });   // slow
    recordCacheProbe(100, { persistOn: true });
    recordCacheProbe(110, { persistOn: true });
    recordCacheProbe(120, { persistOn: true });    // pushes the slow one out
    expect(getMachinePerfState().probeHist.length).toBe(3);
    expect(getMachinePerfState().probeHist.every(h => h.ms < PROBE_SLOW_MS)).toBe(true);
    expect(isNoPersistActive()).toBe(false);
  });

  it('R2.6 invalid ms → skipped; corrupt history JSON → self-heals', () => {
    expect(recordCacheProbe(NaN, { persistOn: true })).toBe('skipped');
    expect(recordCacheProbe(-5, { persistOn: true })).toBe('skipped');
    localStorage.setItem(PROBE_HIST_KEY, '{corrupt');
    expect(recordCacheProbe(100, { persistOn: true })).toBe('recorded');
    expect(getMachinePerfState().probeHist.length).toBe(1);
  });
});

describe('R3 — wiring locks (source-grep)', () => {
  const { readFileSync } = require('node:fs');
  const read = (p) => readFileSync(p, 'utf8');

  it('R3.1 firebase.js boots memory-cache while the stamp is active + exports the mode', () => {
    const fb = read('src/firebase.js');
    expect(fb).toMatch(/import \{ isNoPersistActive \} from '\.\/lib\/machinePerf\.js'/);
    expect(fb).toMatch(/const canPersist = idbHealthy\(\) && !slowMachineNoPersist;/);
    expect(fb).toMatch(/export const firestoreNoPersistMode = slowMachineNoPersist;/);
  });

  it('R3.2 TFP fast-paint times ONLY the cache attempts + feeds the ratchet fire-and-forget', () => {
    const tfp = read('src/components/TreatmentFormPage.jsx');
    expect(tfp).toMatch(/timedCacheAttempt/);
    expect(tfp).toMatch(/maxCacheAttemptMs = Math\.max\(maxCacheAttemptMs, Date\.now\(\) - t0\)/);
    expect(tfp).toMatch(/m\.recordCacheProbe\(maxCacheAttemptMs, \{ persistOn: firestorePersistenceEnabled \}\)/);
    // the server-fallback reads are NOT inside the timed wrapper
    const i = tfp.indexOf('const readListFast');
    const w = tfp.slice(i, i + 400);
    expect(w).toMatch(/return fn\(baseOpts\)\.catch\(\(\) => \[\]\);/);
  });

  it('R3.3 CustomerDetailView warms the TFP chunk on idle (parse off the click path)', () => {
    const cdv = read('src/components/backend/CustomerDetailView.jsx');
    expect(cdv).toMatch(/setTimeout\(\(\) => \{ import\('\.\.\/TreatmentFormPage\.jsx'\)\.catch\(\(\) => \{\}\); \}, 2500\)/);
  });

  it('R3.4 health card exposes the per-machine toggle + local-cache wipe', () => {
    const ui = read('src/components/backend/InfraHealthSection.jsx');
    expect(ui).toMatch(/data-testid="infra-slow-machine-toggle"/);
    expect(ui).toMatch(/data-testid="infra-wipe-local-cache"/);
    expect(ui).toMatch(/clearIndexedDbPersistence/);
    expect(ui).toMatch(/terminate\(db\)/);
  });

  it('R3.5 env telemetry distinguishes the deliberate slow-machine mode from a broken IDB', () => {
    const et = read('src/lib/envTelemetry.js');
    expect(et).toMatch(/firestoreNoPersistMode\) reason = 'slow-machine-nopersist'/);
  });
});
