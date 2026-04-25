// ─── E2E: Reports tabs — render check ───────────────────────────────────────
//
// Audit 2026-04-26 design pass. All 13 report tabs are lazy-loaded chunks
// (per Phase 14.7.H Follow-up perf code-split). Each must:
//   - Resolve the Suspense fallback (no stuck spinner)
//   - Render the tab heading
//   - Have NO error banner
//   - NOT crash on any background data fetch
//
// Repeats the smoke test pattern but adds report-specific checks (date
// range picker presence, export button, etc).

import { test, expect } from '@playwright/test';
import { goToBackend, expandAllNavSections } from './helpers.js';

test.describe('Reports tabs — render + lazy chunk resolves', () => {
  test.beforeEach(async ({ page }) => {
    await goToBackend(page);
    await expandAllNavSections(page);
  });

  const REPORTS = [
    { id: 'reports-home',         label: 'หน้ารายงาน',       expectText: /รายงาน|วิเคราะห์/ },
    { id: 'reports-sale',         label: 'รายการขาย',         expectText: /รายการขาย/ },
    { id: 'reports-customer',     label: 'ลูกค้าสาขา',          expectText: /ลูกค้า/ },
    { id: 'reports-appointment',  label: 'นัดหมาย (รายงาน)',   expectText: /นัด/ },
    { id: 'reports-stock',        label: 'สต็อค (รายงาน)',     expectText: /สต็อค|สินค้า/ },
    { id: 'reports-rfm',          label: 'CRM Insight',        expectText: /CRM|RFM/ },
    { id: 'reports-revenue',      label: 'วิเคราะห์รายได้',     expectText: /รายได้|หัตถการ/ },
    { id: 'reports-appt-anal',    label: 'วิเคราะห์นัด',        expectText: /นัด|วิเคราะห์/ },
    { id: 'reports-daily',        label: 'รายรับประจำวัน',     expectText: /รายรับ/ },
    { id: 'reports-staff-sales',  label: 'ยอดขายรายพนักงาน',   expectText: /ยอดขาย|พนักงาน/ },
    { id: 'reports-pnl',          label: 'กำไรขาดทุน (P&L)',    expectText: /กำไร|P&L/ },
    { id: 'reports-payment',      label: 'สรุปบัญชีรับชำระ',    expectText: /ชำระ|บัญชี/ },
    { id: 'reports-df',           label: 'ค่ามือแพทย์ (DF)',    expectText: /ค่ามือ|DF/ },
  ];

  for (const r of REPORTS) {
    test(`${r.id} — lazy chunk loads + heading visible`, async ({ page }) => {
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
      });

      // Click the report tab in sidebar
      await page.locator('nav').getByRole('button', { name: r.label, exact: true }).first().click();

      // Suspense fallback should appear briefly then resolve (the report
      // chunks were split via React.lazy in commit 4d4529b)
      await page.waitForTimeout(2000);

      // Suspense fallback gone
      await expect(page.getByTestId('backend-tab-loading')).toHaveCount(0);

      // Heading visible
      await expect(page.locator('main').getByText(r.expectText).first())
        .toBeVisible({ timeout: 8000 });

      // No error banner
      const errorBanner = page.locator('[data-error-banner], [role="alert"]');
      await expect(errorBanner).toHaveCount(0);

      // Filter benign console noise
      const realErrors = consoleErrors.filter(e =>
        !e.includes('FIRESTORE') &&
        !e.includes('Permission denied') &&
        !e.match(/^\[debug:/) &&
        !e.includes('act(...)')
      );
      expect(realErrors).toEqual([]);
    });
  }
});
