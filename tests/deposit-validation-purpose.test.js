import { describe, it, expect } from 'vitest';
import { validateDeposit, emptyDepositForm, normalizeDeposit } from '../src/lib/depositValidation.js';

// V-deposit-noappt (2026-05-27) — be_deposits gains `purpose` (= มัดจำสำหรับ /
// appointmentTo) + `customerNameTemp` / `customerPhoneTemp` (เลือกลูกค้าภายหลัง).
// validateDeposit strict must accept a temp identity (name) when customerId is
// empty so no-appointment / pick-later deposits are valid.
describe('V-deposit purpose + temp identity', () => {
  it('emptyDepositForm has purpose + temp fields', () => {
    const f = emptyDepositForm();
    expect(f.purpose).toBe('');
    expect(f.customerNameTemp).toBe('');
    expect(f.customerPhoneTemp).toBe('');
  });

  it('normalizeDeposit trims the new string fields', () => {
    const n = normalizeDeposit({ amount: 100, customerNameTemp: '  สมหญิง  ', purpose: ' สมรรถภาพ ', customerPhoneTemp: ' 081 ' });
    expect(n.customerNameTemp).toBe('สมหญิง');
    expect(n.purpose).toBe('สมรรถภาพ');
    expect(n.customerPhoneTemp).toBe('081');
  });

  it('normalizeDeposit defaults the new fields to empty string when absent', () => {
    const n = normalizeDeposit({ amount: 100 });
    expect(n.customerNameTemp).toBe('');
    expect(n.customerPhoneTemp).toBe('');
    expect(n.purpose).toBe('');
  });

  it('strict passes with temp identity (no customerId)', () => {
    const fail = validateDeposit(normalizeDeposit({ amount: 2000, paymentChannel: 'เงินสด', customerNameTemp: 'สมหญิง' }), { strict: true });
    expect(fail).toBeNull();
  });

  it('strict fails when neither customerId nor customerNameTemp', () => {
    const fail = validateDeposit(normalizeDeposit({ amount: 2000, paymentChannel: 'เงินสด' }), { strict: true });
    expect(fail?.[0]).toBe('customerId');
  });

  it('strict still passes with a real customerId (regression)', () => {
    const fail = validateDeposit(normalizeDeposit({ amount: 2000, paymentChannel: 'เงินสด', customerId: 'C-1' }), { strict: true });
    expect(fail).toBeNull();
  });

  it('strict still requires paymentChannel (regression)', () => {
    const fail = validateDeposit(normalizeDeposit({ amount: 2000, customerNameTemp: 'สมหญิง' }), { strict: true });
    expect(fail?.[0]).toBe('paymentChannel');
  });
});
