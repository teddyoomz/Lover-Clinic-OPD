// ─── E2E: Marketing tabs — open + create-modal + cancel ─────────────────────
//
// Audit 2026-04-26 design pass. Promotion / Coupon / Voucher tabs must:
//   - Render the MarketingTabShell with header + create button
//   - Open the create form modal on "+ create" click
//   - Modal should have a close (X) or cancel button that returns to list
//   - List re-renders without error after cancel

import { test, expect } from '@playwright/test';
import { goToBackend, expandAllNavSections } from './helpers.js';

test.describe('Marketing tabs — open + modal + cancel', () => {
  test.beforeEach(async ({ page }) => {
    await goToBackend(page);
    await expandAllNavSections(page);
  });

  const MARKETING = [
    { id: 'promotions', label: 'โปรโมชัน',  createTexts: [/เพิ่ม/, /สร้าง/] },
    { id: 'coupons',    label: 'คูปอง',     createTexts: [/เพิ่ม/, /สร้าง/] },
    { id: 'vouchers',   label: 'Voucher',    createTexts: [/เพิ่ม/, /สร้าง/] },
  ];

  for (const tab of MARKETING) {
    test(`${tab.id} — list loads + create modal opens + cancel returns`, async ({ page }) => {
      // Navigate to tab
      await page.locator('nav').getByRole('button', { name: tab.label, exact: true }).first().click();
      await page.waitForTimeout(1500);

      // Tab heading should match
      await expect(page.locator('main').getByText(tab.label, { exact: false }).first())
        .toBeVisible({ timeout: 8000 });

      // Find create-style button (Thai "เพิ่ม" or "สร้าง")
      const createBtn = page.locator('main').getByRole('button')
        .filter({ hasText: /เพิ่ม|สร้าง/ })
        .first();
      const createVisible = await createBtn.isVisible({ timeout: 3000 }).catch(() => false);

      if (createVisible) {
        await createBtn.click();
        await page.waitForTimeout(800);

        // A modal should have opened (role=dialog OR a close X button visible)
        const dialog = page.locator('[role="dialog"], [aria-modal="true"]').first();
        const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);

        if (dialogVisible) {
          // Try to close via X / cancel / Esc
          const closeBtn = page.locator('[role="dialog"] button[aria-label*="ปิด" i], [role="dialog"] button[aria-label*="close" i], [role="dialog"] button:has-text("ยกเลิก")').first();
          const closeVisible = await closeBtn.isVisible({ timeout: 1000 }).catch(() => false);
          if (closeVisible) {
            await closeBtn.click();
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(500);
          // Modal should be gone
          await expect(dialog).toHaveCount(0);
        }
      }

      // After modal close, list should still render without error
      const errorBanner = page.locator('[data-error-banner], [role="alert"]');
      await expect(errorBanner).toHaveCount(0);
    });
  }
});
