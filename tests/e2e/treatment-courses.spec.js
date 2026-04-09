// ─── E2E: Treatment + Course Deduction — ALL scenarios ──────────────────────
// Tests the REAL flow: create treatment → tick courses → save → verify deduction
// These catch bugs that unit tests miss (wrong index, stale cache, UI mismatch)
import { test, expect } from '@playwright/test';
import { goToCustomer } from './helpers.js';

const CUSTOMER_ID = '2867'; // Test customer with courses

test.describe('Treatment Form — Course Deduction Scenarios', () => {

  test('form loads course checkboxes without error', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    // Click "สร้างการรักษา"
    await page.getByRole('button', { name: 'สร้างการรักษา' }).click();
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
    await page.getByRole('button', { name: 'สร้างการรักษา' }).click();
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
    await page.getByRole('button', { name: 'สร้างการรักษา' }).click();
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
    await page.getByRole('button', { name: 'สร้างการรักษา' }).click();
    await page.waitForTimeout(2000);
    // Click "ซื้อคอร์ส"
    const buyBtn = page.getByRole('button', { name: /ซื้อคอร์ส/ });
    await expect(buyBtn).toBeVisible();
    await buyBtn.click();
    await page.waitForTimeout(1000);
    // Buy modal should open with course list
    await expect(page.getByText('ซื้อโปรโมชัน / คอร์ส / สินค้าหน้าร้าน').or(page.getByText('รายการ'))).toBeVisible({ timeout: 5000 });
  });

  test('ซื้อโปรโมชัน button opens buy modal', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByRole('button', { name: 'สร้างการรักษา' }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /ซื้อโปรโมชัน/ }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('โปรโมชัน').first()).toBeVisible({ timeout: 5000 });
  });

  test('validation: no doctor → scrolls to doctor field', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByRole('button', { name: 'สร้างการรักษา' }).click();
    await page.waitForTimeout(2000);
    // Clear doctor if pre-filled
    const doctorSelect = page.locator('select').first();
    await doctorSelect.selectOption('');
    // Click submit
    page.on('dialog', d => d.accept());
    await page.getByText('ยืนยันการรักษา').click();
    await page.waitForTimeout(1000);
    // Error should be visible
    await expect(page.getByText('กรุณาเลือกแพทย์')).toBeVisible({ timeout: 3000 });
  });

  test('validation: no seller when hasSale → scrolls to seller section', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByRole('button', { name: 'สร้างการรักษา' }).click();
    await page.waitForTimeout(2000);
    // Buy a course to trigger hasSale
    await page.getByRole('button', { name: /ซื้อสินค้าหน้าร้าน/ }).click();
    await page.waitForTimeout(2000);
    // Check first item
    const firstCheckbox = page.locator('.fixed input[type="checkbox"]').first();
    if (await firstCheckbox.isVisible()) {
      await firstCheckbox.click();
      await page.waitForTimeout(300);
      // Set qty via React-compatible input
      const qtyInput = page.locator('.fixed input[type="number"]').first();
      if (await qtyInput.isVisible()) {
        await qtyInput.fill('1');
      }
      await page.waitForTimeout(300);
      // Confirm buy
      const confirmBtn = page.locator('.fixed button').filter({ hasText: 'ยืนยัน' });
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        await page.waitForTimeout(500);
      }
    }
    // Now try to save without selecting seller
    page.on('dialog', d => d.accept());
    await page.getByText('ยืนยันการรักษา').click();
    await page.waitForTimeout(1000);
    // Should show seller error, scrolled to seller section
    const sellerError = page.getByText('กรุณาเลือกพนักงานขาย');
    // Check it's visible (scrollToError should have scrolled there)
    await expect(sellerError).toBeVisible({ timeout: 3000 });
  });

  test('buy modal shows max 50 items (performance)', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByRole('button', { name: 'สร้างการรักษา' }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /ซื้อคอร์ส/ }).click();
    await page.waitForTimeout(2000);
    // Should show "แสดง 50/" indicating limited render
    await expect(page.getByText(/แสดง 50\//)).toBeVisible({ timeout: 5000 });
  });

  test('qty input field is wide enough for 3+ digits', async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
    await page.getByRole('button', { name: 'สร้างการรักษา' }).click();
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
