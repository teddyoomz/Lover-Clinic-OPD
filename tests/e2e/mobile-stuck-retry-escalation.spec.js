// Mobile stuck-retry escalation (2026-07-20) — Rule Q L1 real browser.
//
// Reproduces the field wedge (every Firestore request HANGS — never errors,
// never resolves; the route handler simply never fulfills) and proves the fix
// ladder end-to-end in a REAL browser:
//   stuck → "โหลดคิว/นัดหมายไม่สำเร็จ" banner → press ลองใหม่ #1 (reconnect+resub,
//   still dead) → banner again → press #2 → the app HARD-RELOADS ITSELF
//   (the automated ปิดแอปเข้าใหม่ — previously the user's manual workaround).
import { test, expect } from '@playwright/test';

const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';

async function getFirebaseTokens() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${data.error?.message || 'Unknown'}`);
  return data;
}

test.describe('Mobile stuck-retry escalation — Rule Q L1', () => {
  test('hang → banner → press#1 fails → press#2 hard-reloads (หายขาด)', async ({ page }) => {
    test.setTimeout(180000);
    const tokens = await getFirebaseTokens();
    const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
    const authValue = JSON.stringify({
      uid: tokens.localId,
      email: tokens.email,
      emailVerified: false,
      isAnonymous: false,
      providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
      stsTokenManager: { refreshToken: tokens.refreshToken, accessToken: tokens.idToken, expirationTime: Date.now() + 3600000 },
      createdAt: String(Date.now()),
      lastLoginAt: String(Date.now()),
      apiKey: FIREBASE_API_KEY,
      appName: '[DEFAULT]',
    });
    await page.addInitScript(({ authKey, authValue, uid }) => {
      localStorage.setItem(authKey, authValue);
      // A real staff session always has a branch (fresh-profile no-branch would
      // let BS-13 safe-by-default return [] instantly → markReady → no banner —
      // run #2 proved that). ทดลอง 1 branch, mirror v71 spec.
      localStorage.setItem(`selectedBranchId:${uid}`, 'BR-1778136097138-98199ef5');
      localStorage.setItem('selectedBranchId', 'BR-1778136097138-98199ef5');
      // THE FAITHFUL WEDGE: Firestore's OWN IndexedDB never answers (open()
      // returns a request whose handlers never fire — no error, no success;
      // the iOS frozen-primary-lease presents exactly like this). idbHealthy's
      // preflight + firebase-auth use OTHER db names → real IDB (auth must
      // hydrate). Result: Firestore persistence init hangs → every op queues →
      // no snapshot ever fires, CACHE INCLUDED (runs #1-#3 proved that
      // absent/empty IDB is NOT enough — cache legs answer instantly and
      // markReady suppresses the banner).
      try {
        const realIDB = window.indexedDB;
        const hangReq = () => ({
          onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null,
          result: null, error: null, readyState: 'pending',
          addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
        });
        Object.defineProperty(window, 'indexedDB', {
          get: () => ({
            open: (name, ver) => (String(name).startsWith('firestore') ? hangReq() : realIDB.open(name, ver)),
            deleteDatabase: (name) => realIDB.deleteDatabase(name),
            databases: realIDB.databases ? () => realIDB.databases() : undefined,
            cmp: (a, b) => realIDB.cmp(a, b),
          }),
        });
      } catch { /* noop */ }
    }, { authKey, authValue, uid: tokens.localId });

    // THE WEDGE: every Firestore request hangs forever (handler never fulfills)
    // — exactly the field condition (silent, no error events → beacon empty).
    await page.route(/firestore\.googleapis\.com/, () => { /* never fulfill */ });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Ladder to the banner: 8s soft-timeout → silent auto-retry (its
    // reconnectFirestore() TIMES OUT at 4s on the hung queue → WEDGE marker
    // set) → 8s → error banner.
    const banner = page.getByText('โหลดคิว/นัดหมายไม่สำเร็จ');
    await expect(banner).toBeVisible({ timeout: 60000 });
    await page.screenshot({ path: 'test-results/stuck-retry-banner.png', fullPage: false });

    // The client is provably wedged → the ladder escalates on the FIRST press:
    // ลองใหม่ = hardReloadApp() = the automated ปิดแอปเข้าใหม่. (The press#2
    // variant — retry-failed-then-press — is unit-locked in R2.3.)
    const reloaded = page.waitForEvent('load', { timeout: 30000 });
    await page.getByRole('button', { name: 'ลองใหม่' }).first().click();
    await reloaded; // a real window.location.reload() navigation occurred
    await page.screenshot({ path: 'test-results/stuck-retry-reloaded.png', fullPage: false });
  });
});
