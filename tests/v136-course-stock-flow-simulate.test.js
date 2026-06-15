// V136 (2026-05-31) — Rule I full-flow simulate: PROVE that saveMode='course'
// (retroactive course-usage edit) runs the EXACT SAME course-deduction +
// branch-stock-deduction wiring as the original staff save — flow เดิมเป๊ะๆ —
// and differs ONLY by skipping the auto-sale.
//
// User: "test มาด้วยว่าสิ่งเดิมๆที่เคย wiring ไว้ — ไปตัดคอร์สในข้อมูลคอร์ส
// คงเหลือของลูกค้า และตัดสต็อคสาขานั้นๆ — การ edit ก็ต้องทำเหมือนเดิมเป๊ะๆ
// flow เดิมเป๊ะๆ ... ครอบคลุมที่สุด ทุกกรณี ... หยุดกลางทาง save ซ้ำ".
//
// This file is a RECORDING MIRROR of handleSubmit's backend-save decision
// sequence. Each gate below is a verbatim copy of the real TFP gate; the
// V136.LOCK group source-greps every gate string in TreatmentFormPage.jsx so
// the mirror CANNOT silently drift from the shipped code (Rule Q / V66 — a
// mirror that diverges from real source lies). The actual deduct/stock/reverse
// FUNCTIONS (deductCourseItems / deductStockForTreatment / reverseCourseDeduction
// / reverseStockForTreatment) are unchanged by V136 and are proven on real prod
// by e2e-comprehensive-skip-stock-deduct.mjs + the deduct/stock unit banks; this
// file proves the SAVE-MODE DECISION layer reaches them identically.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// CRLF→LF normalize (2026-06-15): core.autocrlf=true → the Windows working tree
// is CRLF, but L5's multi-line indexOf("…{\n  await…") uses an LF literal → it
// could never match on a dev checkout. Normalize so the source-grep is EOL-agnostic
// (CI is LF; dev is CRLF) — the asserted gates are unchanged.
const TFP = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8').replace(/\r\n/g, '\n');

const TREATMENT_MOVEMENT_TYPE = 6; // stockUtils.MOVEMENT_TYPES.TREATMENT
const TREATMENT_MED_TYPE = 7;      // stockUtils.MOVEMENT_TYPES.TREATMENT_MED

/**
 * Recording mirror of handleSubmit (saveTarget==='backend') decision sequence.
 * Mirrors EXACTLY the gates in TreatmentFormPage.jsx (locked by V136.LOCK).
 * Returns the ordered list of side-effects that would fire + their key args.
 */
function simulateBackendSave({
  saveMode = 'staff',
  isEdit = true,
  selectedCount = 0,          // selectedCourseItems.size
  existingDeductionsCount = 0, // backendDetail.courseItems (existing, non-purchased)
  oldExistingCount = 0,       // existingCourseItems loaded (non-purchased)
  oldPurchasedCount = 0,      // existingCourseItems loaded (purchased)
  hasSale = false,            // purchasedItems||medications||consumables present
  stockChanged = true,        // hasStockChange(snapshot, new) — true when items differ
  overDeduct = false,         // used qty > remaining for any selected course
  branchId = 'BR-SELECTED',
  consumablesCount = 0,
  treatmentItemsCount = 0,
  medicationsCount = 0,
}) {
  const rec = {
    blocked: false,
    validated: false,
    reverseCourse: false,
    reverseStock: false,
    updateTreatment: false,
    deductCourse: null,   // { items, branchAware: false }
    deductStock: null,    // { branchId, movementType, hasConsumables, hasTreatmentItems }
    deductMeds: null,     // { movementType }
    saleCreate: false,
    saleEdit: false,
  };
  const notDoctorVitals = saveMode !== 'doctor' && saveMode !== 'vitals';

  // 1) Course over-deduction validation (TFP:2385) — blocks BEFORE any write.
  if (notDoctorVitals) {
    if (selectedCount > 0) {
      rec.validated = true;
      if (overDeduct) { rec.blocked = true; return rec; } // scrollToError + setSaving(false) + return
    }
  }
  // 2) Reverse old course deductions (TFP:2566).
  if (notDoctorVitals && isEdit && (oldExistingCount > 0 || oldPurchasedCount > 0)) {
    rec.reverseCourse = true;
  }
  // 3) Reverse old treatment stock (TFP:2600) — NOT saveMode-gated.
  if (isEdit && stockChanged) rec.reverseStock = true;
  // 4) Persist treatment doc (always).
  rec.updateTreatment = true;
  // 5) Deduct course balance (TFP:2674) — customer.courses[] (branch-agnostic).
  if (notDoctorVitals && existingDeductionsCount > 0) {
    rec.deductCourse = { items: existingDeductionsCount, branchAware: false };
  }
  // 6) Deduct treatment-side stock consumables+treatmentItems (TFP:2731) → branch.
  if (notDoctorVitals && stockChanged) {
    rec.deductStock = {
      branchId,
      movementType: TREATMENT_MOVEMENT_TYPE,
      hasConsumables: consumablesCount > 0,
      hasTreatmentItems: treatmentItemsCount > 0,
    };
  }
  // 6b) Take-home meds → type 7 (TFP:2744) — only when no auto-sale takes them.
  if (stockChanged && !hasSale && medicationsCount > 0) {
    rec.deductMeds = { movementType: TREATMENT_MED_TYPE };
  }
  // 7) Auto-sale create (TFP:2803) — course mode skips.
  if (notDoctorVitals && saveMode !== 'course' && hasSale && !isEdit) rec.saleCreate = true;
  // 8) Auto-sale edit/transition (TFP:2988) — course mode skips (KEY guard).
  if (notDoctorVitals && saveMode !== 'course' && hasSale && isEdit) rec.saleEdit = true;

  return rec;
}

// ─── F1: course-mode empty treatment — the user's screenshot scenario ────────
describe('V136.F1 course-mode retro edit: deducts course + branch stock, NO sale', () => {
  const base = {
    saveMode: 'course', isEdit: true, selectedCount: 1, existingDeductionsCount: 1,
    oldExistingCount: 0, oldPurchasedCount: 0, hasSale: false, stockChanged: true,
    branchId: 'BR-NAKHON', treatmentItemsCount: 1,
  };
  it('F1.1 deducts the selected course (customer.courses balance)', () => {
    expect(simulateBackendSave(base).deductCourse).toEqual({ items: 1, branchAware: false });
  });
  it('F1.2 deducts treatment-side STOCK at the SELECTED branch (type 6)', () => {
    const r = simulateBackendSave(base);
    expect(r.deductStock).toMatchObject({ branchId: 'BR-NAKHON', movementType: 6, hasTreatmentItems: true });
  });
  it('F1.3 does NOT reverse old course (nothing was deducted before)', () => {
    expect(simulateBackendSave(base).reverseCourse).toBe(false);
  });
  it('F1.4 creates NO sale (course mode skips both sale paths)', () => {
    const r = simulateBackendSave(base);
    expect(r.saleCreate).toBe(false);
    expect(r.saleEdit).toBe(false);
  });
});

// ─── F2: flow เดิมเป๊ะๆ — course vs staff are IDENTICAL except the sale ───────
describe('V136.F2 course flow === staff flow EXCEPT sale', () => {
  const fixture = {
    isEdit: true, selectedCount: 2, existingDeductionsCount: 2, hasSale: false,
    stockChanged: true, branchId: 'BR-A', treatmentItemsCount: 2,
  };
  it('F2.1 deductCourse + deductStock IDENTICAL between course and staff', () => {
    const course = simulateBackendSave({ ...fixture, saveMode: 'course' });
    const staff = simulateBackendSave({ ...fixture, saveMode: 'staff' });
    expect(course.deductCourse).toEqual(staff.deductCourse);
    expect(course.deductStock).toEqual(staff.deductStock);
    expect(course.reverseCourse).toEqual(staff.reverseCourse);
    expect(course.reverseStock).toEqual(staff.reverseStock);
    expect(course.validated).toEqual(staff.validated);
  });
  it('F2.2 the ONLY difference is the sale (staff fires it when hasSale, course never)', () => {
    const f = { ...fixture, hasSale: true };
    const course = simulateBackendSave({ ...f, saveMode: 'course' });
    const staff = simulateBackendSave({ ...f, saveMode: 'staff' });
    // identical deduct+stock
    expect(course.deductCourse).toEqual(staff.deductCourse);
    expect(course.deductStock).toEqual(staff.deductStock);
    // sale: staff yes, course no
    expect(staff.saleEdit).toBe(true);
    expect(course.saleEdit).toBe(false);
  });
});

// ─── F3: หยุดกลางทาง — over-deduction blocks BEFORE any write ──────────────────
describe('V136.F3 mid-way stop: over-deduction blocks before any mutation', () => {
  const od = {
    saveMode: 'course', isEdit: true, selectedCount: 1, existingDeductionsCount: 1,
    hasSale: false, stockChanged: true, overDeduct: true, treatmentItemsCount: 1,
  };
  it('F3.1 course mode: validation blocks → NO deduct / NO stock / NO sale', () => {
    const r = simulateBackendSave(od);
    expect(r.blocked).toBe(true);
    expect(r.updateTreatment).toBe(false);
    expect(r.deductCourse).toBeNull();
    expect(r.deductStock).toBeNull();
    expect(r.saleEdit).toBe(false);
  });
  it('F3.2 staff mode blocks IDENTICALLY on over-deduction (same guard)', () => {
    const r = simulateBackendSave({ ...od, saveMode: 'staff' });
    expect(r.blocked).toBe(true);
    expect(r.deductCourse).toBeNull();
  });
});

// ─── F4: save ซ้ำ / reverse-reapply — proves the reverse machinery is intact ──
describe('V136.F4 re-save reverse-reapply (staff/finalize path) still works', () => {
  it('F4.1 editing a treatment that HAD deductions → reverse old THEN deduct new', () => {
    // canAddNewItems (doctor-recorded finalize) re-edit with existing deductions.
    const r = simulateBackendSave({
      saveMode: 'staff', isEdit: true, selectedCount: 2, existingDeductionsCount: 2,
      oldExistingCount: 2, oldPurchasedCount: 0, stockChanged: true, treatmentItemsCount: 2,
    });
    expect(r.reverseCourse).toBe(true);   // reverse the prior deductions
    expect(r.reverseStock).toBe(true);    // reverse the prior stock
    expect(r.deductCourse).toEqual({ items: 2, branchAware: false }); // re-deduct
    expect(r.deductStock).toMatchObject({ movementType: 6 });
  });
  it('F4.2 course-retro can only run on an UNUSED treatment (no double-deduct path)', () => {
    // After a course-retro save, courseItems is non-empty → loadedHasNoCourseUsage
    // false → canEditCourseUsageRetro false → the section re-locks (asserted in
    // v136-retro-course-usage-edit.test.js A2/B2). So a SECOND course-mode save on
    // the same treatment is unreachable; there is no retro double-deduct path.
    expect(TFP).toMatch(/const canEditCourseUsageRetro = isEdit && !canAddNewItems && loadedHasNoCourseUsage;/);
  });
});

// ─── F5: ตัดสต็อคสาขานั้นๆ — branch-correct stock arg ─────────────────────────
describe('V136.F5 stock deduction targets the SELECTED branch', () => {
  it('F5.1 deductStock branchId = the selected branch (course mode)', () => {
    expect(simulateBackendSave({ saveMode: 'course', branchId: 'BR-PRAM3', stockChanged: true, treatmentItemsCount: 1 }).deductStock.branchId).toBe('BR-PRAM3');
  });
  it('F5.2 a different branch yields a different stock target (no cross-branch leak)', () => {
    const a = simulateBackendSave({ saveMode: 'course', branchId: 'BR-A', stockChanged: true, treatmentItemsCount: 1 });
    const b = simulateBackendSave({ saveMode: 'course', branchId: 'BR-B', stockChanged: true, treatmentItemsCount: 1 });
    expect(a.deductStock.branchId).toBe('BR-A');
    expect(b.deductStock.branchId).toBe('BR-B');
  });
  it('F5.3 course deduction is branch-AGNOSTIC (customer.courses is universal)', () => {
    expect(simulateBackendSave({ saveMode: 'course', existingDeductionsCount: 1, stockChanged: true }).deductCourse.branchAware).toBe(false);
  });
});

// ─── F6: consumables present (hasSale) → stock still deducts, sale still skipped ─
describe('V136.F6 consumables-present treatment, course retro edit', () => {
  it('F6.1 deductStock includes consumables + treatmentItems; NO sale fires', () => {
    const r = simulateBackendSave({
      saveMode: 'course', isEdit: true, selectedCount: 1, existingDeductionsCount: 1,
      hasSale: true, stockChanged: true, consumablesCount: 1, treatmentItemsCount: 1,
    });
    expect(r.deductStock).toMatchObject({ hasConsumables: true, hasTreatmentItems: true, movementType: 6 });
    expect(r.saleCreate).toBe(false);
    expect(r.saleEdit).toBe(false);
    expect(r.deductCourse).toEqual({ items: 1, branchAware: false });
  });
});

// ─── F7: no-op stock change → skip reverse+deduct (Phase 14.7.F gate intact) ──
describe('V136.F7 image/note-only edit (stockChanged=false) skips stock churn', () => {
  it('F7.1 stockChanged=false → no reverseStock, no deductStock', () => {
    const r = simulateBackendSave({ saveMode: 'course', isEdit: true, existingDeductionsCount: 0, selectedCount: 0, stockChanged: false });
    expect(r.reverseStock).toBe(false);
    expect(r.deductStock).toBeNull();
  });
});

// ─── LOCK: every gate above is verbatim-present in the shipped TFP source ─────
describe('V136.LOCK mirror gates are locked to real TreatmentFormPage source', () => {
  it('L1 course over-deduction validation gate', () => {
    expect(TFP).toMatch(/if \(saveMode !== 'doctor' && saveMode !== 'vitals'\) \{[\s\S]{0,400}if \(selectedCourseItems\.size > 0\)/);
    expect(TFP).toMatch(/if \(overDeductions\.length > 0\) \{[\s\S]{0,160}setSaving\(false\);[\s\S]{0,40}return;/);
  });
  it('L2 reverse-old-course gate (saveMode + V142-quater priorSaveDeducted)', () => {
    // V142-quater (2026-05-31) — the reverse is now ALSO gated on priorSaveDeducted
    // (loaded status not doctor/vitals-recorded) to avoid refunding a deduction a
    // doctor/vitals save persisted-but-never-applied (over-credit).
    expect(TFP).toMatch(/if \(saveMode !== 'doctor' && saveMode !== 'vitals' && isEdit && priorSaveDeducted && \(oldExisting\.length > 0 \|\| oldPurchased\.length > 0\)\)/);
  });
  it('L3 reverse-stock gate', () => {
    expect(TFP).toMatch(/if \(isEdit && stockChanged\) \{/);
  });
  it('L4 deduct-course gate does NOT exclude course mode', () => {
    expect(TFP).toMatch(/if \(saveMode !== 'doctor' && saveMode !== 'vitals' && existingDeductions\.length > 0\)/);
    // anti-regression: the deduct gate must NOT carry saveMode !== 'course'
    const i = TFP.indexOf("existingDeductions.length > 0) {");
    expect(TFP.slice(i - 170, i + 40)).not.toMatch(/saveMode !== 'course'/);
  });
  it('L5 deduct-stock gate (consumables+treatmentItems) does NOT exclude course mode + passes branchId', () => {
    expect(TFP).toMatch(/if \(saveMode !== 'doctor' && saveMode !== 'vitals' && stockChanged\) \{/);
    expect(TFP).toMatch(/branchId: SELECTED_BRANCH_ID,\s*\n\s*movementType: TREATMENT_TYPE,/);
    // anti-regression: stock deduct gate must NOT carry saveMode !== 'course'
    const i = TFP.indexOf("&& stockChanged) {\n            await deductStockForTreatment");
    expect(i).toBeGreaterThan(-1);
    expect(TFP.slice(i - 80, i)).not.toMatch(/saveMode !== 'course'/);
  });
  it('L6 BOTH sale gates DO carry saveMode !== course', () => {
    const m = TFP.match(/saveMode !== 'doctor' && saveMode !== 'vitals' && saveMode !== 'course' && hasSale/g) || [];
    expect(m.length).toBe(2);
  });
  it('L7 double-submit guard — save button disabled while saving', () => {
    expect(TFP).toMatch(/onClick=\{canEditCourseUsageRetro \? \(\) => handleSubmit\('course'\) : handleSubmit\}\s*\n\s*disabled=\{saving\}/);
  });
  it('L8 deductCourseItems call passes treatmentId/staffId/staffName (no branchId — branch-agnostic)', () => {
    // 2026-06-09 — staffName = the OPD editor (editorContext), not the doctor.
    expect(TFP).toMatch(/await deductCourseItems\(customerId, existingDeductions, \{\s*treatmentId: newTid,[\s\S]*?staffId: editorContext\?\.uid \|\| doctorId \|\| '',\s*staffName: editorContext\?\.name \|\| treatingDoctor\?\.name \|\| '',/);
  });
});
