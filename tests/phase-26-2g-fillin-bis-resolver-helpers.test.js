// tests/phase-26-2g-fillin-bis-resolver-helpers.test.js
// Phase 26.2g-fillin-bis — resolvePatient* canonical resolver contract.
// These resolvers read CANONICAL camelCase fields on be_customers.patientData
// (congenitalDisease/drugAllergy/foodAllergy/beforeTreatment/pregnanted) which
// are populated by buildPatientDataFromForm at write time for BOTH admin AND
// kiosk paths (kiosk-shape pre-derived to canonical strings via
// kioskPatientToCanonical before customer doc write).

import { describe, it, expect } from 'vitest';
import {
  resolvePatientCongenitalDisease,
  resolvePatientDrugAllergy,
  resolvePatientTreatmentHistory,
  BEFORE_TREATMENT_LABEL_PREFIX,
  DRUG_ALLERGY_LABEL_PREFIX,
  FOOD_ALLERGY_LABEL_PREFIX,
  PREGNANCY_LABEL_PREFIX,
} from '../src/lib/patientHealthMapping.js';

describe('R1 — resolvePatientCongenitalDisease', () => {
  it('R1.1 — empty / null / non-object / empty object → ""', () => {
    expect(resolvePatientCongenitalDisease(null)).toBe('');
    expect(resolvePatientCongenitalDisease(undefined)).toBe('');
    expect(resolvePatientCongenitalDisease('string')).toBe('');
    expect(resolvePatientCongenitalDisease(42)).toBe('');
    expect(resolvePatientCongenitalDisease({})).toBe('');
  });

  it('R1.2 — empty string / whitespace-only string → ""', () => {
    expect(resolvePatientCongenitalDisease({ congenitalDisease: '' })).toBe('');
    expect(resolvePatientCongenitalDisease({ congenitalDisease: '   ' })).toBe('');
  });

  it('R1.3 — value preserved verbatim (trimmed)', () => {
    expect(resolvePatientCongenitalDisease({ congenitalDisease: 'ง่วง' })).toBe('ง่วง');
    expect(resolvePatientCongenitalDisease({ congenitalDisease: '  ง่วง  ' })).toBe('ง่วง');
  });

  it('R1.4 — non-string field type silently ignored (typeof-guard lock)', () => {
    expect(resolvePatientCongenitalDisease({ congenitalDisease: 42 })).toBe('');
    expect(resolvePatientCongenitalDisease({ congenitalDisease: null })).toBe('');
    expect(resolvePatientCongenitalDisease({ congenitalDisease: [] })).toBe('');
    expect(resolvePatientCongenitalDisease({ congenitalDisease: {} })).toBe('');
  });

  it('R1.5 — kiosk-derived value preserved verbatim (comma-joined Thai labels)', () => {
    // After kioskPatientToCanonical pre-derives ud_* → labels, the canonical
    // string lands on patientData.congenitalDisease. Resolver passes through.
    expect(resolvePatientCongenitalDisease({ congenitalDisease: 'ความดันโลหิตสูง, เบาหวาน' }))
      .toBe('ความดันโลหิตสูง, เบาหวาน');
  });

  it('R1.6 — admin-typed value preserved verbatim', () => {
    expect(resolvePatientCongenitalDisease({ congenitalDisease: 'ภูมิแพ้อากาศ' }))
      .toBe('ภูมิแพ้อากาศ');
  });
});

describe('R2 — resolvePatientDrugAllergy', () => {
  it('R2.1 — empty / null / non-object → ""', () => {
    expect(resolvePatientDrugAllergy(null)).toBe('');
    expect(resolvePatientDrugAllergy(undefined)).toBe('');
    expect(resolvePatientDrugAllergy({})).toBe('');
    expect(resolvePatientDrugAllergy('string')).toBe('');
  });

  it('R2.2 — drug only → raw value (no prefix; TFP textarea label provides context)', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: 'พารา' })).toBe('พารา');
    expect(resolvePatientDrugAllergy({ drugAllergy: 'shrimp' })).toBe('shrimp');
  });

  it('R2.3 — food only → "แพ้อาหาร: <food>" (prefixed for disambiguation)', () => {
    expect(resolvePatientDrugAllergy({ foodAllergy: 'ขนมถ้วย' }))
      .toBe('แพ้อาหาร: ขนมถ้วย');
  });

  it('R2.4 — both → "แพ้ยา: <drug> / แพ้อาหาร: <food>" (locked literal)', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: 'พารา', foodAllergy: 'ขนมถ้วย' }))
      .toBe('แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย');
  });

  it('R2.5 — drug with surrounding whitespace + food empty → trimmed raw drug', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: '  พารา  ', foodAllergy: '' }))
      .toBe('พารา');
  });

  it('R2.6 — drug empty + food whitespace → ""', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: '', foodAllergy: '   ' })).toBe('');
  });

  it('R2.7 — both with surrounding whitespace → trimmed prefixed', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: '  พารา  ', foodAllergy: '  ขนมถ้วย  ' }))
      .toBe('แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย');
  });

  it('R2.8 — non-string drugAllergy silently ignored (typeof-guard lock)', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: 42 })).toBe('');
    expect(resolvePatientDrugAllergy({ drugAllergy: null })).toBe('');
    expect(resolvePatientDrugAllergy({ drugAllergy: [] })).toBe('');
  });

  it('R2.9 — non-string foodAllergy silently ignored (typeof-guard lock)', () => {
    expect(resolvePatientDrugAllergy({ foodAllergy: 42 })).toBe('');
    expect(resolvePatientDrugAllergy({ foodAllergy: null })).toBe('');
    expect(resolvePatientDrugAllergy({ foodAllergy: [] })).toBe('');
  });

  it('R2.10 — drug value with internal spaces preserved', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: 'Penicillin Group B' }))
      .toBe('Penicillin Group B');
  });
});

describe('R3 — resolvePatientTreatmentHistory', () => {
  it('R3.1 — empty / null / non-object → ""', () => {
    expect(resolvePatientTreatmentHistory(null)).toBe('');
    expect(resolvePatientTreatmentHistory(undefined)).toBe('');
    expect(resolvePatientTreatmentHistory({})).toBe('');
    expect(resolvePatientTreatmentHistory('string')).toBe('');
  });

  it('R3.2 — beforeTreatment only → "การรักษาก่อนหน้า: <value>"', () => {
    expect(resolvePatientTreatmentHistory({ beforeTreatment: 'X-ray' }))
      .toBe('การรักษาก่อนหน้า: X-ray');
  });

  it('R3.3 — pregnanted=true only → "การตั้งครรภ์: กำลังตั้งครรภ์"', () => {
    expect(resolvePatientTreatmentHistory({ pregnanted: true }))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('R3.4 — both present → joined by " / " with beforeTreatment first', () => {
    expect(resolvePatientTreatmentHistory({ beforeTreatment: 'X-ray', pregnanted: true }))
      .toBe('การรักษาก่อนหน้า: X-ray / การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('R3.5 — pregnanted=false → no pregnancy entry', () => {
    expect(resolvePatientTreatmentHistory({ pregnanted: false })).toBe('');
    expect(resolvePatientTreatmentHistory({ beforeTreatment: 'X-ray', pregnanted: false }))
      .toBe('การรักษาก่อนหน้า: X-ray');
  });

  it('R3.6 — pregnanted non-boolean (null/undefined/string "true") → no entry (strict boolean check)', () => {
    expect(resolvePatientTreatmentHistory({ pregnanted: null })).toBe('');
    expect(resolvePatientTreatmentHistory({ pregnanted: undefined })).toBe('');
    expect(resolvePatientTreatmentHistory({ pregnanted: 'true' })).toBe('');
    expect(resolvePatientTreatmentHistory({ pregnanted: 1 })).toBe('');
  });

  it('R3.7 — beforeTreatment whitespace-only → ignored', () => {
    expect(resolvePatientTreatmentHistory({ beforeTreatment: '   ' })).toBe('');
    expect(resolvePatientTreatmentHistory({ beforeTreatment: '   ', pregnanted: true }))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('R3.8 — non-string beforeTreatment silently ignored (typeof-guard lock)', () => {
    expect(resolvePatientTreatmentHistory({ beforeTreatment: 42 })).toBe('');
    expect(resolvePatientTreatmentHistory({ beforeTreatment: null })).toBe('');
    expect(resolvePatientTreatmentHistory({ beforeTreatment: [] })).toBe('');
  });

  it('R3.9 — insertion order locked: beforeTreatment first, pregnancy second', () => {
    // Even if we pass props in reverse order, output order is fixed
    const pd = { pregnanted: true, beforeTreatment: 'X-ray' };
    expect(resolvePatientTreatmentHistory(pd))
      .toBe('การรักษาก่อนหน้า: X-ray / การตั้งครรภ์: กำลังตั้งครรภ์');
  });
});

describe('R4 — Exported label prefix constants', () => {
  it('R4.1 — BEFORE_TREATMENT_LABEL_PREFIX is the locked Thai literal', () => {
    expect(BEFORE_TREATMENT_LABEL_PREFIX).toBe('การรักษาก่อนหน้า: ');
  });

  it('R4.2 — DRUG_ALLERGY_LABEL_PREFIX is the locked Thai literal', () => {
    expect(DRUG_ALLERGY_LABEL_PREFIX).toBe('แพ้ยา: ');
  });

  it('R4.3 — FOOD_ALLERGY_LABEL_PREFIX is the locked Thai literal', () => {
    expect(FOOD_ALLERGY_LABEL_PREFIX).toBe('แพ้อาหาร: ');
  });

  it('R4.4 — PREGNANCY_LABEL_PREFIX (reused) is the locked Thai literal', () => {
    expect(PREGNANCY_LABEL_PREFIX).toBe('การตั้งครรภ์: ');
  });
});
