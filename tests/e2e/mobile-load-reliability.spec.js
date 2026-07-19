// Rule Q L1 — mobile-load reliability, REAL mobile browser (iPhone 13 viewport)
// against the LOCAL dev server (which serves the local, not-yet-deployed code).
//
// Proves the user-reported symptoms can no longer get permanently stuck:
//   • (a) black-screen-forever  → blocked anon-auth now shows a "ลองใหม่" card
//   • (b/c) stuck spinner / empty skeleton → a blocked Firestore snapshot now
//          auto-retries then shows the "ลองใหม่" card (never a permanent spinner)
//   • a normal load resolves (no false error card)
//   • clicking ลองใหม่ after the network returns recovers
//
// These exercise the surfaces that don't need /api (vite dev doesn't serve
// serverless fns): the App.jsx anon-auth gate + the PatientForm onSnapshot
// listener. PatientDashboard (/api/patient-view) is covered by the L2
// cold-start + the vitest source/flow tests; its UI escape is identical wiring.
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 13'] });

const SESSION = '/?session=E2E-MOBILE-NONEXISTENT'; // id is irrelevant for the block tests (never read)
const RETRY_CARD = '[data-testid="load-error-retry"]';

test.describe('mobile-load reliability (real mobile browser)', () => {
  test('A. blocked anon-auth → "ลองใหม่" card (no black-screen-forever), then recovers', async ({ page, context }) => {
    test.setTimeout(60000);
    // Block Firebase Auth (anon sign-in) — pure HTTP REST, deterministic.
    await context.route('**/identitytoolkit.googleapis.com/**', (r) => r.abort());
    await context.route('**/securetoken.googleapis.com/**', (r) => r.abort());

    await page.goto(SESSION);
    // App.jsx gate retries anon-auth (8s x2) then flips authStuck → LoadErrorRetry.
    await expect(page.locator(RETRY_CARD)).toBeVisible({ timeout: 40000 });

    // Recover: unblock auth, tap ลองใหม่ → anon-auth succeeds → gate clears.
    await context.unroute('**/identitytoolkit.googleapis.com/**');
    await context.unroute('**/securetoken.googleapis.com/**');
    await page.locator('[data-testid="load-error-retry-btn"]').click();
    await expect(page.locator(RETRY_CARD)).toBeHidden({ timeout: 30000 });
  });

  test('B. half-dead Firestore (hanging snapshot) → auto-recovers WITHOUT a refresh (no permanent spinner)', async ({ page, context }) => {
    test.setTimeout(60000);
    // Simulate the REAL "stuck" bug: a half-dead connection where the Firestore
    // Listen channel HANGS (request sent, no response, no error) — the SDK waits
    // and the first snapshot never fires (regex matcher; Firestore uses HTTP
    // long-polling, no WS). Auth is NOT blocked → we reach PatientForm.
    // (route.abort() would NOT reproduce this — a clean error makes the SDK
    // serve a fromCache snapshot immediately; only a HANG reproduces the stuck.)
    await context.route(/firestore\.googleapis\.com/, () => { /* hang — never abort/continue */ });

    await page.goto(SESSION);
    // Without the fix this hangs on "กำลังโหลด..." forever.
    // 2026-07-20 semantic update (AV206): PatientForm is a CUSTOMER surface and
    // now reads through the fresh-gate (`onSnapshotFresh` DROPS fromCache
    // snapshots — customers must never see cache). So on a truly half-dead
    // connection the page no longer "resolves" to ลิงก์ไม่ถูกต้อง off an EMPTY
    // cache snapshot (that would be a FALSE claim — the link may be valid);
    // instead the resilient path surfaces the honest "ลองใหม่" escape card.
    // The invariant this test protects is unchanged: NO permanent spinner.
    await expect(page.locator(RETRY_CARD)).toBeVisible({ timeout: 40000 });
  });

  test('C. normal load resolves — no false error card, gate clears', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto(SESSION);
    // A non-existent session resolves to "ลิงก์ไม่ถูกต้อง" (a RESOLVED state — the
    // snapshot fired → markReady), NOT a stuck spinner and NOT the error card.
    await expect(page.getByText(/ลิงก์ไม่ถูกต้อง|Invalid Link/)).toBeVisible({ timeout: 20000 });
    await expect(page.locator(RETRY_CARD)).toBeHidden();
  });
});
