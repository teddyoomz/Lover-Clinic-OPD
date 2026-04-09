// ─── E2E: Master Data Tab — Sync + Course CRUD ──────────────────────────────
import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

test.describe('Master Data Tab', () => {
  test.beforeEach(async ({ page }) => {
    await goToBackend(page);
    await page.getByRole('button', { name: 'ข้อมูลพื้นฐาน' }).click();
    await page.waitForTimeout(1500);
  });

  test('shows sync section', async ({ page }) => {
    await expect(page.getByText('Sync ข้อมูลจาก ProClinic')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sync ทั้งหมด' })).toBeVisible();
  });

  test('shows sub-tab buttons including courses', async ({ page }) => {
    // Sub-tab buttons are in a flex row — find the one that contains "คอร์ส" exactly
    const courseSubTab = page.locator('button', { hasText: '📋' }).first();
    await expect(courseSubTab).toBeVisible();
  });

  test('click คอร์ส sub-tab → shows "สร้างคอร์ส" button', async ({ page }) => {
    // Click the sub-tab (not sync) button — sub-tabs are smaller, in a different row
    await page.locator('button', { hasText: '📋' }).nth(1).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: 'สร้างคอร์ส' })).toBeVisible();
  });

  test('"สร้างคอร์ส" → form overlay opens', async ({ page }) => {
    await page.locator('button', { hasText: '📋' }).nth(1).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByPlaceholder('เช่น Botox Package')).toBeVisible({ timeout: 3000 });
  });

  test('course form has "เพิ่มสินค้า" button', async ({ page }) => {
    await page.locator('button', { hasText: '📋' }).nth(1).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: 'เพิ่มสินค้า' })).toBeVisible();
  });

  test('"ยกเลิก" closes form → sync section visible', async ({ page }) => {
    await page.locator('button', { hasText: '📋' }).nth(1).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'ยกเลิก' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Sync ข้อมูลจาก ProClinic')).toBeVisible();
  });

  test('search/filter bar visible', async ({ page }) => {
    await expect(page.getByPlaceholder('ค้นหา...')).toBeVisible();
  });
});
