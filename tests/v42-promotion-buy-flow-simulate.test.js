// ─── V42 — promotion buy full-flow simulate (Rule I, 2026-05-07) ──────────
//
// Per .claude/rules/00-session-start.md Rule I + V13 lessons (helper-output
// tests pass while user flow broken), this file chains:
//   master promotion config
//     → buildPromotionSubCourseProducts (helper)
//     → assignCourseToCustomer simulator (per-product entry creation)
//     → customer.courses[] persisted shape
//     → deductCourseItems simulator (consume N treatments)
//     → final remaining qty
//
// Verifies the user's exact reproduced case: promo 6×PRP + 2×AHL → customer
// gets 3 entries (PRP=6/6, Tube=18/18, AHL=2/2) → after N treatments,
// remaining decrements correctly. Also covers multi-buy, empty arrays,
// adversarial sub.qty values, and unit preservation.

import { describe, it, expect } from 'vitest';
import {
  computePromotionProductQty,
  buildPromotionSubCourseProducts,
} from '../src/lib/treatmentBuyHelpers.js';

// ─── Pure simulators (mirror real backendClient.js logic) ──────────────────

/**
 * Mirror assignCourseToCustomer per-product entry creation
 * (backendClient.js:1526-1554). Each input product produces ONE customer
 * course entry with qty="N / N unit" string format.
 */
function simulateAssignCourseToCustomer(masterCourse, opts = {}) {
  const products = Array.isArray(masterCourse.products) ? masterCourse.products : [];
  return products.map(p => ({
    name: masterCourse.name,
    product: p.name,
    qty: `${Number(p.qty) || 1} / ${Number(p.qty) || 1} ${p.unit || 'ครั้ง'}`,
    productId: p.id || p.productId || null,
    promotionId: opts.promotionId || null,
    parentName: opts.parentName || null,
  }));
}

/**
 * Mirror the full buy-promotion → customer.courses[] flow.
 * Routes through buildPromotionSubCourseProducts (V42 helper) and produces
 * the array of customer.courses[] entries that would be persisted.
 */
function simulatePromotionBuy(promo, purchasedQty = 1) {
  const subs = Array.isArray(promo.courses) ? promo.courses : [];
  const allEntries = [];
  for (const sub of subs) {
    const subProds = buildPromotionSubCourseProducts(sub, purchasedQty, {
      fallbackName: sub.name || promo.promotion_name || promo.name,
    });
    const entries = simulateAssignCourseToCustomer(
      { name: sub.name || promo.promotion_name || promo.name, products: subProds },
      { promotionId: promo.id || promo.promotionId || null, parentName: `โปรโมชัน: ${promo.promotion_name || promo.name || ''}` },
    );
    allEntries.push(...entries);
  }
  return allEntries;
}

/**
 * Mirror deductCourseItems decrement: subtracts deductQty from `remaining`,
 * preserves total + unit, returns the updated entry.
 */
function simulateDeduct(courses, productName, deductQty) {
  const entry = courses.find(c => c.product === productName);
  if (!entry) throw new Error(`No customer.courses[] entry for product: ${productName}`);
  const m = entry.qty.match(/^(\d+(?:\.\d+)?) \/ (\d+(?:\.\d+)?) (.+)$/);
  if (!m) throw new Error(`Cannot parse qty string: ${entry.qty}`);
  const oldRem = Number(m[1]);
  const total = m[2];
  const unit = m[3];
  const newRem = Math.max(0, oldRem - deductQty);
  entry.qty = `${newRem} / ${total} ${unit}`;
  return entry;
}

// ─── F1: user's exact reproduced bug — 6×PRP + 2×AHL ──────────────────────
describe('F1 — user reproduction: promo (6×PRP-bundle + 2×AHL) bought 1×', () => {
  const promo = {
    promotionId: 'PROMO-USER-CASE',
    promotion_name: 'คอร์ส บำรุงรากผม PRP 6 ครั้ง + AHL 2 ครั้ง',
    courses: [
      {
        id: 'sub-PRP',
        name: 'PRP เกล็ดเลือดบำรุงรากผม 1 ครั้ง',
        qty: 6,
        products: [
          { id: 'p-PRP', name: 'PRP เกล็ดเลือดบำรุงรากผม', qty: 1, unit: 'ครั้ง' },
          { id: 'p-Tube', name: 'Tube PRP', qty: 3, unit: 'อัน' },
        ],
      },
      {
        id: 'sub-AHL',
        name: 'AHL 1 ครั้ง',
        qty: 2,
        products: [{ id: 'p-AHL', name: 'AHL', qty: 1, unit: 'ครั้ง' }],
      },
    ],
  };

  it('F1.1 produces 3 customer.courses[] entries (one per product)', () => {
    const courses = simulatePromotionBuy(promo, 1);
    expect(courses).toHaveLength(3);
  });

  it('F1.2 PRP entry has qty="6 / 6 ครั้ง" (multiplied by sub.qty=6)', () => {
    const courses = simulatePromotionBuy(promo, 1);
    const prp = courses.find(c => c.product === 'PRP เกล็ดเลือดบำรุงรากผม');
    expect(prp).toBeDefined();
    expect(prp.qty).toBe('6 / 6 ครั้ง');
  });

  it('F1.3 Tube PRP entry has qty="18 / 18 อัน" (multiplied 6×3)', () => {
    const courses = simulatePromotionBuy(promo, 1);
    const tube = courses.find(c => c.product === 'Tube PRP');
    expect(tube).toBeDefined();
    expect(tube.qty).toBe('18 / 18 อัน');
  });

  it('F1.4 AHL entry has qty="2 / 2 ครั้ง" (multiplied by sub.qty=2)', () => {
    const courses = simulatePromotionBuy(promo, 1);
    const ahl = courses.find(c => c.product === 'AHL');
    expect(ahl).toBeDefined();
    expect(ahl.qty).toBe('2 / 2 ครั้ง');
  });

  it('F1.5 each entry tagged with promotionId for cleanup symmetry', () => {
    const courses = simulatePromotionBuy(promo, 1);
    for (const c of courses) {
      expect(c.promotionId).toBe('PROMO-USER-CASE');
      expect(c.parentName).toContain('คอร์ส บำรุงรากผม PRP 6 ครั้ง + AHL 2 ครั้ง');
    }
  });

  it('F1.6 anti-regression: pre-V42 broken output (qty=1/1, 3/3, 1/1) NEVER produced', () => {
    const courses = simulatePromotionBuy(promo, 1);
    const prp = courses.find(c => c.product === 'PRP เกล็ดเลือดบำรุงรากผม');
    const tube = courses.find(c => c.product === 'Tube PRP');
    const ahl = courses.find(c => c.product === 'AHL');
    // The bug produced these incorrect values:
    expect(prp.qty).not.toBe('1 / 1 ครั้ง');
    expect(tube.qty).not.toBe('3 / 3 อัน');
    expect(ahl.qty).not.toBe('1 / 1 ครั้ง');
  });
});

// ─── F2: lifecycle — deduct across all 6 PRP + 2 AHL treatments ───────────
describe('F2 — full lifecycle: buy → consume across N treatments → fully used', () => {
  const promo = {
    promotionId: 'PROMO-LIFECYCLE',
    promotion_name: 'Lifecycle Test',
    courses: [
      { id: 's1', name: 'PRP', qty: 6, products: [
        { id: 'p1', name: 'PRP', qty: 1, unit: 'ครั้ง' },
        { id: 'p2', name: 'Tube PRP', qty: 3, unit: 'อัน' },
      ]},
      { id: 's2', name: 'AHL', qty: 2, products: [{ id: 'p3', name: 'AHL', qty: 1, unit: 'ครั้ง' }] },
    ],
  };

  it('F2.1 after 1st treatment (PRP×1 + Tube×3 + AHL×1): remaining 5/6, 15/18, 1/2', () => {
    const courses = simulatePromotionBuy(promo, 1);
    simulateDeduct(courses, 'PRP', 1);
    simulateDeduct(courses, 'Tube PRP', 3);
    simulateDeduct(courses, 'AHL', 1);
    expect(courses.find(c => c.product === 'PRP').qty).toBe('5 / 6 ครั้ง');
    expect(courses.find(c => c.product === 'Tube PRP').qty).toBe('15 / 18 อัน');
    expect(courses.find(c => c.product === 'AHL').qty).toBe('1 / 2 ครั้ง');
  });

  it('F2.2 after all 6 PRP treatments: PRP=0/6, Tube=0/18 (but AHL still 1/2)', () => {
    const courses = simulatePromotionBuy(promo, 1);
    for (let i = 0; i < 6; i++) {
      simulateDeduct(courses, 'PRP', 1);
      simulateDeduct(courses, 'Tube PRP', 3);
    }
    expect(courses.find(c => c.product === 'PRP').qty).toBe('0 / 6 ครั้ง');
    expect(courses.find(c => c.product === 'Tube PRP').qty).toBe('0 / 18 อัน');
    expect(courses.find(c => c.product === 'AHL').qty).toBe('2 / 2 ครั้ง');
  });

  it('F2.3 after all 2 AHL treatments: AHL=0/2', () => {
    const courses = simulatePromotionBuy(promo, 1);
    simulateDeduct(courses, 'AHL', 1);
    simulateDeduct(courses, 'AHL', 1);
    expect(courses.find(c => c.product === 'AHL').qty).toBe('0 / 2 ครั้ง');
  });

  it('F2.4 over-deduct does NOT go negative (Math.max guard)', () => {
    const courses = simulatePromotionBuy(promo, 1);
    simulateDeduct(courses, 'AHL', 1);
    simulateDeduct(courses, 'AHL', 1);
    simulateDeduct(courses, 'AHL', 1);  // 3rd deduct on 2-total
    expect(courses.find(c => c.product === 'AHL').qty).toBe('0 / 2 ครั้ง');
  });

  it('F2.5 anti-regression: PRE-V42 BUG REPRO — only 1 PRP treatment possible', () => {
    // Simulate the BUG (no sub.qty multiplier) to PROVE the fix prevents this
    const buggyCourses = promo.courses.flatMap(sub => sub.products.map(p => ({
      name: sub.name,
      product: p.name,
      qty: `${p.qty} / ${p.qty} ${p.unit}`,
    })));
    // Only 1 PRP treatment (1 of 1) was possible — instead of 6
    expect(buggyCourses.find(c => c.product === 'PRP').qty).toBe('1 / 1 ครั้ง');
    expect(buggyCourses.find(c => c.product === 'Tube PRP').qty).toBe('3 / 3 อัน');
    expect(buggyCourses.find(c => c.product === 'AHL').qty).toBe('1 / 1 ครั้ง');
    // The fix produces the correct values:
    const fixedCourses = simulatePromotionBuy(promo, 1);
    expect(fixedCourses.find(c => c.product === 'PRP').qty).toBe('6 / 6 ครั้ง');
    expect(fixedCourses.find(c => c.product === 'Tube PRP').qty).toBe('18 / 18 อัน');
    expect(fixedCourses.find(c => c.product === 'AHL').qty).toBe('2 / 2 ครั้ง');
  });
});

// ─── F3: multi-buy (purchasedQty > 1) ──────────────────────────────────────
describe('F3 — multi-buy: bought 2× of the user\'s promotion', () => {
  const promo = {
    promotion_name: 'Multi-buy Test',
    courses: [
      { id: 's1', name: 'PRP', qty: 6, products: [
        { id: 'p1', name: 'PRP', qty: 1, unit: 'ครั้ง' },
        { id: 'p2', name: 'Tube', qty: 3, unit: 'อัน' },
      ]},
    ],
  };

  it('F3.1 bought 2× → PRP=12/12 (2 × 6 × 1), Tube=36/36 (2 × 6 × 3)', () => {
    const courses = simulatePromotionBuy(promo, 2);
    expect(courses.find(c => c.product === 'PRP').qty).toBe('12 / 12 ครั้ง');
    expect(courses.find(c => c.product === 'Tube').qty).toBe('36 / 36 อัน');
  });

  it('F3.2 bought 3× → PRP=18/18, Tube=54/54', () => {
    const courses = simulatePromotionBuy(promo, 3);
    expect(courses.find(c => c.product === 'PRP').qty).toBe('18 / 18 ครั้ง');
    expect(courses.find(c => c.product === 'Tube').qty).toBe('54 / 54 อัน');
  });
});

// ─── F4: adversarial inputs (V13 robustness) ───────────────────────────────
describe('F4 — adversarial inputs', () => {
  it('F4.1 promotion with empty courses[] → 0 customer.courses[] entries', () => {
    expect(simulatePromotionBuy({ courses: [] }, 1)).toEqual([]);
    expect(simulatePromotionBuy({ courses: null }, 1)).toEqual([]);
    expect(simulatePromotionBuy({}, 1)).toEqual([]);
  });

  it('F4.2 sub-course with no products → fallback single entry', () => {
    const promo = { courses: [{ name: 'EmptyCourse', qty: 4 }] };
    const courses = simulatePromotionBuy(promo, 2);
    expect(courses).toHaveLength(1);
    expect(courses[0].product).toBe('EmptyCourse');
    expect(courses[0].qty).toBe('8 / 8 ครั้ง');  // 2 × 4
  });

  it('F4.3 sub.qty = 0 defaults to 1 (no zero math)', () => {
    const promo = { courses: [{ name: 'ZeroQty', qty: 0, products: [{ name: 'p', qty: 5 }] }] };
    const courses = simulatePromotionBuy(promo, 1);
    expect(courses[0].qty).toBe('5 / 5 ครั้ง');  // 1×1×5 (zero defaulted)
  });

  it('F4.4 sub.qty as string ("6") gets parsed correctly', () => {
    const promo = { courses: [{ name: 'StrQty', qty: '6', products: [{ name: 'p', qty: '3' }] }] };
    const courses = simulatePromotionBuy(promo, '2');
    expect(courses[0].qty).toBe('36 / 36 ครั้ง');  // 2×6×3
  });

  it('F4.5 multiple sub-courses with same product name produce SEPARATE entries', () => {
    // Edge case: if a promo has 2 sub-courses both with a product named "PRP",
    // they create 2 separate customer.courses[] entries (one per sub-course).
    const promo = {
      courses: [
        { name: 'CourseA', qty: 3, products: [{ name: 'X', qty: 1 }] },
        { name: 'CourseB', qty: 2, products: [{ name: 'X', qty: 4 }] },
      ],
    };
    const courses = simulatePromotionBuy(promo, 1);
    expect(courses).toHaveLength(2);
    // Two entries for product='X' but with different course names
    expect(courses[0].name).toBe('CourseA');
    expect(courses[0].qty).toBe('3 / 3 ครั้ง');  // 1×3×1
    expect(courses[1].name).toBe('CourseB');
    expect(courses[1].qty).toBe('8 / 8 ครั้ง');  // 1×2×4
  });

  it('F4.6 Thai unit names preserved verbatim', () => {
    const promo = {
      courses: [{ name: 'X', qty: 5, products: [
        { name: 'a', qty: 2, unit: 'หน่วย' },
        { name: 'b', qty: 3, unit: 'ขวด' },
      ]}],
    };
    const courses = simulatePromotionBuy(promo, 1);
    expect(courses.find(c => c.product === 'a').qty).toBe('10 / 10 หน่วย');
    expect(courses.find(c => c.product === 'b').qty).toBe('15 / 15 ขวด');
  });
});

// ─── F5: future-proof guarantee (user's "ปัจจุบันและอนาคต") ───────────────
describe('F5 — future-proof: any package configuration produces exact qty', () => {
  it('F5.1 1×N course with M products: every product has qty = N×M', () => {
    for (let N = 1; N <= 10; N++) {
      for (let M = 1; M <= 5; M++) {
        const promo = { courses: [{ name: 'X', qty: N, products: [{ name: 'p', qty: M }] }] };
        const courses = simulatePromotionBuy(promo, 1);
        expect(courses[0].qty).toBe(`${N * M} / ${N * M} ครั้ง`);
      }
    }
  });

  it('F5.2 multi-package: each sub-course independently multiplied', () => {
    const promo = {
      courses: [
        { name: 'A', qty: 3, products: [{ name: 'pa', qty: 2 }] },
        { name: 'B', qty: 5, products: [{ name: 'pb', qty: 4 }] },
        { name: 'C', qty: 1, products: [{ name: 'pc', qty: 7 }] },
      ],
    };
    const courses = simulatePromotionBuy(promo, 1);
    expect(courses.find(c => c.product === 'pa').qty).toBe('6 / 6 ครั้ง');   // 1×3×2
    expect(courses.find(c => c.product === 'pb').qty).toBe('20 / 20 ครั้ง'); // 1×5×4
    expect(courses.find(c => c.product === 'pc').qty).toBe('7 / 7 ครั้ง');   // 1×1×7
  });

  it('F5.3 conservation: total deduct capacity = sum of all multiplied qtys', () => {
    const promo = {
      courses: [
        { name: 'A', qty: 4, products: [{ name: 'pa', qty: 3 }, { name: 'pb', qty: 2 }] },
        { name: 'B', qty: 2, products: [{ name: 'pc', qty: 5 }] },
      ],
    };
    const courses = simulatePromotionBuy(promo, 2);
    // pa: 2×4×3 = 24; pb: 2×4×2 = 16; pc: 2×2×5 = 20
    expect(courses.find(c => c.product === 'pa').qty).toBe('24 / 24 ครั้ง');
    expect(courses.find(c => c.product === 'pb').qty).toBe('16 / 16 ครั้ง');
    expect(courses.find(c => c.product === 'pc').qty).toBe('20 / 20 ครั้ง');
    // Sum of remaining = 60 — proves the conservation invariant
    const totalRemaining = courses.reduce((sum, c) => sum + Number(c.qty.match(/^(\d+)/)[1]), 0);
    expect(totalRemaining).toBe(60);
  });

  it('F5.4 buying 1 promotion creates the EXACT capacity user configured', () => {
    // User scenario: configure promo with intent "customer gets 6 PRP visits"
    // Verify: customer.courses[] PRP product allows exactly 6 deductions of qty=1
    const promo = { courses: [{ name: 'PRP', qty: 6, products: [{ name: 'PRP', qty: 1 }] }] };
    const courses = simulatePromotionBuy(promo, 1);
    let count = 0;
    while (true) {
      const before = Number(courses.find(c => c.product === 'PRP').qty.match(/^(\d+)/)[1]);
      if (before === 0) break;
      simulateDeduct(courses, 'PRP', 1);
      count++;
      if (count > 100) throw new Error('Infinite loop guard');
    }
    expect(count).toBe(6);  // Exactly 6 PRP treatments possible — matches config
  });
});
