// ─── Clinic Report pure helpers — Phase 16.2 (2026-04-29) ──────────────────
//
// 3 helpers hoisted out of clinicReportAggregator for testability:
//   1. computeKpiTiles({sales, customers, expenses, filter}) → 8-tile snapshot
//   2. computeRetentionCohort({sales, customers, filter})    → cohort matrix (Task 3)
//   3. computeBranchComparison({sales, branches, filter})    → per-branch rows (Task 4)
//
// All pure — no Firestore imports, deterministic given inputs.
// V14-aware: never return `undefined` (Firestore setDoc rejects them).
// Filter shape: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', branchIds?: string[] }
//
// Iron-clad refs:
//   AR1 (date range)  AR3 (cancelled excluded)  AR4 (currency rounding)
//   AR15 (pure)       V14 (no undefined leaves)

import { roundTHB } from './reportsUtils.js';

/** Coerce to finite number; null/undefined/NaN/Infinity → 0. */
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

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

/** Calendar months spanned by [from, to] inclusive (counts the boundary month even when `to` is mid-month). */
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
 *     retentionRate:         number — % returning customers (caller-injected via derived)
 *     avgTicket:             number — revenue / non-cancelled sale count
 *     courseUtilization:     number — caller-injected via derived
 *     noShowRate:            number — caller-injected via derived
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

  // Month-over-month growth: compare the latest calendar month in the range
  // vs the calendar month immediately before it (not the previous occupied bucket).
  // If prevCalendarMonth has 0 revenue → growth is undefined → return null.
  const months = monthsBetween(filter.from || '', filter.to || '');
  const monthBuckets = {};
  for (const s of filtered) {
    const k = String(s.saleDate || s.createdAt || '').slice(0, 7);
    if (!k) continue;
    monthBuckets[k] = (monthBuckets[k] || 0) + (Number(s.total) || 0);
  }
  // Derive the last calendar month in range and the one immediately before it.
  let lastCalMonth = '';
  let prevCalMonth = '';
  if (filter.to) {
    // Last calendar month = YYYY-MM from the `to` date
    lastCalMonth = String(filter.to).slice(0, 7); // e.g. '2026-04'
    // Previous calendar month
    const [ly, lm] = lastCalMonth.split('-').map(Number);
    const pm = lm === 1 ? 12 : lm - 1;
    const py = lm === 1 ? ly - 1 : ly;
    prevCalMonth = `${py}-${String(pm).padStart(2, '0')}`;
  } else {
    // Fallback: use last two occupied buckets
    const sortedKeys = Object.keys(monthBuckets).sort();
    lastCalMonth = sortedKeys[sortedKeys.length - 1] || '';
    prevCalMonth = sortedKeys[sortedKeys.length - 2] || '';
  }
  const lastMonthRevenue = monthBuckets[lastCalMonth] || 0;
  const prevMonthRevenue = monthBuckets[prevCalMonth] || 0;
  const momGrowth = prevMonthRevenue > 0
    ? roundTHB(((lastMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
    : null;

  // New customers in range — counts customers with createdAt DURING the period [from, to].
  // Interval-bound (both from + to): aligns with "ลูกค้าใหม่/เดือน" executive-dashboard
  // semantic and with the W2 M-o-M chart which buckets createdAt by month and excludes
  // pre-range customers.
  // If branchIds supplied, filter by branch as well.
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
    retentionRate: safeNum(derived.retentionRate),
    avgTicket,
    courseUtilization: safeNum(derived.courseUtilization),
    noShowRate: safeNum(derived.noShowRate),
    expenseRatio,
  };
}

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

  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);

  // 1. Group customers by acquisition month
  const cohorts = new Map(); // 'YYYY-MM' → Set<customerId>
  for (const c of customers) {
    const cm = String(c.createdAt || '').slice(0, 7);
    if (!cm) continue;
    if (cm < fromMonth || cm > toMonth) continue;
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

/** Module-private: add `offset` months to 'YYYY-MM' string. */
function addMonths(yyyymm, offset) {
  const [y, m] = yyyymm.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + offset;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

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
