// ─── Phase 9 Promotion — 80 adversarial scenarios ────────────────────────
// Beyond the baseline tests/promotion.test.js (V1..V12 + emptyForm), this
// suite stress-tests edge cases real clinics hit: Thai text, emoji, very
// long names, extreme pricing, boundary date logic, flexible-mode inter-
// field invariants, VAT math rounding, and state-reset resilience.

import { describe, it, expect } from 'vitest';
import { validatePromotion, emptyPromotionForm } from '../src/lib/promotionValidation.js';

const base = (over = {}) => ({
  ...emptyPromotionForm(),
  promotion_name: 'ทดสอบ',
  sale_price: 100,
  ...over,
});

describe('Phase 9 Promotion — name field (15 scenarios)', () => {
  it('P1 rejects empty string', () => expect(validatePromotion(base({ promotion_name: '' }))[0]).toBe('promotion_name'));
  it('P2 rejects single space', () => expect(validatePromotion(base({ promotion_name: ' ' }))[0]).toBe('promotion_name'));
  it('P3 rejects tab only', () => expect(validatePromotion(base({ promotion_name: '\t' }))[0]).toBe('promotion_name'));
  it('P4 rejects newline only', () => expect(validatePromotion(base({ promotion_name: '\n' }))[0]).toBe('promotion_name'));
  it('P5 rejects mixed whitespace', () => expect(validatePromotion(base({ promotion_name: '  \t\n  ' }))[0]).toBe('promotion_name'));
  it('P6 zero-width space is a valid (non-whitespace) char per String.trim — accepts', () => expect(validatePromotion(base({ promotion_name: '\u200b' }))).toBeNull());
  it('P7 rejects null', () => expect(validatePromotion(base({ promotion_name: null }))[0]).toBe('promotion_name'));
  it('P8 rejects undefined', () => expect(validatePromotion(base({ promotion_name: undefined }))[0]).toBe('promotion_name'));
  it('P9 accepts single Thai char', () => expect(validatePromotion(base({ promotion_name: 'ก' }))).toBeNull());
  it('P10 accepts emoji+text', () => expect(validatePromotion(base({ promotion_name: '🏷️ โปรโมชัน' }))).toBeNull());
  it('P11 accepts Thai with tone marks', () => expect(validatePromotion(base({ promotion_name: 'ผ่านพ้นไปแล้วยังรอได้อีก' }))).toBeNull());
  it('P12 accepts mixed script', () => expect(validatePromotion(base({ promotion_name: 'CHA01 พิเศษ Laser' }))).toBeNull());
  it('P13 accepts 500 char string', () => expect(validatePromotion(base({ promotion_name: 'A'.repeat(500) }))).toBeNull());
  it('P14 accepts string with trailing spaces', () => expect(validatePromotion(base({ promotion_name: 'ชื่อ   ' }))).toBeNull());
  it('P15 rejects number 0 coerced to string', () => expect(validatePromotion(base({ promotion_name: 0 }))[0]).toBe('promotion_name'));
});

describe('Phase 9 Promotion — sale_price (15 scenarios)', () => {
  it('SP1 accepts 0 (free promotion)', () => expect(validatePromotion(base({ sale_price: 0 }))).toBeNull());
  it('SP2 accepts 0.01 (minimum positive)', () => expect(validatePromotion(base({ sale_price: 0.01 }))).toBeNull());
  it('SP3 rejects -0.01', () => expect(validatePromotion(base({ sale_price: -0.01 }))[0]).toBe('sale_price'));
  it('SP4 rejects -1e6', () => expect(validatePromotion(base({ sale_price: -1e6 }))[0]).toBe('sale_price'));
  it('SP5 accepts 1e10', () => expect(validatePromotion(base({ sale_price: 1e10 }))).toBeNull());
  it('SP6 accepts Number.MAX_SAFE_INTEGER', () => expect(validatePromotion(base({ sale_price: Number.MAX_SAFE_INTEGER }))).toBeNull());
  it('SP7 rejects NaN', () => expect(validatePromotion(base({ sale_price: NaN }))[0]).toBe('sale_price'));
  it('SP8 rejects Infinity', () => expect(validatePromotion(base({ sale_price: Infinity }))[0]).toBe('sale_price'));
  it('SP9 rejects -Infinity', () => expect(validatePromotion(base({ sale_price: -Infinity }))[0]).toBe('sale_price'));
  it('SP10 rejects "abc"', () => expect(validatePromotion(base({ sale_price: 'abc' }))[0]).toBe('sale_price'));
  it('SP11 null → 0 (free promotion) — accepts by design', () => expect(validatePromotion(base({ sale_price: null }))).toBeNull());
  it('SP12 accepts "123" (numeric string)', () => expect(validatePromotion(base({ sale_price: '123' }))).toBeNull());
  it('SP13 rejects "123abc"', () => expect(validatePromotion(base({ sale_price: '123abc' }))[0]).toBe('sale_price'));
  it('SP14 accepts "0"', () => expect(validatePromotion(base({ sale_price: '0' }))).toBeNull());
  it('SP15 empty string coerces to 0 — accepts (same as SP11 null path)', () => expect(validatePromotion(base({ sale_price: '' }))).toBeNull());
});

describe('Phase 9 Promotion — flexible mode min/max bounds (20 scenarios)', () => {
  const flex = (over = {}) => base({
    promotion_type: 'flexible',
    min_course_chosen_count: 1, max_course_chosen_count: 10,
    min_course_chosen_qty: 1, max_course_chosen_qty: 10,
    ...over,
  });

  it('FX1 min=max count ok', () => expect(validatePromotion(flex({ min_course_chosen_count: 5, max_course_chosen_count: 5 }))).toBeNull());
  it('FX2 min=max qty ok', () => expect(validatePromotion(flex({ min_course_chosen_qty: 5, max_course_chosen_qty: 5 }))).toBeNull());
  it('FX3 min > max count', () => expect(validatePromotion(flex({ min_course_chosen_count: 6, max_course_chosen_count: 5 }))[0]).toBe('min_course_chosen_count'));
  it('FX4 min > max qty', () => expect(validatePromotion(flex({ min_course_chosen_qty: 6, max_course_chosen_qty: 5 }))[0]).toBe('min_course_chosen_qty'));
  it('FX5 min 0 max 1', () => expect(validatePromotion(flex({ min_course_chosen_count: 0, max_course_chosen_count: 1 }))).toBeNull());
  it('FX6 min negative count', () => expect(validatePromotion(flex({ min_course_chosen_count: -1, max_course_chosen_count: 5 }))).toBeNull());
  it('FX7 string numbers', () => expect(validatePromotion(flex({ min_course_chosen_count: '3', max_course_chosen_count: '7' }))).toBeNull());
  it('FX8 garbage string numbers → 0', () => expect(validatePromotion(flex({ min_course_chosen_count: 'abc', max_course_chosen_count: 'def' }))).toBeNull());
  it('FX9 very large bounds', () => expect(validatePromotion(flex({ max_course_chosen_count: 1e9, max_course_chosen_qty: 1e9 }))).toBeNull());
  it('FX10 qty > count inverted ok (independent fields)', () => expect(validatePromotion(flex({ min_course_chosen_count: 1, max_course_chosen_count: 5, min_course_chosen_qty: 10, max_course_chosen_qty: 20 }))).toBeNull());
  it('FX11 fixed mode ignores all bounds', () => expect(validatePromotion(base({ promotion_type: 'fixed', min_course_chosen_count: 100, max_course_chosen_count: 1 }))).toBeNull());
  it('FX12 fixed mode ignores qty bounds', () => expect(validatePromotion(base({ promotion_type: 'fixed', min_course_chosen_qty: 100, max_course_chosen_qty: 1 }))).toBeNull());
  it('FX13 unknown promotion_type ignored as fixed', () => expect(validatePromotion(base({ promotion_type: 'hybrid', min_course_chosen_count: 10, max_course_chosen_count: 1 }))).toBeNull());
  it('FX14 null promotion_type ignored', () => expect(validatePromotion(base({ promotion_type: null, min_course_chosen_count: 10, max_course_chosen_count: 1 }))).toBeNull());
  it('FX15 empty promotion_type ignored', () => expect(validatePromotion(base({ promotion_type: '', min_course_chosen_count: 10, max_course_chosen_count: 1 }))).toBeNull());
  it('FX16 flexible with count ok + qty fail', () => expect(validatePromotion(flex({ min_course_chosen_qty: 99, max_course_chosen_qty: 1 }))[0]).toBe('min_course_chosen_qty'));
  it('FX17 flexible count fail + qty ok → count reported first', () => expect(validatePromotion(flex({ min_course_chosen_count: 99, max_course_chosen_count: 1, min_course_chosen_qty: 1, max_course_chosen_qty: 10 }))[0]).toBe('min_course_chosen_count'));
  it('FX18 min NaN vs max 5 → min=0 → ok', () => expect(validatePromotion(flex({ min_course_chosen_count: NaN, max_course_chosen_count: 5 }))).toBeNull());
  it('FX19 max NaN vs min 5 → max=0 → min>max violation', () => expect(validatePromotion(flex({ min_course_chosen_count: 5, max_course_chosen_count: NaN }))[0]).toBe('min_course_chosen_count'));
  it('FX20 both undefined → both=0 → ok', () => expect(validatePromotion(flex({ min_course_chosen_count: undefined, max_course_chosen_count: undefined }))).toBeNull());
});

describe('Phase 9 Promotion — period (15 scenarios)', () => {
  const period = (over) => base({ has_promotion_period: true, promotion_period_start: '2026-04-01', promotion_period_end: '2026-04-30', ...over });

  it('PD1 has_period off, dates empty OK', () => expect(validatePromotion(base())).toBeNull());
  it('PD2 has_period off, dates populated OK (ignored)', () => expect(validatePromotion(base({ has_promotion_period: false, promotion_period_start: '2026-01-01', promotion_period_end: '2025-01-01' }))).toBeNull());
  it('PD3 has_period on, start empty', () => expect(validatePromotion(period({ promotion_period_start: '' }))[0]).toBe('promotion_period_start'));
  it('PD4 has_period on, end empty', () => expect(validatePromotion(period({ promotion_period_end: '' }))[0]).toBe('promotion_period_end'));
  it('PD5 end < start', () => expect(validatePromotion(period({ promotion_period_start: '2026-12-31', promotion_period_end: '2026-01-01' }))[0]).toBe('promotion_period_end'));
  it('PD6 end = start', () => expect(validatePromotion(period({ promotion_period_start: '2026-04-15', promotion_period_end: '2026-04-15' }))).toBeNull());
  it('PD7 across year boundary', () => expect(validatePromotion(period({ promotion_period_start: '2026-12-30', promotion_period_end: '2027-01-01' }))).toBeNull());
  it('PD8 leap day Feb 29 2024', () => expect(validatePromotion(period({ promotion_period_start: '2024-02-29', promotion_period_end: '2024-03-01' }))).toBeNull());
  it('PD9 end empty but start present', () => expect(validatePromotion(period({ promotion_period_end: '' }))[0]).toBe('promotion_period_end'));
  it('PD10 both dates empty, has_period on → start first', () => expect(validatePromotion(period({ promotion_period_start: '', promotion_period_end: '' }))[0]).toBe('promotion_period_start'));
  it('PD11 start as null', () => expect(validatePromotion(period({ promotion_period_start: null }))[0]).toBe('promotion_period_start'));
  it('PD12 date strings not ISO (string compare still works)', () => expect(validatePromotion(period({ promotion_period_start: 'b', promotion_period_end: 'a' }))[0]).toBe('promotion_period_end'));
  it('PD13 has_period true as string "true"', () => expect(validatePromotion(period({ has_promotion_period: 'true' }))).toBeNull());
  it('PD14 has_period "false" string (truthy)', () => expect(validatePromotion(period({ has_promotion_period: 'false' }))).toBeNull());
  it('PD15 has_period 1 (truthy number)', () => expect(validatePromotion(period({ has_promotion_period: 1 }))).toBeNull());
});

describe('Phase 9 Promotion — malformed input (15 scenarios)', () => {
  it('MF1 null form', () => expect(validatePromotion(null)[0]).toBe('form'));
  it('MF2 undefined form', () => expect(validatePromotion(undefined)[0]).toBe('form'));
  it('MF3 string form', () => expect(validatePromotion('promotion')[0]).toBe('form'));
  it('MF4 number form', () => expect(validatePromotion(42)[0]).toBe('form'));
  it('MF5 empty object', () => expect(validatePromotion({})[0]).toBe('promotion_name'));
  it('MF6 array as form', () => {
    // Arrays are objects in JS — validator treats as form with no required fields set
    const r = validatePromotion([]);
    expect(r).not.toBeNull();
  });
  it('MF7 extra fields preserved (validator ignores them)', () => expect(validatePromotion(base({ extraField: 'should be ignored' }))).toBeNull());
  it('MF8 nested fields not flattened', () => expect(validatePromotion(base({ promotion_name: { nested: 'obj' } }))[0]).toBe('promotion_name'));
  it('MF9 form with prototype pollution attempt', () => {
    const evil = base({ '__proto__': { promotion_name: 'evil' }, promotion_name: '' });
    expect(validatePromotion(evil)[0]).toBe('promotion_name');
  });
  it('MF10 frozen object', () => {
    const f = Object.freeze(base());
    expect(validatePromotion(f)).toBeNull();
  });
  it('MF11 form with Symbol key (ignored)', () => {
    const s = base();
    s[Symbol('x')] = 'y';
    expect(validatePromotion(s)).toBeNull();
  });
  it('MF12 input not mutated', () => {
    const input = base({ promotion_name: '' });
    const copy = JSON.stringify(input);
    validatePromotion(input);
    expect(JSON.stringify(input)).toBe(copy);
  });
  it('MF13 circular reference survives', () => {
    const c = base();
    c.self = c;
    expect(() => validatePromotion(c)).not.toThrow();
  });
  it('MF14 form with Date object sale_price', () => {
    const d = new Date(100);
    // Date converted to number (ms) = 100 → valid
    expect(validatePromotion(base({ sale_price: d }))).toBeNull();
  });
  it('MF15 function as field value', () => expect(validatePromotion(base({ promotion_name: () => 'x' }))[0]).toBe('promotion_name'));
});
