// ─── Phase 23.0 — Frontend modal channel + branchId stamp + sync resilience ──
// Bug 1: ช่องทางนัดหมาย dropdown empty (key-name mismatch)
// Bug 2: addCustomer at 4 kiosk sites lacks explicit branchId
// Bug 3a: "Resync ProClinic" label misleading post Phase-20.0 strip
// Bug 3b: handleResync built sparse camelCase patient → addCustomer wrote
//         wrong keys, patientData mirror empty (V12 multi-reader-sweep miss)
// Bug 3c: brokerStatus='failed' red-locked button without surfacing error
//
// Per Rule K (work-first-test-last) + Rule I (full-flow simulate at sub-phase
// end) + V21 lock (source-grep tests must assert WANTED behaviour, not
// merely the existing shape).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { kioskPatientToCanonical } from '../src/lib/kioskPatientToCanonical.js';

const ADMIN = fs.readFileSync(
  path.join(process.cwd(), 'src/pages/AdminDashboard.jsx'),
  'utf-8',
);

// ─── A. kioskPatientToCanonical pure helper ────────────────────────────────
describe('Phase 23.0 / A — kioskPatientToCanonical helper', () => {
  it('A.1 returns empty object for null/undefined/non-object input', () => {
    expect(kioskPatientToCanonical(null)).toEqual({});
    expect(kioskPatientToCanonical(undefined)).toEqual({});
    expect(kioskPatientToCanonical('string')).toEqual({});
    expect(kioskPatientToCanonical(42)).toEqual({});
  });

  it('A.2 maps camelCase names → snake_case canonical', () => {
    const out = kioskPatientToCanonical({
      prefix: 'นาย',
      firstName: 'ทดสอบ',
      lastName: 'ระบบ',
      nickname: 'เทส',
    });
    expect(out.prefix).toBe('นาย');
    expect(out.firstname).toBe('ทดสอบ');     // canonical key, NOT firstName
    expect(out.lastname).toBe('ระบบ');
    expect(out.nickname).toBe('เทส');
    // Anti-regression: must NOT carry camelCase keys into canonical out.
    expect(out.firstName).toBeUndefined();
    expect(out.lastName).toBeUndefined();
  });

  it('A.3 maps phone fields with international country code joined', () => {
    const tha = kioskPatientToCanonical({ phone: '0812345678' });
    expect(tha.telephone_number).toBe('0812345678');

    const intl = kioskPatientToCanonical({
      phone: '5551234567',
      isInternationalPhone: true,
      phoneCountryCode: '+1',
    });
    expect(intl.telephone_number).toBe('+15551234567');
  });

  it('A.4 maps emergency phone same way', () => {
    const out = kioskPatientToCanonical({
      emergencyName: 'แม่',
      emergencyPhone: '0987654321',
    });
    expect(out.contact_1_firstname).toBe('แม่');
    expect(out.contact_1_telephone_number).toBe('0987654321');
  });

  it('A.5 maps address fields rename', () => {
    const out = kioskPatientToCanonical({
      address: 'บ้าน 123',
      province: 'นครราชสีมา',
      district: 'เมือง',
      subDistrict: 'ในเมือง',
      postalCode: '30000',
    });
    expect(out.address).toBe('บ้าน 123');
    expect(out.sub_district).toBe('ในเมือง');     // canonical
    expect(out.postal_code).toBe('30000');         // canonical
    // Anti-regression
    expect(out.subDistrict).toBeUndefined();
    expect(out.postalCode).toBeUndefined();
  });

  it('A.6 converts BE-year birthdate to CE YYYY-MM-DD', () => {
    // dobYear 2540 BE → 1997 CE
    const out = kioskPatientToCanonical({
      dobYear: '2540', dobMonth: '6', dobDay: '15',
    });
    expect(out.birthdate).toBe('1997-06-15');
  });

  it('A.7 detects already-CE year (defensive — does not double-subtract)', () => {
    // Some kiosk variants pre-convert. If year < 2400 we treat as CE.
    const out = kioskPatientToCanonical({
      dobYear: '1997', dobMonth: '6', dobDay: '15',
    });
    expect(out.birthdate).toBe('1997-06-15');
  });

  it('A.8 leaves birthdate empty when any DOB part missing', () => {
    expect(kioskPatientToCanonical({ dobYear: '', dobMonth: '6', dobDay: '15' }).birthdate).toBe('');
    expect(kioskPatientToCanonical({}).birthdate).toBe('');
  });

  it('A.9 Phase 24.0-nonies — customer_type = "ลูกค้าทั่วไป" + customer_type_2 carries thai/foreigner', () => {
    // Phase 24.0-nonies (2026-05-06 evening) — kiosk customers default to
    // "ลูกค้าทั่วไป" per user directive. The thai/foreigner distinction
    // moved from customer_type to customer_type_2.
    const tha = kioskPatientToCanonical({
      nationality: 'ไทย',
      idCard: '1234567890123',
    });
    expect(tha.citizen_id).toBe('1234567890123');
    expect(tha.passport_id).toBeUndefined();
    expect(tha.country).toBe('ไทย');
    expect(tha.customer_type).toBe('ลูกค้าทั่วไป');
    expect(tha.customer_type_2).toBe('ไทย');

    const fgn = kioskPatientToCanonical({
      nationality: 'ต่างชาติ',
      nationalityCountry: 'United States',
      idCard: 'X1234567',
    });
    expect(fgn.passport_id).toBe('X1234567');
    expect(fgn.citizen_id).toBeUndefined();
    expect(fgn.country).toBe('United States');
    expect(fgn.customer_type).toBe('ลูกค้าทั่วไป');
    expect(fgn.customer_type_2).toBe('ต่างชาติ');
  });

  it('A.10 Phase 24.0-nonies — translates Thai gender labels (ชาย/หญิง/LGBTQ+) to canonical M/F/LGBTQ codes', () => {
    // Pre-fix: helper upper-cased "ชาย" → "ชาย" (Thai chars unaffected by
    // toUpperCase) → normalizeCustomer rejected non-M/F → gender stored as ''.
    // User report: "บันทึกเพศจาก Frontend ลง backend ของเรายังใช้ไม่ได้
    // ลูกค้าล่าสุดกรอกเพศชายแล้ว แต่พอบันทึกลง backend กลายเป็นเพศ -"
    expect(kioskPatientToCanonical({ gender: 'ชาย' }).gender).toBe('M');
    expect(kioskPatientToCanonical({ gender: 'หญิง' }).gender).toBe('F');
    expect(kioskPatientToCanonical({ gender: 'LGBTQ+' }).gender).toBe('LGBTQ');
    expect(kioskPatientToCanonical({ gender: 'lgbtq' }).gender).toBe('LGBTQ');
    // Pass-through canonical codes
    expect(kioskPatientToCanonical({ gender: 'M' }).gender).toBe('M');
    expect(kioskPatientToCanonical({ gender: 'F' }).gender).toBe('F');
    expect(kioskPatientToCanonical({ gender: 'm' }).gender).toBe('M');
    // English synonyms
    expect(kioskPatientToCanonical({ gender: 'male' }).gender).toBe('M');
    expect(kioskPatientToCanonical({ gender: 'Female' }).gender).toBe('F');
    // Unknown / blank
    expect(kioskPatientToCanonical({ gender: 'other' }).gender).toBe('');
    expect(kioskPatientToCanonical({}).gender).toBe('');
  });

  it('A.11 joins howFoundUs array into source string', () => {
    const out = kioskPatientToCanonical({
      howFoundUs: ['Facebook', 'Instagram', ''],
    });
    expect(out.source).toBe('Facebook, Instagram');
  });

  it('A.12 derives congenital_disease from underlying flags', () => {
    const out = kioskPatientToCanonical({
      hasUnderlying: 'มี',
      ud_hypertension: true,
      ud_diabetes: true,
      ud_other: true,
      ud_otherDetail: 'แพ้ผงชูรส',
    });
    expect(out.congenital_disease).toContain('ความดันโลหิตสูง');
    expect(out.congenital_disease).toContain('เบาหวาน');
    expect(out.congenital_disease).toContain('แพ้ผงชูรส');
  });

  it('A.13 derives history_of_drug_allergy when hasAllergies=มี', () => {
    expect(kioskPatientToCanonical({
      hasAllergies: 'มี', allergiesDetail: 'Penicillin',
    }).history_of_drug_allergy).toBe('Penicillin');

    // No allergies → empty (NOT undefined — addCustomer expects string)
    expect(kioskPatientToCanonical({ hasAllergies: 'ไม่มี' }).history_of_drug_allergy).toBe('');
  });

  it('A.14 Phase 24.0-nonies — emergency relation lands in canonical contact_1_relation (NOT note)', () => {
    // Pre-fix: helper dumped "Emergency relation: <text>" into the free-form
    // note field. Phase 24.0-nonies promotes it to canonical
    // `contact_1_relation` so backend create/edit form has a dedicated input
    // and the field round-trips correctly via buildPatientDataFromForm.
    const out = kioskPatientToCanonical({
      firstName: 'A', lastName: 'B',
      emergencyRelation: 'บิดา',
    });
    expect(out.contact_1_relation).toBe('บิดา');
    // Anti-regression: must NOT pollute the note with the relation prefix.
    expect(out.note || '').not.toMatch(/Emergency relation:/);
  });

  it('A.14-bis emergency relation defaults to empty string when not provided', () => {
    const out = kioskPatientToCanonical({ firstName: 'A', lastName: 'B' });
    expect(out.contact_1_relation).toBe('');
  });

  it('A.15 includes clinicalSummary in note for downstream visibility', () => {
    const out = kioskPatientToCanonical({
      firstName: 'A', lastName: 'B',
      visitReasons: ['สมรรถภาพทางเพศ'],
    });
    // generateClinicalSummary may produce non-empty content for any kiosk
    // form; we only assert the note field exists as a string.
    expect(typeof out.note).toBe('string');
  });

  it('A.16 round-trip — kiosk shape feeds addCustomer normalizer expectations', () => {
    // Trace: kioskPatientToCanonical → normalizeCustomer (in
    // src/lib/customerValidation.js) trims FIELD_BOUNDS keys and applies
    // type coercions. The output of our helper MUST contain ONLY canonical
    // snake_case keys that normalizeCustomer recognizes.
    const out = kioskPatientToCanonical({
      prefix: 'นาย',
      firstName: 'A',
      lastName: 'B',
      phone: '0812345678',
      address: 'X',
      province: 'นครราชสีมา',
      subDistrict: 'Y',
      postalCode: '30000',
      gender: 'M',
      dobYear: '2540', dobMonth: '6', dobDay: '15',
      nationality: 'ไทย',
      idCard: '1234567890123',
      bloodType: 'O',
      emergencyName: 'แม่',
      emergencyPhone: '0987654321',
      emergencyRelation: 'มารดา',
      howFoundUs: ['Facebook'],
    });
    // Every key in `out` MUST be a canonical snake_case identifier
    // (no camelCase leftovers).
    const camelLeak = Object.keys(out).filter((k) => /[A-Z]/.test(k));
    expect(camelLeak).toEqual([]);
  });
});

// ─── B. AdminDashboard.jsx source-grep regression guards ────────────────────
describe('Phase 23.0 / B — AdminDashboard.jsx contract guards', () => {
  it('B.1 imports kioskPatientToCanonical helper', () => {
    expect(ADMIN).toMatch(
      /import\s*\{\s*kioskPatientToCanonical\s*\}\s*from\s*['"]\.\.\/lib\/kioskPatientToCanonical\.js['"]/,
    );
  });

  it('B.2 fetchDepositOptions populates appointmentChannels key (Bug 1)', () => {
    // The two ช่องทางนัดหมาย dropdowns at line 6349 + 6466 read
    // depositOptions?.appointmentChannels. Pre-fix only `sources` was set →
    // dropdowns rendered empty.
    expect(ADMIN).toMatch(/appointmentChannels:\s*\[\s*\.\.\.CUSTOMER_SOURCES_STATIC\s*\]/);
  });

  it('B.2-bis fetchDepositOptions cache check guards against shape drift via _schemaVersion (Bug 1 hardening)', () => {
    // After Phase 23.0 added `appointmentChannels`, the user reported the
    // dropdown still rendered empty on a running dev server. Root cause:
    // Vite HMR swapped the function body but React state (`depositOptions`)
    // persisted. The cache check at the top of fetchDepositOptions used to
    // only compare _branchId → cached options without appointmentChannels
    // survived → dropdown stayed empty until full page reload.
    // Hardening: bump DEPOSIT_OPTIONS_SCHEMA_VERSION on every shape change;
    // cache check rejects stale cached options whose _schemaVersion mismatches.
    expect(ADMIN).toMatch(/const\s+DEPOSIT_OPTIONS_SCHEMA_VERSION\s*=\s*\d+/);
    expect(ADMIN).toMatch(/_schemaVersion:\s*DEPOSIT_OPTIONS_SCHEMA_VERSION/);
    // Cache check MUST AND-include both branch + version equality.
    expect(ADMIN).toMatch(
      /depositOptions\._schemaVersion\s*===\s*DEPOSIT_OPTIONS_SCHEMA_VERSION/,
    );
  });

  it('B.3 all 4 kiosk addCustomer sites pass explicit branchId (Bug 2)', () => {
    // Pre-fix: addCustomer(patient, { strict: false }) — relied on implicit
    // resolveSelectedBranchId() inside addCustomer. Post-fix: every site
    // passes branchId explicitly to mirror CustomerCreatePage's pattern.
    const matches = ADMIN.match(/addCustomer\(patient,\s*\{[^}]*branchId:\s*selectedBranchId/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('B.4 zero kiosk addCustomer sites use the legacy implicit-only opts (Bug 2 anti-regression)', () => {
    // The legacy shape was: addCustomer(patient, { strict: false })
    // (NO branchId). Post-fix none should remain.
    const legacy = ADMIN.match(/addCustomer\(patient,\s*\{\s*strict:\s*false\s*\}\)/g) || [];
    expect(legacy).toEqual([]);
  });

  it('B.5 Resync button label renamed (Bug 3a)', () => {
    // Pre-fix: 'Resync ProClinic' (misleading post Phase 20.0 strip).
    // Post-fix: 'ซิงค์ข้อมูลใหม่'.
    expect(ADMIN).toContain("'ซิงค์ข้อมูลใหม่'");
    // Anti-regression: literal "Resync ProClinic" in user-visible button
    // text MUST be gone (still OK in inline comments).
    const visibleResyncProClinic = ADMIN.match(/[>\s]Resync ProClinic[<\s]/g) || [];
    expect(visibleResyncProClinic).toEqual([]);
  });

  it('B.6 Resync tooltip rewritten to backend-only language (Bug 3a)', () => {
    expect(ADMIN).toContain('บันทึกข้อมูลลูกค้าลง backend อีกครั้ง');
  });

  it('B.7 OPD button title surfaces brokerError + retry hint (Bug 3c)', () => {
    expect(ADMIN).toContain('กดอีกครั้งเพื่อลองใหม่');
  });

  it('B.8 inline brokerError block renders when status=failed (Bug 3c)', () => {
    // Post-fix the user sees the failure reason instead of just a red lock.
    expect(ADMIN).toMatch(
      /viewingSession\.brokerStatus\s*===\s*['"]failed['"]\s*&&\s*viewingSession\.brokerError/,
    );
    expect(ADMIN).toContain('บันทึกลูกค้าล้มเหลว');
  });

  it('B.9 handleResync wires kioskPatientToCanonical (Bug 3b)', () => {
    expect(ADMIN).toMatch(
      /const handleResync\s*=\s*async\s*\(session\)\s*=>\s*\{[\s\S]{0,400}kioskPatientToCanonical\s*\(/,
    );
  });

  it('B.10 handleDepositSync wires kioskPatientToCanonical (Bug 3b — Rule of 3)', () => {
    expect(ADMIN).toMatch(
      /const handleDepositSync\s*=\s*async\s*\(session\)\s*=>\s*\{[\s\S]{0,2200}kioskPatientToCanonical\s*\(/,
    );
  });

  it('B.11 V12 anti-regression — no inline camelCase patient builder remains', () => {
    // Pre-fix the duplicate builder produced { firstName, lastName, phone,
    // dobDay, postalCode, … }. Both should now route through the helper.
    const inline = ADMIN.match(/firstName:\s*d\??\.firstName\s*\|\|\s*['"]['"]/g) || [];
    expect(inline.length).toBe(0);
    const inlineDobDay = ADMIN.match(/dobDay:\s*d\??\.dobDay\s*\|\|/g) || [];
    expect(inlineDobDay.length).toBe(0);
  });

  it('B.12 user-facing copy stripped of "ProClinic" in success/error toasts (post Phase 20.0)', () => {
    // Bug 3a sweep: "บันทึกมัดจำลง ProClinic แล้ว" → "บันทึกมัดจำเรียบร้อย"
    expect(ADMIN).not.toContain('บันทึกมัดจำลง ProClinic แล้ว');
    expect(ADMIN).toContain('บันทึกมัดจำเรียบร้อย');
  });
});

// ─── C. Full-flow simulate (Rule I) ────────────────────────────────────────
describe('Phase 23.0 / C — full-flow simulate kiosk submit → canonical doc', () => {
  it('C.1 kiosk Thai citizen → canonical → addCustomer payload shape', () => {
    // SIMULATE the chain: kiosk PatientForm submits patientData → handleResync
    // → kioskPatientToCanonical → addCustomer(form, opts) → docPayload.
    // We verify the helper output is the shape addCustomer's
    // normalizeCustomer + buildPatientDataFromForm chain expects.
    const kioskData = {
      prefix: 'นาย',
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      phone: '0812345678',
      gender: 'M',
      dobYear: '2540', dobMonth: '6', dobDay: '15',
      nationality: 'ไทย',
      idCard: '1234567890123',
      bloodType: 'O',
      address: 'บ้าน 123',
      province: 'นครราชสีมา',
      district: 'เมือง',
      subDistrict: 'ในเมือง',
      postalCode: '30000',
      emergencyName: 'แม่',
      emergencyPhone: '0987654321',
      emergencyRelation: 'มารดา',
      howFoundUs: ['Facebook'],
      hasAllergies: 'ไม่มี',
      hasUnderlying: 'ไม่มี',
    };
    const canonical = kioskPatientToCanonical(kioskData, {
      formType: 'intake',
      summaryLanguage: 'en',
    });

    // Required canonical keys for addCustomer:
    expect(canonical.firstname).toBe('สมชาย');
    expect(canonical.lastname).toBe('ใจดี');
    expect(canonical.telephone_number).toBe('0812345678');
    expect(canonical.citizen_id).toBe('1234567890123');
    expect(canonical.passport_id).toBeUndefined();
    expect(canonical.gender).toBe('M');
    expect(canonical.birthdate).toBe('1997-06-15');   // BE 2540 → CE 1997
    expect(canonical.blood_type).toBe('O');
    expect(canonical.sub_district).toBe('ในเมือง');
    expect(canonical.postal_code).toBe('30000');
    expect(canonical.contact_1_firstname).toBe('แม่');
    expect(canonical.contact_1_telephone_number).toBe('0987654321');
    expect(canonical.country).toBe('ไทย');
    // Phase 24.0-nonies — customer_type defaults to ลูกค้าทั่วไป; thai/foreigner
    // moved to customer_type_2.
    expect(canonical.customer_type).toBe('ลูกค้าทั่วไป');
    expect(canonical.customer_type_2).toBe('ไทย');
    expect(canonical.source).toBe('Facebook');
    // Phase 24.0-nonies — emergency relation moved from note to canonical
    // contact_1_relation field.
    expect(canonical.contact_1_relation).toBe('มารดา');
    expect(canonical.note || '').not.toMatch(/Emergency relation:/);

    // Anti-regression: no camelCase leftovers (would land on root be_customers
    // doc as garbage).
    const camelKeys = Object.keys(canonical).filter((k) => /[A-Z]/.test(k));
    expect(camelKeys).toEqual([]);
  });

  it('C.2 kiosk foreigner → canonical writes passport_id branch', () => {
    const canonical = kioskPatientToCanonical({
      prefix: 'Mr',
      firstName: 'John',
      lastName: 'Smith',
      phone: '5551234567',
      isInternationalPhone: true,
      phoneCountryCode: '+1',
      gender: 'M',
      nationality: 'ต่างชาติ',
      nationalityCountry: 'United States',
      idCard: 'X1234567',
    });
    expect(canonical.passport_id).toBe('X1234567');
    expect(canonical.citizen_id).toBeUndefined();
    expect(canonical.customer_type).toBe('ลูกค้าทั่วไป');
    expect(canonical.customer_type_2).toBe('ต่างชาติ');
    expect(canonical.country).toBe('United States');
    expect(canonical.telephone_number).toBe('+15551234567');
  });

  it('C.3 V12 multi-reader-sweep guard — addCustomer-shape parity', () => {
    // The addCustomer writer (src/lib/backendClient.js:638) writes
    // `{ ...finalForm, patientData: buildPatientDataFromForm(finalForm), … }`.
    // buildPatientDataFromForm (line 278) reads `form.firstname`,
    // `form.telephone_number`, `form.citizen_id`, `form.contact_1_firstname`,
    // etc. — ALL snake_case. Our helper output MUST satisfy that contract.
    const out = kioskPatientToCanonical({
      firstName: 'A',
      lastName: 'B',
      phone: '0812345678',
      idCard: '1234567890123',
      nationality: 'ไทย',
      emergencyName: 'C',
      emergencyPhone: '0911111111',
    });
    // Each of these keys must be readable by buildPatientDataFromForm:
    const requiredCanonicalKeys = [
      'firstname',
      'lastname',
      'telephone_number',
      'citizen_id',
      'contact_1_firstname',
      'contact_1_telephone_number',
    ];
    for (const k of requiredCanonicalKeys) {
      expect(out[k]).toBeDefined();
    }
  });

  it('C.4 Bug 3b reproduction — pre-fix shape would have BROKEN patientData mirror', () => {
    // Forensic check: confirm the OLD inline builder shape (camelCase) is
    // NOT what `buildPatientDataFromForm` reads. If we accidentally revert,
    // this test catches it.
    const oldShape = {
      firstName: 'A',
      lastName: 'B',
      phone: '0812345678',
      dobDay: '15', dobMonth: '6', dobYear: '2540',
      subDistrict: 'X',
      postalCode: '30000',
    };
    // None of these keys are read by buildPatientDataFromForm. Helper output
    // must NOT match this shape.
    const newShape = kioskPatientToCanonical({
      firstName: 'A',
      lastName: 'B',
      phone: '0812345678',
      dobDay: '15', dobMonth: '6', dobYear: '2540',
      subDistrict: 'X',
      postalCode: '30000',
    });
    expect(Object.keys(newShape)).not.toContain('firstName');
    expect(Object.keys(newShape)).not.toContain('lastName');
    expect(Object.keys(newShape)).not.toContain('subDistrict');
    expect(Object.keys(newShape)).not.toContain('postalCode');
    expect(Object.keys(newShape)).not.toContain('dobDay');
    // Sanity: oldShape would produce an empty patientData mirror because
    // buildPatientDataFromForm checks `form.firstname` etc.
    expect(oldShape.firstname).toBeUndefined();
  });
});
