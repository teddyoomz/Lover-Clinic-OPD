// ─── P&L Report Aggregator — Phase 12.8 pure, deterministic ────────────────
// Combines be_sales (revenue side) with be_expenses (expense side) to produce
// a per-period Profit & Loss table. Period granularity is caller-controlled
// — 'month' (default) groups by YYYY-MM; 'day' groups by YYYY-MM-DD.
//
// Iron-clad:
//   - AR1 date range (inclusive both ends)
//   - AR3 cancelled sales EXCLUDED from revenue totals
//   - AR4 every currency via roundTHB
//   - AR5 reconcile: sum(rows.netProfit) === totals.netProfit
//   - AR11 column spec shared between UI + CSV

import { roundTHB, dateRangeFilter } from './reportsUtils.js';

export const PERIOD_OPTIONS = Object.freeze(['day', 'month', 'year']);

function periodKey(dateStr, period) {
  const s = String(dateStr || '');
  if (!s) return '';
  if (period === 'day') return s.slice(0, 10);
  if (period === 'year') return s.slice(0, 4);
  return s.slice(0, 7);  // month (default) = YYYY-MM
}

function saleRevenueOf(sale) {
  const billing = sale?.billing || {};
  return Number(billing.netTotal) || 0;
}

/**
 * Aggregate P&L rows per period.
 *
 * @param {object} args
 * @param {Array} args.sales    — be_sales docs
 * @param {Array} args.expenses — be_expenses docs
 * @param {object} [args.filters]
 * @param {string} [args.filters.from]   — YYYY-MM-DD inclusive
 * @param {string} [args.filters.to]     — YYYY-MM-DD inclusive
 * @param {string} [args.filters.period] — 'day' | 'month' (default) | 'year'
 * @param {string} [args.filters.branchId] — optional filter
 *
 * @returns {{ rows, totals, meta }}
 *   rows: [{ period, revenue, expense, netProfit, saleCount, expenseCount }]
 *   totals: { revenue, expense, netProfit, saleCount, expenseCount }
 */
export function aggregatePnLReport({ sales = [], expenses = [], filters = {} } = {}) {
  const { from = '', to = '', period = 'month', branchId = '' } = filters;
  const resolvedPeriod = PERIOD_OPTIONS.includes(period) ? period : 'month';

  // 1. Filter sales by date + branch + exclude cancelled from totals
  let salesInRange = Array.isArray(sales) ? sales : [];
  salesInRange = dateRangeFilter(salesInRange, 'saleDate', from, to);
  if (branchId) salesInRange = salesInRange.filter(s => s?.branchId === branchId);
  const activeSales = salesInRange.filter(s => s?.status !== 'cancelled');

  // 2. Filter expenses by date + branch + exclude voided
  let expensesInRange = Array.isArray(expenses) ? expenses : [];
  expensesInRange = dateRangeFilter(expensesInRange, 'date', from, to);
  if (branchId) expensesInRange = expensesInRange.filter(e => e?.branchId === branchId);
  const activeExpenses = expensesInRange.filter(e => e?.status !== 'void');

  // 3. Group by period
  const byPeriod = new Map();
  const ensure = (key) => {
    if (!byPeriod.has(key)) byPeriod.set(key, {
      period: key, revenue: 0, expense: 0, netProfit: 0,
      saleCount: 0, expenseCount: 0,
    });
    return byPeriod.get(key);
  };

  for (const s of activeSales) {
    const key = periodKey(s.saleDate || '', resolvedPeriod);
    if (!key) continue;
    const row = ensure(key);
    row.revenue += saleRevenueOf(s);
    row.saleCount += 1;
  }

  for (const e of activeExpenses) {
    const key = periodKey(e.date || '', resolvedPeriod);
    if (!key) continue;
    const row = ensure(key);
    row.expense += Number(e.amount) || 0;
    row.expenseCount += 1;
  }

  // 4. Finalize + sort chronologically (asc by period)
  const rows = Array.from(byPeriod.values()).map(r => ({
    period: r.period,
    revenue: roundTHB(r.revenue),
    expense: roundTHB(r.expense),
    netProfit: roundTHB(r.revenue - r.expense),
    saleCount: r.saleCount,
    expenseCount: r.expenseCount,
  }));
  rows.sort((a, b) => a.period.localeCompare(b.period));

  // 5. Totals
  let revenueSum = 0, expenseSum = 0, saleCountSum = 0, expenseCountSum = 0;
  for (const r of rows) {
    revenueSum += r.revenue;
    expenseSum += r.expense;
    saleCountSum += r.saleCount;
    expenseCountSum += r.expenseCount;
  }

  return {
    rows,
    totals: {
      revenue: roundTHB(revenueSum),
      expense: roundTHB(expenseSum),
      netProfit: roundTHB(revenueSum - expenseSum),
      saleCount: saleCountSum,
      expenseCount: expenseCountSum,
    },
    meta: {
      totalSales: salesInRange.length,
      totalExpenses: expensesInRange.length,
      cancelledSalesExcluded: salesInRange.length - activeSales.length,
      voidExpensesExcluded: expensesInRange.length - activeExpenses.length,
      range: { from, to },
      period: resolvedPeriod,
    },
  };
}

export function getPnLColumns(fmtMoney = (v) => String(v)) {
  return [
    { key: 'period',       label: 'งวด',          format: (v) => v },
    { key: 'revenue',      label: 'รายรับ',        format: fmtMoney, align: 'right' },
    { key: 'expense',      label: 'รายจ่าย',       format: fmtMoney, align: 'right' },
    { key: 'netProfit',    label: 'กำไรสุทธิ',    format: fmtMoney, align: 'right', bold: true },
    { key: 'saleCount',    label: 'ใบเสร็จ',      format: (v) => String(v || 0), align: 'right' },
    { key: 'expenseCount', label: 'รายการจ่าย',    format: (v) => String(v || 0), align: 'right' },
  ];
}
