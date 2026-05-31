// V142-quinquies (2026-05-31) — finalize→doctor→finalize DOUBLE-DEDUCT fix.
//
// User directive: "ปุ่มบันทึกสำหรับแพทย์ ไม่ต้องบันทึกพวกข้อมูลการตัดคอร์สนะ ที่จะบันทึก
// ตัดคอร์สด้วยจะเป็นบันทึกด้านล่างของ TFP" + "จะทำข้ามขั้นตอนไปมายังไง … ข้อมูลก็ต้อง
// ถูกต้องทุกครั้ง".
//
// BUG (confirmed on real prod by scripts/diag-finalize-doctor-finalize-double-deduct.mjs
// R1/R2 → 3/5): the doctor-save button is "always shown" (Phase 27.2-bis), so a COMPLETED
// (already-deducted) treatment can be re-saved as doctor (status→'doctor-recorded') then
// finalized again. The V142-quater `priorSaveDeducted = status !== doctor/vitals` heuristic
// reads 'doctor-recorded' → priorSaveDeducted FALSE → reverse SKIPPED → re-deduct → the
// course is deducted TWICE for ONE use (customer loses a session they never used).
//
// ROOT CAUSE: the status heuristic can't distinguish "never deducted" (vitals→doctor→
// finalize) from "deducted then doctor-rerecorded" (finalize→doctor→finalize) — both show
// 'doctor-recorded'. FIX: a persisted `_courseDeducted` flag — set by the deducting
// (bottom) save, PRESERVED by course-neutral doctor/vitals saves (Part A: they also stop
// writing courseItems) → priorSaveDeducted = loadedCourseDeducted, independent of status
// flips. AV165.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseQtyString, deductQty, reverseQty } from '../src/lib/courseUtils.js';
import { buildReDeductListWithCarryForward, isPurchasedSessionRowId } from '../src/lib/treatmentBuyHelpers.js';

const rem = (q) => parseQtyString(q).remaining;
const md = (c, d) => (d.courseName ? c.name === d.courseName : true) && (d.productName ? (c.product || c.name) === d.productName : true);
const applyDeduct = (cs, deds, { preferNewest = false } = {}) => { const o = cs.map(c => ({ ...c })); for (const d of deds) { const ord = preferNewest ? [...o.keys()].reverse() : [...o.keys()]; for (const i of ord) if (md(o[i], d) && parseQtyString(o[i].qty).remaining > 0) { o[i] = { ...o[i], qty: deductQty(o[i].qty, d.deductQty || 1) }; break; } } return o; };
const applyReverse = (cs, deds, { preferNewest = false } = {}) => { const o = cs.map(c => ({ ...c })); for (const d of deds) { const ord = preferNewest ? [...o.keys()].reverse() : [...o.keys()]; for (const i of ord) if (md(o[i], d)) { o[i] = { ...o[i], qty: reverseQty(o[i].qty, d.deductQty || 1) }; break; } } return o; };

// FLAG state-machine mirror of TFP.handleSubmit course path (V142-quinquies). Returns
// { courses, savedCI, courseDeducted } so multi-step flows thread the persisted flag.
function applySave(courses, { saveMode = 'staff', isEdit = false, savedCI = [], selected, fresh = [], loadedCourseDeducted = false }) {
  const isCourseNeutral = saveMode === 'doctor' || saveMode === 'vitals';
  const deductGate = !isCourseNeutral;
  const courseItems = isCourseNeutral ? savedCI : fresh;                       // Part A: neutral preserves savedCI
  const freshExisting = courseItems.filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const freshPurchased = courseItems.filter(ci => isPurchasedSessionRowId(ci.rowId));
  const oldExisting = savedCI.filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const oldPurchased = savedCI.filter(ci => isPurchasedSessionRowId(ci.rowId));
  const priorSaveDeducted = loadedCourseDeducted;                              // Part B: flag, not status
  const existingDed = isEdit ? buildReDeductListWithCarryForward(freshExisting, oldExisting, selected) : freshExisting;
  const purchasedDed = isEdit ? buildReDeductListWithCarryForward(freshPurchased, oldPurchased, selected) : freshPurchased;
  let c = courses;
  if (deductGate && isEdit && priorSaveDeducted) { if (oldExisting.length) c = applyReverse(c, oldExisting); if (oldPurchased.length) c = applyReverse(c, oldPurchased, { preferNewest: true }); }
  if (deductGate && existingDed.length) c = applyDeduct(c, existingDed);
  if (deductGate && purchasedDed.length) c = applyDeduct(c, purchasedDed, { preferNewest: true });
  const courseDeducted = isCourseNeutral ? loadedCourseDeducted : (existingDed.length > 0 || purchasedDed.length > 0);
  return { courses: c, savedCI: courseItems, courseDeducted };
}
// Pre-fix HEURISTIC mirror (status-based) — used ONLY to reproduce the double-deduct.
function saveHeuristic(courses, { saveMode = 'staff', isEdit = false, savedCI = [], selected, fresh = [], loadedStatus }) {
  const isNeutral = saveMode === 'doctor' || saveMode === 'vitals';
  const deductGate = !isNeutral;
  const courseItems = fresh; // pre-fix: ALL modes re-serialized
  const oldExisting = savedCI.filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const priorSaveDeducted = loadedStatus !== 'doctor-recorded' && loadedStatus !== 'vitalsigns-recorded';
  const existingDed = isEdit ? buildReDeductListWithCarryForward(courseItems.filter(ci => !isPurchasedSessionRowId(ci.rowId)), oldExisting, selected) : courseItems;
  let c = courses;
  if (deductGate && isEdit && priorSaveDeducted && oldExisting.length) c = applyReverse(c, oldExisting);
  if (deductGate && existingDed.length) c = applyDeduct(c, existingDed);
  return { courses: c, savedCI: isNeutral ? courseItems : courseItems, statusAfter: saveMode === 'doctor' ? 'doctor-recorded' : saveMode === 'vitals' ? 'vitalsigns-recorded' : undefined };
}

const CI = [{ courseName: 'PhysioH 5 ครั้ง', productName: 'PhysioH', rowId: 'be-row-0', courseIndex: 0, deductQty: 1 }];
const start5 = () => [{ name: 'PhysioH 5 ครั้ง', product: 'PhysioH', qty: '5 / 5 ครั้ง' }];

describe('V142-quinquies.F — flag state-machine: go-backward flows stay correct', () => {
  it('F1 — ★★★ finalize → DOCTOR → finalize STAYS 4/5 (no double-deduct)', () => {
    let st = applySave(start5(), { saveMode: 'staff', fresh: CI, selected: new Set(['be-row-0']) });
    expect(rem(st.courses[0].qty)).toBe(4); expect(st.courseDeducted).toBe(true);
    st = applySave(st.courses, { saveMode: 'doctor', isEdit: true, savedCI: st.savedCI, fresh: CI, selected: new Set(['be-row-0']), loadedCourseDeducted: st.courseDeducted });
    expect(rem(st.courses[0].qty)).toBe(4); expect(st.courseDeducted).toBe(true); // doctor neutral: unchanged + flag preserved
    st = applySave(st.courses, { saveMode: 'staff', isEdit: true, savedCI: st.savedCI, fresh: CI, selected: new Set(['be-row-0']), loadedCourseDeducted: st.courseDeducted });
    expect(rem(st.courses[0].qty)).toBe(4); // ★ reverse ran (flag true) → net 4/5, NOT 3/5
  });

  it('F2 — ★★★ finalize → VITALS → finalize STAYS 4/5', () => {
    let st = applySave(start5(), { saveMode: 'staff', fresh: CI, selected: new Set(['be-row-0']) });
    st = applySave(st.courses, { saveMode: 'vitals', isEdit: true, savedCI: st.savedCI, fresh: CI, selected: new Set(['be-row-0']), loadedCourseDeducted: st.courseDeducted });
    st = applySave(st.courses, { saveMode: 'staff', isEdit: true, savedCI: st.savedCI, fresh: CI, selected: new Set(['be-row-0']), loadedCourseDeducted: st.courseDeducted });
    expect(rem(st.courses[0].qty)).toBe(4);
  });

  it('F3 — PRE-FIX HEURISTIC repro: the SAME flow DOUBLE-DEDUCTS to 3/5 (proves the fix is load-bearing)', () => {
    let st = saveHeuristic(start5(), { saveMode: 'staff', fresh: CI, selected: new Set(['be-row-0']) });
    expect(rem(st.courses[0].qty)).toBe(4);
    st = saveHeuristic(st.courses, { saveMode: 'doctor', isEdit: true, savedCI: st.savedCI, fresh: CI, selected: new Set(['be-row-0']), loadedStatus: undefined });
    st = saveHeuristic(st.courses, { saveMode: 'staff', isEdit: true, savedCI: st.savedCI, fresh: CI, selected: new Set(['be-row-0']), loadedStatus: st.statusAfter });
    expect(rem(st.courses[0].qty)).toBe(3); // heuristic: status='doctor-recorded' → no reverse → DOUBLE-DEDUCT
  });

  it('F4 — V142-quater PRESERVED: vitals → doctor → finalize = 4/5 (no over-credit)', () => {
    let st = applySave(start5(), { saveMode: 'vitals', fresh: CI, selected: new Set(['be-row-0']) });
    expect(rem(st.courses[0].qty)).toBe(5); expect(st.courseDeducted).toBe(false); // neutral: never deducted, flag false
    st = applySave(st.courses, { saveMode: 'doctor', isEdit: true, savedCI: st.savedCI, fresh: CI, selected: new Set(['be-row-0']), loadedCourseDeducted: st.courseDeducted });
    expect(st.courseDeducted).toBe(false);
    st = applySave(st.courses, { saveMode: 'staff', isEdit: true, savedCI: st.savedCI, fresh: CI, selected: new Set(['be-row-0']), loadedCourseDeducted: st.courseDeducted });
    expect(rem(st.courses[0].qty)).toBe(4); // flag false → no reverse → deduct once
  });

  it('F5 — V142 PRESERVED: finalize → edit-finalize (completed) = 4/5 (no revert/double)', () => {
    let st = applySave(start5(), { saveMode: 'staff', fresh: CI, selected: new Set(['be-row-0']) });
    st = applySave(st.courses, { saveMode: 'staff', isEdit: true, savedCI: st.savedCI, fresh: CI, selected: new Set(['be-row-0']), loadedCourseDeducted: st.courseDeducted });
    expect(rem(st.courses[0].qty)).toBe(4);
  });

  it('F6 — purchased-course go-backward: buy(0/1) → doctor → finalize STAYS 0/1', () => {
    const courses = [{ name: 'Testo 1 ครั้ง', product: 'Testo', qty: '0 / 1 ครั้ง' }];
    const pCI = [{ courseName: 'Testo 1 ครั้ง', productName: 'Testo', rowId: 'purchased-1-row', courseIndex: 0, deductQty: 1 }];
    // already finalized (0/1, flag true); doctor-save preserves; re-finalize must not double-deduct (already 0)
    let st = applySave(courses, { saveMode: 'doctor', isEdit: true, savedCI: pCI, fresh: pCI, selected: new Set(['purchased-1-row']), loadedCourseDeducted: true });
    expect(st.courseDeducted).toBe(true);
    st = applySave(st.courses, { saveMode: 'staff', isEdit: true, savedCI: st.savedCI, fresh: [], selected: new Set(['purchased-1-row']), loadedCourseDeducted: st.courseDeducted });
    expect(rem(st.courses[0].qty)).toBe(0); // reverse(0→1) + carry-forward(1→0) = stays 0/1
  });
});

// mulberry32 deterministic PRNG (no Math.random — reproducible)
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

describe('V142-quinquies.FUZZ — randomized save sequences vs INDEPENDENT conservation reference', () => {
  // INDEPENDENT reference (does NOT reference the flag mechanism): after any sequence,
  // a single course is deducted by deductQty IFF the MOST RECENT deducting (staff/course)
  // save had it selected; doctor/vitals never change the balance. If the flag state-machine
  // (applySave) diverges from this on ANY random sequence → a bug the hand-crafted phases missed.
  it('FZ1 — 200 random sequences: flag state-machine == conservation reference', () => {
    const rng = mulberry32(0x5EED42);
    const MODES = ['staff', 'doctor', 'vitals', 'course'];
    let checked = 0;
    for (let s = 0; s < 200; s++) {
      let courses = start5();
      let savedCI = []; let flag = false; let refSelectedAtLastDeduct = false;
      const len = 2 + Math.floor(rng() * 5); // 2-6 saves
      for (let k = 0; k < len; k++) {
        const saveMode = k === 0 ? 'staff' : MODES[Math.floor(rng() * MODES.length)];
        const selected = rng() < 0.7;
        if (saveMode === 'staff' || saveMode === 'course') refSelectedAtLastDeduct = selected;
        const st = applySave(courses, { saveMode, isEdit: k > 0, savedCI, fresh: selected ? CI : [], selected: new Set(selected ? ['be-row-0'] : []), loadedCourseDeducted: flag });
        courses = st.courses; savedCI = st.savedCI; flag = st.courseDeducted;
      }
      const expected = 5 - (refSelectedAtLastDeduct ? 1 : 0);
      expect(rem(courses[0].qty), `seed-seq ${s}`).toBe(expected);
      checked++;
    }
    expect(checked).toBe(200);
  });

  it('FZ2 — go-backward stress: N doctor/vitals saves between two finalizes never drift', () => {
    for (let n = 1; n <= 8; n++) {
      let courses = start5();
      let st = applySave(courses, { saveMode: 'staff', fresh: CI, selected: new Set(['be-row-0']) });
      for (let i = 0; i < n; i++) st = applySave(st.courses, { saveMode: i % 2 ? 'vitals' : 'doctor', isEdit: true, savedCI: st.savedCI, fresh: CI, selected: new Set(['be-row-0']), loadedCourseDeducted: st.courseDeducted });
      st = applySave(st.courses, { saveMode: 'staff', isEdit: true, savedCI: st.savedCI, fresh: CI, selected: new Set(['be-row-0']), loadedCourseDeducted: st.courseDeducted });
      expect(rem(st.courses[0].qty), `${n} neutral saves between finalizes`).toBe(4); // exactly 1 deduction regardless of N
    }
  });
});

describe('V142-quinquies.SG — source-grep: TFP implements Part A + Part B', () => {
  const tfp = readFileSync(path.resolve('src/components/TreatmentFormPage.jsx'), 'utf8');
  it('SG1 — Part A: doctor/vitals preserve existingCourseItems (course-neutral)', () => {
    expect(tfp).toMatch(/courseItems: \(saveMode === 'doctor' \|\| saveMode === 'vitals'\)\s*\n?\s*\? \(existingCourseItems \|\| \[\]\)\s*\n?\s*: buildCourseItemsForSave\(/);
  });
  it('SG2 — Part B: priorSaveDeducted = loadedCourseDeducted (flag, not heuristic)', () => {
    expect(tfp).toMatch(/const priorSaveDeducted = loadedCourseDeducted;/);
    expect(tfp).not.toMatch(/priorSaveDeducted = loadedTreatmentStatus !== 'doctor-recorded'/);
  });
  it('SG3 — flag persisted: deducting saves OWN it, neutral PRESERVE', () => {
    expect(tfp).toMatch(/const courseDeductedAfter = \(saveMode === 'doctor' \|\| saveMode === 'vitals'\)\s*\n?\s*\? loadedCourseDeducted\s*\n?\s*: willDeductCourses;/);
    expect(tfp).toMatch(/_courseDeducted: courseDeductedAfter/);
    expect(tfp).toMatch(/const willDeductCourses = existingDeductions\.length > 0 \|\| _purchasedDedForFlag\.length > 0;/);
  });
  it('SG4 — flag loaded with backward-compat fallback to the status heuristic', () => {
    expect(tfp).toMatch(/typeof existing\?\.detail\?\._courseDeducted === 'boolean'/);
    expect(tfp).toMatch(/setLoadedCourseDeducted\(/);
    // the state exists
    expect(tfp).toMatch(/const \[loadedCourseDeducted, setLoadedCourseDeducted\] = useState\(false\)/);
  });
  it('SG5 — V142-quinquies marker present', () => {
    expect(tfp).toMatch(/V142-quinquies[\s\S]{0,400}ROOT-CAUSE/);
  });
});
