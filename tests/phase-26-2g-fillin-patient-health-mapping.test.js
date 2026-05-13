// tests/phase-26-2g-fillin-patient-health-mapping.test.js
// Phase 26.2g-fillin — patientData → TFP health-state derivation contract.
// Locks the canonical mapping that closes the create-mode auto-fill gap
// (V12 multi-reader-sweep family — bloodType + drugAllergy were filled,
// congenitalDisease + treatmentHistory were silently dropped).

import { describe, it, expect } from 'vitest';
import {
  derivePatientCongenitalDisease,
  derivePatientTreatmentHistory,
  PREGNANCY_LABEL_PREFIX,
  MEDICATION_LABEL_PREFIX,
  UD_LABELS,
} from '../src/lib/patientHealthMapping.js';

describe('L1 — derivePatientCongenitalDisease', () => {
  it('L1.1 — returns empty for null / undefined / non-object / empty object', () => {
    expect(derivePatientCongenitalDisease(null)).toBe('');
    expect(derivePatientCongenitalDisease(undefined)).toBe('');
    expect(derivePatientCongenitalDisease('string')).toBe('');
    expect(derivePatientCongenitalDisease(42)).toBe('');
    expect(derivePatientCongenitalDisease({})).toBe('');
  });

  it('L1.2 — hasUnderlying="ไม่มี" wins over any ud_* flags (self-contradiction guard)', () => {
    const pd = { hasUnderlying: 'ไม่มี', ud_diabetes: true, ud_hypertension: true };
    expect(derivePatientCongenitalDisease(pd)).toBe('');
  });

  it('L1.3 — single flag returns the corresponding Thai label', () => {
    expect(derivePatientCongenitalDisease({ hasUnderlying: 'มี', ud_diabetes: true }))
      .toBe('เบาหวาน');
  });

  it('L1.4 — two flags comma-join in UI order (hypertension before diabetes)', () => {
    const pd = { hasUnderlying: 'มี', ud_diabetes: true, ud_hypertension: true };
    expect(derivePatientCongenitalDisease(pd)).toBe('ความดันโลหิตสูง, เบาหวาน');
  });

  it('L1.5 — all 6 standard flags emit all 6 Thai labels in UI order', () => {
    const pd = {
      hasUnderlying: 'มี',
      ud_hypertension: true,
      ud_diabetes: true,
      ud_lung: true,
      ud_kidney: true,
      ud_heart: true,
      ud_blood: true,
    };
    expect(derivePatientCongenitalDisease(pd)).toBe(
      'ความดันโลหิตสูง, เบาหวาน, โรคปอด, โรคไต, โรคหัวใจ, โรคโลหิต'
    );
  });

  it('L1.6 — ud_other + ud_otherDetail returns the detail string', () => {
    const pd = { hasUnderlying: 'มี', ud_other: true, ud_otherDetail: 'ไมเกรน' };
    expect(derivePatientCongenitalDisease(pd)).toBe('ไมเกรน');
  });

  it('L1.7 — ud_other without ud_otherDetail (or whitespace) is silently omitted', () => {
    expect(derivePatientCongenitalDisease({ hasUnderlying: 'มี', ud_other: true })).toBe('');
    expect(derivePatientCongenitalDisease({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: '' })).toBe('');
    expect(derivePatientCongenitalDisease({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: '   ' })).toBe('');
  });

  it('L1.8 — standard flags emit BEFORE ud_other detail (insertion order locked)', () => {
    const pd = { hasUnderlying: 'มี', ud_diabetes: true, ud_other: true, ud_otherDetail: 'ไมเกรน' };
    expect(derivePatientCongenitalDisease(pd)).toBe('เบาหวาน, ไมเกรน');
  });

  it('L1.9 — UD_LABELS map is frozen', () => {
    expect(Object.isFrozen(UD_LABELS)).toBe(true);
    expect(UD_LABELS.ud_diabetes).toBe('เบาหวาน');
  });
});

describe('L2 — derivePatientTreatmentHistory', () => {
  it('L2.1 — empty / null / non-object → empty', () => {
    expect(derivePatientTreatmentHistory(null)).toBe('');
    expect(derivePatientTreatmentHistory(undefined)).toBe('');
    expect(derivePatientTreatmentHistory({})).toBe('');
    expect(derivePatientTreatmentHistory('string')).toBe('');
  });

  it('L2.2 — sentinel pregnancy + no medication → empty', () => {
    expect(derivePatientTreatmentHistory({ pregnancy: 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์', currentMedication: '' }))
      .toBe('');
  });

  it('L2.3 — non-sentinel pregnancy + no medication → pregnancy-only part', () => {
    expect(derivePatientTreatmentHistory({ pregnancy: 'กำลังตั้งครรภ์', currentMedication: '' }))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('L2.4 — empty pregnancy + medication → medication-only part', () => {
    expect(derivePatientTreatmentHistory({ pregnancy: '', currentMedication: 'Asprin' }))
      .toBe('ยาที่ใช้ประจำ: Asprin');
  });

  it('L2.5 — both parts present → " / "-joined, pregnancy first', () => {
    const pd = { pregnancy: 'กำลังตั้งครรภ์', currentMedication: 'Asprin 1 เม็ด เช้า' };
    expect(derivePatientTreatmentHistory(pd))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์ / ยาที่ใช้ประจำ: Asprin 1 เม็ด เช้า');
  });

  it('L2.6 — medication is trimmed on output', () => {
    expect(derivePatientTreatmentHistory({ currentMedication: '   Asprin   ' }))
      .toBe('ยาที่ใช้ประจำ: Asprin');
    // pure whitespace → drop entirely
    expect(derivePatientTreatmentHistory({ currentMedication: '   ' })).toBe('');
  });
});

describe('L3 — Exported label prefix constants', () => {
  it('L3.1 — PREGNANCY_LABEL_PREFIX is the locked Thai literal', () => {
    expect(PREGNANCY_LABEL_PREFIX).toBe('การตั้งครรภ์: ');
  });

  it('L3.2 — MEDICATION_LABEL_PREFIX is the locked Thai literal', () => {
    expect(MEDICATION_LABEL_PREFIX).toBe('ยาที่ใช้ประจำ: ');
  });
});
