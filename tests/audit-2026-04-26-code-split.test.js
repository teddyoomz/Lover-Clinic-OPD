// ─── BackendDashboard code-split regression — 2026-04-26 ────────────────
//
// Audit P2 (perf): BackendDashboard.jsx was 1.2 MB minified due to eager
// imports of all 44 tab components. Splitting the 13 report tabs +
// DocumentTemplatesTab + QuotationTab + StaffSchedulesTab + DfGroupsTab
// via React.lazy + Suspense reduced the initial chunk to ~900 KB (-26%).
//
// This test bank locks the split so future contributors don't accidentally
// re-eager-import a heavy tab (e.g. via auto-import quick-fix).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('AC1: BackendDashboard code-split', () => {
  const SRC = READ('src/pages/BackendDashboard.jsx');

  // The 17 tabs we deliberately lazy-loaded
  const LAZY_TABS = [
    'ReportsHomeTab',
    'SaleReportTab',
    'CustomerReportTab',
    'AppointmentReportTab',
    'StockReportTab',
    'CRMInsightTab',
    'RevenueAnalysisTab',
    'AppointmentAnalysisTab',
    'DailyRevenueTab',
    'StaffSalesTab',
    'PnLReportTab',
    'DfPayoutReportTab',
    'PaymentSummaryTab',
    'DocumentTemplatesTab',
    'QuotationTab',
    // Phase 13.2.8 (2026-04-26): replaced StaffSchedulesTab with calendar-view
    // EmployeeSchedulesTab; Phase 13.2.7 added DoctorSchedulesTab.
    'EmployeeSchedulesTab',
    'DoctorSchedulesTab',
    'DfGroupsTab',
  ];

  it('AC1.1: BackendDashboard imports lazy + Suspense from react', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*\blazy\b[^}]*\bSuspense\b[^}]*\}\s*from\s*['"]react['"]/);
  });

  for (const tab of LAZY_TABS) {
    it(`AC1.2.${tab}: ${tab} declared via lazy(() => import(...))`, () => {
      const re = new RegExp(`const\\s+${tab}\\s*=\\s*lazy\\(\\(\\)\\s*=>\\s*import\\(`);
      expect(SRC).toMatch(re);
    });

    it(`AC1.3.${tab}: ${tab} NOT eagerly imported via top-level \`import X from\``, () => {
      // Catch the regression where someone restores the eager import alongside the lazy one
      const eagerRe = new RegExp(`^import\\s+${tab}\\s+from\\s+['"]`, 'm');
      expect(SRC).not.toMatch(eagerRe);
    });
  }

  it('AC1.4: Suspense fallback wraps the activeTab render area', () => {
    expect(SRC).toMatch(/<Suspense fallback=\{/);
    // Closing tag exists (basic shape check)
    expect(SRC).toMatch(/<\/Suspense>/);
  });

  it('AC1.5: Suspense fallback has a data-testid for E2E targeting', () => {
    expect(SRC).toMatch(/data-testid="backend-tab-loading"/);
  });

  it('AC1.6: ANTI-REGRESSION — always-on tabs (Clone, CustomerList, MasterData, Sale, Stock, Finance, Appointment, Promotion, Coupon, Voucher) stay eager', () => {
    // These are the entry-point tabs the user lands on — eager load is correct
    const ALWAYS_EAGER = [
      'CloneTab', 'CustomerListTab', 'MasterDataTab', 'AppointmentTab',
      'SaleTab', 'FinanceTab', 'StockTab', 'PromotionTab', 'CouponTab',
      'VoucherTab', 'BackendNav',
    ];
    for (const tab of ALWAYS_EAGER) {
      const eagerRe = new RegExp(`^import\\s+${tab}\\s+from\\s+['"]`, 'm');
      expect(SRC).toMatch(eagerRe);
      const lazyRe = new RegExp(`const\\s+${tab}\\s*=\\s*lazy\\(`);
      expect(SRC).not.toMatch(lazyRe);
    }
  });

  it('AC1.7: TreatmentFormPage stays eager (used in multiple places, lazy would block edit-on-click)', () => {
    expect(SRC).toMatch(/^import\s+TreatmentFormPage\s+from\s+['"]/m);
  });
});
