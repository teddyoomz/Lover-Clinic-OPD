// ─── Daily Revenue Aggregator (Phase 10.X1) — pure, deterministic ────────
//
// Closes ReportsHome card "รายรับประจำวัน" (not scheduled in Phase 11-16).
// Groups be_sales by saleDate (YYYY-MM-DD) → per-day revenue + count +
// payment split (paid/split/unpaid) for quick daily-briefing dashboard.
//
// Output: { rows, totals, meta } per AR5.
//
// Iron-clad:
//   - AR1 date range filter (saleDate)
//   - AR3 cancelled excluded from totals (included as separate count)
//   - AR4 every currency via roundTHB
//   - AR5 reconcile: sum(rows.netTotal) === totals.netTotal
//   - AR14 defensive access
//   - AR15 pure — no Date.now

import { roundTHB, dateRangeFilter, sortBy } from './reportsUtils.js';

/** Status key for payment breakdown. */
function paymentStatusKey(sale) {
  const s = (sale?.payment?.status || 'unpaid').trim();
  return s || 'unpaid';
}

/**
 * Aggregate be_sales by saleDate.
 *
 * @param {Array} sales
 * @param {object} filters
 * @param {string} [filters.from]
 * @param {string} [filters.to]
 * @returns {{
 *   rows: Array<{
 *     date, saleCount, cancelledCount,
 *     netTotal, paidAmount, outstandingAmount,
 *     depositApplied, walletApplied, refundAmount,
 *     paidCount, splitCount, unpaidCount,
 *   }>,
 *   totals: {...},
 *   meta: { totalDays, filteredDays, range, busiestDay, topRevenueDay }
 * }}
 */
export function aggregateDailyRevenue(sales, filters = {}) {
  const { from = '', to = '' } = filters;

  const safeSales = Array.isArray(sales) ? sales : [];
  const inRange = (from || to) ? dateRangeFilter(safeSales, 'saleDate', from, to) : safeSales;

  const byDate = new Map();
  for (const s of inRange) {
    if (!s?.saleDate) continue;
    const date = s.saleDate;
    const cur = byDate.get(date) || {
      date,
      saleCount: 0, cancelledCount: 0,
      netTotal: 0, paidAmount: 0, outstandingAmount: 0,
      depositApplied: 0, walletApplied: 0, refundAmount: 0,
      paidCount: 0, splitCount: 0, unpaidCount: 0,
    };
    const isCancelled = s.status === 'cancelled';
    if (isCancelled) {
      cur.cancelledCount += 1;
      byDate.set(date, cur);
      continue; // AR3: do not add cancelled to money totals
    }
    cur.saleCount += 1;
    const net = Number(s?.billing?.netTotal) || 0;
    cur.netTotal += net;
    cur.depositApplied += Number(s?.billing?.depositApplied) || 0;
    cur.walletApplied += Number(s?.billing?.walletApplied) || 0;
    cur.refundAmount += Number(s?.billing?.refundAmount || s?.refundAmount) || 0;

    // Paid amount = sum of channel amounts
    const channels = Array.isArray(s?.payment?.channels) ? s.payment.channels : [];
    const paid = channels.reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
    cur.paidAmount += paid;
    const outstanding = Math.max(0, net - paid);
    cur.outstandingAmount += outstanding;

    const pk = paymentStatusKey(s);
    if (pk === 'paid') cur.paidCount += 1;
    else if (pk === 'split') cur.splitCount += 1;
    else cur.unpaidCount += 1;

    byDate.set(date, cur);
  }

  // Round at the boundary (AR4)
  let rows = [...byDate.values()].map(r => ({
    ...r,
    netTotal: roundTHB(r.netTotal),
    paidAmount: roundTHB(r.paidAmount),
    outstandingAmount: roundTHB(r.outstandingAmount),
    depositApplied: roundTHB(r.depositApplied),
    walletApplied: roundTHB(r.walletApplied),
    refundAmount: roundTHB(r.refundAmount),
  }));

  // Sort by date desc (newest first — matches ProClinic convention)
  rows = sortBy(rows, r => r.date, 'desc');

  // Totals
  let netTotalSum = 0, paidSum = 0, outstandingSum = 0,
      depositSum = 0, walletSum = 0, refundSum = 0,
      saleCountSum = 0, cancelledSum = 0,
      paidCountSum = 0, splitCountSum = 0, unpaidCountSum = 0;
  for (const r of rows) {
    netTotalSum += r.netTotal;
    paidSum += r.paidAmount;
    outstandingSum += r.outstandingAmount;
    depositSum += r.depositApplied;
    walletSum += r.walletApplied;
    refundSum += r.refundAmount;
    saleCountSum += r.saleCount;
    cancelledSum += r.cancelledCount;
    paidCountSum += r.paidCount;
    splitCountSum += r.splitCount;
    unpaidCountSum += r.unpaidCount;
  }

  // Meta insights
  const busiestDay = rows.length > 0
    ? [...rows].sort((a, b) => b.saleCount - a.saleCount)[0]
    : null;
  const topRevenueDay = rows.length > 0
    ? [...rows].sort((a, b) => b.netTotal - a.netTotal)[0]
    : null;

  return {
    rows,
    totals: {
      days: rows.length,
      saleCount: saleCountSum,
      cancelledCount: cancelledSum,
      netTotal: roundTHB(netTotalSum),
      paidAmount: roundTHB(paidSum),
      outstandingAmount: roundTHB(outstandingSum),
      depositApplied: roundTHB(depositSum),
      walletApplied: roundTHB(walletSum),
      refundAmount: roundTHB(refundSum),
      paidCount: paidCountSum,
      splitCount: splitCountSum,
      unpaidCount: unpaidCountSum,
      avgPerDay: rows.length > 0 ? roundTHB(netTotalSum / rows.length) : 0,
    },
    meta: {
      totalDays: rows.length,
      filteredDays: rows.length,
      range: { from, to },
      busiestDay: busiestDay ? { date: busiestDay.date, count: busiestDay.saleCount } : null,
      topRevenueDay: topRevenueDay ? { date: topRevenueDay.date, amount: topRevenueDay.netTotal } : null,
    },
  };
}

/* ─── Column spec (8 cols for CSV) ───────────────────────────────────────── */

export function buildDailyRevenueColumns({ fmtMoney = (v) => v, fmtDate = (v) => v } = {}) {
  return [
    { key: 'date',              label: 'วันที่',            format: (v) => fmtDate(v) },
    { key: 'saleCount',         label: 'จำนวนใบขาย' },
    { key: 'netTotal',          label: 'ยอดขายสุทธิ',       format: (v) => fmtMoney(v) },
    { key: 'paidAmount',        label: 'ยอดที่ชำระ',        format: (v) => fmtMoney(v) },
    { key: 'outstandingAmount', label: 'ยอดค้างชำระ',       format: (v) => fmtMoney(v) },
    { key: 'depositApplied',    label: 'หักมัดจำ',          format: (v) => fmtMoney(v) },
    { key: 'walletApplied',     label: 'หัก Wallet',        format: (v) => fmtMoney(v) },
    { key: 'cancelledCount',    label: 'ยกเลิก (จำนวนใบ)' },
  ];
}
