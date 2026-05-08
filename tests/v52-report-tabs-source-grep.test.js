// V52 (BS-11) — Source-grep regression locks per report tab.
//
// V12 multi-reader-sweep guard: every fixed report tab must keep its
// V52 wiring (useSelectedBranch + selectedBranchId in deps + branchId
// in load* call sites + no raw backendClient imports + no stale
// {allBranches:true} annotation).
//
// Future commits that revert any tab to pre-V52 state fail this bank.
//
// Companion: tests/audit-branch-scope.test.js BS-11.x — same intent
// at the audit-skill layer; this file pins each tab individually for
// targeted git-blame trail.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const TABS_DIR = 'src/components/backend/reports';

// 13 tabs that gained V52 BS-11 wiring (previously broken)
const FIXED_TABS = [
  'SaleReportTab.jsx',
  'CustomerReportTab.jsx',
  'AppointmentReportTab.jsx',
  'StockReportTab.jsx',
  'CRMInsightTab.jsx',
  'RevenueAnalysisTab.jsx',
  'AppointmentAnalysisTab.jsx',
  'DailyRevenueTab.jsx',
  'StaffSalesTab.jsx',
  'PnLReportTab.jsx',
  'DfPayoutReportTab.jsx',
  'PaymentSummaryTab.jsx',
  'RemainingCourseTab.jsx',
];

// 2 sanctioned in-page-selector tabs (kept their existing in-page UI)
const INPAGE_SELECTOR_TABS = [
  'ExpenseReportTab.jsx',
  'ClinicReportTab.jsx',
];

// 1 sanctioned navigation-only tab (no data load)
const NAV_ONLY_TABS = ['ReportsHomeTab.jsx'];

function readTab(name) {
  const path = `${TABS_DIR}/${name}`;
  if (!existsSync(path)) throw new Error(`Test setup: ${path} missing`);
  return readFileSync(path, 'utf8');
}

// ─── G1 — V52 wiring per fixed tab ─────────────────────────────────────────

describe('G1 — Per-tab V52 wiring (13 fixed tabs)', () => {
  for (const tab of FIXED_TABS) {
    describe(tab, () => {
      let content;
      it('reads file', () => {
        content = readTab(tab);
        expect(content.length).toBeGreaterThan(0);
      });

      it('imports useSelectedBranch from BranchContext', () => {
        content = readTab(tab);
        expect(content).toMatch(/import\s+\{\s*useSelectedBranch\s*\}\s+from\s+['"][^'"]*BranchContext/);
      });

      it('destructures branchId: selectedBranchId from useSelectedBranch()', () => {
        content = readTab(tab);
        expect(content).toMatch(/const\s*\{\s*branchId\s*:\s*selectedBranchId\s*\}\s*=\s*useSelectedBranch\(\)/);
      });

      it('passes branchId: selectedBranchId to at least one load* call', () => {
        content = readTab(tab);
        expect(content).toMatch(/load[A-Z][A-Za-z]+\(\s*\{[^}]*\bbranchId\s*:\s*selectedBranchId/);
      });

      it('includes selectedBranchId in at least one useEffect/useCallback deps array', () => {
        content = readTab(tab);
        const re = /(useCallback|useEffect)\([\s\S]+?\},\s*\[[^\]]*\bselectedBranchId\b[^\]]*\]/;
        expect(content).toMatch(re);
      });

      it('does NOT contain stale `audit-branch-scope: report — uses {allBranches:true}` annotation', () => {
        content = readTab(tab);
        const stale = /audit-branch-scope:\s*report\s*[—-]\s*uses\s*\{allBranches:true\}/;
        expect(content).not.toMatch(stale);
      });

      it('does NOT import directly from backendClient (BS-1 mirror)', () => {
        content = readTab(tab);
        const rawImport = /from\s+['"]\.\.\/\.\.\/\.\.\/lib\/backendClient/;
        expect(content).not.toMatch(rawImport);
      });

      it('contains V52 marker comment for institutional memory', () => {
        content = readTab(tab);
        expect(content).toMatch(/V52|BS-11/);
      });
    });
  }
});

// ─── G2 — Sanctioned in-page-selector tabs ─────────────────────────────────

describe('G2 — In-page-selector exempted tabs (ExpenseReport + ClinicReport)', () => {
  for (const tab of INPAGE_SELECTOR_TABS) {
    it(`${tab} carries BS-11 in-page-selector annotation`, () => {
      const content = readTab(tab);
      expect(content).toMatch(/audit-branch-scope:\s*BS-11 in-page-selector/);
    });

    it(`${tab} does NOT have stale {allBranches:true} annotation`, () => {
      const content = readTab(tab);
      const stale = /audit-branch-scope:\s*report\s*[—-]\s*uses\s*\{allBranches:true\}/;
      expect(content).not.toMatch(stale);
    });

    it(`${tab} still subscribes to useSelectedBranch (in-page UI uses it)`, () => {
      const content = readTab(tab);
      expect(content).toMatch(/useSelectedBranch/);
    });
  }
});

// ─── G3 — Sanctioned navigation-only tab ───────────────────────────────────

describe('G3 — Navigation-only exempted tab (ReportsHomeTab)', () => {
  for (const tab of NAV_ONLY_TABS) {
    it(`${tab} carries BS-11 navigation-only annotation`, () => {
      const content = readTab(tab);
      expect(content).toMatch(/audit-branch-scope:\s*BS-11 navigation-only/);
    });

    it(`${tab} does NOT import reportsLoaders (no data load)`, () => {
      const content = readTab(tab);
      const loaderImport = /from\s+['"][^'"]*reportsLoaders/;
      expect(content).not.toMatch(loaderImport);
    });
  }
});

// ─── G4 — Cross-cutting universal invariants ───────────────────────────────

describe('G4 — Cross-cutting V52 invariants across all report tabs', () => {
  const ALL_TABS = [...FIXED_TABS, ...INPAGE_SELECTOR_TABS, ...NAV_ONLY_TABS];

  it('G4.1 no report tab has stale `audit-branch-scope: report` annotation', () => {
    const stale = /audit-branch-scope:\s*report\s*[—-]\s*uses\s*\{allBranches:true\}/;
    const violations = ALL_TABS.filter((t) => stale.test(readTab(t)));
    expect(violations).toEqual([]);
  });

  it('G4.2 every fixed tab does NOT import raw backendClient', () => {
    const rawImport = /from\s+['"]\.\.\/\.\.\/\.\.\/lib\/backendClient/;
    const violations = FIXED_TABS.filter((t) => rawImport.test(readTab(t)));
    expect(violations).toEqual([]);
  });

  it('G4.3 every fixed tab imports useSelectedBranch', () => {
    const violations = FIXED_TABS.filter((t) => !readTab(t).includes('useSelectedBranch'));
    expect(violations).toEqual([]);
  });

  it('G4.4 only 3 tabs carry any BS-11 annotation (Expense + Clinic + Reports)', () => {
    const ALL_REPORT_TABS = [...FIXED_TABS, ...INPAGE_SELECTOR_TABS, ...NAV_ONLY_TABS];
    const annotated = ALL_REPORT_TABS.filter((t) => /audit-branch-scope:\s*BS-11/.test(readTab(t)));
    expect(annotated.sort()).toEqual([...INPAGE_SELECTOR_TABS, ...NAV_ONLY_TABS].sort());
  });
});
