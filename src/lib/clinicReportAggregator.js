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
    errors = {},
  } = rawData || {};

  // ── Delegate to existing aggregators ──
  const revenueByProcedure = aggregateRevenueByProcedure(sales, courses, filter);
  const customerReport     = aggregateCustomerReport(customers, sales, filter);
  const staffSales         = aggregateStaffSales(sales, filter);
  const stockReport        = aggregateStockReport(batches, products, filter);
  const appointmentReport  = aggregateAppointmentReport(appointments, customers, [...staff, ...doctors], filter);
  const appointmentAnalysis = aggregateAppointmentAnalysis(appointments, sales, { from: filter.from, to: filter.to });

  // ── Delegate to shared helpers ──
  const branchComparison  = computeBranchComparison({ sales, branches, filter });
  const retentionCohort   = computeRetentionCohort({ sales, customers, filter });
  // Use real parseQtyString helper from courseUtils — customer.courses[].qty
  // is a string `"<remaining> / <total> <unit>"` not numeric fields.
  const courseUtilization = computeCourseUtilizationFromCustomers(customers, parseQtyString);
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
  const revenueTrend       = _bucketByMonth(sales, filter);
  const newCustomersTrend  = _bucketCustomersByMonth(customers, filter);
  const cashFlow           = _bucketCashFlowByMonth(sales, expenses, filter);

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

/** Bucket sales revenue by month within the filter window. */
function _bucketByMonth(sales, filter) {
  const { from = '', to = '' } = filter || {};
  const buckets = {};
  for (const s of sales) {
    if (!s || s.status === 'cancelled') continue;
    const d = String(s.saleDate || '').slice(0, 7);
    if (!d) continue;
    if (from && d < from.slice(0, 7)) continue;
    if (to   && d > to.slice(0, 7)) continue;
    buckets[d] = (buckets[d] || 0) + getSaleNetTotal(s);
  }
  return Object.entries(buckets).sort().map(([label, value]) => ({ label, value }));
}

/** Bucket new customer count by month within the filter window. */
function _bucketCustomersByMonth(customers, filter) {
  const { from = '', to = '' } = filter || {};
  const buckets = {};
  for (const c of customers) {
    const d = String(c.createdAt || '').slice(0, 7);
    if (!d) continue;
    if (from && d < from.slice(0, 7)) continue;
    if (to   && d > to.slice(0, 7)) continue;
    buckets[d] = (buckets[d] || 0) + 1;
  }
  return Object.entries(buckets).sort().map(([label, value]) => ({ label, value }));
}

/** Bucket net cash flow (revenue − expenses) by month. */
function _bucketCashFlowByMonth(sales, expenses, filter) {
  const { from = '', to = '' } = filter || {};
  const buckets = {};

  for (const s of sales) {
    if (!s || s.status === 'cancelled') continue;
    const d = String(s.saleDate || '').slice(0, 7);
    if (!d) continue;
    if (from && d < from.slice(0, 7)) continue;
    if (to   && d > to.slice(0, 7)) continue;
    if (!buckets[d]) buckets[d] = { revenue: 0, exp: 0 };
    buckets[d].revenue += getSaleNetTotal(s);
  }

  for (const e of expenses) {
    // Use shared getExpenseDate helper (canonical e.date field).
    const d = getExpenseDate(e).slice(0, 7);
    if (!d) continue;
    if (from && d < from.slice(0, 7)) continue;
    if (to   && d > to.slice(0, 7)) continue;
    if (!buckets[d]) buckets[d] = { revenue: 0, exp: 0 };
    buckets[d].exp += Number(e.amount) || 0;
  }

  return Object.entries(buckets).sort().map(([label, v]) => ({
    label,
    value: v.revenue - v.exp,
  }));
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
