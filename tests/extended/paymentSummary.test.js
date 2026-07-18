// ─── Phase 12.8 · Payment Summary aggregator tests ────────────────────────
import { describe, it, expect } from 'vitest';
import { aggregatePaymentSummary, KNOWN_METHODS, getPaymentSummaryColumns } from '../../src/lib/paymentSummaryAggregator.js';

const makeSale = (saleId, saleDate, channels, status = 'completed') => ({
  saleId, saleDate, status, payment: { channels },
});
const makeLegacySale = (saleId, saleDate, paymentMethod, paidAmount, status = 'completed') => ({
  saleId, saleDate, status, paymentMethod, paidAmount,
});

// 2026-07-19 repoint: the 2026-06-09 deposit-in-reports rework changed the
// aggregator contract — signature is now (sales, deposits = [], filters = {}),
// rows carry { method, salesAmount, depositAmount, total, docCount, percentage }
// (was { method, amount, saleCount, percentage }), and totals carry
// { salesAmount, depositAmount, total, docCount, saleCount } (was .amount).
describe('aggregatePaymentSummary', () => {
  it('PS1: empty input → empty rows', () => {
    const r = aggregatePaymentSummary([]);
    expect(r.rows).toEqual([]);
    expect(r.totals.total).toBe(0); // 2026-07-19 repoint: totals.amount → totals.total
  });

  it('PS2: single cash channel → single row 100%', () => {
    const r = aggregatePaymentSummary([makeSale('S1', '2026-04-20', [{ method: 'เงินสด', amount: 1000 }])]);
    expect(r.rows).toHaveLength(1);
    // 2026-07-19 repoint: row shape — salesAmount + total + docCount (deposit-in-reports)
    expect(r.rows[0]).toMatchObject({
      method: 'เงินสด', salesAmount: 1000, depositAmount: 0, total: 1000, docCount: 1, percentage: 100,
    });
  });

  it('PS3: multiple methods sorted by amount desc', () => {
    const r = aggregatePaymentSummary([
      makeSale('S1', '2026-04-20', [{ method: 'เงินสด', amount: 500 }]),
      makeSale('S2', '2026-04-20', [{ method: 'โอน', amount: 2000 }]),
      makeSale('S3', '2026-04-20', [{ method: 'QR', amount: 1000 }]),
    ]);
    expect(r.rows.map(x => x.method)).toEqual(['โอน', 'QR', 'เงินสด']);
  });

  it('PS4: split payment (2 channels on one sale)', () => {
    const r = aggregatePaymentSummary([
      makeSale('S1', '2026-04-20', [
        { method: 'เงินสด', amount: 500 },
        { method: 'โอน', amount: 500 },
      ]),
    ]);
    expect(r.rows).toHaveLength(2);
    expect(r.totals.total).toBe(1000); // 2026-07-19 repoint: totals.amount → totals.total
  });

  it('PS5: same method on 2 different sales — docCount = 2', () => {
    const r = aggregatePaymentSummary([
      makeSale('S1', '2026-04-20', [{ method: 'เงินสด', amount: 500 }]),
      makeSale('S2', '2026-04-21', [{ method: 'เงินสด', amount: 300 }]),
    ]);
    // 2026-07-19 repoint: saleCount → docCount (unique sales + deposit docs); amount → salesAmount
    expect(r.rows[0].docCount).toBe(2);
    expect(r.rows[0].salesAmount).toBe(800);
  });

  it('PS6: cancelled sales excluded', () => {
    const r = aggregatePaymentSummary([
      makeSale('S1', '2026-04-20', [{ method: 'เงินสด', amount: 500 }]),
      makeSale('S2', '2026-04-20', [{ method: 'เงินสด', amount: 999 }], 'cancelled'),
    ]);
    expect(r.rows[0].salesAmount).toBe(500); // 2026-07-19 repoint: amount → salesAmount
    expect(r.meta.cancelledExcluded).toBe(1);
  });

  it('PS7: legacy flat paymentMethod shape supported', () => {
    const r = aggregatePaymentSummary([makeLegacySale('S1', '2026-04-20', 'cash', 1000)]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].method).toBe('เงินสด');
    expect(r.rows[0].salesAmount).toBe(1000); // 2026-07-19 repoint: amount → salesAmount
  });

  it('PS8: unknown method → "อื่นๆ"', () => {
    const r = aggregatePaymentSummary([makeSale('S1', '2026-04-20', [{ method: 'bitcoin', amount: 500 }])]);
    expect(r.rows[0].method).toBe('อื่นๆ');
  });

  it('PS9: alias normalization (case-insensitive)', () => {
    const r = aggregatePaymentSummary([
      makeSale('S1', '2026-04-20', [{ method: 'CASH', amount: 100 }]),
      makeSale('S2', '2026-04-20', [{ method: 'cash', amount: 200 }]),
      makeSale('S3', '2026-04-20', [{ method: 'Cash', amount: 300 }]),
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].method).toBe('เงินสด');
    expect(r.rows[0].salesAmount).toBe(600); // 2026-07-19 repoint: amount → salesAmount
  });

  it('PS10: transfer alias', () => {
    const r = aggregatePaymentSummary([makeSale('S1', '2026-04-20', [{ method: 'Transfer', amount: 100 }])]);
    expect(r.rows[0].method).toBe('โอน');
  });

  it('PS11: zero-amount channels ignored', () => {
    const r = aggregatePaymentSummary([
      makeSale('S1', '2026-04-20', [
        { method: 'เงินสด', amount: 0 },
        { method: 'โอน', amount: 500 },
      ]),
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].method).toBe('โอน');
  });

  it('PS12: date range filter inclusive', () => {
    // 2026-07-19 repoint: filters moved to the 3rd arg (2nd arg = deposits now).
    const r = aggregatePaymentSummary([
      makeSale('S1', '2026-03-31', [{ method: 'เงินสด', amount: 100 }]),
      makeSale('S2', '2026-04-01', [{ method: 'เงินสด', amount: 200 }]),
      makeSale('S3', '2026-04-30', [{ method: 'เงินสด', amount: 300 }]),
    ], [], { from: '2026-04-01', to: '2026-04-30' });
    expect(r.totals.total).toBe(500);
  });

  it('PS13: branchId filter', () => {
    // 2026-07-19 repoint: filters moved to the 3rd arg (2nd arg = deposits now).
    const r = aggregatePaymentSummary([
      { ...makeSale('S1', '2026-04-20', [{ method: 'เงินสด', amount: 500 }]), branchId: 'BR-1' },
      { ...makeSale('S2', '2026-04-20', [{ method: 'เงินสด', amount: 999 }]), branchId: 'BR-2' },
    ], [], { branchId: 'BR-1' });
    expect(r.totals.total).toBe(500);
  });

  it('PS14: percentage sums to 100 across rows (±0.01)', () => {
    const r = aggregatePaymentSummary([
      makeSale('S1', '2026-04-20', [
        { method: 'เงินสด', amount: 333.33 },
        { method: 'โอน', amount: 333.33 },
        { method: 'QR', amount: 333.34 },
      ]),
    ]);
    const pctSum = r.rows.reduce((a, x) => a + x.percentage, 0);
    expect(Math.abs(pctSum - 100)).toBeLessThanOrEqual(0.02);
  });

  it('PS15: KNOWN_METHODS frozen + includes essentials', () => {
    expect(KNOWN_METHODS).toContain('เงินสด');
    expect(KNOWN_METHODS).toContain('โอน');
    expect(KNOWN_METHODS).toContain('QR');
    expect(() => KNOWN_METHODS.push('NewMethod')).toThrow();
  });
});

describe('getPaymentSummaryColumns', () => {
  it('PC1: 6 columns in expected order (deposit-in-reports)', () => {
    // 2026-07-19 repoint: 2026-06-09 rework split amount → salesAmount +
    // depositAmount + total, and saleCount → docCount ("ใบเสร็จ").
    expect(getPaymentSummaryColumns().map(c => c.key))
      .toEqual(['method', 'salesAmount', 'depositAmount', 'total', 'docCount', 'percentage']);
  });
  it('PC2: percentage formatted with 2 decimals + "%"', () => {
    const col = getPaymentSummaryColumns().find(c => c.key === 'percentage');
    expect(col.format(42.5)).toBe('42.50%');
  });
});
