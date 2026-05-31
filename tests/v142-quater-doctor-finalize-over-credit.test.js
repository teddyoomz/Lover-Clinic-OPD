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
// FIX: only run the reverse when the prior save ACTUALLY deducted — i.e. the loaded
// treatment status is NOT 'doctor-recorded'/'vitalsigns-recorded'. A completed
// treatment has its status cleared (deleteField) → loadedTreatmentStatus undefined →
// reverse runs (V142 edit-resave preserved). The doctor-save UI is gated on
// status==='doctor-recorded', so finalize→doctor→finalize cannot occur. AV164.

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
// Mirror of the TFP finalize course path WITH the V142-quater gate. Uses the REAL
// arithmetic (deductQty/reverseQty) + the REAL carry-forward helper + the gate.
function finalize(courses, { savedExisting = [], savedPurchased = [], freshExisting = [], freshPurchased = [], selected, loadedStatus }) {
  const priorSaveDeducted = loadedStatus !== 'doctor-recorded' && loadedStatus !== 'vitalsigns-recorded';
  let c = courses;
  if (priorSaveDeducted && savedExisting.length) c = applyReverse(c, savedExisting);
  if (priorSaveDeducted && savedPurchased.length) c = applyReverse(c, savedPurchased, { preferNewest: true });
  const existing = buildReDeductListWithCarryForward(freshExisting, savedExisting, selected);
  const purchased = buildReDeductListWithCarryForward(freshPurchased, savedPurchased, selected);
  if (existing.length) c = applyDeduct(c, existing);
  if (purchased.length) c = applyDeduct(c, purchased, { preferNewest: true });
  return c;
}

describe('V142-quater.B — over-credit fix (real arithmetic + real helper + the gate)', () => {
  it('B1 — ★ PHASE C: doctor selected a 4/5 course (persisted, NOT deducted) → finalize → 3/5 (NO over-credit)', () => {
    const courses = [{ name: 'PhysioY 5 ครั้ง', product: 'PhysioY', qty: '4 / 5 ครั้ง' }];
    const savedCI = [{ courseName: 'PhysioY 5 ครั้ง', productName: 'PhysioY', rowId: 'be-row-0', courseIndex: 0, deductQty: 1 }];
    const out = finalize(courses, { savedExisting: savedCI, freshExisting: savedCI, selected: new Set(['be-row-0']), loadedStatus: 'doctor-recorded' });
    expect(rem(out[0].qty)).toBe(3); // gate skips reverse → only the deduct applies
  });

  it('B2 — PRE-FIX repro: without the gate, the same scenario OVER-CREDITS to 4/5', () => {
    // loadedStatus undefined here forces priorSaveDeducted=true (= the pre-fix behavior)
    const courses = [{ name: 'PhysioY 5 ครั้ง', product: 'PhysioY', qty: '4 / 5 ครั้ง' }];
    const savedCI = [{ courseName: 'PhysioY 5 ครั้ง', productName: 'PhysioY', rowId: 'be-row-0', courseIndex: 0, deductQty: 1 }];
    const out = finalize(courses, { savedExisting: savedCI, freshExisting: savedCI, selected: new Set(['be-row-0']), loadedStatus: undefined });
    expect(rem(out[0].qty)).toBe(4); // reverse(4→5)+deduct(5→4) = over-credit (proves the gate is load-bearing)
  });

  it('B3 — PHASE A typical: doctor did NOT select; finalize deducts existing 5/5 → 4/5', () => {
    const courses = [{ name: 'PhysioX 5 ครั้ง', product: 'PhysioX', qty: '5 / 5 ครั้ง' }];
    const fresh = [{ courseName: 'PhysioX 5 ครั้ง', productName: 'PhysioX', rowId: 'be-row-0', courseIndex: 0, deductQty: 1 }];
    const out = finalize(courses, { savedExisting: [], freshExisting: fresh, selected: new Set(['be-row-0']), loadedStatus: 'doctor-recorded' });
    expect(rem(out[0].qty)).toBe(4);
  });

  it('B4 — vitalsigns-recorded prior status also skips the spurious reverse', () => {
    const courses = [{ name: 'CourseZ', product: 'CourseZ', qty: '2 / 3 ครั้ง' }];
    const savedCI = [{ courseName: 'CourseZ', productName: 'CourseZ', rowId: 'be-row-0', courseIndex: 0, deductQty: 1 }];
    const out = finalize(courses, { savedExisting: savedCI, freshExisting: savedCI, selected: new Set(['be-row-0']), loadedStatus: 'vitalsigns-recorded' });
    expect(rem(out[0].qty)).toBe(1); // 2 → 1 (deduct only)
  });

  it('B5 — V142 PRESERVED: completed treatment (status cleared/undefined) edit-resave → reverse RUNS + carry-forward holds 0/1', () => {
    const courses = [{ name: 'Testoviron 1 ครั้ง', product: 'Testoviron', qty: '0 / 1 ครั้ง' }];
    const savedCI = [{ courseName: 'Testoviron 1 ครั้ง', productName: 'Testoviron', rowId: 'purchased-1-row', courseIndex: 0, deductQty: 1 }];
    // freshPurchased=[] (rowId regenerated on reload) → carry-forward must re-apply after the reverse
    const out = finalize(courses, { savedPurchased: savedCI, freshPurchased: [], selected: new Set(['purchased-1-row']), loadedStatus: undefined });
    expect(rem(out[0].qty)).toBe(0); // reverse(0→1) + carry-forward deduct(1→0) = stays deducted
  });
});

describe('V142-quater.SG — source-grep: TFP reverse is gated on prior-save-deducted', () => {
  const tfp = readFileSync(path.resolve('src/components/TreatmentFormPage.jsx'), 'utf8');
  it('SG1 — priorSaveDeducted gate on loadedTreatmentStatus', () => {
    expect(tfp).toMatch(/const priorSaveDeducted = loadedTreatmentStatus !== 'doctor-recorded'\s*\n?\s*&& loadedTreatmentStatus !== 'vitalsigns-recorded'/);
  });
  it('SG2 — the reverse condition includes priorSaveDeducted', () => {
    expect(tfp).toMatch(/saveMode !== 'doctor' && saveMode !== 'vitals' && isEdit && priorSaveDeducted && \(oldExisting\.length > 0 \|\| oldPurchased\.length > 0\)/);
  });
  it('SG3 — V142-quater marker present', () => {
    expect(tfp).toMatch(/V142-quater[\s\S]{0,400}OVER-CREDIT/);
  });
});
