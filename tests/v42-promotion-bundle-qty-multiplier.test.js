// ─── V42 — promotion bundle qty multiplier bug + fix (2026-05-07) ──────────
//
// User reproduced live on prod: a promotion configured
//   courses: [
//     { name:'PRP เกล็ดเลือดบำรุงรากผม 1 ครั้ง', qty:6, products:[
//         {name:'PRP เกล็ดเลือดบำรุงรากผม', qty:1},
//         {name:'Tube PRP', qty:3}
//     ]},
//     { name:'AHL 1 ครั้ง', qty:2, products:[{name:'AHL', qty:1}]}
//   ]
//
// Buying this promotion with qty=1 (a single purchase) was producing
// customer.courses[] entries with PRP=1/1, Tube=3/3, AHL=1/1 — the OUTER
// `sub.qty` (6 and 2) was dropped at every writer site. Expected: PRP=6/6,
// Tube=18/18, AHL=2/2.
//
// V12-class multi-writer bug — 4 writer sites all missed `sub.qty`:
//   1. TFP confirmBuyModal (lines 1686-1693)
//   2. TFP handleSubmit auto-sale create (lines 2562-2566)
//   3. TFP handleSubmit edit→sale create (lines 2701-2705)
//   4. SaleTab handleSubmit (lines 932-935)
//
// Fix: extracted shared helpers (computePromotionProductQty +
// buildPromotionSubCourseProducts) in treatmentBuyHelpers.js. All 4 writer
// sites route through the helper. Future writer drift caught by source-grep
// regression test below.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  computePromotionProductQty,
  buildPromotionSubCourseProducts,
} from '../src/lib/treatmentBuyHelpers.js';

// ─── B1: computePromotionProductQty (3-level multiplier) ─────────────────
describe('B1 — computePromotionProductQty', () => {
  it('B1.1 user reproduction: pQty=1, sub.qty=6, p.qty=1 (PRP) → 6', () => {
    expect(computePromotionProductQty(1, 6, 1)).toBe(6);
  });

  it('B1.2 user reproduction: pQty=1, sub.qty=6, p.qty=3 (Tube PRP) → 18', () => {
    expect(computePromotionProductQty(1, 6, 3)).toBe(18);
  });

  it('B1.3 user reproduction: pQty=1, sub.qty=2, p.qty=1 (AHL) → 2', () => {
    expect(computePromotionProductQty(1, 2, 1)).toBe(2);
  });

  it('B1.4 multi-buy: pQty=2, sub.qty=6, p.qty=3 → 36', () => {
    expect(computePromotionProductQty(2, 6, 3)).toBe(36);
  });

  it('B1.5 nullish defaults: undefined → 1×1×1 = 1', () => {
    expect(computePromotionProductQty(undefined, undefined, undefined)).toBe(1);
  });

  it('B1.6 zero defaults to 1 (no destructive zero math)', () => {
    expect(computePromotionProductQty(0, 0, 0)).toBe(1);
    expect(computePromotionProductQty(2, 0, 3)).toBe(6);  // sub=0 → 1, so 2*1*3
  });

  it('B1.7 string inputs (Firestore stores qty as string sometimes)', () => {
    expect(computePromotionProductQty('1', '6', '3')).toBe(18);
  });

  it('B1.8 negative inputs default to 1', () => {
    expect(computePromotionProductQty(-1, -6, -3)).toBe(1);
  });

  it('B1.9 NaN inputs default to 1', () => {
    expect(computePromotionProductQty(NaN, NaN, NaN)).toBe(1);
  });

  it('B1.10 always returns positive integer when inputs are integers', () => {
    for (let buy = 1; buy <= 3; buy++) {
      for (let sub = 1; sub <= 6; sub++) {
        for (let prod = 1; prod <= 5; prod++) {
          const result = computePromotionProductQty(buy, sub, prod);
          expect(result).toBeGreaterThanOrEqual(1);
          expect(Number.isInteger(result)).toBe(true);
          expect(result).toBe(buy * sub * prod);
        }
      }
    }
  });
});

// ─── B2: buildPromotionSubCourseProducts ──────────────────────────────────
describe('B2 — buildPromotionSubCourseProducts', () => {
  it('B2.1 user case: PRP course (qty:6) with products [PRP qty=1, Tube qty=3] @ pQty=1', () => {
    const sub = {
      name: 'PRP เกล็ดเลือดบำรุงรากผม 1 ครั้ง',
      qty: 6,
      products: [
        { id: 'p1', name: 'PRP เกล็ดเลือดบำรุงรากผม', qty: 1, unit: 'ครั้ง' },
        { id: 'p2', name: 'Tube PRP', qty: 3, unit: 'อัน' },
      ],
    };
    const result = buildPromotionSubCourseProducts(sub, 1);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({ id: 'p1', name: 'PRP เกล็ดเลือดบำรุงรากผม', qty: 6, unit: 'ครั้ง' });
    expect(result[1]).toMatchObject({ id: 'p2', name: 'Tube PRP', qty: 18, unit: 'อัน' });
  });

  it('B2.2 user case: AHL course (qty:2) with [AHL qty=1] @ pQty=1', () => {
    const sub = { name: 'AHL 1 ครั้ง', qty: 2, products: [{ name: 'AHL', qty: 1, unit: 'ครั้ง' }] };
    const result = buildPromotionSubCourseProducts(sub, 1);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ name: 'AHL', qty: 2, unit: 'ครั้ง' });
  });

  it('B2.3 sub.qty defaults to 1 when missing', () => {
    const sub = { name: 'X', products: [{ name: 'p1', qty: 5 }] };
    const result = buildPromotionSubCourseProducts(sub, 1);
    expect(result[0].qty).toBe(5);
  });

  it('B2.4 multi-buy: pQty=2, sub.qty=6, p.qty=3 → 36', () => {
    const sub = { name: 'X', qty: 6, products: [{ name: 'p1', qty: 3 }] };
    const result = buildPromotionSubCourseProducts(sub, 2);
    expect(result[0].qty).toBe(36);
  });

  it('B2.5 fallback when sub has no products[]', () => {
    const sub = { name: 'CourseName', qty: 4, unit: 'ครั้ง' };
    const result = buildPromotionSubCourseProducts(sub, 2, { fallbackName: 'Promo' });
    expect(result).toEqual([{ name: 'CourseName', qty: 8, unit: 'ครั้ง' }]);  // pQty=2 × sub.qty=4
  });

  it('B2.6 fallback uses opts.fallbackName when sub.name missing', () => {
    const sub = { qty: 3 };
    const result = buildPromotionSubCourseProducts(sub, 1, { fallbackName: 'PromoName' });
    expect(result[0]).toMatchObject({ name: 'PromoName', qty: 3, unit: 'ครั้ง' });
  });

  it('B2.7 preserves all source product fields except qty', () => {
    const sub = {
      qty: 2,
      products: [{ id: 'p1', productId: 'real-id', name: 'X', qty: 3, unit: 'อัน', skipStockDeduction: true, customField: 'ABC' }],
    };
    const result = buildPromotionSubCourseProducts(sub, 1);
    expect(result[0]).toMatchObject({
      id: 'p1',
      productId: 'real-id',
      name: 'X',
      qty: 6,  // 1 × 2 × 3 — multiplied
      unit: 'อัน',
      skipStockDeduction: true,
      customField: 'ABC',
    });
  });

  it('B2.8 does NOT mutate input', () => {
    const sub = { qty: 6, products: [{ name: 'P', qty: 3 }] };
    const inputBefore = JSON.stringify(sub);
    buildPromotionSubCourseProducts(sub, 1);
    expect(JSON.stringify(sub)).toBe(inputBefore);
  });

  it('B2.9 null/undefined sub returns fallback', () => {
    expect(buildPromotionSubCourseProducts(null, 1)).toEqual([{ name: '', qty: 1, unit: 'ครั้ง' }]);
    expect(buildPromotionSubCourseProducts(undefined, 1, { fallbackName: 'X' })).toEqual([{ name: 'X', qty: 1, unit: 'ครั้ง' }]);
  });
});

// ─── B3: source-grep regression — all 4 writer sites use the helper ───────
//
// V12 multi-writer-sweep guard. Future drift in any of the 4 writer sites
// (e.g. someone copy-pasting an old `(p.qty || 1) * pQty` snippet) fails
// this test at build time.
describe('B3 — V12 multi-writer-sweep regression guard', () => {
  it('B3.1 TreatmentFormPage imports the helper', () => {
    const src = readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
    expect(src).toMatch(/buildPromotionSubCourseProducts|computePromotionProductQty/);
  });

  it('B3.2 SaleTab imports the helper', () => {
    const src = readFileSync('src/components/backend/SaleTab.jsx', 'utf-8');
    expect(src).toMatch(/buildPromotionSubCourseProducts|computePromotionProductQty/);
  });

  it('B3.3 TFP confirmBuyModal — promotion-courses branch uses helper', () => {
    const src = readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
    // The promotion-courses block must call the helper (not raw `String(p.qty || 1)`)
    const match = src.match(/item\.itemType === 'promotion'[\s\S]*?item\.courses\?\.length[\s\S]{0,1500}?setOptions/);
    expect(match, 'TFP confirmBuyModal promotion-courses branch not found').toBeTruthy();
    const block = match[0];
    expect(block).toMatch(/buildPromotionSubCourseProducts|computePromotionProductQty/);
    // Anti-regression: bare `String(p.qty || 1)` (no multiplier) must not exist in this block
    expect(block).not.toMatch(/remaining: String\(p\.qty \|\| 1\)/);
  });

  it('B3.4 TFP + SaleTab assignCourseToCustomer-call sites use the helper', () => {
    // Look for the pattern `for (const sub of promo.courses)` — there are 3
    // such sites across TFP (2) + SaleTab (1). All must use the helper.
    for (const file of ['src/components/TreatmentFormPage.jsx', 'src/components/backend/SaleTab.jsx']) {
      const src = readFileSync(file, 'utf-8');
      const matches = src.match(/for \(const sub of promo\.courses\)/g) || [];
      // For each match position, find the surrounding ~500-char block and check helper usage
      let pos = 0;
      for (let i = 0; i < matches.length; i++) {
        const idx = src.indexOf('for (const sub of promo.courses)', pos);
        expect(idx, `for-of sub block #${i + 1} not found in ${file}`).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 700);
        expect(block, `${file} for-of-sub-#${i + 1} doesn't use buildPromotionSubCourseProducts`)
          .toMatch(/buildPromotionSubCourseProducts/);
        // Anti-regression: bare `(Number(p.qty) || 1) * pQty` without sub.qty
        // should not exist in the block. The helper handles the math.
        expect(block, `${file} for-of-sub-#${i + 1} retains buggy raw math`)
          .not.toMatch(/sub\.products\?\.length\s*\?\s*sub\.products\.map\(p => \(\{ \.\.\.p, qty: \(Number\(p\.qty\) \|\| 1\) \* p?Qty \}\)\)/);
        pos = idx + 1;
      }
    }
  });
});
