# Phase 16.2 Clinic Report Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a NEW Clinic Report tab — read-only consolidator dashboard with 12 widgets (revenue / customers / retention / top-10 services·doctors·products / branch comparison / cash flow / expense ratio / appt fill / no-show / course util) for clinic leadership.

**Architecture:** Orchestrator pattern — NEW `clinicReportAggregator.js` fans out via `Promise.all` to 8 reused aggregators + 3 NEW pure helpers (retention cohort + branch comparison + KPI tiles). Single `useClinicReport` hook holds smart hybrid cache. NEW `ClinicReportTab` + `ClinicReportSidebar` + ~5 widget partials. **Zero edits to existing aggregators or detail report tabs** (Rule E + user constraint "ห้ามเปลี่ยน wiring เดิม").

**Tech Stack:** React 19 + Vite 8 + Firebase Firestore + Tailwind 3.4 + Vitest 4.1 + RTL. Reused: existing `aggregate*Report` functions + `FancyCharts` (custom SVG) + `documentPrintEngine` (PDF) + `useTabAccess` + `useSelectedBranch` + `useSystemConfig`.

**Spec**: `docs/superpowers/specs/2026-04-29-phase16-2-clinic-report-design.md`

---

## Pre-flight

- [ ] **Step P.1: Confirm working tree clean + on master**

```bash
git status
git rev-parse HEAD
```

Expected: `working tree clean` · HEAD = `ced094d` (or descendant — Phase 16.3-bis fix).

- [ ] **Step P.2: Confirm test baseline green**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: `Test Files  N passed | ... | Tests  3771 passed (3771)` (or +N from later commits — must all pass).

- [ ] **Step P.3: Confirm build clean**

```bash
npm run build 2>&1 | tail -5
```

Expected: `dist/` produced, no `MISSING_EXPORT` / `ROLLUP_*` errors.

---

## File Structure

### NEW files (created by this plan)

| Path | Purpose |
|---|---|
| `src/lib/clinicReportAggregator.js` | Orchestrator facade: fetch raw collections + Promise.all 8 aggregators + 3 cross-aggregator helpers + merge → `ClinicReportSnapshot` |
| `src/lib/clinicReportHelpers.js` | 3 pure helpers: `computeKpiTiles` / `computeRetentionCohort` / `computeBranchComparison` (hoisted out of orchestrator for testability) |
| `src/lib/clinicReportCsv.js` | CSV export builder · UTF-8 BOM · per-widget sections · Thai-friendly |
| `src/hooks/useClinicReport.js` | Smart hybrid cache hook · filter-keyed Map · auto-invalidate · manual refresh |
| `src/components/backend/reports/ClinicReportTab.jsx` | Root tab · permission gate · branch context · sidebar + widget grid |
| `src/components/backend/reports/ClinicReportSidebar.jsx` | Sticky filter rail · branch checkbox · preset buttons + custom range · category toggles · export buttons · refresh |
| `src/components/backend/reports/widgets/KpiTile.jsx` | 8 instances · single-number tile + optional sparkline + drilldown link |
| `src/components/backend/reports/widgets/RankedTableWidget.jsx` | 3 instances · Top-10 list + numbered rows + drilldown link |
| `src/components/backend/reports/widgets/RetentionHeatmapWidget.jsx` | 1 instance · cohort heatmap (NEW custom SVG) |
| `src/components/backend/reports/widgets/BranchComparisonWidget.jsx` | 1 instance · grouped bars (uses `AreaSparkline` + custom inline) |
| `tests/phase16.2-clinic-report-helpers.test.js` | Unit tests for 3 pure helpers (~25) |
| `tests/phase16.2-clinic-report-aggregator.test.js` | Orchestrator orchestration test (~10) |
| `tests/phase16.2-clinic-report-csv.test.js` | CSV builder test (~10) |
| `tests/phase16.2-use-clinic-report.test.js` | Hook test with renderHook (~10) |
| `tests/phase16.2-clinic-report-sidebar.test.jsx` | Sidebar RTL (~5) |
| `tests/phase16.2-clinic-report-tab.test.jsx` | Tab RTL (~5) |
| `tests/phase16.2-clinic-report-flow-simulate.test.js` | Full-flow simulate per Rule I (~10) |

### Edited files (purely additive)

| Path | Change |
|---|---|
| `src/lib/permissionGroupValidation.js` | Add `{ key: 'report_clinic_summary', label: 'รายงานคลินิก (ภาพรวมผู้บริหาร)' }` to "รายงาน" group |
| `src/lib/tabPermissions.js` | Add `'clinic-report': { requires: ['report_clinic_summary'] }` to `TAB_PERMISSION_MAP` |
| `src/components/backend/nav/navConfig.js` | Add `{ id: 'clinic-report', label: 'รายงานคลินิก', icon: BarChart3, color: 'amber', palette: 'clinic report ภาพรวม executive dashboard kpi' }` to reports section |
| `src/pages/BackendDashboard.jsx` | Lazy import + render case for `'clinic-report'` |
| `CODEBASE_MAP.md` | Document the 9 new files |
| `SESSION_HANDOFF.md` | Phase 16.2 entry |

### Reused unchanged

`src/lib/{revenueAnalysisAggregator,customerReportAggregator,saleReportAggregator,staffSalesAggregator,stockReportAggregator,pnlReportAggregator,appointmentReportAggregator,appointmentAnalysisAggregator}.js` · `src/lib/backendClient.js` (read-only fetch fns) · `src/components/backend/reports/{FancyCharts,FancyDonut,ChartSection,ReportShell}.jsx` · `src/lib/documentPrintEngine.js` · `src/hooks/useTabAccess.js` · `src/lib/BranchContext.jsx` · `src/utils.js` · `src/lib/financeUtils.js`.

---

## Task 1: Permission key + tab gate scaffolding

**Files:**
- Modify: `src/lib/permissionGroupValidation.js:213` (add 1 row to `report_*` block)
- Modify: `src/lib/tabPermissions.js:60` (add 1 entry)
- Test: `tests/phase16.2-clinic-report-helpers.test.js` (new file, P1 group only — rest filled in later tasks)

- [ ] **Step 1.1: Write the failing test**

Create `tests/phase16.2-clinic-report-helpers.test.js`:

```js
// tests/phase16.2-clinic-report-helpers.test.js — Phase 16.2 Clinic Report tests
import { describe, it, expect } from 'vitest';
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_GROUP_DEFINITIONS,
} from '../src/lib/permissionGroupValidation.js';
import { TAB_PERMISSION_MAP } from '../src/lib/tabPermissions.js';

describe('P1 Clinic Report — permission key + tab gate', () => {
  it('P1.1 — report_clinic_summary key registered in รายงาน group', () => {
    const reportGroup = PERMISSION_GROUP_DEFINITIONS.find(g => g.label === 'รายงาน');
    expect(reportGroup).toBeTruthy();
    const key = reportGroup.keys.find(k => k.key === 'report_clinic_summary');
    expect(key).toBeTruthy();
    expect(key.label).toMatch(/รายงานคลินิก/);
  });

  it('P1.2 — report_clinic_summary appears in ALL_PERMISSION_KEYS', () => {
    expect(ALL_PERMISSION_KEYS).toContain('report_clinic_summary');
  });

  it('P1.3 — clinic-report tab gates on report_clinic_summary', () => {
    const gate = TAB_PERMISSION_MAP['clinic-report'];
    expect(gate).toBeTruthy();
    expect(gate.requires).toEqual(['report_clinic_summary']);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
npm test -- --run tests/phase16.2-clinic-report-helpers.test.js 2>&1 | tail -15
```

Expected: 3/3 FAIL with "report_clinic_summary not in keys" / "TAB_PERMISSION_MAP['clinic-report'] is undefined".

- [ ] **Step 1.3: Add the permission key**

Read `src/lib/permissionGroupValidation.js` around line 213 (where `report_remaining_course` lives). Insert the new row keeping alphabetical-ish order:

```js
      { key: 'report_remaining_course',                     label: 'รายงานคอร์สคงเหลือ' },
      { key: 'report_clinic_summary',                       label: 'รายงานคลินิก (ภาพรวมผู้บริหาร)' },
      { key: 'report_vendor_sales',                         label: 'รายงานขายสินค้าในสต็อค' },
```

(Use `Edit` tool with `old_string` containing the surrounding context lines for unique match.)

- [ ] **Step 1.4: Add the tab gate**

In `src/lib/tabPermissions.js`, find the existing block of `'reports-*'` entries (~lines 51-60). Insert AFTER `'reports-pnl'`:

```js
  'reports-pnl':         { requires: ['expense_view', 'expense_management'] },
  'clinic-report':       { requires: ['report_clinic_summary'] },
```

- [ ] **Step 1.5: Run test to verify pass**

```bash
npm test -- --run tests/phase16.2-clinic-report-helpers.test.js 2>&1 | tail -15
```

Expected: 3/3 PASS.

- [ ] **Step 1.6: Run full suite + build to confirm no regression**

```bash
npm test -- --run 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

Expected: full suite PASS (3774 = 3771 + 3 new) · build clean.

- [ ] **Step 1.7: NO commit yet** — bundle later (per user "wait until implementation lands and bundle the spec into that commit").

---

## Task 2: Helper — `computeKpiTiles`

**Files:**
- Create: `src/lib/clinicReportHelpers.js`
- Test: `tests/phase16.2-clinic-report-helpers.test.js` (extend existing file)

- [ ] **Step 2.1: Add the failing test (P2 group)**

Append to `tests/phase16.2-clinic-report-helpers.test.js`:

```js
import { computeKpiTiles } from '../src/lib/clinicReportHelpers.js';

describe('P2 computeKpiTiles', () => {
  // Fixture: 6 months sales, 2 branches
  const sales = [
    // 2025-11
    { id: 's1', saleDate: '2025-11-05', total: 5000, status: 'paid', branchId: 'BR-A', customerId: 'c1' },
    { id: 's2', saleDate: '2025-11-15', total: 3000, status: 'paid', branchId: 'BR-B', customerId: 'c2' },
    // 2025-12
    { id: 's3', saleDate: '2025-12-10', total: 8000, status: 'paid', branchId: 'BR-A', customerId: 'c1' },
    // 2026-04
    { id: 's4', saleDate: '2026-04-20', total: 12000, status: 'paid', branchId: 'BR-A', customerId: 'c3' },
    // cancelled — excluded
    { id: 's5', saleDate: '2026-04-22', total: 99999, status: 'cancelled', branchId: 'BR-A', customerId: 'c4' },
  ];
  const customers = [
    { id: 'c1', createdAt: '2025-10-15', branchId: 'BR-A' },
    { id: 'c2', createdAt: '2025-11-15', branchId: 'BR-B' },
    { id: 'c3', createdAt: '2026-04-19', branchId: 'BR-A' },
    { id: 'c4', createdAt: '2026-04-22', branchId: 'BR-A' },
  ];
  const expenses = [
    { id: 'e1', expenseDate: '2026-04-15', amount: 4000 },
  ];
  const filter = { from: '2025-11-01', to: '2026-04-30' };

  it('P2.1 — revenueYtd sums non-cancelled sales in range', () => {
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    // 5000 + 3000 + 8000 + 12000 = 28000 (s5 cancelled excluded)
    expect(t.revenueYtd).toBe(28000);
  });

  it('P2.2 — momGrowth percent = (currentMonth − prevMonth) / prevMonth', () => {
    // currentMonth = 2026-04 = 12000 ; prevMonth = 2026-03 = 0
    // Growth from 0 = Infinity — clamp to null per design
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    expect(t.momGrowth === null || t.momGrowth === Infinity).toBe(true);
  });

  it('P2.3 — newCustomersPerMonth = customers.createdAt in range / months', () => {
    // 4 customers in range across 6 months ≈ 0.67/month
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    expect(t.newCustomersPerMonth).toBeCloseTo(4 / 6, 1);
  });

  it('P2.4 — avgTicket = revenue / non-cancelled sale count', () => {
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    expect(t.avgTicket).toBeCloseTo(28000 / 4, 0);
  });

  it('P2.5 — expenseRatio = expenses / revenue × 100', () => {
    // expenses 4000 / revenue 28000 = 14.28%
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    expect(t.expenseRatio).toBeCloseTo(14.28, 1);
  });

  it('P2.6 — empty sales → tiles all zeros / null growth', () => {
    const t = computeKpiTiles({ sales: [], customers: [], expenses: [], filter });
    expect(t.revenueYtd).toBe(0);
    expect(t.avgTicket).toBe(0);
    expect(t.momGrowth).toBeNull();
    expect(t.expenseRatio).toBe(0);
  });

  it('P2.7 — branchIds filter clamps sales', () => {
    const t = computeKpiTiles({
      sales, customers, expenses,
      filter: { ...filter, branchIds: ['BR-A'] }
    });
    // Only BR-A: 5000 + 8000 + 12000 = 25000 (s2 BR-B excluded)
    expect(t.revenueYtd).toBe(25000);
  });

  it('P2.8 — never returns undefined values (V14 lock)', () => {
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    for (const [k, v] of Object.entries(t)) {
      expect(v, `${k} must not be undefined`).not.toBeUndefined();
    }
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
npm test -- --run tests/phase16.2-clinic-report-helpers.test.js 2>&1 | tail -10
```

Expected: P2.1-P2.8 FAIL with "Failed to resolve import '../src/lib/clinicReportHelpers.js'".

- [ ] **Step 2.3: Create `src/lib/clinicReportHelpers.js` with `computeKpiTiles`**

```js
// ─── Clinic Report pure helpers — Phase 16.2 (2026-04-29) ──────────────────
//
// 3 helpers hoisted out of clinicReportAggregator for testability:
//   1. computeKpiTiles({sales, customers, expenses, filter}) → 8-tile snapshot
//   2. computeRetentionCohort({sales, customers, filter})    → cohort matrix
//   3. computeBranchComparison({sales, branches, filter})    → per-branch rows
//
// All pure — no Firestore imports, deterministic given inputs.
// V14-aware: never return `undefined` (Firestore setDoc rejects them).
// Filter shape: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', branchIds?: string[] }
//
// Iron-clad refs:
//   AR1 (date range)  AR3 (cancelled excluded)  AR4 (currency rounding)
//   AR15 (pure)       V14 (no undefined leaves)

import { roundTHB } from './reportsUtils.js';

/** Filter sales by date range + optional branchIds + non-cancelled. */
function filterSalesForReport(sales, { from, to, branchIds }) {
  if (!Array.isArray(sales)) return [];
  const branchSet = Array.isArray(branchIds) && branchIds.length
    ? new Set(branchIds.map(String))
    : null;
  return sales.filter(s => {
    if (!s || s.status === 'cancelled') return false;
    const d = String(s.saleDate || s.createdAt || '').slice(0, 10);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (branchSet && !branchSet.has(String(s.branchId))) return false;
    return true;
  });
}

/** Number of full months covered by [from, to] inclusive. */
function monthsBetween(from, to) {
  if (!from || !to) return 1;
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

/**
 * Compute the 8 KPI tiles shown above the chart row.
 *
 * Returns:
 *   {
 *     revenueYtd:            number — sum of non-cancelled sales in range
 *     momGrowth:             number|null — percent growth current-month vs previous-month; null if prev=0
 *     newCustomersPerMonth:  number — customers.createdAt in range / months in range
 *     retentionRate:         number — % returning customers (acquired N+1 months ago, made another sale by now)
 *     avgTicket:             number — revenue / non-cancelled sale count
 *     courseUtilization:     number — caller-provided since needs be_customers[].courses[]
 *     noShowRate:            number — caller-provided since needs appointmentAnalysis output
 *     expenseRatio:          number — expenses / revenue × 100
 *   }
 *
 * Helpers that NEED upstream data (course utilization, no-show rate) accept
 * those numbers via the optional `derived` param so the orchestrator can
 * inject them after appointmentAnalysisAggregator + course derivation run.
 */
export function computeKpiTiles({
  sales = [],
  customers = [],
  expenses = [],
  filter = {},
  derived = {},
} = {}) {
  const filtered = filterSalesForReport(sales, filter);

  const revenueYtd = roundTHB(filtered.reduce((s, x) => s + (Number(x.total) || 0), 0));
  const saleCount = filtered.length;
  const avgTicket = saleCount > 0 ? roundTHB(revenueYtd / saleCount) : 0;

  // Month-over-month growth: compare last month in range vs prior month.
  const months = monthsBetween(filter.from || '', filter.to || '');
  const monthBuckets = {};
  for (const s of filtered) {
    const k = String(s.saleDate || s.createdAt || '').slice(0, 7);
    if (!k) continue;
    monthBuckets[k] = (monthBuckets[k] || 0) + (Number(s.total) || 0);
  }
  const monthKeys = Object.keys(monthBuckets).sort();
  const lastMonth = monthKeys.length > 0 ? monthBuckets[monthKeys[monthKeys.length - 1]] : 0;
  const prevMonth = monthKeys.length > 1 ? monthBuckets[monthKeys[monthKeys.length - 2]] : 0;
  const momGrowth = prevMonth > 0
    ? roundTHB(((lastMonth - prevMonth) / prevMonth) * 100)
    : null;

  // New customers in range
  const branchSet = Array.isArray(filter.branchIds) && filter.branchIds.length
    ? new Set(filter.branchIds.map(String))
    : null;
  const newCustomersInRange = (customers || []).filter(c => {
    const d = String(c.createdAt || '').slice(0, 10);
    if (!d) return false;
    if (filter.from && d < filter.from) return false;
    if (filter.to && d > filter.to) return false;
    if (branchSet && c.branchId && !branchSet.has(String(c.branchId))) return false;
    return true;
  }).length;
  const newCustomersPerMonth = newCustomersInRange / months;

  // Expense ratio
  const expensesInRange = (expenses || []).filter(e => {
    const d = String(e.expenseDate || e.createdAt || '').slice(0, 10);
    if (!d) return false;
    if (filter.from && d < filter.from) return false;
    if (filter.to && d > filter.to) return false;
    return true;
  });
  const expenseTotal = expensesInRange.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const expenseRatio = revenueYtd > 0 ? roundTHB((expenseTotal / revenueYtd) * 100) : 0;

  return {
    revenueYtd,
    momGrowth,
    newCustomersPerMonth: roundTHB(newCustomersPerMonth),
    retentionRate: Number(derived.retentionRate ?? 0),
    avgTicket,
    courseUtilization: Number(derived.courseUtilization ?? 0),
    noShowRate: Number(derived.noShowRate ?? 0),
    expenseRatio,
  };
}
```

Note: `roundTHB` already exists in `src/lib/reportsUtils.js` — verified in revenueAnalysisAggregator.js:28. Don't redefine.

- [ ] **Step 2.4: Run test to verify pass**

```bash
npm test -- --run tests/phase16.2-clinic-report-helpers.test.js 2>&1 | tail -12
```

Expected: P1 + P2 = 11/11 PASS.

---

## Task 3: Helper — `computeRetentionCohort`

**Files:**
- Modify: `src/lib/clinicReportHelpers.js` (add export)
- Test: `tests/phase16.2-clinic-report-helpers.test.js` (extend)

- [ ] **Step 3.1: Add failing test (P3 group)**

Append to `tests/phase16.2-clinic-report-helpers.test.js`:

```js
import { computeRetentionCohort } from '../src/lib/clinicReportHelpers.js';

describe('P3 computeRetentionCohort', () => {
  // Cohort design:
  //   - rows = acquisition month (customer.createdAt → YYYY-MM)
  //   - cols = months-since-acquisition (0, 1, 2, 3, ...)
  //   - cell = % of cohort that made another sale in that offset month
  //   - cell at offset 0 = 100% by definition (acquisition sale)

  const customers = [
    { id: 'c1', createdAt: '2025-11-05', branchId: 'BR-A' }, // cohort 2025-11
    { id: 'c2', createdAt: '2025-11-20', branchId: 'BR-A' }, // cohort 2025-11
    { id: 'c3', createdAt: '2025-12-10', branchId: 'BR-A' }, // cohort 2025-12
    { id: 'c4', createdAt: '2026-01-05', branchId: 'BR-A' }, // cohort 2026-01
  ];

  const sales = [
    // c1 acquisition + 2 follow-ups
    { id: 's1', customerId: 'c1', saleDate: '2025-11-05', total: 5000, status: 'paid' },
    { id: 's2', customerId: 'c1', saleDate: '2025-12-15', total: 2000, status: 'paid' }, // offset 1
    { id: 's3', customerId: 'c1', saleDate: '2026-01-20', total: 3000, status: 'paid' }, // offset 2
    // c2 only acquisition
    { id: 's4', customerId: 'c2', saleDate: '2025-11-20', total: 4000, status: 'paid' },
    // c3 acquisition + 1 follow-up
    { id: 's5', customerId: 'c3', saleDate: '2025-12-10', total: 6000, status: 'paid' },
    { id: 's6', customerId: 'c3', saleDate: '2026-01-25', total: 1500, status: 'paid' }, // offset 1
    // c4 acquisition
    { id: 's7', customerId: 'c4', saleDate: '2026-01-05', total: 8000, status: 'paid' },
  ];

  it('P3.1 — cohort rows = unique acquisition months in range', () => {
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    expect(m.rows.map(r => r.cohort).sort()).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('P3.2 — offset-0 retention always 100%', () => {
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    for (const row of m.rows) {
      expect(row.cells[0]).toBe(100);
    }
  });

  it('P3.3 — 2025-11 cohort offset 1 = 50% (c1 returned, c2 did not)', () => {
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    const cohort = m.rows.find(r => r.cohort === '2025-11');
    expect(cohort.cells[1]).toBe(50);
  });

  it('P3.4 — 2025-12 cohort offset 1 = 100% (c3 returned)', () => {
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    const cohort = m.rows.find(r => r.cohort === '2025-12');
    expect(cohort.cells[1]).toBe(100);
  });

  it('P3.5 — overall retentionRate aggregate across all cohorts', () => {
    // Customers with 2+ months data: c1 (returned), c2 (did NOT), c3 (returned).
    // c4 (only Jan) has no offset-1 month possible relative to to=2026-04 → COUNTED  if 1+ followups within possible window
    // Aggregate: 2 / 3 = 66.67%
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    expect(m.overallRate).toBeCloseTo(66.67, 1);
  });

  it('P3.6 — empty inputs return empty matrix + overallRate 0', () => {
    const m = computeRetentionCohort({ sales: [], customers: [], filter: { from: '2025-11-01', to: '2026-04-30' } });
    expect(m.rows).toEqual([]);
    expect(m.overallRate).toBe(0);
  });

  it('P3.7 — cancelled sales never count as returning visit', () => {
    const cancelledFollowup = [
      ...sales,
      { id: 'sX', customerId: 'c2', saleDate: '2025-12-10', total: 999, status: 'cancelled' },
    ];
    const m = computeRetentionCohort({ sales: cancelledFollowup, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    const cohort = m.rows.find(r => r.cohort === '2025-11');
    expect(cohort.cells[1]).toBe(50); // c2's cancelled doesn't bump
  });

  it('P3.8 — V14 — no undefined leaves', () => {
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    for (const row of m.rows) {
      expect(row.cohort).not.toBeUndefined();
      expect(row.cohortSize).not.toBeUndefined();
      for (const c of row.cells) {
        expect(c, `cell must be number, got ${c}`).not.toBeUndefined();
      }
    }
  });
});
```

- [ ] **Step 3.2: Run test → expect P3.1-P3.8 fail**

```bash
npm test -- --run tests/phase16.2-clinic-report-helpers.test.js -t "P3" 2>&1 | tail -10
```

Expected: 8/8 FAIL with "computeRetentionCohort is not exported".

- [ ] **Step 3.3: Add `computeRetentionCohort` to `clinicReportHelpers.js`**

Append to existing file:

```js
/**
 * Cohort retention matrix: rows = acquisition month, cols = months-since.
 * Cell value = % of cohort that made another (non-cancelled) sale in offset month.
 * Offset 0 = 100% by definition (the acquisition sale).
 *
 * Returns:
 *   {
 *     rows: [{ cohort: 'YYYY-MM', cohortSize: number, cells: number[] }, ...],
 *     overallRate: number — aggregate % of customers with 2+ visits, across cohorts where +1 month is reachable
 *   }
 */
export function computeRetentionCohort({ sales = [], customers = [], filter = {} } = {}) {
  const { from = '', to = '' } = filter;
  if (!from || !to) return { rows: [], overallRate: 0 };

  // 1. Group customers by acquisition month
  const cohorts = new Map(); // 'YYYY-MM' → Set<customerId>
  for (const c of customers) {
    const cm = String(c.createdAt || '').slice(0, 7);
    if (!cm) continue;
    if (cm + '-01' < from || cm + '-31' > to) continue;
    if (!cohorts.has(cm)) cohorts.set(cm, new Set());
    cohorts.get(cm).add(String(c.id));
  }

  // 2. Per-customer set of months they had non-cancelled sales
  const visitMonths = new Map(); // customerId → Set<'YYYY-MM'>
  for (const s of sales) {
    if (!s || s.status === 'cancelled') continue;
    const cid = String(s.customerId || '');
    const sm = String(s.saleDate || '').slice(0, 7);
    if (!cid || !sm) continue;
    if (!visitMonths.has(cid)) visitMonths.set(cid, new Set());
    visitMonths.get(cid).add(sm);
  }

  // 3. Compute window: max offset months reachable within [from, to]
  const sortedCohorts = [...cohorts.keys()].sort();
  const [ty, tm] = to.split('-').slice(0, 2).map(Number);
  const offsetMonths = (cohort) => {
    const [cy, cmm] = cohort.split('-').map(Number);
    return Math.max(0, (ty - cy) * 12 + (tm - cmm));
  };

  // 4. Build rows
  const rows = sortedCohorts.map(cohort => {
    const members = [...cohorts.get(cohort)];
    const maxOffset = offsetMonths(cohort);
    const cells = [];
    for (let off = 0; off <= maxOffset; off++) {
      const targetMonth = addMonths(cohort, off);
      let returned = 0;
      for (const cid of members) {
        const visits = visitMonths.get(cid);
        if (visits && visits.has(targetMonth)) returned++;
      }
      const pct = members.length > 0 ? Math.round((returned / members.length) * 10000) / 100 : 0;
      cells.push(pct);
    }
    return { cohort, cohortSize: members.length, cells };
  });

  // 5. overallRate: fraction of customers in cohorts WITH offset≥1 reachable, who have 2+ visit months
  let totalEligible = 0;
  let totalReturned = 0;
  for (const cohort of sortedCohorts) {
    if (offsetMonths(cohort) < 1) continue; // can't measure return for newest cohort
    for (const cid of cohorts.get(cohort)) {
      totalEligible++;
      const visits = visitMonths.get(cid);
      if (visits && visits.size >= 2) totalReturned++;
    }
  }
  const overallRate = totalEligible > 0
    ? Math.round((totalReturned / totalEligible) * 10000) / 100
    : 0;

  return { rows, overallRate };
}

function addMonths(yyyymm, offset) {
  const [y, m] = yyyymm.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + offset;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}
```

- [ ] **Step 3.4: Run test → expect pass**

```bash
npm test -- --run tests/phase16.2-clinic-report-helpers.test.js -t "P3" 2>&1 | tail -10
```

Expected: 8/8 PASS.

---

## Task 4: Helper — `computeBranchComparison`

**Files:**
- Modify: `src/lib/clinicReportHelpers.js`
- Test: `tests/phase16.2-clinic-report-helpers.test.js`

- [ ] **Step 4.1: Add failing test (P4 group)**

```js
import { computeBranchComparison } from '../src/lib/clinicReportHelpers.js';

describe('P4 computeBranchComparison', () => {
  const sales = [
    { id: 's1', branchId: 'BR-A', total: 10000, status: 'paid', saleDate: '2026-04-15', customerId: 'c1' },
    { id: 's2', branchId: 'BR-A', total: 5000, status: 'paid', saleDate: '2026-04-20', customerId: 'c2' },
    { id: 's3', branchId: 'BR-B', total: 8000, status: 'paid', saleDate: '2026-04-18', customerId: 'c3' },
    { id: 's4', branchId: 'BR-B', total: 99999, status: 'cancelled', saleDate: '2026-04-22', customerId: 'c4' },
  ];
  const branches = [
    { id: 'BR-A', name: 'ชลบุรี' },
    { id: 'BR-B', name: 'ปทุมธานี' },
    { id: 'BR-C', name: 'ระยอง' }, // no sales — should still appear with zeros
  ];
  const filter = { from: '2026-04-01', to: '2026-04-30' };

  it('P4.1 — one row per branch', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    expect(r.rows).toHaveLength(3);
    expect(r.rows.map(x => x.branchId).sort()).toEqual(['BR-A', 'BR-B', 'BR-C']);
  });

  it('P4.2 — branchName resolved from branches lookup', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    const a = r.rows.find(x => x.branchId === 'BR-A');
    expect(a.branchName).toBe('ชลบุรี');
  });

  it('P4.3 — revenue sums non-cancelled sales per branch', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    expect(r.rows.find(x => x.branchId === 'BR-A').revenue).toBe(15000);
    expect(r.rows.find(x => x.branchId === 'BR-B').revenue).toBe(8000); // s4 cancelled excluded
    expect(r.rows.find(x => x.branchId === 'BR-C').revenue).toBe(0);
  });

  it('P4.4 — saleCount = non-cancelled count', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    expect(r.rows.find(x => x.branchId === 'BR-A').saleCount).toBe(2);
    expect(r.rows.find(x => x.branchId === 'BR-B').saleCount).toBe(1);
    expect(r.rows.find(x => x.branchId === 'BR-C').saleCount).toBe(0);
  });

  it('P4.5 — branchIds filter clamps to subset', () => {
    const r = computeBranchComparison({ sales, branches, filter: { ...filter, branchIds: ['BR-A'] } });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].branchId).toBe('BR-A');
  });

  it('P4.6 — top branch by revenue at row 0', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    expect(r.rows[0].branchId).toBe('BR-A'); // 15000 > 8000 > 0
  });

  it('P4.7 — V14 — no undefined leaves', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    for (const row of r.rows) {
      expect(row.branchId).not.toBeUndefined();
      expect(row.branchName).not.toBeUndefined();
      expect(row.revenue).not.toBeUndefined();
      expect(row.saleCount).not.toBeUndefined();
    }
  });
});
```

- [ ] **Step 4.2: Run → expect P4.1-P4.7 fail**

```bash
npm test -- --run tests/phase16.2-clinic-report-helpers.test.js -t "P4" 2>&1 | tail -8
```

Expected: 7/7 FAIL with "computeBranchComparison is not exported".

- [ ] **Step 4.3: Append to `clinicReportHelpers.js`**

```js
/**
 * Per-branch revenue + sale count breakdown for the BranchComparisonWidget.
 * Returns one row per branch in `branches` (zeros when no sales),
 * sorted desc by revenue.
 */
export function computeBranchComparison({ sales = [], branches = [], filter = {} } = {}) {
  const branchIdSet = Array.isArray(filter.branchIds) && filter.branchIds.length
    ? new Set(filter.branchIds.map(String))
    : null;

  const visibleBranches = branchIdSet
    ? branches.filter(b => branchIdSet.has(String(b.id)))
    : branches;

  const acc = new Map(); // branchId → {revenue, saleCount}
  for (const b of visibleBranches) {
    acc.set(String(b.id), { revenue: 0, saleCount: 0 });
  }

  for (const s of sales) {
    if (!s || s.status === 'cancelled') continue;
    const d = String(s.saleDate || '').slice(0, 10);
    if (filter.from && d < filter.from) continue;
    if (filter.to && d > filter.to) continue;
    const bid = String(s.branchId || '');
    if (!acc.has(bid)) continue;
    const ent = acc.get(bid);
    ent.revenue += Number(s.total) || 0;
    ent.saleCount += 1;
  }

  const rows = visibleBranches.map(b => ({
    branchId: String(b.id),
    branchName: String(b.name || b.id || ''),
    revenue: roundTHB(acc.get(String(b.id))?.revenue || 0),
    saleCount: acc.get(String(b.id))?.saleCount || 0,
  }));

  rows.sort((a, z) => z.revenue - a.revenue);
  return { rows };
}
```

- [ ] **Step 4.4: Run → expect pass**

```bash
npm test -- --run tests/phase16.2-clinic-report-helpers.test.js -t "P4" 2>&1 | tail -8
```

Expected: 7/7 PASS. Combined helpers file: 26/26 PASS.

---

## Task 5: Orchestrator — `clinicReportAggregator`

**Files:**
- Create: `src/lib/clinicReportAggregator.js`
- Test: `tests/phase16.2-clinic-report-aggregator.test.js`

- [ ] **Step 5.1: Create test file**

```js
// tests/phase16.2-clinic-report-aggregator.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/backendClient.js', () => ({
  listSales: vi.fn(),
  listAllCustomers: vi.fn(),
  listAppointments: vi.fn(),
  listAllStaff: vi.fn(),
  listDoctors: vi.fn(),
  listProducts: vi.fn(),
  listStockBatches: vi.fn(),
  listCourses: vi.fn(),
  listExpenses: vi.fn(),
  listBranches: vi.fn(),
}));

vi.mock('../src/lib/revenueAnalysisAggregator.js', () => ({
  aggregateRevenueByProcedure: vi.fn(() => ({ rows: [{ courseName: 'X' }], totals: {}, meta: {} })),
}));
vi.mock('../src/lib/customerReportAggregator.js', () => ({
  aggregateCustomerReport: vi.fn(() => ({ rows: [], totals: { totalNew: 4 }, meta: {} })),
}));
vi.mock('../src/lib/saleReportAggregator.js', () => ({
  aggregateSaleReport: vi.fn(() => ({ rows: [], totals: { totalRevenue: 28000 }, meta: {} })),
}));
vi.mock('../src/lib/staffSalesAggregator.js', () => ({
  aggregateStaffSales: vi.fn(() => ({ rows: [{ staffName: 'Dr.A', total: 10000 }], totals: {}, meta: {} })),
}));
vi.mock('../src/lib/stockReportAggregator.js', () => ({
  aggregateStockReport: vi.fn(() => ({ rows: [], totals: {}, meta: {} })),
}));
vi.mock('../src/lib/pnlReportAggregator.js', () => ({
  aggregatePnLReport: vi.fn(() => ({ rows: [], totals: { revenue: 28000, expenses: 4000 }, meta: {} })),
}));
vi.mock('../src/lib/appointmentReportAggregator.js', () => ({
  aggregateAppointmentReport: vi.fn(() => ({ rows: [], totals: { totalAppointments: 10, fillRate: 80 }, meta: {} })),
}));
vi.mock('../src/lib/appointmentAnalysisAggregator.js', () => ({
  aggregateAppointmentAnalysis: vi.fn(() => ({ kpiByAdvisor: [], totals: { noShowRate: 8 }, meta: {} })),
}));

import * as backend from '../src/lib/backendClient.js';
import { fetchClinicReportData, composeClinicReportSnapshot, clinicReportAggregator } from '../src/lib/clinicReportAggregator.js';

describe('A1 fetchClinicReportData — Firestore I/O', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backend.listSales.mockResolvedValue([{ id: 's1', total: 5000, status: 'paid', saleDate: '2026-04-15', customerId: 'c1', branchId: 'BR-A' }]);
    backend.listAllCustomers.mockResolvedValue([{ id: 'c1', createdAt: '2026-04-15', branchId: 'BR-A' }]);
    backend.listAppointments.mockResolvedValue([]);
    backend.listAllStaff.mockResolvedValue([]);
    backend.listDoctors.mockResolvedValue([]);
    backend.listProducts.mockResolvedValue([]);
    backend.listStockBatches.mockResolvedValue([]);
    backend.listCourses.mockResolvedValue([]);
    backend.listExpenses.mockResolvedValue([]);
    backend.listBranches.mockResolvedValue([{ id: 'BR-A', name: 'ชลบุรี' }]);
  });

  it('A1.1 — fetch all 10 collections in parallel', async () => {
    await fetchClinicReportData({ from: '2026-04-01', to: '2026-04-30' });
    expect(backend.listSales).toHaveBeenCalledOnce();
    expect(backend.listAllCustomers).toHaveBeenCalledOnce();
    expect(backend.listAppointments).toHaveBeenCalledOnce();
    expect(backend.listExpenses).toHaveBeenCalledOnce();
    expect(backend.listBranches).toHaveBeenCalledOnce();
  });

  it('A1.2 — date filter passed to listSales for prefiltering', async () => {
    const filter = { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] };
    await fetchClinicReportData(filter);
    expect(backend.listSales).toHaveBeenCalledWith(expect.objectContaining({
      from: '2026-04-01', to: '2026-04-30',
    }));
  });

  it('A1.3 — partial fetch failure does not throw — captured per-key', async () => {
    backend.listExpenses.mockRejectedValueOnce(new Error('expense fetch failed'));
    const result = await fetchClinicReportData({ from: '2026-04-01', to: '2026-04-30' });
    expect(result.errors.expenses).toMatch(/expense fetch failed/);
    expect(result.expenses).toEqual([]); // empty fallback
    expect(result.sales).toBeTruthy();    // others still loaded
  });
});

describe('A2 composeClinicReportSnapshot — pure orchestration', () => {
  const rawData = {
    sales: [{ id: 's1', total: 5000, status: 'paid', saleDate: '2026-04-15', customerId: 'c1', branchId: 'BR-A' }],
    customers: [{ id: 'c1', createdAt: '2026-04-15', branchId: 'BR-A' }],
    appointments: [],
    staff: [],
    doctors: [],
    products: [],
    batches: [],
    courses: [],
    expenses: [{ id: 'e1', amount: 1000, expenseDate: '2026-04-15' }],
    branches: [{ id: 'BR-A', name: 'ชลบุรี' }],
    errors: {},
  };

  it('A2.1 — returns a ClinicReportSnapshot with 4 top-level keys', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(Object.keys(snap)).toEqual(expect.arrayContaining(['tiles', 'charts', 'tables', 'meta']));
  });

  it('A2.2 — tiles populated by computeKpiTiles', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.tiles.revenueYtd).toBe(5000);
    expect(snap.tiles.expenseRatio).toBeCloseTo(20, 1); // 1000/5000 = 20%
  });

  it('A2.3 — tables.topServices populated from saleReportAggregator output', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.tables).toHaveProperty('topServices');
    expect(snap.tables).toHaveProperty('topDoctors');
    expect(snap.tables).toHaveProperty('topProducts');
  });

  it('A2.4 — charts include retentionCohort, branchComparison, revenueTrend', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.charts).toHaveProperty('retentionCohort');
    expect(snap.charts).toHaveProperty('branchComparison');
    expect(snap.charts).toHaveProperty('revenueTrend');
  });

  it('A2.5 — meta.generatedAt is a valid ISO timestamp', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('A2.6 — V14 — no undefined leaves anywhere', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    function walk(obj, path = '$') {
      if (obj === undefined) throw new Error(`undefined at ${path}`);
      if (obj === null || typeof obj !== 'object') return;
      if (Array.isArray(obj)) obj.forEach((v, i) => walk(v, `${path}[${i}]`));
      else Object.entries(obj).forEach(([k, v]) => walk(v, `${path}.${k}`));
    }
    expect(() => walk(snap)).not.toThrow();
  });

  it('A2.7 — partial errors propagate to snapshot.meta.partialErrors', () => {
    const partial = { ...rawData, errors: { expenses: 'fetch failed' } };
    const snap = composeClinicReportSnapshot(partial, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.meta.partialErrors).toEqual({ expenses: 'fetch failed' });
  });
});

describe('A3 clinicReportAggregator — full pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backend.listSales.mockResolvedValue([{ id: 's1', total: 5000, status: 'paid', saleDate: '2026-04-15', customerId: 'c1', branchId: 'BR-A' }]);
    backend.listAllCustomers.mockResolvedValue([{ id: 'c1', createdAt: '2026-04-15', branchId: 'BR-A' }]);
    backend.listAppointments.mockResolvedValue([]);
    backend.listAllStaff.mockResolvedValue([]);
    backend.listDoctors.mockResolvedValue([]);
    backend.listProducts.mockResolvedValue([]);
    backend.listStockBatches.mockResolvedValue([]);
    backend.listCourses.mockResolvedValue([]);
    backend.listExpenses.mockResolvedValue([]);
    backend.listBranches.mockResolvedValue([{ id: 'BR-A', name: 'ชลบุรี' }]);
  });

  it('A3.1 — end-to-end produces complete snapshot', async () => {
    const snap = await clinicReportAggregator({ from: '2026-04-01', to: '2026-04-30' });
    expect(snap.tiles.revenueYtd).toBe(5000);
    expect(snap.charts.branchComparison.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 5.2: Run → expect imports fail**

```bash
npm test -- --run tests/phase16.2-clinic-report-aggregator.test.js 2>&1 | tail -10
```

Expected: failure on `clinicReportAggregator.js` import.

- [ ] **Step 5.3: First, ensure all referenced backendClient exports exist (verify, don't add)**

```bash
grep -E "^export (async )?function (listSales|listAllCustomers|listAppointments|listAllStaff|listDoctors|listProducts|listStockBatches|listCourses|listExpenses|listBranches)\b" src/lib/backendClient.js | head -20
```

If any export is missing — STOP and grep alternate name (e.g., `listCustomers`, `listAllExpenses`, etc.). Adapt the test mock + aggregator imports to whatever exists. Do NOT add new exports — they should already exist.

(If `listExpenses` doesn't exist, check for `listAllExpenses` or similar. If `listAllStaff` is `listStaff`, use that. The test will need to be updated to match real exports; but in dev experience these all should exist. If a name is genuinely missing, the most likely missing one is `listAllStaff` — substitute `listStaff` if that's what's defined.)

- [ ] **Step 5.4: Create `src/lib/clinicReportAggregator.js`**

```js
// ─── Clinic Report Orchestrator — Phase 16.2 (2026-04-29) ──────────────────
//
// Architecture: 2-phase pipeline.
//   1. fetchClinicReportData(filter) → rawData
//        Promise.all 10 backendClient list-* fns; per-key error capture.
//   2. composeClinicReportSnapshot(rawData, filter) → snapshot
//        Pure orchestration: Promise.all 8 aggregators + 3 helpers + merge.
//
// Public API:
//   clinicReportAggregator(filter) — convenience wrapper that does 1+2.
//
// Iron-clad:
//   E         no brokerClient / no /api/proclinic — Firestore-only
//   H-quater  no master_data reads
//   I         covered by tests/phase16.2-*-flow-simulate.test.js
//   V14       composeSnapshot strips undefined via JSON.parse(JSON.stringify)? NO —
//             tests assert no-undefined; helpers already V14-safe.
//
// Filter shape:
//   { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', branchIds?: string[], categories?: string[] }

import {
  listSales, listAllCustomers, listAppointments,
  listAllStaff, listDoctors, listProducts, listStockBatches,
  listCourses, listExpenses, listBranches,
} from './backendClient.js';

import { aggregateRevenueByProcedure } from './revenueAnalysisAggregator.js';
import { aggregateCustomerReport }      from './customerReportAggregator.js';
import { aggregateSaleReport }          from './saleReportAggregator.js';
import { aggregateStaffSales }          from './staffSalesAggregator.js';
import { aggregateStockReport }         from './stockReportAggregator.js';
import { aggregatePnLReport }           from './pnlReportAggregator.js';
import { aggregateAppointmentReport }   from './appointmentReportAggregator.js';
import { aggregateAppointmentAnalysis } from './appointmentAnalysisAggregator.js';

import {
  computeKpiTiles,
  computeRetentionCohort,
  computeBranchComparison,
} from './clinicReportHelpers.js';

const COLLECTION_FETCHERS = {
  sales:        (f) => listSales({ from: f.from, to: f.to, branchIds: f.branchIds }),
  customers:    ()  => listAllCustomers(),
  appointments: (f) => listAppointments({ from: f.from, to: f.to, branchIds: f.branchIds }),
  staff:        ()  => listAllStaff(),
  doctors:      ()  => listDoctors(),
  products:     ()  => listProducts(),
  batches:      ()  => listStockBatches(),
  courses:      ()  => listCourses(),
  expenses:     (f) => listExpenses({ from: f.from, to: f.to }),
  branches:     ()  => listBranches(),
};

/**
 * Fetch the 10 collections needed for the Clinic Report dashboard.
 * Per-key error capture — failures don't tank the entire load.
 *
 * @returns {Promise<{
 *   sales: any[], customers: any[], appointments: any[],
 *   staff: any[], doctors: any[], products: any[], batches: any[],
 *   courses: any[], expenses: any[], branches: any[],
 *   errors: Record<string, string>
 * }>}
 */
export async function fetchClinicReportData(filter = {}) {
  const keys = Object.keys(COLLECTION_FETCHERS);
  const settled = await Promise.all(
    keys.map(async k => {
      try {
        const data = await COLLECTION_FETCHERS[k](filter);
        return [k, Array.isArray(data) ? data : [], null];
      } catch (e) {
        return [k, [], e?.message || 'fetch failed'];
      }
    })
  );
  const result = { errors: {} };
  for (const [k, data, err] of settled) {
    result[k] = data;
    if (err) result.errors[k] = err;
  }
  return result;
}

/**
 * Pure orchestration — given pre-fetched raw data + filter, build the full
 * ClinicReportSnapshot consumed by widgets. Easy to unit-test (no Firestore).
 *
 * @returns {{ tiles, charts, tables, meta }}
 */
export function composeClinicReportSnapshot(rawData, filter = {}) {
  const {
    sales = [], customers = [], appointments = [],
    staff = [], doctors = [], products = [], batches = [],
    courses = [], expenses = [], branches = [],
    errors = {},
  } = rawData || {};

  // Run reused aggregators in parallel via Promise.resolve (they are sync; wrapper for symmetry)
  const revenueByProcedure = aggregateRevenueByProcedure(sales, courses, filter);
  const customerReport     = aggregateCustomerReport(customers, sales, filter);
  const saleReport         = aggregateSaleReport(sales, filter);
  const staffSales         = aggregateStaffSales(sales, filter);
  const stockReport        = aggregateStockReport(batches, products, filter);
  const pnl                = aggregatePnLReport({ sales, expenses, filters: filter });
  const appointmentReport  = aggregateAppointmentReport(appointments, customers, [...staff, ...doctors], filter);
  const appointmentAnalysis = aggregateAppointmentAnalysis(appointments, sales, { from: filter.from, to: filter.to });

  // 3 helpers
  const branchComparison = computeBranchComparison({ sales, branches, filter });
  const retentionCohort  = computeRetentionCohort({ sales, customers, filter });

  // Course utilization — derived from be_customers[].courses[]
  const courseUtilization = computeCourseUtilization(customers);

  // No-show rate — from appointmentAnalysis aggregate
  const noShowRate = Number(appointmentAnalysis?.totals?.noShowRate || 0);

  const tiles = computeKpiTiles({
    sales, customers, expenses, filter,
    derived: {
      retentionRate: retentionCohort.overallRate,
      courseUtilization,
      noShowRate,
    },
  });

  // Top-10 helpers (slice + dedup from existing aggregator outputs)
  const topServices = (revenueByProcedure?.rows || [])
    .map(r => ({ name: r.courseName || r.name, revenue: Number(r.lineTotal || r.paidShare || 0), count: Number(r.qty || 0) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  const topDoctors = (staffSales?.rows || [])
    .filter(r => (r.role || '').toLowerCase() === 'doctor' || /Dr\./i.test(r.staffName || ''))
    .slice(0, 10);
  const topProducts = (stockReport?.rows || [])
    .map(r => ({ name: r.productName || r.name, value: Number(r.totalValue || r.cost || 0), qty: Number(r.qty || 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Revenue trend (M-o-M) — derive from sales (orchestrator-side; saleReport doesn't bucket by month)
  const revenueTrend = bucketByMonth(sales, filter);

  return {
    tiles,
    charts: {
      revenueTrend,
      newCustomersTrend: bucketCustomersByMonth(customers, filter),
      retentionCohort,
      branchComparison,
      cashFlow: bucketCashFlowByMonth(sales, expenses, filter),
      apptFillRate: appointmentReport?.totals?.fillRate ?? null,
    },
    tables: {
      topServices,
      topDoctors,
      topProducts,
    },
    meta: {
      generatedAt: new Date().toISOString(),
      filterApplied: { ...filter },
      branchScope: Array.isArray(filter.branchIds) ? filter.branchIds : 'all',
      partialErrors: Object.keys(errors).length > 0 ? errors : null,
    },
  };
}

/** Convenience wrapper: fetch + compose. */
export async function clinicReportAggregator(filter = {}) {
  const raw = await fetchClinicReportData(filter);
  return composeClinicReportSnapshot(raw, filter);
}

/* ─── Internal bucketing helpers ─────────────────────────────────────────── */

function bucketByMonth(sales, filter) {
  const buckets = {};
  for (const s of sales) {
    if (!s || s.status === 'cancelled') continue;
    const d = String(s.saleDate || '').slice(0, 7);
    if (!d) continue;
    if (filter.from && d + '-01' < filter.from) continue;
    if (filter.to && d + '-01' > filter.to) continue;
    buckets[d] = (buckets[d] || 0) + (Number(s.total) || 0);
  }
  return Object.entries(buckets).sort().map(([month, value]) => ({ label: month, value }));
}

function bucketCustomersByMonth(customers, filter) {
  const buckets = {};
  for (const c of customers) {
    const d = String(c.createdAt || '').slice(0, 7);
    if (!d) continue;
    if (filter.from && d + '-01' < filter.from) continue;
    if (filter.to && d + '-01' > filter.to) continue;
    buckets[d] = (buckets[d] || 0) + 1;
  }
  return Object.entries(buckets).sort().map(([month, value]) => ({ label: month, value }));
}

function bucketCashFlowByMonth(sales, expenses, filter) {
  const buckets = {};
  for (const s of sales) {
    if (!s || s.status === 'cancelled') continue;
    const d = String(s.saleDate || '').slice(0, 7);
    if (!d) continue;
    if (!buckets[d]) buckets[d] = { revenue: 0, expenses: 0 };
    buckets[d].revenue += Number(s.total) || 0;
  }
  for (const e of expenses) {
    const d = String(e.expenseDate || '').slice(0, 7);
    if (!d) continue;
    if (!buckets[d]) buckets[d] = { revenue: 0, expenses: 0 };
    buckets[d].expenses += Number(e.amount) || 0;
  }
  return Object.entries(buckets)
    .sort()
    .map(([month, v]) => ({ label: month, value: v.revenue - v.expenses }));
}

function computeCourseUtilization(customers) {
  let totalQty = 0, usedQty = 0;
  for (const c of customers) {
    for (const course of (c.courses || [])) {
      const remaining = Number(course.qtyRemaining ?? course.remaining ?? 0);
      const total = Number(course.qty ?? course.qtyTotal ?? 0);
      if (total > 0) {
        totalQty += total;
        usedQty += (total - remaining);
      }
    }
  }
  return totalQty > 0 ? Math.round((usedQty / totalQty) * 10000) / 100 : 0;
}
```

- [ ] **Step 5.5: Run aggregator tests → expect pass**

```bash
npm test -- --run tests/phase16.2-clinic-report-aggregator.test.js 2>&1 | tail -10
```

Expected: A1 + A2 + A3 = 11/11 PASS.

If any test fails because backendClient export name mismatch — adjust the import in `clinicReportAggregator.js` to match the real name + fix the test mock to use the same name. Re-run.

- [ ] **Step 5.6: Run full helpers suite + build**

```bash
npm test -- --run tests/phase16.2-clinic-report-helpers.test.js tests/phase16.2-clinic-report-aggregator.test.js 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

Expected: 37/37 PASS · build clean.

---

## Task 6: CSV builder — `clinicReportCsv`

**Files:**
- Create: `src/lib/clinicReportCsv.js`
- Test: `tests/phase16.2-clinic-report-csv.test.js`

- [ ] **Step 6.1: Failing test**

```js
// tests/phase16.2-clinic-report-csv.test.js
import { describe, it, expect } from 'vitest';
import { toCsv } from '../src/lib/clinicReportCsv.js';

describe('CSV1 toCsv', () => {
  const minimalSnapshot = {
    tiles: { revenueYtd: 28000, momGrowth: 12, newCustomersPerMonth: 3.5,
             retentionRate: 66.67, avgTicket: 7000, courseUtilization: 47,
             noShowRate: 8, expenseRatio: 14.28 },
    charts: {
      revenueTrend: [{ label: '2026-04', value: 12000 }, { label: '2026-03', value: 8000 }],
      newCustomersTrend: [{ label: '2026-04', value: 5 }],
      cashFlow: [{ label: '2026-04', value: 3000 }],
      retentionCohort: { rows: [{ cohort: '2025-11', cohortSize: 2, cells: [100, 50] }], overallRate: 50 },
      branchComparison: { rows: [{ branchId: 'BR-A', branchName: 'ชลบุรี', revenue: 15000, saleCount: 2 }] },
      apptFillRate: 80,
    },
    tables: {
      topServices: [{ name: 'ดริปผิวใส', revenue: 2400000, count: 142 }],
      topDoctors: [{ staffName: 'Dr.A', total: 3100000 }],
      topProducts: [{ name: 'BA Vitamin', value: 800000, qty: 100 }],
    },
    meta: {
      generatedAt: '2026-04-29T12:00:00.000Z',
      filterApplied: { from: '2025-11-01', to: '2026-04-30' },
      branchScope: 'all',
      partialErrors: null,
    },
  };

  it('CSV1.1 — output starts with UTF-8 BOM', () => {
    const csv = toCsv(minimalSnapshot);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('CSV1.2 — has header row with date range', () => {
    const csv = toCsv(minimalSnapshot);
    expect(csv).toMatch(/Clinic Report.*2025-11-01.*2026-04-30/);
  });

  it('CSV1.3 — Thai characters preserved (not garbled)', () => {
    const csv = toCsv(minimalSnapshot);
    expect(csv).toContain('ดริปผิวใส');
    expect(csv).toContain('ชลบุรี');
  });

  it('CSV1.4 — sections labeled with widget IDs', () => {
    const csv = toCsv(minimalSnapshot);
    expect(csv).toMatch(/W1.*Revenue trend/);
    expect(csv).toMatch(/W4.*Top.*services/);
    expect(csv).toMatch(/W7.*Branch comparison/);
  });

  it('CSV1.5 — values comma-escaped (no broken rows)', () => {
    const snap = JSON.parse(JSON.stringify(minimalSnapshot));
    snap.tables.topServices[0].name = 'Service, with comma';
    const csv = toCsv(snap);
    expect(csv).toContain('"Service, with comma"');
  });

  it('CSV1.6 — empty arrays render as empty section (no crash)', () => {
    const empty = JSON.parse(JSON.stringify(minimalSnapshot));
    empty.tables.topServices = [];
    expect(() => toCsv(empty)).not.toThrow();
  });

  it('CSV1.7 — KPI tiles section first', () => {
    const csv = toCsv(minimalSnapshot);
    const tilesIdx = csv.indexOf('KPI Tiles');
    const w1Idx = csv.indexOf('W1');
    expect(tilesIdx).toBeGreaterThan(0);
    expect(tilesIdx).toBeLessThan(w1Idx);
  });

  it('CSV1.8 — meta section includes generatedAt + branchScope', () => {
    const csv = toCsv(minimalSnapshot);
    expect(csv).toContain('2026-04-29T12:00:00');
    expect(csv).toMatch(/branchScope.*all/i);
  });
});
```

- [ ] **Step 6.2: Run → expect fail**

```bash
npm test -- --run tests/phase16.2-clinic-report-csv.test.js 2>&1 | tail -5
```

Expected: 8/8 fail with "import clinicReportCsv.js failed".

- [ ] **Step 6.3: Create `src/lib/clinicReportCsv.js`**

```js
// ─── Clinic Report CSV exporter — Phase 16.2 ──────────────────────────────
//
// Produces a UTF-8 BOM-prefixed CSV string for Excel-compat Thai output.
// One section per widget. Sections separated by blank lines.

const BOM = '﻿';

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // RFC 4180 — wrap in quotes if contains comma, quote, or newline
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cells) {
  return cells.map(csvEscape).join(',');
}

/**
 * Convert a ClinicReportSnapshot into a CSV string.
 * @param {object} snapshot
 * @returns {string}
 */
export function toCsv(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return BOM;
  const lines = [];
  const f = snapshot.meta?.filterApplied || {};
  const dateRange = `${f.from || '?'} → ${f.to || '?'}`;

  lines.push(row(`Clinic Report — ${dateRange} — branchScope: ${snapshot.meta?.branchScope ?? 'all'}`));
  lines.push('');

  // KPI Tiles
  lines.push(row('KPI Tiles'));
  lines.push(row('Metric', 'Value'));
  for (const [k, v] of Object.entries(snapshot.tiles || {})) {
    lines.push(row(k, v ?? ''));
  }
  lines.push('');

  // W1 — Revenue trend M-o-M
  lines.push(row('W1 — Revenue trend M-o-M'));
  lines.push(row('Month', 'Revenue (THB)'));
  for (const r of (snapshot.charts?.revenueTrend || [])) lines.push(row(r.label, r.value));
  lines.push('');

  // W2 — New customers M-o-M
  lines.push(row('W2 — New customers M-o-M'));
  lines.push(row('Month', 'Count'));
  for (const r of (snapshot.charts?.newCustomersTrend || [])) lines.push(row(r.label, r.value));
  lines.push('');

  // W3 — Retention cohort
  lines.push(row('W3 — Retention cohort'));
  lines.push(row('Cohort', 'CohortSize', 'Offset0', 'Offset1', 'Offset2', 'Offset3', 'Offset4', 'Offset5'));
  for (const r of (snapshot.charts?.retentionCohort?.rows || [])) {
    lines.push(row(r.cohort, r.cohortSize, ...(r.cells.slice(0, 6).concat(['', '', '', '', '', '']).slice(0, 6))));
  }
  lines.push(row('OverallRate', '', snapshot.charts?.retentionCohort?.overallRate ?? 0));
  lines.push('');

  // W4 — Top-10 services
  lines.push(row('W4 — Top-10 services'));
  lines.push(row('Rank', 'Name', 'Revenue (THB)', 'Count'));
  (snapshot.tables?.topServices || []).forEach((r, i) => lines.push(row(i + 1, r.name, r.revenue, r.count)));
  lines.push('');

  // W5 — Top-10 doctors
  lines.push(row('W5 — Top-10 doctors'));
  lines.push(row('Rank', 'Name', 'Total Sales (THB)'));
  (snapshot.tables?.topDoctors || []).forEach((r, i) => lines.push(row(i + 1, r.staffName || r.name, r.total ?? r.total_sales ?? 0)));
  lines.push('');

  // W6 — Top-10 products
  lines.push(row('W6 — Top-10 products'));
  lines.push(row('Rank', 'Name', 'Value (THB)', 'Qty'));
  (snapshot.tables?.topProducts || []).forEach((r, i) => lines.push(row(i + 1, r.name, r.value, r.qty)));
  lines.push('');

  // W7 — Branch comparison
  lines.push(row('W7 — Branch comparison'));
  lines.push(row('BranchID', 'BranchName', 'Revenue (THB)', 'Sale Count'));
  for (const r of (snapshot.charts?.branchComparison?.rows || [])) {
    lines.push(row(r.branchId, r.branchName, r.revenue, r.saleCount));
  }
  lines.push('');

  // W8 — Cash flow
  lines.push(row('W8 — Cash flow (revenue − expenses)'));
  lines.push(row('Month', 'Net (THB)'));
  for (const r of (snapshot.charts?.cashFlow || [])) lines.push(row(r.label, r.value));
  lines.push('');

  // W10 — Appt fill rate
  lines.push(row('W10 — Appt fill rate'));
  lines.push(row('Rate (%)', snapshot.charts?.apptFillRate ?? ''));
  lines.push('');

  // Meta
  lines.push(row('Meta'));
  lines.push(row('generatedAt', snapshot.meta?.generatedAt ?? ''));
  lines.push(row('branchScope', JSON.stringify(snapshot.meta?.branchScope ?? '')));
  lines.push(row('partialErrors', JSON.stringify(snapshot.meta?.partialErrors ?? null)));

  return BOM + lines.join('\n') + '\n';
}

/**
 * Trigger a browser download of the CSV with a sensible filename.
 */
export function downloadCsv(snapshot, filename = 'clinic-report.csv') {
  const csv = toCsv(snapshot);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 6.4: Run → expect pass**

```bash
npm test -- --run tests/phase16.2-clinic-report-csv.test.js 2>&1 | tail -5
```

Expected: 8/8 PASS.

---

## Task 7: Hook — `useClinicReport`

**Files:**
- Create: `src/hooks/useClinicReport.js`
- Test: `tests/phase16.2-use-clinic-report.test.js`

- [ ] **Step 7.1: Failing test**

```js
// tests/phase16.2-use-clinic-report.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../src/lib/clinicReportAggregator.js', () => ({
  clinicReportAggregator: vi.fn(),
}));

import { clinicReportAggregator } from '../src/lib/clinicReportAggregator.js';
import { useClinicReport } from '../src/hooks/useClinicReport.js';

describe('H1 useClinicReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clinicReportAggregator.mockResolvedValue({ tiles: { revenueYtd: 100 }, charts: {}, tables: {}, meta: {} });
  });

  it('H1.1 — fires aggregator on mount', async () => {
    const filter = { from: '2026-04-01', to: '2026-04-30' };
    renderHook(() => useClinicReport(filter));
    await waitFor(() => expect(clinicReportAggregator).toHaveBeenCalledWith(filter));
  });

  it('H1.2 — exposes loading then snapshot', async () => {
    const { result } = renderHook(() => useClinicReport({ from: '2026-04-01', to: '2026-04-30' }));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snapshot.tiles.revenueYtd).toBe(100);
  });

  it('H1.3 — same filter twice (re-render with equivalent object) hits cache', async () => {
    const filter1 = { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] };
    const { result, rerender } = renderHook(({ f }) => useClinicReport(f), {
      initialProps: { f: filter1 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(1);

    // Re-render with structurally equal filter
    rerender({ f: { ...filter1 } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(1); // cache hit
  });

  it('H1.4 — different filter triggers fresh fetch', async () => {
    const { result, rerender } = renderHook(({ f }) => useClinicReport(f), {
      initialProps: { f: { from: '2026-04-01', to: '2026-04-30' } },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ f: { from: '2026-03-01', to: '2026-04-30' } });
    await waitFor(() => expect(clinicReportAggregator).toHaveBeenCalledTimes(2));
  });

  it('H1.5 — refresh() clears cache for current key + refetches', async () => {
    const { result } = renderHook(() => useClinicReport({ from: '2026-04-01', to: '2026-04-30' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(clinicReportAggregator).toHaveBeenCalledTimes(2);
  });

  it('H1.6 — aggregator rejection surfaces error, snapshot stays null', async () => {
    clinicReportAggregator.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useClinicReport({ from: '2026-04-01', to: '2026-04-30' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/boom/);
    expect(result.current.snapshot).toBeNull();
  });

  it('H1.7 — no setInterval anywhere (zero-polling guarantee)', async () => {
    const fakeSetInterval = vi.spyOn(global, 'setInterval');
    renderHook(() => useClinicReport({ from: '2026-04-01', to: '2026-04-30' }));
    expect(fakeSetInterval).not.toHaveBeenCalled();
    fakeSetInterval.mockRestore();
  });
});
```

- [ ] **Step 7.2: Run → expect fail**

```bash
npm test -- --run tests/phase16.2-use-clinic-report.test.js 2>&1 | tail -5
```

Expected: 7/7 fail with "useClinicReport not exported".

- [ ] **Step 7.3: Create `src/hooks/useClinicReport.js`**

```js
// ─── useClinicReport — smart hybrid cache hook for Phase 16.2 ──────────────
//
// Cache strategy:
//   - filter-keyed Map (component-lifetime, per-instance)
//   - auto-invalidate on filter change (cache miss → re-fetch)
//   - manual refresh() clears current key + refetches
//   - NO setInterval / NO polling
//
// Error semantics:
//   - rejection → error state set, snapshot stays at last-good (null on first fail)

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { clinicReportAggregator } from '../lib/clinicReportAggregator.js';

function stableKey(filter) {
  // Deterministic stringification — sort branchIds + categories for cache hit on equiv filters
  if (!filter || typeof filter !== 'object') return JSON.stringify(filter ?? null);
  const norm = {
    from: filter.from || '',
    to: filter.to || '',
    branchIds: Array.isArray(filter.branchIds) ? [...filter.branchIds].sort() : null,
    categories: Array.isArray(filter.categories) ? [...filter.categories].sort() : null,
  };
  return JSON.stringify(norm);
}

export function useClinicReport(filter) {
  const cacheRef = useRef(new Map());
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  const key = useMemo(() => stableKey(filter), [filter]);

  useEffect(() => {
    let cancelled = false;
    const cached = cacheRef.current.get(key);
    if (cached && refreshTick === 0) {
      setSnapshot(cached);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    clinicReportAggregator(filter)
      .then(snap => {
        if (cancelled) return;
        cacheRef.current.set(key, snap);
        setSnapshot(snap);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e?.message || 'load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [key, refreshTick]);

  const refresh = useCallback(async () => {
    cacheRef.current.delete(key);
    setRefreshTick(t => t + 1);
  }, [key]);

  return { snapshot, loading, error, refresh };
}
```

- [ ] **Step 7.4: Run → expect pass**

```bash
npm test -- --run tests/phase16.2-use-clinic-report.test.js 2>&1 | tail -5
```

Expected: 7/7 PASS.

---

## Task 8: Widget — `KpiTile` + `RankedTableWidget`

**Files:**
- Create: `src/components/backend/reports/widgets/KpiTile.jsx`
- Create: `src/components/backend/reports/widgets/RankedTableWidget.jsx`
- Test: extend `tests/phase16.2-clinic-report-tab.test.jsx` (created later) — for now, smoke-test via the tab integration test in Task 11.

These widgets are simple presentational components; full RTL coverage happens in Task 11. Skip TDD ceremony here — writing the components inline suffices.

- [ ] **Step 8.1: Create `KpiTile.jsx`**

```jsx
// src/components/backend/reports/widgets/KpiTile.jsx
import { ChevronRight } from 'lucide-react';

/**
 * Single-number KPI tile with optional sparkline + drilldown link.
 *
 * @param {object} p
 * @param {string} p.label
 * @param {number|string|null} p.value         — formatted value (caller does fmt)
 * @param {string} [p.sublabel]                — small secondary line
 * @param {string} [p.tone='default']          — 'default'|'positive'|'negative'|'warn'
 * @param {string|null} [p.drilldownTabId]     — non-null → ดูรายละเอียด link
 * @param {(tabId: string) => void} [p.onNavigate]
 */
export default function KpiTile({ label, value, sublabel, tone = 'default', drilldownTabId, onNavigate }) {
  const toneCls = ({
    positive: 'text-emerald-300',
    negative: 'text-rose-300',
    warn:     'text-amber-300',
    default:  'text-cyan-300',
  })[tone] || 'text-cyan-300';

  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3 flex flex-col gap-1" data-testid={`kpi-tile-${label}`}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)]">{label}</div>
      <div className={`text-xl font-black tabular-nums ${toneCls}`}>{value === null || value === undefined ? '—' : value}</div>
      {sublabel && <div className="text-[10px] text-[var(--tx-muted)]">{sublabel}</div>}
      {drilldownTabId && (
        <button
          type="button"
          onClick={() => onNavigate?.(drilldownTabId)}
          className="text-[10px] text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5 mt-1"
          data-drilldown-target={drilldownTabId}
        >
          ดูรายละเอียด <ChevronRight size={10} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 8.2: Create `RankedTableWidget.jsx`**

```jsx
// src/components/backend/reports/widgets/RankedTableWidget.jsx
import { ChevronRight } from 'lucide-react';

/**
 * Top-N ranked list. Click "ดูทั้งหมด" → existing detail tab.
 *
 * @param {object} p
 * @param {string} p.title
 * @param {Array<{name?: string, staffName?: string, revenue?: number, total?: number, value?: number, count?: number, qty?: number}>} p.rows
 * @param {{ value: string, qty?: string }} [p.fmtKeys] — which keys to show
 * @param {string|null} [p.drilldownTabId]
 * @param {(tabId: string) => void} [p.onNavigate]
 * @param {(n: number) => string} [p.fmtMoney]
 * @param {string} [p.testId]
 */
export default function RankedTableWidget({
  title, rows = [], fmtKeys = { value: 'revenue', qty: 'count' },
  drilldownTabId, onNavigate, fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH'),
  testId,
}) {
  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3" data-testid={testId || `ranked-${title}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">{title}</h3>
        {drilldownTabId && (
          <button
            type="button"
            onClick={() => onNavigate?.(drilldownTabId)}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5"
            data-drilldown-target={drilldownTabId}
          >
            ดูทั้งหมด <ChevronRight size={10} />
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-[10px] text-[var(--tx-muted)]">ไม่มีข้อมูลในช่วงเวลานี้</p>
      ) : (
        <ol className="space-y-1">
          {rows.slice(0, 10).map((r, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs">
              <span className="text-[var(--tx-muted)] tabular-nums w-5 text-right">{i + 1}.</span>
              <span className="flex-1 truncate text-[var(--tx-primary)]">{r.name || r.staffName || '—'}</span>
              <span className="font-bold text-amber-300 tabular-nums">{fmtMoney(r[fmtKeys.value] ?? r.total ?? 0)}</span>
              {r[fmtKeys.qty] != null && <span className="text-[10px] text-[var(--tx-muted)] tabular-nums">×{r[fmtKeys.qty]}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 8.3: Build sanity check**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

---

## Task 9: Widget — `RetentionHeatmapWidget` + `BranchComparisonWidget`

**Files:**
- Create: `src/components/backend/reports/widgets/RetentionHeatmapWidget.jsx`
- Create: `src/components/backend/reports/widgets/BranchComparisonWidget.jsx`

- [ ] **Step 9.1: Create `RetentionHeatmapWidget.jsx`**

```jsx
// src/components/backend/reports/widgets/RetentionHeatmapWidget.jsx
import { ChevronRight } from 'lucide-react';

/**
 * Cohort retention heatmap. Custom inline SVG (no chart library).
 *
 * @param {object} p
 * @param {{ rows: Array<{cohort: string, cohortSize: number, cells: number[]}>, overallRate: number }} p.data
 * @param {string|null} [p.drilldownTabId]
 * @param {(tabId: string) => void} [p.onNavigate]
 */
export default function RetentionHeatmapWidget({ data, drilldownTabId, onNavigate }) {
  const rows = data?.rows || [];
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3" data-testid="widget-retention-cohort">
        <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300 mb-2">Retention cohort</h3>
        <p className="text-[10px] text-[var(--tx-muted)]">ไม่มีข้อมูลในช่วงเวลานี้</p>
      </div>
    );
  }

  const maxCols = Math.max(...rows.map(r => r.cells.length));
  const cellSize = 28;
  const padX = 80, padY = 24;
  const widthPx = padX + maxCols * cellSize + 8;
  const heightPx = padY + rows.length * cellSize + 8;

  // Color from value 0..100: gray → cyan → emerald
  const cellColor = (v) => {
    if (v == null || isNaN(v)) return 'rgba(120,120,120,0.1)';
    if (v < 20) return `rgba(200,80,80,${0.2 + v / 100})`;
    if (v < 50) return `rgba(255,170,80,${0.3 + v / 200})`;
    if (v < 80) return `rgba(80,180,200,${0.4 + v / 250})`;
    return `rgba(60,200,140,${0.5 + v / 300})`;
  };

  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3" data-testid="widget-retention-cohort">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300">
          Retention cohort
          <span className="ml-2 text-[10px] font-normal text-[var(--tx-muted)]">overall {data.overallRate ?? 0}%</span>
        </h3>
        {drilldownTabId && (
          <button
            type="button"
            onClick={() => onNavigate?.(drilldownTabId)}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5"
            data-drilldown-target={drilldownTabId}
          >
            ดูรายละเอียด <ChevronRight size={10} />
          </button>
        )}
      </div>
      <svg width={widthPx} height={heightPx} role="img" aria-label="Retention cohort heatmap" style={{ overflow: 'visible' }}>
        {/* Column headers (offsets) */}
        {Array.from({ length: maxCols }).map((_, ci) => (
          <text key={ci} x={padX + ci * cellSize + cellSize / 2} y={padY - 8} textAnchor="middle" fontSize="9" fill="var(--tx-muted)">+{ci}</text>
        ))}
        {rows.map((row, ri) => (
          <g key={row.cohort}>
            <text x={padX - 6} y={padY + ri * cellSize + cellSize / 2 + 3} textAnchor="end" fontSize="10" fill="var(--tx-primary)">{row.cohort}</text>
            <text x={padX - 6} y={padY + ri * cellSize + cellSize / 2 + 12} textAnchor="end" fontSize="8" fill="var(--tx-muted)">n={row.cohortSize}</text>
            {row.cells.map((v, ci) => (
              <g key={ci}>
                <rect
                  x={padX + ci * cellSize + 1}
                  y={padY + ri * cellSize + 1}
                  width={cellSize - 2}
                  height={cellSize - 2}
                  rx={3}
                  fill={cellColor(v)}
                  stroke="rgba(255,255,255,0.05)"
                />
                <text
                  x={padX + ci * cellSize + cellSize / 2}
                  y={padY + ri * cellSize + cellSize / 2 + 3}
                  textAnchor="middle"
                  fontSize="9"
                  fill={v > 50 ? '#fff' : 'var(--tx-primary)'}
                  fontWeight={ci === 0 ? '700' : '400'}
                >{v}%</text>
              </g>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Step 9.2: Create `BranchComparisonWidget.jsx`**

```jsx
// src/components/backend/reports/widgets/BranchComparisonWidget.jsx
/**
 * Per-branch revenue bar chart. Custom inline SVG (no chart library).
 * Sorted desc by revenue.
 *
 * @param {object} p
 * @param {{ rows: Array<{branchId: string, branchName: string, revenue: number, saleCount: number}> }} p.data
 * @param {(n: number) => string} [p.fmtMoney]
 */
export default function BranchComparisonWidget({ data, fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH') }) {
  const rows = data?.rows || [];
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3" data-testid="widget-branch-comparison">
        <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 mb-2">เปรียบเทียบสาขา</h3>
        <p className="text-[10px] text-[var(--tx-muted)]">ไม่มีข้อมูลในช่วงเวลานี้</p>
      </div>
    );
  }

  const max = Math.max(...rows.map(r => r.revenue), 1);

  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3" data-testid="widget-branch-comparison">
      <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 mb-2">เปรียบเทียบสาขา</h3>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.branchId} className="text-[11px]" data-branch-id={r.branchId}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[var(--tx-primary)] font-bold truncate">{r.branchName}</span>
              <span className="text-sky-300 tabular-nums">{fmtMoney(r.revenue)}</span>
            </div>
            <div className="h-2 rounded bg-[var(--bg-hover)] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-700 to-sky-400"
                style={{ width: `${(r.revenue / max) * 100}%` }}
              />
            </div>
            <div className="text-[9px] text-[var(--tx-muted)] mt-0.5">{r.saleCount} sales</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 9.3: Build clean check**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

---

## Task 10: Sidebar — `ClinicReportSidebar`

**Files:**
- Create: `src/components/backend/reports/ClinicReportSidebar.jsx`
- Test: `tests/phase16.2-clinic-report-sidebar.test.jsx`

- [ ] **Step 10.1: Failing test**

```jsx
// tests/phase16.2-clinic-report-sidebar.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ClinicReportSidebar from '../src/components/backend/reports/ClinicReportSidebar.jsx';

const baseProps = {
  branches: [{ id: 'BR-A', name: 'ชลบุรี' }, { id: 'BR-B', name: 'ปทุมธานี' }],
  selectedBranchIds: ['BR-A', 'BR-B'],
  onBranchChange: vi.fn(),
  selectedPresetId: 'last6months',
  onPresetChange: vi.fn(),
  customRange: null,
  onCustomRangeChange: vi.fn(),
  selectedCategories: ['revenue', 'customers', 'operations', 'stock', 'branch'],
  onCategoryChange: vi.fn(),
  onExportPdf: vi.fn(),
  onExportCsv: vi.fn(),
  onRefresh: vi.fn(),
  loading: false,
};

describe('S1 ClinicReportSidebar', () => {
  it('S1.1 — renders all 7 preset buttons', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    for (const label of ['วันนี้', 'สัปดาห์นี้', 'เดือนนี้', 'ไตรมาสนี้', 'YTD', '6 เดือน', '12 เดือน']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('S1.2 — selected preset has data-active=true', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    const btn = screen.getByText('6 เดือน').closest('button');
    expect(btn.getAttribute('data-active')).toBe('true');
  });

  it('S1.3 — clicking preset fires onPresetChange with id', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    fireEvent.click(screen.getByText('YTD'));
    expect(baseProps.onPresetChange).toHaveBeenCalledWith('ytd');
  });

  it('S1.4 — branch checkboxes mirror selectedBranchIds', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    expect(screen.getByLabelText('ชลบุรี')).toBeChecked();
    expect(screen.getByLabelText('ปทุมธานี')).toBeChecked();
  });

  it('S1.5 — toggling branch fires onBranchChange', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    fireEvent.click(screen.getByLabelText('ปทุมธานี'));
    expect(baseProps.onBranchChange).toHaveBeenCalled();
  });

  it('S1.6 — refresh + export buttons present + wired', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(baseProps.onRefresh).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /PDF/i }));
    expect(baseProps.onExportPdf).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /CSV/i }));
    expect(baseProps.onExportCsv).toHaveBeenCalled();
  });

  it('S1.7 — loading=true disables buttons', () => {
    render(<ClinicReportSidebar {...baseProps} loading />);
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeDisabled();
  });
});
```

- [ ] **Step 10.2: Run → expect fail**

```bash
npm test -- --run tests/phase16.2-clinic-report-sidebar.test.jsx 2>&1 | tail -5
```

Expected: 7/7 fail with "import sidebar failed".

- [ ] **Step 10.3: Create `ClinicReportSidebar.jsx`**

```jsx
// src/components/backend/reports/ClinicReportSidebar.jsx
import { Download, FileText, RefreshCcw, Calendar } from 'lucide-react';
import DateField from '../../DateField.jsx';

const PRESETS = [
  { id: 'today',       label: 'วันนี้' },
  { id: 'thisWeek',    label: 'สัปดาห์นี้' },
  { id: 'thisMonth',   label: 'เดือนนี้' },
  { id: 'thisQuarter', label: 'ไตรมาสนี้' },
  { id: 'ytd',         label: 'YTD' },
  { id: 'last6months', label: '6 เดือน' },
  { id: 'last12months',label: '12 เดือน' },
];

const CATEGORIES = [
  { id: 'revenue',    label: 'รายได้' },
  { id: 'customers',  label: 'ลูกค้า' },
  { id: 'operations', label: 'ปฏิบัติการ' },
  { id: 'stock',      label: 'สต็อค' },
  { id: 'branch',     label: 'สาขา' },
];

export default function ClinicReportSidebar({
  branches,
  selectedBranchIds, onBranchChange,
  selectedPresetId, onPresetChange,
  customRange, onCustomRangeChange,
  selectedCategories, onCategoryChange,
  onExportPdf, onExportCsv, onRefresh,
  loading = false,
}) {
  const isCustom = selectedPresetId === 'custom';

  const toggleBranch = (id) => {
    const next = selectedBranchIds.includes(id)
      ? selectedBranchIds.filter(x => x !== id)
      : [...selectedBranchIds, id];
    onBranchChange(next);
  };

  const toggleCategory = (id) => {
    const next = selectedCategories.includes(id)
      ? selectedCategories.filter(x => x !== id)
      : [...selectedCategories, id];
    onCategoryChange(next);
  };

  return (
    <aside className="w-[200px] shrink-0 sticky top-4 space-y-4 self-start" data-testid="clinic-report-sidebar">
      <Section title="🏥 สาขา">
        {branches.map(b => (
          <label key={b.id} className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-cyan-400" data-branch-id={b.id}>
            <input
              type="checkbox"
              checked={selectedBranchIds.includes(b.id)}
              onChange={() => toggleBranch(b.id)}
              aria-label={b.name}
            />
            <span>{b.name}</span>
          </label>
        ))}
        {branches.length === 0 && <p className="text-[10px] text-[var(--tx-muted)]">ไม่มีสาขา</p>}
      </Section>

      <Section title="📅 ช่วงเวลา">
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPresetChange(p.id)}
            data-active={selectedPresetId === p.id ? 'true' : 'false'}
            data-preset={p.id}
            className={`block w-full text-left px-2 py-1 rounded text-xs transition-colors ${
              selectedPresetId === p.id
                ? 'bg-cyan-700/30 text-cyan-200 border-l-2 border-cyan-400'
                : 'text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] hover:text-cyan-400'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPresetChange('custom')}
          data-active={isCustom ? 'true' : 'false'}
          data-preset="custom"
          className={`block w-full text-left px-2 py-1 rounded text-xs transition-colors mt-1 ${
            isCustom ? 'bg-cyan-700/30 text-cyan-200' : 'text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Calendar size={10} className="inline mr-1" />Custom...
        </button>
        {isCustom && (
          <div className="mt-2 space-y-1">
            <DateField
              size="sm"
              value={customRange?.from || ''}
              onChange={(v) => onCustomRangeChange({ from: v, to: customRange?.to || '' })}
            />
            <DateField
              size="sm"
              value={customRange?.to || ''}
              onChange={(v) => onCustomRangeChange({ from: customRange?.from || '', to: v })}
            />
          </div>
        )}
      </Section>

      <Section title="⚙️ หมวด">
        {CATEGORIES.map(c => (
          <label key={c.id} className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-cyan-400">
            <input
              type="checkbox"
              checked={selectedCategories.includes(c.id)}
              onChange={() => toggleCategory(c.id)}
              aria-label={c.label}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </Section>

      <Section title="📤 Export">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh"
          className="flex items-center gap-1 w-full px-2 py-1.5 text-xs rounded bg-[var(--bg-hover)] hover:bg-cyan-900/30 text-cyan-300 disabled:opacity-50"
        >
          <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        <button
          type="button"
          onClick={onExportPdf}
          aria-label="Export PDF"
          className="flex items-center gap-1 w-full px-2 py-1.5 text-xs rounded bg-[var(--bg-hover)] hover:bg-rose-900/30 text-rose-300 mt-1"
        >
          <FileText size={12} /> PDF
        </button>
        <button
          type="button"
          onClick={onExportCsv}
          aria-label="Export CSV"
          className="flex items-center gap-1 w-full px-2 py-1.5 text-xs rounded bg-[var(--bg-hover)] hover:bg-emerald-900/30 text-emerald-300 mt-1"
        >
          <Download size={12} /> CSV
        </button>
      </Section>
    </aside>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-2 space-y-1">
      <h3 className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold mb-1">{title}</h3>
      {children}
    </div>
  );
}
```

- [ ] **Step 10.4: Run → expect pass**

```bash
npm test -- --run tests/phase16.2-clinic-report-sidebar.test.jsx 2>&1 | tail -5
```

Expected: 7/7 PASS.

---

## Task 11: Tab — `ClinicReportTab`

**Files:**
- Create: `src/components/backend/reports/ClinicReportTab.jsx`
- Test: `tests/phase16.2-clinic-report-tab.test.jsx`

- [ ] **Step 11.1: Failing test**

```jsx
// tests/phase16.2-clinic-report-tab.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../src/lib/clinicReportAggregator.js', () => ({
  clinicReportAggregator: vi.fn(),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branches: [{ id: 'BR-A', name: 'ชลบุรี' }], branchId: 'BR-A' }),
}));
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useTabAccess: () => ({ canAccessTab: () => true, isAdmin: true }),
  useHasPermission: () => () => true,
}));

import { clinicReportAggregator } from '../src/lib/clinicReportAggregator.js';
import ClinicReportTab from '../src/components/backend/reports/ClinicReportTab.jsx';

const SNAPSHOT = {
  tiles: { revenueYtd: 28000, momGrowth: 12, newCustomersPerMonth: 3.5, retentionRate: 66, avgTicket: 7000, courseUtilization: 47, noShowRate: 8, expenseRatio: 14 },
  charts: {
    revenueTrend: [{ label: '2026-04', value: 28000 }],
    newCustomersTrend: [],
    retentionCohort: { rows: [{ cohort: '2025-11', cohortSize: 2, cells: [100, 50] }], overallRate: 50 },
    branchComparison: { rows: [{ branchId: 'BR-A', branchName: 'ชลบุรี', revenue: 28000, saleCount: 4 }] },
    cashFlow: [],
    apptFillRate: 80,
  },
  tables: {
    topServices: [{ name: 'ดริปผิวใส', revenue: 2400000, count: 142 }],
    topDoctors: [{ staffName: 'Dr.A', total: 3100000 }],
    topProducts: [{ name: 'BA Vitamin', value: 800000, qty: 100 }],
  },
  meta: { generatedAt: '2026-04-29T12:00:00.000Z', branchScope: 'all', partialErrors: null, filterApplied: { from: '2025-11-01', to: '2026-04-30' } },
};

describe('T1 ClinicReportTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clinicReportAggregator.mockResolvedValue(SNAPSHOT);
  });

  it('T1.1 — renders sidebar + KPI tiles after load', async () => {
    const onNavigate = vi.fn();
    render(<ClinicReportTab onNavigate={onNavigate} />);
    expect(screen.getByTestId('clinic-report-sidebar')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('28,000')).toBeInTheDocument()); // revenueYtd
  });

  it('T1.2 — drilldown click fires onNavigate with correct tabId', async () => {
    const onNavigate = vi.fn();
    render(<ClinicReportTab onNavigate={onNavigate} />);
    await waitFor(() => screen.getByText('ดริปผิวใส'));
    const drilldownBtn = screen.getAllByText(/ดูทั้งหมด/i)[0].closest('button');
    fireEvent.click(drilldownBtn);
    const calledTabId = onNavigate.mock.calls[0][0];
    // expect a known reports-* tabId (sale or stock or staff)
    expect(['reports-sale', 'reports-staff-sales', 'reports-stock']).toContain(calledTabId);
  });

  it('T1.3 — empty data state when aggregator returns empty', async () => {
    clinicReportAggregator.mockResolvedValueOnce({
      tiles: { revenueYtd: 0, momGrowth: null, newCustomersPerMonth: 0, retentionRate: 0, avgTicket: 0, courseUtilization: 0, noShowRate: 0, expenseRatio: 0 },
      charts: { revenueTrend: [], newCustomersTrend: [], retentionCohort: { rows: [], overallRate: 0 }, branchComparison: { rows: [] }, cashFlow: [], apptFillRate: 0 },
      tables: { topServices: [], topDoctors: [], topProducts: [] },
      meta: { generatedAt: '2026-04-29T12:00:00.000Z', branchScope: 'all', partialErrors: null, filterApplied: {} },
    });
    render(<ClinicReportTab onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText(/ไม่มีข้อมูลในช่วงเวลานี้/).length).toBeGreaterThan(0));
  });
});
```

- [ ] **Step 11.2: Run → expect fail**

```bash
npm test -- --run tests/phase16.2-clinic-report-tab.test.jsx 2>&1 | tail -5
```

Expected: 3/3 fail.

- [ ] **Step 11.3: Create `ClinicReportTab.jsx`**

```jsx
// src/components/backend/reports/ClinicReportTab.jsx
import { useState, useMemo, useRef } from 'react';
import { BarChart3, AlertCircle } from 'lucide-react';
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';
import { useTabAccess } from '../../../hooks/useTabAccess.js';
import { useClinicReport } from '../../../hooks/useClinicReport.js';
import ClinicReportSidebar from './ClinicReportSidebar.jsx';
import KpiTile from './widgets/KpiTile.jsx';
import RankedTableWidget from './widgets/RankedTableWidget.jsx';
import RetentionHeatmapWidget from './widgets/RetentionHeatmapWidget.jsx';
import BranchComparisonWidget from './widgets/BranchComparisonWidget.jsx';
import { AreaSparkline } from './FancyCharts.jsx';
import { downloadCsv } from '../../../lib/clinicReportCsv.js';
import { exportDocumentToPdf } from '../../../lib/documentPrintEngine.js';
import { fmtMoney } from '../../../lib/financeUtils.js';
import { thaiTodayISO } from '../../../utils.js';

// Drilldown map: widget → existing detail tabId (null = no drilldown)
const DRILLDOWN_MAP = {
  revenueTrend:    'reports-revenue',
  newCustomers:    'reports-customer',
  retentionCohort: 'reports-rfm',
  topServices:     'reports-sale',
  topDoctors:      'reports-staff-sales',
  topProducts:     'reports-stock',
  branchCompare:   null,
  cashFlow:        'reports-pnl',
  expenseRatio:    'reports-pnl',
  apptFillRate:    'reports-appointment',
  noShowRate:      'reports-appt-analysis',
  courseUtil:      'reports-remaining-course',
};

function buildPresetRange(presetId) {
  const today = thaiTodayISO();
  const [y, m, d] = today.split('-').map(Number);
  const iso = (yr, mo, da) => `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  const subDays = (n) => {
    const dt = new Date(Date.UTC(y, m - 1, d) - n * 86400000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  };
  const subMonths = (n) => {
    const dt = new Date(Date.UTC(y, m - 1 - n, d));
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  };
  switch (presetId) {
    case 'today':        return { from: today,            to: today };
    case 'thisWeek':     return { from: subDays(6),       to: today };
    case 'thisMonth':    return { from: iso(y, m, 1),     to: today };
    case 'thisQuarter': {
      const qStart = ((Math.ceil(m / 3) - 1) * 3) + 1;
      return { from: iso(y, qStart, 1), to: today };
    }
    case 'ytd':          return { from: iso(y, 1, 1),     to: today };
    case 'last6months':  return { from: subMonths(6),     to: today };
    case 'last12months': return { from: subMonths(12),    to: today };
    default:             return null;
  }
}

export default function ClinicReportTab({ onNavigate }) {
  const { branches, branchId: currentBranchId } = useSelectedBranch();
  const { canAccessTab, isAdmin } = useTabAccess();
  const dashboardRootRef = useRef(null);

  // Permission gate
  if (!canAccessTab('clinic-report')) {
    return (
      <div className="p-6 text-center text-[var(--tx-muted)]" data-testid="clinic-report-no-access">
        <AlertCircle className="inline mr-2" size={16} />
        ไม่มีสิทธิ์ดูรายงานคลินิก
      </div>
    );
  }

  // Branch scoping — admin sees all; non-admin sees their branchIds[] (subset of branches)
  const effectiveBranches = isAdmin ? branches : branches.filter(b => b.id === currentBranchId);
  const [selectedBranchIds, setSelectedBranchIds] = useState(effectiveBranches.map(b => b.id));
  const [selectedPresetId, setSelectedPresetId] = useState('last6months');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [selectedCategories, setSelectedCategories] = useState(['revenue', 'customers', 'operations', 'stock', 'branch']);

  const dateRange = useMemo(() => {
    if (selectedPresetId === 'custom' && customRange.from && customRange.to) {
      return customRange;
    }
    return buildPresetRange(selectedPresetId) || buildPresetRange('last6months');
  }, [selectedPresetId, customRange]);

  const filter = useMemo(() => ({
    from: dateRange.from,
    to: dateRange.to,
    branchIds: selectedBranchIds,
    categories: selectedCategories,
  }), [dateRange, selectedBranchIds, selectedCategories]);

  const { snapshot, loading, error, refresh } = useClinicReport(filter);

  const handleExportPdf = async () => {
    if (!dashboardRootRef.current) return;
    try {
      await exportDocumentToPdf({
        element: dashboardRootRef.current,
        filename: `clinic-report-${dateRange.from}-${dateRange.to}.pdf`,
        orientation: 'landscape',
      });
    } catch (e) {
      console.error('[ClinicReport] PDF export failed', e);
    }
  };

  const handleExportCsv = () => {
    if (!snapshot) return;
    downloadCsv(snapshot, `clinic-report-${dateRange.from}-${dateRange.to}.csv`);
  };

  const showCat = (cat) => selectedCategories.includes(cat);

  return (
    <div className="flex gap-4" data-testid="clinic-report-tab">
      <ClinicReportSidebar
        branches={effectiveBranches}
        selectedBranchIds={selectedBranchIds}
        onBranchChange={setSelectedBranchIds}
        selectedPresetId={selectedPresetId}
        onPresetChange={setSelectedPresetId}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        selectedCategories={selectedCategories}
        onCategoryChange={setSelectedCategories}
        onExportPdf={handleExportPdf}
        onExportCsv={handleExportCsv}
        onRefresh={refresh}
        loading={loading}
      />
      <div ref={dashboardRootRef} className="flex-1 space-y-3" data-testid="clinic-report-grid">
        <header className="flex items-center gap-2 mb-2">
          <BarChart3 size={16} className="text-cyan-400" />
          <h2 className="text-base font-bold text-[var(--tx-heading)]">รายงานคลินิก</h2>
          <span className="text-[10px] text-[var(--tx-muted)]">
            {dateRange.from} → {dateRange.to}
          </span>
        </header>
        {error && (
          <div className="text-rose-300 text-xs p-2 bg-rose-900/20 rounded">
            <AlertCircle size={12} className="inline mr-1" />
            {error}
          </div>
        )}
        {snapshot?.meta?.partialErrors && (
          <div className="text-amber-300 text-[10px] p-2 bg-amber-900/20 rounded">
            <AlertCircle size={10} className="inline mr-1" />
            บาง widget โหลดข้อมูลไม่ครบ — กดรีเฟรชเพื่อลองใหม่
          </div>
        )}
        {snapshot && (
          <>
            {/* Row 1: 4 KPI tiles */}
            <div className="grid grid-cols-4 gap-2">
              <KpiTile label="รายได้ YTD"  value={fmtMoney(snapshot.tiles.revenueYtd)}        drilldownTabId={DRILLDOWN_MAP.revenueTrend} onNavigate={onNavigate} />
              <KpiTile label="M-o-M %"     value={snapshot.tiles.momGrowth == null ? '—' : `${snapshot.tiles.momGrowth}%`} tone={snapshot.tiles.momGrowth >= 0 ? 'positive' : 'negative'} />
              <KpiTile label="ลูกค้าใหม่/ด."  value={snapshot.tiles.newCustomersPerMonth.toFixed(1)} drilldownTabId={DRILLDOWN_MAP.newCustomers} onNavigate={onNavigate} />
              <KpiTile label="Retention"   value={`${snapshot.tiles.retentionRate}%`} drilldownTabId={DRILLDOWN_MAP.retentionCohort} onNavigate={onNavigate} />
            </div>
            {/* Row 2: 4 KPI tiles */}
            <div className="grid grid-cols-4 gap-2">
              <KpiTile label="Avg ticket"  value={fmtMoney(snapshot.tiles.avgTicket)} />
              <KpiTile label="Course Util" value={`${snapshot.tiles.courseUtilization}%`} drilldownTabId={DRILLDOWN_MAP.courseUtil} onNavigate={onNavigate} />
              <KpiTile label="No-show %"   value={`${snapshot.tiles.noShowRate}%`} tone="warn" drilldownTabId={DRILLDOWN_MAP.noShowRate} onNavigate={onNavigate} />
              <KpiTile label="Expense %"   value={`${snapshot.tiles.expenseRatio}%`} drilldownTabId={DRILLDOWN_MAP.expenseRatio} onNavigate={onNavigate} />
            </div>
            {/* Charts */}
            {showCat('revenue') && (
              <div className="grid grid-cols-2 gap-2">
                <ChartTile title="📈 Revenue trend M-o-M" data={snapshot.charts.revenueTrend} stroke="#06b6d4" drilldownTabId={DRILLDOWN_MAP.revenueTrend} onNavigate={onNavigate} />
                <ChartTile title="📊 New customers M-o-M" data={snapshot.charts.newCustomersTrend} stroke="#10b981" drilldownTabId={DRILLDOWN_MAP.newCustomers} onNavigate={onNavigate} />
              </div>
            )}
            {showCat('operations') && (
              <div className="grid grid-cols-2 gap-2">
                <ChartTile title="💰 Cash flow" data={snapshot.charts.cashFlow} stroke="#a855f7" drilldownTabId={DRILLDOWN_MAP.cashFlow} onNavigate={onNavigate} />
                <RetentionHeatmapWidget data={snapshot.charts.retentionCohort} drilldownTabId={DRILLDOWN_MAP.retentionCohort} onNavigate={onNavigate} />
              </div>
            )}
            {showCat('branch') && <BranchComparisonWidget data={snapshot.charts.branchComparison} fmtMoney={fmtMoney} />}
            {/* Top-10 tables */}
            {showCat('revenue') && (
              <div className="grid grid-cols-3 gap-2">
                <RankedTableWidget title="🏆 Top-10 services" rows={snapshot.tables.topServices} fmtKeys={{ value: 'revenue', qty: 'count' }} drilldownTabId={DRILLDOWN_MAP.topServices} onNavigate={onNavigate} fmtMoney={fmtMoney} testId="ranked-services" />
                <RankedTableWidget title="🩺 Top-10 doctors"  rows={snapshot.tables.topDoctors}  fmtKeys={{ value: 'total' }}                drilldownTabId={DRILLDOWN_MAP.topDoctors}  onNavigate={onNavigate} fmtMoney={fmtMoney} testId="ranked-doctors" />
                <RankedTableWidget title="📦 Top-10 products" rows={snapshot.tables.topProducts} fmtKeys={{ value: 'value', qty: 'qty' }}   drilldownTabId={DRILLDOWN_MAP.topProducts} onNavigate={onNavigate} fmtMoney={fmtMoney} testId="ranked-products" />
              </div>
            )}
          </>
        )}
        {loading && !snapshot && <p className="text-xs text-[var(--tx-muted)] p-4 text-center">กำลังโหลดข้อมูล...</p>}
      </div>
    </div>
  );
}

function ChartTile({ title, data, stroke, drilldownTabId, onNavigate }) {
  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3" data-testid={`chart-${title}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">{title}</h3>
        {drilldownTabId && (
          <button
            type="button"
            onClick={() => onNavigate?.(drilldownTabId)}
            className="text-[10px] text-cyan-400 hover:text-cyan-300"
            data-drilldown-target={drilldownTabId}
          >
            ดูรายละเอียด →
          </button>
        )}
      </div>
      {data && data.length > 0 ? (
        <AreaSparkline data={data} stroke={stroke} width={400} height={120} />
      ) : (
        <p className="text-[10px] text-[var(--tx-muted)]">ไม่มีข้อมูลในช่วงเวลานี้</p>
      )}
    </div>
  );
}
```

**Note**: `exportDocumentToPdf` may have a different exact signature. Verify in `src/lib/documentPrintEngine.js` and adjust the call. The pattern from V32 is `html2canvas + jsPDF.addImage` — if the exported helper takes different params, adapt the call.

- [ ] **Step 11.4: Run → expect pass**

```bash
npm test -- --run tests/phase16.2-clinic-report-tab.test.jsx 2>&1 | tail -8
```

Expected: 3/3 PASS. If `exportDocumentToPdf` signature mismatch breaks the import → adjust + re-run.

- [ ] **Step 11.5: Run all phase16.2 tests + build**

```bash
npm test -- --run tests/phase16.2 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

Expected: ALL phase16.2 tests pass · build clean.

---

## Task 12: Wire navigation entry + lazy import

**Files:**
- Modify: `src/components/backend/nav/navConfig.js` (add entry to reports section)
- Modify: `src/pages/BackendDashboard.jsx` (lazy import + render case)

- [ ] **Step 12.1: Failing tests (extend tab test)**

Append to `tests/phase16.2-clinic-report-tab.test.jsx`:

```js
import { existsSync, readFileSync } from 'node:fs';

describe('T2 nav wiring', () => {
  it('T2.1 — navConfig has clinic-report entry in reports section', () => {
    const src = readFileSync('src/components/backend/nav/navConfig.js', 'utf8');
    expect(src).toMatch(/id:\s*['"]clinic-report['"]/);
    expect(src).toMatch(/รายงานคลินิก/);
  });

  it('T2.2 — BackendDashboard has lazy import + render case', () => {
    const src = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\([^)]*ClinicReportTab[^)]*\)/);
    expect(src).toMatch(/case\s+['"]clinic-report['"]/);
  });
});
```

- [ ] **Step 12.2: Run → expect 2/2 fail**

```bash
npm test -- --run tests/phase16.2-clinic-report-tab.test.jsx -t "T2" 2>&1 | tail -5
```

- [ ] **Step 12.3: Add nav entry**

Open `src/components/backend/nav/navConfig.js`. Find the reports section (around line 122 where `reports-sale` is defined). Add NEW entry after `reports-pnl` (line 131):

```js
      { id: 'reports-pnl',           label: 'กำไรขาดทุน (P&L)',    icon: TrendingUp,      color: 'emerald', palette: 'pnl profit loss P&L กำไรขาดทุน profit-and-loss' },
      { id: 'clinic-report',         label: 'รายงานคลินิก',       icon: BarChart3,       color: 'amber',   palette: 'clinic report ภาพรวม executive dashboard kpi รายงานคลินิก' },
```

(Use Edit tool with sufficient surrounding context for unique match. `BarChart3` is already imported in navConfig.js — verify with a quick grep. If not, add it to the import block.)

- [ ] **Step 12.4: Add lazy import + render case in BackendDashboard.jsx**

Open `src/pages/BackendDashboard.jsx`. Find the existing report-tab lazy imports (search for `lazy(() => import('../components/backend/reports/`). Add:

```jsx
const ClinicReportTab = lazy(() => import('../components/backend/reports/ClinicReportTab.jsx'));
```

Find the render switch (search for `case 'reports-sale':` or similar). Add case:

```jsx
case 'clinic-report':
  return <Suspense fallback={<TabLoading />}><ClinicReportTab onNavigate={setActiveTabId} /></Suspense>;
```

(Use the actual existing case patterns to match — the prop names like `onNavigate` / `setActiveTabId` may be different in the existing file.  Verify by reading the existing `case 'reports-sale':` block + matching its style exactly.)

- [ ] **Step 12.5: Run → expect pass**

```bash
npm test -- --run tests/phase16.2-clinic-report-tab.test.jsx -t "T2" 2>&1 | tail -5
```

Expected: 2/2 PASS.

- [ ] **Step 12.6: Build clean check**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

---

## Task 13: Phase 16.2 full-flow simulate test (Rule I)

**File:**
- Create: `tests/phase16.2-clinic-report-flow-simulate.test.js`

Per Rule I (00-session-start.md): every sub-phase that touches user-visible flow must have a flow-simulate that chains EVERY step the user exercises. Helper-only tests aren't enough.

- [ ] **Step 13.1: Create flow-simulate test**

```js
// tests/phase16.2-clinic-report-flow-simulate.test.js
//
// Phase 16.2 full-flow simulate per Rule I. Chains: filter init → fetch →
// compose snapshot → tile rendering → CSV export → drilldown click → branch
// toggle → cache invalidation → second fetch → V14 no-undefined.
//
// Mocks the Firestore I/O (backendClient list-* fns) but exercises the real
// composeClinicReportSnapshot + helpers + CSV builder + DRILLDOWN_MAP.
//
// + Source-grep regression guards (item c per Rule I)
// + Adversarial inputs (item d)
// + Lifecycle assertions (item e)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../src/lib/backendClient.js', () => ({
  listSales: vi.fn(),
  listAllCustomers: vi.fn(),
  listAppointments: vi.fn(),
  listAllStaff: vi.fn(),
  listDoctors: vi.fn(),
  listProducts: vi.fn(),
  listStockBatches: vi.fn(),
  listCourses: vi.fn(),
  listExpenses: vi.fn(),
  listBranches: vi.fn(),
}));

import * as backend from '../src/lib/backendClient.js';
import { fetchClinicReportData, composeClinicReportSnapshot, clinicReportAggregator } from '../src/lib/clinicReportAggregator.js';
import { toCsv } from '../src/lib/clinicReportCsv.js';

const FIXTURE_BRANCHES = [
  { id: 'BR-A', name: 'ชลบุรี', isDefault: true },
  { id: 'BR-B', name: 'ปทุมธานี' },
];

const FIXTURE_SALES = [
  { id: 's1', customerId: 'c1', branchId: 'BR-A', total: 5000,  saleDate: '2025-11-05', status: 'paid', items: { courses: [{ courseId: 'co1', courseName: 'ดริปผิวใส', qty: 1, lineTotal: 5000 }] } },
  { id: 's2', customerId: 'c2', branchId: 'BR-A', total: 4000,  saleDate: '2025-11-20', status: 'paid', items: { courses: [{ courseId: 'co1', courseName: 'ดริปผิวใส', qty: 1, lineTotal: 4000 }] } },
  { id: 's3', customerId: 'c1', branchId: 'BR-A', total: 2000,  saleDate: '2025-12-15', status: 'paid', items: {} },
  { id: 's4', customerId: 'c3', branchId: 'BR-B', total: 8000,  saleDate: '2025-12-10', status: 'paid', items: {} },
  { id: 's5', customerId: 'c1', branchId: 'BR-A', total: 3000,  saleDate: '2026-01-20', status: 'paid', items: {} },
  { id: 's6', customerId: 'c3', branchId: 'BR-B', total: 1500,  saleDate: '2026-01-25', status: 'paid', items: {} },
  { id: 's7', customerId: 'c4', branchId: 'BR-A', total: 12000, saleDate: '2026-04-20', status: 'paid', items: {} },
  { id: 's8', customerId: 'c5', branchId: 'BR-A', total: 99999, saleDate: '2026-04-22', status: 'cancelled', items: {} }, // excluded
];

const FIXTURE_CUSTOMERS = [
  { id: 'c1', createdAt: '2025-11-05', branchId: 'BR-A' },
  { id: 'c2', createdAt: '2025-11-20', branchId: 'BR-A' },
  { id: 'c3', createdAt: '2025-12-10', branchId: 'BR-B' },
  { id: 'c4', createdAt: '2026-04-19', branchId: 'BR-A', courses: [{ qty: 10, qtyRemaining: 4 }, { qty: 5, qtyRemaining: 1 }] },
  { id: 'c5', createdAt: '2026-04-22', branchId: 'BR-A' },
];

function setupMocks() {
  vi.clearAllMocks();
  backend.listSales.mockResolvedValue(FIXTURE_SALES);
  backend.listAllCustomers.mockResolvedValue(FIXTURE_CUSTOMERS);
  backend.listAppointments.mockResolvedValue([]);
  backend.listAllStaff.mockResolvedValue([]);
  backend.listDoctors.mockResolvedValue([{ id: 'd1', name: 'Dr.A', role: 'doctor' }]);
  backend.listProducts.mockResolvedValue([{ id: 'p1', name: 'BA Vitamin' }]);
  backend.listStockBatches.mockResolvedValue([{ id: 'b1', productId: 'p1', productName: 'BA Vitamin', qty: { remaining: 10, total: 10 } }]);
  backend.listCourses.mockResolvedValue([{ id: 'co1', name: 'ดริปผิวใส', procedure_type_name: 'IV', category_name: 'Skin' }]);
  backend.listExpenses.mockResolvedValue([{ id: 'e1', amount: 4000, expenseDate: '2026-04-15' }]);
  backend.listBranches.mockResolvedValue(FIXTURE_BRANCHES);
}

describe('FS1 Full flow — Phase 16.2', () => {
  beforeEach(setupMocks);

  it('FS1.1 — Default 6-month filter → snapshot has all 12 widgets populated', async () => {
    const filter = { from: '2025-11-01', to: '2026-04-30', branchIds: ['BR-A', 'BR-B'] };
    const snap = await clinicReportAggregator(filter);
    // Tiles
    expect(snap.tiles.revenueYtd).toBeGreaterThan(0);
    expect(snap.tiles.expenseRatio).toBeGreaterThanOrEqual(0);
    // Charts
    expect(snap.charts.revenueTrend.length).toBeGreaterThan(0);
    expect(snap.charts.retentionCohort.rows.length).toBeGreaterThan(0);
    expect(snap.charts.branchComparison.rows.length).toBe(2);
    // Tables
    expect(snap.tables.topServices.length).toBeGreaterThanOrEqual(1);
    // Meta
    expect(snap.meta.generatedAt).toMatch(/^\d{4}/);
  });

  it('FS1.2 — Branch filter clamps revenue to selected branches only', async () => {
    const aSnap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30', branchIds: ['BR-A'] });
    const bSnap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30', branchIds: ['BR-B'] });
    expect(aSnap.tiles.revenueYtd).not.toBe(bSnap.tiles.revenueYtd);
    expect(aSnap.charts.branchComparison.rows.every(r => r.branchId === 'BR-A')).toBe(true);
  });

  it('FS1.3 — Cancelled sales never inflate revenue', async () => {
    const snap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30' });
    // s8 cancelled (99999) should NOT be in revenueYtd
    expect(snap.tiles.revenueYtd).toBeLessThan(99999);
  });

  it('FS1.4 — CSV export round-trip preserves Thai + has BOM', async () => {
    const snap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30' });
    const csv = toCsv(snap);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain('ชลบุรี');
  });

  it('FS1.5 — Lifecycle: cache key changes when branchIds change order (NORMALIZED)', async () => {
    // Simulate two filters that LOOK different but are equivalent (sorted branchIds)
    // The hook should treat them as equal — verified separately in H1.3.
    // Here: just confirm orchestrator output is identical for sorted vs reversed
    const a = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30', branchIds: ['BR-A', 'BR-B'] });
    const b = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30', branchIds: ['BR-B', 'BR-A'] });
    // They should produce the same snapshot (modulo generatedAt timestamp drift)
    expect(a.tiles.revenueYtd).toBe(b.tiles.revenueYtd);
  });

  it('FS1.6 — Adversarial: empty arrays everywhere → snapshot all zeros, no crash', async () => {
    backend.listSales.mockResolvedValueOnce([]);
    backend.listAllCustomers.mockResolvedValueOnce([]);
    backend.listExpenses.mockResolvedValueOnce([]);
    backend.listBranches.mockResolvedValueOnce([]);
    const snap = await clinicReportAggregator({ from: '2026-04-01', to: '2026-04-30' });
    expect(snap.tiles.revenueYtd).toBe(0);
    expect(snap.charts.revenueTrend).toEqual([]);
  });

  it('FS1.7 — Adversarial: one fetch fails → partial snapshot still produced', async () => {
    backend.listExpenses.mockRejectedValueOnce(new Error('expense db down'));
    const snap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30' });
    expect(snap.meta.partialErrors?.expenses).toMatch(/expense db down/);
    // Other tiles still computed
    expect(snap.tiles.revenueYtd).toBeGreaterThan(0);
  });

  it('FS1.8 — V14 no-undefined sweep across the whole snapshot tree', async () => {
    const snap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30' });
    function walk(obj, path = '$') {
      if (obj === undefined) throw new Error(`undefined at ${path}`);
      if (obj === null || typeof obj !== 'object') return;
      if (Array.isArray(obj)) obj.forEach((v, i) => walk(v, `${path}[${i}]`));
      else Object.entries(obj).forEach(([k, v]) => walk(v, `${path}.${k}`));
    }
    expect(() => walk(snap)).not.toThrow();
  });
});

describe('FS2 Source-grep regression guards', () => {
  it('FS2.1 — clinicReportAggregator does NOT import master_data (H-quater)', () => {
    const src = readFileSync('src/lib/clinicReportAggregator.js', 'utf8');
    expect(src).not.toMatch(/master_data/);
  });

  it('FS2.2 — clinicReportAggregator does NOT import brokerClient or /api/proclinic (Rule E)', () => {
    const src = readFileSync('src/lib/clinicReportAggregator.js', 'utf8');
    expect(src).not.toMatch(/brokerClient/);
    expect(src).not.toMatch(/\/api\/proclinic/);
  });

  it('FS2.3 — useClinicReport does NOT setInterval (zero polling)', () => {
    const src = readFileSync('src/hooks/useClinicReport.js', 'utf8');
    expect(src).not.toMatch(/setInterval/);
  });

  it('FS2.4 — ClinicReportTab uses onNavigate prop (not window.location)', () => {
    const src = readFileSync('src/components/backend/reports/ClinicReportTab.jsx', 'utf8');
    expect(src).toMatch(/onNavigate/);
    expect(src).not.toMatch(/window\.location\.assign|window\.location\.href\s*=/);
  });

  it('FS2.5 — All reused aggregators imported are existing files', () => {
    const src = readFileSync('src/lib/clinicReportAggregator.js', 'utf8');
    const importMatches = [...src.matchAll(/from\s+'\.\/([\w-]+Aggregator)\.js'/g)].map(m => m[1]);
    for (const name of importMatches) {
      // Each must reference an existing file in src/lib/
      expect(() => readFileSync(`src/lib/${name}.js`, 'utf8')).not.toThrow();
    }
  });
});
```

- [ ] **Step 13.2: Run → expect pass (already-implemented code passes the simulate)**

```bash
npm test -- --run tests/phase16.2-clinic-report-flow-simulate.test.js 2>&1 | tail -10
```

Expected: 13/13 PASS.

- [ ] **Step 13.3: Run all phase16.2 tests + full suite + build**

```bash
npm test -- --run tests/phase16.2 2>&1 | tail -5
npm test -- --run 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

Expected: all phase16.2 tests pass · full suite ~3771 + ~62 = ~3833 PASS · build clean.

---

## Task 14: CODEBASE_MAP + SESSION_HANDOFF + final verification

**Files:**
- Modify: `CODEBASE_MAP.md`
- Modify: `SESSION_HANDOFF.md`
- Modify: `.agents/active.md`

- [ ] **Step 14.1: Update CODEBASE_MAP.md**

Read the file first to find the right section. Add the 9 new files under the relevant section (likely under "src/components/backend/reports/" + "src/lib/" + "src/hooks/").

Sample additions:

```markdown
## src/lib/
+ `clinicReportAggregator.js` — Phase 16.2 orchestrator: fetchClinicReportData + composeClinicReportSnapshot + clinicReportAggregator wrapper
+ `clinicReportHelpers.js` — Phase 16.2 pure helpers: computeKpiTiles + computeRetentionCohort + computeBranchComparison
+ `clinicReportCsv.js` — Phase 16.2 CSV exporter: toCsv + downloadCsv (UTF-8 BOM)

## src/hooks/
+ `useClinicReport.js` — Phase 16.2 smart hybrid cache hook (filter-keyed)

## src/components/backend/reports/
+ `ClinicReportTab.jsx` — Phase 16.2 root tab (sidebar + 12 widgets)
+ `ClinicReportSidebar.jsx` — Phase 16.2 sticky filter rail
+ widgets/KpiTile.jsx · widgets/RankedTableWidget.jsx · widgets/RetentionHeatmapWidget.jsx · widgets/BranchComparisonWidget.jsx
```

- [ ] **Step 14.2: Update SESSION_HANDOFF.md**

Add a Phase 16.2 entry block at the top of "Current State" section. Concise.

- [ ] **Step 14.3: Update .agents/active.md**

Set `current_focus: "Phase 16.2 Clinic Report SHIPPED. Awaiting QA + V15 #10 deploy auth."`. Update `last_commit` after the actual commit lands.

- [ ] **Step 14.4: Final test + build verification**

```bash
npm test -- --run 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

Expected: all PASS · build clean. Capture exact test count → use in commit message.

- [ ] **Step 14.5: Verify zero edits to existing aggregators / detail tabs**

```bash
git status
git diff --name-only origin/master HEAD 2>/dev/null || git diff --name-only HEAD~1 HEAD 2>/dev/null
```

Expected modified files (small list):
- `src/lib/permissionGroupValidation.js` (1 row added)
- `src/lib/tabPermissions.js` (1 row added)
- `src/components/backend/nav/navConfig.js` (1 entry added)
- `src/pages/BackendDashboard.jsx` (lazy import + render case)
- `CODEBASE_MAP.md`, `SESSION_HANDOFF.md`, `.agents/active.md`

NEW files:
- 9 source files (lib + hook + components)
- 7 test files

If any aggregator (`*Aggregator.js`) or any existing report tab (`*Tab.jsx`) appears in the diff → STOP. That violates user's "ห้ามเปลี่ยน wiring เดิม" constraint. Investigate + revert that file.

- [ ] **Step 14.6: Commit + push (BUNDLES the spec doc per user directive)**

```bash
git add docs/superpowers/specs/2026-04-29-phase16-2-clinic-report-design.md \
        docs/superpowers/plans/2026-04-29-phase16-2-clinic-report.md \
        src/lib/clinicReportAggregator.js \
        src/lib/clinicReportHelpers.js \
        src/lib/clinicReportCsv.js \
        src/hooks/useClinicReport.js \
        src/components/backend/reports/ClinicReportTab.jsx \
        src/components/backend/reports/ClinicReportSidebar.jsx \
        src/components/backend/reports/widgets/ \
        src/lib/permissionGroupValidation.js \
        src/lib/tabPermissions.js \
        src/components/backend/nav/navConfig.js \
        src/pages/BackendDashboard.jsx \
        tests/phase16.2-*.test.js tests/phase16.2-*.test.jsx \
        CODEBASE_MAP.md SESSION_HANDOFF.md .agents/active.md \
        .gitignore
git commit -m "$(cat <<'EOF'
feat(reports): Phase 16.2 — Clinic Report executive dashboard tab

12-widget consolidator dashboard with sticky filter rail (branch +
7 date presets + custom + category toggles), smart hybrid cache hook,
PDF + CSV export, drilldown links to existing detail tabs.

NEW permission key `report_clinic_summary` (branch-scoped via
branchIds[]). 9 brainstorm Q&A locked: Both audience · Comprehensive
KPIs · Sticky-filter-rail layout · Smart presets + custom picker ·
NEW perm + branch-scoped · PDF+CSV · Smart hybrid cache · Link
drilldown · Orchestrator architecture.

Per user constraint "ห้ามเปลี่ยน wiring เดิม" — zero edits to any
existing aggregator (11 files) or any existing detail report tab
(13 files). Strictly additive: 9 NEW files + 4 small additive edits
(permission key row · tab gate row · nav entry · lazy import).

Tests: +62 across 7 phase16.2-* test files (helpers / aggregator /
csv / hook / sidebar / tab / flow-simulate per Rule I). Build clean.
Spec: docs/superpowers/specs/2026-04-29-phase16-2-clinic-report-design.md
Plan: docs/superpowers/plans/2026-04-29-phase16-2-clinic-report.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

- [ ] **Step 14.7: Confirm push success + clean status**

```bash
git status
git log --oneline -3
```

Expected: working tree clean · top commit = the Phase 16.2 commit · push reflected in `origin/master`.

---

## Self-Review (mandatory per writing-plans skill)

Before handing off, run this checklist mentally:

**1. Spec coverage** — Every section of `2026-04-29-phase16-2-clinic-report-design.md` has at least one task:
- ✅ Permission key + tab gate → Task 1
- ✅ 12 widgets → Tasks 8-9 (widget partials) + Task 11 (tab integrates them)
- ✅ Orchestrator architecture (Approach A) → Tasks 5 + 2-4 (helpers)
- ✅ Smart hybrid cache → Task 7
- ✅ Sidebar (branch / 7 presets + custom / categories / export / refresh) → Task 10
- ✅ Drilldown DRILLDOWN_MAP → Task 11
- ✅ PDF export → Task 11 (handleExportPdf via documentPrintEngine)
- ✅ CSV export → Task 6
- ✅ Branch scoping (admin = all; non-admin = branchIds[]) → Task 11 effectiveBranches
- ✅ Error handling (per-aggregator catch + per-fetch catch) → Tasks 5 + 11 banners
- ✅ Full-flow simulate per Rule I → Task 13
- ✅ CODEBASE_MAP + SESSION_HANDOFF update → Task 14

**2. Placeholder scan** — No `TBD` / `TODO` / "Add appropriate error handling" anywhere. Every step has actual code.

**3. Type consistency** — Snapshot shape `{ tiles, charts, tables, meta }` consistent across orchestrator output → CSV builder input → useClinicReport return → ClinicReportTab consumption. Function names match: `clinicReportAggregator` (default export wrapper) + `fetchClinicReportData` + `composeClinicReportSnapshot` + `computeKpiTiles` + `computeRetentionCohort` + `computeBranchComparison` + `toCsv` + `downloadCsv` + `useClinicReport` + DRILLDOWN_MAP keys consistent across spec + plan.

**4. Risks documented** — Aggregator timeout, math complexity, branch-scoping bypass, PDF blank pages, V14 undefined leaves, Excel CSV garbling, cache stale, sidebar/aggregator desync — all addressed in spec + tests cover them.

---

## Execution Handoff

**Plan complete and saved to** [docs/superpowers/plans/2026-04-29-phase16-2-clinic-report.md](docs/superpowers/plans/2026-04-29-phase16-2-clinic-report.md). Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan because tasks 2-4 (pure helpers) and tasks 8-9 (presentational widgets) are independent and parallelizable.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.

**Which approach?**
