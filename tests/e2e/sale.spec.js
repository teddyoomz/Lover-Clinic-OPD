// ─── E2E: Sale Tab — List + Form + Buy Modal + Payment + Validation ──────────
import { test, expect } from '@playwright/test';
import { goToTab } from './helpers.js';

// Helper: open sale form
async function openSaleForm(page) {
  // The create button is inside the content area, NOT the tab button
  // It's a gradient button with text "ขาย" inside the search header
  // 2026-07-20: multiple gradient buttons exist now (subtab pill "การขาย" is
  // ALSO gradient-styled and sits earlier in the DOM) — target the create
  // button by its EXACT accessible name "ขาย" (the + icon adds no name text).
  const createBtn = page.getByRole('button', { name: 'ขาย', exact: true }).first();
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
    const createBtn = page.getByRole('button', { name: 'ขาย', exact: true }).first();
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
    // 2026-07-20: exact names + .last() — the classic sidebar has leaves with
    // the same exact names ('สินค้า', 'โปรโมชัน'); the form renders LAST in DOM.
    await expect(page.getByRole('button', { name: 'ซื้อคอร์ส', exact: true }).last()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'สินค้า', exact: true }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'โปรโมชัน', exact: true }).last()).toBeVisible();
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
    await page.getByRole('button', { name: 'ซื้อคอร์ส', exact: true }).last().click();
    await page.waitForTimeout(2000);
    // 2026-07-20: .fixed.last() now lands on the chat-widget launcher — assert
    // the modal's ยกเลิก button directly (last = topmost overlay's).
    await expect(page.getByRole('button', { name: 'ยกเลิก' }).last()).toBeVisible({ timeout: 10000 });
  });

  test('form: validation — ไม่เลือกลูกค้า → error', async ({ page }) => {
    await openSaleForm(page);
    // 2026-07-20: validation surfaces as an alert() (scrollToError pattern)
    // and/or a banner — accept EITHER. In the open form the save button is the
    // LAST exact-'ขาย' button (the list's create button sits earlier in DOM).
    let dialogMsg = '';
    page.on('dialog', d => { dialogMsg = d.message(); d.accept(); });
    const saveBtn = page.getByRole('button', { name: 'ขาย', exact: true }).last();
    await saveBtn.click();
    await page.waitForTimeout(1500);
    const bannerVisible = await page.getByText(/กรุณาเลือกลูกค้า/).first()
      .isVisible({ timeout: 3000 }).catch(() => false);
    expect(bannerVisible || /เลือกลูกค้า/.test(dialogMsg)).toBeTruthy();
  });
});
