// ─── Coupon CRUD — adversarial unit tests (Phase 9) ─────────────────────────
// CV1..CV10 validation + CF1..CF8 form-data builder + baseline.

import { describe, it, expect } from 'vitest';
import { validateCoupon, emptyCouponForm, COUPON_BRANCHES } from '../src/lib/couponValidation.js';
import { buildCouponFormData } from '../api/proclinic/coupon.js';

const base = () => ({
  ...emptyCouponForm(),
  coupon_name: 'ส่วนลดปีใหม่',
  coupon_code: 'NEW2026',
  discount: 10,
  discount_type: 'percent',
  max_qty: 100,
  start_date: '2026-01-01',
  end_date: '2026-12-31',
});

describe('validateCoupon', () => {
  it('CV1: rejects empty coupon_name', () => {
    expect(validateCoupon({ ...base(), coupon_name: '' })?.[0]).toBe('coupon_name');
  });
  it('CV2: rejects empty coupon_code', () => {
    expect(validateCoupon({ ...base(), coupon_code: '' })?.[0]).toBe('coupon_code');
  });
  it('CV3: rejects discount < 0.01', () => {
    expect(validateCoupon({ ...base(), discount: 0 })?.[0]).toBe('discount');
  });
  it('CV4: rejects discount > 100 when % type', () => {
    expect(validateCoupon({ ...base(), discount: 150, discount_type: 'percent' })?.[0]).toBe('discount');
  });
  it('CV5: allows discount > 100 when baht type (e.g. 500 baht off)', () => {
    expect(validateCoupon({ ...base(), discount: 500, discount_type: 'baht' })).toBeNull();
  });
  it('CV6: rejects non-integer max_qty', () => {
    expect(validateCoupon({ ...base(), max_qty: 1.5 })?.[0]).toBe('max_qty');
  });
  it('CV7: rejects negative max_qty', () => {
    expect(validateCoupon({ ...base(), max_qty: -1 })?.[0]).toBe('max_qty');
  });
  it('CV8: allows max_qty = 0 (unlimited use convention)', () => {
    expect(validateCoupon({ ...base(), max_qty: 0 })).toBeNull();
  });
  it('CV9: rejects missing start_date', () => {
    expect(validateCoupon({ ...base(), start_date: '' })?.[0]).toBe('start_date');
  });
  it('CV10: rejects end_date < start_date', () => {
    expect(validateCoupon({ ...base(), start_date: '2026-12-01', end_date: '2026-01-01' })?.[0]).toBe('end_date');
  });
  it('extra: valid minimal → null', () => {
    expect(validateCoupon(base())).toBeNull();
  });
  it('extra: same-day period (start == end) is fine', () => {
    expect(validateCoupon({ ...base(), start_date: '2026-05-01', end_date: '2026-05-01' })).toBeNull();
  });
});

describe('buildCouponFormData', () => {
  const CSRF = 'csrf-xyz';
  const full = () => ({ ...base(), is_limit_per_user: true, branch_ids: [28, 30] });

  it('CF1: sets _token from csrf', () => {
    expect(buildCouponFormData(full(), CSRF).get('_token')).toBe(CSRF);
  });
  it('CF2: maps coupon_name + coupon_code + discount + discount_type', () => {
    const fd = buildCouponFormData(full(), CSRF);
    expect(fd.get('coupon_name')).toBe('ส่วนลดปีใหม่');
    expect(fd.get('coupon_code')).toBe('NEW2026');
    expect(fd.get('discount')).toBe('10');
    expect(fd.get('discount_type')).toBe('percent');
  });
  it('CF3: is_limit_per_user=true → "1"', () => {
    expect(buildCouponFormData(full(), CSRF).get('is_limit_per_user')).toBe('1');
  });
  it('CF4: is_limit_per_user=false → key absent', () => {
    expect(buildCouponFormData({ ...full(), is_limit_per_user: false }, CSRF).has('is_limit_per_user')).toBe(false);
  });
  it('CF5: branch_ids → multiple branch_id[] entries', () => {
    const fd = buildCouponFormData(full(), CSRF);
    expect(fd.getAll('branch_id[]')).toEqual(['28', '30']);
  });
  it('CF6: empty branch_ids → no branch_id[] entries', () => {
    const fd = buildCouponFormData({ ...full(), branch_ids: [] }, CSRF);
    expect(fd.getAll('branch_id[]')).toEqual([]);
  });
  it('CF7: defaults merge preserves unknown fields', () => {
    const defaults = { user_id: '42', foo: 'bar' };
    const fd = buildCouponFormData(full(), CSRF, defaults);
    expect(fd.get('user_id')).toBe('42');
    expect(fd.get('foo')).toBe('bar');
    // Our explicit data still wins
    expect(fd.get('coupon_name')).toBe('ส่วนลดปีใหม่');
  });
  it('CF8: defaults with branch_id[] get cleared so our branch_ids replace them', () => {
    // Simulate ProClinic edit page that had branch_id[] already set.
    // URLSearchParams has no direct way to seed multi — set a single one and
    // verify buildCouponFormData strips it before appending our selection.
    const defaults = { 'branch_id[]': '99' };
    const fd = buildCouponFormData(full(), CSRF, defaults);
    expect(fd.getAll('branch_id[]')).toEqual(['28', '30']);  // 99 is gone
  });
});

describe('emptyCouponForm + COUPON_BRANCHES', () => {
  it('empty form has all 10 keys', () => {
    const f = emptyCouponForm();
    expect(Object.keys(f)).toEqual(expect.arrayContaining([
      'coupon_name', 'coupon_code', 'discount', 'discount_type',
      'max_qty', 'is_limit_per_user', 'start_date', 'end_date',
      'description', 'branch_ids',
    ]));
    expect(f.discount_type).toBe('percent');
    expect(f.branch_ids).toEqual([]);
  });
  it('COUPON_BRANCHES has 5 entries with numeric ids', () => {
    expect(COUPON_BRANCHES).toHaveLength(5);
    for (const b of COUPON_BRANCHES) {
      expect(typeof b.id).toBe('number');
      expect(typeof b.name).toBe('string');
    }
  });
});
