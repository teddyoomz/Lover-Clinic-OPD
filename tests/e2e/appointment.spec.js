// ─── E2E: Appointment Tab — Calendar + CRUD ─────────────────────────────────
import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

test.describe('Appointment Tab', () => {
  test.beforeEach(async ({ page }) => {
    await goToBackend(page);
    await page.getByRole('button', { name: 'นัดหมาย' }).click();
    await page.waitForTimeout(1500);
  });

  test('shows "เพิ่มนัดหมาย" button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'เพิ่มนัดหมาย' })).toBeVisible();
  });

  test('"เพิ่มนัดหมาย" → form modal opens with required fields', async ({ page }) => {
    await page.getByRole('button', { name: 'เพิ่มนัดหมาย' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('ลูกค้า *')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('วันที่ *')).toBeVisible();
  });

  test('form validation — no customer → error message', async ({ page }) => {
    await page.getByRole('button', { name: 'เพิ่มนัดหมาย' }).click();
    await page.waitForTimeout(500);
    // Click save without selecting customer
    const saveBtn = page.getByRole('button', { name: /สร้างนัดหมาย/ });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(500);
      await expect(page.getByText('กรุณาเลือกลูกค้า')).toBeVisible({ timeout: 3000 });
    }
  });

  test('calendar renders with day headers', async ({ page }) => {
    // Mini calendar should have Thai day abbreviations
    await expect(page.locator('text=อา').first()).toBeVisible();
  });
});
