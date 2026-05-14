// tests/phase-29-master-data-recall-fields.test.js
//
// Phase 29.3 (2026-05-14) — TDD test bank for be_products + be_courses
// recall-master-data extension: 4 new optional fields each
// (followUpAfterDays + followUpReason + recallAfterDays + recallReason).
//
// validateProduct / validateCourse return `null` on success or
// `[fieldKey, message]` on first failure (codebase convention — NOT {ok, errors}).

import { describe, it, expect } from 'vitest';
import {
  emptyProductForm,
  validateProduct,
  normalizeProduct,
} from '../src/lib/productValidation.js';
import {
  emptyCourseForm,
  validateCourse,
  normalizeCourse,
} from '../src/lib/courseValidation.js';

describe('Phase 29 · M1 emptyProductForm has 4 new recall fields', () => {
  it('M1.1 followUpAfterDays present and null', () => {
    expect(emptyProductForm()).toHaveProperty('followUpAfterDays', null);
  });
  it('M1.2 followUpReason present and null', () => {
    expect(emptyProductForm()).toHaveProperty('followUpReason', null);
  });
  it('M1.3 recallAfterDays present and null', () => {
    expect(emptyProductForm()).toHaveProperty('recallAfterDays', null);
  });
  it('M1.4 recallReason present and null', () => {
    expect(emptyProductForm()).toHaveProperty('recallReason', null);
  });
});

describe('Phase 29 · M2 emptyCourseForm has 4 new recall fields', () => {
  it('M2.1 followUpAfterDays present and null', () => {
    expect(emptyCourseForm()).toHaveProperty('followUpAfterDays', null);
  });
  it('M2.2 followUpReason present and null', () => {
    expect(emptyCourseForm()).toHaveProperty('followUpReason', null);
  });
  it('M2.3 recallAfterDays present and null', () => {
    expect(emptyCourseForm()).toHaveProperty('recallAfterDays', null);
  });
  it('M2.4 recallReason present and null', () => {
    expect(emptyCourseForm()).toHaveProperty('recallReason', null);
  });
});

describe('Phase 29 · M3 validateProduct accepts/rejects recall fields', () => {
  const base = () => ({ ...emptyProductForm(), productName: 'X' });

  it('M3.1 null fields accepted (optional)', () => {
    expect(validateProduct(base())).toBeNull();
  });
  it('M3.2 positive integer accepted on followUpAfterDays', () => {
    expect(validateProduct({ ...base(), followUpAfterDays: 1 })).toBeNull();
  });
  it('M3.3 zero accepted (same-day recall)', () => {
    expect(validateProduct({ ...base(), followUpAfterDays: 0 })).toBeNull();
  });
  it('M3.4 negative followUpAfterDays rejected', () => {
    const out = validateProduct({ ...base(), followUpAfterDays: -1 });
    expect(out).not.toBeNull();
    expect(out[0]).toBe('followUpAfterDays');
  });
  it('M3.5 negative recallAfterDays rejected', () => {
    const out = validateProduct({ ...base(), recallAfterDays: -5 });
    expect(out).not.toBeNull();
    expect(out[0]).toBe('recallAfterDays');
  });
  it('M3.6 non-integer rejected', () => {
    const out = validateProduct({ ...base(), recallAfterDays: 3.5 });
    expect(out).not.toBeNull();
    expect(out[0]).toBe('recallAfterDays');
  });
  it('M3.7 huge value rejected (>3650 days)', () => {
    const out = validateProduct({ ...base(), recallAfterDays: 5000 });
    expect(out).not.toBeNull();
    expect(out[0]).toBe('recallAfterDays');
  });
  it('M3.8 valid recallAfterDays=180 (6 months) accepted', () => {
    expect(validateProduct({ ...base(), recallAfterDays: 180 })).toBeNull();
  });
});

describe('Phase 29 · M4 validateCourse mirrors product validation', () => {
  const base = () => ({ ...emptyCourseForm(), courseName: 'X' });

  it('M4.1 null fields accepted', () => {
    expect(validateCourse(base())).toBeNull();
  });
  it('M4.2 valid followUpAfterDays accepted', () => {
    expect(validateCourse({ ...base(), followUpAfterDays: 1 })).toBeNull();
  });
  it('M4.3 negative rejected', () => {
    const out = validateCourse({ ...base(), recallAfterDays: -1 });
    expect(out).not.toBeNull();
    expect(out[0]).toBe('recallAfterDays');
  });
  it('M4.4 non-integer rejected', () => {
    const out = validateCourse({ ...base(), recallAfterDays: 1.7 });
    expect(out).not.toBeNull();
    expect(out[0]).toBe('recallAfterDays');
  });
});

describe('Phase 29 · M5 normalizeProduct preserves recall fields', () => {
  it('M5.1 null stays null', () => {
    const out = normalizeProduct({ ...emptyProductForm(), recallAfterDays: null });
    expect(out.recallAfterDays).toBeNull();
  });
  it('M5.2 numeric preserved', () => {
    const out = normalizeProduct({ ...emptyProductForm(), recallAfterDays: 180 });
    expect(out.recallAfterDays).toBe(180);
  });
  it('M5.3 empty string normalized to null', () => {
    const out = normalizeProduct({ ...emptyProductForm(), recallAfterDays: '' });
    expect(out.recallAfterDays).toBeNull();
  });
  it('M5.4 string reason trimmed', () => {
    const out = normalizeProduct({ ...emptyProductForm(), recallReason: '  ฟิลเลอร์ครบรอบ  ' });
    expect(out.recallReason).toBe('ฟิลเลอร์ครบรอบ');
  });
  it('M5.5 empty reason → null', () => {
    const out = normalizeProduct({ ...emptyProductForm(), recallReason: '' });
    expect(out.recallReason).toBeNull();
  });
});

describe('Phase 29 · M6 normalizeCourse mirrors product normalization', () => {
  it('M6.1 null preserved', () => {
    const out = normalizeCourse({ ...emptyCourseForm(), recallAfterDays: null });
    expect(out.recallAfterDays).toBeNull();
  });
  it('M6.2 numeric preserved', () => {
    const out = normalizeCourse({ ...emptyCourseForm(), recallAfterDays: 180 });
    expect(out.recallAfterDays).toBe(180);
  });
  it('M6.3 empty string → null', () => {
    const out = normalizeCourse({ ...emptyCourseForm(), recallAfterDays: '' });
    expect(out.recallAfterDays).toBeNull();
  });
  it('M6.4 reason trim + empty→null', () => {
    expect(normalizeCourse({ ...emptyCourseForm(), recallReason: '  x  ' }).recallReason).toBe('x');
    expect(normalizeCourse({ ...emptyCourseForm(), recallReason: '' }).recallReason).toBeNull();
  });
});

describe('Phase 29 · M7 no undefined leaves (V14 lock)', () => {
  it('M7.1 emptyProductForm has no undefined values', () => {
    const form = emptyProductForm();
    for (const [k, v] of Object.entries(form)) {
      expect(v, `${k} is undefined`).not.toBeUndefined();
    }
  });
  it('M7.2 emptyCourseForm has no undefined values', () => {
    const form = emptyCourseForm();
    for (const [k, v] of Object.entries(form)) {
      expect(v, `${k} is undefined`).not.toBeUndefined();
    }
  });
  it('M7.3 normalizeProduct output has no undefined values', () => {
    const out = normalizeProduct({ ...emptyProductForm(), productName: 'X' });
    for (const [k, v] of Object.entries(out)) {
      expect(v, `${k} is undefined`).not.toBeUndefined();
    }
  });
  it('M7.4 normalizeCourse output has no undefined values', () => {
    const out = normalizeCourse({ ...emptyCourseForm(), courseName: 'X' });
    for (const [k, v] of Object.entries(out)) {
      expect(v, `${k} is undefined`).not.toBeUndefined();
    }
  });
});
