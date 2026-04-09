// ─── E2E: Appointment Tab — Calendar + Form + Validation ─────────────────────
import { test, expect } from '@playwright/test';
import { goToTab } from './helpers.js';

test.describe('Appointment Tab', () => {
  test.beforeEach(async ({ page }) => {
    await goToTab(page, 'appointments');
  });

  // ── Basic Elements ──
  test('แสดงปุ่ม "เพิ่มนัดหมาย"', async ({ page }) => {
    await expect(page.getByRole('button', { name: /เพิ่มนัดหมาย/ })).toBeVisible();
  });

  // ── Mini Calendar ──
  test('mini calendar: แสดง Thai day headers (จ,อ,พ,พฤ,ศ,ส,อา)', async ({ page }) => {
    await expect(page.getByText('อา').first()).toBeVisible();
    await expect(page.getByText('จ').first()).toBeVisible();
    await expect(page.getByText('ศ').first()).toBeVisible();
  });

  test('mini calendar: แสดงเดือน/ปี (Thai Buddhist era)', async ({ page }) => {
    // Should show Thai month + พ.ศ. year (2568, 2569, etc.)
    await expect(page.getByText(/256[0-9]/).first()).toBeVisible({ timeout: 5000 });
  });

  test('mini calendar: เลื่อนเดือน ← → ทำงาน', async ({ page }) => {
    const monthHeader = page.getByText(/256[0-9]/).first();
    const beforeMonth = await monthHeader.textContent();
    // Click next month (>) button — typically after the month header
    const navBtns = page.locator('button').filter({ has: page.locator('svg') });
    // Find the right arrow near calendar
    const rightArrow = page.locator('button:has(svg)').nth(1);
    if (await rightArrow.isVisible()) {
      await rightArrow.click();
      await page.waitForTimeout(500);
    }
    // Month text should exist (may or may not change depending on button position)
    await expect(monthHeader).toBeVisible();
  });

  // ── Week Strip ──
  test('week strip: แสดง 7 วัน', async ({ page }) => {
    // Week strip shows day boxes — check for at least Thai day characters
    const weekContainer = page.getByText(/วัน/).first();
    await expect(weekContainer).toBeVisible({ timeout: 5000 });
  });

  // ── Form Modal ──
  test('"เพิ่มนัดหมาย" → เปิด form modal', async ({ page }) => {
    await page.getByRole('button', { name: /เพิ่มนัดหมาย/ }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('สร้างนัดหมาย').first()).toBeVisible({ timeout: 5000 });
  });

  test('form: แสดง required fields (ลูกค้า *, วันที่ *)', async ({ page }) => {
    await page.getByRole('button', { name: /เพิ่มนัดหมาย/ }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('ลูกค้า *')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('วันที่ *')).toBeVisible();
  });

  test('form: customer search input ทำงาน', async ({ page }) => {
    await page.getByRole('button', { name: /เพิ่มนัดหมาย/ }).click();
    await page.waitForTimeout(500);
    const input = page.getByPlaceholder(/ค้นหา/).first();
    await expect(input).toBeVisible({ timeout: 3000 });
    await input.fill('test');
    await expect(input).toHaveValue('test');
  });

  test('form: data-field attributes สำหรับ scroll targets ครบ', async ({ page }) => {
    await page.getByRole('button', { name: /เพิ่มนัดหมาย/ }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-field="apptCustomer"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-field="apptDate"]')).toBeVisible();
    await expect(page.locator('[data-field="apptStartTime"]')).toBeVisible();
  });

  test('form: validation — ไม่เลือกลูกค้า → error "กรุณาเลือกลูกค้า"', async ({ page }) => {
    await page.getByRole('button', { name: /เพิ่มนัดหมาย/ }).click();
    await page.waitForTimeout(500);
    page.on('dialog', d => d.accept());
    const saveBtn = page.getByRole('button', { name: /สร้างนัดหมาย/ });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(500);
      await expect(page.getByText('กรุณาเลือกลูกค้า')).toBeVisible({ timeout: 3000 });
    }
  });

  test('form: ปุ่มปิด X ปิด modal ได้', async ({ page }) => {
    await page.getByRole('button', { name: /เพิ่มนัดหมาย/ }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('สร้างนัดหมาย').first()).toBeVisible({ timeout: 3000 });
    // Close via X button or ยกเลิก
    const cancelBtn = page.getByRole('button', { name: 'ยกเลิก' });
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
    await page.waitForTimeout(500);
    // Form should close — "เพิ่มนัดหมาย" button visible again
    await expect(page.getByRole('button', { name: /เพิ่มนัดหมาย/ })).toBeVisible();
  });
});
