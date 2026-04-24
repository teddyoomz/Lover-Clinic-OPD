// ─── Phase 12.2b Priority 1.5 — DF × pick-at-treatment full-flow simulate ─
//
// Question: when a buyer picks LipoS 4 เข็ม from "แฟต 4 เข็ม (เลือกสินค้าตามจริง)"
// course at ฿3,412.50 and uses 1 เข็ม in visit 1, what DF is owed to the
// doctor?
//
// Answer per `computeDfAmount(rate, sub, qty, { courseUsageWeight })`:
//   - rate.type='percent': DF = sub × (rate.value / 100) × courseUsageWeight
//   - rate.type='baht':   DF = rate.value × qty
//   - courseUsageWeight = avg(used_qty / total_qty) across course products
//
// For the pick scenario: course has ONE picked product (LipoS 4 เข็ม total).
// Used 1 in visit 1 → weight = 1/4 = 0.25. Full course price sub = 3412.5.
// At 10% rate: DF visit 1 = 3412.5 × 0.10 × 0.25 = ฿85.31. Sum across all
// visits (4 uses) = 3412.5 × 0.10 × 1.0 = ฿341.25 (full DF). Invariant holds.
//
// Coverage:
//   F1: percent rate × course price × weight — per-visit split
//   F2: baht rate — flat per-qty, ignores weight
//   F3: multi-product pick (LipoS 4 + Babi 10) — weight = avg across BOTH
//   F4: cross-visit DF sum invariant (per-visit DFs sum to full DF)
//   F5: no pick yet (placeholder) → weight=1 degenerate fallback? check
//   F6: adversarial (zero-qty products, null rate, weight clamp)
//   F7: source-grep — computeDfAmount + computeCourseUsageWeight contracts

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

import { computeDfAmount, computeCourseUsageWeight, getRateForStaffCourse } from '../src/lib/dfGroupValidation.js';

// ═══════════════════════════════════════════════════════════════════════
// F1: Percent rate × course price × usage weight
// ═══════════════════════════════════════════════════════════════════════

describe('F1: percent DF on pick-at-treatment course — rate × course_price × weight', () => {
  it('F1.1: LipoS 4-เข็ม buffet, use 1 visit 1 → DF = 3412.5 × 0.10 × 0.25 = 85.3125', () => {
    const saleCourseItem = {
      name: 'แฟต 4 เข็ม (เลือกสินค้าตามจริง)',
      products: [{ id: 'LipoS', name: 'LipoS', qty: 4 }],
    };
    const treatmentItems = [
      { courseName: 'แฟต 4 เข็ม (เลือกสินค้าตามจริง)', productName: 'LipoS', deductQty: 1 },
    ];
    const weight = computeCourseUsageWeight(saleCourseItem, treatmentItems);
    expect(weight).toBe(0.25);
    const df = computeDfAmount({ type: 'percent', value: 10 }, 3412.5, 1, { courseUsageWeight: weight });
    expect(df).toBeCloseTo(85.3125, 4);
  });

  it('F1.2: same pick, full use (4/4) → weight=1 → full DF = 341.25', () => {
    const saleCourseItem = { name: 'C', products: [{ name: 'LipoS', qty: 4 }] };
    const treatmentItems = [{ courseName: 'C', productName: 'LipoS', deductQty: 4 }];
    const weight = computeCourseUsageWeight(saleCourseItem, treatmentItems);
    expect(weight).toBe(1);
    const df = computeDfAmount({ type: 'percent', value: 10 }, 3412.5, 4, { courseUsageWeight: 1 });
    expect(df).toBeCloseTo(341.25, 2);
  });

  it('F1.3: 50% use (2/4) → weight=0.5 → DF = 170.625', () => {
    const saleCourseItem = { name: 'C', products: [{ name: 'LipoS', qty: 4 }] };
    const treatmentItems = [{ courseName: 'C', productName: 'LipoS', deductQty: 2 }];
    const weight = computeCourseUsageWeight(saleCourseItem, treatmentItems);
    expect(weight).toBe(0.5);
    const df = computeDfAmount({ type: 'percent', value: 10 }, 3412.5, 2, { courseUsageWeight: 0.5 });
    expect(df).toBeCloseTo(170.625, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F2: Baht rate — flat per qty, weight ignored
// ═══════════════════════════════════════════════════════════════════════

describe('F2: baht DF — flat × qty, ignores courseUsageWeight', () => {
  it('F2.1: baht 50/เข็ม × 1 เข็ม = 50 regardless of weight', () => {
    expect(computeDfAmount({ type: 'baht', value: 50 }, 3412.5, 1, { courseUsageWeight: 0.25 })).toBe(50);
    expect(computeDfAmount({ type: 'baht', value: 50 }, 3412.5, 1, { courseUsageWeight: 1.0 })).toBe(50);
  });

  it('F2.2: baht 100/ครั้ง × 3 = 300', () => {
    expect(computeDfAmount({ type: 'baht', value: 100 }, 999, 3)).toBe(300);
  });

  it('F2.3: baht 0-qty → 0', () => {
    expect(computeDfAmount({ type: 'baht', value: 100 }, 999, 0)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F3: Multi-product pick — weight averages across BOTH picked products
// ═══════════════════════════════════════════════════════════════════════

describe('F3: multi-product pick — usage weight averages across products', () => {
  it('F3.1: course with LipoS (4) + Babi (10), use LipoS 1 + Babi 5 → avg(0.25, 0.5) = 0.375', () => {
    const saleCourseItem = {
      name: 'แฟต',
      products: [
        { name: 'LipoS', qty: 4 },
        { name: 'Babi', qty: 10 },
      ],
    };
    const treatmentItems = [
      { courseName: 'แฟต', productName: 'LipoS', deductQty: 1 },
      { courseName: 'แฟต', productName: 'Babi', deductQty: 5 },
    ];
    const weight = computeCourseUsageWeight(saleCourseItem, treatmentItems);
    expect(weight).toBe(0.375);
  });

  it('F3.2: only ONE of two products used → avg(0.25, 0) = 0.125', () => {
    const saleCourseItem = { name: 'C', products: [{ name: 'A', qty: 4 }, { name: 'B', qty: 4 }] };
    const treatmentItems = [{ courseName: 'C', productName: 'A', deductQty: 1 }];
    expect(computeCourseUsageWeight(saleCourseItem, treatmentItems)).toBe(0.125);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F4: Cross-visit sum invariant (total DF across all visits = full DF)
// ═══════════════════════════════════════════════════════════════════════

describe('F4: cross-visit invariant — sum(visit DFs) = full course DF when fully used', () => {
  it('F4.1: 4 visits of 1-เข็ม each on a 4-เข็ม pick course → sum of DFs = full DF', () => {
    const saleCourseItem = { name: 'C', products: [{ name: 'LipoS', qty: 4 }] };
    const rate = { type: 'percent', value: 10 };
    const sub = 3412.5;
    let totalDf = 0;
    // Each visit uses 1 out of 4. Weight per-visit = 0.25. DF per visit = sub × 10% × 0.25.
    for (let i = 0; i < 4; i++) {
      const ti = [{ courseName: 'C', productName: 'LipoS', deductQty: 1 }];
      const w = computeCourseUsageWeight(saleCourseItem, ti);
      totalDf += computeDfAmount(rate, sub, 1, { courseUsageWeight: w });
    }
    // Full DF = sub × 10% × 1.0 = 341.25. Sum from 4 × (sub × 10% × 0.25) = 341.25 exact.
    expect(totalDf).toBeCloseTo(341.25, 2);
  });

  it('F4.2: unequal-visit split (visits of 2+1+1 on a 4 total) → sum = full DF', () => {
    const saleCourseItem = { name: 'C', products: [{ name: 'X', qty: 4 }] };
    const rate = { type: 'percent', value: 10 };
    const sub = 3412.5;
    const splits = [2, 1, 1];
    let totalDf = 0;
    for (const q of splits) {
      const ti = [{ courseName: 'C', productName: 'X', deductQty: q }];
      const w = computeCourseUsageWeight(saleCourseItem, ti);
      totalDf += computeDfAmount(rate, sub, q, { courseUsageWeight: w });
    }
    // 2/4 + 1/4 + 1/4 = 1.0 total weight
    expect(totalDf).toBeCloseTo(341.25, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F5: Edge cases — placeholder pick / no products / no treatment
// ═══════════════════════════════════════════════════════════════════════

describe('F5: edge cases for pick-at-treatment DF', () => {
  it('F5.1: saleCourseItem with products=[] → weight=1 (degenerate — old sales pre-12.2b)', () => {
    expect(computeCourseUsageWeight({ name: 'X' }, [])).toBe(1);
    expect(computeCourseUsageWeight({ name: 'X', products: [] }, [])).toBe(1);
  });

  it('F5.2: treatment without matching courseName → weight=0', () => {
    const sale = { name: 'C', products: [{ name: 'A', qty: 1 }] };
    const ti = [{ courseName: 'DIFFERENT', productName: 'A', deductQty: 1 }];
    expect(computeCourseUsageWeight(sale, ti)).toBe(0);
  });

  it('F5.3: product qty=0 in sale → skipped in avg (defensive)', () => {
    const sale = { name: 'C', products: [{ name: 'A', qty: 0 }, { name: 'B', qty: 4 }] };
    const ti = [{ courseName: 'C', productName: 'B', deductQty: 2 }];
    // A skipped (qty=0), only B counted → 2/4 = 0.5
    expect(computeCourseUsageWeight(sale, ti)).toBe(0.5);
  });

  it('F5.4: null rate → DF=0', () => {
    expect(computeDfAmount(null, 1000, 1)).toBe(0);
  });

  it('F5.5: weight > 1 floating-point rounding → clamped to 1', () => {
    const df = computeDfAmount({ type: 'percent', value: 10 }, 100, 1, { courseUsageWeight: 1.0000001 });
    expect(df).toBe(10);
  });

  it('F5.6: weight < 0 → clamped to 0', () => {
    const df = computeDfAmount({ type: 'percent', value: 10 }, 100, 1, { courseUsageWeight: -0.5 });
    expect(df).toBe(0);
  });

  it('F5.7: NaN weight → fallback 1', () => {
    const df = computeDfAmount({ type: 'percent', value: 10 }, 100, 1, { courseUsageWeight: NaN });
    expect(df).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F6: Staff rate lookup (getRateForStaffCourse)
// ═══════════════════════════════════════════════════════════════════════

describe('F6: getRateForStaffCourse — lookup precedence (staff-specific > group default)', () => {
  it('F6.1: empty inputs → null', () => {
    expect(getRateForStaffCourse('', 'C1', 'G1', [], [])).toBeNull();
    expect(getRateForStaffCourse('D1', '', 'G1', [], [])).toBeNull();
  });

  it('F6.2: staff-specific rate overrides group default', () => {
    const groups = [{ id: 'G1', rates: [{ courseId: 'C1', type: 'percent', value: 10 }] }];
    // staffRatesDocs shape: one doc per staff, with rates[] inside
    const staffRates = [{ staffId: 'D1', rates: [{ courseId: 'C1', type: 'percent', value: 15 }] }];
    const rate = getRateForStaffCourse('D1', 'C1', 'G1', groups, staffRates);
    expect(rate?.value).toBe(15); // staff override wins
    expect(rate?.source).toBe('staff');
  });

  it('F6.3: no staff-specific → group default', () => {
    const groups = [{ id: 'G1', rates: [{ courseId: 'C1', type: 'percent', value: 10 }] }];
    const rate = getRateForStaffCourse('D1', 'C1', 'G1', groups, []);
    expect(rate?.value).toBe(10);
  });

  it('F6.4: no match anywhere → null', () => {
    const rate = getRateForStaffCourse('D1', 'NOT_IN_GROUP', 'G1', [{ id: 'G1', rates: [] }], []);
    expect(rate).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F7: source-grep — DF aggregator handles id + courseId fallback
// ═══════════════════════════════════════════════════════════════════════

describe('F7: source-grep — DF payout + aggregator wire courseUsageWeight', () => {
  const DF = fs.readFileSync('src/lib/dfGroupValidation.js', 'utf-8');
  const AGG = fs.readFileSync('src/lib/dfPayoutAggregator.js', 'utf-8');

  it('F7.1: computeDfAmount honors courseUsageWeight option', () => {
    expect(DF).toMatch(/opts.*courseUsageWeight/);
    expect(DF).toMatch(/rate\.type\s*===\s*['"]percent['"][^;]*\*\s*w/);
  });

  it('F7.2: computeDfAmount baht path ignores weight (flat × qty)', () => {
    expect(DF).toMatch(/rate\.type\s*===\s*['"]baht['"][^;]*rate\.value[^;]*\*\s*q/);
  });

  it('F7.3: aggregator passes courseUsageWeight through', () => {
    expect(AGG).toMatch(/courseUsageWeight/);
    expect(AGG).toMatch(/computeCourseUsageWeight\(/);
  });

  it('F7.4: aggregator resolves course by BOTH courseId AND id (dfPayoutAggregator key fix 2026-04-24)', () => {
    // SaleTab stores course items with `it.id` only. Legacy / ProClinic-synced
    // might have `it.courseId`. Aggregator must handle both.
    expect(AGG).toMatch(/courseId|\bit\.id\b/);
  });

  it('F7.5: aggregator filters itemType === "course" (no product leak)', () => {
    expect(AGG).toMatch(/itemType\s*===\s*['"]course['"]/);
  });
});
