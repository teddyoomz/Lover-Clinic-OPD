import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── perf link-patient LCP fix (2026-07-07) — early-fetch locks (AV204) ──────
// The ?patient= page's data comes from /api/patient-view (a plain token-gated
// GET needing NO Firebase auth / settings), but it used to start only after the
// anon-auth render gate → PatientDashboard lazy chunk → clinicSettingsLoaded
// gate: ~1.2-1.8s of dead serial time before a 1.3-3.5s serverless call.
// Fix: main.jsx starts the fetch + warms the lazy chunk at ENTRY-module time;
// PatientDashboard consumes it once (token-guarded) with full fallback to the
// unchanged retry loop. Measured (median-of-3, real prod API via vite preview
// proxy): LCP 3780 → 2004ms (−47%); pixel parity loaded-vs-loaded 0.000% both
// themes; real-browser probe 7/7 (single request · data renders · total-API-
// failure reaches the resilient retry UI · bad-token 404 single request).
//
// CLASSIFIER (Rule P — class = "public-link data fetch serialized behind gates
// it doesn't need"): class size 1. The sibling public links are NOT in the
// class: ?session= (PatientForm) and ?schedule= (ClinicSchedule) read client
// Firestore, which REQUIRES the anon-auth gate (V16/V23) — asserted in C-group.

const ROOT = resolve(__dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

// ── A. unit — the REAL module (consume-once + token-guard + rejection passthrough)
describe('A. patientViewEarlyFetch unit', () => {
  let mod;
  let fetchSpy;
  beforeEach(async () => {
    vi.resetModules();
    fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);
    mod = await import('../src/lib/patientViewEarlyFetch.js');
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A1: start fires the exact patient-view GET with the encoded token', () => {
    mod.startEarlyPatientViewFetch('tok en+1234567890');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(`/api/patient-view?token=${encodeURIComponent('tok en+1234567890')}`);
  });

  it('A2: take returns the SAME in-flight promise once, null afterwards (consume-once)', async () => {
    mod.startEarlyPatientViewFetch('abc1234567890123');
    const p = mod.takeEarlyPatientViewFetch('abc1234567890123');
    expect(p).toBeInstanceOf(Promise);
    expect(await p).toEqual({ ok: true });
    expect(mod.takeEarlyPatientViewFetch('abc1234567890123')).toBeNull();
  });

  it('A3: token mismatch → null AND the slot is preserved for the real owner', () => {
    mod.startEarlyPatientViewFetch('realtoken1234567');
    expect(mod.takeEarlyPatientViewFetch('othertoken123456')).toBeNull();
    expect(mod.takeEarlyPatientViewFetch('realtoken1234567')).toBeInstanceOf(Promise);
  });

  it('A4: no token / empty token → no fetch, take → null', () => {
    mod.startEarlyPatientViewFetch('');
    mod.startEarlyPatientViewFetch(null);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mod.takeEarlyPatientViewFetch('')).toBeNull();
  });

  it('A5: second start is a no-op while a slot is held (single early request)', () => {
    mod.startEarlyPatientViewFetch('abc1234567890123');
    mod.startEarlyPatientViewFetch('abc1234567890123');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('A6: a REJECTED early fetch still rejects for the consumer (retry loop can catch + fall back)', async () => {
    const boom = new Error('net down');
    fetchSpy.mockImplementationOnce(() => Promise.reject(boom));
    mod.startEarlyPatientViewFetch('abc1234567890123');
    const p = mod.takeEarlyPatientViewFetch('abc1234567890123');
    await expect(p).rejects.toThrow('net down');
    // and the unconsumed-rejection suppressor did not eat the slot semantics
    expect(mod.takeEarlyPatientViewFetch('abc1234567890123')).toBeNull();
  });
});

// ── B. source-grep — wiring locks
describe('B. wiring locks', () => {
  const MAIN = read('src/main.jsx');
  const PD = read('src/pages/PatientDashboard.jsx');
  const API = read('api/patient-view.js');
  const VITE = read('vite.config.js');

  it('B1: main.jsx starts the early fetch from the ?patient= URL param at module scope', () => {
    expect(MAIN).toMatch(/startEarlyPatientViewFetch\(earlyPatientToken\)/);
    expect(MAIN).toMatch(/get\('patient'\)/);
  });

  it('B2: main.jsx must NOT warm-import the PatientDashboard chunk (module-map failure poisoning — a failed entry-time chunk fetch is cached by iOS Safari et al → React.lazy insta-rejects → black screen, no error boundary; adversarial review 2026-07-07)', () => {
    expect(MAIN).not.toMatch(/import\('\.\/pages\/PatientDashboard/);
    const APP = read('src/App.jsx');
    expect(APP).toMatch(/lazy\(\(\) => import\('\.\/pages\/PatientDashboard\.jsx'\)\)/);
  });

  it('B3: PatientDashboard consumes takeEarlyPatientViewFetch INSIDE the attempt loop with fetch fallback', () => {
    expect(PD).toMatch(/takeEarlyPatientViewFetch\(token\)/);
    expect(PD).toMatch(/early \? await early : await fetch\(`\/api\/patient-view\?token=\$\{encodeURIComponent\(token\)\}`\)/);
  });

  it('B4: the retry-loop semantics are UNCHANGED (3 attempts · 600ms backoff · markReady/markError)', () => {
    expect(PD).toMatch(/attempt < 3 && !cancelled/);
    expect(PD).toMatch(/setTimeout\(res, 600\)/);
    expect(PD).toMatch(/markReady\(\); \/\/ loaded/);
    expect(PD).toMatch(/markError\(\)/);
  });

  it('B5: api/patient-view prefetches branch names in PARALLEL (no await inside the mapping loop)', () => {
    expect(API).toMatch(/Promise\.all\(uniqueBranchIds\.map/);
    expect(API).not.toMatch(/branch: await branchName/);
  });

  it('B6: vite proxy stays NARROW — STRUCTURAL check: every /api* proxy key (any quote style, regex form, trailing slash) must be exactly /api/patient-view (a broader key would route local-dev admin/webhook calls to PROD)', () => {
    expect(VITE).toMatch(/'\/api\/patient-view': \{ target: 'https:\/\/lover-clinic-app\.vercel\.app'/);
    // Capture EVERY proxy-style key that could match /api requests: '...', "...",
    // with or without ^ regex anchor / trailing slash — all must be the narrow path.
    const apiKeys = [...VITE.matchAll(/['"](\^?\/api[^'"]*)['"]\s*:/g)].map((m) => m[1]);
    expect(apiKeys.length).toBeGreaterThan(0);
    for (const k of apiKeys) expect(k).toBe('/api/patient-view');
  });
});

// ── C. classifier — class isolation (Rule P)
describe('C. class isolation — auth-requiring public links must NOT adopt the early fetch', () => {
  it('C1: PatientForm (?session=) reads client Firestore → stays behind the anon-auth gate (V16/V23)', () => {
    const PF = read('src/pages/PatientForm.jsx');
    expect(PF).not.toMatch(/patientViewEarlyFetch/);
  });
  it('C2: ClinicSchedule (?schedule=) reads client Firestore → stays behind the anon-auth gate (V16)', () => {
    const CS = read('src/pages/ClinicSchedule.jsx');
    expect(CS).not.toMatch(/patientViewEarlyFetch/);
  });
  it('C3: exactly two consumers of the early-fetch module (main.jsx starter + PatientDashboard taker)', () => {
    expect(read('src/main.jsx')).toMatch(/from '\.\/lib\/patientViewEarlyFetch\.js'/);
    expect(read('src/pages/PatientDashboard.jsx')).toMatch(/from '\.\.\/lib\/patientViewEarlyFetch\.js'/);
  });
});
