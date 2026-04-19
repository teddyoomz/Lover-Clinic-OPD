// ─── Voucher CRUD — adversarial unit tests (Phase 9) ────────────────────────
import { describe, it, expect } from 'vitest';
import { validateVoucher, emptyVoucherForm, VOUCHER_PLATFORMS } from '../src/lib/voucherValidation.js';
import { buildVoucherFormData } from '../api/proclinic/voucher.js';

const base = () => ({
  ...emptyVoucherForm(),
  voucher_name: 'HDmall ส่วนลด 500',
  sale_price: 1500,
  commission_percent: 15,
  platform: 'HDmall',
});

describe('validateVoucher', () => {
  it('VV1: rejects empty voucher_name', () => {
    expect(validateVoucher({ ...base(), voucher_name: '' })?.[0]).toBe('voucher_name');
  });
  it('VV2: rejects negative sale_price', () => {
    expect(validateVoucher({ ...base(), sale_price: -1 })?.[0]).toBe('sale_price');
  });
  it('VV3: rejects commission > 100', () => {
    expect(validateVoucher({ ...base(), commission_percent: 150 })?.[0]).toBe('commission_percent');
  });
  it('VV4: rejects commission NaN', () => {
    expect(validateVoucher({ ...base(), commission_percent: 'abc' })?.[0]).toBe('commission_percent');
  });
  it('VV5: rejects invalid platform', () => {
    expect(validateVoucher({ ...base(), platform: 'Tokopedia' })?.[0]).toBe('platform');
  });
  it('VV6: empty platform is OK (not required)', () => {
    expect(validateVoucher({ ...base(), platform: '' })).toBeNull();
  });
  it('VV7: has_period missing start → rejected', () => {
    expect(validateVoucher({ ...base(), has_period: true, period_start: '', period_end: '2026-05-01' })?.[0]).toBe('period_start');
  });
  it('VV8: has_period end < start → rejected', () => {
    expect(validateVoucher({ ...base(), has_period: true, period_start: '2026-05-01', period_end: '2026-04-01' })?.[0]).toBe('period_end');
  });
  it('VV9: valid base → null', () => {
    expect(validateVoucher(base())).toBeNull();
  });
  it('VV10: commission 0 allowed (free voucher)', () => {
    expect(validateVoucher({ ...base(), commission_percent: 0 })).toBeNull();
  });
});

describe('buildVoucherFormData', () => {
  const CSRF = 'csrf-vv';
  it('VF1: sets _token', () => expect(buildVoucherFormData(base(), CSRF).get('_token')).toBe(CSRF));
  it('VF2: maps voucher_name + prices + platform', () => {
    const fd = buildVoucherFormData(base(), CSRF);
    expect(fd.get('voucher_name')).toBe('HDmall ส่วนลด 500');
    expect(fd.get('sale_price')).toBe('1500');
    expect(fd.get('commission_percent')).toBe('15');
    expect(fd.get('platform')).toBe('HDmall');
  });
  it('VF3: status=suspended serializes', () => {
    expect(buildVoucherFormData({ ...base(), status: 'suspended' }, CSRF).get('status')).toBe('suspended');
  });
  it('VF4: has_period=true → period set', () => {
    const fd = buildVoucherFormData({ ...base(), has_period: true, period_start: '2026-01-01', period_end: '2026-12-31' }, CSRF);
    expect(fd.get('has_period')).toBe('1');
    expect(fd.get('period')).toBe('2026-01-01 to 2026-12-31');
  });
  it('VF5: has_period=false → period key absent', () => {
    const fd = buildVoucherFormData({ ...base(), has_period: false, period_start: '2026-01-01', period_end: '2026-12-31' }, CSRF);
    expect(fd.has('has_period')).toBe(false);
    expect(fd.has('period')).toBe(false);
  });
  it('VF6: defaults merge preserves unknown ProClinic fields', () => {
    const fd = buildVoucherFormData(base(), CSRF, { user_id: '42' });
    expect(fd.get('user_id')).toBe('42');
    expect(fd.get('voucher_name')).toBe('HDmall ส่วนลด 500');
  });
});

describe('VOUCHER_PLATFORMS + emptyVoucherForm', () => {
  it('has 5 platforms', () => {
    expect(VOUCHER_PLATFORMS).toEqual(['HDmall', 'GoWabi', 'SkinX', 'Shopee', 'Tiktok']);
  });
  it('empty form has all keys', () => {
    const f = emptyVoucherForm();
    expect(f.usage_type).toBe('clinic');
    expect(f.status).toBe('active');
    expect(f.has_period).toBe(false);
    expect(f.platform).toBe('');
  });
});
