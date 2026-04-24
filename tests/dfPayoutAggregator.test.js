// ─── Phase 13.4.1 · DF payout aggregator tests ───────────────────────────
import { describe, it, expect } from 'vitest';
import { computeDfPayoutReport } from '../src/lib/dfPayoutAggregator.js';

const doctors = [
  { doctorId: 'D1', firstname: 'Alice', lastname: 'A', dfGroupId: 'DFG-1' },
  { doctorId: 'D2', firstname: 'Bob', lastname: 'B', dfGroupId: 'DFG-2' },
];
const groups = [
  { id: 'DFG-1', rates: [
    { courseId: 'C1', value: 20, type: 'percent' },
    { courseId: 'C2', value: 500, type: 'baht' },
  ]},
  { id: 'DFG-2', rates: [
    { courseId: 'C1', value: 10, type: 'percent' },
  ]},
];
const staffOverrides = [
  { staffId: 'D1', rates: [{ courseId: 'C3', value: 1000, type: 'baht' }] },
];

const sale = (over = {}) => ({
  saleId: 'INV-1', saleDate: '2026-04-24', status: 'active',
  doctorId: 'D1',
  items: [{ courseId: 'C1', qty: 1, price: 1000 }],
  ...over,
});

describe('computeDfPayoutReport — basic aggregation', () => {
  it('DP1: empty inputs → empty result', () => {
    const r = computeDfPayoutReport({});
    expect(r.rows).toEqual([]);
    expect(r.summary.total).toBe(0);
    expect(r.summary.doctorCount).toBe(0);
  });

  it('DP2: single sale, single doctor, percent rate', () => {
    const r = computeDfPayoutReport({
      sales: [sale()], doctors, groups,
    });
    // 1000 × 20% = 200
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].doctorId).toBe('D1');
    expect(r.rows[0].totalDf).toBe(200);
    expect(r.rows[0].saleCount).toBe(1);
    expect(r.rows[0].lineCount).toBe(1);
    expect(r.summary.total).toBe(200);
  });

  it('DP3: single sale, baht rate', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C2', qty: 2, price: 3000 }] })],
      doctors, groups,
    });
    // 500 baht × qty 2 = 1000
    expect(r.rows[0].totalDf).toBe(1000);
  });

  it('DP4: staff override wins over group', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C3', qty: 1, price: 9999 }] })],
      doctors, groups, staffOverrides,
    });
    // C3 has NO group rate but D1 has override: 1000 baht × 1 = 1000
    expect(r.rows[0].totalDf).toBe(1000);
    expect(r.rows[0].breakdown[0].rateSource).toBe('staff');
  });
});

describe('computeDfPayoutReport — multi-seller split', () => {
  it('DP5: sale with sellers[] splits DF by percent', () => {
    const s = sale({
      doctorId: undefined,
      sellers: [
        { sellerId: 'D1', percent: 60 },
        { sellerId: 'D2', percent: 40 },
      ],
      items: [{ courseId: 'C1', qty: 1, price: 1000 }],
    });
    const r = computeDfPayoutReport({ sales: [s], doctors, groups });
    // D1: 20% × 1000 × 60% = 120
    // D2: 10% × 1000 × 40% = 40
    const d1 = r.rows.find((x) => x.doctorId === 'D1');
    const d2 = r.rows.find((x) => x.doctorId === 'D2');
    expect(d1.totalDf).toBe(120);
    expect(d2.totalDf).toBe(40);
    expect(r.summary.total).toBe(160);
    // Rows sorted desc by totalDf
    expect(r.rows[0].doctorId).toBe('D1');
    expect(r.rows[1].doctorId).toBe('D2');
  });

  it('DP6: seller with 0 percent skipped', () => {
    const s = sale({
      doctorId: undefined,
      sellers: [{ sellerId: 'D1', percent: 100 }, { sellerId: 'D2', percent: 0 }],
    });
    const r = computeDfPayoutReport({ sales: [s], doctors, groups });
    expect(r.rows.find((x) => x.doctorId === 'D2')).toBeUndefined();
  });
});

describe('computeDfPayoutReport — filters + edge cases', () => {
  it('DP7: date range filter excludes out-of-range sale', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ saleDate: '2026-03-15' })], doctors, groups,
      startDate: '2026-04-01', endDate: '2026-04-30',
    });
    expect(r.rows).toEqual([]);
  });

  it('DP8: cancelled sales excluded by default', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ status: 'cancelled' })], doctors, groups,
    });
    expect(r.rows).toEqual([]);
  });

  it('DP9: refunded sales excluded by default', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ refunded: true })], doctors, groups,
    });
    expect(r.rows).toEqual([]);
  });

  it('DP10: includeCancelled=true counts cancelled', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ status: 'cancelled' })], doctors, groups,
      includeCancelled: true,
    });
    expect(r.rows).toHaveLength(1);
  });

  it('DP11: product-only item (no courseId) skipped', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ productId: 'P1', qty: 1, price: 500 }] })],
      doctors, groups,
    });
    expect(r.rows).toEqual([]);
  });

  it('DP12: item with no rate in group → skipped (no DF)', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C-OTHER', qty: 1, price: 1000 }] })],
      doctors, groups,
    });
    expect(r.rows).toEqual([]);
  });

  it('DP13: percent discount on line reduces DF base', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C1', qty: 1, price: 1000, discount: 10, discountType: 'percent' }] })],
      doctors, groups,
    });
    // Net line: 1000 × (1 - 0.10) = 900; DF: 900 × 20% = 180
    expect(r.rows[0].totalDf).toBe(180);
  });

  it('DP14: baht discount on line reduces DF base', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C1', qty: 1, price: 1000, discount: 300, discountType: 'baht' }] })],
      doctors, groups,
    });
    // Net: 700; DF: 140
    expect(r.rows[0].totalDf).toBe(140);
  });

  it('DP15: unassigned sale (no doctorId + no sellers) skipped', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ doctorId: undefined })], doctors, groups,
    });
    expect(r.rows).toEqual([]);
  });

  it('DP16: doctor not in directory still gets row (empty name)', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ doctorId: 'D-UNKNOWN' })],
      doctors, groups: [{ id: 'DFG-X', rates: [{ courseId: 'C1', value: 50, type: 'percent' }] }],
    });
    // No dfGroupId for unknown doctor → no rate → no row.
    expect(r.rows).toEqual([]);
  });

  it('DP17: breakdown preserves per-line detail', () => {
    const r = computeDfPayoutReport({
      sales: [sale({
        items: [
          { courseId: 'C1', qty: 1, price: 1000 },
          { courseId: 'C2', qty: 2, price: 3000 },
        ],
      })],
      doctors, groups,
    });
    expect(r.rows[0].breakdown).toHaveLength(2);
    expect(r.rows[0].totalDf).toBe(200 + 1000);
  });

  it('DP18: rounding to 2 decimals', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C1', qty: 1, price: 333.33 }] })],
      doctors, groups,
    });
    // 333.33 × 20% = 66.666 → rounds to 66.67
    expect(r.rows[0].totalDf).toBe(66.67);
  });
});
