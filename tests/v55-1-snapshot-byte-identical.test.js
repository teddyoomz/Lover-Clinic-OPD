// V55.2 — Brutal pre-deploy test bank: byte-identical contract snapshots
// (Phase 26.2g-fillin-bis-followup verification, 2026-05-14)
// Locks OPD print Thai + English byte-output across 8 canonical scenarios
// + kioskPatientToCanonical shape contract across 6 scenarios + cross-language
// equivalence checks.
//
// IMPORTANT: If a snapshot diff appears in a future commit, review intentionally
// — these snapshots are the contract for downstream consumers (OPD print → admin
//   document → patient record) and any drift must be deliberate.
//
// Source-of-truth files locked here:
//   - src/lib/patientHealthMapping.js  (derivePatientCongenitalDisease + EN mirror)
//   - src/lib/kioskPatientToCanonical.js (canonical kiosk → snake_case adapter)
//   - src/utils.js generateClinicalSummary (OPD print Thai + English builders,
//     lines 259-446; intake-branch path only — followup_* branches are tested
//     elsewhere in tests/clinical-summary-*.test.js)

import { describe, it, expect } from 'vitest';
import { kioskPatientToCanonical } from '../src/lib/kioskPatientToCanonical.js';
import { generateClinicalSummary } from '../src/utils.js';

// ─── S1 — OPD print Thai builder (intake formType) ─────────────────────────
//
// `generateClinicalSummary(d, 'intake', null, 'th')` consumes kiosk-shape
// patientData and emits the Thai-language clinical summary. Locks every
// section header + every line prefix + every "negative-declaration" fallback
// string ('ปฏิเสธโรคประจำตัว', 'ปฏิเสธประวัติการแพ้ยาและอาหาร', 'ไม่มี')
// across the 8 canonical scenarios admin staff will print.

describe('S1 — OPD print Thai builder byte-identical contract', () => {
  it('S1.1 — empty patientData (d = {}) — all fallback strings emit', () => {
    expect(generateClinicalSummary({}, 'intake', null, 'th')).toMatchInlineSnapshot(`
      "อาการสำคัญ         : 
      ───
      ประวัติโรคประจำตัว  : ปฏิเสธโรคประจำตัว
      ประวัติการแพ้ยา/อาหาร : ปฏิเสธประวัติการแพ้ยาและอาหาร
      ยาที่ใช้ประจำ       : ไม่มี"
    `);
  });

  it('S1.2 — only hasUnderlying="ไม่มี" — same fallback as empty (gate denies)', () => {
    const d = { hasUnderlying: 'ไม่มี' };
    expect(generateClinicalSummary(d, 'intake', null, 'th')).toMatchInlineSnapshot(`
      "อาการสำคัญ         : 
      ───
      ประวัติโรคประจำตัว  : ปฏิเสธโรคประจำตัว
      ประวัติการแพ้ยา/อาหาร : ปฏิเสธประวัติการแพ้ยาและอาหาร
      ยาที่ใช้ประจำ       : ไม่มี"
    `);
  });

  it('S1.3 — hasUnderlying="มี" + ud_hypertension:true (single flag)', () => {
    const d = { hasUnderlying: 'มี', ud_hypertension: true };
    expect(generateClinicalSummary(d, 'intake', null, 'th')).toMatchInlineSnapshot(`
      "อาการสำคัญ         : 
      ───
      ประวัติโรคประจำตัว  : ความดันโลหิตสูง
      ประวัติการแพ้ยา/อาหาร : ปฏิเสธประวัติการแพ้ยาและอาหาร
      ยาที่ใช้ประจำ       : ไม่มี"
    `);
  });

  it('S1.4 — all 6 chronic flags + ud_other:true + ud_otherDetail:"พิษทะเล"', () => {
    const d = {
      hasUnderlying: 'มี',
      ud_hypertension: true, ud_diabetes: true, ud_lung: true,
      ud_kidney: true, ud_heart: true, ud_blood: true,
      ud_other: true, ud_otherDetail: 'พิษทะเล',
    };
    expect(generateClinicalSummary(d, 'intake', null, 'th')).toMatchInlineSnapshot(`
      "อาการสำคัญ         : 
      ───
      ประวัติโรคประจำตัว  : ความดันโลหิตสูง, เบาหวาน, โรคปอด, โรคไต, โรคหัวใจ, โรคโลหิต, พิษทะเล
      ประวัติการแพ้ยา/อาหาร : ปฏิเสธประวัติการแพ้ยาและอาหาร
      ยาที่ใช้ประจำ       : ไม่มี"
    `);
  });

  it('S1.5 — hasAllergies="มี" + allergiesDetail:"พารา"', () => {
    const d = { hasAllergies: 'มี', allergiesDetail: 'พารา' };
    expect(generateClinicalSummary(d, 'intake', null, 'th')).toMatchInlineSnapshot(`
      "อาการสำคัญ         : 
      ───
      ประวัติโรคประจำตัว  : ปฏิเสธโรคประจำตัว
      ประวัติการแพ้ยา/อาหาร : แพ้ พารา
      ยาที่ใช้ประจำ       : ไม่มี"
    `);
  });

  it('S1.6 — full scenario: chronic + allergies + medication + pregnancy', () => {
    const d = {
      hasUnderlying: 'มี',
      ud_diabetes: true,
      ud_hypertension: true,
      hasAllergies: 'มี',
      allergiesDetail: 'Penicillin',
      currentMedication: 'Metformin 500mg bid',
      pregnancy: 'ไตรมาส 2',
    };
    expect(generateClinicalSummary(d, 'intake', null, 'th')).toMatchInlineSnapshot(`
      "อาการสำคัญ         : 
      ───
      ประวัติโรคประจำตัว  : ความดันโลหิตสูง, เบาหวาน
      ประวัติการแพ้ยา/อาหาร : แพ้ Penicillin
      ยาที่ใช้ประจำ       : Metformin 500mg bid"
    `);
  });

  it('S1.7 — hasUnderlying="มี" but NO ud_* flags set (gate passes, no labels)', () => {
    const d = { hasUnderlying: 'มี' };
    // Helper returns '' (no flags) → falls through to 'ปฏิเสธโรคประจำตัว'.
    expect(generateClinicalSummary(d, 'intake', null, 'th')).toMatchInlineSnapshot(`
      "อาการสำคัญ         : 
      ───
      ประวัติโรคประจำตัว  : ปฏิเสธโรคประจำตัว
      ประวัติการแพ้ยา/อาหาร : ปฏิเสธประวัติการแพ้ยาและอาหาร
      ยาที่ใช้ประจำ       : ไม่มี"
    `);
  });

  it('S1.8 — currentMedication only (no underlying)', () => {
    const d = { currentMedication: 'ยาเบาหวาน 500mg' };
    expect(generateClinicalSummary(d, 'intake', null, 'th')).toMatchInlineSnapshot(`
      "อาการสำคัญ         : 
      ───
      ประวัติโรคประจำตัว  : ปฏิเสธโรคประจำตัว
      ประวัติการแพ้ยา/อาหาร : ปฏิเสธประวัติการแพ้ยาและอาหาร
      ยาที่ใช้ประจำ       : ยาเบาหวาน 500mg"
    `);
  });
});

// ─── S2 — OPD print English builder (intake formType, lang='en') ───────────
//
// Mirror S1.1-S1.8 in English. Locks formal-clinical labels:
//   'Diabetes Mellitus' (NOT 'Diabetes')
//   'Chronic Kidney Disease' (NOT 'Kidney Disease')
//   'Hematological Disease' (NOT 'Blood Disease')
// The drift from PatientForm UI labels is intentional (clinical documentation).

describe('S2 — OPD print English builder byte-identical contract', () => {
  it('S2.1 — empty patientData (d = {}) — all English fallback strings emit', () => {
    expect(generateClinicalSummary({}, 'intake', null, 'en')).toMatchInlineSnapshot(`
      "Chief Complaint     : 
      ───
      Past Medical History: No known underlying diseases
      Drug and Food Allergy: No known drug or food allergies
      Current Medications : None"
    `);
  });

  it('S2.2 — only hasUnderlying="ไม่มี" — same fallback as empty', () => {
    const d = { hasUnderlying: 'ไม่มี' };
    expect(generateClinicalSummary(d, 'intake', null, 'en')).toMatchInlineSnapshot(`
      "Chief Complaint     : 
      ───
      Past Medical History: No known underlying diseases
      Drug and Food Allergy: No known drug or food allergies
      Current Medications : None"
    `);
  });

  it('S2.3 — hasUnderlying="มี" + ud_hypertension:true (formal label "Hypertension")', () => {
    const d = { hasUnderlying: 'มี', ud_hypertension: true };
    expect(generateClinicalSummary(d, 'intake', null, 'en')).toMatchInlineSnapshot(`
      "Chief Complaint     : 
      ───
      Past Medical History: Hypertension
      Drug and Food Allergy: No known drug or food allergies
      Current Medications : None"
    `);
  });

  it('S2.4 — all 6 chronic flags + ud_other:"Migraine" (locks formal-clinical labels)', () => {
    const d = {
      hasUnderlying: 'มี',
      ud_hypertension: true, ud_diabetes: true, ud_lung: true,
      ud_kidney: true, ud_heart: true, ud_blood: true,
      ud_other: true, ud_otherDetail: 'Migraine',
    };
    expect(generateClinicalSummary(d, 'intake', null, 'en')).toMatchInlineSnapshot(`
      "Chief Complaint     : 
      ───
      Past Medical History: Hypertension, Diabetes Mellitus, Lung Disease, Chronic Kidney Disease, Heart Disease, Hematological Disease, Migraine
      Drug and Food Allergy: No known drug or food allergies
      Current Medications : None"
    `);
  });

  it('S2.5 — hasAllergies="มี" + allergiesDetail:"พารา" (allergies detail passes through verbatim)', () => {
    const d = { hasAllergies: 'มี', allergiesDetail: 'พารา' };
    expect(generateClinicalSummary(d, 'intake', null, 'en')).toMatchInlineSnapshot(`
      "Chief Complaint     : 
      ───
      Past Medical History: No known underlying diseases
      Drug and Food Allergy: Allergy to พารา
      Current Medications : None"
    `);
  });

  it('S2.6 — full scenario: chronic + allergies + medication + pregnancy', () => {
    const d = {
      hasUnderlying: 'มี',
      ud_diabetes: true,
      ud_hypertension: true,
      hasAllergies: 'มี',
      allergiesDetail: 'Penicillin',
      currentMedication: 'Metformin 500mg bid',
      pregnancy: 'ไตรมาส 2',
    };
    expect(generateClinicalSummary(d, 'intake', null, 'en')).toMatchInlineSnapshot(`
      "Chief Complaint     : 
      ───
      Past Medical History: Hypertension, Diabetes Mellitus
      Drug and Food Allergy: Allergy to Penicillin
      Current Medications : Metformin 500mg bid"
    `);
  });

  it('S2.7 — hasUnderlying="มี" but NO ud_* flags (gate passes, no labels → fallback)', () => {
    const d = { hasUnderlying: 'มี' };
    expect(generateClinicalSummary(d, 'intake', null, 'en')).toMatchInlineSnapshot(`
      "Chief Complaint     : 
      ───
      Past Medical History: No known underlying diseases
      Drug and Food Allergy: No known drug or food allergies
      Current Medications : None"
    `);
  });

  it('S2.8 — currentMedication only (no underlying)', () => {
    const d = { currentMedication: 'ยาเบาหวาน 500mg' };
    expect(generateClinicalSummary(d, 'intake', null, 'en')).toMatchInlineSnapshot(`
      "Chief Complaint     : 
      ───
      Past Medical History: No known underlying diseases
      Drug and Food Allergy: No known drug or food allergies
      Current Medications : ยาเบาหวาน 500mg"
    `);
  });
});

// ─── S3 — kioskPatientToCanonical shape contract ───────────────────────────
//
// Locks every output key + every default value (empty string vs missing key)
// across 6 canonical kiosk inputs. The `note` field embeds the English
// clinical summary (kioskPatientToCanonical default `summaryLanguage='en'`),
// so this also acts as a cross-check on S2.

describe('S3 — kioskPatientToCanonical canonical shape contract', () => {
  it('S3.1 — Thai female complete (firstname/lastname/BE dob/gender/idCard + chronic + allergies)', () => {
    const d = {
      prefix: 'นางสาว',
      firstName: 'สมหญิง',
      lastName: 'ใจดี',
      gender: 'หญิง',
      dobYear: '2540',  // BE
      dobMonth: '03',
      dobDay: '15',
      nationality: 'ไทย',
      idCard: '1234567890123',
      phone: '0812345678',
      hasUnderlying: 'มี',
      ud_diabetes: true,
      hasAllergies: 'มี',
      allergiesDetail: 'Penicillin',
    };
    expect(kioskPatientToCanonical(d)).toMatchInlineSnapshot(`
      {
        "address": "",
        "birthdate": "1997-03-15",
        "blood_type": "",
        "citizen_id": "1234567890123",
        "congenital_disease": "เบาหวาน",
        "contact_1_firstname": "",
        "contact_1_relation": "",
        "contact_1_telephone_number": "",
        "country": "ไทย",
        "customer_type": "ลูกค้าทั่วไป",
        "customer_type_2": "ไทย",
        "district": "",
        "email": "",
        "facebook_link": "",
        "firstname": "สมหญิง",
        "gender": "F",
        "history_of_drug_allergy": "Penicillin",
        "lastname": "ใจดี",
        "line_id": "",
        "nickname": "",
        "note": "Chief Complaint     : 
      ───
      Past Medical History: Diabetes Mellitus
      Drug and Food Allergy: Allergy to Penicillin
      Current Medications : None",
        "postal_code": "",
        "prefix": "นางสาว",
        "province": "",
        "source": "",
        "sub_district": "",
        "symptoms": "",
        "telephone_number": "0812345678",
      }
    `);
  });

  it('S3.2 — Foreigner with passport (US, passport_id branch active)', () => {
    const d = {
      firstName: 'John',
      lastName: 'Doe',
      gender: 'ชาย',
      nationality: 'ต่างชาติ',
      nationalityCountry: 'United States',
      idCard: 'AB12345',
      phone: '0998765432',
    };
    expect(kioskPatientToCanonical(d)).toMatchInlineSnapshot(`
      {
        "address": "",
        "birthdate": "",
        "blood_type": "",
        "congenital_disease": "",
        "contact_1_firstname": "",
        "contact_1_relation": "",
        "contact_1_telephone_number": "",
        "country": "United States",
        "customer_type": "ลูกค้าทั่วไป",
        "customer_type_2": "ต่างชาติ",
        "district": "",
        "email": "",
        "facebook_link": "",
        "firstname": "John",
        "gender": "M",
        "history_of_drug_allergy": "",
        "lastname": "Doe",
        "line_id": "",
        "nickname": "",
        "note": "Chief Complaint     : 
      ───
      Past Medical History: No known underlying diseases
      Drug and Food Allergy: No known drug or food allergies
      Current Medications : None",
        "passport_id": "AB12345",
        "postal_code": "",
        "prefix": "",
        "province": "",
        "source": "",
        "sub_district": "",
        "symptoms": "",
        "telephone_number": "0998765432",
      }
    `);
  });

  it('S3.3 — Minimal kiosk record (firstName + lastName + phone only)', () => {
    const d = {
      firstName: 'Min',
      lastName: 'Imal',
      phone: '0800000000',
    };
    expect(kioskPatientToCanonical(d)).toMatchInlineSnapshot(`
      {
        "address": "",
        "birthdate": "",
        "blood_type": "",
        "citizen_id": "",
        "congenital_disease": "",
        "contact_1_firstname": "",
        "contact_1_relation": "",
        "contact_1_telephone_number": "",
        "country": "ไทย",
        "customer_type": "ลูกค้าทั่วไป",
        "customer_type_2": "ไทย",
        "district": "",
        "email": "",
        "facebook_link": "",
        "firstname": "Min",
        "gender": "",
        "history_of_drug_allergy": "",
        "lastname": "Imal",
        "line_id": "",
        "nickname": "",
        "note": "Chief Complaint     : 
      ───
      Past Medical History: No known underlying diseases
      Drug and Food Allergy: No known drug or food allergies
      Current Medications : None",
        "postal_code": "",
        "prefix": "",
        "province": "",
        "source": "",
        "sub_district": "",
        "symptoms": "",
        "telephone_number": "0800000000",
      }
    `);
  });

  it('S3.4 — BE→CE conversion: dobYear="2540" → birthdate "1997-..."', () => {
    const d = {
      firstName: 'Date',
      lastName: 'Test',
      dobYear: '2540',  // BE
      dobMonth: '6',    // 1-digit OK
      dobDay: '5',      // 1-digit OK (test zero-padding)
    };
    const out = kioskPatientToCanonical(d);
    expect(out.birthdate).toMatchInlineSnapshot(`"1997-06-05"`);
  });

  it('S3.5 — CE already (dobYear="1997") → preserved as-is (no double-conversion)', () => {
    const d = {
      firstName: 'CE',
      lastName: 'Year',
      dobYear: '1997',  // Already CE (< 2400 threshold)
      dobMonth: '12',
      dobDay: '31',
    };
    const out = kioskPatientToCanonical(d);
    expect(out.birthdate).toMatchInlineSnapshot(`"1997-12-31"`);
  });

  it('S3.6 — Partial address (province only, no district/subDistrict/postalCode)', () => {
    const d = {
      firstName: 'Addr',
      lastName: 'Partial',
      province: 'กรุงเทพมหานคร',
    };
    const out = kioskPatientToCanonical(d);
    expect({
      province: out.province,
      district: out.district,
      sub_district: out.sub_district,
      postal_code: out.postal_code,
      address: out.address,
    }).toMatchInlineSnapshot(`
      {
        "address": "",
        "district": "",
        "postal_code": "",
        "province": "กรุงเทพมหานคร",
        "sub_district": "",
      }
    `);
  });
});

// ─── S4 — Cross-language equivalence ───────────────────────────────────────
//
// Light-weight invariants that compare Thai + English outputs for structural
// equivalence (paragraph count, header presence) without locking line-by-line
// content (S1/S2 already lock that).

describe('S4 — Cross-language equivalence', () => {
  it('S4.1 — Same patientData → Thai + English have same paragraph count (lines)', () => {
    const d = {
      hasUnderlying: 'มี',
      ud_diabetes: true,
      hasAllergies: 'มี',
      allergiesDetail: 'Penicillin',
      currentMedication: 'Metformin',
    };
    const th = generateClinicalSummary(d, 'intake', null, 'th').split('\n');
    const en = generateClinicalSummary(d, 'intake', null, 'en').split('\n');
    // Both intake outputs contain: 1 Chief Complaint line + 1 separator line
    // + 3 PMH/Allergy/Medication lines = 5 lines minimum (more if screening
    // section triggers, which it shouldn't without visitReasons).
    expect(th.length).toBe(en.length);
    // Lock the count via snapshot so a future format change in only ONE
    // language surfaces immediately.
    expect({ thLines: th.length, enLines: en.length }).toMatchInlineSnapshot(`
      {
        "enLines": 5,
        "thLines": 5,
      }
    `);
  });

  it('S4.2 — Chronic flags: Thai header "ประวัติโรคประจำตัว" present once; English "Past Medical History" present once', () => {
    const d = { hasUnderlying: 'มี', ud_hypertension: true };
    const th = generateClinicalSummary(d, 'intake', null, 'th');
    const en = generateClinicalSummary(d, 'intake', null, 'en');
    const countTh = (th.match(/ประวัติโรคประจำตัว/g) || []).length;
    const countEn = (en.match(/Past Medical History/g) || []).length;
    expect(countTh).toBe(1);
    expect(countEn).toBe(1);
  });

  it('S4.3 — hasUnderlying="ไม่มี": Thai outputs "ปฏิเสธโรคประจำตัว" once; English outputs "No known underlying diseases" once', () => {
    const d = { hasUnderlying: 'ไม่มี' };
    const th = generateClinicalSummary(d, 'intake', null, 'th');
    const en = generateClinicalSummary(d, 'intake', null, 'en');
    expect((th.match(/ปฏิเสธโรคประจำตัว/g) || []).length).toBe(1);
    expect((en.match(/No known underlying diseases/g) || []).length).toBe(1);
  });
});
