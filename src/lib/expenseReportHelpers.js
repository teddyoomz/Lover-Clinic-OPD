// ─── Expense Report pure helpers — Phase 16.7 (2026-04-29 session 33) ─────
//
// Replicates ProClinic /admin/report/expense layout using OUR be_* data.
//
// 4 sections per Phase 0 intel (docs/proclinic-scan/_phase0-intel.log):
//   1. Doctors section  — แพทย์ / ค่านั่ง / ค่ามือ / เงินเดือน / รายจ่ายอื่นๆ / ยอดรวม
//   2. Staff section    — พนักงาน / ตำแหน่ง / ค่ามือ / เงินเดือน / รายจ่ายอื่นๆ / ยอดรวม
//                        (includes be_doctors where position='ผู้ช่วยแพทย์' alongside be_staff)
//   3. Category section — หมวดหมู่ / จำนวนรายการ / ยอดรวม
//   4. Products section — สินค้า / จำนวนที่ซื้อ / จำนวนครั้งที่สั่ง / ยอดรวม
//                        (deferred to v2 — needs central-stock-orders cost tracking)
//
// All pure: no Firestore imports, no React imports, deterministic given inputs.
//
// Iron-clad refs:
//   E       — Firestore-only (no proclinic-api fetches); helpers read be_* only
//   H       — be_* canonical (no upstream-sync reads)
//   H-quater— upstream-sync collections off-limits in feature code (this is feature code)
//   I       — full-flow simulate at sub-phase end (test bank covers this)
//   AR3     — cancelled / void excluded from sums
//   AR4     — currency rounding via roundTHB
//   V14     — no `: undefined` leaves in output

import { roundTHB } from './reportsUtils.js';

// ─── Category-name pattern matchers ──────────────────────────────────────
// ProClinic category enum (per /admin/expense forms intel):
//   bonus, Lab, ค่านั่ง, ค่านั่งแพทย์, ค่ามือพนักงาน, สินค้าสิ้นเปลือง, ...
//
// We classify each expense into one of: sitFee | salary | df | other
// using categoryName regex. DF column for doctors is ALSO populated from
// be_treatments.detail.dfEntries[] (canonical source) via dfPayoutAggregator
// — categoryName="ค่ามือ" expenses are double-counted-protected by the
// aggregator (see Phase 16.7 dfPayoutAggregator audit).

/** ค่านั่งแพทย์ / ค่านั่ง / sit fee — applies ONLY to doctors */
const RX_SIT_FEE = /^\s*(ค่านั่ง)/;
/** เงินเดือน / โบนัส / bonus — applies to anyone */
const RX_SALARY  = /^\s*(เงินเดือน|โบนัส|bonus)/i;
/** ค่ามือ — applies to anyone (DF expenses booked manually outside dfEntries) */
const RX_DF      = /^\s*(ค่ามือ)/;

/** Classify an expense's category into a column bucket. */
function classifyExpenseCategory(categoryName) {
  const s = String(categoryName || '');
  if (RX_SIT_FEE.test(s)) return 'sitFee';
  if (RX_SALARY.test(s))  return 'salary';
  if (RX_DF.test(s))      return 'df';
  return 'other';
}

/**
 * Filter expenses by date range + optional branchIds + non-void.
 *
 * Mirrors `clinicReportHelpers.filterExpensesForReport` shape; duplicated here
 * to keep this module independent of clinicReportHelpers (different consumer
 * surface / different test suite).
 */
export function filterExpensesForExpenseReport(expenses, { from, to, branchIds } = {}) {
  if (!Array.isArray(expenses)) return [];
  const branchSet = Array.isArray(branchIds) && branchIds.length
    ? new Set(branchIds.map(String))
    : null;
  return expenses.filter(e => {
    if (!e || e.status === 'void') return false;
    const d = String(e.date || e.expenseDate || e.createdAt || '').slice(0, 10);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (branchSet && !branchSet.has(String(e.branchId))) return false;
    return true;
  });
}

/** Build map: userId → { sitFee, salary, df, other } summed amounts. */
function bucketExpensesByUser(expenses) {
  const map = new Map();
  for (const e of expenses) {
    const uid = String(e?.userId || '').trim();
    if (!uid) continue; // expenses without userId go to "categoryRows" only, not per-person
    const bucket = classifyExpenseCategory(e?.categoryName);
    const amt = Number(e?.amount) || 0;
    if (!map.has(uid)) map.set(uid, { sitFee: 0, salary: 0, df: 0, other: 0 });
    map.get(uid)[bucket] += amt;
  }
  return map;
}

/** Format full name from a be_doctors / be_staff doc. */
function fullName(doc) {
  if (!doc) return '';
  if (doc.name) return String(doc.name);
  const f = String(doc.firstname || '').trim();
  const l = String(doc.lastname || '').trim();
  const nick = String(doc.nickname || '').trim();
  const both = [f, l].filter(Boolean).join(' ');
  if (both && nick) return `${both} (${nick})`;
  return both || nick || String(doc.id || '');
}

/**
 * Build doctor expense rows — one row per doctor with position='แพทย์'.
 *
 * Columns mirror ProClinic /admin/report/expense doctor table:
 *   - sitFee   — categoryName matches /ค่านั่ง/ AND userId === doctor.id
 *   - df       — totalDf from dfPayoutRows (canonical Phase 14 source)
 *                NOTE: if expense category="ค่ามือ" exists for the same
 *                doctorId, it's added on top of dfEntries DF. Duplicates
 *                are caller's responsibility to avoid (admin should NOT
 *                book "ค่ามือ" expenses if dfEntries already cover them).
 *   - salary   — categoryName matches /เงินเดือน|โบนัส/ AND userId
 *   - other    — everything else with userId === doctor.id
 *   - total    — sitFee + df + salary + other
 *
 * @param {Object} args
 * @param {Array<Object>} args.doctors      — be_doctors docs (position field)
 * @param {Array<Object>} args.expenses     — already date+branch filtered (use filterExpensesForExpenseReport)
 * @param {Array<Object>} args.dfPayoutRows — output of computeDfPayoutReport.rows
 * @returns {Array<{id, name, position, sitFee, df, salary, other, total}>}
 */
export function buildExpenseDoctorRows({ doctors = [], expenses = [], dfPayoutRows = [] } = {}) {
  const dfMap = new Map();
  for (const r of dfPayoutRows) {
    const id = String(r?.doctorId || '').trim();
    if (id) dfMap.set(id, Number(r?.totalDf) || 0);
  }
  const userBuckets = bucketExpensesByUser(expenses);
  const rows = [];
  for (const d of doctors) {
    if (!d) continue;
    if (d.position !== 'แพทย์') continue; // assistant goes to staff section
    const id = String(d.id || '').trim();
    if (!id) continue;
    const bucket = userBuckets.get(id) || { sitFee: 0, salary: 0, df: 0, other: 0 };
    const dfFromTreatments = dfMap.get(id) || 0;
    const dfTotal = dfFromTreatments + bucket.df; // dfEntries + manual ค่ามือ
    const sitFee = roundTHB(bucket.sitFee);
    const salary = roundTHB(bucket.salary);
    const other  = roundTHB(bucket.other);
    const df     = roundTHB(dfTotal);
    const total  = roundTHB(sitFee + df + salary + other);
    rows.push({
      id,
      name: fullName(d),
      position: 'แพทย์',
      sitFee,
      df,
      salary,
      other,
      total,
    });
  }
  rows.sort((a, b) => b.total - a.total);
  return rows;
}

/**
 * Build staff expense rows — one row per (be_staff entry) + (be_doctors where
 * position='ผู้ช่วยแพทย์'). Mirrors ProClinic staff table columns
 * (no sitFee column for staff per intel).
 *
 * @param {Object} args
 * @param {Array<Object>} args.staff        — be_staff docs
 * @param {Array<Object>} args.doctors      — be_doctors docs (filter to ผู้ช่วยแพทย์)
 * @param {Array<Object>} args.expenses     — date+branch filtered
 * @param {Array<Object>} args.dfPayoutRows — output of computeDfPayoutReport.rows
 * @returns {Array<{id, name, position, df, salary, other, total}>}
 */
export function buildExpenseStaffRows({ staff = [], doctors = [], expenses = [], dfPayoutRows = [] } = {}) {
  const dfMap = new Map();
  for (const r of dfPayoutRows) {
    const id = String(r?.doctorId || '').trim();
    if (id) dfMap.set(id, Number(r?.totalDf) || 0);
  }
  const userBuckets = bucketExpensesByUser(expenses);
  const rows = [];
  // 1. be_staff rows
  for (const s of staff) {
    if (!s) continue;
    const id = String(s.id || '').trim();
    if (!id) continue;
    const bucket = userBuckets.get(id) || { sitFee: 0, salary: 0, df: 0, other: 0 };
    // Staff DF = manual ค่ามือ expenses only (staff aren't tracked in dfEntries)
    const df     = roundTHB(bucket.df);
    const salary = roundTHB(bucket.salary);
    // sitFee for staff is uncommon but possible — fold into "other"
    const other  = roundTHB(bucket.other + bucket.sitFee);
    const total  = roundTHB(df + salary + other);
    rows.push({
      id,
      name: fullName(s),
      position: String(s.position || ''),
      df,
      salary,
      other,
      total,
    });
  }
  // 2. be_doctors with position='ผู้ช่วยแพทย์'
  for (const d of doctors) {
    if (!d) continue;
    if (d.position !== 'ผู้ช่วยแพทย์') continue;
    const id = String(d.id || '').trim();
    if (!id) continue;
    const bucket = userBuckets.get(id) || { sitFee: 0, salary: 0, df: 0, other: 0 };
    // Assistants CAN appear in dfEntries (Phase 14 dfEntries.doctorId may be
    // either a doctor OR an assistant — the schema doesn't distinguish; the
    // dfPayoutAggregator looks up by doctorId in be_doctors which catches
    // either position).
    const dfFromTreatments = dfMap.get(id) || 0;
    const df     = roundTHB(dfFromTreatments + bucket.df);
    const salary = roundTHB(bucket.salary);
    const other  = roundTHB(bucket.other + bucket.sitFee);
    const total  = roundTHB(df + salary + other);
    rows.push({
      id,
      name: fullName(d),
      position: 'ผู้ช่วยแพทย์',
      df,
      salary,
      other,
      total,
    });
  }
  rows.sort((a, b) => b.total - a.total);
  return rows;
}

/**
 * Build category expense rows — group be_expenses by categoryName, count + sum.
 *
 * @param {Object} args
 * @param {Array<Object>} args.expenses   — date+branch filtered
 * @returns {Array<{categoryName, count, total}>}
 */
export function buildExpenseCategoryRows({ expenses = [] } = {}) {
  const map = new Map();
  for (const e of expenses) {
    const cat = String(e?.categoryName || 'ไม่ระบุหมวดหมู่');
    if (!map.has(cat)) map.set(cat, { categoryName: cat, count: 0, total: 0 });
    const ent = map.get(cat);
    ent.count += 1;
    ent.total += Number(e?.amount) || 0;
  }
  const rows = [...map.values()].map(r => ({ ...r, total: roundTHB(r.total) }));
  rows.sort((a, b) => b.total - a.total);
  return rows;
}

/**
 * Compute summary totals across all sections.
 *
 * @returns {{
 *   totalDoctor: number, totalDoctorSit: number, totalDoctorDf: number,
 *   totalStaff:  number, totalStaffDf:    number, totalStaffSalary: number,
 *   totalCategory: number,
 *   totalAll: number, totalDoctorCount: number, totalStaffCount: number,
 *   totalCategoryCount: number,
 * }}
 */
export function computeExpenseSummary({ doctorRows = [], staffRows = [], categoryRows = [] } = {}) {
  const sumKey = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  const totalDoctor       = roundTHB(sumKey(doctorRows, 'total'));
  const totalDoctorSit    = roundTHB(sumKey(doctorRows, 'sitFee'));
  const totalDoctorDf     = roundTHB(sumKey(doctorRows, 'df'));
  const totalDoctorSalary = roundTHB(sumKey(doctorRows, 'salary'));
  const totalDoctorOther  = roundTHB(sumKey(doctorRows, 'other'));
  const totalStaff        = roundTHB(sumKey(staffRows, 'total'));
  const totalStaffDf      = roundTHB(sumKey(staffRows, 'df'));
  const totalStaffSalary  = roundTHB(sumKey(staffRows, 'salary'));
  const totalStaffOther   = roundTHB(sumKey(staffRows, 'other'));
  const totalCategory     = roundTHB(sumKey(categoryRows, 'total'));
  // totalAll uses the category sum because doctor + staff sums and category
  // sum should reconcile: every expense has both a categoryName AND (usually)
  // a userId. Doctor + staff rows skip expenses-without-userId; category
  // captures everything. We expose both and let the UI display category sum
  // as the "total" headline.
  const totalAll = totalCategory;
  return {
    totalDoctor,
    totalDoctorSit,
    totalDoctorDf,
    totalDoctorSalary,
    totalDoctorOther,
    totalStaff,
    totalStaffDf,
    totalStaffSalary,
    totalStaffOther,
    totalCategory,
    totalAll,
    totalDoctorCount: doctorRows.length,
    totalStaffCount: staffRows.length,
    totalCategoryCount: categoryRows.length,
  };
}

/** Re-export pattern matchers for tests + downstream consumers (Rule of 3). */
export const EXPENSE_CATEGORY_PATTERNS = Object.freeze({
  RX_SIT_FEE,
  RX_SALARY,
  RX_DF,
});

export { classifyExpenseCategory, bucketExpensesByUser, fullName };
