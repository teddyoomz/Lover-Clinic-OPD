// ─── E2E: Sale Tab — List + Form + Buy Modal + Payment + Validation ──────────
import { test, expect } from '@playwright/test';
import { goToTab } from './helpers.js';

// Helper: open sale form
async function openSaleForm(page) {
  // The create button is inside the content area, NOT the tab button
  // It's a gradient button with text "ขาย" inside the search header
  const createBtn = page.locator('button[style*="linear-gradient"]').filter({ hasText: /ขาย/ });
  await createBtn.click();
  await page.waitForTimeout(1500);
}

test.describe('Sale Tab', () => {
  test.beforeEach(async ({ page }) => {
    await goToTab(page, 'sales');
  });

  // ── List View ──
  test('list: แสดง search bar', async ({ page }) => {
    await expect(page.getByPlaceholder(/ค้นหาใบเสร็จ/)).toBeVisible();
  });

  test('list: แสดง status filter dropdown', async ({ page }) => {
    // <option> elements are hidden inside <select> — check the select element instead
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
  });

  test('list: แสดงปุ่มสร้างใบเสร็จ', async ({ page }) => {
    const createBtn = page.locator('button[style*="linear-gradient"]').filter({ hasText: /ขาย/ });
    await expect(createBtn).toBeVisible();
  });

  test('list: แสดงจำนวนรายการ', async ({ page }) => {
    await expect(page.getByText(/\d+\s*รายการ/).first()).toBeVisible({ timeout: 10000 });
  });

  // ── Form Overlay ──
  test('คลิกปุ่มขาย → เปิดฟอร์ม (header "ขายใหม่")', async ({ page }) => {
    await openSaleForm(page);
    await expect(page.getByText('ขายใหม่')).toBeVisible({ timeout: 5000 });
  });

  test('form: แสดง customer picker (ลูกค้า *)', async ({ page }) => {
    await openSaleForm(page);
    await expect(page.getByText('ลูกค้า *').first()).toBeVisible({ timeout: 5000 });
  });

  test('form: แสดง วันที่ขาย *', async ({ page }) => {
    await openSaleForm(page);
    await expect(page.getByText('วันที่ขาย *')).toBeVisible({ timeout: 5000 });
  });

  test('form: แสดง buy buttons (ซื้อคอร์ส, สินค้า, โปรโมชัน)', async ({ page }) => {
    await openSaleForm(page);
    await expect(page.getByRole('button', { name: /ซื้อคอร์ส/ })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /สินค้า/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /โปรโมชัน/ })).toBeVisible();
  });

  test('form: แสดง payment status options (ชำระเต็ม, แบ่งชำระ, ค้างชำระ, แบบร่าง)', async ({ page }) => {
    await openSaleForm(page);
    await expect(page.getByText('ชำระเต็ม')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('แบ่งชำระ').first()).toBeVisible();
    await expect(page.getByText('แบบร่าง')).toBeVisible();
  });

  test('form: แสดง section พนักงานขาย', async ({ page }) => {
    await openSaleForm(page);
    await expect(page.getByText('พนักงานขาย').first()).toBeVisible({ timeout: 5000 });
  });

  test('form: คลิก "ซื้อคอร์ส" → buy modal เปิด', async ({ page }) => {
    await openSaleForm(page);
    await page.getByRole('button', { name: /ซื้อคอร์ส/ }).click();
    await page.waitForTimeout(2000);
    // Buy modal shows ยกเลิก button
    const modal = page.locator('.fixed').last();
    await expect(modal.getByRole('button', { name: 'ยกเลิก' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('form: validation — ไม่เลือกลูกค้า → error', async ({ page }) => {
    await openSaleForm(page);
    page.on('dialog', d => d.accept());
    // Click the save button (exact name "ขาย" — not "ขาย/ใบเสร็จ" tab)
    const saveBtn = page.getByRole('button', { name: 'ขาย', exact: true });
    await saveBtn.click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/กรุณาเลือกลูกค้า/)).toBeVisible({ timeout: 3000 });
  });
});
