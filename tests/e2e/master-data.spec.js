// ─── E2E: Master Data Tab — Sync + Sub-tabs + Course CRUD ────────────────────
import { test, expect } from '@playwright/test';
import { goToTab } from './helpers.js';

test.describe('Master Data Tab', () => {
  test.beforeEach(async ({ page }) => {
    await goToTab(page, 'masterdata');
  });

  // ── Sync Section ──
  test('แสดง sync section heading', async ({ page }) => {
    await expect(page.getByText('Sync ข้อมูลจาก ProClinic')).toBeVisible();
  });

  test('แสดงปุ่ม "Sync ทั้งหมด"', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Sync ทั้งหมด' })).toBeVisible();
  });

  // ── Sub-tabs ──
  test('แสดง sub-tab buttons 5 ตัว (💊🩺👤📋🏷️)', async ({ page }) => {
    await expect(page.locator('button', { hasText: '💊' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: '🩺' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: '👤' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: '📋' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: '🏷️' }).first()).toBeVisible();
  });

  test('sub-tab 💊 Products: แสดง search bar', async ({ page }) => {
    await expect(page.getByPlaceholder('ค้นหา...')).toBeVisible();
  });

  test('sub-tab 🩺 Doctors: คลิก → แสดง content', async ({ page }) => {
    await page.locator('button', { hasText: '🩺' }).first().click();
    await page.waitForTimeout(500);
    // Should show doctor list or empty state
    await expect(page.getByPlaceholder('ค้นหา...')).toBeVisible();
  });

  test('sub-tab 📋 Courses: คลิก → แสดง "สร้างคอร์ส"', async ({ page }) => {
    await page.locator('button', { hasText: '📋' }).nth(1).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: 'สร้างคอร์ส' })).toBeVisible();
  });

  // ── Course Form ──
  test('"สร้างคอร์ส" → เปิดฟอร์มสร้างคอร์ส', async ({ page }) => {
    await page.locator('button', { hasText: '📋' }).nth(1).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByPlaceholder('เช่น Botox Package')).toBeVisible({ timeout: 3000 });
  });

  test('course form: แสดง fields (ชื่อ, รหัส, หมวด, ประเภท, ราคา, สถานะ)', async ({ page }) => {
    await page.locator('button', { hasText: '📋' }).nth(1).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByPlaceholder('เช่น Botox Package')).toBeVisible({ timeout: 3000 });
    await expect(page.getByPlaceholder('BTX-001')).toBeVisible();
    await expect(page.getByText('ราคา').first()).toBeVisible();
    await expect(page.getByText('สถานะ').first()).toBeVisible();
  });

  test('course form: มีปุ่ม "เพิ่มสินค้า"', async ({ page }) => {
    await page.locator('button', { hasText: '📋' }).nth(1).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: 'เพิ่มสินค้า' })).toBeVisible();
  });

  test('course form: คลิก "เพิ่มสินค้า" → เพิ่ม row ใหม่', async ({ page }) => {
    await page.locator('button', { hasText: '📋' }).nth(1).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'เพิ่มสินค้า' }).click();
    await page.waitForTimeout(300);
    // Should show a product search input row
    const prodInputs = page.getByPlaceholder(/ค้นหาสินค้า|พิมพ์ชื่อสินค้า/);
    await expect(prodInputs.first()).toBeVisible({ timeout: 3000 });
  });

  test('course form: "ยกเลิก" → ปิดฟอร์ม → เห็น sync section', async ({ page }) => {
    await page.locator('button', { hasText: '📋' }).nth(1).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'ยกเลิก' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Sync ข้อมูลจาก ProClinic')).toBeVisible();
  });
});
