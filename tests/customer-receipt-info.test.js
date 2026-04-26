// V33-customer-create — Receipt info resolver tests.

import { describe, it, expect } from 'vitest';
import { resolveCustomerReceiptInfo, formatReceiptInfoLines, RECEIPT_TYPES } from '../src/lib/customerReceiptInfo.js';

describe('V33.RR — receipt_type=personal', () => {
  it('RR1 — uses personal_receipt_* fields', () => {
    const c = {
      receipt_type: 'personal',
      personal_receipt_name: 'นาย สมชาย ใจดี',
      personal_receipt_tax_id: '1234567890123',
      personal_receipt_phonenumber: '0812345678',
      personal_receipt_address: '99 ซอย 1 แขวง พระนคร',
      // These should be IGNORED when type=personal
      firstname: 'จอห์น', lastname: 'โด',
      telephone_number: '0888888888', citizen_id: '9999999999999',
    };
    const r = resolveCustomerReceiptInfo(c);
    expect(r).toEqual({
      type: 'personal',
      name: 'นาย สมชาย ใจดี',
      taxId: '1234567890123',
      phone: '0812345678',
      address: '99 ซอย 1 แขวง พระนคร',
    });
  });
  it('RR2 — empty personal fields → empty strings', () => {
    const r = resolveCustomerReceiptInfo({ receipt_type: 'personal' });
    expect(r).toEqual({ type: 'personal', name: '', taxId: '', phone: '', address: '' });
  });
});

describe('V33.RS — receipt_type=company', () => {
  it('RS1 — uses company_receipt_* fields', () => {
    const c = {
      receipt_type: 'company',
      company_receipt_name: 'บริษัท เอบีซี จำกัด',
      company_receipt_tax_id: '0105555555555',
      company_receipt_phonenumber: '022345678',
      company_receipt_address: '100 ถนน สีลม',
    };
    const r = resolveCustomerReceiptInfo(c);
    expect(r).toEqual({
      type: 'company',
      name: 'บริษัท เอบีซี จำกัด',
      taxId: '0105555555555',
      phone: '022345678',
      address: '100 ถนน สีลม',
    });
  });
  it('RS2 — empty company fields → empty strings', () => {
    const r = resolveCustomerReceiptInfo({ receipt_type: 'company' });
    expect(r).toEqual({ type: 'company', name: '', taxId: '', phone: '', address: '' });
  });
});

describe('V33.RT — receipt_type=inherit (empty / missing)', () => {
  it('RT1 — inherit from root flat fields', () => {
    const c = {
      receipt_type: '',
      prefix: 'นาย',
      firstname: 'จอห์น',
      lastname: 'โด',
      telephone_number: '0812345678',
      citizen_id: '1234567890123',
      address: '50 ม.5',
    };
    const r = resolveCustomerReceiptInfo(c);
    expect(r).toEqual({
      type: '',
      name: 'นาย จอห์น โด',
      taxId: '1234567890123',
      phone: '0812345678',
      address: '50 ม.5',
    });
  });
  it('RT2 — inherit from patientData camelCase mirror (cloned customer shape)', () => {
    const c = {
      patientData: {
        prefix: 'นาง',
        firstName: 'มาลี',
        lastName: 'ใจดี',
        phone: '0898765432',
        nationalId: '5555555555555',
        address: '12/3 ม.1',
      },
    };
    const r = resolveCustomerReceiptInfo(c);
    expect(r).toEqual({
      type: '',
      name: 'นาง มาลี ใจดี',
      taxId: '5555555555555',
      phone: '0898765432',
      address: '12/3 ม.1',
    });
  });
  it('RT3 — undefined receipt_type defaults to inherit', () => {
    const r = resolveCustomerReceiptInfo({ firstname: 'A', lastname: 'B' });
    expect(r.type).toBe('');
    expect(r.name).toBe('A B');
  });
  it('RT4 — name collapses extra whitespace when prefix/middle empty', () => {
    const r = resolveCustomerReceiptInfo({ firstname: '', lastname: 'Last' });
    expect(r.name).toBe('Last');
  });
});

describe('V33.RU — null/undefined safety', () => {
  it('RU1 — null customer → blank inherit', () => {
    expect(resolveCustomerReceiptInfo(null)).toEqual({
      type: '', name: '', taxId: '', phone: '', address: '',
    });
  });
  it('RU2 — undefined customer → blank inherit', () => {
    expect(resolveCustomerReceiptInfo(undefined).type).toBe('');
  });
  it('RU3 — string customer → blank inherit', () => {
    expect(resolveCustomerReceiptInfo('not-an-object').type).toBe('');
  });
});

describe('V33.RV — formatReceiptInfoLines', () => {
  it('RV1 — full info → 4 lines', () => {
    const lines = formatReceiptInfoLines({
      type: 'personal', name: 'A', taxId: '1', phone: '2', address: '3',
    });
    expect(lines).toEqual(['A', 'เลขประจำตัวผู้เสียภาษี: 1', '3', 'โทร. 2']);
  });
  it('RV2 — empty fields skipped', () => {
    expect(formatReceiptInfoLines({ name: 'A' })).toEqual(['A']);
  });
  it('RV3 — null → empty array', () => {
    expect(formatReceiptInfoLines(null)).toEqual([]);
  });
  it('RV4 — only address → 1 line', () => {
    expect(formatReceiptInfoLines({ address: 'X' })).toEqual(['X']);
  });
});

describe('V33.RW — RECEIPT_TYPES constants', () => {
  it('RW1 — exports the 3 known types', () => {
    expect(RECEIPT_TYPES).toEqual({ PERSONAL: 'personal', COMPANY: 'company', INHERIT: '' });
  });
});
