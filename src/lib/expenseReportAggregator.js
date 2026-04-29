// ─── Expense Report Orchestrator — Phase 16.7 (2026-04-29 session 33) ──────
//
// Replicates ProClinic /admin/report/expense (4-section dashboard) using OUR
// be_* data 100%. Backend-Firestore only — no proclinic-api fetches, no
// broker imports, no upstream-sync collection reads.
//
// Sections (per Phase 0 intel docs/proclinic-scan/_phase0-intel.log):
//   1. รายจ่ายแพทย์          (Doctors  — sitFee / df / salary / other / total)
//   2. รายจ่ายพนักงาน + ผู้ช่วย (Staff   — df / salary / other / total)
//   3. หมวดหมู่               (Categories — count + total)
//   4. ต้นทุนสินค้า           (Products — DEFERRED to v2: needs cost cascade audit)
//
// Architecture mirrors clinicReportAggregator.js (Phase 16.2 pattern):
//   1. fetchExpenseReportData(filter)            — per-key error capture
//   2. composeExpenseReportSnapshot(rawData, f)  — pure orchestration
//
// Iron-clad refs:
//   E         — Firestore-only via backendClient + reportsLoaders (Phase 10 helpers)
//   H + H-quater — be_* canonical (no upstream-sync reads in feature code)
//   F + F-bis  — Triangle Rule (intel captured Phase 0; columns mirror ProClinic)
//   V14       — no undefined leaves

import { listDoctors, listStaff, listExpenseCategories, listDfGroups, listDfStaffRates, listCourses, listBranches, listStaffSchedules } from './backendClient.js';
import {
  computeAutoPayrollForPersons,
  computeHourlyFromSchedules,
  computeCommissionFromSales,
  mergeAutoIntoRows,
} from './payrollHelpers.js';
import { thaiTodayISO } from '../utils.js';
import { loadSalesByDateRange, loadTreatmentsByDateRange, loadExpensesByDateRange } from './reportsLoaders.js';
import { computeDfPayoutReport } from './dfPayoutAggregator.js';
import {
  filterExpensesForExpenseReport,
  buildExpenseDoctorRows,
  buildExpenseStaffRows,
  buildExpenseCategoryRows,
  computeExpenseSummary,
  // Phase 16.7-ter (2026-04-29 session 33) — DF for unlinked treatments
  computeUnlinkedTreatmentDfBuckets,
  mergeUnlinkedDfIntoPayoutRows,
} from './expenseReportHelpers.js';

// ─── Phase 1: Fetch ────────────────────────────────────────────────────────

/**
 * Fetch the 6 collections needed for the Expense Report dashboard.
 * Per-key error capture: a failing fetch returns [] for that key.
 *
 * @param {Object} filter  { from, to, branchIds? }
 * @returns {Promise<RawExpenseData>}
 */
export async function fetchExpenseReportData(filter = {}) {
  const { from = '', to = '' } = filter;

  const fetchers = [
    ['expenses',   () => loadExpensesByDateRange({ from, to })],
    ['categories', () => listExpenseCategories()],
    ['doctors',    () => listDoctors()],
    ['staff',      () => listStaff()],
    ['sales',      () => loadSalesByDateRange({ from, to })],
    ['treatments', () => loadTreatmentsByDateRange({ from, to })],
    ['dfGroups',   () => listDfGroups()],
    ['dfStaffRates', () => listDfStaffRates()],
    // Phase 16.7-ter — be_courses for percent-rate price lookup on unlinked
    // treatments (treatment.detail.dfEntries[].rows[].type='percent' needs
    // the course price; without a sale to read price from, fall back to
    // the master course doc).
    ['courses',    () => listCourses()],
    // Phase 16.7-ter — branches for sidebar empty-state diagnostics
    ['branches',   () => listBranches()],
    // Phase 16.7-quinquies — staff schedules for hourly-pay computation
    ['schedules', () => listStaffSchedules({ startDate: from, endDate: to }).catch(() => [])],
  ];

  const settled = await Promise.all(
    fetchers.map(async ([key, fn]) => {
      try {
        const data = await fn();
        return [key, Array.isArray(data) ? data : (data || []), null];
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
 * Pure orchestration — given raw data + filter, return ExpenseReportSnapshot.
 * No Firestore imports. Deterministic.
 *
 * @param {RawExpenseData} rawData
 * @param {Object} filter
 * @returns {ExpenseReportSnapshot}
 */
export function composeExpenseReportSnapshot(rawData, filter = {}) {
  const {
    expenses = [],
    categories = [],
    doctors = [],
    staff = [],
    sales = [],
    treatments = [],
    dfGroups = [],
    dfStaffRates = [],
    courses = [],
    branches = [],
    schedules = [],
    errors = {},
  } = rawData || {};

  // Filter expenses by date + branch (be_expenses has branchId)
  const filteredExpenses = filterExpensesForExpenseReport(expenses, filter);

  // Filter sales + treatments by branch (date already applied in loaders)
  const branchSet = Array.isArray(filter.branchIds) && filter.branchIds.length
    ? new Set(filter.branchIds.map(String))
    : null;
  const branchFilteredSales = branchSet
    ? sales.filter(s => s && branchSet.has(String(s.branchId)))
    : sales;
  // Treatments don't all carry branchId directly; we filter via the joined sale's
  // branchId. Phase 16.7-bis can tighten this if needed.
  const branchFilteredTreatments = branchSet
    ? (() => {
        const allowedSaleIds = new Set(branchFilteredSales.map(s => String(s.id || '')));
        return treatments.filter(t => {
          const linkedSaleId = String(t?.detail?.linkedSaleId || t?.linkedSaleId || '').trim();
          // Treatments without a linkedSaleId are kept (legacy / standalone)
          if (!linkedSaleId) return true;
          return allowedSaleIds.has(linkedSaleId);
        });
      })()
    : treatments;

  // Compute DF payout (canonical Phase 14 source for "ค่ามือ" column)
  const dfReport = computeDfPayoutReport({
    sales: branchFilteredSales,
    treatments: branchFilteredTreatments,
    doctors,
    groups: dfGroups,
    staffOverrides: dfStaffRates,
    startDate: filter.from || '',
    endDate: filter.to || '',
  });
  const dfPayoutRowsRaw = Array.isArray(dfReport?.rows) ? dfReport.rows : [];

  // Phase 16.7-ter (2026-04-29 session 33) — merge in DF from unlinked treatments
  // (treatments with filled dfEntries but empty linkedSaleId). This handles
  // the consume-existing-course case where TFP saves DF entries but no new
  // sale is created → dfPayoutAggregator's join leaves them invisible.
  // Real-production verified case: 6 treatments in April with filled
  // dfEntries, ALL with empty linkedSaleId → previously ฿0 across the board.
  const courseById = new Map(
    (Array.isArray(courses) ? courses : []).map(c => [String(c?.courseId || c?.id || ''), c])
  );
  const priceLookup = (courseId) => {
    const c = courseById.get(String(courseId));
    if (!c) return 0;
    const candidates = [c.price, c.salePrice, c.sale_price, c.priceInclVat, c.price_incl_vat];
    for (const v of candidates) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  };
  const alreadyCountedSaleIds = new Set();
  for (const r of dfPayoutRowsRaw) {
    for (const b of (r.breakdown || [])) {
      if (b?.saleId) alreadyCountedSaleIds.add(String(b.saleId));
    }
  }
  const unlinkedBuckets = computeUnlinkedTreatmentDfBuckets(
    branchFilteredTreatments,
    { alreadyCountedSaleIds, priceLookup },
  );
  const dfPayoutRows = mergeUnlinkedDfIntoPayoutRows(dfPayoutRowsRaw, unlinkedBuckets, doctors);

  // Build the 3 visible sections
  const doctorRows   = buildExpenseDoctorRows({ doctors, expenses: filteredExpenses, dfPayoutRows });
  const staffRows    = buildExpenseStaffRows({ staff, doctors, expenses: filteredExpenses, dfPayoutRows });

  // Phase 16.7-quinquies — auto-payroll / hourly / commission enrichment.
  // All computed-on-read; no Firestore writes for these auto entries.
  const allPersons = [...doctors, ...staff];
  const today = thaiTodayISO();
  const nowDate = new Date();
  const autoPayrollMap = computeAutoPayrollForPersons(allPersons, filter, today);
  const hourlyMap      = computeHourlyFromSchedules(schedules, allPersons, filter, nowDate);
  const commissionMap  = computeCommissionFromSales(branchFilteredSales, filter);

  const enrichedDoctorRows = mergeAutoIntoRows(doctorRows, autoPayrollMap, hourlyMap, commissionMap, { isStaffSection: false });
  const enrichedStaffRows  = mergeAutoIntoRows(staffRows,  autoPayrollMap, hourlyMap, commissionMap, { isStaffSection: true  });

  // Sum auto-totals for the summary tile
  let totalAutoPayroll = 0;
  for (const v of autoPayrollMap.values()) totalAutoPayroll += Number(v.totalSalary || 0);
  let totalAutoHourly = 0;
  for (const v of hourlyMap.values()) totalAutoHourly += Number(v.totalAmount || 0);
  let totalAutoCommission = 0;
  for (const v of commissionMap.values()) totalAutoCommission += Number(v.totalCommission || 0);

  const categoryRows = buildExpenseCategoryRows({ expenses: filteredExpenses });

  // Phase 16.7-ter — sum unlinked DF for totalAll calculation
  let totalUnlinkedDf = 0;
  for (const bucket of unlinkedBuckets.values()) {
    totalUnlinkedDf += Number(bucket.totalDf || 0);
  }
  const summary = computeExpenseSummary({
    doctorRows: enrichedDoctorRows,
    staffRows: enrichedStaffRows,
    categoryRows,
    totalUnlinkedDf,
    totalAutoPayroll,
    totalAutoHourly,
    totalAutoCommission,
  });

  return {
    summary,
    sections: {
      doctors:    enrichedDoctorRows,
      staff:      enrichedStaffRows,
      categories: categoryRows,
      // products section deferred to Phase 16.7-bis; emit empty so UI handles uniformly
      products:   [],
    },
    meta: {
      generatedAt:   new Date().toISOString(),
      filterApplied: { ...filter },
      branchScope:   Array.isArray(filter.branchIds) ? filter.branchIds : 'all',
      partialErrors: Object.keys(errors).length > 0 ? errors : null,
      sourceCounts: {
        expenses:   filteredExpenses.length,
        categories: categories.length,
        doctors:    doctors.length,
        staff:      staff.length,
        sales:      branchFilteredSales.length,
        treatments: branchFilteredTreatments.length,
        dfRows:     dfPayoutRows.length,
        // Phase 16.7-ter — surface diagnostics for "ทำไมรายงานเป็น 0"
        courses:    courses.length,
        branches:   branches.length,
        unlinkedDfDoctors: unlinkedBuckets.size,
        // Phase 16.7-quinquies — payroll diagnostics
        schedules: schedules.length,
        autoPayrollPersons: autoPayrollMap.size,
        hourlyPersons: hourlyMap.size,
        commissionSellers: commissionMap.size,
      },
    },
  };
}

// ─── Convenience wrapper ───────────────────────────────────────────────────

/**
 * Full pipeline: fetch all data, then compose snapshot.
 *
 * @param {Object} filter  { from, to, branchIds? }
 * @returns {Promise<ExpenseReportSnapshot>}
 */
export async function expenseReportAggregator(filter = {}) {
  const raw = await fetchExpenseReportData(filter);
  return composeExpenseReportSnapshot(raw, filter);
}
