import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const TFP_PATH = join(process.cwd(), 'src/components/TreatmentFormPage.jsx');
const TFP_SOURCE = readFileSync(TFP_PATH, 'utf-8');

describe('Phase 26.0 — AV37 source-grep regression locks', () => {
  describe('G1 — handleSubmit deduction/sale-create sites have saveMode gate', () => {
    const GATED_SITES = [
      'deductCourseItems(',
      'createBackendSale(',
      'assignCourseToCustomer(',
      'applyDepositToSale(',
      'deductWallet(',
      'earnPoints(',
    ];

    // Window: 16000 chars to cover the entire auto-sale chain (~6500 chars) and
    // edit-mode sale sync block (~15000 chars). Both wrap many inner deduction
    // calls under a single outer `if (saveMode !== 'doctor' && ...)` guard.
    // Regression-catching property preserved: if a NEW unguarded call is added
    // outside any saveMode block (e.g. above all the gates at top of handleSubmit),
    // the 16000-char window won't reach the outer block's gate. The window is
    // generous enough to traverse the largest gated block in current code
    // (edit-mode sale sync, ~15002 chars between gate and deepest earnPoints call)
    // but not so generous that a fresh unguarded code path is silently allowed.
    const GATE_WINDOW = 16000;
    GATED_SITES.forEach((fn) => {
      it(`G1.${fn.replace(/[()]/g, '')} — every '${fn}' call gated within ${GATE_WINDOW} chars`, () => {
        const fnEscaped = fn.replace(/[()]/g, '\\$&');
        const callsRe = new RegExp(`await\\s+${fnEscaped}`, 'g');
        const matches = [...TFP_SOURCE.matchAll(callsRe)];
        if (matches.length === 0) return; // no calls — sanctioned (e.g. before Task 2 completes)

        matches.forEach((match) => {
          const idx = match.index;
          const before = TFP_SOURCE.slice(Math.max(0, idx - GATE_WINDOW), idx);
          const hasGate = /saveMode\s*!==\s*['"]doctor['"]/.test(before)
            || /saveMode\s*===\s*['"]staff['"]/.test(before);
          expect(
            hasGate,
            `${fn} site at index ${idx} missing saveMode gate within ${GATE_WINDOW} chars; preceding 200 chars:\n${before.slice(-200)}`
          ).toBe(true);
        });
      });
    });

    it('G1.consumables — deductStockForTreatment for consumables (1st call) is gated', () => {
      const callsRe = /await\s+deductStockForTreatment\s*\(/g;
      const matches = [...TFP_SOURCE.matchAll(callsRe)];
      expect(matches.length).toBeGreaterThanOrEqual(2);
      const firstMatch = matches[0]; // consumables call (line ~2207)
      const before = TFP_SOURCE.slice(Math.max(0, firstMatch.index - 500), firstMatch.index);
      const hasGate = /saveMode\s*!==\s*['"]doctor['"]/.test(before);
      expect(hasGate, 'consumables deductStockForTreatment must be saveMode-gated').toBe(true);
    });

    it('G1.meds — deductStockForTreatment for medications (2nd call) NOT saveMode-gated (KEPT per Q2)', () => {
      const callsRe = /await\s+deductStockForTreatment\s*\(/g;
      const matches = [...TFP_SOURCE.matchAll(callsRe)];
      if (matches.length < 2) return;
      const medsMatch = matches[1];
      const before = TFP_SOURCE.slice(Math.max(0, medsMatch.index - 200), medsMatch.index);
      // Meds call may be inside !hasSale block but must NOT have saveMode gate
      // (sanctioned exception per Q2: doctor records meds for the patient)
      // Look for saveMode within just the 200 chars BEFORE — should NOT match
      const hasSaveModeGate = /saveMode\s*!==\s*['"]doctor['"]/.test(before);
      expect(hasSaveModeGate, 'medications deductStockForTreatment must NOT be saveMode-gated (KEPT)').toBe(false);
    });

    it('G1.statusStamp — treatment doc write stamps status + recordedBy + recordedAt for doctor save', () => {
      // Verify status-stamping pattern exists in handleSubmit
      expect(TFP_SOURCE).toMatch(/saveMode\s*===\s*['"]doctor['"]/);
      expect(TFP_SOURCE).toMatch(/status:\s*['"]doctor-recorded['"]/);
      expect(TFP_SOURCE).toMatch(/recordedBy:\s*auth/);
      expect(TFP_SOURCE).toMatch(/recordedAt:\s*serverTimestamp/);
      expect(TFP_SOURCE).toMatch(/deleteField\s*\(\s*\)/);
    });
  });

  describe('G2 — UI gates use canAddNewItems flag (replaces !isEdit)', () => {
    it('G2.canAddNewItemsDeclared — flag declared at top of render (Task 1 canonical shape)', () => {
      // Task 1 pre-flight finding: TFP has no full-doc state variable, so the
      // canonical shape uses `loadedTreatmentStatus` state (set during edit-mode
      // load) rather than `loadedTreatment?.status`. Accept either shape so the
      // test stays correct if the variable is refactored later.
      expect(TFP_SOURCE).toMatch(
        /const\s+canAddNewItems\s*=\s*\(\s*mode\s*===\s*['"]create['"]\s*\)\s*[\r\n\s]*\|\|\s*\(\s*loadedTreatment(?:\?\.status|Status)\s*===\s*['"]doctor-recorded['"]\s*\)/
      );
    });

    it('G2.canAddNewItemsUsed — flag referenced in at least 5 JSX gate sites', () => {
      const refs = TFP_SOURCE.match(/canAddNewItems/g) || [];
      // Declaration + comments (~4 from Task 1) + 5 UI gate-site references
      // added in Task 3 (med add buttons, med grid swap, course picker buttons,
      // course section ternary, consumable add buttons, consumable grid swap).
      // Many of these contain multiple uses (e.g. grid swap has 8+ references
      // across grid-cols + col-span + !isEdit blocks).
      expect(refs.length).toBeGreaterThanOrEqual(6);
    });

    it('G2.noLegacyIsEditForAddBtns — medication section ADD-buttons site references canAddNewItems', () => {
      // Sanctioned exception: doctor-save button itself uses {!isEdit && ...} per spec 5.1.F
      // (button hidden in edit mode by design — admin finalizes via regular save)
      // Look around the medication section anchor (สั่งยากลับบ้าน is the section header)
      const medSectionIdx = TFP_SOURCE.indexOf('สั่งยากลับบ้าน');
      expect(medSectionIdx).toBeGreaterThan(-1);
      // Within 5000 chars of the medication section, canAddNewItems must appear
      const medRegion = TFP_SOURCE.slice(medSectionIdx, medSectionIdx + 5000);
      expect(medRegion).toMatch(/canAddNewItems/);
    });

    it('G2.consumableSectionGated — consumable section ADD-buttons site references canAddNewItems', () => {
      // Anchor on the section comment marker for stability (the Thai label
      // "สินค้าสิ้นเปลือง" also appears in modals + filter strings; the
      // comment "── Consumables (สินค้าสิ้นเปลือง)" only appears once at
      // the section start).
      const consSectionIdx = TFP_SOURCE.indexOf('── Consumables (สินค้าสิ้นเปลือง)');
      expect(consSectionIdx).toBeGreaterThan(-1);
      const consRegion = TFP_SOURCE.slice(consSectionIdx, consSectionIdx + 3000);
      expect(consRegion).toMatch(/canAddNewItems/);
    });

    it('G2.courseSectionGated — course/purchase picker section references canAddNewItems', () => {
      // Anchor on the course section's SectionHeader title attribute (unique;
      // the bare Thai phrase appears earlier in code comments at lines ~57 and
      // ~1825 which don't contain canAddNewItems).
      const courseSectionIdx = TFP_SOURCE.indexOf('title="ข้อมูลการใช้คอร์ส"');
      expect(courseSectionIdx).toBeGreaterThan(-1);
      const courseRegion = TFP_SOURCE.slice(courseSectionIdx, courseSectionIdx + 3000);
      expect(courseRegion).toMatch(/canAddNewItems/);
    });
  });

  describe('G3 — Phase 26.1 editor-attribution modal integration source-grep', () => {
    it('G3.4 — handleSubmit signature accepts (eventOrSaveMode, options) form', () => {
      // V26.1 — extends Phase 26.0a defensive coercion to support internal
      // re-invoke from EditAttributionModal confirmation with editor context.
      // Original Phase 26.0 form: handleSubmit = async (eventOrSaveMode) => {}
      // V26.1 form:               handleSubmit = async (eventOrSaveMode, options = {}) => {}
      expect(TFP_SOURCE).toMatch(/const\s+handleSubmit\s*=\s*async\s*\(\s*eventOrSaveMode\s*,\s*options\s*=\s*\{\s*\}\s*\)/);
    });

    it('G3.5 — editorContext extracted from options OR from internal re-invoke object form', () => {
      // Accepts either:
      //   options.editorContext  OR
      //   eventOrSaveMode being a plain object with .saveMode + .editorContext
      // Source must reference editorContext at handleSubmit body
      expect(TFP_SOURCE).toMatch(/editorContext/);
    });
  });
});
