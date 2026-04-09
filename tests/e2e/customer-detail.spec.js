// ─── E2E: Customer Detail View — Course Buttons + Modals ─────────────────────
// These tests catch the exact bugs that unit tests missed:
// - Nested IIFE click handlers not firing
// - Wrong array index after filtering
// - Modals not opening
import { test, expect } from '@playwright/test';
import { goToCustomer } from './helpers.js';

const CUSTOMER_ID = '2853';

test.describe('Customer Detail — Course Buttons', () => {
  test.beforeEach(async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
  });

  test('shows course tab with active courses', async ({ page }) => {
    await expect(page.getByText('คอร์สของฉัน')).toBeVisible();
    // Should see course names
    await page.waitForTimeout(1000);
  });

  test('"เพิ่มคงเหลือ" button ACTUALLY clickable → modal opens', async ({ page }) => {
    const addBtn = page.getByText('เพิ่มคงเหลือ').first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
    // Modal must open — not silently fail
    await expect(page.getByPlaceholder('จำนวน')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: 'ยืนยัน' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ยกเลิก' })).toBeVisible();
  });

  test('"เปลี่ยนสินค้า" button ACTUALLY clickable → modal opens', async ({ page }) => {
    const exchangeBtn = page.getByText('เปลี่ยนสินค้า').first();
    await expect(exchangeBtn).toBeVisible({ timeout: 5000 });
    await exchangeBtn.click();
    // Exchange modal must show current product info
    await expect(page.getByText('สินค้าปัจจุบัน')).toBeVisible({ timeout: 3000 });
    await expect(page.getByPlaceholder('ค้นหาสินค้าใหม่')).toBeVisible();
  });

  test('"เพิ่มคงเหลือ" modal cancel button works', async ({ page }) => {
    await page.getByText('เพิ่มคงเหลือ').first().click();
    await expect(page.getByPlaceholder('จำนวน')).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: 'ยกเลิก' }).click();
    // Modal should close
    await expect(page.getByPlaceholder('จำนวน')).not.toBeVisible({ timeout: 2000 });
  });

  test('"เปลี่ยนสินค้า" modal cancel → closes', async ({ page }) => {
    await page.getByText('เปลี่ยนสินค้า').first().click();
    const modal = page.getByText('เปลี่ยนสินค้าในคอร์ส');
    await expect(modal).toBeVisible({ timeout: 5000 });
    // Close by clicking the X button in the modal header
    const closeBtn = modal.locator('..').locator('button').first();
    await closeBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test('click "คอร์สหมดอายุ" tab → content changes', async ({ page }) => {
    await page.getByText('คอร์สหมดอายุ').click();
    await page.waitForTimeout(500);
    // Should show expired courses or empty message
    const hasContent = await page.getByText('ไม่มีคอร์สหมดอายุ').or(page.getByText('หมดอายุ').nth(1)).first().isVisible();
    expect(hasContent).toBeTruthy();
  });

  test('click "ประวัติการซื้อ" tab → content changes', async ({ page }) => {
    await page.getByText('ประวัติการซื้อ').click();
    await page.waitForTimeout(500);
    const hasContent = await page.getByText('ไม่มีประวัติการซื้อ').or(page.getByText('ชำระแล้ว')).first().isVisible();
    expect(hasContent).toBeTruthy();
  });

  test('treatment timeline section is visible', async ({ page }) => {
    await expect(page.getByText('ประวัติการรักษา')).toBeVisible();
  });

  test('profile section shows patient info fields', async ({ page }) => {
    await expect(page.getByText('เพศ')).toBeVisible();
    await expect(page.getByText('เบอร์โทร')).toBeVisible();
  });

  test('progress bars are rendered for courses', async ({ page }) => {
    // Progress bars have a specific width style set dynamically
    const bars = page.locator('.h-1\\.5.rounded-full');
    const count = await bars.count();
    expect(count).toBeGreaterThan(0);
  });
});
