// ─── Promotion CRUD — adversarial unit tests (Phase 9) ──────────────────────
// Focuses on pure functions so the suite runs at master without Firebase
// signin (integration tests would hit PERMISSION_DENIED — see rules/02).
//
// Invariants covered:
//  V1  empty promotion_name → rejected
//  V2  whitespace-only promotion_name → rejected
//  V3  sale_price NaN / non-numeric → rejected
//  V4  sale_price negative → rejected
//  V5  flexible mode, min_course_chosen_count > max_course_chosen_count → rejected
//  V6  flexible mode, min_course_chosen_qty > max_course_chosen_qty → rejected
//  V7  fixed mode ignores course-count bounds (they're irrelevant)
//  V8  has_promotion_period with missing start → rejected
//  V9  has_promotion_period with missing end → rejected
//  V10 has_promotion_period with end before start → rejected
//  V11 valid minimal promotion (fixed mode, no period) → passes
//  V12 valid flexible + valid period → passes
//  F1  buildPromotionFormData sets _token from csrf
//  F2  buildPromotionFormData sets promotion_name + sale_price from data
//  F3  is_vat_included=true → encoded as "1"
//  F4  is_vat_included=false → key omitted (Laravel convention)
//  F5  promotion_period_start/end → promotion_period = "YYYY-MM-DD to YYYY-MM-DD"
//  F6  has_promotion_period=false → promotion_period key deleted
//  F7  defaults merge preserves unknown ProClinic-side fields (e.g. user_id)
//  F8  promotion_type = "flexible" serializes min/max bounds
//  F9  status = "suspended" serializes correctly
//  F10 emptyPromotionForm contains all 23 expected keys with sane defaults

import { describe, it, expect } from 'vitest';
import { validatePromotion, emptyPromotionForm } from '../src/lib/promotionValidation.js';
import { buildPromotionFormData } from '../api/proclinic/promotion.js';

describe('validatePromotion — V1…V12', () => {
  const base = () => ({ ...emptyPromotionForm(), promotion_name: 'ชื่อ', sale_price: 100 });

  it('V1: rejects empty promotion_name', () => {
    const r = validatePromotion({ ...base(), promotion_name: '' });
    expect(r?.[0]).toBe('promotion_name');
  });

  it('V2: rejects whitespace-only promotion_name', () => {
    const r = validatePromotion({ ...base(), promotion_name: '   \t  ' });
    expect(r?.[0]).toBe('promotion_name');
  });

  it('V3: rejects sale_price NaN / garbage string', () => {
    const r = validatePromotion({ ...base(), sale_price: 'abc' });
    expect(r?.[0]).toBe('sale_price');
  });

  it('V4: rejects negative sale_price', () => {
    const r = validatePromotion({ ...base(), sale_price: -1 });
    expect(r?.[0]).toBe('sale_price');
  });

  it('V5: flexible mode — rejects min_course_chosen_count > max', () => {
    const r = validatePromotion({
      ...base(), promotion_type: 'flexible',
      min_course_chosen_count: 5, max_course_chosen_count: 2,
      min_course_chosen_qty: 1, max_course_chosen_qty: 1,
    });
    expect(r?.[0]).toBe('min_course_chosen_count');
  });

  it('V6: flexible mode — rejects min_course_chosen_qty > max', () => {
    const r = validatePromotion({
      ...base(), promotion_type: 'flexible',
      min_course_chosen_count: 1, max_course_chosen_count: 10,
      min_course_chosen_qty: 7, max_course_chosen_qty: 3,
    });
    expect(r?.[0]).toBe('min_course_chosen_qty');
  });

  it('V7: fixed mode skips course-count inverted-bound check', () => {
    // Same inverted bounds as V5 but fixed mode should let it pass.
    const r = validatePromotion({
      ...base(), promotion_type: 'fixed',
      min_course_chosen_count: 5, max_course_chosen_count: 2,
    });
    expect(r).toBeNull();
  });

  it('V8: has_promotion_period without start → rejected', () => {
    const r = validatePromotion({
      ...base(), has_promotion_period: true,
      promotion_period_start: '', promotion_period_end: '2026-05-01',
    });
    expect(r?.[0]).toBe('promotion_period_start');
  });

  it('V9: has_promotion_period without end → rejected', () => {
    const r = validatePromotion({
      ...base(), has_promotion_period: true,
      promotion_period_start: '2026-04-01', promotion_period_end: '',
    });
    expect(r?.[0]).toBe('promotion_period_end');
  });

  it('V10: has_promotion_period with end < start → rejected', () => {
    const r = validatePromotion({
      ...base(), has_promotion_period: true,
      promotion_period_start: '2026-05-01', promotion_period_end: '2026-04-01',
    });
    expect(r?.[0]).toBe('promotion_period_end');
  });

  it('V11: minimal fixed-mode promotion → passes', () => {
    const r = validatePromotion({ ...base() });
    expect(r).toBeNull();
  });

  it('V12: valid flexible + valid period → passes', () => {
    const r = validatePromotion({
      ...base(), promotion_type: 'flexible',
      min_course_chosen_count: 1, max_course_chosen_count: 5,
      min_course_chosen_qty: 1, max_course_chosen_qty: 10,
      has_promotion_period: true,
      promotion_period_start: '2026-04-01', promotion_period_end: '2026-04-30',
    });
    expect(r).toBeNull();
  });

  it('extra: equal min == max bounds are fine (boundary case)', () => {
    const r = validatePromotion({
      ...base(), promotion_type: 'flexible',
      min_course_chosen_count: 3, max_course_chosen_count: 3,
      min_course_chosen_qty: 1, max_course_chosen_qty: 1,
    });
    expect(r).toBeNull();
  });

  it('extra: same-day period (start==end) is fine', () => {
    const r = validatePromotion({
      ...base(), has_promotion_period: true,
      promotion_period_start: '2026-04-15', promotion_period_end: '2026-04-15',
    });
    expect(r).toBeNull();
  });
});

describe('buildPromotionFormData — F1…F10', () => {
  const baseData = () => ({ ...emptyPromotionForm(), promotion_name: 'โปรฯ ทดสอบ', sale_price: 1500 });
  const CSRF = 'abc123-csrf-token';

  it('F1: sets _token from csrf argument', () => {
    const fd = buildPromotionFormData(baseData(), CSRF);
    expect(fd.get('_token')).toBe(CSRF);
  });

  it('F2: maps promotion_name + sale_price', () => {
    const fd = buildPromotionFormData(baseData(), CSRF);
    expect(fd.get('promotion_name')).toBe('โปรฯ ทดสอบ');
    expect(fd.get('sale_price')).toBe('1500');
  });

  it('F3: is_vat_included=true → encoded as "1"', () => {
    const fd = buildPromotionFormData({ ...baseData(), is_vat_included: true }, CSRF);
    expect(fd.get('is_vat_included')).toBe('1');
  });

  it('F4: is_vat_included=false → key omitted (Laravel checkbox convention)', () => {
    const fd = buildPromotionFormData({ ...baseData(), is_vat_included: false }, CSRF);
    expect(fd.has('is_vat_included')).toBe(false);
  });

  it('F5: period set → promotion_period = "YYYY-MM-DD to YYYY-MM-DD"', () => {
    const fd = buildPromotionFormData({
      ...baseData(),
      has_promotion_period: true,
      promotion_period_start: '2026-04-01',
      promotion_period_end: '2026-04-30',
    }, CSRF);
    expect(fd.get('has_promotion_period')).toBe('1');
    expect(fd.get('promotion_period')).toBe('2026-04-01 to 2026-04-30');
  });

  it('F6: has_promotion_period=false → promotion_period key absent', () => {
    const fd = buildPromotionFormData({
      ...baseData(),
      has_promotion_period: false,
      promotion_period_start: '2026-04-01',  // even with start set, we should still delete
      promotion_period_end: '2026-04-30',
    }, CSRF);
    expect(fd.has('has_promotion_period')).toBe(false);
    expect(fd.has('promotion_period')).toBe(false);
  });

  it('F7: defaults merge preserves unknown ProClinic-side fields', () => {
    const defaults = { user_id: '42', branch_id: '28', weirdLaravelField: 'keep_me' };
    const fd = buildPromotionFormData(baseData(), CSRF, defaults);
    expect(fd.get('user_id')).toBe('42');
    expect(fd.get('branch_id')).toBe('28');
    expect(fd.get('weirdLaravelField')).toBe('keep_me');
    // But our explicit data must still win:
    expect(fd.get('promotion_name')).toBe('โปรฯ ทดสอบ');
    expect(fd.get('_token')).toBe(CSRF);
  });

  it('F8: flexible mode serializes min/max bounds', () => {
    const fd = buildPromotionFormData({
      ...baseData(),
      promotion_type: 'flexible',
      min_course_chosen_count: 2, max_course_chosen_count: 8,
      min_course_chosen_qty: 3, max_course_chosen_qty: 12,
    }, CSRF);
    expect(fd.get('promotion_type')).toBe('flexible');
    expect(fd.get('min_course_chosen_count')).toBe('2');
    expect(fd.get('max_course_chosen_count')).toBe('8');
    expect(fd.get('min_course_chosen_qty')).toBe('3');
    expect(fd.get('max_course_chosen_qty')).toBe('12');
  });

  it('F9: status=suspended serializes correctly', () => {
    const fd = buildPromotionFormData({ ...baseData(), status: 'suspended' }, CSRF);
    expect(fd.get('status')).toBe('suspended');
  });

  it('F10: is_price_line_display=false → "0" (not omitted — radio must be explicit)', () => {
    const fd = buildPromotionFormData({ ...baseData(), is_price_line_display: false }, CSRF);
    expect(fd.get('is_price_line_display')).toBe('0');
  });
});

describe('emptyPromotionForm — baseline integrity', () => {
  it('returns all 23 expected keys with sane defaults', () => {
    const f = emptyPromotionForm();
    const expectedKeys = [
      'usage_type', 'promotion_name', 'receipt_promotion_name', 'promotion_code',
      'category_name', 'procedure_type_name', 'deposit_price', 'sale_price',
      'is_vat_included', 'sale_price_incl_vat', 'promotion_type',
      'min_course_chosen_count', 'max_course_chosen_count',
      'min_course_chosen_qty', 'max_course_chosen_qty',
      'has_promotion_period', 'promotion_period_start', 'promotion_period_end',
      'description', 'status', 'enable_line_oa_display',
      'is_price_line_display', 'button_label',
    ];
    for (const k of expectedKeys) expect(f).toHaveProperty(k);
    expect(f.usage_type).toBe('clinic');
    expect(f.promotion_type).toBe('fixed');
    expect(f.status).toBe('active');
    expect(f.has_promotion_period).toBe(false);
    expect(f.is_vat_included).toBe(false);
    expect(f.is_price_line_display).toBe(true);
  });

  it('spreading over empty form preserves original defaults when override is empty', () => {
    const merged = { ...emptyPromotionForm(), ...{} };
    expect(merged.promotion_type).toBe('fixed');
    expect(merged.status).toBe('active');
  });
});
