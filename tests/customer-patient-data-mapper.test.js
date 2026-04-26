// V33-customer-create — buildPatientDataFromForm shape contract.
// Verifies the lowercase-form → camelCase-patientData mapping that makes
// manually-created customers shape-identical to ProClinic-cloned ones.
//
// Critical invariant: every patientData key downstream readers consume
// (firstName, lastName, phone, subDistrict, postalCode, nationalId, passport,
// dobYear/Month/Day, age, etc.) MUST be populated from the corresponding
// lowercase form field. Without this, manually-created customers would
// appear with empty names everywhere.

import { describe, it, expect, vi } from 'vitest';

// Mock firebase before importing backendClient.
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  collection: () => ({}),
  getDoc: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(),
  deleteDoc: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(),
  orderBy: vi.fn(), writeBatch: vi.fn(() => ({ commit: vi.fn() })),
  runTransaction: vi.fn(), onSnapshot: vi.fn(),
}));

const { buildPatientDataFromForm } = await import('../src/lib/backendClient.js');

describe('V33.X — buildPatientDataFromForm name + contact mapping', () => {
  it('X1 — firstname → firstName (camelCase rename)', () => {
    expect(buildPatientDataFromForm({ firstname: 'John' }).firstName).toBe('John');
  });
  it('X2 — lastname → lastName', () => {
    expect(buildPatientDataFromForm({ lastname: 'Doe' }).lastName).toBe('Doe');
  });
  it('X3 — telephone_number → phone', () => {
    expect(buildPatientDataFromForm({ telephone_number: '0812345678' }).phone).toBe('0812345678');
  });
  it('X4 — sub_district → subDistrict', () => {
    expect(buildPatientDataFromForm({ sub_district: 'พระนคร' }).subDistrict).toBe('พระนคร');
  });
  it('X5 — postal_code → postalCode', () => {
    expect(buildPatientDataFromForm({ postal_code: '10200' }).postalCode).toBe('10200');
  });
  it('X6 — citizen_id → nationalId (V32-tris-quater contract)', () => {
    expect(buildPatientDataFromForm({ citizen_id: '1234567890123' }).nationalId).toBe('1234567890123');
  });
  it('X7 — passport_id → passport (V32-tris-quater contract)', () => {
    expect(buildPatientDataFromForm({ passport_id: 'AA1234567' }).passport).toBe('AA1234567');
  });
  it('X8 — country → nationalityCountry', () => {
    expect(buildPatientDataFromForm({ country: 'ญี่ปุ่น' }).nationalityCountry).toBe('ญี่ปุ่น');
  });
  it('X9 — same-name passthrough: prefix, gender, address, province, district, email', () => {
    const out = buildPatientDataFromForm({
      prefix: 'นาย', gender: 'M', address: 'ABC', province: 'กรุงเทพมหานคร',
      district: 'พระนคร', email: 'a@b.com',
    });
    expect(out).toMatchObject({
      prefix: 'นาย', gender: 'M', address: 'ABC', province: 'กรุงเทพมหานคร',
      district: 'พระนคร', email: 'a@b.com',
    });
  });
});

describe('V33.Y — birthdate → dob{Year,Month,Day} + age (BE conversion)', () => {
  it('Y1 — birthdate present → all 4 fields populated', () => {
    const out = buildPatientDataFromForm({ birthdate: '1990-05-15' });
    expect(out.birthdate).toBe('1990-05-15');
    expect(out.dobYear).toBe(String(1990 + 543));   // 2533 BE
    expect(out.dobMonth).toBe('5');
    expect(out.dobDay).toBe('15');
    expect(out.age).toMatch(/^\d+$/);
    expect(parseInt(out.age, 10)).toBeGreaterThan(30);
  });
  it('Y2 — invalid birthdate → no dob fields written', () => {
    const out = buildPatientDataFromForm({ birthdate: 'invalid' });
    expect(out.birthdate).toBe('invalid');
    expect(out.dobYear).toBeUndefined();
    expect(out.age).toBeUndefined();
  });
  it('Y3 — empty birthdate → entire dob block omitted', () => {
    const out = buildPatientDataFromForm({ birthdate: '' });
    expect(out.birthdate).toBeUndefined();
    expect(out.dobYear).toBeUndefined();
  });
});

describe('V33.Z — emergency contact name composition', () => {
  it('Z1 — contact_1 first+last combined into emergencyName', () => {
    const out = buildPatientDataFromForm({ contact_1_firstname: 'A', contact_1_lastname: 'B' });
    expect(out.emergencyName).toBe('A B');
  });
  it('Z2 — only firstname → no trailing space', () => {
    const out = buildPatientDataFromForm({ contact_1_firstname: 'Solo' });
    expect(out.emergencyName).toBe('Solo');
  });
  it('Z3 — contact_2 phone → emergencyPhone2', () => {
    const out = buildPatientDataFromForm({ contact_2_telephone_number: '0987654321' });
    expect(out.emergencyPhone2).toBe('0987654321');
  });
});

describe('V33.AA — gallery + profile passthrough', () => {
  it('AA1 — profile_image → profileImage', () => {
    expect(buildPatientDataFromForm({ profile_image: 'https://x/p.jpg' }).profileImage).toBe('https://x/p.jpg');
  });
  it('AA2 — gallery_upload [non-empty] → gallery', () => {
    const out = buildPatientDataFromForm({ gallery_upload: ['https://x/1', 'https://x/2'] });
    expect(out.gallery).toEqual(['https://x/1', 'https://x/2']);
  });
  it('AA3 — empty gallery_upload → gallery key omitted', () => {
    expect(buildPatientDataFromForm({ gallery_upload: [] }).gallery).toBeUndefined();
  });
});

describe('V33.BB — empty / null safety', () => {
  it('BB1 — empty form → empty patientData {} (not null)', () => {
    expect(buildPatientDataFromForm({})).toEqual({});
  });
  it('BB2 — null form → empty patientData {}', () => {
    expect(buildPatientDataFromForm(null)).toEqual({});
  });
  it('BB3 — undefined form → empty patientData {}', () => {
    expect(buildPatientDataFromForm(undefined)).toEqual({});
  });
  it('BB4 — non-object form → empty patientData {}', () => {
    expect(buildPatientDataFromForm('string')).toEqual({});
    expect(buildPatientDataFromForm(123)).toEqual({});
  });
  it('BB5 — empty string fields are SKIPPED (no empty-string keys)', () => {
    const out = buildPatientDataFromForm({ firstname: '', lastname: '', telephone_number: '' });
    expect(out.firstName).toBeUndefined();
    expect(out.lastName).toBeUndefined();
    expect(out.phone).toBeUndefined();
  });
});

describe('V33.CC — full-form round-trip (every reader-consumed key)', () => {
  it('CC1 — all 30+ commonly-read keys present from a comprehensive form', () => {
    const form = {
      firstname: 'John', lastname: 'Doe', telephone_number: '0812345678',
      prefix: 'นาย', gender: 'M', email: 'a@b.com', address: 'X',
      province: 'กรุงเทพมหานคร', district: 'พระนคร', sub_district: 'พระบรมมหาราชวัง',
      postal_code: '10200', citizen_id: '1234567890123', passport_id: 'AA1234567',
      country: 'ไทย', birthdate: '1985-06-20', blood_type: 'O+', height: 175, weight: 70,
      nickname: 'JD', occupation: 'Eng', income: '50,000 - 100,000',
      customer_type: 'thai', customer_type_2: 'ลูกค้าทั่วไป',
      line_id: 'jdoe', facebook_link: 'https://fb.com/jd',
      source: 'Facebook', source_detail: '', ad_description: 'ads',
      like_note: 'L', dislike_note: 'D', note: 'N', doctor_id: 'D-1',
      symptoms: 'S', before_treatment: 'B', congenital_disease: 'C',
      history_of_drug_allergy: 'DA', history_of_food_allergy: 'FA', pregnanted: false,
      contact_1_firstname: 'EM1', contact_1_lastname: 'L', contact_1_telephone_number: '0822',
      contact_2_firstname: 'EM2', contact_2_lastname: '', contact_2_telephone_number: '0833',
      receipt_type: 'personal',
      profile_image: 'https://p', gallery_upload: ['https://g1', 'https://g2'],
    };
    const pd = buildPatientDataFromForm(form);
    // Spot-check the high-traffic readers.
    expect(pd.firstName).toBe('John');
    expect(pd.lastName).toBe('Doe');
    expect(pd.phone).toBe('0812345678');
    expect(pd.subDistrict).toBe('พระบรมมหาราชวัง');
    expect(pd.postalCode).toBe('10200');
    expect(pd.nationalId).toBe('1234567890123');
    expect(pd.passport).toBe('AA1234567');
    expect(pd.dobYear).toBe('2528');     // 1985 + 543
    expect(pd.bloodType).toBe('O+');
    expect(pd.lineId).toBe('jdoe');
    expect(pd.facebookLink).toBe('https://fb.com/jd');
    expect(pd.profileImage).toBe('https://p');
    expect(pd.gallery).toEqual(['https://g1', 'https://g2']);
    expect(pd.emergencyName).toBe('EM1 L');
    expect(pd.emergencyName2).toBe('EM2');
    expect(pd.receiptType).toBe('personal');
  });
});
