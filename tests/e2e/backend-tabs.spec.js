// ─── E2E: Backend Tab Navigation ─────────────────────────────────────────────
import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

test.describe('Backend Dashboard — Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await goToBackend(page);
  });

  test('shows all 5 tab buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Clone ลูกค้า' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ข้อมูลลูกค้า' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ข้อมูลพื้นฐาน' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'นัดหมาย' })).toBeVisible();
    await expect(page.getByRole('button', { name: /ขาย/ })).toBeVisible();
  });

  test('default tab is Clone — has search input', async ({ page }) => {
    await expect(page.getByPlaceholder(/ค้นหา HN/)).toBeVisible();
  });

  test('click ข้อมูลลูกค้า → shows customer list', async ({ page }) => {
    await page.getByRole('button', { name: 'ข้อมูลลูกค้า' }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByPlaceholder(/ค้นหาลูกค้าในระบบ/)).toBeVisible();
  });

  test('click ข้อมูลพื้นฐาน → shows sync section', async ({ page }) => {
    await page.getByRole('button', { name: 'ข้อมูลพื้นฐาน' }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('Sync ข้อมูลจาก ProClinic')).toBeVisible();
  });

  test('click นัดหมาย → shows calendar', async ({ page }) => {
    await page.getByRole('button', { name: 'นัดหมาย' }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('button', { name: 'เพิ่มนัดหมาย' })).toBeVisible();
  });

  test('click ขาย → shows sale section', async ({ page }) => {
    await page.getByRole('button', { name: /ขาย/ }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('button', { name: 'สร้างใบเสร็จ' })).toBeVisible();
  });

  test('deep link ?customer=2853 → shows customer detail', async ({ page }) => {
    await page.goto('/?backend=1&customer=2853');
    await page.waitForTimeout(3000);
    await expect(page.getByText('ประวัติการรักษา')).toBeVisible({ timeout: 10000 });
  });
});
