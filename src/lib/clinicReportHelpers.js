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

/**
 * Read the canonical net total from a sale doc.
 *
 * Real LoverClinic sale schema (per `buildSaleReportRow` in saleReportAggregator.js):
 *   sale.billing.netTotal — invoice grand total before payment
 *
 * Fallbacks for legacy or test-fixture variants: `s.netTotal`, `s.total`,
 * derived from items.courses[].lineTotal / items.products[].lineTotal /
 * items.medications[].lineTotal as last resort. All-zero return is intentional
 * when the sale has no money fields at all (defensive — caller treats as 0).
 *
 * Bug fix history (2026-04-29): clinicReportAggregator was reading `s.total`
 * directly which doesn't exist on real be_sales docs → revenue tile + chart +
 * cash flow + branch comparison + avg ticket all showed 0. This helper
 * centralises the resolution so all 5 callers use the same lookup chain.
 */
export function getSaleNetTotal(sale) {
  if (!sale || typeof sale !== 'object') return 0;
  const billing = sale.billing && typeof sale.billing === 'object' ? sale.billing : null;
  // Primary: sale.billing.netTotal
  const fromBilling = billing ? safeNum(billing.netTotal) : 0;
  if (fromBilling > 0) return fromBilling;
  // Fallback chain
  const flat = safeNum(sale.netTotal) || safeNum(sale.total) || safeNum(sale.grandTotal);
  if (flat > 0) return flat;
  // Last resort: derive from items[].lineTotal sums
  const items = sale.items && typeof sale.items === 'object' ? sale.items : {};
  let derived = 0;
  for (const bucket of ['courses', 'products', 'medications']) {
    const arr = Array.isArray(items[bucket]) ? items[bucket] : [];
    for (const it of arr) {
      derived += safeNum(it?.lineTotal) || (safeNum(it?.qty) * safeNum(it?.unitPrice || it?.price));
    }
  }
  return derived;
}

/**
 * Read the canonical date string (YYYY-MM-DD) from an expense doc.
 *
 * Real LoverClinic expense schema (per `listExpenses` in backendClient.js):
 *   expense.date — Bangkok-local YYYY-MM-DD
 *
 * Fallbacks: `e.expenseDate`, `e.createdAt` (sliced to 10 chars). Empty string
 * if all sources missing.
 */
export function getExpenseDate(expense) {
  if (!expense || typeof expense !== 'object') return '';
  return String(expense.date || expense.expenseDate || expense.createdAt || '').slice(0, 10);
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

/**
 * Phase 16.2-bis (2026-04-29): Filter expenses by date range + optional branchIds + non-void.
 *
 * Mirror of `filterSalesForReport`. Bug fix: pre-16.2-bis the orchestrator's
 * `_bucketCashFlowByMonth` and `computeKpiTiles.expenseRatio` summed expenses
 * across ALL branches even when the user filtered the dashboard to one. This
 * helper centralises the expense filter so both call sites are branch-aware.
 *
 * @param {Array} expenses
 * @param {Object} filter   { from, to, branchIds? }
 * @returns {Array} filtered expenses (active + in-range + matching branch)
 */
export function filterExpensesForReport(expenses, { from, to, branchIds } = {}) {
  if (!Array.isArray(expenses)) return [];
  const branchSet = Array.isArray(branchIds) && branchIds.length
    ? new Set(branchIds.map(String))
    : null;
  return expenses.filter(e => {
    if (!e || e.status === 'void') return false;
    const d = getExpenseDate(e);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (branchSet && !branchSet.has(String(e.branchId))) return false;
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

  // Use getSaleNetTotal helper (handles real be_sales schema: s.billing.netTotal)
  const revenueYtd = roundTHB(filtered.reduce((s, x) => s + getSaleNetTotal(x), 0));
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
    monthBuckets[k] = (monthBuckets[k] || 0) + getSaleNetTotal(s);
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

  // Phase 16.2-bis: route through filterExpensesForReport so branch filter applies.
  // Pre-fix: this sum was global across all branches even when user filtered.
  const expensesInRange = filterExpensesForReport(expenses, filter);
  const expenseTotal = expensesInRange.reduce((s, x) => s + safeNum(x.amount), 0);
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
    ent.revenue += getSaleNetTotal(s);
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

/**
 * Course utilization % across all customers' purchased courses.
 *
 * Real LoverClinic schema (per courseUtils.js + assignCourseToCustomer):
 *   customer.courses[].qty is a STRING in format `"<remaining> / <total> <unit>"`
 *   (e.g. `"199 / 200 U"`). Parse via existing parseQtyString helper.
 *
 * Returns: percentage of (total qty − remaining qty) across all customers'
 * courses, rounded to 2 decimal places. Empty / no-courses case returns 0.
 *
 * Bug fix history (2026-04-29): orchestrator's `computeCourseUtilization` was
 * reading `course.qtyRemaining` and `course.qtyTotal` numeric fields which
 * don't exist (the real shape is a string `qty` field that needs parsing).
 * Result: every clinic showed 0% course util in the dashboard tile.
 *
 * Signature accepts `parseQtyString` as injected dep so the helper stays
 * pure (no lib import) — caller passes the real one from courseUtils.
 *
 * Phase 16.2-bis (2026-04-29): added optional 3rd arg `branchIds`. When
 * supplied, only customers with `branchId` in the set are counted. Customers
 * with no `branchId` are accepted (default branch / legacy data) when
 * branchIds is omitted; rejected when branchIds is non-empty (defensive
 * against accidental cross-branch leakage).
 *
 * @param {Array} customers
 * @param {(qtyStr: string) => { remaining: number, total: number, unit: string }} parseQtyString
 * @param {string[]} [branchIds]   — if non-empty, restrict to customers in these branches
 * @returns {number}
 */
export function computeCourseUtilizationFromCustomers(customers, parseQtyString, branchIds) {
  if (!Array.isArray(customers) || typeof parseQtyString !== 'function') return 0;
  const branchSet = Array.isArray(branchIds) && branchIds.length
    ? new Set(branchIds.map(String))
    : null;
  let totalQty = 0, usedQty = 0;
  for (const c of customers) {
    if (branchSet && !branchSet.has(String(c?.branchId))) continue;
    const courses = Array.isArray(c?.courses) ? c.courses : [];
    for (const course of courses) {
      // Skip cancelled / refunded / exchanged courses (they shouldn't count
      // toward utilization since they're no longer billable).
      if (course?.status && /cancel|refund|exchang/i.test(course.status)) continue;
      const parsed = parseQtyString(course?.qty);
      const total = safeNum(parsed?.total);
      const remaining = safeNum(parsed?.remaining);
      if (total > 0) {
        totalQty += total;
        usedQty += Math.max(0, total - remaining);
      }
    }
  }
  if (totalQty === 0) return 0;
  return Math.round((usedQty / totalQty) * 10000) / 100;
}
