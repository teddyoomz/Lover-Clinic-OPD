// ─── Phase 13.4.1 · DF payout aggregator tests ───────────────────────────
import { describe, it, expect } from 'vitest';
import { computeDfPayoutReport } from '../src/lib/dfPayoutAggregator.js';

const doctors = [
  { doctorId: 'D1', firstname: 'Alice', lastname: 'A', defaultDfGroupId: 'DFG-1' },
  { doctorId: 'D2', firstname: 'Bob', lastname: 'B', defaultDfGroupId: 'DFG-2' },
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
    // No defaultDfGroupId for unknown doctor → no rate → no row.
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

// ─── Phase 14.5 · treatments[] with explicit dfEntries precedence ─────────
describe('computeDfPayoutReport — treatments[] with dfEntries (Phase 14.5)', () => {
  const makeTreatment = (over = {}) => ({
    treatmentId: 'BT-1',
    customerId: 'CUST-1',
    detail: {
      treatmentDate: '2026-04-24',
      linkedSaleId: 'INV-1',
      dfEntries: [
        {
          id: 'DFE-1',
          doctorId: 'D1',
          doctorName: 'Alice Explicit',
          dfGroupId: 'DFG-1',
          rows: [
            { courseId: 'C1', courseName: 'Laser', enabled: true, value: 777, type: 'baht' },
          ],
        },
      ],
      ...over.detail,
    },
    ...over,
  });

  it('DP18: treatment with dfEntries overrides sale inference for same linkedSaleId', () => {
    // Sale path would compute C1 × 20% × 1000 = 200. Explicit entry says 777 baht × qty=1 = 777.
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C1', qty: 1, price: 1000 }] })],
      treatments: [makeTreatment()],
      doctors, groups,
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].doctorId).toBe('D1');
    expect(r.rows[0].totalDf).toBe(777);
    // Breakdown reports rateSource='dfEntry' (distinct from 'group'/'staff').
    expect(r.rows[0].breakdown[0].rateSource).toBe('dfEntry');
  });

  it('DP19: disabled rows are skipped even when explicit entry covers the sale', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C1', qty: 1, price: 1000 }] })],
      treatments: [makeTreatment({
        detail: {
          treatmentDate: '2026-04-24', linkedSaleId: 'INV-1',
          dfEntries: [{
            id: 'DFE-1', doctorId: 'D1', doctorName: 'Alice', dfGroupId: 'DFG-1',
            rows: [{ courseId: 'C1', courseName: 'Laser', enabled: false, value: 777, type: 'baht' }],
          }],
        },
      })],
      doctors, groups,
    });
    // No enabled rows → nothing added → no row in the output.
    expect(r.rows).toEqual([]);
  });

  it('DP20: explicit entry row that references a course not on the sale is silently skipped', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C1', qty: 1, price: 1000 }] })],
      treatments: [makeTreatment({
        detail: {
          treatmentDate: '2026-04-24', linkedSaleId: 'INV-1',
          dfEntries: [{
            id: 'DFE-1', doctorId: 'D1', doctorName: 'Alice', dfGroupId: 'DFG-1',
            rows: [{ courseId: 'C-MISSING', courseName: 'Phantom', enabled: true, value: 999, type: 'baht' }],
          }],
        },
      })],
      doctors, groups,
    });
    expect(r.rows).toEqual([]);
  });

  it('DP21: percent rows compute against sale line subtotal', () => {
    // Line: 2 × 1000 = 2000 subtotal. Entry row type=percent, value=15 → 300.
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C1', qty: 2, price: 1000 }] })],
      treatments: [makeTreatment({
        detail: {
          treatmentDate: '2026-04-24', linkedSaleId: 'INV-1',
          dfEntries: [{
            id: 'DFE-1', doctorId: 'D1', doctorName: 'Alice', dfGroupId: 'DFG-1',
            rows: [{ courseId: 'C1', courseName: 'Laser', enabled: true, value: 15, type: 'percent' }],
          }],
        },
      })],
      doctors, groups,
    });
    expect(r.rows[0].totalDf).toBe(300);
    expect(r.rows[0].breakdown[0].rateType).toBe('percent');
  });

  it('DP22: sale without matching treatment falls back to legacy inference', () => {
    // Treatment covers INV-9 (not INV-1). Sale INV-1 should use inference.
    const r = computeDfPayoutReport({
      sales: [sale({ saleId: 'INV-1', items: [{ courseId: 'C1', qty: 1, price: 1000 }] })],
      treatments: [makeTreatment({ detail: { treatmentDate: '2026-04-24', linkedSaleId: 'INV-9', dfEntries: [{ id: 'DFE-9', doctorId: 'D2', doctorName: 'Bob', dfGroupId: 'DFG-2', rows: [{ courseId: 'C1', enabled: true, value: 111, type: 'baht' }] }] } })],
      doctors, groups,
    });
    // Inference path: C1 × DFG-1 × 20% × 1000 = 200.
    expect(r.rows[0].doctorId).toBe('D1');
    expect(r.rows[0].totalDf).toBe(200);
    expect(r.rows[0].breakdown[0].rateSource).toBe('group');
  });

  it('DP23: multiple treatments each covering distinct sales aggregate independently', () => {
    const sale1 = sale({ saleId: 'INV-1', items: [{ courseId: 'C1', qty: 1, price: 1000 }] });
    const sale2 = { ...sale1, saleId: 'INV-2', doctorId: 'D2' };
    const t1 = makeTreatment({ treatmentId: 'BT-1', detail: { treatmentDate: '2026-04-24', linkedSaleId: 'INV-1', dfEntries: [{ id: 'DFE-A', doctorId: 'D1', doctorName: 'Alice', dfGroupId: 'DFG-1', rows: [{ courseId: 'C1', enabled: true, value: 500, type: 'baht' }] }] } });
    const t2 = makeTreatment({ treatmentId: 'BT-2', detail: { treatmentDate: '2026-04-24', linkedSaleId: 'INV-2', dfEntries: [{ id: 'DFE-B', doctorId: 'D2', doctorName: 'Bob', dfGroupId: 'DFG-2', rows: [{ courseId: 'C1', enabled: true, value: 600, type: 'baht' }] }] } });
    const r = computeDfPayoutReport({ sales: [sale1, sale2], treatments: [t1, t2], doctors, groups });
    expect(r.rows).toHaveLength(2);
    const byId = Object.fromEntries(r.rows.map((row) => [row.doctorId, row.totalDf]));
    expect(byId.D1).toBe(500);
    expect(byId.D2).toBe(600);
  });

  it('DP24: treatments with empty dfEntries do NOT interfere (inference still runs)', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C1', qty: 1, price: 1000 }] })],
      treatments: [{ treatmentId: 'BT-9', detail: { treatmentDate: '2026-04-24', linkedSaleId: 'INV-1', dfEntries: [] } }],
      doctors, groups,
    });
    // empty dfEntries → not indexed → inference path runs → DFG-1 20% × 1000 = 200.
    expect(r.rows[0].totalDf).toBe(200);
    expect(r.rows[0].breakdown[0].rateSource).toBe('group');
  });

  it('DP25: treatments without linkedSaleId are ignored', () => {
    const r = computeDfPayoutReport({
      sales: [sale({ items: [{ courseId: 'C1', qty: 1, price: 1000 }] })],
      treatments: [{ treatmentId: 'BT-9', detail: { treatmentDate: '2026-04-24', dfEntries: [{ id: 'DFE-X', doctorId: 'D1', doctorName: 'A', dfGroupId: 'DFG-1', rows: [{ courseId: 'C1', enabled: true, value: 999, type: 'baht' }] }] } }],
      doctors, groups,
    });
    // No linkedSaleId → explicit entry isn't applied → inference runs → 200.
    expect(r.rows[0].totalDf).toBe(200);
  });
});

describe('computeDfPayoutReport — Phase 12.2b partial-usage weighting', () => {
  // User spec: percent DF = rate% × full_course_price × (treatment_usage /
  // total_course_qty averaged over products). Sum across all treatments
  // that eventually fully consume the course = full DF.
  //
  // Fixtures: a Premium Combo course at ฿50,000 with Botox 100u + Filler 1cc.
  // Doctor D1 is in DFG-1 with rates: { Premium: 10% }.
  const premiumCourse = {
    courseId: 'C-PREM',
    name: 'Premium Combo',
    qty: 1,
    price: 50000,
    products: [
      { id: 'P-BOTOX', name: 'Botox 100u', qty: 100, unit: 'U' },
      { id: 'P-FILLER', name: 'Filler 1cc', qty: 1, unit: 'cc' },
    ],
  };
  const premiumGroups = [{ id: 'DFG-1', rates: [{ courseId: 'C-PREM', value: 10, type: 'percent' }] }];
  const premiumSale = {
    saleId: 'INV-PREM', saleDate: '2026-04-24', status: 'active',
    doctorId: 'D1',
    items: [premiumCourse],
  };

  const buildTreatmentEntry = (treatmentId, courseItems, rate = { value: 10, type: 'percent' }) => ({
    treatmentId,
    detail: {
      treatmentDate: '2026-04-24',
      linkedSaleId: 'INV-PREM',
      dfEntries: [{
        id: `DFE-${treatmentId}`,
        doctorId: 'D1', doctorName: 'Alice A',
        dfGroupId: 'DFG-1',
        rows: [{ courseId: 'C-PREM', courseName: 'Premium Combo', enabled: true, value: rate.value, type: rate.type }],
      }],
      courseItems,
    },
  });

  it('DP26: full usage ONE treatment → full ฿5,000 DF', () => {
    const r = computeDfPayoutReport({
      sales: [premiumSale],
      treatments: [buildTreatmentEntry('BT-A', [
        { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 100 },
        { courseName: 'Premium Combo', productName: 'Filler 1cc', deductQty: 1 },
      ])],
      doctors, groups: premiumGroups,
    });
    expect(r.rows[0].totalDf).toBe(5000);
    expect(r.rows[0].breakdown[0].courseUsageWeight).toBe(1);
  });

  it('DP27: partial usage (50u Botox only) → ฿1,250 DF (25% weight)', () => {
    const r = computeDfPayoutReport({
      sales: [premiumSale],
      treatments: [buildTreatmentEntry('BT-A', [
        { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 50 },
      ])],
      doctors, groups: premiumGroups,
    });
    expect(r.rows[0].totalDf).toBe(1250); // 50000 × 10% × 0.25
    expect(r.rows[0].breakdown[0].courseUsageWeight).toBe(0.25);
  });

  it('DP28: TWO visits fully consume → sum = ฿5,000 (DF invariant preserved)', () => {
    const r = computeDfPayoutReport({
      sales: [premiumSale],
      treatments: [
        buildTreatmentEntry('BT-1', [
          { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 50 },
        ]),
        buildTreatmentEntry('BT-2', [
          { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 50 },
          { courseName: 'Premium Combo', productName: 'Filler 1cc', deductQty: 1 },
        ]),
      ],
      doctors, groups: premiumGroups,
    });
    // Visit 1: weight 0.25 → ฿1,250. Visit 2: weight 0.75 → ฿3,750. Total ฿5,000.
    expect(r.rows[0].totalDf).toBe(5000);
    expect(r.rows[0].lineCount).toBe(2);
    expect(r.rows[0].breakdown).toHaveLength(2);
    expect(r.rows[0].breakdown.reduce((s, b) => s + b.df, 0)).toBe(5000);
  });

  it('DP29: multi-treatment per sale indexing — both treatments contribute (not last-wins)', () => {
    const r = computeDfPayoutReport({
      sales: [premiumSale],
      treatments: [
        buildTreatmentEntry('BT-A', [{ courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 25 }]),
        buildTreatmentEntry('BT-B', [{ courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 25 }]),
      ],
      doctors, groups: premiumGroups,
    });
    // Each visit: 25u/100u botox → 0.125 weight. Two visits → 0.25 total.
    // Total DF: 50000 × 10% × 0.25 = 1250.
    expect(r.rows[0].totalDf).toBe(1250);
    expect(r.rows[0].lineCount).toBe(2);
  });

  it('DP30: baht rate ignores usage weight (per-unit already accounts for partial)', () => {
    // Explicit path uses the dfEntries row's own rate (value + type), so
    // we have to flip the row to baht — the group doesn't affect this path.
    const r = computeDfPayoutReport({
      sales: [premiumSale],
      treatments: [buildTreatmentEntry('BT-A', [
        { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 50 },
      ], { value: 500, type: 'baht' })],
      doctors, groups: premiumGroups,
    });
    // baht: value × saleLineQty = 500 × 1 = 500 regardless of usage weight.
    expect(r.rows[0].totalDf).toBe(500);
  });

  it('DP31: treatment breakdown records courseUsageWeight + treatmentId for audit', () => {
    const r = computeDfPayoutReport({
      sales: [premiumSale],
      treatments: [buildTreatmentEntry('BT-AUDIT', [
        { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 50 },
      ])],
      doctors, groups: premiumGroups,
    });
    const b = r.rows[0].breakdown[0];
    expect(b.courseUsageWeight).toBe(0.25);
    expect(b.treatmentId).toBe('BT-AUDIT');
  });
});

describe('computeDfPayoutReport — production-shape id/courseId fallback (2026-04-24 DF report bug)', () => {
  // Real backend sales (SaleTab.confirmBuy) store course items with `id:
  // <master_course_id>` — not `courseId`. Before the fix, every prod sale
  // produced a ฿0 DF report because the courseIndex was keyed by
  // `it.courseId` (undefined) → '' collision → lookup miss. These tests
  // lock the fallback in place.

  it('DP32: explicit-entry path resolves matching item via `id` when `courseId` is absent', () => {
    const r = computeDfPayoutReport({
      sales: [{
        saleId: 'INV-PROD', saleDate: '2026-04-24', status: 'active',
        doctorId: 'D1',
        // Production shape: `id` only, no courseId.
        items: [{ id: 'C-X', name: 'X Course', qty: 1, price: 1000, itemType: 'course' }],
      }],
      treatments: [{
        treatmentId: 'BT-P1',
        detail: {
          linkedSaleId: 'INV-PROD',
          dfEntries: [{
            id: 'DFE-1', doctorId: 'D1', doctorName: 'A', dfGroupId: 'DFG-1',
            rows: [{ courseId: 'C-X', enabled: true, value: 20, type: 'percent' }],
          }],
          courseItems: [],
        },
      }],
      doctors, groups: [{ id: 'DFG-1', rates: [{ courseId: 'C-X', value: 20, type: 'percent' }] }],
    });
    expect(r.rows[0].totalDf).toBe(200); // 20% × 1000 = 200 (weight=1 with empty courseItems → full)
  });

  it('DP33: inference path resolves courseId from `id` when the field is missing', () => {
    const r = computeDfPayoutReport({
      sales: [{
        saleId: 'INV-INF', saleDate: '2026-04-24', status: 'active',
        doctorId: 'D1',
        // Production shape + no explicit dfEntries → hits inference path.
        items: [{ id: 'C1', name: 'Course 1', qty: 1, price: 1000, itemType: 'course' }],
      }],
      doctors, groups,
    });
    // DFG-1 has C1 at 20% → 1000 × 20% = 200
    expect(r.rows[0].totalDf).toBe(200);
  });

  it('DP34: inference path SKIPS non-course items (product with id set but itemType=product)', () => {
    const r = computeDfPayoutReport({
      sales: [{
        saleId: 'INV-MIX', saleDate: '2026-04-24', status: 'active',
        doctorId: 'D1',
        items: [
          { id: 'PROD-X', name: 'Vitamin', qty: 1, price: 500, itemType: 'product' },
          { id: 'C1', name: 'Course 1', qty: 1, price: 1000, itemType: 'course' },
        ],
      }],
      doctors, groups,
    });
    // Only the course earns DF. 1000 × 20% = 200 (product skipped).
    expect(r.rows[0].totalDf).toBe(200);
  });

  it('DP35: test-fixture shape (courseId only, no id) still works — regression', () => {
    const r = computeDfPayoutReport({
      sales: [{
        saleId: 'INV-TEST', saleDate: '2026-04-24', status: 'active',
        doctorId: 'D1',
        items: [{ courseId: 'C1', qty: 1, price: 1000 }],
      }],
      doctors, groups,
    });
    expect(r.rows[0].totalDf).toBe(200);
  });

  it('DP36: breakdown.courseName falls back to `it.name` when courseName is absent', () => {
    const r = computeDfPayoutReport({
      sales: [{
        saleId: 'INV-NAME', saleDate: '2026-04-24', status: 'active',
        doctorId: 'D1',
        items: [{ id: 'C1', name: 'My Course', qty: 1, price: 1000, itemType: 'course' }],
      }],
      doctors, groups,
    });
    expect(r.rows[0].breakdown[0].courseName).toBe('My Course');
  });
});
