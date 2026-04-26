// ─── Phase 9 Coupon — 60 adversarial scenarios ───────────────────────────
import { describe, it, expect } from 'vitest';
import { validateCoupon, emptyCouponForm, COUPON_BRANCHES } from '../src/lib/couponValidation.js';

const base = (over = {}) => ({
  ...emptyCouponForm(),
  coupon_name: 'โปร',
  coupon_code: 'NEW2026',
  discount: 10,
  discount_type: 'percent',
  max_qty: 100,
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  ...over,
});

describe('Phase 9 Coupon — name/code type safety (12)', () => {
  it('CN1 rejects empty name', () => expect(validateCoupon(base({ coupon_name: '' }))[0]).toBe('coupon_name'));
  it('CN2 rejects whitespace name', () => expect(validateCoupon(base({ coupon_name: '   ' }))[0]).toBe('coupon_name'));
  it('CN3 rejects null name', () => expect(validateCoupon(base({ coupon_name: null }))[0]).toBe('coupon_name'));
  it('CN4 rejects object name', () => expect(validateCoupon(base({ coupon_name: {} }))[0]).toBe('coupon_name'));
  it('CN5 rejects number name', () => expect(validateCoupon(base({ coupon_name: 42 }))[0]).toBe('coupon_name'));
  it('CN6 accepts Thai name with emoji', () => expect(validateCoupon(base({ coupon_name: '🎟️ ส่วนลด 50%' }))).toBeNull());
  it('CN7 accepts 500-char name', () => expect(validateCoupon(base({ coupon_name: 'a'.repeat(500) }))).toBeNull());
  it('CC1 rejects empty code', () => expect(validateCoupon(base({ coupon_code: '' }))[0]).toBe('coupon_code'));
  it('CC2 rejects whitespace code', () => expect(validateCoupon(base({ coupon_code: ' ' }))[0]).toBe('coupon_code'));
  it('CC3 rejects null code', () => expect(validateCoupon(base({ coupon_code: null }))[0]).toBe('coupon_code'));
  it('CC4 rejects undefined code', () => expect(validateCoupon(base({ coupon_code: undefined }))[0]).toBe('coupon_code'));
  it('CC5 accepts alphanumeric code', () => expect(validateCoupon(base({ coupon_code: 'ABC-123_XYZ' }))).toBeNull());
});

describe('Phase 9 Coupon — discount bounds (15)', () => {
  it('CD1 rejects 0 discount (below min 0.01)', () => expect(validateCoupon(base({ discount: 0 }))[0]).toBe('discount'));
  it('CD2 accepts 0.01 (boundary)', () => expect(validateCoupon(base({ discount: 0.01 }))).toBeNull());
  it('CD3 rejects -0.01', () => expect(validateCoupon(base({ discount: -0.01 }))[0]).toBe('discount'));
  it('CD4 rejects NaN', () => expect(validateCoupon(base({ discount: NaN }))[0]).toBe('discount'));
  it('CD5 rejects Infinity', () => expect(validateCoupon(base({ discount: Infinity }))[0]).toBe('discount'));
  it('CD6 accepts 100 as percent (boundary)', () => expect(validateCoupon(base({ discount: 100, discount_type: 'percent' }))).toBeNull());
  it('CD7 rejects 100.01 as percent', () => expect(validateCoupon(base({ discount: 100.01, discount_type: 'percent' }))[0]).toBe('discount'));
  it('CD8 accepts 999 as baht', () => expect(validateCoupon(base({ discount: 999, discount_type: 'baht' }))).toBeNull());
  it('CD9 accepts 1000000 as baht', () => expect(validateCoupon(base({ discount: 1e6, discount_type: 'baht' }))).toBeNull());
  it('CD10 percent 101 rejected', () => expect(validateCoupon(base({ discount: 101 }))[0]).toBe('discount'));
  it('CD11 percent 99.99 accepted', () => expect(validateCoupon(base({ discount: 99.99 }))).toBeNull());
  it('CD12 unknown discount_type falls through to percent rule', () => expect(validateCoupon(base({ discount: 200, discount_type: 'weird' }))[0]).toBe('discount'));
  it('CD13 baht 0.01 minimum ok', () => expect(validateCoupon(base({ discount: 0.01, discount_type: 'baht' }))).toBeNull());
  it('CD14 string "50" coerces to number', () => expect(validateCoupon(base({ discount: '50' }))).toBeNull());
  it('CD15 string "50abc" coerces to NaN → reject', () => expect(validateCoupon(base({ discount: '50abc' }))[0]).toBe('discount'));
});

describe('Phase 9 Coupon — max_qty integer + non-negative (10)', () => {
  it('CQ1 accepts 0 (unlimited)', () => expect(validateCoupon(base({ max_qty: 0 }))).toBeNull());
  it('CQ2 rejects -1', () => expect(validateCoupon(base({ max_qty: -1 }))[0]).toBe('max_qty'));
  it('CQ3 rejects 1.5 (not integer)', () => expect(validateCoupon(base({ max_qty: 1.5 }))[0]).toBe('max_qty'));
  it('CQ4 rejects 0.1', () => expect(validateCoupon(base({ max_qty: 0.1 }))[0]).toBe('max_qty'));
  it('CQ5 rejects NaN', () => expect(validateCoupon(base({ max_qty: NaN }))[0]).toBe('max_qty'));
  it('CQ6 rejects Infinity', () => expect(validateCoupon(base({ max_qty: Infinity }))[0]).toBe('max_qty'));
  it('CQ7 accepts 1000000', () => expect(validateCoupon(base({ max_qty: 1e6 }))).toBeNull());
  it('CQ8 string "100" ok', () => expect(validateCoupon(base({ max_qty: '100' }))).toBeNull());
  it('CQ9 string "100.5" rejected', () => expect(validateCoupon(base({ max_qty: '100.5' }))[0]).toBe('max_qty'));
  it('CQ10 accepts max_qty 1 (boundary)', () => expect(validateCoupon(base({ max_qty: 1 }))).toBeNull());
});

describe('Phase 9 Coupon — dates (13)', () => {
  it('CT1 rejects missing start_date', () => expect(validateCoupon(base({ start_date: '' }))[0]).toBe('start_date'));
  it('CT2 rejects missing end_date', () => expect(validateCoupon(base({ end_date: '' }))[0]).toBe('end_date'));
  it('CT3 rejects end before start', () => expect(validateCoupon(base({ start_date: '2026-12-01', end_date: '2026-01-01' }))[0]).toBe('end_date'));
  it('CT4 accepts same-day (start == end)', () => expect(validateCoupon(base({ start_date: '2026-05-01', end_date: '2026-05-01' }))).toBeNull());
  it('CT5 leap day 2024-02-29 OK', () => expect(validateCoupon(base({ start_date: '2024-02-29', end_date: '2024-03-01' }))).toBeNull());
  it('CT6 non-existent 2025-02-29 — string compare only, not date-parsed — passes', () => expect(validateCoupon(base({ start_date: '2025-02-29', end_date: '2025-03-01' }))).toBeNull());
  it('CT7 cross-year 2026→2027 OK', () => expect(validateCoupon(base({ start_date: '2026-12-31', end_date: '2027-01-01' }))).toBeNull());
  it('CT8 identical dates 0-duration promotion', () => expect(validateCoupon(base({ start_date: '2026-06-15', end_date: '2026-06-15' }))).toBeNull());
  it('CT9 both empty → start error first', () => expect(validateCoupon(base({ start_date: '', end_date: '' }))[0]).toBe('start_date'));
  it('CT10 null start', () => expect(validateCoupon(base({ start_date: null }))[0]).toBe('start_date'));
  it('CT11 undefined end', () => expect(validateCoupon(base({ end_date: undefined }))[0]).toBe('end_date'));
  it('CT12 lexicographic string compare for dates', () => expect(validateCoupon(base({ start_date: '2026-12-31', end_date: '2027-01-01' }))).toBeNull());
  it('CT13 malformed ISO still string-compares', () => expect(validateCoupon(base({ start_date: 'z', end_date: 'a' }))[0]).toBe('end_date'));
});

describe('Phase 9 Coupon — TZ regression (AV9 fix 2026-04-19) — date-string lexicographic compare', () => {
  // Regression: findCouponByCode + CouponTab.expired used new Date().toISOString()
  // which emits UTC. At 00:00-06:59 Bangkok time, UTC is still yesterday →
  // yesterday's coupon would show as still-valid for 7 hours. Fix uses thaiTodayISO.
  // These tests verify the validator's date comparison is pure string-compare
  // (which is correct once the caller passes a Bangkok-local date).

  it('TZ1 valid between start and end', () => {
    expect(validateCoupon(base({ start_date: '2026-01-01', end_date: '2026-12-31' }))).toBeNull();
  });
  it('TZ2 start_date lexicographically after end_date rejected', () => {
    // Even without date parsing, ISO YYYY-MM-DD sorts correctly
    expect(validateCoupon(base({ start_date: '2026-06-01', end_date: '2026-05-31' }))[0]).toBe('end_date');
  });
  it('TZ3 Dec 31 → Jan 1 next year ordered correctly', () => {
    expect(validateCoupon(base({ start_date: '2026-12-31', end_date: '2027-01-01' }))).toBeNull();
  });
  it('TZ4 same YYYY-MM-DD accepted (0-day coupon)', () => {
    expect(validateCoupon(base({ start_date: '2026-04-19', end_date: '2026-04-19' }))).toBeNull();
  });
  it('TZ5 Thai BE-year would string-compare WRONGLY — must be CE (documents the CE convention)', () => {
    // 2569 > 2026 lexicographically, so if caller accidentally passed BE years
    // the compare would still work string-wise, but we keep CE for consistency.
    // This test locks in that the validator doesn't care about year format
    // — the CALLER must pass CE-year ISO strings.
    expect(validateCoupon(base({ start_date: '2569-01-01', end_date: '2569-12-31' }))).toBeNull();
  });
});

describe('Phase 9 Coupon — branch IDs / hardcoded constants (10)', () => {
  it('CB1 COUPON_BRANCHES has exactly 5 entries', () => expect(COUPON_BRANCHES).toHaveLength(5));
  it('CB2 all branch ids are numeric', () => COUPON_BRANCHES.forEach(b => expect(typeof b.id).toBe('number')));
  it('CB3 all branch names are non-empty strings', () => COUPON_BRANCHES.forEach(b => expect(b.name.length).toBeGreaterThan(0)));
  it('CB4 branch ids are unique', () => {
    const ids = COUPON_BRANCHES.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('CB5 branch names are unique', () => {
    const names = COUPON_BRANCHES.map(b => b.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('CB6 validator doesn\'t check branch_ids (branch validation is UI-level)', () => expect(validateCoupon(base({ branch_ids: ['invalid-id-999'] }))).toBeNull());
  it('CB7 empty branch_ids OK', () => expect(validateCoupon(base({ branch_ids: [] }))).toBeNull());
  it('CB8 branch_ids with all 5 OK', () => expect(validateCoupon(base({ branch_ids: COUPON_BRANCHES.map(b => b.id) }))).toBeNull());
  it('CB9 branch_ids as non-array still doesn\'t fail validator (validator scope)', () => expect(validateCoupon(base({ branch_ids: 'weird' }))).toBeNull());
  it('CB10 emptyCouponForm has branch_ids: []', () => expect(emptyCouponForm().branch_ids).toEqual([]));
});
