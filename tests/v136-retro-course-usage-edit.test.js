// V136 (2026-05-31) — TFP retroactive course-usage edit.
//
// User: "ในหน้า TFP ทำให้ edit ข้อมูลการใช้คอร์สย้อนหลังได้ ถ้ายังไม่มีการใช้
// คอร์ส/ตัดคอร์สใดๆในใบนั้น (เช่นในรูป) แต่ถ้ามีการใช้อะไรไปแล้ว จะ edit ไม่ได้
// เหมือนเดิม". Locked decisions: Q1=A (unlock only when NO course deducted —
// courseItems AND treatmentItems both empty at load), Q2=A (course section
// ONLY), Q3=B (record use of EXISTING courses; NO buy → no auto-sale/INV).
//
// TFP (3700+ LOC) is not RTL-mounted in this repo (dependency web). Per the
// established TFP-change pattern (V125/V126): source-grep + PURE Rule I
// flow-simulate mirror (locked to the real source strings) + build + L1-user.
// The mirror is trustworthy ONLY because the source-grep assertions prove the
// REAL gate expressions match the mirror (V66 — a mirror that drifts from real
// code lies).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const TFP = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');

// ─── Pure mirrors of the V136 decision logic (kept in lockstep with source
//     via the SG source-grep group below) ──────────────────────────────────

/** Mirror of the render gate: canEditCourseUsageRetro (TFP). */
function canEditCourseUsageRetro({ isEdit, canAddNewItems, loadedHasNoCourseUsage }) {
  return isEdit && !canAddNewItems && loadedHasNoCourseUsage;
}
/** Mirror: courseUsageInteractive — drives locked-table-vs-grid branch. */
function courseUsageInteractive({ canAddNewItems, retro }) {
  return canAddNewItems || retro;
}
/** Mirror of edit-load capture: loadedHasNoCourseUsage. */
function loadedHasNoCourseUsageFrom(detail) {
  return !(detail?.courseItems?.length) && !(detail?.treatmentItems?.length);
}
/** Mirror: course-deduction gate in handleSubmit (deduct existing courses). */
function deductCourseGate({ saveMode, existingDeductionsLen }) {
  return saveMode !== 'doctor' && saveMode !== 'vitals' && existingDeductionsLen > 0;
}
/** Mirror: edit-mode auto-sale gate (the KEY money guard). */
function editSaleGate({ saveMode, hasSale, isEdit }) {
  return saveMode !== 'doctor' && saveMode !== 'vitals' && saveMode !== 'course' && hasSale && isEdit;
}
/** Mirror: create-mode auto-sale gate. */
function createSaleGate({ saveMode, hasSale, isEdit }) {
  return saveMode !== 'doctor' && saveMode !== 'vitals' && saveMode !== 'course' && hasSale && !isEdit;
}

describe('V136.A render gate — unlock ONLY when no course used', () => {
  it('A1: finalized treatment, no course used → canEditCourseUsageRetro TRUE', () => {
    expect(canEditCourseUsageRetro({ isEdit: true, canAddNewItems: false, loadedHasNoCourseUsage: true })).toBe(true);
  });
  it('A2: finalized treatment that USED a course → FALSE (stays locked)', () => {
    expect(canEditCourseUsageRetro({ isEdit: true, canAddNewItems: false, loadedHasNoCourseUsage: false })).toBe(false);
  });
  it('A3: create mode (canAddNewItems already true) → retro is FALSE (no double-unlock)', () => {
    expect(canEditCourseUsageRetro({ isEdit: false, canAddNewItems: true, loadedHasNoCourseUsage: true })).toBe(false);
  });
  it('A4: doctor-recorded/vitals (canAddNewItems true) → retro FALSE (canAddNewItems path owns it)', () => {
    expect(canEditCourseUsageRetro({ isEdit: true, canAddNewItems: true, loadedHasNoCourseUsage: true })).toBe(false);
  });
  it('A5: before load (loadedHasNoCourseUsage default false) → FALSE (no flash to grid)', () => {
    expect(canEditCourseUsageRetro({ isEdit: true, canAddNewItems: false, loadedHasNoCourseUsage: false })).toBe(false);
  });
  it('A6: courseUsageInteractive = canAddNewItems OR retro', () => {
    expect(courseUsageInteractive({ canAddNewItems: true, retro: false })).toBe(true);
    expect(courseUsageInteractive({ canAddNewItems: false, retro: true })).toBe(true);
    expect(courseUsageInteractive({ canAddNewItems: false, retro: false })).toBe(false);
  });
});

describe('V136.B loadedHasNoCourseUsage — "no usage" definition (Q1=A)', () => {
  it('B1: empty courseItems + empty treatmentItems → true (the screenshot case)', () => {
    expect(loadedHasNoCourseUsageFrom({ courseItems: [], treatmentItems: [] })).toBe(true);
    expect(loadedHasNoCourseUsageFrom({})).toBe(true);
  });
  it('B2: courseItems present → false', () => {
    expect(loadedHasNoCourseUsageFrom({ courseItems: [{ rowId: 'r1' }], treatmentItems: [] })).toBe(false);
  });
  it('B3: treatmentItems present (V101-legacy drift) → false (matches visible list)', () => {
    expect(loadedHasNoCourseUsageFrom({ courseItems: [], treatmentItems: [{ id: 'x' }] })).toBe(false);
  });
  it('B4: note/vitals/images do NOT factor in (only course+treatment items)', () => {
    expect(loadedHasNoCourseUsageFrom({ courseItems: [], treatmentItems: [], symptoms: 'x', vitals: { bp: '120' }, beforeImages: [{}] })).toBe(true);
  });
});

describe('V136.C save decision — deduct course but NO sale (Q3=B)', () => {
  it('C1: saveMode=course + selected course → deductCourseItems RUNS', () => {
    expect(deductCourseGate({ saveMode: 'course', existingDeductionsLen: 1 })).toBe(true);
  });
  it('C2: saveMode=course → edit-sale gate FALSE even when hasSale (consumables present — the danger case)', () => {
    expect(editSaleGate({ saveMode: 'course', hasSale: true, isEdit: true })).toBe(false);
  });
  it('C3: saveMode=course → create-sale gate FALSE too', () => {
    expect(createSaleGate({ saveMode: 'course', hasSale: true, isEdit: false })).toBe(false);
  });
  it('C4: regression — saveMode=staff STILL fires the edit-sale path when hasSale (V136 must not break normal save)', () => {
    expect(editSaleGate({ saveMode: 'staff', hasSale: true, isEdit: true })).toBe(true);
  });
  it('C5: regression — staff still deducts course', () => {
    expect(deductCourseGate({ saveMode: 'staff', existingDeductionsLen: 1 })).toBe(true);
  });
  it('C6: full danger scenario — consumables-only finalized treatment, retro-add a course: deduct YES, sale NO', () => {
    // Treatment had consumables (hasSale true) but no course (unlock eligible).
    const isEdit = true, hasSale = true, saveMode = 'course';
    expect(deductCourseGate({ saveMode, existingDeductionsLen: 1 })).toBe(true);   // course balance ↓
    expect(editSaleGate({ saveMode, hasSale, isEdit })).toBe(false);               // sale untouched
    expect(createSaleGate({ saveMode, hasSale, isEdit })).toBe(false);
  });
  it('C7: doctor/vitals unaffected by V136 (still skip both)', () => {
    expect(deductCourseGate({ saveMode: 'doctor', existingDeductionsLen: 1 })).toBe(false);
    expect(deductCourseGate({ saveMode: 'vitals', existingDeductionsLen: 1 })).toBe(false);
    expect(editSaleGate({ saveMode: 'doctor', hasSale: true, isEdit: true })).toBe(false);
  });
});

describe('V136.SG source-grep — mirrors locked to real TFP source', () => {
  it('SG1: loadedHasNoCourseUsage state declared + default false', () => {
    expect(TFP).toMatch(/const \[loadedHasNoCourseUsage, setLoadedHasNoCourseUsage\] = useState\(false\)/);
  });
  it('SG2: edit-load sets it from courseItems AND treatmentItems both empty', () => {
    expect(TFP).toMatch(/setLoadedHasNoCourseUsage\(!\(t\.courseItems\?\.length\) && !\(t\.treatmentItems\?\.length\)\)/);
  });
  it('SG3: canEditCourseUsageRetro gate matches the mirror exactly', () => {
    expect(TFP).toMatch(/const canEditCourseUsageRetro = isEdit && !canAddNewItems && loadedHasNoCourseUsage;/);
  });
  it('SG4: courseUsageInteractive = canAddNewItems || canEditCourseUsageRetro', () => {
    expect(TFP).toMatch(/const courseUsageInteractive = canAddNewItems \|\| canEditCourseUsageRetro;/);
  });
  it('SG5: course-section locked-vs-grid branch keys on courseUsageInteractive (not canAddNewItems)', () => {
    expect(TFP).toMatch(/\{!courseUsageInteractive \? \(/);
  });
  it('SG6: ซื้อ buttons STAY gated on canAddNewItems only (hidden in retro — Q3=B)', () => {
    // The buy-button block opens with `{canAddNewItems && (` right before the
    // three ActionBtn ซื้อ buttons. Assert that exact gate still present.
    expect(TFP).toMatch(/\{canAddNewItems && \(\s*<div className="ml-auto flex items-center gap-1\.5 flex-wrap">/);
    expect(TFP).toMatch(/openBuyModal\('course'\)/); // buy buttons still exist (for canAddNewItems path)
  });
  it('SG7: parser recognizes string handleSubmit("course")', () => {
    expect(TFP).toMatch(/\(eventOrSaveMode === 'course'\) \? 'course'/);
  });
  it('SG8: parser recognizes object form { saveMode: "course" }', () => {
    expect(TFP).toMatch(/\(eventOrSaveMode\.saveMode === 'course'\) \? 'course'/);
  });
  it('SG9: status patch has a forensic-only course branch (no status/completedAt churn)', () => {
    expect(TFP).toMatch(/saveMode === 'course' \? \{/);
    expect(TFP).toMatch(/courseUsageEditedAt: serverTimestamp\(\)/);
    expect(TFP).toMatch(/courseUsageEditedBy: auth\.currentUser\?\.uid \|\| null/);
  });
  it('SG10: BOTH auto-sale gates carry saveMode !== \'course\'', () => {
    const m = TFP.match(/saveMode !== 'doctor' && saveMode !== 'vitals' && saveMode !== 'course' && hasSale/g) || [];
    expect(m.length).toBe(2); // create-path + edit-path
  });
  it('SG11: main save button → handleSubmit(\'course\') in retro, else canonical handleSubmit', () => {
    expect(TFP).toMatch(/onClick=\{canEditCourseUsageRetro \? \(\) => handleSubmit\('course'\) : handleSubmit\}/);
  });
  it('SG12: retro save button label = "บันทึกการใช้คอร์ส"', () => {
    expect(TFP).toMatch(/canEditCourseUsageRetro \? 'บันทึกการใช้คอร์ส'/);
    expect(TFP).toMatch(/data-testid=\{canEditCourseUsageRetro \? 'tfp-save-course-retro' : 'tfp-save'\}/);
  });
  it('SG13: anti-regression — course-deduction gate is NOT skipped for course mode', () => {
    // deductCourseItems gate must remain `saveMode !== 'doctor' && saveMode !== 'vitals'`
    // (NO `&& saveMode !== 'course'`) so the retro edit actually deducts.
    const idx = TFP.indexOf('existingDeductions.length > 0) {');
    expect(idx).toBeGreaterThan(-1);
    const slice = TFP.slice(idx - 160, idx + 40);
    expect(slice).not.toMatch(/saveMode !== 'course'/);
  });
  it('SG14: V136 marker present (institutional memory)', () => {
    expect((TFP.match(/V136/g) || []).length).toBeGreaterThanOrEqual(5);
  });
});
