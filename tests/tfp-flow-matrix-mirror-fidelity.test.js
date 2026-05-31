// ─── TFP flow-matrix mirror fidelity (Rule Q-honest drift lock) ───
//
// scripts/e2e-tfp-full-flow-matrix.mjs verifies the FULL TFP course+stock flow
// on real prod by driving the SHIPPED mutation functions through an
// applyTfpSave() orchestration that MIRRORS TreatmentFormPage.handleSubmit.
//
// This test locks the mirror's fidelity so the e2e can't silently drift from
// the real TFP gate structure: every decision gate in applyTfpSave MUST match
// the corresponding gate in TFP, and the e2e MUST import the SHIPPED functions
// (never reimplement the deduct/reverse math locally). If TFP's gate structure
// changes, this test goes red → the mirror must be updated in lockstep.
//
// Companion to v142 / v142-bis / v142-quater (which lock the TFP gates
// themselves). This locks the e2e MIRROR ↔ TFP correspondence.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const TFP = readFileSync(path.resolve(process.cwd(), 'src/components/TreatmentFormPage.jsx'), 'utf8');
const E2E = readFileSync(path.resolve(process.cwd(), 'scripts/e2e-tfp-full-flow-matrix.mjs'), 'utf8');

describe('TFP flow-matrix mirror fidelity (Rule Q drift lock)', () => {
  it('F1 — e2e imports the SHIPPED mutation functions (no local reimplementation)', () => {
    // The deduct/reverse/assign/stock math MUST be the real shipped code.
    expect(E2E).toMatch(/from '\.\.\/src\/lib\/backendClient\.js'/);
    for (const fn of ['reverseCourseDeduction', 'deductCourseItems', 'assignCourseToCustomer', 'deductStockForTreatment', 'reverseStockForTreatment']) {
      expect(E2E).toContain(fn);
    }
    // serialization + carry-forward = the SHIPPED helpers
    expect(E2E).toMatch(/from '\.\.\/src\/lib\/treatmentBuyHelpers\.js'/);
    expect(E2E).toContain('buildCourseItemsForSave');
    expect(E2E).toContain('buildReDeductListWithCarryForward');
    // must NOT define a local course-math reimplementation
    expect(E2E).not.toMatch(/function\s+(deductCourse|reverseCourse|parseQtyString)\b/);
  });

  it('F2 — deductGate mirrors TFP (saveMode !== doctor && !== vitals)', () => {
    // TFP gates course/stock deduct on saveMode
    expect(TFP).toMatch(/saveMode !== 'doctor' && saveMode !== 'vitals'/);
    // e2e mirror: isCourseNeutral = (doctor|vitals); deductGate = !isCourseNeutral
    expect(E2E).toMatch(/const isCourseNeutral = saveMode === 'doctor' \|\| saveMode === 'vitals'/);
    expect(E2E).toMatch(/const deductGate = !isCourseNeutral/);
  });

  it('F3 — priorSaveDeducted (V142-quinquies flag gate) mirrors TFP exactly', () => {
    // V142-quinquies replaced the V142-quater status heuristic (which mis-handled
    // finalize→doctor→finalize as a double-deduct) with the persisted _courseDeducted
    // flag. Both TFP + e2e read priorSaveDeducted = loadedCourseDeducted.
    expect(TFP).toMatch(/const priorSaveDeducted = loadedCourseDeducted;/);
    expect(E2E).toMatch(/const priorSaveDeducted = loadedCourseDeducted;/);
    // anti-regression: the dropped status heuristic must NOT come back
    expect(TFP).not.toMatch(/priorSaveDeducted = loadedTreatmentStatus !== 'doctor-recorded'/);
  });

  it('F4 — edit carry-forward (V142) mirrors TFP isEdit ternary', () => {
    // TFP: existingDeductions/purchasedDeductions = isEdit ? buildReDeductListWithCarryForward(...) : fresh...
    expect(TFP).toMatch(/isEdit\s*\n?\s*\?\s*buildReDeductListWithCarryForward\(freshExisting, oldExisting, selectedCourseItems\)/);
    expect(TFP).toMatch(/isEdit\s*\n?\s*\?\s*buildReDeductListWithCarryForward\(freshPurchased, oldPurchased, selectedCourseItems\)/);
    // e2e mirror: same isEdit ternary + carry-forward for both lists
    expect(E2E).toMatch(/existingDeductions = isEdit \? buildReDeductListWithCarryForward\(freshExisting, oldExisting, selectedCourseItems\) : freshExisting/);
    expect(E2E).toMatch(/purchasedDeductions = isEdit \? buildReDeductListWithCarryForward\(freshPurchased, oldPurchased, selectedCourseItems\) : freshPurchased/);
  });

  it('F5 — reverse-course gate mirrors TFP (deductGate + isEdit + priorSaveDeducted)', () => {
    // TFP reverse gate
    expect(TFP).toMatch(/saveMode !== 'doctor' && saveMode !== 'vitals' && isEdit && priorSaveDeducted && \(oldExisting\.length > 0 \|\| oldPurchased\.length > 0\)/);
    // e2e mirror: reverse only when deductGate && isEdit && priorSaveDeducted
    expect(E2E).toMatch(/if \(deductGate && isEdit && priorSaveDeducted\)/);
    expect(E2E).toMatch(/reverseCourseDeduction\(customerId, oldPurchased, \{ preferNewest: true \}\)/);
  });

  it('F6 — stockChanged gate mirrors TFP (!isEdit || hasStockChange)', () => {
    expect(TFP).toMatch(/stockChanged = !isEdit \|\| hasStockChange\(/);
    expect(E2E).toMatch(/stockChanged = !isEdit \|\| hasStockChanged/);
    // reverse stock only on edit + changed (both)
    expect(TFP).toMatch(/if \(isEdit && stockChanged\)/);
    expect(E2E).toMatch(/if \(isEdit && stockChanged\) await reverseStockForTreatment\(treatmentId\)/);
  });

  it('F7 — purchased-course deduct uses preferNewest in BOTH (V13 dup-course safety)', () => {
    expect(TFP).toMatch(/deductCourseItems\(customerId, purchasedDeductions, \{\s*\n?\s*preferNewest: true/);
    expect(E2E).toMatch(/deductCourseItems\(customerId, purchasedDeductions, \{ preferNewest: true/);
  });

  it('F8 — V142-quinquies Part A: doctor/vitals are course-NEUTRAL (preserve courseItems) in BOTH', () => {
    // TFP: courseItems = (doctor|vitals) ? existingCourseItems : buildCourseItemsForSave(...)
    expect(TFP).toMatch(/courseItems: \(saveMode === 'doctor' \|\| saveMode === 'vitals'\)\s*\n?\s*\? \(existingCourseItems \|\| \[\]\)\s*\n?\s*: buildCourseItemsForSave\(/);
    // e2e mirror: isCourseNeutral ? (savedCourseItems || []) : buildCourseItemsForSave
    expect(E2E).toMatch(/const courseItems = isCourseNeutral \? \(savedCourseItems \|\| \[\]\) : buildCourseItemsForSave\(/);
  });

  it('F9 — V142-quinquies Part B: persisted _courseDeducted flag (deducting OWNS, neutral PRESERVES) in BOTH', () => {
    // TFP: courseDeductedAfter = (doctor|vitals) ? loadedCourseDeducted : willDeductCourses; persisted on the doc
    expect(TFP).toMatch(/const courseDeductedAfter = \(saveMode === 'doctor' \|\| saveMode === 'vitals'\)\s*\n?\s*\? loadedCourseDeducted\s*\n?\s*: willDeductCourses;/);
    expect(TFP).toMatch(/_courseDeducted: courseDeductedAfter/);
    expect(TFP).toMatch(/const willDeductCourses = existingDeductions\.length > 0 \|\| _purchasedDedForFlag\.length > 0;/);
    // loaded with backward-compat fallback to the status heuristic for pre-fix docs
    expect(TFP).toMatch(/typeof existing\?\.detail\?\._courseDeducted === 'boolean'/);
    // e2e mirror: same flag semantics
    expect(E2E).toMatch(/const courseDeducted = isCourseNeutral \? loadedCourseDeducted : willDeductCourses;/);
    expect(E2E).toMatch(/const willDeductCourses = existingDeductions\.length > 0 \|\| purchasedDeductions\.length > 0;/);
  });
});
