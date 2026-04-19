// ─── Promotion validation — adversarial unit tests (Phase 9) ───────────────
// Firestore-only entity per rule 03. No ProClinic POST anymore — so the
// buildPromotionFormData / HTTP tests were removed with the API deletion.
// Invariants here are for the pure validator + emptyForm shape.

import { describe, it, expect } from 'vitest';
import { validatePromotion, emptyPromotionForm } from '../src/lib/promotionValidation.js';

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
});
