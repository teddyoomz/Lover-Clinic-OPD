// ─── Machine-degradation hardening (2026-07-20) — Tier 2 regression bank ────
//
// Locks the fixes from the degradation-matrix campaign (tests/e2e/
// machine-degradation-matrix.spec.js — 14 cells vs the LIVE bundle):
//   M7  IDB open() throws sync → Firestore INTERNAL ASSERTION b815 → app dead
//       → firebase.js pre-flight probe + self-heal flag
//   M10 offline lazy-chunk fetch → React.lazy reject → AppErrorBoundary ate
//       the whole app → lazyRetry chokepoint (79 sites / 4 hosts via alias)
//   M12 slow-machine entries are LEGIT (35s at CPU×20, still succeed) →
//       staged escape card (15s calm info / 30s retry button — RT bank) +
//       parallel swrRun legs (slow IDB no longer delays the server truth) +
//       kind:'telemetry' beacons (slow/degraded machines become VISIBLE in the
//       health card without tripping the error alert)
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { swrRun } from '../src/lib/swrRead.js';
import { sanitizeErrorPayload, validateClientErrorBody } from '../src/lib/clientErrorCore.js';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const FIREBASE = read('src/firebase.js');
const SWEEP = read('api/cron/infra-health-sweep.js');
const LAZY = read('src/lib/lazyRetry.jsx');
const STICKER = read('src/lib/stickerLibrary.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('A — swrRun PARALLEL legs (slow disk must not delay the server truth)', () => {
  it('A1 slow cache + fast server → server applies immediately; late cache settle is a NO-OP', async () => {
    const applies = [];
    await swrRun({
      cacheLoad: async () => { await sleep(150); return { hasData: true, data: 'CACHE' }; },
      serverLoad: async () => 'SERVER',
      apply: (d, meta) => applies.push([d, !!meta.fromCache]),
    });
    await sleep(250); // let the late cache leg settle
    expect(applies).toEqual([['SERVER', false]]); // exactly one apply — never stale-over-fresh
  });

  it('A2 fast cache + slow server → cache paints first, server corrects (order preserved)', async () => {
    const applies = [];
    const r = await swrRun({
      cacheLoad: async () => ({ hasData: true, data: 'CACHE' }),
      serverLoad: async () => { await sleep(100); return 'SERVER'; },
      apply: (d, meta) => applies.push([d, !!meta.fromCache]),
    });
    expect(applies).toEqual([['CACHE', true], ['SERVER', false]]);
    expect(r.paintedFromCache).toBe(true);
  });

  it('A3 HUNG cache leg (never settles) → server still applies + swrRun resolves (M12/slow-eMMC survival)', async () => {
    const applies = [];
    const r = await swrRun({
      cacheLoad: () => new Promise(() => {}), // hangs forever
      serverLoad: async () => 'SERVER',
      apply: (d, meta) => applies.push([d, !!meta.fromCache]),
    });
    expect(applies).toEqual([['SERVER', false]]);
    expect(r.paintedFromCache).toBe(false);
  });

  it('A4 empty cache never paints (AV206 no-empty-flash preserved)', async () => {
    const applies = [];
    await swrRun({
      cacheLoad: async () => ({ hasData: false, data: [] }),
      serverLoad: async () => 'SERVER',
      apply: (d) => applies.push(d),
    });
    expect(applies).toEqual(['SERVER']);
  });

  it('A5 server-leg error still PROPAGATES (Rule Q-honest — never swallowed)', async () => {
    await expect(swrRun({
      cacheLoad: async () => ({ hasData: false, data: null }),
      serverLoad: async () => { throw new Error('SERVER_DOWN'); },
      apply: () => {},
    })).rejects.toThrow('SERVER_DOWN');
  });

  it('A6 throwing cache leg is silent (cold cache) — server decides', async () => {
    const applies = [];
    await swrRun({
      cacheLoad: async () => { throw new Error('IDB busted'); },
      serverLoad: async () => 'SERVER',
      apply: (d) => applies.push(d),
    });
    expect(applies).toEqual(['SERVER']);
  });

  it('A7 hunt-R1: a HUNG cache leg that settles AFTER the server ERRORS does NOT paint (no terminal stale over the caller error reset)', async () => {
    // swrRun findings #1+#2: server rejects fast (rules/auth/index), consumer
    // catch resets; the hung cache must NOT resurrect stale data as terminal.
    const applies = [];
    let releaseCache;
    const cacheGate = new Promise((r) => { releaseCache = r; });
    const p = swrRun({
      cacheLoad: async () => { await cacheGate; return { hasData: true, data: 'STALE_CACHE' }; },
      serverLoad: async () => { throw new Error('permission-denied'); },
      apply: (d) => applies.push(d),
    });
    await expect(p).rejects.toThrow('permission-denied'); // caller's error path owns terminal state
    releaseCache();                                        // late cache settle — must be a no-op
    await new Promise((r) => setTimeout(r, 30));
    expect(applies).toEqual([]);                           // NEVER painted stale after the server settled
  });
});

describe('B — firebase.js IDB pre-flight probe (M7: sync-throwing IDB crashed the app)', () => {
  it('B1 probe exists: try/catch around indexedDB.open + broken-flag self-heal', () => {
    expect(FIREBASE).toMatch(/function idbHealthy\(\)/);
    expect(FIREBASE).toMatch(/indexedDB\.open\('lover-idb-preflight'\)/);
    expect(FIREBASE).toMatch(/IDB_BROKEN_FLAG = 'lover\.idbBroken'/);
    // async open failure stamps the flag → NEXT load boots memory-cache
    expect(FIREBASE).toMatch(/req\.onerror = \(\) => \{\s*try \{ localStorage\.setItem\(IDB_BROKEN_FLAG, '1'\); \} catch \{\}/);
    // healthy open clears the flag (recovered machine re-enables persistence)
    expect(FIREBASE).toMatch(/localStorage\.removeItem\(IDB_BROKEN_FLAG\)/);
  });

  it('B2 canPersist derives from the PROBE, not a bare typeof check', () => {
    expect(FIREBASE).toMatch(/const canPersist = idbHealthy\(\);/);
    expect(FIREBASE).not.toMatch(/const canPersist = typeof indexedDB !== 'undefined';/);
  });

  it('B3 persistence state is exported for the env beacon', () => {
    expect(FIREBASE).toMatch(/export const firestorePersistenceEnabled = canPersist;/);
  });

  it('B4 hunt-R1: NOT a one-way ratchet — the flag must NOT early-return before the probe (else onsuccess never clears it)', () => {
    // The old bug: `if (localStorage.getItem(IDB_BROKEN_FLAG) === '1') return false;`
    // ran BEFORE indexedDB.open → the clearing onsuccess never fired → permanent
    // memory-cache after one transient error. The probe must ALWAYS run.
    expect(FIREBASE).not.toMatch(/getItem\(IDB_BROKEN_FLAG\) === '1'\) return false/);
    // the flag now only decides THIS boot's return value; the probe still runs
    expect(FIREBASE).toMatch(/let flagged = false;/);
    expect(FIREBASE).toMatch(/return !flagged;/);
    // structural: the open() call precedes the flagged-based return
    const openIdx = FIREBASE.indexOf("indexedDB.open('lover-idb-preflight')");
    const retIdx = FIREBASE.indexOf('return !flagged;');
    expect(openIdx).toBeGreaterThan(-1);
    expect(retIdx).toBeGreaterThan(openIdx);
  });
});

describe('C — lazyRetry chokepoint (M10: offline chunk fetch crashed the whole app)', () => {
  it('C1 wrapper: retries then resolves the FALLBACK component (never rejects into the boundary)', () => {
    expect(LAZY).toMatch(/for \(let attempt = 0; attempt <= RETRIES/);
    expect(LAZY).toMatch(/return \{ default: \(\) => React\.createElement\(ChunkLoadFallback/);
    expect(LAZY).toMatch(/reportErrorToBeacon\(lastErr, \{ source: 'lazy-chunk' \}\)/);
    expect(LAZY).toMatch(/data-testid="chunk-load-retry"/);
  });

  it('C1b hunt-R1: fallback is a FIXED overlay (recovery never off-viewport) + DISMISSABLE + type-aware copy', () => {
    // in-flow 40vh panel landed below the fold under fixed-overlay hosts (TFP,
    // walk-in appt modal, StaffChatWidget) → recovery button off-screen.
    expect(LAZY).toMatch(/position: 'fixed', inset: 0/);
    expect(LAZY).toMatch(/data-testid="chunk-load-dismiss"/);
    // network vs module-evaluation error → different copy (don't blame WiFi for a bad deploy)
    expect(LAZY).toMatch(/function isNetworkChunkError/);
    expect(LAZY).toMatch(/networkCause[\s\S]{0,20}\? 'การเชื่อมต่ออินเทอร์เน็ต/);
    expect(LAZY).toMatch(/const networkCause = isNetworkChunkError\(lastErr\)/);
  });

  it('C2 every lazy host aliases lazyRetry as lazy (79 callsites untouched)', () => {
    for (const f of ['src/App.jsx', 'src/pages/AdminDashboard.jsx', 'src/pages/BackendDashboard.jsx', 'src/pages/FillerSimulator.jsx']) {
      const src = read(f);
      expect(src, `${f} must alias lazyRetry`).toMatch(/import \{ lazyRetry as lazy \} from '.*lib\/lazyRetry\.jsx'/);
      expect(src, `${f} must NOT pull lazy from react anymore`).not.toMatch(/import \{[^}]*\blazy\b[^}]*\} from 'react'/);
    }
  });

  it('C3 UNIVERSAL CLASSIFIER: any src file lazy-importing a chunk MUST route through lazyRetry', () => {
    // Rule P classifier — a future file using raw React.lazy for a chunk
    // reintroduces the M10 crash class and must fail here.
    const { execSync } = require('node:child_process');
    let out = '';
    try {
      out = execSync('git grep -l "lazy(() => import" -- src/', { cwd: process.cwd() }).toString();
    } catch { out = ''; }
    const files = out.split('\n').map(s => s.trim()).filter(Boolean);
    expect(files.length).toBeGreaterThan(0); // sanity: the class exists
    for (const f of files) {
      const src = read(f);
      expect(src, `${f} uses lazy(() => import(...)) but does not alias lazyRetry — M10 crash class`)
        .toMatch(/lazyRetry as lazy/);
    }
  });
});

describe('D — degradation telemetry (kind:telemetry — visible but never trips the error alert)', () => {
  it('D1 sanitizeErrorPayload: kind allowlist (telemetry kept, junk demoted, default error)', () => {
    expect(sanitizeErrorPayload({ message: 'x', kind: 'telemetry' }).kind).toBe('telemetry');
    expect(sanitizeErrorPayload({ message: 'x', kind: 'hax' }).kind).toBe('error');
    expect(sanitizeErrorPayload({ message: 'x' }).kind).toBe('error');
  });

  it('D2 validateClientErrorBody: server never trusts the client kind', () => {
    expect(validateClientErrorBody({ message: 'm', kind: 'telemetry' }).doc.kind).toBe('telemetry');
    expect(validateClientErrorBody({ message: 'm', kind: 'admin' }).doc.kind).toBe('error');
    expect(validateClientErrorBody({ message: 'm' }).doc.kind).toBe('error');
  });

  it('D3 slownessBucket boundaries are stable (stable text → dedupe works)', async () => {
    vi.doMock('../src/firebase.js', () => ({ firestorePersistenceEnabled: true }));
    const { slownessBucket } = await import('../src/lib/envTelemetry.js');
    expect(slownessBucket(12000)).toBe('10-15s');
    expect(slownessBucket(15000)).toBe('15-30s');
    expect(slownessBucket(30000)).toBe('30-60s');
    expect(slownessBucket(61000)).toBe('60s+');
    vi.doUnmock('../src/firebase.js');
  });

  it('D4 infra-health errorCount EXCLUDES telemetry rows + fetch is bounded (AV141)', () => {
    expect(SWEEP).toMatch(/\.filter\(d => \(d\.data\(\)\.kind \|\| 'error'\) !== 'telemetry'\)/);
    expect(SWEEP).toMatch(/CLIENT_ERROR_RETENTION_FETCH_LIMIT = 1200/);
    expect(SWEEP).not.toMatch(/\.count\(\)\.get\(\)/); // aggregate can't kind-filter safely
  });

  it('D5 TFP reports slow entries (>10s, bucketed) + main.jsx reports degraded env once', () => {
    const tfp = read('src/components/TreatmentFormPage.jsx');
    expect(tfp).toMatch(/reportTfpSlowEntry\(\{ ms: entryMs, timedOut: sawTimeout \}\)/);
    expect(tfp).toMatch(/if \(entryMs > 10000\)/);
    const main = read('src/main.jsx');
    expect(main).toMatch(/reportDegradedEnvOnce\(\)/);
  });
});

describe('F — TFP fast-paint pre-stage (≤5s-เมื่อเน็ตโอเค directive, 2026-07-20)', () => {
  const TFP = read('src/components/TreatmentFormPage.jsx');

  it('F1 fast-paint exists, CREATE-mode only, and clears loading (the paint moment)', () => {
    expect(TFP).toMatch(/AV212 FAST-PAINT/);
    const i = TFP.indexOf('AV212 FAST-PAINT');
    const w = TFP.slice(i, i + 9500);
    expect(w).toMatch(/if \(!isEdit\) \{/);            // edit mode keeps full blocking (hydration deps)
    expect(w).toMatch(/setLoading\(false\);\s*\/\/.*PAINT/);
    expect(w).toMatch(/setTfpSyncing\(true\)/);         // chip ON — enrichment pending (honesty)
  });

  it('F2 minimal-over-full is IMPOSSIBLE: fullApplied guard checked before AND after CPU-bound work', () => {
    expect(TFP).toMatch(/let fullApplied = false;/);
    expect(TFP).toMatch(/fullApplied = true;\s*\/\/ AV212: fast-paint may no longer touch state/);
    const i = TFP.indexOf('AV212 FAST-PAINT');
    const w = TFP.slice(i, i + 9500);
    const guards = w.match(/if \(stale\(\) \|\| fullApplied\) return;/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  it('F3 MISS gates mirrored: no doctors OR (customerId && no custData) → no fast paint', () => {
    const i = TFP.indexOf('AV212 FAST-PAINT');
    const w = TFP.slice(i, i + 9500);
    expect(w).toMatch(/if \(!fpDoctors\.length\) return;/);
    expect(w).toMatch(/if \(customerId && !fpCust\) return;/);
  });

  it('F4 prefill runs at fast-paint under the SAME once-only contract (no late clobber of typing)', () => {
    const i = TFP.indexOf('AV212 FAST-PAINT');
    const w = TFP.slice(i, i + 9500);
    expect(w).toMatch(/if \(patientData && !prefilled\) \{/);
    expect(w).toMatch(/prefilled = true;/);
  });

  it('F5 the full pipeline is UNCHANGED (save-gate still awaits run + applyChain — money never reads the minimal subset)', () => {
    expect(TFP).toMatch(/serverFreshRef\.current = run\.then\(\(\) => applyChain\)\.catch\(\(\) => \{\}\);/);
    expect(TFP).toMatch(/await run;/);
    expect(TFP).toMatch(/await applyChain;/);
  });

  it('F7 hunt-R1 money-action gate: optionsEnriched blocks save+buy during the fast-paint window', () => {
    // The fast-paint window makes the form interactive with a MINIMAL options
    // subset (no V43 skip overlay, no dfGroups). A save/buy there would
    // serialize money/stock from the minimal subset (Finding-1) or get wiped by
    // the enrichment setOptions (Finding-2). optionsEnriched is set TRUE only by
    // the full applyFormData; the money buttons + handleSubmit + openBuyModal gate on it.
    expect(TFP).toMatch(/const \[optionsEnriched, setOptionsEnriched\] = useState\(false\)/);
    // reset per run + set true ONLY in the full apply (never in fast-paint)
    expect(TFP).toMatch(/setOptionsEnriched\(false\);\s*\/\/ AV212 hunt R1/);
    const enrichIdx = TFP.indexOf('setOptions(backendOptions)');
    expect(TFP.slice(enrichIdx, enrichIdx + 400)).toMatch(/setOptionsEnriched\(true\)/);
    // fast-paint block must NOT set it true (grep the fast-paint region)
    const fpStart = TFP.indexOf('AV212 FAST-PAINT');
    const fpEnd = TFP.indexOf('(async () => {', fpStart);
    expect(TFP.slice(fpStart, fpEnd)).not.toMatch(/setOptionsEnriched\(true\)/);
    // handleSubmit guard (create-mode) + openBuyModal guard
    expect(TFP).toMatch(/if \(!isEdit && !optionsEnriched\) \{\s*setError\('กำลังโหลดข้อมูลคอร์ส/);
    expect(TFP).toMatch(/if \(!isEdit && !optionsEnriched\) \{\s*setError\('กำลังโหลดรายการคอร์ส/);
    // both save buttons disabled on the gate + buy triggers hidden
    const disables = TFP.match(/disabled=\{saving \|\| \(!isEdit && !optionsEnriched\)\}/g) || [];
    expect(disables.length).toBeGreaterThanOrEqual(2);
    expect(TFP).toMatch(/canAddNewItems && \(isEdit \|\| optionsEnriched\) &&/);
  });

  it('F6 fast-paint fetches ONLY the small reads (never products/courses/df — those are enrichment)', () => {
    const i = TFP.indexOf('AV212 FAST-PAINT');
    const w = TFP.slice(i, TFP.indexOf('(async () => {', i + 100) > -1 ? TFP.indexOf('V50 (2026-05-08)', i) : i + 6000);
    expect(w).not.toMatch(/listProducts|listCourses|listDfGroups|listDfStaffRates/);
    expect(w).toMatch(/products: \[\],\s*\/\/ enrichment fills/);
  });
});

describe('E — unguarded-IDB class classifier (Rule P)', () => {
  it('E1 every indexedDB.open in src/ lives in a sanctioned, guarded file', () => {
    const { execSync } = require('node:child_process');
    let out = '';
    try {
      out = execSync('git grep -l "indexedDB.open" -- src/', { cwd: process.cwd() }).toString();
    } catch { out = ''; }
    const files = out.split('\n').map(s => s.trim()).filter(Boolean);
    const SANCTIONED = new Set(['src/firebase.js', 'src/lib/stickerLibrary.js']);
    for (const f of files) {
      expect(SANCTIONED.has(f.replace(/\\/g, '/')), `${f} opens IndexedDB outside the sanctioned guarded set — M7 crash class`).toBe(true);
    }
    // sticker guard shape: absent IDB rejects cleanly (picker shows empty)
    expect(STICKER).toMatch(/typeof indexedDB === 'undefined'/);
  });
});
