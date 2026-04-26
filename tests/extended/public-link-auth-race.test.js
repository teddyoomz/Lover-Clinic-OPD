// ─── Phase 14.x · Public-link anon-auth race condition tests ─────────────
// User-reported bug 2026-04-25: "QR ลิ้งใช้ครั้งแรกไม่ได้ ต้อง refresh
// ถึงจะติด" — public links (?session= / ?patient= / ?schedule=) flashed
// "ลิงก์ไม่ถูกต้อง" before retry. Root cause: pages rendered with user=null
// before signInAnonymously completed → onSnapshot fired unauthenticated →
// firestore.rules `isSignedIn()` rejected the read → empty result →
// status='notfound'/sessionExists=false flashed for ~200-500ms before
// auth retry succeeded. Caching kicked in on refresh (auth state cached
// from prior load) → no flash second try.
//
// Fix surfaces:
//   1. App.jsx — needsPublicAuth gate. Block render of public-link pages
//      until user != null (via signInAnonymously).
//   2. PatientForm.jsx — sessionExists initial = null (not true). Only
//      flip to false after a server-confirmed snapshot. Loading spinner
//      while null. Listener gated on user.
//   3. PatientDashboard.jsx — listener subscription gated on
//      clinicSettingsLoaded (proxy for "Firebase listeners reaching us
//      with auth").
//   4. ClinicSchedule.jsx — local authReady state, listener gated on it.
//      Subscribes only after auth.currentUser becomes non-null.
//
// These tests lock the source-grep contract: future changes can't silently
// reintroduce the race. Per Rule I: source-grep regression guards lock
// the fix pattern.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('Race-condition fix: public-link pages must not flash error pre-auth', () => {

  describe('R1: App.jsx — needsPublicAuth gate', () => {
    const app = READ('src/App.jsx');

    it('R1.1: defines needsPublicAuth covering all 3 public-link types', () => {
      // Must include sessionFromUrl, patientFromUrl, scheduleFromUrl
      const m = app.match(/const\s+needsPublicAuth\s*=\s*([^;]+);/);
      expect(m).toBeTruthy();
      const expr = m[1];
      expect(expr.includes('sessionFromUrl')).toBe(true);
      expect(expr.includes('patientFromUrl')).toBe(true);
      expect(expr.includes('scheduleFromUrl')).toBe(true);
    });

    it('R1.2: signInAnonymously useEffect uses needsPublicAuth (not just sessionFromUrl)', () => {
      // Legacy code only fired anon-auth for ?session= — must now cover all 3.
      // Skip the import line (line 2) and find the actual function call.
      const anonIdx = app.indexOf('signInAnonymously(auth)');
      expect(anonIdx, 'signInAnonymously(auth) call site not found').toBeGreaterThan(-1);
      // Look at ±400 chars around the call site for deps including needsPublicAuth.
      const ctx = app.slice(Math.max(0, anonIdx - 200), anonIdx + 300);
      expect(ctx.includes('needsPublicAuth')).toBe(true);
    });

    it('R1.3: render gate — when needsPublicAuth && !user, returns loading (not page)', () => {
      // Must be a guard BEFORE the route returns. Match the `if (xxxFromUrl)`
      // route guards (not bare token references like the destructuring line).
      const guardIdx = app.indexOf('needsPublicAuth && !user');
      const scheduleRouteIdx = app.indexOf('if (scheduleFromUrl)');
      const patientRouteIdx = app.indexOf('if (patientFromUrl)');
      const sessionRouteIdx = app.indexOf('if (sessionFromUrl)');
      expect(guardIdx).toBeGreaterThan(-1);
      expect(scheduleRouteIdx).toBeGreaterThan(-1);
      expect(patientRouteIdx).toBeGreaterThan(-1);
      expect(sessionRouteIdx).toBeGreaterThan(-1);
      // Guard must come BEFORE all 3 route returns (ordering matters in React)
      expect(guardIdx).toBeLessThan(scheduleRouteIdx);
      expect(guardIdx).toBeLessThan(patientRouteIdx);
      expect(guardIdx).toBeLessThan(sessionRouteIdx);
    });
  });

  describe('R2: PatientForm.jsx — sessionExists null=loading, never flash error pre-auth', () => {
    const pf = READ('src/pages/PatientForm.jsx');

    it('R2.1: sessionExists initial state is null (not true)', () => {
      // useState(null) for sessionExists — required so the guard doesn't
      // assume the doc exists before snapshot fires
      expect(pf).toMatch(/const\s+\[sessionExists,\s*setSessionExists\]\s*=\s*useState\(null\)/);
    });

    it('R2.2: render guard — error page only when sessionExists === false (explicit), not falsy', () => {
      // The check must be `=== false` not just `!sessionExists` — `null` must
      // route to the loading branch, not the error branch
      expect(pf).toMatch(/sessionExists\s*===\s*false/);
    });

    it('R2.3: render guard — sessionExists === null branch shows loading spinner', () => {
      // There must be a render branch for `sessionExists === null` showing
      // a spinner / "กำลังโหลด" — not "Invalid Link"
      expect(pf).toMatch(/sessionExists\s*===\s*null/);
      // Match either spinner CSS class or Thai loading copy
      expect(pf).toMatch(/animate-spin|กำลังโหลด/);
    });

    it('R2.4: onSnapshot listener gated on user (not !sessionId only)', () => {
      // The useEffect must early-return when user is null. Without this,
      // the listener fires unauthenticated.
      const effectMatch = pf.match(/if\s*\(!sessionId\)\s*return;\s*[^]*?if\s*\(!user\)\s*return;/);
      expect(effectMatch, 'PatientForm onSnapshot must gate on `if (!user) return;`').toBeTruthy();
    });

    it('R2.5: snapshot listener sets sessionExists=true on first server-confirmed exists()', () => {
      // After the !exists() branch, a setSessionExists(true) must fire so
      // the loading state resolves to "show the form"
      const ix = pf.indexOf('snapshot.exists()');
      expect(ix).toBeGreaterThan(-1);
      const after = pf.slice(ix, ix + 800);
      expect(after.includes('setSessionExists(true)')).toBe(true);
    });
  });

  describe('R3: PatientDashboard.jsx — gated on clinicSettingsLoaded', () => {
    const pd = READ('src/pages/PatientDashboard.jsx');

    it('R3.1: status initial state is "loading"', () => {
      expect(pd).toMatch(/const\s+\[status,\s*setStatus\]\s*=\s*useState\('loading'\)/);
    });

    it('R3.2: subscription useEffect waits for clinicSettingsLoaded', () => {
      // The effect must early-return if !clinicSettingsLoaded
      const ix = pd.indexOf('patientLinkToken');
      expect(ix).toBeGreaterThan(-1);
      const before = pd.slice(Math.max(0, ix - 600), ix);
      expect(before).toMatch(/if\s*\(!clinicSettingsLoaded\)\s*return/);
    });

    it('R3.3: subscription useEffect deps include clinicSettingsLoaded', () => {
      // Without this in deps, the effect won't re-run when settings load
      const ix = pd.indexOf('patientLinkToken');
      const after = pd.slice(ix, ix + 1000);
      const depsMatch = after.match(/\}\,\s*\[([^\]]+)\]\)/);
      expect(depsMatch, 'expected deps array on PatientDashboard subscription effect').toBeTruthy();
      expect(depsMatch[1].includes('clinicSettingsLoaded')).toBe(true);
    });
  });

  describe('R4: ClinicSchedule.jsx — authReady gate', () => {
    const cs = READ('src/pages/ClinicSchedule.jsx');

    it('R4.1: imports auth from firebase.js', () => {
      expect(cs).toMatch(/from\s+['"]\.\.\/firebase\.js['"]/);
      expect(cs).toMatch(/import\s*\{[^}]*\bauth\b/);
    });

    it('R4.2: tracks authReady state (initial = !!auth.currentUser)', () => {
      expect(cs).toMatch(/const\s+\[authReady,\s*setAuthReady\]\s*=\s*useState/);
      expect(cs).toMatch(/!!auth\.currentUser/);
    });

    it('R4.3: subscribes to onAuthStateChanged', () => {
      expect(cs).toMatch(/auth\.onAuthStateChanged/);
    });

    it('R4.4: subscription useEffect early-returns if !authReady', () => {
      // The listener subscription effect must early-return when authReady is false
      const ix = cs.indexOf('clinic_schedules');
      expect(ix).toBeGreaterThan(-1);
      const before = cs.slice(Math.max(0, ix - 500), ix);
      expect(before).toMatch(/if\s*\(!authReady\)\s*return/);
    });

    it('R4.5: subscription useEffect deps include authReady', () => {
      const ix = cs.indexOf('clinic_schedules');
      const after = cs.slice(ix, ix + 800);
      const depsMatch = after.match(/\}\,\s*\[([^\]]+)\]\)/);
      expect(depsMatch).toBeTruthy();
      expect(depsMatch[1].includes('authReady')).toBe(true);
    });
  });

  describe('R5: cross-cutting invariant — no public-link page sets error state synchronously on mount', () => {
    // This catches future regressions where someone adds a new public-link
    // page that flashes "not found" before auth resolves.
    const PAGES = [
      ['src/pages/PatientForm.jsx',      'PatientForm'],
      ['src/pages/PatientDashboard.jsx', 'PatientDashboard'],
      ['src/pages/ClinicSchedule.jsx',   'ClinicSchedule'],
    ];
    for (const [p, label] of PAGES) {
      it(`R5.${label}: file does NOT have setSessionExists(false) / setStatus('notfound') as a top-level useState initializer`, () => {
        const src = READ(p);
        // Initial state of "not found / invalid" must NEVER be the default.
        // We check: useState('notfound') — would be a regression
        // (loading-first means useState('loading'))
        expect(src.includes("useState('notfound')")).toBe(false);
        // And no useState(false) tied directly to a "valid"-style flag
        // (PatientForm: sessionExists must be null, not true OR false initial)
        if (label === 'PatientForm') {
          expect(src.includes('useState(true)')).toBe(false);
          expect(src.includes('useState(false)')).toBe(true); // legitimate flags like isSubmitting
        }
      });
    }
  });

  describe('R6: render-order invariant — auth gate runs BEFORE route returns in App.jsx', () => {
    const app = READ('src/App.jsx');

    it('R6.1: every public-link route check is preceded by needsPublicAuth gate', () => {
      // Find the position of `needsPublicAuth && !user` guard
      const gateIdx = app.indexOf('needsPublicAuth && !user');
      expect(gateIdx).toBeGreaterThan(-1);
      // Verify all public-link route returns come AFTER this gate. Match
      // the `if (xxxFromUrl)` form (route guard), not bare token refs.
      const routes = ['if (scheduleFromUrl)', 'if (patientFromUrl)', 'if (sessionFromUrl)'];
      for (const r of routes) {
        const idx = app.indexOf(r);
        expect(idx, `${r} route check not found`).toBeGreaterThan(-1);
        expect(idx, `auth gate must precede ${r} route check`).toBeGreaterThan(gateIdx);
      }
    });
  });

  // ─── R7: V23 (2026-04-26) — writer-side anon-update contract ─────────
  // V16 made the page LOAD without flashing "Invalid Link". V23 made the
  // SUBMIT actually work for anon users. R7 locks the writer-side patterns
  // so future refactors can't reintroduce the bug.
  describe('R7: V23 — writer-side anon-update patterns intact', () => {
    const pf = READ('src/pages/PatientForm.jsx');
    const pd = READ('src/pages/PatientDashboard.jsx');

    it('R7.1: PatientForm handleSubmit catch alert exists (Thai/EN error text)', () => {
      // The catch block at PatientForm.jsx:386 shows the user-facing alert
      // Locking this so future refactors don't accidentally swallow the error
      expect(pf).toMatch(/alert\([\s\S]*?(System Error|เกิดข้อผิดพลาดของระบบ)/);
    });

    it('R7.2: handleSubmit calls updateDoc with status + patientData payload', () => {
      // Lock the V23 fix surface — payload must include status + patientData
      // (and nothing else outside the whitelist; full check in
      // tests/firestore-rules-anon-patient-update.test.js A2.1)
      const submitArea = pf.match(/await\s+updateDoc\([\s\S]*?\}\)/);
      expect(submitArea).toBeTruthy();
      expect(submitArea[0]).toMatch(/status:\s*['"]completed['"]/);
      expect(submitArea[0]).toMatch(/patientData:\s*submitData/);
    });

    it('R7.3: PatientDashboard fetchCoursesViaApi awaited updateDoc preserved (line ~410)', () => {
      // Course-refresh metadata write — V23 enables this for anon ?patient= visitor
      const awaited = pd.match(/await\s+updateDoc\(ref,\s*\{[\s\S]*?brokerStatus[\s\S]*?\}\)/);
      expect(awaited, 'PatientDashboard awaited updateDoc not found').toBeTruthy();
      expect(awaited[0]).toMatch(/brokerStatus:\s*['"]done['"]/);
      expect(awaited[0]).toMatch(/latestCourses:/);
    });

    it('R7.4: PatientDashboard fire-and-forget pattern preserved (line ~403)', () => {
      // The fire-and-forget timestamp write must stay non-blocking — V23
      // enables it for anon, but the .catch(()=>{}) safety stays so even
      // future regressions are silent (don't crash the page)
      const fireForget = pd.match(/updateDoc\(ref,\s*\{[\s\S]*?lastCoursesAutoFetch[\s\S]*?\}\)\.catch\(/);
      expect(fireForget, 'PatientDashboard fire-and-forget pattern not found').toBeTruthy();
    });

    it('R7.5: V23 sweep — exact updateDoc count per anon-reachable page', () => {
      // V23 100% sweep finding: EXACTLY 3 anon-reachable Firestore writes,
      // all in opd_sessions. If this count changes, the firestore.rules
      // whitelist + tests/firestore-rules-anon-patient-update.test.js A2.4
      // both need review.
      const cs = READ('src/pages/ClinicSchedule.jsx');
      expect((pf.match(/updateDoc\s*\(/g) || []).length).toBe(1);
      expect((pd.match(/updateDoc\s*\(/g) || []).length).toBe(2);
      expect((cs.match(/updateDoc\s*\(/g) || []).length).toBe(0);
      // Also: no setDoc / addDoc / writeBatch / runTransaction in any of them
      for (const [name, src] of [['PatientForm', pf], ['PatientDashboard', pd], ['ClinicSchedule', cs]]) {
        expect(src.includes('setDoc('), `${name} should not use setDoc`).toBe(false);
        expect(src.includes('addDoc('), `${name} should not use addDoc`).toBe(false);
        expect(src.includes('writeBatch('), `${name} should not use writeBatch`).toBe(false);
        expect(src.includes('runTransaction('), `${name} should not use runTransaction`).toBe(false);
        expect(src.includes('uploadBytes('), `${name} should not upload to Storage`).toBe(false);
      }
    });
  });
});
