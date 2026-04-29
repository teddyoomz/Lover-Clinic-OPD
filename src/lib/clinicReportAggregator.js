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

import {
  computeKpiTiles,
  computeRetentionCohort,
  computeBranchComparison,
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
  const courseUtilization = _computeCourseUtilization(customers);
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
  const topServices = (revenueByProcedure?.rows || [])
    .map(r => ({
      name:    r.courseName || r.name || '',
      revenue: Number(r.lineTotal || r.paidShare || 0),
      count:   Number(r.qty || 0),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const topDoctors = (staffSales?.rows || [])
    .filter(r => (r.role || '').toLowerCase() === 'doctor' || /Dr\./i.test(r.staffName || ''))
    .slice(0, 10);

  const topProducts = (stockReport?.rows || [])
    .map(r => ({
      name:  r.productName || r.name || '',
      value: Number(r.totalValue || r.cost || 0),
      qty:   Number(r.qty || 0),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

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
    buckets[d] = (buckets[d] || 0) + (Number(s.total) || 0);
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
    buckets[d].revenue += Number(s.total) || 0;
  }

  for (const e of expenses) {
    // listExpenses uses `e.date` field internally
    const d = String(e.date || e.expenseDate || '').slice(0, 7);
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
 * Compute overall course utilization % across all customers.
 * used / total for all courses in all customer.courses[].
 */
function _computeCourseUtilization(customers) {
  let totalQty = 0;
  let usedQty  = 0;
  for (const c of customers) {
    for (const course of (c.courses || [])) {
      const remaining = Number(course.qtyRemaining ?? course.remaining ?? 0);
      const total     = Number(course.qty ?? course.qtyTotal ?? 0);
      if (total > 0) {
        totalQty += total;
        usedQty  += (total - remaining);
      }
    }
  }
  return totalQty > 0 ? Math.round((usedQty / totalQty) * 10000) / 100 : 0;
}
