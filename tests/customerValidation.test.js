// ─── Phase 12.3 · customer validation adversarial tests ───────────────────
import { describe, it, expect } from 'vitest';
import {
  validateCustomer, normalizeCustomer, emptyCustomerForm,
  GENDER_OPTIONS, RECEIPT_TYPE_OPTIONS,
} from '../src/lib/customerValidation.js';

const base = () => ({ ...emptyCustomerForm(), firstname: 'สมชาย', hn_no: 'HN001' });

describe('validateCustomer — required + shape (strict)', () => {
  it('CU1: null/array rejected', () => {
    expect(validateCustomer(null)?.[0]).toBe('form');
    expect(validateCustomer([])?.[0]).toBe('form');
  });
  it('CU2: non-strict allows missing firstname/hn_no', () => {
    expect(validateCustomer({})).toBeNull();
  });
  it('CU3: strict requires firstname', () => {
    expect(validateCustomer({ hn_no: 'HN1' }, { strict: true })?.[0]).toBe('firstname');
    expect(validateCustomer({ hn_no: 'HN1', firstname: '   ' }, { strict: true })?.[0]).toBe('firstname');
  });
  it('CU4: strict requires hn_no', () => {
    expect(validateCustomer({ firstname: 'X' }, { strict: true })?.[0]).toBe('hn_no');
  });
  it('CU5: minimal valid in strict', () => {
    expect(validateCustomer(base(), { strict: true })).toBeNull();
  });
});

describe('validateCustomer — email + phone', () => {
  it('CU6: malformed email rejected', () => {
    expect(validateCustomer({ ...base(), email: 'not-email' })?.[0]).toBe('email');
  });
  it('CU7: valid email accepted', () => {
    expect(validateCustomer({ ...base(), email: 'a@b.co' })).toBeNull();
  });
  it('CU8: empty email allowed', () => {
    expect(validateCustomer({ ...base(), email: '' })).toBeNull();
  });
  it('CU9: gibberish phone rejected', () => {
    expect(validateCustomer({ ...base(), telephone_number: 'abc#$' })?.[0]).toBe('telephone_number');
  });
  it('CU10: Thai 10-digit phone accepted', () => {
    expect(validateCustomer({ ...base(), telephone_number: '0812345678' })).toBeNull();
  });
  it('CU11: international phone with + + spaces accepted', () => {
    expect(validateCustomer({ ...base(), telephone_number: '+66 812 345 678' })).toBeNull();
  });
  it('CU12: receipt phones also validated', () => {
    expect(validateCustomer({ ...base(), personal_receipt_phonenumber: 'bad!!' })?.[0]).toBe('personal_receipt_phonenumber');
    expect(validateCustomer({ ...base(), company_receipt_phonenumber: 'bad!!' })?.[0]).toBe('company_receipt_phonenumber');
  });
});

describe('validateCustomer — citizen_id', () => {
  it('CU13: 13-digit numeric ok', () => {
    expect(validateCustomer({ ...base(), citizen_id: '1234567890123' })).toBeNull();
  });
  it('CU14: 13 non-digits rejected', () => {
    expect(validateCustomer({ ...base(), citizen_id: 'abcdefghijklm' })?.[0]).toBe('citizen_id');
  });
  it('CU15: 10-digit numeric (too short) rejected', () => {
    expect(validateCustomer({ ...base(), citizen_id: '1234567890' })?.[0]).toBe('citizen_id');
  });
  it('CU16: empty citizen_id allowed', () => {
    expect(validateCustomer({ ...base(), citizen_id: '' })).toBeNull();
  });
  it('CU17: mixed alphanumeric allowed (passport-like)', () => {
    expect(validateCustomer({ ...base(), citizen_id: 'AB12345' })).toBeNull();
  });
});

describe('validateCustomer — birthdate', () => {
  it('CU18: YYYY-MM-DD accepted', () => {
    expect(validateCustomer({ ...base(), birthdate: '1990-05-15' })).toBeNull();
  });
  it('CU19: dd/mm/yyyy rejected', () => {
    expect(validateCustomer({ ...base(), birthdate: '15/05/1990' })?.[0]).toBe('birthdate');
  });
  it('CU20: year < 1900 rejected', () => {
    expect(validateCustomer({ ...base(), birthdate: '1850-01-01' })?.[0]).toBe('birthdate');
  });
  it('CU21: future date rejected', () => {
    expect(validateCustomer({ ...base(), birthdate: '2999-01-01' })?.[0]).toBe('birthdate');
  });
  it('CU22: empty birthdate allowed', () => {
    expect(validateCustomer({ ...base(), birthdate: '' })).toBeNull();
  });
});

describe('validateCustomer — enums + bools + numerics', () => {
  it('CU23: gender enum', () => {
    for (const g of GENDER_OPTIONS) {
      expect(validateCustomer({ ...base(), gender: g })).toBeNull();
    }
    expect(validateCustomer({ ...base(), gender: 'X' })?.[0]).toBe('gender');
  });
  it('CU24: receipt_type enum', () => {
    for (const r of RECEIPT_TYPE_OPTIONS) {
      expect(validateCustomer({ ...base(), receipt_type: r })).toBeNull();
    }
    expect(validateCustomer({ ...base(), receipt_type: 'invalid' })?.[0]).toBe('receipt_type');
  });
  it('CU25: pregnanted must be boolean', () => {
    expect(validateCustomer({ ...base(), pregnanted: 'yes' })?.[0]).toBe('pregnanted');
    expect(validateCustomer({ ...base(), pregnanted: true })).toBeNull();
  });
  it('CU26: height bounds 30-280 cm', () => {
    expect(validateCustomer({ ...base(), height: 15 })?.[0]).toBe('height');
    expect(validateCustomer({ ...base(), height: 300 })?.[0]).toBe('height');
    expect(validateCustomer({ ...base(), height: 170 })).toBeNull();
    expect(validateCustomer({ ...base(), height: 'x' })?.[0]).toBe('height');
  });
  it('CU27: weight bounds 1-500 kg', () => {
    expect(validateCustomer({ ...base(), weight: 0 })?.[0]).toBe('weight');
    expect(validateCustomer({ ...base(), weight: 600 })?.[0]).toBe('weight');
    expect(validateCustomer({ ...base(), weight: 70 })).toBeNull();
  });
  it('CU28: negative income rejected', () => {
    expect(validateCustomer({ ...base(), income: -1 })?.[0]).toBe('income');
  });
  it('CU29: zero income accepted', () => {
    expect(validateCustomer({ ...base(), income: 0 })).toBeNull();
  });
});

describe('validateCustomer — consent + length bounds', () => {
  it('CU30: consent non-object rejected', () => {
    expect(validateCustomer({ ...base(), consent: 'yes' })?.[0]).toBe('consent');
    expect(validateCustomer({ ...base(), consent: [] })?.[0]).toBe('consent');
  });
  it('CU31: consent.marketing must be boolean', () => {
    expect(validateCustomer({ ...base(), consent: { marketing: 'yes' } })?.[0]).toBe('consent');
    expect(validateCustomer({ ...base(), consent: { marketing: true } })).toBeNull();
  });
  it('CU32: over-long note rejected', () => {
    expect(validateCustomer({ ...base(), note: 'x'.repeat(2001) })?.[0]).toBe('note');
  });
  it('CU33: over-long address rejected', () => {
    expect(validateCustomer({ ...base(), address: 'x'.repeat(501) })?.[0]).toBe('address');
  });
  it('CU34: firstname > 100 rejected', () => {
    expect(validateCustomer({ ...base(), firstname: 'x'.repeat(101) })?.[0]).toBe('firstname');
  });
});

describe('normalizeCustomer', () => {
  it('NC1: trims string fields', () => {
    const n = normalizeCustomer({ ...base(), firstname: '  สม  ', telephone_number: ' 081-234-5678 ' });
    expect(n.firstname).toBe('สม');
    expect(n.telephone_number).toBe('081-234-5678');
  });
  it('NC2: coerces height/weight/income strings to numbers', () => {
    const n = normalizeCustomer({ ...base(), height: '170.5', weight: '65', income: '25000' });
    expect(n.height).toBe(170.5);
    expect(n.weight).toBe(65);
    expect(n.income).toBe(25000);
  });
  it('NC3: empty numeric → null', () => {
    const n = normalizeCustomer({ ...base(), height: '', weight: '', income: '' });
    expect(n.height).toBeNull();
    expect(n.weight).toBeNull();
    expect(n.income).toBeNull();
  });
  it('NC4: normalizes gender to uppercase', () => {
    expect(normalizeCustomer({ ...base(), gender: 'm' }).gender).toBe('M');
    expect(normalizeCustomer({ ...base(), gender: 'f' }).gender).toBe('F');
    expect(normalizeCustomer({ ...base(), gender: 'x' }).gender).toBe('');
  });
  it('NC5: strips dashes + spaces from citizen_id', () => {
    expect(normalizeCustomer({ ...base(), citizen_id: '1-2345-67890-12-3' }).citizen_id).toBe('1234567890123');
  });
  it('NC6: consent shape normalized always', () => {
    expect(normalizeCustomer({}).consent).toEqual({ marketing: false, healthData: false });
    expect(normalizeCustomer({ consent: { marketing: true } }).consent).toEqual({ marketing: true, healthData: false });
    expect(normalizeCustomer({ consent: 'invalid' }).consent).toEqual({ marketing: false, healthData: false });
  });
  it('NC7: coerces truthy non-boolean flags', () => {
    const n = normalizeCustomer({ ...base(), pregnanted: 1, is_image_marketing_allowed: 'yes' });
    expect(n.pregnanted).toBe(true);
    expect(n.is_image_marketing_allowed).toBe(true);
  });
  it('NC8: preserves non-numeric customer_type / source strings', () => {
    const n = normalizeCustomer({ ...base(), customer_type: 'ลูกค้าเก่า', source: 'Facebook' });
    expect(n.customer_type).toBe('ลูกค้าเก่า');
    expect(n.source).toBe('Facebook');
  });
});

describe('normalizeCustomer + validate round-trip', () => {
  it('RT1: ProClinic-shaped import survives normalize + non-strict validate', () => {
    const imported = {
      hn_no: 'HN-12345',
      firstname: ' สมชาย ',
      lastname: ' ใจดี ',
      telephone_number: '081-234-5678',
      citizen_id: '1-2345-67890-12-3',
      birthdate: '1990-05-15',
      gender: 'm',
      height: '170',
      weight: '65',
      email: 'som@clinic.com',
      consent: { marketing: false },
    };
    const n = normalizeCustomer(imported);
    expect(validateCustomer(n)).toBeNull();
    expect(n.firstname).toBe('สมชาย');
    expect(n.citizen_id).toBe('1234567890123');
    expect(n.gender).toBe('M');
    expect(n.height).toBe(170);
  });
});
