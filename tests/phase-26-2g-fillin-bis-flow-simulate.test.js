// tests/phase-26-2g-fillin-bis-flow-simulate.test.js
// Phase 26.2g-fillin-bis — Rule I full-flow simulate.
// Chains REAL helpers across the data path:
//   opd_session.patientData → kioskPatientToCanonical → canonical form
//                          → buildPatientDataFromForm → be_customers.patientData
//                          → resolvePatient* → setter call
// Verifies END-TO-END behavior per Rule I "tests must chain the whole user flow".

import { describe, it, expect, vi } from 'vitest';

// Mock firebase before importing backendClient (needed for buildPatientDataFromForm)
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  collection: () => ({}),
  getDoc: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(),
  deleteDoc: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(),
  orderBy: vi.fn(), writeBatch: vi.fn(() => ({ commit: vi.fn() })),
  runTransaction: vi.fn(), onSnapshot: vi.fn(),
}));

import { kioskPatientToCanonical } from '../src/lib/kioskPatientToCanonical.js';
const { buildPatientDataFromForm } = await import('../src/lib/backendClient.js');
import {
  resolvePatientCongenitalDisease,
  resolvePatientDrugAllergy,
  resolvePatientTreatmentHistory,
} from '../src/lib/patientHealthMapping.js';

// Pure simulate mirror of TFP create-mode auto-fill block (post-bis).
// Returns the setter call-log so we can assert what would fire in the real TFP.
function simulateTfpCreateModeAutoFill({ patientData, isEdit }) {
  const calls = [];
  const setBloodType = v => calls.push(['setBloodType', v]);
  const setCongenitalDisease = v => calls.push(['setCongenitalDisease', v]);
  const setDrugAllergy = v => calls.push(['setDrugAllergy', v]);
  const setTreatmentHistory = v => calls.push(['setTreatmentHistory', v]);

  // Mirror TFP post-bis exactly
  if (patientData) {
    if (patientData.bloodType && !isEdit) setBloodType(patientData.bloodType);
    if (!isEdit) {
      const congenital = resolvePatientCongenitalDisease(patientData);
      if (congenital) setCongenitalDisease(congenital);
      const allergy = resolvePatientDrugAllergy(patientData);
      if (allergy) setDrugAllergy(allergy);
      const history = resolvePatientTreatmentHistory(patientData);
      if (history) setTreatmentHistory(history);
    }
  }
  return calls;
}

describe('FB1 — Kiosk path: chronic (hasUnderlying + ud_*)', () => {
  it('FB1.1 — kiosk patientData with ud_diabetes+ud_hypertension chains to canonical congenitalDisease', () => {
    // Step 1: opd_session.patientData (kiosk shape)
    const opdSession = {
      hasUnderlying: 'มี',
      ud_diabetes: true,
      ud_hypertension: true,
      firstName: 'TestK1',
      bloodType: 'O+',
    };

    // Step 2: kioskPatientToCanonical → canonical snake_case form
    const form = kioskPatientToCanonical(opdSession);
    expect(form.congenital_disease).toBe('ความดันโลหิตสูง, เบาหวาน');
    expect(form.blood_type).toBe('O+');

    // Step 3: buildPatientDataFromForm → be_customers.patientData
    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.congenitalDisease).toBe('ความดันโลหิตสูง, เบาหวาน');
    expect(customerPatientData.bloodType).toBe('O+');
    // Kiosk-shape fields NOT preserved on customer doc
    expect(customerPatientData.hasUnderlying).toBeUndefined();
    expect(customerPatientData.ud_diabetes).toBeUndefined();

    // Step 4: resolver reads canonical
    expect(resolvePatientCongenitalDisease(customerPatientData))
      .toBe('ความดันโลหิตสูง, เบาหวาน');

    // Step 5: TFP setter chain
    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual(['setBloodType', 'O+']);
    expect(calls).toContainEqual(['setCongenitalDisease', 'ความดันโลหิตสูง, เบาหวาน']);
  });

  it('FB1.2 — kiosk with ud_other+ud_otherDetail chains to detail string', () => {
    const opdSession = {
      hasUnderlying: 'มี',
      ud_other: true,
      ud_otherDetail: 'Migraine',
      firstName: 'TestK1b',
    };
    const form = kioskPatientToCanonical(opdSession);
    expect(form.congenital_disease).toBe('Migraine');

    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.congenitalDisease).toBe('Migraine');

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual(['setCongenitalDisease', 'Migraine']);
  });

  it('FB1.3 — kiosk with hasUnderlying="ไม่มี" → empty canonical → no setter fires', () => {
    const opdSession = { hasUnderlying: 'ไม่มี', ud_diabetes: true, firstName: 'TestK1c' };
    const form = kioskPatientToCanonical(opdSession);
    expect(form.congenital_disease).toBe('');

    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.congenitalDisease).toBeUndefined();

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls.find(c => c[0] === 'setCongenitalDisease')).toBeUndefined();
  });
});

describe('FB2 — Kiosk path: allergy (hasAllergies + allergiesDetail)', () => {
  it('FB2.1 — kiosk allergiesDetail flows to canonical drugAllergy → raw display', () => {
    const opdSession = {
      hasAllergies: 'มี',
      allergiesDetail: 'shrimp',
      firstName: 'TestK2',
    };
    const form = kioskPatientToCanonical(opdSession);
    expect(form.history_of_drug_allergy).toBe('shrimp');
    expect(form.history_of_food_allergy).toBeUndefined();

    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.drugAllergy).toBe('shrimp');
    expect(customerPatientData.foodAllergy).toBeUndefined();
    // Kiosk-shape allergiesDetail NOT preserved
    expect(customerPatientData.allergiesDetail).toBeUndefined();

    // Resolver: drug-only → raw value
    expect(resolvePatientDrugAllergy(customerPatientData)).toBe('shrimp');

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual(['setDrugAllergy', 'shrimp']);
  });

  it('FB2.2 — kiosk hasAllergies="ไม่มี" → empty canonical → no setter fires', () => {
    const opdSession = {
      hasAllergies: 'ไม่มี',
      allergiesDetail: 'shrimp', // ignored because hasAllergies is ไม่มี
      firstName: 'TestK2b',
    };
    const form = kioskPatientToCanonical(opdSession);
    expect(form.history_of_drug_allergy).toBe('');

    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.drugAllergy).toBeUndefined();

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls.find(c => c[0] === 'setDrugAllergy')).toBeUndefined();
  });
});

describe('FB3 — Admin path: direct canonical fields', () => {
  it('FB3.1 — admin form with congenital_disease+history_of_drug+food chains correctly', () => {
    const form = {
      firstname: 'TestA1',
      lastname: 'Admin',
      congenital_disease: 'ง่วง',
      history_of_drug_allergy: 'พารา',
      history_of_food_allergy: 'ขนมถ้วย',
    };
    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.congenitalDisease).toBe('ง่วง');
    expect(customerPatientData.drugAllergy).toBe('พารา');
    expect(customerPatientData.foodAllergy).toBe('ขนมถ้วย');

    expect(resolvePatientCongenitalDisease(customerPatientData)).toBe('ง่วง');
    expect(resolvePatientDrugAllergy(customerPatientData))
      .toBe('แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย');

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual(['setCongenitalDisease', 'ง่วง']);
    expect(calls).toContainEqual(['setDrugAllergy', 'แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย']);
    // No treatmentHistory since beforeTreatment + pregnanted absent
    expect(calls.find(c => c[0] === 'setTreatmentHistory')).toBeUndefined();
  });

  it('FB3.2 — admin food-only → prefixed display (disambiguates from drug)', () => {
    const form = {
      firstname: 'TestA1b',
      history_of_food_allergy: 'นม',
    };
    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.foodAllergy).toBe('นม');
    expect(customerPatientData.drugAllergy).toBeUndefined();

    expect(resolvePatientDrugAllergy(customerPatientData)).toBe('แพ้อาหาร: นม');

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual(['setDrugAllergy', 'แพ้อาหาร: นม']);
  });
});

describe('FB4 — Admin treatmentHistory (beforeTreatment + pregnanted)', () => {
  it('FB4.1 — beforeTreatment + pregnanted=true chains to treatmentHistory display', () => {
    const form = {
      firstname: 'TestA2',
      before_treatment: 'X-ray',
      pregnanted: true,
    };
    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.beforeTreatment).toBe('X-ray');
    expect(customerPatientData.pregnanted).toBe(true);

    expect(resolvePatientTreatmentHistory(customerPatientData))
      .toBe('การรักษาก่อนหน้า: X-ray / การตั้งครรภ์: กำลังตั้งครรภ์');

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual([
      'setTreatmentHistory',
      'การรักษาก่อนหน้า: X-ray / การตั้งครรภ์: กำลังตั้งครรภ์',
    ]);
  });

  it('FB4.2 — pregnanted=false → no pregnancy entry; only beforeTreatment shown', () => {
    const form = {
      firstname: 'TestA2b',
      before_treatment: 'MRI',
      pregnanted: false,
    };
    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.pregnanted).toBe(false);

    expect(resolvePatientTreatmentHistory(customerPatientData))
      .toBe('การรักษาก่อนหน้า: MRI');
  });

  it('FB4.3 — only pregnanted=true → only pregnancy entry', () => {
    const form = {
      firstname: 'TestA2c',
      pregnanted: true,
    };
    const customerPatientData = buildPatientDataFromForm(form);
    expect(resolvePatientTreatmentHistory(customerPatientData))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์');
  });
});

describe('FB5 — Empty / no data', () => {
  it('FB5.1 — empty patientData → no setter fires', () => {
    const calls = simulateTfpCreateModeAutoFill({
      patientData: {},
      isEdit: false,
    });
    expect(calls).toEqual([]);
  });

  it('FB5.2 — null patientData → outer if skipped → no setter fires', () => {
    const calls = simulateTfpCreateModeAutoFill({
      patientData: null,
      isEdit: false,
    });
    expect(calls).toEqual([]);
  });

  it('FB5.3 — edit mode (isEdit=true) → no auto-fill regardless of patientData', () => {
    const customerPatientData = {
      bloodType: 'B+',
      congenitalDisease: 'เบาหวาน',
      drugAllergy: 'พารา',
      beforeTreatment: 'X-ray',
      pregnanted: true,
    };
    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: true,
    });
    // Bloodtype gate `if (... && !isEdit)` also blocks in edit mode
    expect(calls).toEqual([]);
  });
});

describe('FB6 — Allergy matrix (cross-validation)', () => {
  const matrix = [
    {
      name: 'drug-only admin',
      pd: { drugAllergy: 'พารา' },
      expected: 'พารา',
    },
    {
      name: 'food-only admin',
      pd: { foodAllergy: 'ขนมถ้วย' },
      expected: 'แพ้อาหาร: ขนมถ้วย',
    },
    {
      name: 'both admin (drug+food)',
      pd: { drugAllergy: 'พารา', foodAllergy: 'ขนมถ้วย' },
      expected: 'แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย',
    },
    {
      name: 'neither',
      pd: {},
      expected: '',
    },
    {
      name: 'kiosk allergies (post-canonical drugAllergy)',
      pd: { drugAllergy: 'shrimp' },
      expected: 'shrimp',
    },
    {
      name: 'admin overlay over kiosk shape (admin wins via canonical)',
      pd: { drugAllergy: 'พารา', foodAllergy: 'ขนมถ้วย' },
      expected: 'แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย',
    },
  ];

  matrix.forEach((tc, i) => {
    it(`FB6.${i + 1} — ${tc.name} → expected display`, () => {
      expect(resolvePatientDrugAllergy(tc.pd)).toBe(tc.expected);
    });
  });
});
