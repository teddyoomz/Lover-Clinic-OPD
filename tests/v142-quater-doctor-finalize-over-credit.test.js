// V142-quater (2026-05-31) — doctor→finalize course OVER-CREDIT fix.
//
// User-found scenario (verbatim): "admin ลงซักประวัติ แล้วแพทย์ลงบันทึก แล้ว admin
// ค่อยมากดแก้ไขแล้วตัดคอร์สที่มี / หรือ ซื้อคอร์สแล้วตัดเลย … เทสหรือยังว่ามันตัดจริงลดจริง".
//
// BUG (confirmed by scripts/e2e-v142ter-doctor-finalize-course-deduct.mjs PHASE C):
// a doctor/vitals save PERSISTS courseItems (the V101 serialization runs) but SKIPS
// the deduct (saveMode gate). When the admin FINALIZES a treatment whose LAST save
// was doctor/vitals, `existingCourseItems` carries courses that were NEVER deducted —
// reverseCourseDeduction refunds a deduction that never happened, then the finalize
// re-deducts → NET the course balance does NOT drop (over-credit, e.g. 4/5 stays 4/5).
//
// V142-quater's original fix used a status heuristic (priorSaveDeducted = status !==
// doctor/vitals) and ASSERTED "finalize→doctor→finalize cannot occur (doctor UI gated
// on status)". That was FALSE (doctor button is always-shown) → the heuristic caused a
// DOUBLE-DEDUCT on finalize→doctor→finalize. **V142-quinquies SUPERSEDES the heuristic**
// with a persisted `_courseDeducted` flag → priorSaveDeducted = loadedCourseDeducted.
// This file now tests the OVER-CREDIT invariant via the flag (B1/B3/B4: a course
// selected-but-NOT-deducted by doctor/vitals → flag false → no spurious reverse → no
// over-credit; B5: a real deduction → flag true → reverse → V142). See AV164 + AV165
// + tests/v142-quinquies-finalize-doctor-finalize-double-deduct.test.js for the
// double-deduct fix.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseQtyString, deductQty, reverseQty } from '../src/lib/courseUtils.js';
import { buildReDeductListWithCarryForward, isPurchasedSessionRowId } from '../src/lib/treatmentBuyHelpers.js';

const rem = (q) => parseQtyString(q).remaining;
const matchesDed = (c, d) => (d.courseName ? c.name === d.courseName : true) && (d.productName ? (c.product || c.name) === d.productName : true);
function applyDeduct(courses, deds, { preferNewest = false } = {}) {
  const out = courses.map(c => ({ ...c }));
  for (const d of deds) {
    const order = preferNewest ? [...out.keys()].reverse() : [...out.keys()];
    for (const i of order) { if (matchesDed(out[i], d) && parseQtyString(out[i].qty).remaining > 0) { out[i] = { ...out[i], qty: deductQty(out[i].qty, d.deductQty || 1) }; break; } }
  }
  return out;
}
function applyReverse(courses, deds, { preferNewest = false } = {}) {
  const out = courses.map(c => ({ ...c }));
  for (const d of deds) {
    const order = preferNewest ? [...out.keys()].reverse() : [...out.keys()];
    for (const i of order) { if (matchesDed(out[i], d)) { out[i] = { ...out[i], qty: reverseQty(out[i].qty, d.deductQty || 1) }; break; } }
  }
  return out;
}
// Mirror of the TFP finalize course path WITH the V142-quinquies flag gate. Uses the
// REAL arithmetic (deductQty/reverseQty) + the REAL carry-forward helper. The reverse
// runs iff loadedCourseDeducted (the persisted flag) — NOT the old status heuristic.
function finalize(courses, { savedExisting = [], savedPurchased = [], freshExisting = [], freshPurchased = [], selected, loadedCourseDeducted }) {
  const priorSaveDeducted = loadedCourseDeducted;
  let c = courses;
  if (priorSaveDeducted && savedExisting.length) c = applyReverse(c, savedExisting);
  if (priorSaveDeducted && savedPurchased.length) c = applyReverse(c, savedPurchased, { preferNewest: true });
  const existing = buildReDeductListWithCarryForward(freshExisting, savedExisting, selected);
  const purchased = buildReDeductListWithCarryForward(freshPurchased, savedPurchased, selected);
  if (existing.length) c = applyDeduct(c, existing);
  if (purchased.length) c = applyDeduct(c, purchased, { preferNewest: true });
  return c;
}

describe('V142-quater.B — over-credit invariant (real arithmetic + real helper + the V142-quinquies flag)', () => {
  it('B1 — ★ PHASE C: doctor selected a 4/5 course (NEVER deducted → flag false) → finalize → 3/5 (NO over-credit)', () => {
    const courses = [{ name: 'PhysioY 5 ครั้ง', product: 'PhysioY', qty: '4 / 5 ครั้ง' }];
    const savedCI = [{ courseName: 'PhysioY 5 ครั้ง', productName: 'PhysioY', rowId: 'be-row-0', courseIndex: 0, deductQty: 1 }];
    const out = finalize(courses, { savedExisting: savedCI, freshExisting: savedCI, selected: new Set(['be-row-0']), loadedCourseDeducted: false });
    expect(rem(out[0].qty)).toBe(3); // flag false → skip reverse → only the deduct applies
  });

  it('B2 — load-bearing proof: if the flag were WRONGLY true, the same scenario OVER-CREDITS to 4/5', () => {
    // loadedCourseDeducted=true forces priorSaveDeducted=true on a non-deduction (= the bug shape)
    const courses = [{ name: 'PhysioY 5 ครั้ง', product: 'PhysioY', qty: '4 / 5 ครั้ง' }];
    const savedCI = [{ courseName: 'PhysioY 5 ครั้ง', productName: 'PhysioY', rowId: 'be-row-0', courseIndex: 0, deductQty: 1 }];
    const out = finalize(courses, { savedExisting: savedCI, freshExisting: savedCI, selected: new Set(['be-row-0']), loadedCourseDeducted: true });
    expect(rem(out[0].qty)).toBe(4); // reverse(4→5)+deduct(5→4) = over-credit (proves the flag is load-bearing)
  });

  it('B3 — PHASE A typical: doctor did NOT select; finalize deducts existing 5/5 → 4/5', () => {
    const courses = [{ name: 'PhysioX 5 ครั้ง', product: 'PhysioX', qty: '5 / 5 ครั้ง' }];
    const fresh = [{ courseName: 'PhysioX 5 ครั้ง', productName: 'PhysioX', rowId: 'be-row-0', courseIndex: 0, deductQty: 1 }];
    const out = finalize(courses, { savedExisting: [], freshExisting: fresh, selected: new Set(['be-row-0']), loadedCourseDeducted: false });
    expect(rem(out[0].qty)).toBe(4);
  });

  it('B4 — vitals-recorded prior (flag false) also skips the spurious reverse', () => {
    const courses = [{ name: 'CourseZ', product: 'CourseZ', qty: '2 / 3 ครั้ง' }];
    const savedCI = [{ courseName: 'CourseZ', productName: 'CourseZ', rowId: 'be-row-0', courseIndex: 0, deductQty: 1 }];
    const out = finalize(courses, { savedExisting: savedCI, freshExisting: savedCI, selected: new Set(['be-row-0']), loadedCourseDeducted: false });
    expect(rem(out[0].qty)).toBe(1); // 2 → 1 (deduct only)
  });

  it('B5 — V142 PRESERVED: completed treatment (flag true) edit-resave → reverse RUNS + carry-forward holds 0/1', () => {
    const courses = [{ name: 'Testoviron 1 ครั้ง', product: 'Testoviron', qty: '0 / 1 ครั้ง' }];
    const savedCI = [{ courseName: 'Testoviron 1 ครั้ง', productName: 'Testoviron', rowId: 'purchased-1-row', courseIndex: 0, deductQty: 1 }];
    // freshPurchased=[] (rowId regenerated on reload) → carry-forward must re-apply after the reverse
    const out = finalize(courses, { savedPurchased: savedCI, freshPurchased: [], selected: new Set(['purchased-1-row']), loadedCourseDeducted: true });
    expect(rem(out[0].qty)).toBe(0); // reverse(0→1) + carry-forward deduct(1→0) = stays deducted
  });
});

describe('V142-quater.SG — source-grep: TFP reverse is gated on the persisted flag (V142-quinquies)', () => {
  const tfp = readFileSync(path.resolve('src/components/TreatmentFormPage.jsx'), 'utf8');
  it('SG1 — priorSaveDeducted = loadedCourseDeducted (flag, not the dropped status heuristic)', () => {
    expect(tfp).toMatch(/const priorSaveDeducted = loadedCourseDeducted;/);
    expect(tfp).not.toMatch(/priorSaveDeducted = loadedTreatmentStatus !== 'doctor-recorded'/);
  });
  it('SG2 — the reverse condition includes priorSaveDeducted', () => {
    expect(tfp).toMatch(/saveMode !== 'doctor' && saveMode !== 'vitals' && isEdit && priorSaveDeducted && \(oldExisting\.length > 0 \|\| oldPurchased\.length > 0\)/);
  });
  it('SG3 — V142-quater + V142-quinquies markers present', () => {
    expect(tfp).toMatch(/V142-quater[\s\S]{0,500}OVER-CREDIT/);
    expect(tfp).toMatch(/V142-quinquies[\s\S]{0,400}ROOT-CAUSE/);
  });
});
