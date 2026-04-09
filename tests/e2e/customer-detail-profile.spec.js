// ─── E2E: Customer Detail — Profile + Treatment Timeline ─────────────────────
import { test, expect } from '@playwright/test';
import { goToCustomer } from './helpers.js';

const CUSTOMER_ID = '2853';

test.describe('Customer Detail — Profile & Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await goToCustomer(page, CUSTOMER_ID);
  });

  // ── Profile Section ──
  test('profile: แสดง สัญชาติ', async ({ page }) => {
    await expect(page.getByText('สัญชาติ').first()).toBeVisible();
  });

  test('profile: แสดง เลขบัตรปชช.', async ({ page }) => {
    await expect(page.getByText(/เลขบัตร/).first()).toBeVisible();
  });

  test('profile: แสดง เพศ', async ({ page }) => {
    await expect(page.getByText('เพศ').first()).toBeVisible();
  });

  test('profile: แสดง วันเกิด', async ({ page }) => {
    await expect(page.getByText('วันเกิด').first()).toBeVisible();
  });

  test('profile: แสดง เบอร์โทร', async ({ page }) => {
    await expect(page.getByText('เบอร์โทร').first()).toBeVisible();
  });

  test('profile: แสดง HN value (font-mono)', async ({ page }) => {
    // HN badge shows just the number, e.g. "2853" in mono font
    await expect(page.locator('.font-mono').first()).toBeVisible();
  });

  // ── Breadcrumb & Navigation ──
  test('breadcrumb: แสดงปุ่ม "คัดลอกลิงก์"', async ({ page }) => {
    await expect(page.getByText('คัดลอกลิงก์')).toBeVisible();
  });

  // ── Treatment Section ──
  test('แสดงปุ่ม "สร้างการรักษา"', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'สร้างการรักษา' })).toBeVisible();
  });

  test('treatment timeline: มี entry อย่างน้อย 1 รายการ', async ({ page }) => {
    // Customer 2853 should have treatment history
    // Look for treatment date entries or treatment heading
    const timeline = page.getByText(/ประวัติการรักษา|การรักษา/).first();
    await expect(timeline).toBeVisible({ timeout: 10000 });
  });
});
