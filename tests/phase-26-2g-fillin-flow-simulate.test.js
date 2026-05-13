// tests/phase-26-2g-fillin-flow-simulate.test.js
// Phase 26.2g-fillin — Rule I full-flow simulate.
// Chains: patientData (from customer doc) → TFP load (create-mode) →
// derivePatient* helpers → setter calls. Verifies the END-TO-END behavior
// per Rule I "tests must chain the whole user flow, not just one function".

import { describe, it, expect } from 'vitest';
import {
  derivePatientCongenitalDisease,
  derivePatientTreatmentHistory,
} from '../src/lib/patientHealthMapping.js';

// Pure simulate mirror of the TFP create-mode auto-fill block (TFP:1022-1034).
// Returns the setter call-log so we can assert what would fire in the real TFP.
function simulateTfpCreateModeAutoFill({ patientData, isEdit }) {
  const calls = [];
  const setBloodType = v => calls.push(['setBloodType', v]);
  const setDrugAllergy = v => calls.push(['setDrugAllergy', v]);
  const setCongenitalDisease = v => calls.push(['setCongenitalDisease', v]);
  const setTreatmentHistory = v => calls.push(['setTreatmentHistory', v]);

  // Mirror TFP:1022-1034 exactly
  if (patientData) {
    if (patientData.bloodType && !isEdit) setBloodType(patientData.bloodType);
    if (patientData.allergiesDetail && !isEdit) setDrugAllergy(patientData.allergiesDetail);
    if (!isEdit) {
      const derivedCongenital = derivePatientCongenitalDisease(patientData);
      if (derivedCongenital) setCongenitalDisease(derivedCongenital);
      const derivedHistory = derivePatientTreatmentHistory(patientData);
      if (derivedHistory) setTreatmentHistory(derivedHistory);
    }
  }
  return calls;
}

describe('F1 — TFP create-mode auto-fill end-to-end', () => {
  it('F1.1 — patient with chronic + medication + pregnancy → both setters fire with derived strings', () => {
    const patientData = {
      bloodType: 'O+',
      allergiesDetail: 'แพ้ Penicillin',
      hasUnderlying: 'มี',
      ud_diabetes: true,
      ud_hypertension: true,
      ud_other: true,
      ud_otherDetail: 'ไมเกรน',
      currentMedication: 'Asprin 1 เม็ด เช้า',
      pregnancy: 'กำลังตั้งครรภ์',
    };
    const calls = simulateTfpCreateModeAutoFill({ patientData, isEdit: false });

    // Bloodtype + drug allergy still work (V21 anti-regression — pre-existing behavior preserved)
    expect(calls).toContainEqual(['setBloodType', 'O+']);
    expect(calls).toContainEqual(['setDrugAllergy', 'แพ้ Penicillin']);

    // NEW Phase 26.2g-fillin behavior
    expect(calls).toContainEqual(['setCongenitalDisease', 'ความดันโลหิตสูง, เบาหวาน, ไมเกรน']);
    expect(calls).toContainEqual(['setTreatmentHistory', 'การตั้งครรภ์: กำลังตั้งครรภ์ / ยาที่ใช้ประจำ: Asprin 1 เม็ด เช้า']);
  });

  it('F1.2 — patient with hasUnderlying="ไม่มี" + sentinel pregnancy + no med → neither new setter fires', () => {
    const patientData = {
      bloodType: 'A+',
      hasUnderlying: 'ไม่มี',
      ud_diabetes: true, // self-contradiction — should be ignored
      pregnancy: 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์',
      currentMedication: '',
    };
    const calls = simulateTfpCreateModeAutoFill({ patientData, isEdit: false });

    expect(calls).toContainEqual(['setBloodType', 'A+']);
    // No setCongenitalDisease — empty result → gated out
    expect(calls.find(c => c[0] === 'setCongenitalDisease')).toBeUndefined();
    expect(calls.find(c => c[0] === 'setTreatmentHistory')).toBeUndefined();
  });

  it('F1.3 — edit mode (isEdit=true) → NO auto-fill fires regardless of patientData', () => {
    const patientData = {
      bloodType: 'B+',
      allergiesDetail: 'แพ้',
      hasUnderlying: 'มี',
      ud_diabetes: true,
      pregnancy: 'กำลังตั้งครรภ์',
      currentMedication: 'Asprin',
    };
    const calls = simulateTfpCreateModeAutoFill({ patientData, isEdit: true });

    // Gate respected — nothing fires in edit mode
    expect(calls).toEqual([]);
  });
});
