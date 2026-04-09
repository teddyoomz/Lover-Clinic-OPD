// ─── E2E: Sale Tab — CRUD + Validation ───────────────────────────────────────
import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

test.describe('Sale Tab', () => {
  test.beforeEach(async ({ page }) => {
    await goToBackend(page);
    await page.getByRole('button', { name: /ขาย/ }).click();
    await page.waitForTimeout(1500);
  });

  test('shows "สร้างใบเสร็จ" button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'สร้างใบเสร็จ' })).toBeVisible();
  });

  test('"สร้างใบเสร็จ" → form opens with customer picker', async ({ page }) => {
    await page.getByRole('button', { name: 'สร้างใบเสร็จ' }).click();
    await page.waitForTimeout(500);
    // Sale form should show customer search
    await expect(page.getByPlaceholder(/ค้นหาชื่อ/)).toBeVisible({ timeout: 3000 });
  });

  test('search bar visible in list view', async ({ page }) => {
    await expect(page.getByPlaceholder(/ค้นหาใบเสร็จ/)).toBeVisible();
  });

  test('status filter dropdown exists', async ({ page }) => {
    const filter = page.locator('select').first();
    await expect(filter).toBeVisible();
  });
});
