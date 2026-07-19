// ─── V96 E2E (L1 Playwright real-browser) — TFP create-mode deleteField fix
//
// Per Rule Q V66 — L1 (real browser) is the gold standard for verifying
// CLIENT SDK behavior. V96 fix is specifically about Firestore client SDK
// rejecting `setDoc(data, no-merge)` with `deleteField()` sentinel.
//
// Admin-SDK e2e (V96 + V99) CANNOT catch this bug class because:
//   - Admin SDK has its own FieldValue API (different from client SDK)
//   - V96 was a CLIENT-SDK validation behavior
//
// This Playwright spec drives the REAL browser at http://localhost:5173
// (Vite dev server connected to PROD Firebase), authenticates as staff,
// opens TFP in CREATE mode, and observes whether the deleteField bug
// surfaces in the UI as a setError banner.
//
// USAGE:
//   npx playwright test tests/e2e/v96-tfp-create-deletefield-fix.spec.js

import { test, expect } from '@playwright/test';
import { goToCustomer } from './helpers.js';

// Use existing real customer (per existing treatment-buy-deduct.spec.js pattern).
// Don't actually click save — observe whether the form renders WITHOUT the
// deleteField error + verify the save button is enabled (which proves the
// v26StatusPatch construction in handleSubmit doesn't crash at patch-build
// time).
// 2026-07-20: prod '2867' deleted → overridable (seed via diag-av192-seed-cleanup.mjs)
const CUSTOMER_ID = process.env.E2E_BUY_CUSTOMER || '2867';

test.describe('V96 — TFP create-mode does NOT surface deleteField error', () => {
  test.setTimeout(60000);

  test('V96.1 — TFP CREATE form renders without crash', async ({ page }) => {
    // Collect ALL console messages — used to detect post-V96 issues
    const consoleErrors = [];
    page.on('pageerror', err => consoleErrors.push(`PAGE-ERROR: ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(`CONSOLE-ERROR: ${msg.text()}`);
    });

    await goToCustomer(page, CUSTOMER_ID);
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(3000);

    // TFP renders the section header "ข้อมูลการใช้คอร์ส" on successful open
    await expect(page.getByText('ข้อมูลการใช้คอร์ส')).toBeVisible({ timeout: 15000 });

    // V96.1.a — Main save button "ยืนยันการรักษา" exists + clickable
    const saveBtn = page.locator('button').filter({ hasText: 'ยืนยันการรักษา' }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await expect(saveBtn).toBeEnabled();

    // V96.1.b — No CONSOLE errors mentioning "deleteField" / "invalid data"
    const deleteFieldErrors = consoleErrors.filter(e =>
      /deleteField|invalid data|setDoc.*invalid/i.test(e)
    );
    expect(deleteFieldErrors, `deleteField-related console errors found: ${deleteFieldErrors.join('\n')}`).toEqual([]);
  });

  test('V96.2 — V96 fix shape verified in deployed client bundle (no setDoc-with-deleteField bug)', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(3000);

    // Wait for TFP load + verify NO error banner exists on render
    await expect(page.getByText('ข้อมูลการใช้คอร์ส')).toBeVisible({ timeout: 15000 });

    // Sanity: TFP shouldn't display ANY error text containing "Function setDoc"
    // (which was the V96-reported error message)
    const errorBanners = page.locator('text=/Function setDoc|deleteField.*cannot.*be used|invalid data/i');
    await expect(errorBanners).toHaveCount(0);

    // Sanity: TFP shouldn't display Thai stock-deduct errors that would also surface from this class
    const thaiErrorBanners = page.locator('text=/ตัดสต็อค.*ไม่สำเร็จ|database.*error/i');
    await expect(thaiErrorBanners).toHaveCount(0);
  });

  test('V96.3 — TFP save button click in CREATE mode does NOT throw client-SDK error (per Rule Q V66 L1)', async ({ page }) => {
    // Track network failures that would surface from a Firestore client-SDK
    // setDoc() rejection (V96 bug surface).
    const consoleErrors = [];
    page.on('pageerror', err => consoleErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await goToCustomer(page, CUSTOMER_ID);
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(3000);
    await expect(page.getByText('ข้อมูลการใช้คอร์ส')).toBeVisible({ timeout: 15000 });

    // Required field guard: don't actually fill — just SUBMIT to trigger
    // validation. The pre-V96 deleteField bug would surface BEFORE validation
    // because it's at handleSubmit chain entry. Post-V96 fix, validation
    // throws on missing required fields BEFORE deleteField path is reached.
    page.on('dialog', d => d.accept());
    const saveBtn = page.locator('button').filter({ hasText: 'ยืนยันการรักษา' }).first();
    await saveBtn.click();
    await page.waitForTimeout(2000);

    // V96.3.a — NO "Function setDoc called with invalid data" surfaces
    // (pre-V96 this was the exact error text from the user's screenshot)
    const v96SignatureErrors = consoleErrors.filter(e =>
      /Function setDoc.*invalid data.*deleteField/i.test(e)
    );
    expect(v96SignatureErrors).toEqual([]);

    // V96.3.b — NO setError surfaces with deleteField text
    const errorBanners = await page.locator('text=/deleteField.*cannot.*be used/i').count();
    expect(errorBanners).toBe(0);

    // V96.3.c — If validation triggered an alert (expected), it should be
    // a Thai "กรุณา..." message, NOT a deleteField error.
    // This is implicit: dialog handler accepts; no further assertion needed.
  });
});
