// tests/phase-26-2g-fillin-followup-english-helper.test.js
// Phase 26.2g-fillin-followup — derivePatientCongenitalDiseaseEnglish contract.
// Mirrors the Thai L1.1-L1.10 unit suite + adds L1.11-EN formal-clinical
// label verification + L1.12-EN byte-identical output contract.
// EN labels are intentionally MORE FORMAL than PatientForm UI labels
// (Diabetes Mellitus / Chronic Kidney Disease / Hematological Disease)
// because OPD print is clinical documentation, not lay-friendly UI.

import { describe, it, expect } from 'vitest';
import {
  derivePatientCongenitalDiseaseEnglish,
  UD_LABELS_EN,
} from '../src/lib/patientHealthMapping.js';

describe('L1-EN — derivePatientCongenitalDiseaseEnglish', () => {
  it('L1.1-EN — returns empty for null / undefined / non-object / empty object', () => {
    expect(derivePatientCongenitalDiseaseEnglish(null)).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish(undefined)).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish('string')).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish(42)).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish({})).toBe('');
  });

  it('L1.2-EN — hasUnderlying="ไม่มี" wins over any ud_* flags (self-contradiction guard)', () => {
    // Gate key value is Thai ('มี' / 'ไม่มี') because patientData shape is
    // language-agnostic — only output labels differ.
    const pd = { hasUnderlying: 'ไม่มี', ud_diabetes: true, ud_hypertension: true };
    expect(derivePatientCongenitalDiseaseEnglish(pd)).toBe('');
  });

  it('L1.3-EN — single flag returns the corresponding English label', () => {
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_diabetes: true }))
      .toBe('Diabetes Mellitus');
  });

  it('L1.4-EN — two flags comma-join in UI order (hypertension before diabetes)', () => {
    const pd = { hasUnderlying: 'มี', ud_diabetes: true, ud_hypertension: true };
    expect(derivePatientCongenitalDiseaseEnglish(pd)).toBe('Hypertension, Diabetes Mellitus');
  });

  it('L1.5-EN — all 6 standard flags emit all 6 English labels in UI order', () => {
    const pd = {
      hasUnderlying: 'มี',
      ud_hypertension: true,
      ud_diabetes: true,
      ud_lung: true,
      ud_kidney: true,
      ud_heart: true,
      ud_blood: true,
    };
    expect(derivePatientCongenitalDiseaseEnglish(pd)).toBe(
      'Hypertension, Diabetes Mellitus, Lung Disease, Chronic Kidney Disease, Heart Disease, Hematological Disease'
    );
  });

  it('L1.6-EN — ud_other + ud_otherDetail returns the detail string', () => {
    const pd = { hasUnderlying: 'มี', ud_other: true, ud_otherDetail: 'Migraine' };
    expect(derivePatientCongenitalDiseaseEnglish(pd)).toBe('Migraine');
  });

  it('L1.7-EN — ud_other without ud_otherDetail (or whitespace) is silently omitted', () => {
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true })).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: '' })).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: '   ' })).toBe('');
  });

  it('L1.8-EN — standard flags emit BEFORE ud_other detail (insertion order locked)', () => {
    const pd = { hasUnderlying: 'มี', ud_diabetes: true, ud_other: true, ud_otherDetail: 'Migraine' };
    expect(derivePatientCongenitalDiseaseEnglish(pd)).toBe('Diabetes Mellitus, Migraine');
  });

  it('L1.9-EN — UD_LABELS_EN map is frozen + Diabetes Mellitus value lock', () => {
    expect(Object.isFrozen(UD_LABELS_EN)).toBe(true);
    expect(UD_LABELS_EN.ud_diabetes).toBe('Diabetes Mellitus');
  });

  it('L1.10-EN — non-string ud_otherDetail is silently omitted (typeof-guard lock)', () => {
    // Lock the `typeof patientData.ud_otherDetail === 'string'` defensive guard.
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: 99 }))
      .toBe('');
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: null }))
      .toBe('');
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: [] }))
      .toBe('');
  });

  it('L1.11-EN — formal-clinical label verbatim string lock (all 6 labels)', () => {
    expect(UD_LABELS_EN).toEqual({
      ud_hypertension: 'Hypertension',
      ud_diabetes: 'Diabetes Mellitus',
      ud_lung: 'Lung Disease',
      ud_kidney: 'Chronic Kidney Disease',
      ud_heart: 'Heart Disease',
      ud_blood: 'Hematological Disease',
    });
  });

  it('L1.12-EN — byte-identical OPD print output contract (all 6 flags + ud_other detail)', () => {
    const pd = {
      hasUnderlying: 'มี',
      ud_hypertension: true,
      ud_diabetes: true,
      ud_lung: true,
      ud_kidney: true,
      ud_heart: true,
      ud_blood: true,
      ud_other: true,
      ud_otherDetail: 'Migraine',
    };
    expect(derivePatientCongenitalDiseaseEnglish(pd))
      .toBe('Hypertension, Diabetes Mellitus, Lung Disease, Chronic Kidney Disease, Heart Disease, Hematological Disease, Migraine');
  });
});
