// ─── Phase 12.8 · P&L Report aggregator tests ────────────────────────────
import { describe, it, expect } from 'vitest';
import { aggregatePnLReport, PERIOD_OPTIONS, getPnLColumns } from '../src/lib/pnlReportAggregator.js';

const makeSale = (saleDate, net, status = 'completed') => ({
  saleId: `S-${saleDate}-${net}`, saleDate, status, billing: { netTotal: net },
});
const makeExp = (date, amount, status = 'active') => ({
  expenseId: `E-${date}-${amount}`, date, amount, status,
});

describe('aggregatePnLReport — basics', () => {
  it('PL1: empty inputs → empty rows', () => {
    const r = aggregatePnLReport({ sales: [], expenses: [] });
    expect(r.rows).toEqual([]);
    expect(r.totals.revenue).toBe(0);
    expect(r.totals.expense).toBe(0);
    expect(r.totals.netProfit).toBe(0);
  });

  it('PL2: single sale yields single row + revenue', () => {
    const r = aggregatePnLReport({ sales: [makeSale('2026-04-15', 1000)], expenses: [] });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].period).toBe('2026-04');
    expect(r.rows[0].revenue).toBe(1000);
    expect(r.rows[0].netProfit).toBe(1000);
  });

  it('PL3: single expense yields single row + negative profit', () => {
    const r = aggregatePnLReport({ sales: [], expenses: [makeExp('2026-04-15', 500)] });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].expense).toBe(500);
    expect(r.rows[0].netProfit).toBe(-500);
  });

  it('PL4: revenue - expense = netProfit in same period', () => {
    const r = aggregatePnLReport({
      sales: [makeSale('2026-04-10', 3000), makeSale('2026-04-20', 2000)],
      expenses: [makeExp('2026-04-15', 1500)],
    });
    expect(r.rows[0].revenue).toBe(5000);
    expect(r.rows[0].expense).toBe(1500);
    expect(r.rows[0].netProfit).toBe(3500);
  });

  it('PL5: different months → separate rows sorted asc', () => {
    const r = aggregatePnLReport({
      sales: [makeSale('2026-03-15', 1000), makeSale('2026-05-20', 2000)],
      expenses: [makeExp('2026-04-10', 500)],
    });
    expect(r.rows.map(x => x.period)).toEqual(['2026-03', '2026-04', '2026-05']);
  });
});

describe('aggregatePnLReport — cancelled / void exclusions', () => {
  it('PL6: cancelled sales excluded from revenue', () => {
    const r = aggregatePnLReport({
      sales: [makeSale('2026-04-10', 1000), makeSale('2026-04-15', 500, 'cancelled')],
      expenses: [],
    });
    expect(r.totals.revenue).toBe(1000);
    expect(r.totals.saleCount).toBe(1);
    expect(r.meta.cancelledSalesExcluded).toBe(1);
  });

  it('PL7: voided expenses excluded', () => {
    const r = aggregatePnLReport({
      sales: [],
      expenses: [makeExp('2026-04-10', 500), makeExp('2026-04-15', 300, 'void')],
    });
    expect(r.totals.expense).toBe(500);
    expect(r.totals.expenseCount).toBe(1);
    expect(r.meta.voidExpensesExcluded).toBe(1);
  });
});

describe('aggregatePnLReport — date filter + period granularity', () => {
  it('PL8: from/to inclusive', () => {
    const r = aggregatePnLReport({
      sales: [makeSale('2026-03-31', 100), makeSale('2026-04-01', 200), makeSale('2026-04-30', 300)],
      expenses: [],
      filters: { from: '2026-04-01', to: '2026-04-30' },
    });
    expect(r.totals.revenue).toBe(500);
  });

  it('PL9: period=day groups by YYYY-MM-DD', () => {
    const r = aggregatePnLReport({
      sales: [makeSale('2026-04-10', 100), makeSale('2026-04-10', 200), makeSale('2026-04-11', 300)],
      expenses: [],
      filters: { period: 'day' },
    });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].period).toBe('2026-04-10');
    expect(r.rows[0].revenue).toBe(300);
  });

  it('PL10: period=year groups by YYYY', () => {
    const r = aggregatePnLReport({
      sales: [makeSale('2025-06-01', 1000), makeSale('2026-04-01', 2000)],
      expenses: [],
      filters: { period: 'year' },
    });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].period).toBe('2025');
    expect(r.rows[1].period).toBe('2026');
  });

  it('PL11: unknown period falls back to month', () => {
    const r = aggregatePnLReport({
      sales: [makeSale('2026-04-10', 100)],
      filters: { period: 'weird' },
    });
    expect(r.rows[0].period).toBe('2026-04');
  });

  it('PL12: PERIOD_OPTIONS exported + frozen', () => {
    expect(PERIOD_OPTIONS).toEqual(['day', 'month', 'year']);
    expect(() => PERIOD_OPTIONS.push('century')).toThrow();
  });
});

describe('aggregatePnLReport — branch filter + reconcile', () => {
  it('PL13: branchId filters sales + expenses both', () => {
    const r = aggregatePnLReport({
      sales: [{ ...makeSale('2026-04-10', 1000), branchId: 'BR-1' }, { ...makeSale('2026-04-11', 500), branchId: 'BR-2' }],
      expenses: [{ ...makeExp('2026-04-10', 100), branchId: 'BR-1' }, { ...makeExp('2026-04-11', 50), branchId: 'BR-2' }],
      filters: { branchId: 'BR-1' },
    });
    expect(r.totals.revenue).toBe(1000);
    expect(r.totals.expense).toBe(100);
  });

  it('PL14: rows reconcile to totals (AR5)', () => {
    const r = aggregatePnLReport({
      sales: [makeSale('2026-03-15', 1000), makeSale('2026-04-20', 2000)],
      expenses: [makeExp('2026-04-15', 500)],
    });
    const sumRevenue = r.rows.reduce((a, x) => a + x.revenue, 0);
    const sumExpense = r.rows.reduce((a, x) => a + x.expense, 0);
    const sumNet = r.rows.reduce((a, x) => a + x.netProfit, 0);
    expect(sumRevenue).toBe(r.totals.revenue);
    expect(sumExpense).toBe(r.totals.expense);
    expect(sumNet).toBe(r.totals.netProfit);
  });
});

describe('getPnLColumns', () => {
  it('PC1: has all 6 columns', () => {
    const cols = getPnLColumns();
    expect(cols.map(c => c.key)).toEqual(['period', 'revenue', 'expense', 'netProfit', 'saleCount', 'expenseCount']);
  });
  it('PC2: uses fmtMoney for revenue/expense/netProfit', () => {
    const cols = getPnLColumns((v) => `฿${v}`);
    expect(cols.find(c => c.key === 'revenue').format(100)).toBe('฿100');
  });
});
