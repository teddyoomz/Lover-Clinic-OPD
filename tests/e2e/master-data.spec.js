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

  test('shows sub-tab buttons', async ({ page }) => {
    // Sub-tabs use emoji icons — match by partial text
    await expect(page.getByRole('button', { name: /คอร์ส/ })).toBeVisible();
  });

  test('click คอร์ส sub-tab → shows "สร้างคอร์ส" button', async ({ page }) => {
    await page.getByRole('button', { name: /คอร์ส/ }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: 'สร้างคอร์ส' })).toBeVisible();
  });

  test('"สร้างคอร์ส" → form overlay opens', async ({ page }) => {
    await page.getByRole('button', { name: /คอร์ส/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByPlaceholder('เช่น Botox Package')).toBeVisible({ timeout: 3000 });
    await expect(page.getByPlaceholder('BTX-001')).toBeVisible();
  });

  test('course form has "เพิ่มสินค้า" button', async ({ page }) => {
    await page.getByRole('button', { name: /คอร์ส/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('เพิ่มสินค้า')).toBeVisible();
  });

  test('"ยกเลิก" closes form → sync section visible again', async ({ page }) => {
    await page.getByRole('button', { name: /คอร์ส/ }).click();
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
