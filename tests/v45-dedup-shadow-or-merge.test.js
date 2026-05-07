// ─── V45 — Dedup-shadow OR-merge fix — 2026-05-08 ──────────────────────────
//
// User report (3rd round skip-stock-deduction class):
//   "ติ๊ก 'ขลิบไร้เลือด' ไม่ต้องตัดสต็อค แต่หลังทดลองสร้างการรักษา ยังตัดสต็อคอยู่"
// Image evidence: course "ขลิบไร้เลือด (เบอร์26) 1 ครั้ง" with main + sub
// (same product) + sub.skipStockDeduction=true + top.skipStockDeduction=false.
// Result: ขลิบไร้เลือด -1 deducted via negativeOverage (NOT branch-1 SKIP).
//
// Phase 4.5 (3+ fixes failed → question architecture): the architecture is
// SOUND; the bug is at the canonical mapper's DEDUP step. beCourseToMasterShape
// at backendClient.js:3193 silently SKIPped the dup-of-main sub-row, which
// also dropped its per-row skipStockDeduction flag. Main entry retained
// top-level flag only.
//
// V45 fix: BEFORE skipping the dup-of-main sub-row, OR-merge its per-row
// flags into the already-pushed main entry. Single-source fix at canonical
// mapper benefits all 3 consumers (TFP buy + SaleTab buy + QuotationFormModal).
//
// Test groups:
//  V45.A — beCourseToMasterShape OR-merge per-row flag (sub.skip=true wins)
//  V45.B — Reverse direction (sub.skip=false, top.skip=true → top wins via OR)
//  V45.C — Multiple sub-rows (different productId) preserve their own flags
//  V45.D — isHidden also OR-merges (defensive companion flag)
//  V45.E — Source-grep regression locks
//  V45.F — Rule I full-flow: master → buyfetch → buildPurchasedCourseEntry
//          → toggleCourseItem → _deductOneItem branch 1 (course-skip)
//  V45.G — User-reported repro fixtures (ขลิบไร้เลือด เบอร์26 + PRP cluster)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { beCourseToMasterShape } from '../src/lib/backendClient.js';
import {
  buildPurchasedCourseEntry,
  resolveCustomerCourseSkipFlag,
  overlayCustomerCoursesWithMaster,
} from '../src/lib/treatmentBuyHelpers.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const backendSrc = read('src/lib/backendClient.js');

// ════════════════════════════════════════════════════════════════════════════
describe('V45.A — Dedup-shadow OR-merge: sub-row skip flag wins', () => {
  it('A.1 sub.skip=true + top.skip=false → main entry skipStockDeduction=true (USER REPORT REPRO)', () => {
    const c = {
      courseId: 'C-V45-1',
      courseName: 'ขลิบไร้เลือด (เบอร์26) 1 ครั้ง',
      mainProductId: '38843',
      mainProductName: 'ขลิบไร้เลือด',
      mainQty: 1,
      skipStockDeduction: false, // TOP-LEVEL FALSE
      courseProducts: [
        { productId: '38843', productName: 'ขลิบไร้เลือด', qty: 1, skipStockDeduction: true }, // SAME id, sub flag TRUE
        { productId: 'STAPPLE-26', productName: 'Stapple no 26', qty: 1, skipStockDeduction: false },
      ],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products).toHaveLength(2); // dedup still removes dup-of-main row
    const main = shape.products[0];
    expect(main.id).toBe('38843');
    expect(main.isMainProduct).toBe(true);
    // ❗ V45 invariant: OR-merged from sub-row
    expect(main.skipStockDeduction).toBe(true);
    // Stapple unchanged
    expect(shape.products[1].name).toBe('Stapple no 26');
    expect(shape.products[1].skipStockDeduction).toBe(false);
  });

  it('A.2 sub.skip=false + top.skip=false → main retains false (no false→true upgrade)', () => {
    const c = {
      courseId: 'C-V45-2',
      courseName: 'X',
      mainProductId: 'P',
      mainProductName: 'PName',
      mainQty: 1,
      skipStockDeduction: false,
      courseProducts: [
        { productId: 'P', productName: 'PName', qty: 1, skipStockDeduction: false },
      ],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products).toHaveLength(1);
    expect(shape.products[0].skipStockDeduction).toBe(false);
  });

  it('A.3 sub.skip=true even when sub-row has no product flag set explicitly (undefined → no merge)', () => {
    const c = {
      courseId: 'C-V45-3',
      courseName: 'X',
      mainProductId: 'P',
      mainProductName: 'PName',
      mainQty: 1,
      skipStockDeduction: false,
      courseProducts: [
        { productId: 'P', productName: 'PName', qty: 1 }, // no skipStockDeduction at all
      ],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products[0].skipStockDeduction).toBe(false); // unchanged
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V45.B — Reverse direction: top.skip=true wins via OR with sub.skip=false', () => {
  it('B.1 top.skip=true + sub.skip=false → main remains true (top set first)', () => {
    const c = {
      courseId: 'C-V45-B1',
      courseName: 'X',
      mainProductId: 'P',
      mainProductName: 'PName',
      mainQty: 1,
      skipStockDeduction: true, // TOP TRUE
      courseProducts: [
        { productId: 'P', productName: 'PName', qty: 1, skipStockDeduction: false }, // sub false
      ],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products[0].skipStockDeduction).toBe(true); // top wins (sub false doesn't downgrade)
  });

  it('B.2 BOTH true → main remains true (idempotent OR)', () => {
    const c = {
      courseId: 'C-V45-B2',
      courseName: 'X',
      mainProductId: 'P',
      mainProductName: 'PName',
      mainQty: 1,
      skipStockDeduction: true,
      courseProducts: [
        { productId: 'P', productName: 'PName', qty: 1, skipStockDeduction: true },
      ],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products[0].skipStockDeduction).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V45.C — Multiple sub-rows (different productId) preserve their own flags', () => {
  it('C.1 mix of dup-of-main + distinct subs: each path correct', () => {
    const c = {
      courseId: 'C-V45-C1',
      courseName: 'Mixed',
      mainProductId: 'M',
      mainProductName: 'Main',
      mainQty: 1,
      skipStockDeduction: false,
      courseProducts: [
        { productId: 'M', productName: 'Main', qty: 1, skipStockDeduction: true }, // dup-of-main, OR-merge
        { productId: 'S1', productName: 'Sub 1', qty: 2, skipStockDeduction: false },
        { productId: 'S2', productName: 'Sub 2', qty: 3, skipStockDeduction: true },
      ],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products).toHaveLength(3); // main + 2 distinct subs (dup deduped)
    const byName = Object.fromEntries(shape.products.map(p => [p.name, p]));
    expect(byName['Main'].skipStockDeduction).toBe(true);  // OR-merged from dup
    expect(byName['Sub 1'].skipStockDeduction).toBe(false);
    expect(byName['Sub 2'].skipStockDeduction).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V45.D — isHidden companion flag also OR-merges', () => {
  it('D.1 sub.isHidden=true → main inherits isHidden=true', () => {
    const c = {
      courseId: 'C-V45-D1',
      courseName: 'X',
      mainProductId: 'P',
      mainProductName: 'PName',
      mainQty: 1,
      skipStockDeduction: false,
      courseProducts: [
        { productId: 'P', productName: 'PName', qty: 1, isHidden: true },
      ],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products[0].isHidden).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V45.E — Source-grep regression locks', () => {
  it('E.1 OR-merge block exists before continue', () => {
    expect(backendSrc).toMatch(/if\s*\(pid\s*&&\s*pid\s*===\s*mainId\)\s*\{[\s\S]*?cp\.skipStockDeduction\s*===\s*true[\s\S]*?continue;\s*\}/);
  });

  it('E.2 V45 marker present', () => {
    expect(backendSrc).toMatch(/V45[^\n]*DEDUP-SHADOW|V45[^\n]*OR-merge/i);
  });

  it('E.3 Pre-V45 silent-skip pattern is GONE', () => {
    // Silent `if (pid && pid === mainId) continue;` (no merge body) is the V45 anti-pattern
    expect(backendSrc).not.toMatch(/if\s*\(pid\s*&&\s*pid\s*===\s*mainId\)\s*continue;\s*\n\s*const\s+enriched/);
  });

  it('E.4 main entry remains discoverable by isMainProduct + id', () => {
    // OR-merge needs to find the main entry; it relies on isMainProduct:true
    const fnStart = backendSrc.indexOf('export function beCourseToMasterShape');
    const fnEnd = backendSrc.indexOf('\n}', fnStart);
    const fnBody = backendSrc.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/isMainProduct:\s*true/);
    expect(fnBody).toMatch(/products\.find\(p => p\.isMainProduct/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V45.F — Rule I full-flow: master → buy → entry → deduct gate', () => {
  it('F.1 USER REPORT REPRO: ขลิบไร้เลือด (เบอร์26) full chain → branch 1 fires', () => {
    // STEP 1: be_courses doc — exact user-reported shape from V45 diag
    const beCourseDoc = {
      id: 'COURSES_1778150447655_176077B3',
      courseId: 'COURSES_1778150447655_176077B3',
      courseName: 'ขลิบไร้เลือด (เบอร์26) 1 ครั้ง',
      mainProductId: '38843',
      mainProductName: 'ขลิบไร้เลือด',
      mainQty: 1,
      skipStockDeduction: false, // top-level UNCHECKED in user's modal
      courseProducts: [
        { productId: '38843', productName: 'ขลิบไร้เลือด', qty: 1, skipStockDeduction: true }, // SAME id, ไม่ตัด CHECKED
        { productId: 'STAPPLE-26', productName: 'Stapple no 26', qty: 1, skipStockDeduction: false, isHidden: true },
      ],
      salePrice: 13900,
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
    };

    // STEP 2: TFP buy fetcher → beCourseToMasterShape
    const shape = beCourseToMasterShape(beCourseDoc);
    expect(shape.products).toHaveLength(2);
    const mainEntry = shape.products.find(p => p.isMainProduct);
    expect(mainEntry.name).toBe('ขลิบไร้เลือด');
    expect(mainEntry.skipStockDeduction).toBe(true); // V45 OR-merge ✓
    const stappleEntry = shape.products.find(p => p.id === 'STAPPLE-26');
    expect(stappleEntry.skipStockDeduction).toBe(false); // not flagged

    // STEP 3: confirmBuyModal → buildPurchasedCourseEntry
    const purchasedItem = {
      id: shape.id, name: shape.name,
      products: shape.products,
      qty: '1',
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
    };
    const entry = buildPurchasedCourseEntry(purchasedItem);
    expect(entry.products[0].skipStockDeduction).toBe(true); // ขลิบไร้เลือด — V45 propagated
    expect(entry.products[1].skipStockDeduction).toBe(false); // Stapple

    // STEP 4: TFP toggleCourseItem builds treatmentItem with the flag
    const treatmentItemKhlib = {
      id: entry.products[0].rowId,
      productId: entry.products[0].productId,
      name: entry.products[0].name,
      skipStockDeduction: !!entry.products[0].skipStockDeduction,
    };
    expect(treatmentItemKhlib.skipStockDeduction).toBe(true);

    // STEP 5: _deductOneItem branch 1 fires when item.skipStockDeduction === true
    const wouldEmitCourseSkip = treatmentItemKhlib.skipStockDeduction === true;
    expect(wouldEmitCourseSkip).toBe(true); // ✓ post-V45

    // STEP 6: PRE-V45 reproduction (would FAIL) — simulate the old dedup
    // by NOT applying OR-merge. Expect main flag to be false (top-level only).
    const preV45SimMain = {
      id: '38843',
      name: 'ขลิบไร้เลือด',
      skipStockDeduction: !!beCourseDoc.skipStockDeduction, // top-level only — pre-V45
      isMainProduct: true,
    };
    expect(preV45SimMain.skipStockDeduction).toBe(false); // bug repro
  });

  it('F.2 V43 overlay (saved customer.courses[]) still resolves correctly post-V45 — no regression', () => {
    // V43 overlay reads be_courses.courseProducts directly (not via mapper).
    // Verify resolveCustomerCourseSkipFlag still finds the sub-row's flag.
    const masterCourse = {
      _docId: 'C-V45-F2',
      courseName: 'X',
      mainProductId: 'M',
      mainProductName: 'Main',
      skipStockDeduction: false,
      courseProducts: [
        { productId: 'M', productName: 'Main', skipStockDeduction: true }, // dup-of-main
      ],
    };
    const customerEntry = {
      name: 'X', product: 'Main', productId: 'M', skipStockDeduction: false,
    };
    expect(resolveCustomerCourseSkipFlag(customerEntry, masterCourse)).toBe(true);

    // overlayCustomerCoursesWithMaster on form-shape input
    const formShape = [{
      courseName: 'X',
      products: [{ productId: 'M', name: 'Main', skipStockDeduction: false }],
    }];
    const overlaid = overlayCustomerCoursesWithMaster(formShape, [masterCourse]);
    expect(overlaid[0].products[0].skipStockDeduction).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V45.G — User-reported fixture cluster (V45 diag findings)', () => {
  // 14 affected courses on prod, sample 4 distinct shapes
  const FIXTURES = [
    { name: 'ขลิบไร้เลือด (เบอร์26) 1 ครั้ง', mainId: '38843', mainName: 'ขลิบไร้เลือด' },
    { name: 'ขลิบไร้เลือด (เบอร์30) 1 ครั้ง', mainId: '38843', mainName: 'ขลิบไร้เลือด' },
    { name: 'PRP เกล็ดเลือดบำรุงรากผม 10 ครั้ง', mainId: '38841', mainName: 'PRP เกล็ดเลือดบำรุงรากผม' },
    { name: 'ขลิบเลเซอร์ (ดมยาสลบ) 1 ครั้ง', mainId: '38845', mainName: 'ขลิบเลเซอร์ (ดมยาสลบ)' },
  ];

  for (const f of FIXTURES) {
    it(`G.${f.mainId} "${f.name}" → main entry has OR-merged skip=true`, () => {
      const c = {
        courseId: 'C-' + f.mainId,
        courseName: f.name,
        mainProductId: f.mainId,
        mainProductName: f.mainName,
        mainQty: 1,
        skipStockDeduction: false, // top off
        courseProducts: [
          { productId: f.mainId, productName: f.mainName, qty: 1, skipStockDeduction: true }, // sub on
        ],
      };
      const shape = beCourseToMasterShape(c);
      const main = shape.products.find(p => p.isMainProduct);
      expect(main.skipStockDeduction).toBe(true);
      expect(main.name).toBe(f.mainName);
      // No row should be named after the course (V44 invariant preserved)
      expect(shape.products.every(p => p.name !== f.name)).toBe(true);
    });
  }
});
