/**
 * Phase 29.23 — Rule Q L1 Real-Adversarial Verification (V66 mandate).
 *
 * Drives REAL browser against REAL prod Firestore via local-dev (npm run dev).
 * NO mocks. Auth via REST signInWithPassword → idToken → localStorage inject.
 * TEST-RECALL-* fixtures per V33 prefix discipline.
 *
 * Run: BASE_URL=http://localhost:5173 npx playwright test tests/e2e/phase-29-23-recall-edit-real-browser.spec.js
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
    const key = Object.keys(localStorage).find(k => k.startsWith('firebase:authUser:'));
    if (!key) {
      localStorage.setItem(`firebase:authUser:${tok.apiKey}:[DEFAULT]`, JSON.stringify({
        uid: tok.localId,
        stsTokenManager: {
          accessToken: tok.idToken,
          refreshToken: tok.refreshToken,
          expirationTime: Date.now() + 3600000,
        },
        email: tok.email,
      }));
    }
  }, { ...data, apiKey });
}

test.describe('Phase 29.23 PB — Rule Q L1 Real-Browser', () => {
  test.beforeEach(async ({ page }) => {
    await authAsAdmin(page);
  });

  test('PB1 — Edit recall in BackendDashboard: modal opens, save updates listener', async ({ page }) => {
    await page.goto(`${BASE_URL}/?backend=1&tab=recall`);
    await page.waitForLoadState('networkidle');
    const editBtn = page.getByTestId(/^recall-edit-TEST-RECALL-/).first();
    if (await editBtn.count() === 0) {
      test.skip(true, 'No TEST-RECALL fixture in prod — create via admin-SDK script first');
    }
    await editBtn.click();
    await expect(page.getByTestId('recall-edit-modal')).toBeVisible();
    await page.getByTestId('recall-edit-save').click();
    await expect(page.getByTestId('recall-edit-modal')).toBeHidden({ timeout: 5000 });
  });

  test('PB2 — Click customer-name → assert new tab opens with backend deep-link', async ({ page, context }) => {
    await page.goto(`${BASE_URL}/?backend=1&tab=recall`);
    await page.waitForLoadState('networkidle');
    const link = page.getByTestId(/^recall-customer-link-/).first();
    if (await link.count() === 0) {
      test.skip(true, 'No recall rows with customer-link visible');
    }
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      link.click({ modifiers: ['Control'] }),
    ]);
    await newPage.waitForLoadState('domcontentloaded');
    expect(newPage.url()).toContain('backend=1');
    expect(newPage.url()).toContain('customer=');
    await newPage.close();
  });

  test('PB3 — Delete case in admin sub-pill: confirm → row disappears', async ({ page }) => {
    await page.goto(`${BASE_URL}/?backend=1&tab=recall`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('recall-subpill-cases').click();
    await expect(page.getByTestId('recall-cases-admin-panel')).toBeVisible();
    const deleteBtn = page.getByTestId(/^recall-case-delete-TEST-CASE-/).first();
    if (await deleteBtn.count() === 0) {
      test.skip(true, 'No TEST-CASE fixture in prod — create via admin-SDK script first');
    }
    page.once('dialog', dialog => dialog.accept());
    await deleteBtn.click();
    await expect(deleteBtn).toBeHidden({ timeout: 5000 });
  });

  test('PB4 — Edit on done recall: save still works (admin can fix typos any-status)', async ({ page }) => {
    await page.goto(`${BASE_URL}/?backend=1&tab=recall`);
    await page.waitForLoadState('networkidle');
    const doneRow = page.locator('[data-status="done"]').first();
    if (await doneRow.count() === 0) {
      test.skip(true, 'No done recall row visible');
    }
    const editBtn = doneRow.getByTestId(/^recall-edit-/);
    await editBtn.click();
    await expect(page.getByTestId('recall-edit-modal')).toBeVisible();
    await page.getByTestId('recall-edit-save').click();
    await expect(page.getByTestId('recall-edit-modal')).toBeHidden({ timeout: 5000 });
  });

  test('PB5 — Validation: empty reason → save disabled', async ({ page }) => {
    await page.goto(`${BASE_URL}/?backend=1&tab=recall`);
    await page.waitForLoadState('networkidle');
    const editBtn = page.getByTestId(/^recall-edit-/).first();
    if (await editBtn.count() === 0) {
      test.skip(true, 'No recall row visible');
    }
    await editBtn.click();
    await expect(page.getByTestId('recall-edit-modal')).toBeVisible();
    const reasonInput = page.locator('[data-field="reason"] input').first();
    await reasonInput.fill('');
    await expect(page.getByTestId('recall-edit-validation-reason')).toBeVisible();
    await expect(page.getByTestId('recall-edit-save')).toBeDisabled();
  });
});
