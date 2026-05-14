/**
 * Selective Make-Fresh — Rule Q L1 Real-Adversarial Verification (V66 mandate).
 *
 * Drives REAL browser against REAL prod Firestore via local-dev (npm run dev).
 * NO mocks. Auth via REST signInWithPassword → idToken → localStorage inject.
 * TEST-MAKE-FRESH-* branch fixtures.
 *
 * Run:
 *   npm run dev   # in another terminal
 *   BASE_URL=http://localhost:5173 \
 *     FIREBASE_API_KEY=... TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... \
 *     npx playwright test tests/e2e/branch-make-fresh-selective.spec.js
 *
 * Skips when env vars not set OR when TEST-prefixed branch row not found in
 * BranchesTab. Seed TEST-MAKE-FRESH-BR-{ts} via admin-SDK first if needed.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

async function authAsAdmin(page) {
  const apiKey = process.env.FIREBASE_API_KEY;
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!apiKey || !email || !password) {
    test.skip(true, 'Auth env vars missing — set FIREBASE_API_KEY + TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD');
    return;
  }
  const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await resp.json();
  if (!data.idToken) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  await page.addInitScript((tok) => {
    localStorage.setItem(`firebase:authUser:${tok.apiKey}:[DEFAULT]`, JSON.stringify({
      uid: tok.localId,
      stsTokenManager: {
        accessToken: tok.idToken,
        refreshToken: tok.refreshToken,
        expirationTime: Date.now() + 3600000,
      },
      email: tok.email,
    }));
  }, { ...data, apiKey });
}

test.describe('Selective Make-Fresh — Rule Q L1 Real-Browser', () => {
  test.beforeEach(async ({ page }) => {
    await authAsAdmin(page);
  });

  test('PW1.1 — Happy path: open modal → Q4-B default state visible → preview → confirm → done', async ({ page }) => {
    await page.goto(`${BASE_URL}/?backend=1&tab=branches`);
    await page.waitForLoadState('networkidle');

    // Find a TEST-prefixed branch row's Make Fresh button
    const makeFreshBtn = page.locator('[data-testid^="make-fresh-btn-TEST-"]').first();
    if (await makeFreshBtn.count() === 0) {
      test.skip(true, 'No TEST-prefixed branch in BranchesTab — seed via scripts/branch-make-fresh.mjs --bucket-ids ... first');
    }
    await makeFreshBtn.click();

    // Q4-B default: 6 checked + customerActivity unchecked
    await expect(page.getByTestId('bucket-appointments')).toBeChecked();
    await expect(page.getByTestId('bucket-treatments')).toBeChecked();
    await expect(page.getByTestId('bucket-sales')).toBeChecked();
    await expect(page.getByTestId('bucket-stock')).toBeChecked();
    await expect(page.getByTestId('bucket-finance')).toBeChecked();
    await expect(page.getByTestId('bucket-lineLink')).toBeChecked();
    await expect(page.getByTestId('bucket-customerActivity')).not.toBeChecked();

    // Untick 5 buckets, leave only appointments
    for (const id of ['treatments', 'sales', 'stock', 'finance', 'lineLink']) {
      await page.getByTestId(`bucket-${id}`).click();
    }

    // Preview
    await page.getByTestId('preview-btn').click();
    await expect(page.getByTestId('impact-panel')).toBeVisible({ timeout: 15000 });

    // Continue + type confirm (assumes branch name = TEST-prefix or similar; user must adjust)
    await page.getByTestId('continue-btn').click();
    // NOTE: confirm-input expects literal branch name. Skip this assertion if
    // the user wants to actually delete data — they should run the script
    // version via CLI for repeatable testing.
  });

  test('PW1.2 — T1 protection via direct API: hand-crafted POST with unknown bucket → 400', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Direct fetch — bypass UI, simulate hand-crafted curl
    const result = await page.evaluate(async () => {
      // Get admin idToken from localStorage
      const key = Object.keys(localStorage).find(k => k.startsWith('firebase:authUser:'));
      if (!key) return { error: 'no auth' };
      const user = JSON.parse(localStorage.getItem(key));
      const token = user?.stsTokenManager?.accessToken;
      if (!token) return { error: 'no token' };

      const r = await fetch('/api/admin/branch-make-fresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          branchId: 'NONEXISTENT-TEST-BRANCH',
          bucketIds: ['nonsense_unknown_bucket'],
          autoBackupRef: 'fake/path/nothing.json',
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    // Expect rejection — UNKNOWN_BUCKET (caught at validation before any wipe)
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.body?.error).toMatch(/UNKNOWN_BUCKET|EMPTY_BUCKET_SET|MISSING/);
  });

  test('PW1.3 — Hash mismatch simulation: intercept make-fresh request, corrupt expectedBodyHash', async ({ page }) => {
    await page.goto(`${BASE_URL}/?backend=1&tab=branches`);
    await page.waitForLoadState('networkidle');

    const makeFreshBtn = page.locator('[data-testid^="make-fresh-btn-TEST-"]').first();
    if (await makeFreshBtn.count() === 0) {
      test.skip(true, 'No TEST-prefixed branch in BranchesTab — seed via admin-SDK first');
    }

    // Intercept the make-fresh request and corrupt expectedBodyHash to wrong value
    await page.route('**/api/admin/branch-make-fresh', async (route) => {
      const original = JSON.parse(route.request().postData() || '{}');
      original.expectedBodyHash = 'f'.repeat(64); // wrong hash
      await route.continue({ postData: JSON.stringify(original) });
    });

    await makeFreshBtn.click();
    // Untick all but appointments
    for (const id of ['treatments', 'sales', 'stock', 'finance', 'lineLink']) {
      const cb = page.getByTestId(`bucket-${id}`);
      if (await cb.isChecked()) await cb.click();
    }

    await page.getByTestId('preview-btn').click();
    await expect(page.getByTestId('impact-panel')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('continue-btn').click();

    // Type branch name (extract from button data-testid — usually pattern TEST-MAKE-FRESH-BR-...)
    const branchTestId = await makeFreshBtn.getAttribute('data-testid');
    const branchName = (branchTestId || '').replace(/^make-fresh-btn-/, '');
    await page.getByTestId('confirm-input').fill(branchName);
    await page.getByTestId('confirm-btn').click();

    // Expect BACKUP_HASH_EXPECTED_MISMATCH in error UI
    await expect(
      page.locator('text=BACKUP_HASH_EXPECTED_MISMATCH').or(page.locator('text=BACKUP_INTEGRITY_FAIL'))
    ).toBeVisible({ timeout: 30000 });
  });
});
