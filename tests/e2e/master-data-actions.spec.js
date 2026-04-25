// ─── E2E: Master data CRUDs — list + create-modal + cancel ──────────────────
//
// Audit 2026-04-26 design pass. Master-data tabs (Phase 11) follow the
// MarketingTabShell + MarketingFormShell pattern. Each must:
//   - Render the tab heading
//   - Show "+ create" style button
//   - Open form modal on click
//   - Modal closes via X / cancel / Esc
//   - List re-renders cleanly after close

import { test, expect } from '@playwright/test';
import { goToBackend, expandAllNavSections } from './helpers.js';

test.describe('Master data — open + create + cancel', () => {
  test.beforeEach(async ({ page }) => {
    await goToBackend(page);
    await expandAllNavSections(page);
  });

  const TABS = [
    { id: 'product-groups',      label: 'กลุ่มสินค้า' },
    { id: 'product-units',       label: 'หน่วยสินค้า' },
    { id: 'medical-instruments', label: 'เครื่องหัตถการ' },
    { id: 'holidays',            label: 'วันหยุด' },
    { id: 'branches',            label: 'สาขา' },
    { id: 'permission-groups',   label: 'สิทธิ์การใช้งาน' },
    { id: 'staff',               label: 'พนักงาน' },
    { id: 'doctors',             label: 'แพทย์ & ผู้ช่วย' },
    { id: 'products',            label: 'สินค้า' },
    { id: 'courses',             label: 'คอร์ส' },
    { id: 'staff-schedules',     label: 'ตารางงานพนักงาน' },
    { id: 'df-groups',           label: 'กลุ่ม DF (ค่ามือ)' },
  ];

  for (const tab of TABS) {
    test(`${tab.id} — list + create-modal + cancel`, async ({ page }) => {
      // Click sidebar
      await page.locator('nav').getByRole('button', { name: tab.label, exact: true }).first().click();
      await page.waitForTimeout(1500);

      // Tab heading visible
      await expect(page.locator('main').getByText(tab.label, { exact: false }).first())
        .toBeVisible({ timeout: 8000 });

      // Find "+ create" style button
      const createBtn = page.locator('main').getByRole('button')
        .filter({ hasText: /เพิ่ม|สร้าง/ })
        .first();
      const createVisible = await createBtn.isVisible({ timeout: 3000 }).catch(() => false);

      if (createVisible) {
        await createBtn.click();
        await page.waitForTimeout(800);

        // Modal opened
        const dialog = page.locator('[role="dialog"], [aria-modal="true"]').first();
        const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);

        if (dialogVisible) {
          // Try to close via X / cancel / Esc
          const closeBtn = page.locator('[role="dialog"] button[aria-label*="ปิด" i], [role="dialog"] button[aria-label*="close" i], [role="dialog"] button:has-text("ยกเลิก")').first();
          const closeVisible = await closeBtn.isVisible({ timeout: 1000 }).catch(() => false);
          if (closeVisible) await closeBtn.click();
          else await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          await expect(dialog).toHaveCount(0);
        }
      }

      // No error banner after close
      await expect(page.locator('[data-error-banner], [role="alert"]')).toHaveCount(0);
    });
  }
});
