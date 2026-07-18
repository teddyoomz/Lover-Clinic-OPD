// TFP resilient-timeout (2026-07-19) — AV208 backlog item closed.
//
// BUG CLASS (mobile-load half-dead family, 2026-06-16): a cold-MISS TFP open
// whose server pass HANGS (request neither resolves nor errors — half-dead
// socket) left "กำลังโหลดฟอร์มการรักษา..." spinning FOREVER with no escape.
// autoDetectLongPolling covers the global transport layer; TFP itself had no
// soft-timeout escape (the one staff surface without one).
//
// FIX: 15s render-guarded escape on the loading screen → ลองใหม่ button →
// shared reconnectFirestore (debounced disableNetwork→enableNetwork) →
// loadRetryNonce re-runs the load effect. Deliberately NO silent mid-flight
// auto-reconnect: toggling the network resolves pending one-shot server
// getDocs from (possibly empty) cache → an empty-options paint is WORSE than
// the escape (AV206.c-adjacent: no decision-input from degraded cache).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const TFP = readFileSync(path.resolve(process.cwd(), 'src/components/TreatmentFormPage.jsx'), 'utf8');

describe('RT — TFP resilient-timeout contract', () => {
  it('RT.1 escape state exists + timer armed at 15s inside the load effect', () => {
    expect(TFP).toMatch(/const \[loadTimedOut, setLoadTimedOut\] = useState\(false\)/);
    expect(TFP).toMatch(/const \[loadRetryNonce, setLoadRetryNonce\] = useState\(0\)/);
    // Hunt R1-#1 repoint: the timer guard is stale() (cancelled + run-seq)
    expect(TFP).toMatch(/const timeoutTimer = setTimeout\(\(\) => \{ if \(!stale\(\)\) setLoadTimedOut\(true\); \}, 15000\)/);
  });

  it('RT.2 timer cleared on settle (finally) AND on effect cleanup (no orphaned-timer, mobile-load R3 lesson)', () => {
    expect(TFP).toMatch(/clearTimeout\(timeoutTimer\);\s*\/\/ TFP resilient-timeout — load settled/);
    expect(TFP).toMatch(/return \(\) => \{ cancelled = true; clearTimeout\(timeoutTimer\); \};/);
  });

  it('RT.3 loadRetryNonce is in the load-effect deps (retry re-runs the WHOLE load)', () => {
    expect(TFP).toMatch(/\}, \[customerId, treatmentId, isEdit, SELECTED_BRANCH_ID, loadRetryNonce\]\);/);
  });

  it('RT.4 escape UI: render-guarded inside the loading screen + reconnect THEN nonce bump', () => {
    const i = TFP.indexOf('data-testid="tfp-load-timeout-escape"');
    expect(i).toBeGreaterThan(-1);
    const w = TFP.slice(i - 600, i + 1600);
    expect(w).toMatch(/loadTimedOut && \(/);
    expect(w).toMatch(/reconnectFirestore\(\)/);
    expect(w).toMatch(/setLoadRetryNonce\(n => n \+ 1\)/);
    expect(w).toMatch(/ลองใหม่/);
    // escape text uses amber, never red (Thai-UI rule: no red near names)
    expect(w).toMatch(/text-amber-500/);
  });

  it('RT.5 NO silent mid-flight auto-reconnect (a network toggle would resolve pending server getDocs from empty cache)', () => {
    // reconnectFirestore appears ONLY in the escape button handler, never
    // inside the load effect body / a timer callback.
    const hits = TFP.match(/reconnectFirestore/g) || [];
    expect(hits.length).toBeLessThanOrEqual(3); // comment + dynamic import line + call
    const timerBody = TFP.match(/const timeoutTimer = setTimeout\([^;]*;/)[0];
    expect(timerBody).not.toMatch(/reconnect/i);
  });

  it('RT.6 Hunt R1-#1: the retry INVALIDATES the hung run BEFORE the network toggle (seq ref) + stale() guards every settle path', () => {
    // Ordering in the button handler: loadRunSeqRef.current++ BEFORE the
    // firestoreReconnect import chain (the hung run's pending server getDocs
    // settle from cache during disableNetwork — un-invalidated they painted
    // empty options, set a sticky error, and cleared loading = no-escape).
    const btn = TFP.slice(TFP.indexOf('data-testid="tfp-load-timeout-escape"'), TFP.indexOf('data-testid="tfp-load-timeout-escape"') + 1600);
    const seqIdx = btn.indexOf('loadRunSeqRef.current++');
    const reconnectIdx = btn.indexOf("import('../lib/firestoreReconnect.js')");
    expect(seqIdx).toBeGreaterThan(-1);
    expect(reconnectIdx).toBeGreaterThan(seqIdx);
    // retry clears the sticky error
    expect(btn).toMatch(/setError\(''\)/);
    // the effect derives stale() from cancelled + the seq and guards the
    // paint/catch/finally/timer paths with it
    expect(TFP).toMatch(/const stale = \(\) => cancelled \|\| loadRunSeqRef\.current !== myRunSeq;/);
    expect(TFP).toMatch(/if \(stale\(\) \|\| !bundle\) return;/);
    expect(TFP).toMatch(/if \(!stale\(\)\) \{ setError\(e\.message\); setTfpSyncing\(false\); \}/);
    expect(TFP).toMatch(/if \(!stale\(\)\) setLoading\(false\);/);
    expect(TFP).toMatch(/if \(!stale\(\)\) setLoadTimedOut\(true\)/);
  });
});
