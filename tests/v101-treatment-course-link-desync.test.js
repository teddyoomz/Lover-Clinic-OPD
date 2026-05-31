// V101 (2026-05-19 LATE+2) — treatmentItems↔courseItems desync class-of-bug
// regression bank. Class: at TFP save boundary, treatmentItems present with
// productId but courseItems serializes to [] → customer.courses[] never
// decrements + be_course_changes never emits 'use'.
//
// 100% bug rate on real prod (4/4 auditable treatments for วันเพ็ญ LC-26000078).
// User report (verbatim): "ตัดช็อคเวฟไปตั้งหลายรอบ ทำไมไม่เห็นตัดคอร์สเลย".
//
// V100/V99/V96 tests missed because admin-SDK e2e synthesized backendDetail
// objects directly — never chained React state lifecycle through
// toggleCourseItem → setSelectedCourseItems → setTreatmentItems → handleSubmit
// serialization. Per Rule Q V66: mock + admin-SDK ≠ verification.
//
// AV88 invariant: every TFP save MUST use V101 two-pass serialization
// (Pass 1 rowId-based, Pass 2 productId fallback) + edit-load rebind.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// V142-bis: the V101 two-pass serialization was extracted VERBATIM from the TFP
// inline IIFE to buildCourseItemsForSave — these tests now exercise the REAL
// helper (no replica) + assert the helper carries the V101 contract.
import { buildCourseItemsForSave } from '../src/lib/treatmentBuyHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TFP_PATH = resolve(__dirname, '../src/components/TreatmentFormPage.jsx');
const TFP_SRC = readFileSync(TFP_PATH, 'utf8');
const HELPER_PATH = resolve(__dirname, '../src/lib/treatmentBuyHelpers.js');
const HELPER_SRC = readFileSync(HELPER_PATH, 'utf8');

// ─── A. Source-grep regression — V101 markers ───────────────────────
describe('V101.A — V101 source-grep regression (locks anti-regression)', () => {
  it('A1: TFP wires V101 two-pass serialization via buildCourseItemsForSave (V142-bis: extracted from inline IIFE)', () => {
    // V142-bis extracted the inline IIFE → buildCourseItemsForSave; TFP calls it.
    expect(TFP_SRC).toMatch(/courseItems: buildCourseItemsForSave\(selectedCourseItems, options\?\.customerCourses, treatmentItems\)/);
    expect(TFP_SRC).not.toContain('courseItems: (() => {'); // inline IIFE gone
    // the helper carries the V101 two-pass shape
    expect(HELPER_SRC).toMatch(/V101 two-pass/i);
    expect(HELPER_SRC).toContain('// Pass 1');
    expect(HELPER_SRC).toContain('// Pass 2');
  });

  it('A2: Pass 2 uses productId-based fallback (in the helper)', () => {
    expect(HELPER_SRC).toContain('_v101AutoLinked');
    expect(HELPER_SRC).toMatch(/String\(product\.productId\)\s*===\s*String\(ti\.productId\)/);
  });

  it('A3: Edit-load rebind exists (closes self-perpetuating loop)', () => {
    expect(TFP_SRC).toMatch(/V101.*edit-load rebind/i);
    expect(TFP_SRC).toContain('restoredSelection');
    expect(TFP_SRC).toContain('setSelectedCourseItems(restoredSelection)');
  });

  it('A4: NO single-pass legacy pattern remains (anti-regression)', () => {
    // The pre-V101 broken pattern: single Array.from(...).map(...).filter(Boolean)
    // for courseItems at save boundary. Future drift would re-introduce this.
    const badPattern = /courseItems:\s*Array\.from\(selectedCourseItems\)\.map\([\s\S]{0,300}\)\.filter\(Boolean\)/;
    expect(badPattern.test(TFP_SRC)).toBe(false);
  });

  it('A5: Forensic markers preserved (_v101AutoLinked + warn log) in the helper', () => {
    expect(HELPER_SRC).toContain('_v101AutoLinked: true');
    expect(HELPER_SRC).toMatch(/console\.warn\([^)]*V101/);
  });
});

// ─── B. V101 two-pass serialization correctness — exercises the REAL helper ──
// V142-bis: this was a hand-mirror of the inline IIFE (Rule I item b). The IIFE
// is now extracted to buildCourseItemsForSave, so v101Serialize is a thin
// adapter over the SHIPPED helper — the B-tests verify the real logic, no replica.
function v101Serialize({ selectedCourseItems, liveCustomerCourses, treatmentItems }) {
  return buildCourseItemsForSave(selectedCourseItems, liveCustomerCourses, treatmentItems);
}

const FIXT_SHOCK_COURSE = {
  courseId: 'be-course-0',
  courseName: 'Shock Wave 12 ครั้ง + ติดตามอาการกับแพทย์ 1 ครั้ง',
  products: [{ rowId: 'be-row-0', courseIndex: 0, productId: '38842', name: 'Shock wave', remaining: '12', total: '12', unit: 'ครั้ง' }],
};
const FIXT_FOLLOWUP_COURSE = {
  courseId: 'be-course-1',
  courseName: 'Shock Wave 12 ครั้ง + ติดตามอาการกับแพทย์ 1 ครั้ง',
  products: [{ rowId: 'be-row-1', courseIndex: 1, productId: '38849', name: 'ติดตามอาการกับแพทย์', remaining: '1', total: '1', unit: 'ครั้ง' }],
};

describe('V101.B — Pass 1 (rowId-based, happy path)', () => {
  it('B1: ticked checkbox produces correct courseItem entry', () => {
    const result = v101Serialize({
      selectedCourseItems: new Set(['be-row-0']),
      liveCustomerCourses: [FIXT_SHOCK_COURSE, FIXT_FOLLOWUP_COURSE],
      treatmentItems: [{ id: 'be-row-0', productId: '38842', name: 'Shock wave', qty: '5', unit: 'ครั้ง' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].rowId).toBe('be-row-0');
    expect(result[0].deductQty).toBe(5);
    expect(result[0]._v101AutoLinked).toBeUndefined();
  });

  it('B2: 2 checkboxes ticked → 2 courseItems', () => {
    const result = v101Serialize({
      selectedCourseItems: new Set(['be-row-0', 'be-row-1']),
      liveCustomerCourses: [FIXT_SHOCK_COURSE, FIXT_FOLLOWUP_COURSE],
      treatmentItems: [
        { id: 'be-row-0', productId: '38842', name: 'Shock wave', qty: '1', unit: 'ครั้ง' },
        { id: 'be-row-1', productId: '38849', name: 'ติดตามอาการกับแพทย์', qty: '1', unit: 'ครั้ง' },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result.every(c => !c._v101AutoLinked)).toBe(true);
  });
});

describe('V101.C — Pass 2 (productId fallback rescues 3 desync channels)', () => {
  it('C1: Channel A — edit-load loop: treatmentItem with existing-N ID + productId match → rescued', () => {
    // Simulates: edit-load set id=existing-0 because t.courseItems was empty,
    // selectedCourseItems stayed empty.
    const result = v101Serialize({
      selectedCourseItems: new Set(), // EMPTY — the bug condition
      liveCustomerCourses: [FIXT_SHOCK_COURSE],
      treatmentItems: [{ id: 'existing-0', productId: '38842', name: 'Shock wave', qty: '1', unit: 'ครั้ง' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]._v101AutoLinked).toBe(true);
    expect(result[0].rowId).toBe('be-row-0');
    expect(result[0].deductQty).toBe(1);
  });

  it('C2: Channel B — state-sync race: treatmentItem ID does not match any rowId but productId does', () => {
    // Simulates: selectedCourseItems contains a STALE rowId (e.g. from a
    // previous purchase that was removed). treatmentItem.id has productId.
    const result = v101Serialize({
      selectedCourseItems: new Set(['STALE-rowid-that-no-longer-exists']),
      liveCustomerCourses: [FIXT_SHOCK_COURSE],
      treatmentItems: [{ id: 'STALE-rowid-that-no-longer-exists', productId: '38842', name: 'Shock wave', qty: '5', unit: 'ครั้ง' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]._v101AutoLinked).toBe(true);
    expect(result[0].deductQty).toBe(5);
  });

  it('C3: Channel C — purchased-row missing from customerCourses snapshot but matching productId still resolves', () => {
    // Synthetic case: assignCourseToCustomer hasn't appended yet but the
    // existing course covers the productId.
    const result = v101Serialize({
      selectedCourseItems: new Set([]),
      liveCustomerCourses: [FIXT_SHOCK_COURSE],
      treatmentItems: [{ id: 'purchased-X-row-38842', productId: '38842', name: 'Shock wave', qty: '1', unit: 'ครั้ง' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]._v101AutoLinked).toBe(true);
    expect(result[0].rowId).toBe('be-row-0'); // resolved to existing
  });

  it('C4: skips when remaining=0 (already exhausted course) — does NOT over-deduct', () => {
    const exhausted = {
      ...FIXT_SHOCK_COURSE,
      products: [{ ...FIXT_SHOCK_COURSE.products[0], remaining: '0' }],
    };
    const result = v101Serialize({
      selectedCourseItems: new Set([]),
      liveCustomerCourses: [exhausted],
      treatmentItems: [{ id: 'existing-0', productId: '38842', name: 'Shock wave', qty: '1', unit: 'ครั้ง' }],
    });
    expect(result).toHaveLength(0); // no rescue for exhausted course
  });

  it('C5: buffet/fillLater always rescued regardless of remaining', () => {
    const buffet = {
      ...FIXT_SHOCK_COURSE,
      products: [{ ...FIXT_SHOCK_COURSE.products[0], remaining: '', isBuffet: true }],
    };
    const result = v101Serialize({
      selectedCourseItems: new Set([]),
      liveCustomerCourses: [buffet],
      treatmentItems: [{ id: 'existing-0', productId: '38842', name: 'Shock wave', qty: '1', unit: 'ครั้ง' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]._v101AutoLinked).toBe(true);
  });

  it('C6: treatmentItem WITHOUT productId is NOT rescued (legacy/manual entry — orphan)', () => {
    const result = v101Serialize({
      selectedCourseItems: new Set([]),
      liveCustomerCourses: [FIXT_SHOCK_COURSE],
      treatmentItems: [{ id: 'existing-0', productId: '', name: 'Shock wave', qty: '1', unit: 'ครั้ง' }],
    });
    expect(result).toHaveLength(0);
  });

  it('C7: Pass 1 + Pass 2 mixed — does NOT double-count', () => {
    const result = v101Serialize({
      selectedCourseItems: new Set(['be-row-0']),
      liveCustomerCourses: [FIXT_SHOCK_COURSE, FIXT_FOLLOWUP_COURSE],
      treatmentItems: [
        { id: 'be-row-0', productId: '38842', name: 'Shock wave', qty: '1', unit: 'ครั้ง' },
        { id: 'existing-1', productId: '38849', name: 'ติดตามอาการกับแพทย์', qty: '1', unit: 'ครั้ง' },
      ],
    });
    expect(result).toHaveLength(2);
    const pass1 = result.find(c => c.rowId === 'be-row-0');
    const pass2 = result.find(c => c.rowId === 'be-row-1');
    expect(pass1._v101AutoLinked).toBeUndefined();
    expect(pass2._v101AutoLinked).toBe(true);
  });
});

describe('V101.D — Full reproduction of วันเพ็ญ real-prod bug (4 treatments)', () => {
  // Real customer.courses state at the time of bug
  const wanphenCourses = [
    { courseId: 'be-course-0', courseName: 'Shock Wave 12+ติดตาม 1', products: [{ rowId: 'be-row-0', courseIndex: 0, productId: '38842', name: 'Shock wave', remaining: '12', total: '12', unit: 'ครั้ง' }] },
    { courseId: 'be-course-1', courseName: 'Shock Wave 12+ติดตาม 1', products: [{ rowId: 'be-row-1', courseIndex: 1, productId: '38849', name: 'ติดตามอาการกับแพทย์', remaining: '1', total: '1', unit: 'ครั้ง' }] },
  ];

  it('D1: BT-1779188566820 (Shock wave q=5, no purchase) — V101 rescues', () => {
    // PRE-V101: courseItems was [] in real prod. Reproduce the broken state:
    // selectedCourseItems empty (some desync channel), treatmentItem has be-row-0
    const result = v101Serialize({
      selectedCourseItems: new Set(), // bug state
      liveCustomerCourses: wanphenCourses,
      treatmentItems: [{ id: 'be-row-0', productId: '38842', name: 'Shock wave', qty: '5', unit: 'ครั้ง' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].productName).toBe('Shock wave');
    expect(result[0].deductQty).toBe(5);
    expect(result[0]._v101AutoLinked).toBe(true);
  });

  it('D2: BT-1779188992442 (Shock wave q=1 + ติดตาม q=1, with purchase)', () => {
    const result = v101Serialize({
      selectedCourseItems: new Set(),
      liveCustomerCourses: wanphenCourses,
      treatmentItems: [
        { id: 'purchased-COURSES_1778150447655_24EA110C-row-38842', productId: '38842', name: 'Shock wave', qty: '1', unit: 'ครั้ง' },
        { id: 'purchased-COURSES_1778150447655_24EA110C-row-38849', productId: '38849', name: 'ติดตามอาการกับแพทย์', qty: '1', unit: 'ครั้ง' },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result.every(c => c._v101AutoLinked)).toBe(true);
    const shock = result.find(c => c.productName === 'Shock wave');
    const followup = result.find(c => c.productName === 'ติดตามอาการกับแพทย์');
    expect(shock).toBeTruthy();
    expect(followup).toBeTruthy();
    expect(shock.rowId).toBe('be-row-0');
    expect(followup.rowId).toBe('be-row-1');
  });
});

// ─── E. AV88 invariant cross-link ───────────────────────────────────
describe('V101.E — AV88 invariant cross-link', () => {
  it('E1: SKILL.md contains AV88 entry', () => {
    const skill = readFileSync(resolve(__dirname, '../.claude/skills/audit-anti-vibe-code/SKILL.md'), 'utf8');
    expect(skill).toMatch(/### AV88\b/);
    expect(skill).toContain('treatmentItems↔courseItems');
    expect(skill).toContain('V101');
  });

  it('E2: AV88 documents the 3 desync channels', () => {
    const skill = readFileSync(resolve(__dirname, '../.claude/skills/audit-anti-vibe-code/SKILL.md'), 'utf8');
    expect(skill).toMatch(/edit-load self-perpetuating loop/i);
    expect(skill).toMatch(/state-sync race/i);
    expect(skill).toMatch(/purchase \+ use-immediately mismatch/i);
  });
});
