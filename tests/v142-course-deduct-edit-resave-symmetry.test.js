// V142 (2026-05-31) — edit-resave course-deduction SYMMETRY.
//
// User bug (real prod LC-26000115 / BT-1780203508072, verbatim):
//   "ซื้อแล้วตัดคอร์สเลย แล้วคอร์สมันไม่ตัดออกจากตัว ... เทสให้ครบทุกแบบ
//    ทั้งซื้อแล้วตัดเลย ซื้อแล้วยังไม่ตัด หรือสร้างเสร็จแล้วค่อยมา edit ตัดคอร์ส".
//
// be_course_changes recorded -1 (qtyAfter "0 / 1 ครั้ง") yet customer.courses
// stayed "1 / 1 ครั้ง" (full). Root cause: on EDIT-resave, handleSubmit reverses
// the prior deductions (oldPurchased, from existingCourseItems) but the fresh
// re-deduct serialization (backendDetail.courseItems) comes up EMPTY for
// purchased courses (in-session `purchased-…` rowIds regenerate to `be-row-N`
// → Pass-1 miss; productId stripped → Pass-2 skip; rem=0 → Pass-2 gate skip).
// REFUND-WITHOUT-REDEDUCT → balance reverts to full.
//
// Fix: buildReDeductListWithCarryForward re-applies every reversed deduction
// whose row is STILL selected, so reverse + re-deduct are symmetric.
//
// These tests use the REAL courseUtils arithmetic (deductQty / reverseQty /
// parseQtyString — the EXACT functions deductCourseItems/reverseCourseDeduction
// use) + the REAL helper, so the simulate cannot diverge from production.
// The TRUE-L2 proof on real prod is scripts/e2e-v142-edit-resave-course-deduct.mjs.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseQtyString, deductQty, reverseQty } from '../src/lib/courseUtils.js';
import {
  buildReDeductListWithCarryForward,
  isPurchasedSessionRowId,
  mapRawCoursesToForm,
} from '../src/lib/treatmentBuyHelpers.js';

const rem = (c) => parseQtyString(c.qty).remaining;
const matchesDed = (c, d) => {
  const nameMatch = d.courseName ? c.name === d.courseName : true;
  const productMatch = d.productName ? (c.product || c.name) === d.productName : true;
  return nameMatch && productMatch;
};
// Faithful mirror of deductCourseItems' customer.courses mutation (name+product
// match, preferNewest, only deduct rem>0; real deductQty arithmetic).
function applyDeductions(courses, deductions, { preferNewest = false } = {}) {
  const out = courses.map((c) => ({ ...c }));
  for (const d of deductions) {
    const order = preferNewest
      ? Array.from({ length: out.length }, (_, i) => out.length - 1 - i)
      : Array.from({ length: out.length }, (_, i) => i);
    for (const i of order) {
      if (!matchesDed(out[i], d)) continue;
      if (parseQtyString(out[i].qty).remaining > 0) {
        out[i] = { ...out[i], qty: deductQty(out[i].qty, d.deductQty || 1) };
        break;
      }
    }
  }
  return out;
}
// Faithful mirror of reverseCourseDeduction (real reverseQty arithmetic).
function applyReverse(courses, deductions, { preferNewest = false } = {}) {
  const out = courses.map((c) => ({ ...c }));
  for (const d of deductions) {
    const order = preferNewest
      ? Array.from({ length: out.length }, (_, i) => out.length - 1 - i)
      : Array.from({ length: out.length }, (_, i) => i);
    for (const i of order) {
      if (!matchesDed(out[i], d)) continue;
      out[i] = { ...out[i], qty: reverseQty(out[i].qty, d.deductQty || 1) };
      break;
    }
  }
  return out;
}

// Build the 3 purchased courses from the real-prod screenshot (LC-26000115).
function freshAssigned() {
  return [
    { name: 'Testoviron 1 ครั้ง', product: 'Testoviron', qty: '1 / 1 ครั้ง' },
    { name: 'ปรึกษาโรคทั่วไป (20นาที) 1 ครั้ง', product: 'ปรึกษาโรคทั่วไป (20นาที)', qty: '1 / 1 ครั้ง' },
    { name: 'เจาะเลือดตรวจสมมรถภาพ เบื้องต้น', product: 'ค่าบริการอ่านและแปลผลเลือด โดยแพทย์', qty: '1 / 1 ครั้ง' },
  ];
}
// The saved courseItems for those 3 = existingCourseItems on edit-reload
// (purchased session rowIds, like the real doc).
function purchasedCourseItems() {
  return freshAssigned().map((c, i) => ({
    courseName: c.name, productName: c.product, courseIndex: i,
    deductQty: 1, unit: 'ครั้ง', rowId: `purchased-${100 + i}-row-self`,
  }));
}

describe('V142.A — buildReDeductListWithCarryForward (pure helper / the fix core)', () => {
  it('A1 — old empty → returns fresh verbatim (create-mode-like)', () => {
    const fresh = [{ rowId: 'be-row-0', courseName: 'X', productName: 'X', deductQty: 1 }];
    expect(buildReDeductListWithCarryForward(fresh, [], new Set(['be-row-0']))).toEqual(fresh);
  });

  it('A2 — THE BUG: fresh=[], old=3 purchased, all selected → carries all 3', () => {
    const old = purchasedCourseItems();
    const selected = new Set(old.map((d) => d.rowId));
    const out = buildReDeductListWithCarryForward([], old, selected);
    expect(out).toHaveLength(3);
    expect(out.map((d) => d.productName).sort()).toEqual(
      ['Testoviron', 'ปรึกษาโรคทั่วไป (20นาที)', 'ค่าบริการอ่านและแปลผลเลือด โดยแพทย์'].sort(),
    );
  });

  it('A3 — fresh covers old by rowId → NOT double-carried', () => {
    const old = purchasedCourseItems();
    const fresh = [{ ...old[0] }]; // same rowId already in fresh
    const out = buildReDeductListWithCarryForward(fresh, old, new Set(old.map((d) => d.rowId)));
    expect(out).toHaveLength(3); // 1 fresh + 2 carried (NOT 4)
    expect(out.filter((d) => d.rowId === old[0].rowId)).toHaveLength(1);
  });

  it('A4 — fresh covers old by courseName+productName (different rowId) → NOT double-carried', () => {
    const old = purchasedCourseItems();
    const fresh = [{ rowId: 'be-row-0', courseName: old[0].courseName, productName: old[0].productName, deductQty: 1 }];
    const out = buildReDeductListWithCarryForward(fresh, old, new Set(old.map((d) => d.rowId)));
    expect(out).toHaveLength(3); // course[0] covered by name+product → 1 fresh + 2 carried
    expect(out.filter((d) => d.productName === old[0].productName)).toHaveLength(1);
  });

  it('A5 — old row NOT selected (user un-checked) → dropped (not carried)', () => {
    const old = purchasedCourseItems();
    const selected = new Set([old[1].rowId, old[2].rowId]); // course 0 un-checked
    const out = buildReDeductListWithCarryForward([], old, selected);
    expect(out).toHaveLength(2);
    expect(out.some((d) => d.rowId === old[0].rowId)).toBe(false);
  });

  it('A6 — mixed: some fresh, some carried, some unselected', () => {
    const old = purchasedCourseItems(); // 3 purchased
    const fresh = [{ rowId: 'be-row-9', courseName: old[0].courseName, productName: old[0].productName, deductQty: 1 }]; // covers 0
    const selected = new Set([old[0].rowId, old[1].rowId]); // 2 unchecked-out (course 2 dropped)
    const out = buildReDeductListWithCarryForward(fresh, old, selected);
    // fresh(1) + carry course1 (selected, not covered) ; course0 covered ; course2 not selected
    expect(out).toHaveLength(2);
  });

  it('A7 — adversarial: null / undefined / non-array / Array selectedRowIds / empty', () => {
    expect(buildReDeductListWithCarryForward(null, null, null)).toEqual([]);
    expect(buildReDeductListWithCarryForward(undefined, undefined, undefined)).toEqual([]);
    expect(buildReDeductListWithCarryForward('x', 'y', 'z')).toEqual([]);
    // Array (not Set) selectedRowIds is accepted
    const old = purchasedCourseItems();
    const outArr = buildReDeductListWithCarryForward([], old, old.map((d) => d.rowId));
    expect(outArr).toHaveLength(3);
    // old entry with null rowId never carried (selected.has(undefined) false)
    expect(buildReDeductListWithCarryForward([], [{ courseName: 'X', deductQty: 1 }], new Set())).toEqual([]);
  });
});

describe('V142.C — Rule I full-flow simulate (real arithmetic + real helper)', () => {
  it('C1 — ซื้อแล้วตัดเลย then EDIT-RESAVE: OLD logic REVERTS (bug), V142 HOLDS', () => {
    // Save 1 — assign 3 full + deduct purchased → rem 0 (matches save-1 audit "0/1")
    let courses = freshAssigned();
    const purchased = purchasedCourseItems();
    courses = applyDeductions(courses, purchased, { preferNewest: true });
    expect(courses.every((c) => rem(c) === 0)).toBe(true);

    // Edit-reload: existingCourseItems = purchased; live courses get be-row-N
    // rowIds → fresh serialization for purchased = [] (real-prod fact).
    const freshPurchased = [];
    const oldPurchased = purchased;
    const selected = new Set(oldPurchased.map((d) => d.rowId)); // restored from courseItems (line 1157)

    // OLD logic (pre-V142): reverse(old) + deduct(freshPurchased=[])
    let oldFlow = applyReverse(courses, oldPurchased, { preferNewest: true });
    oldFlow = applyDeductions(oldFlow, freshPurchased, { preferNewest: true });
    expect(oldFlow.every((c) => rem(c) === 1)).toBe(true); // 🐛 reverted to FULL

    // V142 logic: reverse(old) + deduct(carry-forward)
    const reDeduct = buildReDeductListWithCarryForward(freshPurchased, oldPurchased, selected);
    expect(reDeduct).toHaveLength(3);
    let v142 = applyReverse(courses, oldPurchased, { preferNewest: true });
    v142 = applyDeductions(v142, reDeduct, { preferNewest: true });
    expect(v142.every((c) => rem(c) === 0)).toBe(true); // ✅ stays DEDUCTED
  });

  it('C2 — ซื้อแล้วยังไม่ตัด: course stays full across edits (no accidental deduct)', () => {
    let courses = freshAssigned(); // assigned, NEVER deducted
    expect(courses.every((c) => rem(c) === 1)).toBe(true);
    // edit-reload: nothing was deducted → existingCourseItems=[], selected=∅
    const reDeduct = buildReDeductListWithCarryForward([], [], new Set());
    expect(reDeduct).toEqual([]);
    let edited = applyReverse(courses, [], { preferNewest: true });
    edited = applyDeductions(edited, reDeduct, { preferNewest: true });
    expect(edited.every((c) => rem(c) === 1)).toBe(true); // stays full ✓
  });

  it('C3 — สร้างเสร็จแล้วค่อย edit ตัดคอร์ส (existing course, be-row): deduct + stays deducted on 2nd edit', () => {
    let courses = [{ name: 'CourseX', product: 'ProdX', qty: '5 / 5 ครั้ง' }];
    // 1st edit — mark course used; live course → be-row-0 → fresh serializes
    const fresh = [{ courseName: 'CourseX', productName: 'ProdX', courseIndex: 0, deductQty: 1, rowId: 'be-row-0' }];
    const selected = new Set(['be-row-0']);
    const re1 = buildReDeductListWithCarryForward(fresh, [], selected); // create-of-deduction; oldExisting=[]
    expect(re1).toEqual(fresh);
    courses = applyDeductions(courses, re1, {});
    expect(rem(courses[0])).toBe(4);
    // 2nd edit — existingCourseItems = fresh (be-row-0); idx stable → fresh2 = fresh (covered)
    const fresh2 = fresh, old2 = fresh;
    const re2 = buildReDeductListWithCarryForward(fresh2, old2, selected);
    let c2 = applyReverse(courses, old2, {}); // 4→5
    c2 = applyDeductions(c2, re2, {}); // 5→4
    expect(rem(c2[0])).toBe(4); // stays deducted ✓
  });

  it('C4 — multi-edit (5 resaves) of a purchased+used treatment: NO drift', () => {
    let courses = applyDeductions(freshAssigned(), purchasedCourseItems(), { preferNewest: true }); // rem 0
    const oldPurchased = purchasedCourseItems();
    const selected = new Set(oldPurchased.map((d) => d.rowId));
    for (let edit = 0; edit < 5; edit++) {
      const reDeduct = buildReDeductListWithCarryForward([], oldPurchased, selected);
      courses = applyReverse(courses, oldPurchased, { preferNewest: true });
      courses = applyDeductions(courses, reDeduct, { preferNewest: true });
      expect(courses.every((c) => rem(c) === 0)).toBe(true); // always deducted
    }
  });

  it('C5 — edit + un-check one course → that one is un-deducted, others stay deducted', () => {
    let courses = applyDeductions(freshAssigned(), purchasedCourseItems(), { preferNewest: true }); // rem 0
    const oldPurchased = purchasedCourseItems();
    const selected = new Set([oldPurchased[1].rowId, oldPurchased[2].rowId]); // un-check course 0
    const reDeduct = buildReDeductListWithCarryForward([], oldPurchased, selected);
    expect(reDeduct).toHaveLength(2);
    courses = applyReverse(courses, oldPurchased, { preferNewest: true }); // all 0→1
    courses = applyDeductions(courses, reDeduct, { preferNewest: true });
    expect(rem(courses[0])).toBe(1); // un-checked → un-deducted (correct)
    expect(rem(courses[1])).toBe(0);
    expect(rem(courses[2])).toBe(0);
  });

  it('C6 — existing course with array REORDER (be-row idx shifted) → Pass-1 miss → carry-forward rescues', () => {
    // course was at idx 0 (be-row-0) when deducted; a new course inserted at front on reload → now idx 1
    let courses = [
      { name: 'NewlyAdded', product: 'NewlyAdded', qty: '2 / 2 ครั้ง' }, // inserted at 0
      { name: 'CourseX', product: 'ProdX', qty: '0 / 1 ครั้ง' },         // was idx 0, deducted → rem 0
    ];
    const oldExisting = [{ courseName: 'CourseX', productName: 'ProdX', courseIndex: 0, deductQty: 1, rowId: 'be-row-0' }];
    const selected = new Set(['be-row-0']); // restored from saved courseItems
    const freshExisting = []; // be-row-0 no longer matches CourseX (now be-row-1) → Pass-1 miss
    const reDeduct = buildReDeductListWithCarryForward(freshExisting, oldExisting, selected);
    expect(reDeduct).toHaveLength(1); // carried forward
    courses = applyReverse(courses, oldExisting, { preferNewest: true }); // CourseX 0→1
    courses = applyDeductions(courses, reDeduct, { preferNewest: true }); // CourseX 1→0
    expect(rem(courses[1])).toBe(0); // CourseX stays deducted ✓
    expect(rem(courses[0])).toBe(2); // NewlyAdded untouched
  });
});

describe('V142.D — premise proof: purchased rowIds regenerate to be-row-N', () => {
  it('D1 — mapRawCoursesToForm emits be-row-N rowIds (NOT purchased-…)', () => {
    const form = mapRawCoursesToForm([
      { name: 'Testoviron 1 ครั้ง', product: 'Testoviron', qty: '1 / 1 ครั้ง', courseType: 'มาตรฐาน' },
    ]);
    const allRowIds = form.flatMap((c) => (c.products || []).map((p) => p.rowId));
    expect(allRowIds.length).toBeGreaterThan(0);
    for (const rid of allRowIds) {
      expect(rid).toMatch(/^be-row-/);
      expect(isPurchasedSessionRowId(rid)).toBe(false);
    }
  });

  it('D2 — in-session purchased rowIds ARE purchased (so Pass-1 by-rowId can never match the regenerated be-row-N)', () => {
    expect(isPurchasedSessionRowId('purchased-100-row-self')).toBe(true);
    expect(isPurchasedSessionRowId('be-row-0')).toBe(false);
  });
});

describe('V142.B — source-grep regression (TFP wires the symmetric re-deduct)', () => {
  const tfp = readFileSync(path.resolve('src/components/TreatmentFormPage.jsx'), 'utf8');
  const helper = readFileSync(path.resolve('src/lib/treatmentBuyHelpers.js'), 'utf8');

  it('B1 — TFP imports buildReDeductListWithCarryForward', () => {
    expect(tfp).toMatch(/import\s*\{[^}]*buildReDeductListWithCarryForward[^}]*\}\s*from\s*'\.\.\/lib\/treatmentBuyHelpers\.js'/);
  });
  it('B2 — existingDeductions uses isEdit ? buildReDeductListWithCarryForward : freshExisting', () => {
    expect(tfp).toMatch(/const existingDeductions = isEdit\s*\n?\s*\?\s*buildReDeductListWithCarryForward\(freshExisting, oldExisting, selectedCourseItems\)\s*\n?\s*:\s*freshExisting/);
  });
  it('B3 — purchasedDeductions uses isEdit ? buildReDeductListWithCarryForward : freshPurchased', () => {
    expect(tfp).toMatch(/const purchasedDeductions = isEdit\s*\n?\s*\?\s*buildReDeductListWithCarryForward\(freshPurchased, oldPurchased, selectedCourseItems\)\s*\n?\s*:\s*freshPurchased/);
  });
  it('B4 — helper exists in treatmentBuyHelpers with V142 marker + invariant doc', () => {
    expect(helper).toMatch(/export function buildReDeductListWithCarryForward\(/);
    expect(helper).toMatch(/V142/);
    expect(helper).toMatch(/REFUND-WITHOUT-REDEDUCT/);
  });
  it('B5 — anti-regression: the raw `const existingDeductions = (backendDetail.courseItems` direct filter is GONE (replaced by freshExisting + helper)', () => {
    expect(tfp).not.toMatch(/const existingDeductions = \(backendDetail\.courseItems \|\| \[\]\)\.filter/);
    expect(tfp).not.toMatch(/const purchasedDeductions = \(backendDetail\.courseItems \|\| \[\]\)\.filter/);
    // and freshExisting/freshPurchased are now the source
    expect(tfp).toMatch(/const freshExisting = \(backendDetail\.courseItems \|\| \[\]\)\.filter\(ci => !isPurchasedSessionRowId/);
    expect(tfp).toMatch(/const freshPurchased = \(backendDetail\.courseItems \|\| \[\]\)\.filter\(ci => isPurchasedSessionRowId/);
  });
});
