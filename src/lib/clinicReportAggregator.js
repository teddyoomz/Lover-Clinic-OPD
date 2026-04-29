// ─── Clinic Report Orchestrator — Phase 16.2 (2026-04-29) ──────────────────
//
// Architecture: 2-phase pipeline.
//   1. fetchClinicReportData(filter) → rawData
//        Fetches all 10 collections; per-key error capture (no throw on partial failure).
//   2. composeClinicReportSnapshot(rawData, filter) → ClinicReportSnapshot
//        Pure orchestration: delegates to 8 existing aggregators + 3 helpers.
//
// Public API:
//   clinicReportAggregator(filter) — convenience wrapper that runs both phases.
//
// Iron-clad compliance:
//   E         — Firestore-only via backendClient; no brokerClient / no /api/proclinic/*
//   H-quater  — no master_data reads
//   V14       — composeClinicReportSnapshot returns no undefined values
//   Rule of 3 — reuses computeKpiTiles / computeRetentionCohort / computeBranchComparison
//               from clinicReportHelpers.js (not re-implemented here)
//
// Filter shape:
//   { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', branchIds?: string[], categories?: string[] }
//
// Verified backendClient names (grep 2026-04-29):
//   getAllSales          — no filter params; returns all be_sales
//   getAllCustomers      — no filter params; returns all be_customers
//   getAppointmentsByMonth(yearMonth) — returns grouped object { date: [...] }
//   listStaff           — plan doc used 'listAllStaff' (doesn't exist)
//   listDoctors, listProducts, listStockBatches, listCourses, listBranches — match plan
//   listExpenses({ startDate, endDate }) — uses startDate/endDate (not from/to)

import {
  getAllSales,
  getAllCustomers,
  getAppointmentsByMonth,
  listStaff,
  listDoctors,
  listProducts,
  listStockBatches,
  listCourses,
  listExpenses,
  listBranches,
} from './backendClient.js';
// Phase 16.2-bis (2026-04-29 session 33): be_treatments load for doctor-enrichment.
// loadTreatmentsByDateRange is already used by DfPayoutReportTab; reusing here
// to fix TOP-10 DOCTORS empty-table bug. Sales lack a denormalized doctorId
// when they're treatment-linked; we join via treatment.detail.linkedSaleId.
import { loadTreatmentsByDateRange } from './reportsLoaders.js';

import { aggregateRevenueByProcedure } from './revenueAnalysisAggregator.js';
import { aggregateCustomerReport }      from './customerReportAggregator.js';
import { aggregateStaffSales }          from './staffSalesAggregator.js';
import { aggregateStockReport }         from './stockReportAggregator.js';
import { aggregateAppointmentReport }   from './appointmentReportAggregator.js';
import { aggregateAppointmentAnalysis } from './appointmentAnalysisAggregator.js';
import { parseQtyString }               from './courseUtils.js';

import {
  computeKpiTiles,
  computeRetentionCohort,
  computeBranchComparison,
  computeCourseUtilizationFromCustomers,
  filterExpensesForReport,
  getSaleNetTotal,
  getExpenseDate,
} from './clinicReportHelpers.js';

// ─── Phase 1: Fetch ────────────────────────────────────────────────────────

/**
 * Fetch all 10 collections needed for the Clinic Report dashboard.
 * Per-key error capture: a failing fetch returns [] for that key and
 * records the error message in result.errors[key]. Never throws.
 *
 * @param {Object} filter  { from, to, branchIds? }
 * @returns {Promise<RawClinicData>}
 */
export async function fetchClinicReportData(filter = {}) {
  const { from = '', to = '' } = filter;

  // Build the month range for appointment fetches (getAppointmentsByMonth is per-month)
  const months = buildMonthRange(from, to);

  // Each entry: [key, fetcher] — errors are caught per-key
  const fetchers = [
    ['sales',     () => getAllSales()],
    ['customers', () => getAllCustomers()],
    ['appointments', async () => {
      // Aggregate across every month in the date range
      const results = await Promise.all(months.map(ym => getAppointmentsByMonth(ym)));
      // Each result is a { date: [...] } grouped object — flatten to array
      return results.flatMap(grouped =>
        Object.values(grouped || {}).flat()
      );
    }],
    ['staff',    () => listStaff()],
    ['doctors',  () => listDoctors()],
    ['products', () => listProducts()],
    ['batches',  () => listStockBatches()],
    ['courses',  () => listCourses()],
    ['expenses', () => listExpenses({ startDate: from, endDate: to })],
    ['branches', () => listBranches()],
    // Phase 16.2-bis: load treatments alongside sales so we can enrich
    // sale.doctorId from treatment.detail.linkedSaleId BEFORE the staff
    // sales aggregator runs. Without this, TOP-10 DOCTORS table renders
    // empty because sales don't carry denormalized doctorId.
    ['treatments', () => loadTreatmentsByDateRange({ from, to })],
  ];

  const settled = await Promise.all(
    fetchers.map(async ([key, fn]) => {
      try {
        const data = await fn();
        return [key, Array.isArray(data) ? data : [], null];
      } catch (e) {
        return [key, [], e?.message || 'fetch failed'];
      }
    })
  );

  const result = { errors: {} };
  for (const [key, data, err] of settled) {
    result[key] = data;
    if (err) result.errors[key] = err;
  }
  return result;
}

// ─── Phase 2: Compose ─────────────────────────────────────────────────────

/**
 * Pure orchestration — given raw data + filter, return a ClinicReportSnapshot.
 * Delegates to 8 existing aggregators + 3 helpers + internal bucket utilities.
 * Guarantees: no undefined values in output (V14).
 *
 * @param {RawClinicData} rawData
 * @param {Object} filter
 * @returns {ClinicReportSnapshot}
 */
export function composeClinicReportSnapshot(rawData, filter = {}) {
  const {
    sales = [],
    customers = [],
    appointments = [],
    staff = [],
    doctors = [],
    products = [],
    batches = [],
    courses = [],
    expenses = [],
    branches = [],
    treatments = [],
    errors = {},
  } = rawData || {};

  // ── Phase 16.2-bis: enrich sales with doctorId via treatment.linkedSaleId ──
  // Must run BEFORE staffSalesAggregator. The aggregator's `doctorKey` reads
  // sale.doctorId / sale.treatment?.doctorId; treatment-linked sales carry
  // neither natively. We compute the join here once.
  const enrichedSales = enrichSalesWithDoctorIdFromTreatments(sales, treatments);

  // ── Phase 16.2-bis: pre-filter enriched sales by branchIds for aggregators
  //   that don't read filter.branchIds internally. Without this, TOP-10
  //   DOCTORS / Top-services / etc. include cross-branch sales even when
  //   the user filtered to a single branch. computeBranchComparison still
  //   reads filter.branchIds itself (separate concern).
  const branchSetForAggs = Array.isArray(filter.branchIds) && filter.branchIds.length
    ? new Set(filter.branchIds.map(String))
    : null;
  const branchFilteredEnrichedSales = branchSetForAggs
    ? enrichedSales.filter(s => s && branchSetForAggs.has(String(s.branchId)))
    : enrichedSales;

  // ── Delegate to existing aggregators ──
  // Phase 16.2-bis: pass enriched + branch-filtered sales to aggregators
  // that don't have built-in branch awareness.
  const revenueByProcedure = aggregateRevenueByProcedure(branchFilteredEnrichedSales, courses, filter);
  const customerReport     = aggregateCustomerReport(customers, branchFilteredEnrichedSales, filter);
  const staffSales         = aggregateStaffSales(branchFilteredEnrichedSales, filter);
  const stockReport        = aggregateStockReport(batches, products, filter);
  const appointmentReport  = aggregateAppointmentReport(appointments, customers, [...staff, ...doctors], filter);
  const appointmentAnalysis = aggregateAppointmentAnalysis(appointments, branchFilteredEnrichedSales, { from: filter.from, to: filter.to });

  // ── Delegate to shared helpers ──
  // computeBranchComparison reads filter.branchIds internally; pass full
  // enrichedSales so it can group by branchId for the visible branch set.
  const branchComparison  = computeBranchComparison({ sales: enrichedSales, branches, filter });
  // computeRetentionCohort filters its own date+branch internally.
  const retentionCohort   = computeRetentionCohort({ sales: enrichedSales, customers, filter });
  // Phase 16.2-bis: pass filter.branchIds so course utilization respects branch filter.
  // Pre-fix: customers across all branches were aggregated even when user
  // filtered the dashboard to a single branch.
  const courseUtilization = computeCourseUtilizationFromCustomers(customers, parseQtyString, filter.branchIds);
  const noShowRate        = Number(appointmentAnalysis?.totals?.noShowRate || 0);

  const tiles = computeKpiTiles({
    sales,
    customers,
    expenses,
    filter,
    derived: {
      retentionRate: retentionCohort.overallRate,
      courseUtilization,
      noShowRate,
    },
  });

  // ── Build table slices ──
  // topServices: aggregate revenueByProcedure rows BY courseName (sum across
  // procedureType + category dimensions). Fixes the duplication where the same
  // service appeared in 2 rows because it was sold under 2 procedure-types.
  const topServices = _aggregateTopServices(revenueByProcedure?.rows || []).slice(0, 10);

  // topDoctors: read from staffSales.doctorRows (real shape — NOT `rows`).
  // staffSalesAggregator returns {staffRows, doctorRows, totals, meta} where:
  //   doctorRows: [{ doctorKey, doctorName, saleCount, netTotal, paidAmount }, ...]
  // Previous bug: orchestrator read `staffSales.rows` (doesn't exist) AND
  // filtered by `/Dr\./i.test(staffName) || r.role === 'doctor'` — both
  // brittle for Thai honorifics. Fix uses real `doctorRows` array directly.
  const topDoctors = (staffSales?.doctorRows || [])
    .map(r => ({
      // RankedTableWidget reads {staffName, total} — adapt names for widget
      staffName: r.doctorName || '',
      total:     Number(r.netTotal || 0),
      saleCount: Number(r.saleCount || 0),
    }))
    .filter(r => r.staffName && r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // topProducts: aggregate from sales.items.products[] (and items.medications[])
  // — the actual SOLD products with revenue + qty. Previously used
  // stockReportAggregator output which is INVENTORY value (stock on hand) not
  // sales value, leading to nonsensical "0 sold" with high values.
  const topProducts = _aggregateTopProducts(sales, filter).slice(0, 10);

  // ── Build chart series ──
  // Phase 16.2-bis: _bucketByMonth + _bucketCashFlowByMonth read
  // filter.branchIds internally (post-fix), so passing branch-prefiltered
  // sales would double-filter. Use enrichedSales (full set) and let the
  // bucket helpers apply their own branch filter.
  const revenueTrend       = _bucketByMonth(enrichedSales, filter);
  const newCustomersTrend  = _bucketCustomersByMonth(customers, filter);
  const cashFlow           = _bucketCashFlowByMonth(enrichedSales, expenses, filter);

  return {
    tiles,
    charts: {
      revenueTrend,
      newCustomersTrend,
      retentionCohort,
      branchComparison,
      cashFlow,
      apptFillRate: appointmentReport?.totals?.fillRate ?? 0,
    },
    tables: {
      topServices,
      topDoctors,
      topProducts,
    },
    meta: {
      generatedAt:   new Date().toISOString(),
      filterApplied: { ...filter },
      branchScope:   Array.isArray(filter.branchIds) ? filter.branchIds : 'all',
      partialErrors: Object.keys(errors).length > 0 ? errors : null,
    },
  };
}

// ─── Convenience wrapper ───────────────────────────────────────────────────

/**
 * Full pipeline: fetch all data, then compose snapshot.
 *
 * @param {Object} filter  { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', branchIds? }
 * @returns {Promise<ClinicReportSnapshot>}
 */
export async function clinicReportAggregator(filter = {}) {
  const raw = await fetchClinicReportData(filter);
  return composeClinicReportSnapshot(raw, filter);
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Build an array of 'YYYY-MM' strings covering the date range [from, to].
 * Used to drive getAppointmentsByMonth calls.
 */
function buildMonthRange(from, to) {
  if (!from && !to) {
    // No range — default to current month
    return [new Date().toISOString().slice(0, 7)];
  }
  const start = (from || to).slice(0, 7);
  const end   = (to || from).slice(0, 7);
  const months = [];
  let cur = start;
  while (cur <= end) {
    months.push(cur);
    const [y, m] = cur.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    cur = next;
    if (months.length >= 24) break; // safety cap: max 2 years (24 months)
  }
  return months.length > 0 ? months : [start];
}

/**
 * Bucket sales revenue by month within the filter window.
 *
 * Phase 16.2-bis: respects filter.branchIds. Pre-fix this counted ALL sales
 * across branches, inflating the trend.
 */
function _bucketByMonth(sales, filter) {
  const { from = '', to = '', branchIds } = filter || {};
  const branchSet = Array.isArray(branchIds) && branchIds.length
    ? new Set(branchIds.map(String))
    : null;
  const buckets = {};
  for (const s of sales) {
    if (!s || s.status === 'cancelled') continue;
    const d = String(s.saleDate || '').slice(0, 7);
    if (!d) continue;
    if (from && d < from.slice(0, 7)) continue;
    if (to   && d > to.slice(0, 7)) continue;
    if (branchSet && s.branchId && !branchSet.has(String(s.branchId))) continue;
    buckets[d] = (buckets[d] || 0) + getSaleNetTotal(s);
  }
  return Object.entries(buckets).sort().map(([label, value]) => ({ label, value }));
}

/**
 * Bucket new customer count by month within the filter window.
 *
 * Phase 16.2-bis: respects filter.branchIds. Pre-fix this counted ALL
 * customers across branches even when the user filtered to one branch,
 * inflating the trend.
 */
function _bucketCustomersByMonth(customers, filter) {
  const { from = '', to = '', branchIds } = filter || {};
  const branchSet = Array.isArray(branchIds) && branchIds.length
    ? new Set(branchIds.map(String))
    : null;
  const buckets = {};
  for (const c of customers) {
    const d = String(c.createdAt || '').slice(0, 7);
    if (!d) continue;
    if (from && d < from.slice(0, 7)) continue;
    if (to   && d > to.slice(0, 7)) continue;
    if (branchSet && c.branchId && !branchSet.has(String(c.branchId))) continue;
    buckets[d] = (buckets[d] || 0) + 1;
  }
  return Object.entries(buckets).sort().map(([label, value]) => ({ label, value }));
}

/**
 * Bucket net cash flow (revenue − expenses) by month.
 *
 * Phase 16.2-bis: routes expenses through `filterExpensesForReport` so
 * branch filter applies. Pre-fix the expense leg summed ALL branches even
 * when the user filtered to one branch — overstated profit.
 */
function _bucketCashFlowByMonth(sales, expenses, filter) {
  const { from = '', to = '', branchIds } = filter || {};
  const branchSet = Array.isArray(branchIds) && branchIds.length
    ? new Set(branchIds.map(String))
    : null;
  const buckets = {};

  for (const s of sales) {
    if (!s || s.status === 'cancelled') continue;
    const d = String(s.saleDate || '').slice(0, 7);
    if (!d) continue;
    if (from && d < from.slice(0, 7)) continue;
    if (to   && d > to.slice(0, 7)) continue;
    if (branchSet && s.branchId && !branchSet.has(String(s.branchId))) continue;
    if (!buckets[d]) buckets[d] = { revenue: 0, exp: 0 };
    buckets[d].revenue += getSaleNetTotal(s);
  }

  // Phase 16.2-bis: filterExpensesForReport applies branchIds + date + non-void.
  const branchAwareExpenses = filterExpensesForReport(expenses, filter);
  for (const e of branchAwareExpenses) {
    const d = getExpenseDate(e).slice(0, 7);
    if (!d) continue;
    if (!buckets[d]) buckets[d] = { revenue: 0, exp: 0 };
    buckets[d].exp += Number(e.amount) || 0;
  }

  return Object.entries(buckets).sort().map(([label, v]) => ({
    label,
    value: v.revenue - v.exp,
  }));
}

/**
 * Phase 16.2-bis (2026-04-29 session 33) — enrich sales array with `doctorId`
 * inferred from linked treatments.
 *
 * The bug it fixes: TOP-10 DOCTORS empty in clinic-report. `staffSalesAggregator`
 * groups by `doctorKey(sale)` which reads `sale.doctorId || sale.treatment?.doctorId`
 * — but treatment-linked sales (the majority) don't carry either field. The
 * canonical link is `treatment.detail.linkedSaleId` (Phase 12.2b shipped both
 * `linkedSaleId` AND `detail.linkedSaleId` for backward compat). For each
 * such treatment, we stamp the matching sale with `doctorId` from the
 * treatment.
 *
 * Idempotent: if a sale already has `doctorId`, it is preserved; the
 * enrichment only fills in the gap.
 *
 * Returns a NEW array (does NOT mutate input). Sale objects in the returned
 * array MAY be the same reference as the input sale (when no enrichment
 * happens) OR a shallow copy with the added field. This is fine for read-only
 * aggregation; do NOT pass this output to a Firestore write.
 *
 * @param {Array} sales       — be_sales docs (cancelled/active mix; aggregator filters)
 * @param {Array} treatments  — be_treatments docs in date range
 * @returns {Array}            enriched sales (same length as input)
 */
export function enrichSalesWithDoctorIdFromTreatments(sales, treatments) {
  if (!Array.isArray(sales)) return [];
  if (!Array.isArray(treatments) || treatments.length === 0) return sales;

  // Build saleId → first-doctorId map from treatments.
  // Resolution priority per treatment:
  //   1. t.detail.doctorId (canonical Phase 14)
  //   2. t.detail.dfEntries[0].doctorId (Phase 14 DF entry path)
  //   3. t.doctorId (legacy flat field)
  // First match wins (treatments later in the list don't override an
  // earlier-stamped sale; preserves Phase 14.5 explicit-overrides-implicit
  // semantic).
  const saleToDoctor = new Map();
  for (const t of treatments) {
    if (!t) continue;
    const detail = t.detail && typeof t.detail === 'object' ? t.detail : {};
    // Phase 12.2b: linkedSaleId may live at top-level OR detail.linkedSaleId
    const linkedSaleId = String(detail.linkedSaleId || t.linkedSaleId || '').trim();
    if (!linkedSaleId) continue;
    if (saleToDoctor.has(linkedSaleId)) continue; // first-match-wins

    const doctorId =
      String(detail.doctorId || '').trim() ||
      String(detail?.dfEntries?.[0]?.doctorId || '').trim() ||
      String(t.doctorId || '').trim();
    if (!doctorId) continue;

    const doctorName =
      String(detail.doctorName || '').trim() ||
      String(detail?.dfEntries?.[0]?.doctorName || '').trim() ||
      String(t.doctorName || '').trim();

    saleToDoctor.set(linkedSaleId, { doctorId, doctorName });
  }

  if (saleToDoctor.size === 0) return sales;

  return sales.map((s) => {
    if (!s || typeof s !== 'object') return s;
    // Idempotent: existing doctorId wins.
    if (s.doctorId) return s;
    const sid = String(s.id || '').trim();
    if (!sid) return s;
    const enrich = saleToDoctor.get(sid);
    if (!enrich) return s;
    // Shallow copy + stamp; preserves all other fields including billing.
    return {
      ...s,
      doctorId: enrich.doctorId,
      doctorName: s.doctorName || enrich.doctorName || '',
    };
  });
}

/**
 * Aggregate top services by courseName ONLY (sum across procedureType+category
 * splits). Fixes the dashboard duplication where the same service appeared
 * in multiple rows because revenueAnalysisAggregator groups by
 * (procedureType, category, courseId-or-name, promotionName).
 *
 * Returns rows sorted desc by revenue, with merged qty + revenue per service.
 */
function _aggregateTopServices(revenueRows) {
  if (!Array.isArray(revenueRows)) return [];
  const groups = new Map(); // courseName → { revenue, count }
  for (const r of revenueRows) {
    const name = String(r.courseName || r.name || '').trim();
    if (!name) continue;
    const ent = groups.get(name) || { name, revenue: 0, count: 0 };
    // Use lineTotal as primary revenue source; fall back to paidShare/paidAmount
    ent.revenue += Number(r.lineTotal || r.paidShare || r.paidAmount || 0);
    ent.count   += Number(r.qty || 0);
    groups.set(name, ent);
  }
  return [...groups.values()]
    .filter(r => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Aggregate top products SOLD across sales.items.products[] +
 * sales.items.medications[] (medications are also product-like sellable items).
 *
 * Real LoverClinic schema (per saleReportAggregator.deriveSaleType):
 *   sale.items.products[]    — { productId, productName, qty, lineTotal, ... }
 *   sale.items.medications[] — same shape
 *
 * Replaces the previous (broken) approach of using stockReportAggregator
 * output, which reports INVENTORY value (stock on hand) — orthogonal to
 * "what products are selling well". Filters by date range + non-cancelled.
 */
function _aggregateTopProducts(sales, filter) {
  const { from = '', to = '', branchIds } = filter || {};
  const branchSet = Array.isArray(branchIds) && branchIds.length
    ? new Set(branchIds.map(String))
    : null;

  const groups = new Map(); // productName → { name, value, qty }
  for (const s of (sales || [])) {
    if (!s || s.status === 'cancelled') continue;
    const d = String(s.saleDate || '').slice(0, 10);
    if (from && d < from) continue;
    if (to   && d > to)   continue;
    if (branchSet && !branchSet.has(String(s.branchId))) continue;

    const items = s.items && typeof s.items === 'object' ? s.items : {};
    for (const bucket of ['products', 'medications']) {
      const arr = Array.isArray(items[bucket]) ? items[bucket] : [];
      for (const it of arr) {
        const name = String(it?.productName || it?.name || '').trim();
        if (!name) continue;
        const lineTotal = Number(it?.lineTotal) || (Number(it?.qty) * Number(it?.unitPrice || it?.price)) || 0;
        const qty = Number(it?.qty) || 0;
        const ent = groups.get(name) || { name, value: 0, qty: 0 };
        ent.value += lineTotal;
        ent.qty   += qty;
        groups.set(name, ent);
      }
    }
  }

  return [...groups.values()]
    .filter(p => p.value > 0 || p.qty > 0)
    .sort((a, b) => b.value - a.value);
}
