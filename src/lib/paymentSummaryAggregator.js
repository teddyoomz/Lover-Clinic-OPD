// ─── Payment Summary Aggregator — Phase 12.8 pure, deterministic ──────────
// Groups be_sales payment channels by method. Cancelled sales EXCLUDED.
// Handles both modern shape (sale.payment.channels[]) and legacy denorm
// (sale.paymentMethod + sale.paidAmount).

import { roundTHB, dateRangeFilter } from './reportsUtils.js';

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

function canonicalMethod(raw) {
  if (!raw) return 'อื่นๆ';
  const s = String(raw).trim();
  if (!s) return 'อื่นๆ';
  // Direct hit.
  if (KNOWN_METHODS.includes(s)) return s;
  // Normalize case-insensitive match.
  const lower = s.toLowerCase();
  for (const km of KNOWN_METHODS) {
    if (km.toLowerCase() === lower) return km;
  }
  // Common aliases.
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
      method: canonicalMethod(c?.method || c?.paymentMethod),
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

/**
 * Aggregate payment channels across all be_sales in range.
 *
 * @returns {{
 *   rows: [{ method, amount, saleCount, percentage }],
 *   totals: { amount, saleCount },
 *   meta: { totalSales, cancelledExcluded, range }
 * }}
 */
export function aggregatePaymentSummary(sales, filters = {}) {
  const { from = '', to = '', branchId = '' } = filters;
  let inRange = Array.isArray(sales) ? sales : [];
  inRange = dateRangeFilter(inRange, 'saleDate', from, to);
  if (branchId) inRange = inRange.filter(s => s?.branchId === branchId);
  const active = inRange.filter(s => s?.status !== 'cancelled');

  const byMethod = new Map();
  const saleHadMethod = new Map();  // Set<saleId> per method so saleCount is unique-per-sale
  for (const s of active) {
    const channels = channelsOf(s);
    const sid = s?.saleId || s?.id || '';
    for (const c of channels) {
      if (!byMethod.has(c.method)) {
        byMethod.set(c.method, 0);
        saleHadMethod.set(c.method, new Set());
      }
      byMethod.set(c.method, byMethod.get(c.method) + c.amount);
      if (sid) saleHadMethod.get(c.method).add(sid);
    }
  }

  const totalAmount = Array.from(byMethod.values()).reduce((a, b) => a + b, 0);
  const rows = Array.from(byMethod.entries()).map(([method, amount]) => ({
    method,
    amount: roundTHB(amount),
    saleCount: saleHadMethod.get(method)?.size || 0,
    percentage: totalAmount > 0 ? Math.round((amount / totalAmount) * 10000) / 100 : 0,
  }));

  // Sort by amount desc; stable tiebreak on method name.
  rows.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.method.localeCompare(b.method, 'th');
  });

  return {
    rows,
    totals: {
      amount: roundTHB(totalAmount),
      saleCount: active.length,
    },
    meta: {
      totalSales: inRange.length,
      cancelledExcluded: inRange.length - active.length,
      range: { from, to },
    },
  };
}

export function getPaymentSummaryColumns(fmtMoney = (v) => String(v)) {
  return [
    { key: 'method',     label: 'วิธีชำระ',      format: (v) => v },
    { key: 'amount',     label: 'ยอดรวม',       format: fmtMoney, align: 'right', bold: true },
    { key: 'saleCount',  label: 'ใบเสร็จ',      format: (v) => String(v || 0), align: 'right' },
    { key: 'percentage', label: '%',             format: (v) => `${Number(v).toFixed(2)}%`, align: 'right' },
  ];
}
