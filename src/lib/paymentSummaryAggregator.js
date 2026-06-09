// ─── Payment Summary Aggregator — "เงินที่บัญชีได้รับจริง" ─────────────────
// Phase 12.8 + 2026-06-09 (deposit-in-reports).
//
// Groups be_sales payment channels by canonical method AND folds in deposits
// RECEIVED in the same range (by paymentChannel). Per channel:
//   ยอดขาย (salesAmount) = Σ sale.payment.channels[].amount for that method
//   มัดจำ  (depositAmount) = Σ deposit.amount where paymentChannel == method
//                            (status != cancelled, paymentDate in range)
//   ยอดรวม (total) = salesAmount + depositAmount
//
// NO DOUBLE-COUNT: in SaleTab, a deposit is deducted BEFORE the payment channels
// are built (afterDeposit → netTotal → channels cover only netTotal), so
// sale.payment.channels NEVER contains the deposit portion. The deposit's cash
// was received once (at paymentDate) and is counted once here.
//
// Cancelled sales EXCLUDED. Cancelled deposits EXCLUDED. Refunds shown SEPARATELY
// (refundsTotal) — NOT subtracted (Q1=A gross received). Firestore-only (Rule E).

import { roundTHB, dateRangeFilter } from './reportsUtils.js';
import { depositsReceivedInRange } from './depositReportUtils.js';

/** Canonical payment method labels (Thai). Unknown methods land under
 *  'อื่นๆ' so the report is still complete. */
export const KNOWN_METHODS = Object.freeze([
  'เงินสด',
  'โอน',
  'เครดิตการ์ด',
  'เดบิตการ์ด',
  'QR',
  'มัดจำ',
  'Wallet',
  'Voucher',
  'Coupon',
  'อื่นๆ',
]);

export function canonicalMethod(raw) {
  if (!raw) return 'อื่นๆ';
  const s = String(raw).trim();
  if (!s) return 'อื่นๆ';
  if (KNOWN_METHODS.includes(s)) return s;
  const lower = s.toLowerCase();
  for (const km of KNOWN_METHODS) {
    if (km.toLowerCase() === lower) return km;
  }
  if (/cash|เงินสด/i.test(s)) return 'เงินสด';
  if (/transfer|โอน|bank/i.test(s)) return 'โอน';
  if (/credit/i.test(s)) return 'เครดิตการ์ด';
  if (/debit/i.test(s)) return 'เดบิตการ์ด';
  if (/qr/i.test(s)) return 'QR';
  if (/deposit|มัดจำ/i.test(s)) return 'มัดจำ';
  if (/wallet|กระเป๋า/i.test(s)) return 'Wallet';
  if (/voucher/i.test(s)) return 'Voucher';
  if (/coupon/i.test(s)) return 'Coupon';
  return 'อื่นๆ';
}

/** Extract payment channels from a sale. Returns array of {method, amount}. */
function channelsOf(sale) {
  const channels = sale?.payment?.channels;
  if (Array.isArray(channels) && channels.length > 0) {
    return channels.map(c => ({
      method: canonicalMethod(c?.method || c?.paymentMethod || c?.name),
      amount: Number(c?.amount) || 0,
    })).filter(c => c.amount > 0);
  }
  // Legacy denorm shape: flat paymentMethod + paidAmount.
  if (sale?.paymentMethod) {
    return [{
      method: canonicalMethod(sale.paymentMethod),
      amount: Number(sale.paidAmount) || 0,
    }].filter(c => c.amount > 0);
  }
  return [];
}

/** Σ refundAmount of deposits whose refundDate (date part) falls in [from,to]. */
export function refundsInPeriod(deposits, from = '', to = '') {
  let total = 0;
  for (const d of (Array.isArray(deposits) ? deposits : [])) {
    const amt = Number(d?.refundAmount) || 0;
    if (amt <= 0) continue;
    const rd = String(d?.refundDate || '').slice(0, 10);
    if (!rd) continue;
    if (from && rd < from) continue;
    if (to && rd > to) continue;
    total += amt;
  }
  return roundTHB(total);
}

/**
 * Aggregate sale channels + deposits-received across the range, per channel.
 *
 * @param {Array} sales — be_sales docs
 * @param {Array} deposits — be_deposits docs (received-in-range filter applied here)
 * @param {{from?:string,to?:string,branchId?:string}} [filters]
 * @returns {{
 *   rows: [{ method, salesAmount, depositAmount, total, docCount, percentage }],
 *   totals: { salesAmount, depositAmount, total, docCount, saleCount },
 *   refundsTotal: number,
 *   meta: { totalSales, cancelledExcluded, depositsReceived, range }
 * }}
 */
export function aggregatePaymentSummary(sales, deposits = [], filters = {}) {
  const { from = '', to = '', branchId = '' } = filters;

  // ─── Sales side ───────────────────────────────────────────────────────
  let inRange = Array.isArray(sales) ? sales : [];
  inRange = dateRangeFilter(inRange, 'saleDate', from, to);
  if (branchId) inRange = inRange.filter(s => s?.branchId === branchId);
  const activeSales = inRange.filter(s => s?.status !== 'cancelled');

  const salesByMethod = new Map();           // method → amount
  const saleIdsByMethod = new Map();         // method → Set<saleId> (unique-per-sale docCount)
  for (const s of activeSales) {
    const sid = s?.saleId || s?.id || '';
    for (const c of channelsOf(s)) {
      salesByMethod.set(c.method, (salesByMethod.get(c.method) || 0) + c.amount);
      if (!saleIdsByMethod.has(c.method)) saleIdsByMethod.set(c.method, new Set());
      if (sid) saleIdsByMethod.get(c.method).add(sid);
    }
  }

  // ─── Deposit side (received in range, by paymentChannel) ──────────────
  let recv = depositsReceivedInRange(deposits, { from, to });
  if (branchId) recv = recv.filter(d => d?.branchId === branchId);
  const depByMethod = new Map();             // method → amount
  const depCountByMethod = new Map();        // method → count
  for (const d of recv) {
    const m = canonicalMethod(d?.paymentChannel);
    depByMethod.set(m, (depByMethod.get(m) || 0) + (Number(d?.amount) || 0));
    depCountByMethod.set(m, (depCountByMethod.get(m) || 0) + 1);
  }

  // ─── Union rows ───────────────────────────────────────────────────────
  const methods = new Set([...salesByMethod.keys(), ...depByMethod.keys()]);
  const rows = Array.from(methods).map(method => {
    const salesAmount = roundTHB(salesByMethod.get(method) || 0);
    const depositAmount = roundTHB(depByMethod.get(method) || 0);
    const total = roundTHB(salesAmount + depositAmount);
    const docCount = (saleIdsByMethod.get(method)?.size || 0) + (depCountByMethod.get(method) || 0);
    return { method, salesAmount, depositAmount, total, docCount, percentage: 0 };
  });

  const salesTotal = roundTHB(rows.reduce((s, r) => s + r.salesAmount, 0));
  const depositTotal = roundTHB(rows.reduce((s, r) => s + r.depositAmount, 0));
  const grand = roundTHB(rows.reduce((s, r) => s + r.total, 0));
  for (const r of rows) {
    r.percentage = grand > 0 ? Math.round((r.total / grand) * 10000) / 100 : 0;
  }
  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.method.localeCompare(b.method, 'th');
  });

  const docCountTotal = rows.reduce((s, r) => s + r.docCount, 0);

  return {
    rows,
    totals: {
      salesAmount: salesTotal,
      depositAmount: depositTotal,
      total: grand,
      docCount: docCountTotal,
      saleCount: activeSales.length,
    },
    refundsTotal: refundsInPeriod(deposits, from, to),
    meta: {
      totalSales: inRange.length,
      cancelledExcluded: inRange.length - activeSales.length,
      depositsReceived: recv.length,
      range: { from, to },
    },
  };
}

/**
 * Drill-down: the documents that make up one channel's row, sales + deposits,
 * date-sorted (desc). Pure — recomputed on click (aggregate output stays lean).
 *
 * @returns {Array<{ type:'sale'|'deposit', id, date, hn, name, amount, doc }>}
 */
export function getMethodDocuments(sales, deposits, method, { from = '', to = '', branchId = '' } = {}) {
  const out = [];
  const target = canonicalMethod(method);

  let inRange = dateRangeFilter(Array.isArray(sales) ? sales : [], 'saleDate', from, to);
  if (branchId) inRange = inRange.filter(s => s?.branchId === branchId);
  for (const s of inRange.filter(s => s?.status !== 'cancelled')) {
    const amount = channelsOf(s)
      .filter(c => c.method === target)
      .reduce((a, c) => a + c.amount, 0);
    if (amount <= 0) continue;
    out.push({
      type: 'sale',
      id: s?.saleId || s?.id || '',
      date: s?.saleDate || '',
      hn: s?.customerHN || '',
      name: s?.customerName || s?.customerNameTemp || '',
      amount: roundTHB(amount),
      doc: s,
    });
  }

  let recv = depositsReceivedInRange(deposits, { from, to });
  if (branchId) recv = recv.filter(d => d?.branchId === branchId);
  for (const d of recv) {
    if (canonicalMethod(d?.paymentChannel) !== target) continue;
    out.push({
      type: 'deposit',
      id: d?.depositId || d?.id || '',
      date: d?.paymentDate || '',
      hn: d?.customerHN || '',
      name: d?.customerName || d?.customerNameTemp || '',
      amount: roundTHB(Number(d?.amount) || 0),
      doc: d,
    });
  }

  out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return out;
}

/** CSV/table columns. fmtMoney optional for CSV formatting. */
export function getPaymentSummaryColumns(fmtMoney = (v) => String(v)) {
  return [
    { key: 'method',        label: 'วิธีชำระ',  format: (v) => v },
    { key: 'salesAmount',   label: 'ยอดขาย',    format: fmtMoney, align: 'right', bold: true },
    { key: 'depositAmount', label: 'มัดจำ',     format: fmtMoney, align: 'right' },
    { key: 'total',         label: 'ยอดรวม',    format: fmtMoney, align: 'right', bold: true },
    { key: 'docCount',      label: 'ใบเสร็จ',   format: (v) => String(v || 0), align: 'right' },
    { key: 'percentage',    label: '%',          format: (v) => `${Number(v).toFixed(2)}%`, align: 'right' },
  ];
}
