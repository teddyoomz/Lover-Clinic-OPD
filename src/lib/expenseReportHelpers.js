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
export function computeExpenseSummary({
  doctorRows = [],
  staffRows = [],
  categoryRows = [],
  totalUnlinkedDf = 0,
  totalAutoPayroll = 0,
  totalAutoHourly = 0,
  totalAutoCommission = 0,
} = {}) {
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
  // Phase 16.7-ter (2026-04-29 session 33): totalAll = categoryTotal +
  // unlinkedDfTotal. Pre-fix totalAll = totalCategory which missed DF from
  // treatments that weren't yet booked as be_expenses. Real-production case
  // (user-reported all-zeros bug): be_expenses is empty BUT 6 treatments
  // had filled dfEntries totaling ~14,710 baht → previously totalAll showed
  // ฿0 even though doctors had earned DF.
  const unlinkedDf = roundTHB(Number(totalUnlinkedDf || 0));
  const autoPayroll    = roundTHB(Number(totalAutoPayroll || 0));
  const autoHourly     = roundTHB(Number(totalAutoHourly || 0));
  const autoCommission = roundTHB(Number(totalAutoCommission || 0));
  const totalAll = roundTHB(totalCategory + unlinkedDf + autoPayroll + autoHourly + autoCommission);
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
    totalUnlinkedDf: unlinkedDf,
    totalAutoPayroll: autoPayroll,
    totalAutoHourly: autoHourly,
    totalAutoCommission: autoCommission,
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

/**
 * Phase 16.7-ter (2026-04-29 session 33) — compute DF for treatments whose
 * dfEntries are filled in but whose linkedSaleId is empty (or points to a
 * sale outside the date range / not loaded).
 *
 * Why this exists:
 *   `dfPayoutAggregator.computeDfPayoutReport` requires a treatment-to-sale
 *   join (Phase 14.5) — it iterates SALES and for each in-range sale checks
 *   `explicitBySale[saleId]` for a matching treatment. Treatments with empty
 *   linkedSaleId NEVER match the join → their DF is invisible.
 *
 *   Real production case: when a user completes a treatment that consumes
 *   an EXISTING customer course (not a new purchase), no fresh sale is
 *   created. TreatmentFormPage saves `detail.dfEntries[]` but
 *   `detail.linkedSaleId` stays empty → DF goes uncounted.
 *
 *   Investigation 2026-04-29 (session 33 user-reported all-zeros bug):
 *   6 treatments in April had filled dfEntries; ALL 6 had `linkedSaleId=''`.
 *   ExpenseReportTab + DfPayoutReportTab both showed ฿0 for every doctor.
 *
 * What we compute:
 *   - For `type: 'baht'` rate rows: DF = `value` per row (flat baht; qty
 *     defaults to 1 because the treatment is the qty unit).
 *   - For `type: 'percent'` rate rows: DF = `price * (value / 100)`. Price
 *     comes from the `priceLookup(courseId)` callback (be_courses lookup);
 *     when the lookup returns 0 / null, the row is skipped (no sale = no
 *     price = no DF). v1 limitation: documented in test bank.
 *
 * Idempotent with dfPayoutAggregator: pass `alreadyCountedSaleIds` so we
 * SKIP any treatment whose linkedSaleId is already covered by the canonical
 * Phase 14.5 path. Treatments without linkedSaleId are always processed
 * here. Treatments with linkedSaleId pointing to an out-of-range sale are
 * also processed (since dfPayoutAggregator's sale loop excludes them).
 *
 * @param {Array<Object>} treatments
 * @param {Object} [options]
 * @param {Set<string>} [options.alreadyCountedSaleIds]   — saleIds already counted by dfPayoutAggregator
 * @param {(courseId: string) => number} [options.priceLookup] — be_courses price for percent rates
 * @returns {Map<string, { totalDf: number, lineCount: number, breakdown: Array<Object> }>}
 *          per-doctor unlinked-DF buckets
 */
export function computeUnlinkedTreatmentDfBuckets(treatments, options = {}) {
  const { alreadyCountedSaleIds = new Set(), priceLookup = null } = options;
  const map = new Map();
  for (const t of (treatments || [])) {
    if (!t) continue;
    const linked = String(t?.detail?.linkedSaleId || t?.linkedSaleId || '').trim();
    // If linked AND already counted by dfPayoutAggregator → skip (no double-count).
    if (linked && alreadyCountedSaleIds.has(linked)) continue;
    const entries = t?.detail?.dfEntries;
    if (!Array.isArray(entries) || entries.length === 0) continue;

    for (const entry of entries) {
      const doctorId = String(entry?.doctorId || '').trim();
      if (!doctorId) continue;
      for (const row of (entry.rows || [])) {
        if (!row || !row.enabled) continue;
        const value = Number(row.value) || 0;
        if (value <= 0) continue;
        const type = row.type;
        let df = 0;
        let priceUsed = null;
        if (type === 'baht') {
          df = value; // flat per visit; qty=1
        } else if (type === 'percent') {
          if (typeof priceLookup !== 'function') continue;
          const courseId = String(row.courseId || '').trim();
          if (!courseId) continue;
          priceUsed = priceLookup(courseId) || 0;
          if (priceUsed <= 0) continue;
          df = priceUsed * (value / 100);
        } else {
          continue; // unknown type
        }
        if (df <= 0) continue;
        if (!map.has(doctorId)) {
          map.set(doctorId, { totalDf: 0, lineCount: 0, breakdown: [] });
        }
        const bucket = map.get(doctorId);
        bucket.totalDf += df;
        bucket.lineCount += 1;
        bucket.breakdown.push({
          treatmentId: t.id || t.treatmentId || null,
          treatmentDate: t?.detail?.treatmentDate || '',
          courseId: row.courseId || '',
          courseName: row.courseName || '',
          rateType: type,
          rateValue: value,
          priceUsed,
          df,
          source: 'unlinkedTreatment',
        });
      }
    }
  }
  return map;
}

/**
 * Phase 16.7-ter — merge unlinked-DF buckets into dfPayoutAggregator rows
 * before passing to buildExpenseDoctorRows / buildExpenseStaffRows.
 *
 * Returns a NEW array; does NOT mutate input rows. New doctorIds (not in
 * the original dfPayoutRows) get a synthetic row with totalDf populated.
 *
 * @param {Array<{doctorId, doctorName, totalDf, lineCount, breakdown, ...}>} dfPayoutRows
 * @param {Map<string, {totalDf, lineCount, breakdown}>} unlinkedBuckets
 * @param {Array<Object>} doctors  — for resolving doctorName on synthetic rows
 * @returns {Array<{doctorId, doctorName, totalDf, lineCount, breakdown}>}
 */
export function mergeUnlinkedDfIntoPayoutRows(dfPayoutRows, unlinkedBuckets, doctors = []) {
  const safeRows = Array.isArray(dfPayoutRows) ? dfPayoutRows : [];
  const safeBuckets = unlinkedBuckets instanceof Map ? unlinkedBuckets : new Map();
  if (safeBuckets.size === 0) return safeRows.map(r => ({ ...r }));

  const doctorById = new Map(
    (doctors || []).map(d => [String(d?.doctorId || d?.id || ''), d])
  );
  const out = safeRows.map(r => {
    const doctorId = String(r?.doctorId || '');
    const bucket = safeBuckets.get(doctorId);
    if (!bucket) return { ...r };
    return {
      ...r,
      totalDf: roundTHB(Number(r.totalDf || 0) + bucket.totalDf),
      lineCount: Number(r.lineCount || 0) + bucket.lineCount,
      breakdown: [...(Array.isArray(r.breakdown) ? r.breakdown : []), ...bucket.breakdown],
    };
  });
  // Add synthetic rows for doctorIds present in buckets but not in original rows
  const seen = new Set(out.map(r => String(r.doctorId)));
  for (const [doctorId, bucket] of safeBuckets) {
    if (seen.has(doctorId)) continue;
    const doctor = doctorById.get(doctorId);
    const doctorName = doctor?.name
      || `${doctor?.firstname || ''} ${doctor?.lastname || ''}`.trim()
      || doctor?.nickname
      || doctorId;
    out.push({
      doctorId,
      doctorName,
      dfGroupId: doctor?.defaultDfGroupId || '',
      totalDf: roundTHB(bucket.totalDf),
      saleCount: 0,
      lineCount: bucket.lineCount,
      breakdown: bucket.breakdown,
    });
  }
  return out;
}
