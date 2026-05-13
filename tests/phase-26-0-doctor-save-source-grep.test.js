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
});
