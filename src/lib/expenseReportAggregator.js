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

import { listDoctors, listStaff, listExpenseCategories, listDfGroups, listDfStaffRates } from './backendClient.js';
import { loadSalesByDateRange, loadTreatmentsByDateRange, loadExpensesByDateRange } from './reportsLoaders.js';
import { computeDfPayoutReport } from './dfPayoutAggregator.js';
import {
  filterExpensesForExpenseReport,
  buildExpenseDoctorRows,
  buildExpenseStaffRows,
  buildExpenseCategoryRows,
  computeExpenseSummary,
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
  const dfPayoutRows = Array.isArray(dfReport?.rows) ? dfReport.rows : [];

  // Build the 3 visible sections
  const doctorRows   = buildExpenseDoctorRows({ doctors, expenses: filteredExpenses, dfPayoutRows });
  const staffRows    = buildExpenseStaffRows({ staff, doctors, expenses: filteredExpenses, dfPayoutRows });
  const categoryRows = buildExpenseCategoryRows({ expenses: filteredExpenses });
  const summary      = computeExpenseSummary({ doctorRows, staffRows, categoryRows });

  return {
    summary,
    sections: {
      doctors:    doctorRows,
      staff:      staffRows,
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
