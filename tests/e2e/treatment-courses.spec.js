// ─── E2E: Treatment + Course Deduction — ALL scenarios ──────────────────────
// Tests the REAL flow: create treatment → tick courses → save → verify deduction
// These catch bugs that unit tests miss (wrong index, stale cache, UI mismatch)
import { test, expect } from '@playwright/test';
import { goToCustomer } from './helpers.js';

// 2026-07-20: prod customer '2867' was deleted → overridable so the runner can
// seed a TEST- customer (diag-av192-seed-cleanup.mjs seed) — V33.10 discipline.
const CUSTOMER_ID = process.env.E2E_BUY_CUSTOMER || '2867'; // Test customer with courses

test.describe('Treatment Form — Course Deduction Scenarios', () => {

  test('form loads course checkboxes without error', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    // Click "สร้างการรักษา"
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(2000);
    // Should see "ข้อมูลการใช้คอร์ส" section
    await expect(page.getByText('ข้อมูลการใช้คอร์ส')).toBeVisible({ timeout: 10000 });
    // Should have course checkboxes
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('tick course → appears in รายการรักษา', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(2000);
    // Find and tick the first course checkbox in the คอร์ส column
    const courseCheckbox = page.locator('.max-h-\\[300px\\] input[type="checkbox"]').first();
    await courseCheckbox.check();
    await page.waitForTimeout(500);
    // "รายการรักษา" column should now have at least 1 item
    const treatmentItems = page.locator('text=รายการรักษา').locator('..').locator('..').locator('input[type="number"]');
    await expect(treatmentItems.first()).toBeVisible({ timeout: 3000 });
  });

  test('untick course → disappears from รายการรักษา', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(2000);
    const courseCheckbox = page.locator('.max-h-\\[300px\\] input[type="checkbox"]').first();
    // Check then uncheck
    await courseCheckbox.check();
    await page.waitForTimeout(300);
    await courseCheckbox.uncheck();
    await page.waitForTimeout(300);
    // Treatment items should show the empty message
    await expect(page.getByText('เลือกรายการจากคอร์ส')).toBeVisible({ timeout: 3000 });
  });

  test('ซื้อคอร์ส button opens buy modal', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(2000);
    const buyBtn = page.getByRole('button', { name: /ซื้อคอร์ส/ });
    await expect(buyBtn).toBeVisible();
    await buyBtn.click();
    await page.waitForTimeout(1000);
    // Buy modal should open — has ยกเลิก button inside fixed overlay
    await expect(page.locator('.fixed').getByRole('button', { name: 'ยกเลิก' }).first()).toBeVisible({ timeout: 5000 });
  });

  test('ซื้อโปรโมชัน button opens buy modal', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /ซื้อโปรโมชัน/ }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('โปรโมชัน').first()).toBeVisible({ timeout: 5000 });
  });

  test('validation: no doctor → scrolls to doctor field', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(2000);
    // Clear doctor if pre-filled — find the select inside data-field="doctor"
    const doctorSelect = page.locator('[data-field="doctor"] select');
    if (await doctorSelect.isVisible()) {
      await doctorSelect.selectOption('');
    }
    // Click submit — validation surfaces as an alert() dialog (scrollToError
    // pattern) and/or a banner; accept EITHER (2026-07-20).
    let dialogMsg = '';
    page.on('dialog', d => { dialogMsg = d.message(); d.accept(); });
    // 2026-07-20: submit no longer lives in a header/.sticky container —
    // match the button anywhere (same locator v96 spec uses, proven green).
    await page.locator('button').filter({ hasText: 'ยืนยันการรักษา' }).first().click();
    await page.waitForTimeout(1500);
    const bannerVisible = await page.getByText(/กรุณาเลือกแพทย์|เลือกแพทย์/).first()
      .isVisible({ timeout: 3000 }).catch(() => false);
    expect(bannerVisible || /เลือกแพทย์/.test(dialogMsg)).toBeTruthy();
  });

  test('data-field attributes exist for scroll targets', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(2000);
    // Verify key data-field attributes exist for scrollToError
    await expect(page.locator('[data-field="doctor"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-field="treatmentDate"]')).toBeVisible();
  });

  test('buy modal shows max 50 items (performance)', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /ซื้อคอร์ส/ }).click();
    await page.waitForTimeout(2000);
    // 2026-07-20: shadow-course filtering (V13) can leave <50 items in the
    // branch list — assert the pagination label + that the rendered count
    // never exceeds the 50-item performance cap.
    const label = page.getByText(/แสดง \d+\//).first();
    await expect(label).toBeVisible({ timeout: 5000 });
    const text = await label.textContent();
    const shown = parseInt(text.match(/แสดง (\d+)\//)[1], 10);
    expect(shown).toBeLessThanOrEqual(50);
  });

  test('qty input field is wide enough for 3+ digits', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByTestId('create-treatment-btn').click();
    await page.waitForTimeout(2000);
    // Tick a course
    const courseCheckbox = page.locator('.max-h-\\[300px\\] input[type="checkbox"]').first();
    await courseCheckbox.check();
    await page.waitForTimeout(500);
    // Find the qty input in treatment items
    const qtyInput = page.locator('[data-field="courseSection"]').locator('..').locator('input[type="number"]').first();
    if (await qtyInput.isVisible()) {
      // Should be able to type 3 digits
      await qtyInput.fill('100');
      await expect(qtyInput).toHaveValue('100');
    }
  });
});
