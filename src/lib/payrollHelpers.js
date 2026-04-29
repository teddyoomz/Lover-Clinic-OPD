// ─── Payroll Helpers — Phase 16.7-quinquies (2026-04-29 session 33) ────────
//
// 3 pure helpers + 1 utility for auto-computing labor cost in the Expense
// Report tab without writing be_expenses docs (computed-on-read):
//
//   - computeAutoPayrollForPersons(persons, filter, today)
//       → Map<personId, {totalSalary, payDates}>
//   - computeHourlyFromSchedules(schedules, persons, filter, now)
//       → Map<personId, {totalAmount, totalHours}>
//   - computeCommissionFromSales(sales, filter)
//       → Map<sellerId, {totalCommission, perSale}>
//   - mergeAutoIntoRows(personRows, autoPayrollMap, hourlyMap, commissionMap, options)
//       → enriches rows in-place via shallow copy
//   + clampPayDayToMonth(yearMonth, salaryDate) utility
//
// All pure: no Firestore imports, no React imports, deterministic given
// inputs. Iron-clad refs:
//   E       — Firestore-only (no /api/proclinic/* fetches; helpers consume be_*)
//   H + H-quater — be_* canonical (no upstream-sync reads)
//   I       — full-flow simulate at sub-phase end (test bank covers)
//   AR4     — currency rounding via roundTHB
//   V14     — no `: undefined` leaves in output

import { roundTHB } from './reportsUtils.js';
import { getSaleNetTotal } from './clinicReportHelpers.js';

/**
 * Clamp a payday to the last day of the given month.
 * Example: clampPayDayToMonth('2026-02', 31) → 28 (or 29 in leap year)
 * Example: clampPayDayToMonth('2026-04', 31) → 30
 *
 * @param {string} yearMonth  — 'YYYY-MM'
 * @param {number} salaryDate — 1..31
 * @returns {number} clamped day-of-month (1..31)
 */
export function clampPayDayToMonth(yearMonth, salaryDate) {
  if (!yearMonth || !Number.isFinite(salaryDate) || salaryDate < 1) return 1;
  const [y, m] = String(yearMonth).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 1;
  // Last day of month: day 0 of next month = last day of current
  const lastDay = new Date(y, m, 0).getDate();
  return Math.min(Math.max(1, Number(salaryDate) || 1), lastDay);
}

/**
 * Compute auto-payroll virtual entries (NOT stored in Firestore) for each
 * person whose salary + salaryDate are configured. For each month in the
 * filter range:
 *   payDayThisMonth = clampPayDayToMonth(yearMonth, person.salaryDate)
 *   payDate = `${yearMonth}-${zeropad(payDayThisMonth)}`
 *   if payDate ∈ [from, to] AND payDate <= today
 *     → accumulate person.salary into Map for that personId
 *
 * Always uses CURRENT person.salary (no historical snapshot in v1).
 *
 * @param {Array<{id, salary, salaryDate}>} persons
 * @param {{from: string, to: string}} filter — YYYY-MM-DD inclusive
 * @param {string} today — YYYY-MM-DD ('today' for tests; real callers pass thaiTodayISO())
 * @returns {Map<string, {totalSalary: number, payDates: string[]}>}
 */
export function computeAutoPayrollForPersons(persons, filter, today) {
  const map = new Map();
  const from = String(filter?.from || '').slice(0, 10);
  const to = String(filter?.to || '').slice(0, 10);
  const cutoff = String(today || '').slice(0, 10);
  if (!from || !to || !cutoff) return map;
  if (!Array.isArray(persons)) return map;

  // Build month list spanning [from, to]
  const months = [];
  let cur = from.slice(0, 7); // 'YYYY-MM'
  const endMonth = to.slice(0, 7);
  while (cur <= endMonth) {
    months.push(cur);
    const [y, m] = cur.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    cur = next;
    if (months.length >= 36) break; // safety cap: 3 years
  }

  for (const p of persons) {
    if (!p) continue;
    const id = String(p.id || p.doctorId || p.staffId || '').trim();
    if (!id) continue;
    const salary = Number(p.salary) || 0;
    const salaryDate = Number(p.salaryDate);
    if (salary <= 0 || !Number.isInteger(salaryDate) || salaryDate < 1 || salaryDate > 31) continue;

    for (const ym of months) {
      const day = clampPayDayToMonth(ym, salaryDate);
      const payDate = `${ym}-${String(day).padStart(2, '0')}`;
      if (payDate < from) continue;
      if (payDate > to) continue;
      if (payDate > cutoff) continue; // future payday — not yet accrued
      const cur = map.get(id) || { totalSalary: 0, payDates: [] };
      cur.totalSalary += salary;
      cur.payDates.push(payDate);
      map.set(id, cur);
    }
  }
  // Round at the end
  for (const [k, v] of map) {
    map.set(k, { totalSalary: roundTHB(v.totalSalary), payDates: v.payDates });
  }
  return map;
}

/**
 * Compute hourly fee accumulation from be_staff_schedules.
 *
 * For each schedule entry:
 *   - skip if entry.type ∈ {'leave', 'off', 'holiday'} (non-working)
 *   - skip if entry.status === 'cancelled'
 *   - skip if entry.date NOT in [from, to]
 *   - skip if endTime > now (only count elapsed hours)
 *   - skip if branchIds filter active and entry.branchId not in set
 *   - hours = (endTime - startTime) in hours; cap at 24h per entry (cross-midnight safety)
 *   - accumulate person.hourlyIncome × hours into Map keyed by staffId
 *
 * @param {Array<{staffId, date, startTime, endTime, type, status, branchId}>} schedules
 * @param {Array<{id, hourlyIncome}>} persons
 * @param {{from, to, branchIds?}} filter
 * @param {Date} now — current Date (real callers pass `new Date()`)
 * @returns {Map<string, {totalAmount: number, totalHours: number}>}
 */
export function computeHourlyFromSchedules(schedules, persons, filter, now) {
  const map = new Map();
  const from = String(filter?.from || '').slice(0, 10);
  const to = String(filter?.to || '').slice(0, 10);
  if (!from || !to) return map;
  if (!Array.isArray(schedules) || !Array.isArray(persons)) return map;
  const branchSet = Array.isArray(filter?.branchIds) && filter.branchIds.length
    ? new Set(filter.branchIds.map(String))
    : null;

  // Build hourlyIncome lookup
  const rateById = new Map();
  for (const p of persons) {
    if (!p) continue;
    const id = String(p.id || p.doctorId || p.staffId || '').trim();
    const rate = Number(p.hourlyIncome) || 0;
    if (id && rate > 0) rateById.set(id, rate);
  }
  if (rateById.size === 0) return map;

  const NON_WORKING_TYPES = new Set(['leave', 'off', 'holiday']);

  // Helper: parse 'YYYY-MM-DD' + 'HH:MM' → Date in local TZ
  const parseDateTime = (date, time) => {
    if (!date || !time) return null;
    const [y, m, d] = String(date).split('-').map(Number);
    const [hh, mm] = String(time).split(':').map(Number);
    if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  };

  for (const e of schedules) {
    if (!e) continue;
    if (NON_WORKING_TYPES.has(e.type)) continue;
    if (e.status === 'cancelled') continue;
    const date = String(e.date || '').slice(0, 10);
    if (!date) continue;
    if (date < from || date > to) continue;
    if (branchSet && e.branchId && !branchSet.has(String(e.branchId))) continue;
    const staffId = String(e.staffId || '').trim();
    if (!staffId) continue;
    const rate = rateById.get(staffId);
    if (!rate) continue;

    const startDt = parseDateTime(date, e.startTime);
    const endDt = parseDateTime(date, e.endTime);
    if (!startDt || !endDt) continue;
    if (endDt <= startDt) continue; // invalid range
    if (endDt > now) continue;       // not yet elapsed
    let hours = (endDt - startDt) / (1000 * 60 * 60);
    if (hours > 24) hours = 24;      // cross-midnight safety cap
    if (hours <= 0) continue;

    const cur = map.get(staffId) || { totalAmount: 0, totalHours: 0 };
    cur.totalHours += hours;
    cur.totalAmount += rate * hours;
    map.set(staffId, cur);
  }
  for (const [k, v] of map) {
    map.set(k, { totalAmount: roundTHB(v.totalAmount), totalHours: Math.round(v.totalHours * 100) / 100 });
  }
  return map;
}

/**
 * Compute commission per seller from sale.sellers[].percent × sale.netTotal.
 *
 * For each sale in [from, to] (branch-filtered, non-cancelled, non-refunded):
 *   netTotal = getSaleNetTotal(sale)
 *   For each seller in sale.sellers[]:
 *     pct = Number(seller.percent) || (Number(seller.share) * 100) || 0
 *     if pct > 0 → commission = netTotal × pct / 100
 *     accumulate per (seller.sellerId || seller.id), preserving per-sale breakdown for tooltip
 *
 * Note: percent=0 → commission=0 (deliberate; opt-in commission, no equal-split
 * fallback like dfPayoutAggregator. Commission is paid only when admin sets a
 * non-zero percent on the sale.)
 *
 * @param {Array} sales
 * @param {{from, to, branchIds?}} filter
 * @returns {Map<string, {totalCommission: number, perSale: Array<{saleId, saleDate, amount, percent}>}>}
 */
export function computeCommissionFromSales(sales, filter) {
  const map = new Map();
  const from = String(filter?.from || '').slice(0, 10);
  const to = String(filter?.to || '').slice(0, 10);
  if (!Array.isArray(sales)) return map;
  const branchSet = Array.isArray(filter?.branchIds) && filter.branchIds.length
    ? new Set(filter.branchIds.map(String))
    : null;

  for (const s of sales) {
    if (!s) continue;
    if (s.status === 'cancelled' || s.refunded) continue;
    const date = String(s.saleDate || s.createdAt || '').slice(0, 10);
    if (!date) continue;
    if (from && date < from) continue;
    if (to && date > to) continue;
    if (branchSet && s.branchId && !branchSet.has(String(s.branchId))) continue;

    const netTotal = getSaleNetTotal(s);
    if (netTotal <= 0) continue;
    const sellers = Array.isArray(s.sellers) ? s.sellers : [];
    if (sellers.length === 0) continue;

    for (const seller of sellers) {
      if (!seller) continue;
      const id = String(seller.sellerId || seller.id || '').trim();
      if (!id) continue;
      let pct = Number(seller.percent);
      if (!Number.isFinite(pct) || pct <= 0) {
        const sh = Number(seller.share);
        if (Number.isFinite(sh) && sh > 0) pct = sh * 100;
      }
      if (!Number.isFinite(pct) || pct <= 0) continue;
      const amount = netTotal * (pct / 100);
      if (amount <= 0) continue;

      const cur = map.get(id) || { totalCommission: 0, perSale: [] };
      cur.totalCommission += amount;
      cur.perSale.push({
        saleId: String(s.saleId || s.id || ''),
        saleDate: date,
        amount: roundTHB(amount),
        percent: pct,
      });
      map.set(id, cur);
    }
  }
  for (const [k, v] of map) {
    map.set(k, { totalCommission: roundTHB(v.totalCommission), perSale: v.perSale });
  }
  return map;
}

/**
 * Enrich doctor/staff rows IN-PLACE via shallow copy with auto-computed
 * payroll / hourly / commission amounts. Keeps the source rows untouched
 * (returns a new array of new objects).
 *
 * options.isStaffSection: when true, hourly amount goes to `other` column
 * (staff has no sitFee column per ProClinic intel). Default false (doctor
 * section: hourly → sitFee).
 *
 * Recomputes `total = sitFee + df + salary + other` for each row.
 *
 * @param {Array} personRows  — rows from buildExpenseDoctorRows / buildExpenseStaffRows
 * @param {Map<string, {totalSalary}>} autoPayrollMap
 * @param {Map<string, {totalAmount}>} hourlyMap
 * @param {Map<string, {totalCommission}>} commissionMap
 * @param {{isStaffSection?: boolean}} [options]
 * @returns {Array} new rows with enriched columns
 */
export function mergeAutoIntoRows(personRows, autoPayrollMap, hourlyMap, commissionMap, options = {}) {
  if (!Array.isArray(personRows)) return [];
  const isStaff = !!options.isStaffSection;
  const safeMap = (m) => (m instanceof Map ? m : new Map());
  const ap = safeMap(autoPayrollMap);
  const hr = safeMap(hourlyMap);
  const cm = safeMap(commissionMap);

  return personRows.map((r) => {
    if (!r || typeof r !== 'object') return r;
    const id = String(r.id || '');
    const addSalary = Number(ap.get(id)?.totalSalary) || 0;
    const addHourly = Number(hr.get(id)?.totalAmount) || 0;
    const addCommission = Number(cm.get(id)?.totalCommission) || 0;

    const next = { ...r };
    next.salary = roundTHB((Number(r.salary) || 0) + addSalary);
    if (isStaff) {
      next.other = roundTHB((Number(r.other) || 0) + addHourly + addCommission);
      next.total = roundTHB((Number(next.df) || 0) + (Number(next.salary) || 0) + (Number(next.other) || 0));
    } else {
      next.sitFee = roundTHB((Number(r.sitFee) || 0) + addHourly);
      next.other = roundTHB((Number(r.other) || 0) + addCommission);
      next.total = roundTHB(
        (Number(next.sitFee) || 0) +
        (Number(next.df) || 0) +
        (Number(next.salary) || 0) +
        (Number(next.other) || 0),
      );
    }
    return next;
  });
}
