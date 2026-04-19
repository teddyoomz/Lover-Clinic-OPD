// ─── Phase 9 Voucher — 50 adversarial scenarios ──────────────────────────
import { describe, it, expect } from 'vitest';
import { validateVoucher, emptyVoucherForm, VOUCHER_PLATFORMS } from '../src/lib/voucherValidation.js';

const base = (over = {}) => ({
  ...emptyVoucherForm(),
  voucher_name: 'HDmall 500฿',
  sale_price: 1500,
  commission_percent: 15,
  platform: 'HDmall',
  ...over,
});

describe('Phase 9 Voucher — name type safety (10)', () => {
  it('VN1 rejects empty', () => expect(validateVoucher(base({ voucher_name: '' }))[0]).toBe('voucher_name'));
  it('VN2 rejects whitespace', () => expect(validateVoucher(base({ voucher_name: '  ' }))[0]).toBe('voucher_name'));
  it('VN3 rejects null', () => expect(validateVoucher(base({ voucher_name: null }))[0]).toBe('voucher_name'));
  it('VN4 rejects undefined', () => expect(validateVoucher(base({ voucher_name: undefined }))[0]).toBe('voucher_name'));
  it('VN5 rejects number', () => expect(validateVoucher(base({ voucher_name: 123 }))[0]).toBe('voucher_name'));
  it('VN6 rejects object', () => expect(validateVoucher(base({ voucher_name: { x: 1 } }))[0]).toBe('voucher_name'));
  it('VN7 accepts unicode emoji', () => expect(validateVoucher(base({ voucher_name: '🎁 voucher' }))).toBeNull());
  it('VN8 accepts Thai', () => expect(validateVoucher(base({ voucher_name: 'บัตรของขวัญ' }))).toBeNull());
  it('VN9 accepts very long name', () => expect(validateVoucher(base({ voucher_name: 'x'.repeat(1000) }))).toBeNull());
  it('VN10 accepts 1-char', () => expect(validateVoucher(base({ voucher_name: 'v' }))).toBeNull());
});

describe('Phase 9 Voucher — sale_price (10)', () => {
  it('VP1 accepts 0', () => expect(validateVoucher(base({ sale_price: 0 }))).toBeNull());
  it('VP2 accepts 0.01', () => expect(validateVoucher(base({ sale_price: 0.01 }))).toBeNull());
  it('VP3 rejects -1', () => expect(validateVoucher(base({ sale_price: -1 }))[0]).toBe('sale_price'));
  it('VP4 rejects NaN', () => expect(validateVoucher(base({ sale_price: NaN }))[0]).toBe('sale_price'));
  it('VP5 rejects Infinity', () => expect(validateVoucher(base({ sale_price: Infinity }))[0]).toBe('sale_price'));
  it('VP6 accepts 1e10', () => expect(validateVoucher(base({ sale_price: 1e10 }))).toBeNull());
  it('VP7 accepts "500"', () => expect(validateVoucher(base({ sale_price: '500' }))).toBeNull());
  it('VP8 null coerces to 0 → ok', () => expect(validateVoucher(base({ sale_price: null }))).toBeNull());
  it('VP9 empty string coerces to 0 → ok', () => expect(validateVoucher(base({ sale_price: '' }))).toBeNull());
  it('VP10 rejects "abc"', () => expect(validateVoucher(base({ sale_price: 'abc' }))[0]).toBe('sale_price'));
});

describe('Phase 9 Voucher — commission_percent bounds (10)', () => {
  it('VC1 accepts 0', () => expect(validateVoucher(base({ commission_percent: 0 }))).toBeNull());
  it('VC2 accepts 100 (boundary)', () => expect(validateVoucher(base({ commission_percent: 100 }))).toBeNull());
  it('VC3 rejects 100.01', () => expect(validateVoucher(base({ commission_percent: 100.01 }))[0]).toBe('commission_percent'));
  it('VC4 rejects -0.01', () => expect(validateVoucher(base({ commission_percent: -0.01 }))[0]).toBe('commission_percent'));
  it('VC5 rejects NaN', () => expect(validateVoucher(base({ commission_percent: NaN }))[0]).toBe('commission_percent'));
  it('VC6 rejects 1000', () => expect(validateVoucher(base({ commission_percent: 1000 }))[0]).toBe('commission_percent'));
  it('VC7 rejects "abc"', () => expect(validateVoucher(base({ commission_percent: 'abc' }))[0]).toBe('commission_percent'));
  it('VC8 accepts "50"', () => expect(validateVoucher(base({ commission_percent: '50' }))).toBeNull());
  it('VC9 accepts 50.5', () => expect(validateVoucher(base({ commission_percent: 50.5 }))).toBeNull());
  it('VC10 rejects Infinity', () => expect(validateVoucher(base({ commission_percent: Infinity }))[0]).toBe('commission_percent'));
});

describe('Phase 9 Voucher — platform enum (10)', () => {
  it('VPL1 accepts HDmall', () => expect(validateVoucher(base({ platform: 'HDmall' }))).toBeNull());
  it('VPL2 accepts GoWabi', () => expect(validateVoucher(base({ platform: 'GoWabi' }))).toBeNull());
  it('VPL3 accepts SkinX', () => expect(validateVoucher(base({ platform: 'SkinX' }))).toBeNull());
  it('VPL4 accepts Shopee', () => expect(validateVoucher(base({ platform: 'Shopee' }))).toBeNull());
  it('VPL5 accepts Tiktok', () => expect(validateVoucher(base({ platform: 'Tiktok' }))).toBeNull());
  it('VPL6 rejects Amazon', () => expect(validateVoucher(base({ platform: 'Amazon' }))[0]).toBe('platform'));
  it('VPL7 rejects hdmall (case-sensitive)', () => expect(validateVoucher(base({ platform: 'hdmall' }))[0]).toBe('platform'));
  it('VPL8 rejects "TikTok" (typo)', () => expect(validateVoucher(base({ platform: 'TikTok' }))[0]).toBe('platform'));
  it('VPL9 empty platform OK (optional)', () => expect(validateVoucher(base({ platform: '' }))).toBeNull());
  it('VPL10 VOUCHER_PLATFORMS has exactly 5 entries', () => expect(VOUCHER_PLATFORMS).toHaveLength(5));
});

describe('Phase 9 Voucher — period (10)', () => {
  const withPeriod = (over) => base({ has_period: true, period_start: '2026-04-01', period_end: '2026-04-30', ...over });

  it('VT1 has_period off, dates empty OK', () => expect(validateVoucher(base())).toBeNull());
  it('VT2 has_period on, start empty', () => expect(validateVoucher(withPeriod({ period_start: '' }))[0]).toBe('period_start'));
  it('VT3 has_period on, end empty', () => expect(validateVoucher(withPeriod({ period_end: '' }))[0]).toBe('period_end'));
  it('VT4 end < start', () => expect(validateVoucher(withPeriod({ period_start: '2026-12-31', period_end: '2026-01-01' }))[0]).toBe('period_end'));
  it('VT5 end = start OK', () => expect(validateVoucher(withPeriod({ period_start: '2026-04-15', period_end: '2026-04-15' }))).toBeNull());
  it('VT6 cross-year OK', () => expect(validateVoucher(withPeriod({ period_start: '2026-12-30', period_end: '2027-01-01' }))).toBeNull());
  it('VT7 has_period false with populated dates OK (ignored)', () => expect(validateVoucher(base({ has_period: false, period_start: '2026-12-31', period_end: '2026-01-01' }))).toBeNull());
  it('VT8 has_period truthy number', () => expect(validateVoucher(withPeriod({ has_period: 1 }))).toBeNull());
  it('VT9 period_start null', () => expect(validateVoucher(withPeriod({ period_start: null }))[0]).toBe('period_start'));
  it('VT10 period_end undefined', () => expect(validateVoucher(withPeriod({ period_end: undefined }))[0]).toBe('period_end'));
});
