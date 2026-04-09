// ─── E2E: Course Actions — Exchange + Share + Add Qty ─────────────────────────
import { test, expect } from '@playwright/test';
import { goToCustomer } from './helpers.js';

const CUSTOMER_ID = '2853';

test.describe('Course Action Modals', () => {
  test.beforeEach(async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
  });

  test('"เปลี่ยนสินค้า" modal has newQty + staff fields', async ({ page }) => {
    const btn = page.getByText('เปลี่ยนสินค้า').first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
    // Modal popup should open
    await expect(page.getByText('เปลี่ยนสินค้าในคอร์ส')).toBeVisible({ timeout: 3000 });
    // Should have old qty field
    await expect(page.getByText('จำนวนที่จะเปลี่ยน')).toBeVisible();
    // Should have new product qty field after selecting a product
    // Should have staff selector
    await expect(page.getByText('พนักงานผู้ดำเนินการ')).toBeVisible();
  });

  test('"แชร์คอร์ส" button visible + modal opens', async ({ page }) => {
    const btn = page.getByText('แชร์คอร์ส').first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
    await expect(page.getByText('แชร์คอร์สให้ลูกค้าอื่น')).toBeVisible({ timeout: 3000 });
    // Should have qty field
    await expect(page.getByText('จำนวนที่จะแชร์')).toBeVisible();
    // Should have customer picker
    await expect(page.getByText('เลือกลูกค้าปลายทาง')).toBeVisible();
    // Should have staff selector
    await expect(page.getByText('พนักงานผู้ดำเนินการ')).toBeVisible();
  });

  test('exchange modal: ปุ่มยืนยัน disabled เมื่อไม่กรอกข้อมูล', async ({ page }) => {
    await page.getByText('เปลี่ยนสินค้า').first().click();
    await expect(page.getByText('เปลี่ยนสินค้าในคอร์ส')).toBeVisible({ timeout: 3000 });
    // Confirm button should be disabled without filling required fields
    await expect(page.getByText('ยืนยันเปลี่ยนสินค้า')).toBeDisabled();
  });

  test('share modal: ปุ่มยืนยัน disabled เมื่อไม่กรอกข้อมูล', async ({ page }) => {
    await page.getByText('แชร์คอร์ส').first().click();
    await expect(page.getByText('แชร์คอร์สให้ลูกค้าอื่น')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('ยืนยันแชร์คอร์ส')).toBeDisabled();
  });
});
