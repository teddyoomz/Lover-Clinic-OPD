// Tasks 4,5,6,8,9,10,11 — source-grep contract lock for the mobile-load
// reliability wiring (2026-06-16). Behavior is proven by the unit + RTL +
// flow-sim tests; this file locks that the wiring stays in place (V21-style
// regression guard for the 8 surfaces).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// vitest runs from the project root → process.cwd() === F:\LoverClinic-app
// (new URL(import.meta.url) mis-resolves on Windows in this harness).
const read = (p) => readFileSync(path.join(process.cwd(), 'src', p), 'utf8');

describe('firebase.js — connection layer (Task 4)', () => {
  const src = read('firebase.js');
  it('imports initializeFirestore (not bare getFirestore)', () => {
    expect(src).toMatch(/import\s*\{[^}]*initializeFirestore[^}]*\}\s*from\s*'firebase\/firestore'/);
  });
  it('enables experimentalAutoDetectLongPolling', () => {
    // A1 repoint (2026-07-07 instant cold-start): the init object grew a
    // localCache key — lock the FLAG, not the literal single-key object shape.
    expect(src).toMatch(/initializeFirestore\(app,\s*\{\s*experimentalAutoDetectLongPolling:\s*true/);
  });
  it('no longer calls bare getFirestore(app)', () => {
    expect(src).not.toMatch(/getFirestore\(app\)/);
  });
  it('A1 (2026-07-07): persistent cache ON for staff SWR; customers stay fresh via freshGate', () => {
    // CONTRACT FLIP — user decision 2026-07-07 (spec Q1=A) REVERSED the
    // 2026-06-16 fresh-always for STAFF surfaces. Fresh-always is preserved for
    // customer pages by src/lib/freshGate.js (see instant-coldstart-fresh-gate
    // tests). This test used to assert NO persistence; it now locks persistence
    // present + IDB feature-detect fallback (node/private-mode = memory =
    // pre-A1 behavior).
    // AV208 repoint (2026-07-18): the call gained cacheSizeBytes — lock the
    // INVARIANT (tabManager inside persistentLocalCache), not the full literal.
    expect(src).toMatch(/persistentLocalCache\(\{\s*tabManager:\s*persistentMultipleTabManager\(\)/);
    // AV212 repoint (2026-07-20, degradation-matrix M7): the bare typeof check
    // became the idbHealthy() pre-flight PROBE (same feature-detect invariant +
    // catches a sync-THROWING IndexedDB that tripped Firestore internal
    // assertion b815 and crashed the whole app). node/private → false → memory.
    expect(src).toMatch(/typeof indexedDB === 'undefined'\) return false/);
    // AV212 rule-8 repoint (2026-07-20): + the slow-machine no-persist ratchet
    expect(src).toMatch(/const canPersist = idbHealthy\(\) && !slowMachineNoPersist;/);
  });
});

describe('App.jsx — resilient anon-auth gate (Task 5) + shared reconnect (Task 1)', () => {
  const src = read('App.jsx');
  it('imports the shared reconnectFirestore + LoadErrorRetry', () => {
    expect(src).toMatch(/import\s*\{\s*reconnectFirestore\s*\}\s*from\s*'\.\/lib\/firestoreReconnect\.js'/);
    expect(src).toMatch(/import\s+LoadErrorRetry\s+from\s+'\.\/components\/LoadErrorRetry\.jsx'/);
  });
  it('V17 visibility/online handlers call reconnectFirestore (not an inline toggle)', () => {
    expect(src).toMatch(/visibilityState === 'visible'\) reconnectFirestore\(\)/);
    expect(src).toMatch(/onOnline = \(\) => reconnectFirestore\(\)/);
  });
  it('tracks authAttempt + authStuck and exposes retryAuth', () => {
    expect(src).toMatch(/authAttempt/);
    expect(src).toMatch(/authStuck/);
    expect(src).toMatch(/const retryAuth =/);
  });
  it('the public-auth gate renders LoadErrorRetry when authStuck', () => {
    expect(src).toMatch(/if \(authStuck\)[\s\S]{0,120}LoadErrorRetry[\s\S]{0,80}onRetry=\{retryAuth\}/);
  });
});

describe('Customer link pages — resilient load wiring (Tasks 6,7,8)', () => {
  for (const f of ['pages/PatientForm.jsx', 'pages/ClinicSchedule.jsx', 'pages/PatientDashboard.jsx']) {
    describe(f, () => {
      const src = read(f);
      it('imports useResilientLoad + LoadErrorRetry', () => {
        expect(src).toMatch(/useResilientLoad/);
        expect(src).toMatch(/LoadErrorRetry/);
      });
      it('calls markReady() on a successful load', () => {
        expect(src).toMatch(/markReady\(\)/);
      });
      it('threads retryKey into a load effect dependency array', () => {
        expect(src).toMatch(/retryKey\s*\]/);
      });
      it('renders LoadErrorRetry on loadStatus === "error"', () => {
        expect(src).toMatch(/loadStatus === 'error'/);
      });
    });
  }
});

describe('AdminDashboard.jsx — resilient queue (Task 9)', () => {
  const src = read('pages/AdminDashboard.jsx');
  it('imports useResilientLoad + LoadErrorRetry', () => {
    expect(src).toMatch(/useResilientLoad/);
    expect(src).toMatch(/LoadErrorRetry/);
  });
  it('marks the opd_sessions snapshot ready + funnels errors', () => {
    expect(src).toMatch(/queueReady\(\)/);
    expect(src).toMatch(/queueErr\(\)/);
  });
  it('threads queueRetryKey into the listener deps', () => {
    expect(src).toMatch(/queueRetryKey\s*\]/);
  });
  it('renders the non-blocking error banner (fullScreen=false)', () => {
    expect(src).toMatch(/queueLoad === 'error'[\s\S]{0,160}fullScreen=\{false\}/);
  });
});

describe('useBranchAwareListener.js — silent auto-heal (Task 10)', () => {
  const src = read('hooks/useBranchAwareListener.js');
  it('imports reconnectFirestore', () => {
    expect(src).toMatch(/import\s*\{\s*reconnectFirestore\s*\}\s*from\s*'\.\.\/lib\/firestoreReconnect\.js'/);
  });
  it('has a SOFT_TIMEOUT + MAX_AUTO_RETRIES + retryNonce re-subscribe', () => {
    expect(src).toMatch(/SOFT_TIMEOUT_MS/);
    expect(src).toMatch(/MAX_AUTO_RETRIES/);
    expect(src).toMatch(/retryNonce/);
  });
  it('resets attempts on subscription-identity change (not on retry)', () => {
    expect(src).toMatch(/attemptsRef\.current = 0;[\s\S]{0,60}\[listenerFn, effectiveBranchId, argsKey\]/);
  });
});

describe('BackendDashboard.jsx — Suspense chunk-load retry (Task 11)', () => {
  const src = read('pages/BackendDashboard.jsx');
  it('defines BackendTabFallback using LoadErrorRetry + a reload', () => {
    expect(src).toMatch(/function BackendTabFallback/);
    expect(src).toMatch(/window\.location\.reload\(\)/);
  });
  it('uses BackendTabFallback as the tab Suspense fallback', () => {
    expect(src).toMatch(/<Suspense fallback=\{<BackendTabFallback \/>\}>/);
  });
});
