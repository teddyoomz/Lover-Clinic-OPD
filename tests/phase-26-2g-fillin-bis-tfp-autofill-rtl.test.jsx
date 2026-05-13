// tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx
// Phase 26.2g-fillin-bis — RTL TFP auto-fill verification.
// Uses static resolver verification rather than full TFP mount because
// TFP has heavy Firebase + scopedDataLayer deps. The RT contract: when TFP load
// effect runs with given patientData, the setter call → state update → textarea
// value matches the resolver output.

import { describe, it, expect, vi } from 'vitest';

// Mock all heavy deps
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  collection: () => ({}),
  getDoc: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(),
  deleteDoc: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(),
  orderBy: vi.fn(), writeBatch: vi.fn(() => ({ commit: vi.fn() })),
  runTransaction: vi.fn(), onSnapshot: vi.fn(),
}));

import {
  resolvePatientCongenitalDisease,
  resolvePatientDrugAllergy,
  resolvePatientTreatmentHistory,
} from '../src/lib/patientHealthMapping.js';

// Synthesize 7 scenarios reflecting the matrix in spec §9
describe('RTL — TFP auto-fill scenarios (resolver output verification)', () => {
  it('R-SC1 — Kiosk-derived chronic + allergy → all 3 textareas auto-fill', () => {
    // After kioskPatientToCanonical + buildPatientDataFromForm:
    const customerPatientData = {
      bloodType: 'O+',
      congenitalDisease: 'ความดันโลหิตสูง, เบาหวาน',
      drugAllergy: 'shrimp',
      // foodAllergy + beforeTreatment + pregnanted absent (kiosk doesn't fill)
    };
    expect(resolvePatientCongenitalDisease(customerPatientData))
      .toBe('ความดันโลหิตสูง, เบาหวาน');
    expect(resolvePatientDrugAllergy(customerPatientData)).toBe('shrimp');
    expect(resolvePatientTreatmentHistory(customerPatientData)).toBe('');
  });

  it('R-SC2 — Admin-only fields (all 5 populated) → all 4 textareas auto-fill', () => {
    const customerPatientData = {
      bloodType: 'A+',
      congenitalDisease: 'ง่วง',
      drugAllergy: 'พารา',
      foodAllergy: 'ขนมถ้วย',
      beforeTreatment: 'MRI',
      pregnanted: true,
    };
    expect(resolvePatientCongenitalDisease(customerPatientData)).toBe('ง่วง');
    expect(resolvePatientDrugAllergy(customerPatientData))
      .toBe('แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย');
    expect(resolvePatientTreatmentHistory(customerPatientData))
      .toBe('การรักษาก่อนหน้า: MRI / การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('R-SC3 — Mixed: admin-typed string overrides kiosk-derived (admin wins via canonical pre-derive)', () => {
    // If admin EDITS a kiosk-created customer, the form save call would
    // OVERWRITE patientData.congenitalDisease with the admin-typed string.
    // So at TFP-time, only one value exists — the admin value.
    const customerPatientData = {
      congenitalDisease: 'ง่วง', // admin overwrote kiosk-derived "เบาหวาน"
    };
    expect(resolvePatientCongenitalDisease(customerPatientData)).toBe('ง่วง');
  });

  it('R-SC4 — Empty patientData → no resolver fires → textareas stay placeholder', () => {
    const customerPatientData = {};
    expect(resolvePatientCongenitalDisease(customerPatientData)).toBe('');
    expect(resolvePatientDrugAllergy(customerPatientData)).toBe('');
    expect(resolvePatientTreatmentHistory(customerPatientData)).toBe('');
  });

  it('R-SC5 — User-reported bug fixture: admin LC-26000001 with ง่วง+พารา+ขนมถ้วย', () => {
    // EXACT reproduction of the bug user reported via screenshot.
    const lc26000001PatientData = {
      bloodType: 'O',
      congenitalDisease: 'ง่วง',
      drugAllergy: 'พารา',
      foodAllergy: 'ขนมถ้วย',
      // no kiosk-shape fields (admin-created)
    };
    expect(resolvePatientCongenitalDisease(lc26000001PatientData)).toBe('ง่วง');
    expect(resolvePatientDrugAllergy(lc26000001PatientData))
      .toBe('แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย');
    expect(resolvePatientTreatmentHistory(lc26000001PatientData)).toBe('');
  });

  it('R-SC6 — Edge: pregnanted-only kiosk (no beforeTreatment) → "กำลังตั้งครรภ์" prefix only', () => {
    const customerPatientData = {
      pregnanted: true,
      // No beforeTreatment
    };
    expect(resolvePatientTreatmentHistory(customerPatientData))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('R-SC7 — Edge: drug + food whitespace + actual food value → trimmed prefixed display', () => {
    const customerPatientData = {
      drugAllergy: '   ',
      foodAllergy: 'นม',
    };
    expect(resolvePatientDrugAllergy(customerPatientData)).toBe('แพ้อาหาร: นม');
  });
});
