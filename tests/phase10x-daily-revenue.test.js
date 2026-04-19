// Phase 10.X1 — Daily Revenue Summary aggregator tests.

import { describe, it, expect } from 'vitest';
import {
  aggregateDailyRevenue,
  buildDailyRevenueColumns,
} from '../src/lib/dailyRevenueAggregator.js';
import { assertReconcile } from '../src/lib/reportsUtils.js';
import { buildCSV } from '../src/lib/csvExport.js';

function sale({ id, date = '2026-04-10', net = 1000, paid = null, dep = 0, wal = 0, ref = 0, status = 'active', paymentStatus = 'paid', channels = null }) {
  return {
    saleId: id, id, saleDate: date, status,
    billing: { netTotal: net, depositApplied: dep, walletApplied: wal, refundAmount: ref },
    payment: {
      status: paymentStatus,
      channels: channels !== null ? channels : [{ amount: paid ?? net }],
    },
  };
}

/* ─── Core aggregation ───────────────────────────────────────────────────── */

describe('aggregateDailyRevenue — core', () => {
  it('groups sales by saleDate', () => {
    const out = aggregateDailyRevenue([
      sale({ id: 'A', date: '2026-04-10' }),
      sale({ id: 'B', date: '2026-04-10' }),
      sale({ id: 'C', date: '2026-04-11' }),
    ]);
    expect(out.rows.length).toBe(2);
    const apr10 = out.rows.find(r => r.date === '2026-04-10');
    const apr11 = out.rows.find(r => r.date === '2026-04-11');
    expect(apr10.saleCount).toBe(2);
    expect(apr11.saleCount).toBe(1);
  });

  it('netTotal per day sums netTotal of all non-cancelled sales', () => {
    const out = aggregateDailyRevenue([
      sale({ id: 'A', date: '2026-04-10', net: 1000 }),
      sale({ id: 'B', date: '2026-04-10', net: 2500.5 }),
    ]);
    const r = out.rows[0];
    expect(r.netTotal).toBe(3500.5);
  });

  it('AR4: floating-point drift rounded to 2dp', () => {
    const out = aggregateDailyRevenue([
      sale({ id: 'A', date: '2026-04-10', net: 0.1 }),
      sale({ id: 'B', date: '2026-04-10', net: 0.2 }),
    ]);
    expect(out.rows[0].netTotal).toBe(0.3);
  });

  it('rows sorted by date desc', () => {
    const out = aggregateDailyRevenue([
      sale({ id: 'A', date: '2026-04-10' }),
      sale({ id: 'B', date: '2026-04-12' }),
      sale({ id: 'C', date: '2026-04-11' }),
    ]);
    expect(out.rows.map(r => r.date)).toEqual(['2026-04-12', '2026-04-11', '2026-04-10']);
  });
});

/* ─── AR3: cancelled exclusion ───────────────────────────────────────────── */

describe('AR3 — cancelled excluded from money, counted separately', () => {
  it('cancelled sale does NOT add to netTotal/paidAmount', () => {
    const out = aggregateDailyRevenue([
      sale({ id: 'A', date: '2026-04-10', net: 1000, status: 'active' }),
      sale({ id: 'B', date: '2026-04-10', net: 99999, status: 'cancelled' }),
    ]);
    const r = out.rows[0];
    expect(r.netTotal).toBe(1000);
    expect(r.saleCount).toBe(1);
    expect(r.cancelledCount).toBe(1);
  });

  it('day with ONLY cancelled sales shows count but zero money', () => {
    const out = aggregateDailyRevenue([
      sale({ id: 'X', date: '2026-04-10', net: 500, status: 'cancelled' }),
    ]);
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].netTotal).toBe(0);
    expect(out.rows[0].saleCount).toBe(0);
    expect(out.rows[0].cancelledCount).toBe(1);
  });
});

/* ─── Paid / Split / Unpaid counting ─────────────────────────────────────── */

describe('payment status bucketing', () => {
  it('paidCount / splitCount / unpaidCount segregate by payment.status', () => {
    const out = aggregateDailyRevenue([
      sale({ id: 'A', date: '2026-04-10', paymentStatus: 'paid' }),
      sale({ id: 'B', date: '2026-04-10', paymentStatus: 'split' }),
      sale({ id: 'C', date: '2026-04-10', paymentStatus: 'unpaid', channels: [] }),
      sale({ id: 'D', date: '2026-04-10', paymentStatus: 'paid' }),
    ]);
    const r = out.rows[0];
    expect(r.paidCount).toBe(2);
    expect(r.splitCount).toBe(1);
    expect(r.unpaidCount).toBe(1);
  });

  it('missing payment.status defaults to unpaid bucket', () => {
    const out = aggregateDailyRevenue([
      { saleId: 'A', saleDate: '2026-04-10', status: 'active', billing: { netTotal: 100 } },
    ]);
    expect(out.rows[0].unpaidCount).toBe(1);
  });
});

/* ─── paidAmount / outstanding math ──────────────────────────────────────── */

describe('paidAmount + outstandingAmount', () => {
  it('paidAmount = sum of channels[].amount', () => {
    const out = aggregateDailyRevenue([
      sale({ id: 'A', date: '2026-04-10', net: 1000, channels: [{ amount: 600 }, { amount: 300 }] }),
    ]);
    expect(out.rows[0].paidAmount).toBe(900);
    expect(out.rows[0].outstandingAmount).toBe(100);
  });

  it('outstanding clamps to 0 (overpayment does not become negative)', () => {
    const out = aggregateDailyRevenue([
      sale({ id: 'A', date: '2026-04-10', net: 1000, channels: [{ amount: 1200 }] }),
    ]);
    expect(out.rows[0].outstandingAmount).toBe(0);
  });

  it('zero channels → paidAmount=0 + outstanding=netTotal', () => {
    const out = aggregateDailyRevenue([
      sale({ id: 'A', date: '2026-04-10', net: 1000, channels: [] }),
    ]);
    expect(out.rows[0].paidAmount).toBe(0);
    expect(out.rows[0].outstandingAmount).toBe(1000);
  });
});

/* ─── Date range filter (AR1) ────────────────────────────────────────────── */

describe('AR1 — date range', () => {
  it('filters to [from, to] inclusive', () => {
    const sales = [
      sale({ id: 'A', date: '2026-03-30' }),
      sale({ id: 'B', date: '2026-04-01' }),
      sale({ id: 'C', date: '2026-04-15' }),
      sale({ id: 'D', date: '2026-04-30' }),
      sale({ id: 'E', date: '2026-05-01' }),
    ];
    const out = aggregateDailyRevenue(sales, { from: '2026-04-01', to: '2026-04-30' });
    expect(out.rows.map(r => r.date).sort()).toEqual(['2026-04-01', '2026-04-15', '2026-04-30']);
  });

  it('empty range (from > to) → empty', () => {
    const out = aggregateDailyRevenue([sale({ date: '2026-04-15' })], { from: '2026-04-30', to: '2026-04-01' });
    expect(out.rows).toEqual([]);
  });
});

/* ─── AR2 — empty/null safety ────────────────────────────────────────────── */

describe('AR2 — empty/null safety', () => {
  it('empty sales → empty rows + zero totals', () => {
    const out = aggregateDailyRevenue([]);
    expect(out.rows).toEqual([]);
    expect(out.totals.days).toBe(0);
    expect(out.totals.netTotal).toBe(0);
    expect(out.totals.avgPerDay).toBe(0);
  });

  it('null does not throw', () => {
    expect(() => aggregateDailyRevenue(null)).not.toThrow();
    expect(aggregateDailyRevenue(null).rows).toEqual([]);
  });

  it('sale without saleDate is skipped', () => {
    const out = aggregateDailyRevenue([{ saleId: 'X', saleDate: '', status: 'active', billing: { netTotal: 100 } }]);
    expect(out.rows).toEqual([]);
  });
});

/* ─── Totals + meta insights ─────────────────────────────────────────────── */

describe('totals reconciliation + meta', () => {
  it('totals reconcile via assertReconcile (netTotal + paidAmount + deposit + wallet)', () => {
    const sales = [
      sale({ id: 'A', date: '2026-04-10', net: 1000, dep: 100, wal: 50 }),
      sale({ id: 'B', date: '2026-04-11', net: 2000, dep: 200 }),
      sale({ id: 'C', date: '2026-04-10', net: 500, dep: 50 }),
    ];
    const out = aggregateDailyRevenue(sales);
    const errs = assertReconcile(out, ['netTotal', 'paidAmount', 'outstandingAmount', 'depositApplied', 'walletApplied']);
    expect(errs).toEqual([]);
  });

  it('avgPerDay = netTotal / days', () => {
    const sales = [
      sale({ id: 'A', date: '2026-04-10', net: 1000 }),
      sale({ id: 'B', date: '2026-04-11', net: 3000 }),
    ];
    const out = aggregateDailyRevenue(sales);
    expect(out.totals.avgPerDay).toBe(2000);
  });

  it('topRevenueDay = date with highest netTotal', () => {
    const sales = [
      sale({ id: 'A', date: '2026-04-10', net: 1000 }),
      sale({ id: 'B', date: '2026-04-11', net: 3500 }),
      sale({ id: 'C', date: '2026-04-12', net: 2000 }),
    ];
    const out = aggregateDailyRevenue(sales);
    expect(out.meta.topRevenueDay).toEqual({ date: '2026-04-11', amount: 3500 });
  });

  it('busiestDay = date with most saleCount', () => {
    const sales = [
      sale({ id: 'A', date: '2026-04-10' }),
      sale({ id: 'B', date: '2026-04-10' }),
      sale({ id: 'C', date: '2026-04-10' }),
      sale({ id: 'D', date: '2026-04-11' }),
    ];
    const out = aggregateDailyRevenue(sales);
    expect(out.meta.busiestDay).toEqual({ date: '2026-04-10', count: 3 });
  });

  it('topRevenueDay + busiestDay both null when no data', () => {
    const out = aggregateDailyRevenue([]);
    expect(out.meta.topRevenueDay).toBeNull();
    expect(out.meta.busiestDay).toBeNull();
  });
});

/* ─── Column spec + CSV ──────────────────────────────────────────────────── */

describe('column spec + CSV', () => {
  it('buildDailyRevenueColumns returns 8 cols', () => {
    const cols = buildDailyRevenueColumns();
    expect(cols).toHaveLength(8);
    expect(cols[0].label).toBe('วันที่');
    expect(cols[2].label).toBe('ยอดขายสุทธิ');
  });

  it('CSV has UTF-8 BOM', () => {
    const out = aggregateDailyRevenue([sale({ date: '2026-04-10' })]);
    const csv = buildCSV(out.rows, buildDailyRevenueColumns());
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });
});

/* ─── AR15 — pure ─────────────────────────────────────────────────────────── */

describe('AR15 — pure', () => {
  it('same input → same output', () => {
    const sales = [sale({ date: '2026-04-10' }), sale({ date: '2026-04-11' })];
    const a = aggregateDailyRevenue(sales);
    const b = aggregateDailyRevenue(sales);
    expect(a).toEqual(b);
  });
});
