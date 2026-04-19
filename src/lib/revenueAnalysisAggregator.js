// ─── Revenue Analysis by Procedure (Phase 10.7) — pure, deterministic ────
//
// Source: be_sales.items.courses[] flattened + joined to master_data/courses
//         for procedure_type_name + category_name.
//
// Output shape: { rows, totals, meta } per /audit-reports-accuracy AR5.
//
// Triangle-verified 2026-04-20: 10 cols captured via opd.js intel of
// /admin/revenue-analysis-by-procedure. Sample row validates math:
// qty=5 × unit lineTotal = ยอดรวม 115,000 − 112.40 deposit share
//                                           − 0 wallet − 0 refund
//                        = ยอดชำระเงิน 114,887.60  ✓ (within AR4 rounding)
//
// Iron-clad:
//   - AR1 date range on saleDate
//   - AR3 cancelled sales never contribute
//   - AR4 all currency via roundTHB
//   - AR5 column totals reconcile to row sums
//   - AR14 defensive access
//   - AR15 pure — asOfISO / filters are PARAMETERS
//
// Proportional-split convention (plan 3.6 line "หักมัดจำ"):
//   For a sale with N course items summing to S, depositApplied D splits as:
//     line_i.depositShare = D × (line_i.lineTotal / S), with last line
//     absorbing the rounding remainder so sum(shares) === D exactly.
//   Same for walletApplied + refundAmount.

import { roundTHB, dateRangeFilter, sortBy, proportional } from './reportsUtils.js';

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Resolve course master doc (procedure_type_name + category_name + fallback name). */
function resolveCourseMaster(courseId, courseName, courseIndex) {
  if (!courseId && !courseName) return {
    procedureType: 'ไม่ระบุ',
    category: 'ไม่ระบุ',
    name: courseName || '-',
  };
  const byId = courseId ? courseIndex.get(String(courseId)) : null;
  const byName = !byId && courseName ? courseIndex.get(`NAME:${courseName}`) : null;
  const doc = byId || byName || null;
  return {
    procedureType: (doc?.procedure_type_name || doc?.procedureType || 'ไม่ระบุ').trim() || 'ไม่ระบุ',
    category: (doc?.category_name || doc?.category || 'ไม่ระบุ').trim() || 'ไม่ระบุ',
    name: doc?.name || courseName || '-',
  };
}

/** Build course master lookup map — keyed by id AND by NAME:name for fallback. */
function buildCourseIndex(courses) {
  const idx = new Map();
  if (!Array.isArray(courses)) return idx;
  for (const c of courses) {
    const id = String(c?.id || c?.proClinicId || '');
    if (id) idx.set(id, c);
    const name = (c?.name || '').trim();
    if (name) idx.set(`NAME:${name}`, c);
  }
  return idx;
}

/** Line-total for a course item — prefer lineTotal, fall back to qty*unitPrice. */
function lineTotalOf(item) {
  const lt = Number(item?.lineTotal);
  if (Number.isFinite(lt) && lt > 0) return lt;
  const qty = Number(item?.qty) || 0;
  const unit = Number(item?.unitPrice || item?.price) || 0;
  return qty * unit;
}

/* ─── Flatten sales → per-line rows ──────────────────────────────────────── */

/**
 * Flatten every course item from every sale into row candidates with
 * proportional deposit/wallet/refund attribution.
 *
 * @param {Array} sales
 * @param {Map} courseIndex
 * @returns {Array<{saleId, saleDate, procedureType, category, courseId, courseName, promotionName, qty, lineTotal, depositShare, walletShare, refundShare, paidShare}>}
 */
export function flattenRevenueLines(sales, courseIndex) {
  const out = [];
  const list = Array.isArray(sales) ? sales : [];
  for (const s of list) {
    if (!s || s.status === 'cancelled') continue; // AR3
    const items = Array.isArray(s?.items?.courses) ? s.items.courses : [];
    if (items.length === 0) continue;

    // Total of ALL course-line totals in this sale — needed for proportional split
    const lineTotals = items.map(lineTotalOf);
    const depositApplied = roundTHB(Number(s?.billing?.depositApplied) || 0);
    const walletApplied = roundTHB(Number(s?.billing?.walletApplied) || 0);
    const refundAmount = roundTHB(Number(s?.billing?.refundAmount || s?.refundAmount) || 0);

    const depositShares = proportional(lineTotals, depositApplied);
    const walletShares = proportional(lineTotals, walletApplied);
    const refundShares = proportional(lineTotals, refundAmount);

    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const master = resolveCourseMaster(item.id || item.courseId, item.name, courseIndex);
      const lineTotal = roundTHB(lineTotals[i]);
      const depositShare = roundTHB(depositShares[i]);
      const walletShare = roundTHB(walletShares[i]);
      const refundShare = roundTHB(refundShares[i]);
      const paidShare = roundTHB(lineTotal - depositShare - walletShare - refundShare);
      out.push({
        saleId: s.saleId || s.id || '',
        saleDate: s.saleDate || '',
        procedureType: master.procedureType,
        category: master.category,
        courseId: String(item.id || item.courseId || ''),
        courseName: master.name,
        promotionName: (item.promotionName || item.promotion_name || '').trim() || '-',
        qty: Number(item.qty) || 0,
        lineTotal,
        depositShare,
        walletShare,
        refundShare,
        paidShare,
      });
    }
  }
  return out;
}

/* ─── Main aggregator ────────────────────────────────────────────────────── */

/**
 * Aggregate revenue by (procedure_type, category, course, promotion).
 *
 * @param {Array} sales
 * @param {Array} courses — master_data/courses/items (for procedure_type/category join)
 * @param {object} filters
 * @param {string} [filters.from]
 * @param {string} [filters.to]
 * @param {string} [filters.procedureType='all']
 * @param {string} [filters.category='all']
 * @param {string} [filters.searchText]   — on course name or promotion
 *
 * @returns {{
 *   rows: Array,
 *   totals: { count, qty, lineTotal, depositApplied, walletApplied,
 *             refundAmount, paidAmount },
 *   meta: { totalLines, filteredLines, range,
 *           typeSummary: [{type, paidAmount, pct}],
 *           categorySummary: [{category, paidAmount, pct}] }
 * }}
 */
export function aggregateRevenueByProcedure(sales, courses, filters = {}) {
  const {
    from = '', to = '',
    procedureType = 'all', category = 'all',
    searchText = '',
  } = filters;

  const safeSales = Array.isArray(sales) ? sales : [];
  const inRange = (from || to) ? dateRangeFilter(safeSales, 'saleDate', from, to) : safeSales;
  const courseIndex = buildCourseIndex(courses);

  const lines = flattenRevenueLines(inRange, courseIndex);

  // Group by (procedureType, category, courseId-or-name, promotionName)
  const groups = new Map();
  for (const ln of lines) {
    const key = `${ln.procedureType}|${ln.category}|${ln.courseId || ln.courseName}|${ln.promotionName}`;
    const cur = groups.get(key) || {
      procedureType: ln.procedureType,
      category: ln.category,
      courseId: ln.courseId,
      courseName: ln.courseName,
      promotionName: ln.promotionName,
      qty: 0,
      lineTotal: 0,
      depositApplied: 0,
      walletApplied: 0,
      refundAmount: 0,
      paidAmount: 0,
    };
    cur.qty += ln.qty;
    cur.lineTotal += ln.lineTotal;
    cur.depositApplied += ln.depositShare;
    cur.walletApplied += ln.walletShare;
    cur.refundAmount += ln.refundShare;
    cur.paidAmount += ln.paidShare;
    groups.set(key, cur);
  }

  // To array + round each field (AR4 boundary)
  let rows = [...groups.values()].map(g => ({
    ...g,
    qty: Math.round(g.qty * 100) / 100, // qty may be fractional (e.g. 2.5 courses)
    lineTotal: roundTHB(g.lineTotal),
    depositApplied: roundTHB(g.depositApplied),
    walletApplied: roundTHB(g.walletApplied),
    refundAmount: roundTHB(g.refundAmount),
    paidAmount: roundTHB(g.paidAmount),
  }));

  // Filters
  if (procedureType !== 'all') {
    rows = rows.filter(r => r.procedureType === procedureType);
  }
  if (category !== 'all') {
    rows = rows.filter(r => r.category === category);
  }
  const q = (searchText || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter(r => {
      const hay = `${r.courseName} ${r.promotionName}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // Sort: paidAmount desc primary, lineTotal desc secondary
  rows = sortBy(rows, r => r.paidAmount, 'desc');

  // Totals
  let qtySum = 0, ltSum = 0, depSum = 0, walSum = 0, refSum = 0, paidSum = 0;
  for (const r of rows) {
    qtySum += r.qty;
    ltSum += r.lineTotal;
    depSum += r.depositApplied;
    walSum += r.walletApplied;
    refSum += r.refundAmount;
    paidSum += r.paidAmount;
  }

  // Pie-chart data (type / category share of paidAmount)
  const typeTotals = new Map();
  const categoryTotals = new Map();
  for (const r of rows) {
    typeTotals.set(r.procedureType, (typeTotals.get(r.procedureType) || 0) + r.paidAmount);
    categoryTotals.set(r.category, (categoryTotals.get(r.category) || 0) + r.paidAmount);
  }
  const roundedPaidSum = roundTHB(paidSum);
  const pct = (v) => roundedPaidSum > 0 ? roundTHB((v / roundedPaidSum) * 100) : 0;
  const typeSummary = [...typeTotals.entries()]
    .map(([type, amount]) => ({ type, paidAmount: roundTHB(amount), pct: pct(amount) }))
    .sort((a, b) => b.paidAmount - a.paidAmount);
  const categorySummary = [...categoryTotals.entries()]
    .map(([cat, amount]) => ({ category: cat, paidAmount: roundTHB(amount), pct: pct(amount) }))
    .sort((a, b) => b.paidAmount - a.paidAmount);

  return {
    rows,
    totals: {
      count: rows.length,
      qty: Math.round(qtySum * 100) / 100,
      lineTotal: roundTHB(ltSum),
      depositApplied: roundTHB(depSum),
      walletApplied: roundTHB(walSum),
      refundAmount: roundTHB(refSum),
      paidAmount: roundedPaidSum,
    },
    meta: {
      totalLines: lines.length,
      filteredLines: rows.length,
      range: { from, to },
      typeSummary,
      categorySummary,
    },
  };
}

/* ─── Column spec (10 cols matching ProClinic intel) ─────────────────────── */

export function buildRevenueColumns({ fmtMoney = (v) => v } = {}) {
  return [
    { key: 'procedureType',  label: 'ประเภทหัตถการคอร์ส' },
    { key: 'category',       label: 'หมวดหมู่คอร์ส' },
    { key: 'courseName',     label: 'คอร์ส' },
    { key: 'promotionName',  label: 'โปรโมชัน' },
    { key: 'qty',            label: 'จำนวน' },
    { key: 'lineTotal',      label: 'ยอดรวม',      format: (v) => fmtMoney(v) },
    { key: 'depositApplied', label: 'หักมัดจำ',    format: (v) => fmtMoney(v) },
    { key: 'walletApplied',  label: 'หัก Wallet',   format: (v) => fmtMoney(v) },
    { key: 'refundAmount',   label: 'คืนเงิน',     format: (v) => fmtMoney(v) },
    { key: 'paidAmount',     label: 'ยอดชำระเงิน', format: (v) => fmtMoney(v) },
  ];
}
