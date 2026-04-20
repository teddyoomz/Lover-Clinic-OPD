// ─── Phase 12.2 · course validation adversarial tests ─────────────────────
import { describe, it, expect } from 'vitest';
import {
  validateCourse, emptyCourseForm, normalizeCourse, generateCourseId,
  STATUS_OPTIONS,
} from '../src/lib/courseValidation.js';

const base = () => ({ ...emptyCourseForm(), courseName: 'Laser 1 ครั้ง' });

describe('validateCourse', () => {
  it('CV1: null/array rejected', () => {
    expect(validateCourse(null)?.[0]).toBe('form');
    expect(validateCourse([])?.[0]).toBe('form');
  });
  it('CV2: empty courseName rejected', () => {
    expect(validateCourse({ ...base(), courseName: '' })?.[0]).toBe('courseName');
  });
  it('CV3: over-long courseName rejected', () => {
    expect(validateCourse({ ...base(), courseName: 'x'.repeat(201) })?.[0]).toBe('courseName');
  });
  it('CV4: over-long receiptCourseName rejected', () => {
    expect(validateCourse({ ...base(), receiptCourseName: 'x'.repeat(201) })?.[0]).toBe('receiptCourseName');
  });
  it('CV5: negative salePrice rejected', () => {
    expect(validateCourse({ ...base(), salePrice: -100 })?.[0]).toBe('salePrice');
  });
  it('CV6: NaN salePrice rejected', () => {
    expect(validateCourse({ ...base(), salePrice: 'abc' })?.[0]).toBe('salePrice');
  });
  it('CV7: zero salePrice accepted', () => {
    expect(validateCourse({ ...base(), salePrice: 0 })).toBeNull();
  });
  it('CV8: negative time rejected', () => {
    expect(validateCourse({ ...base(), time: -10 })?.[0]).toBe('time');
  });
  it('CV9: each enumerated status accepted', () => {
    for (const s of STATUS_OPTIONS) {
      expect(validateCourse({ ...base(), status: s })).toBeNull();
    }
  });
  it('CV10: unknown status rejected', () => {
    expect(validateCourse({ ...base(), status: 'archived' })?.[0]).toBe('status');
  });
  it('CV11: courseProducts must be array', () => {
    expect(validateCourse({ ...base(), courseProducts: 'not-array' })?.[0]).toBe('courseProducts');
  });
  it('CV12: courseProducts item must be object', () => {
    expect(validateCourse({ ...base(), courseProducts: ['str'] })?.[0]).toBe('courseProducts');
  });
  it('CV13: courseProducts item needs productId', () => {
    expect(validateCourse({ ...base(), courseProducts: [{ qty: 1 }] })?.[0]).toBe('courseProducts');
  });
  it('CV14: courseProducts qty must be > 0', () => {
    expect(validateCourse({ ...base(), courseProducts: [{ productId: 'P1', qty: 0 }] })?.[0]).toBe('courseProducts');
    expect(validateCourse({ ...base(), courseProducts: [{ productId: 'P1', qty: -1 }] })?.[0]).toBe('courseProducts');
  });
  it('CV15: valid courseProducts accepted', () => {
    expect(validateCourse({ ...base(), courseProducts: [{ productId: 'P1', qty: 2, productName: 'X' }] })).toBeNull();
  });
  it('CV16: non-boolean isVatIncluded rejected', () => {
    expect(validateCourse({ ...base(), isVatIncluded: 'yes' })?.[0]).toBe('isVatIncluded');
  });
  it('CV17: valid minimal form', () => {
    expect(validateCourse(base())).toBeNull();
  });
});

describe('normalizeCourse', () => {
  it('CN1: coerces numbers', () => {
    const n = normalizeCourse({ ...base(), salePrice: '1200', time: '30' });
    expect(n.salePrice).toBe(1200);
    expect(n.time).toBe(30);
  });
  it('CN2: empty numeric → null', () => {
    const n = normalizeCourse({ ...base(), salePrice: '', time: '' });
    expect(n.salePrice).toBeNull();
    expect(n.time).toBeNull();
  });
  it('CN3: drops courseProducts with zero/missing id', () => {
    const n = normalizeCourse({ ...base(), courseProducts: [
      { productId: 'P1', qty: 2, productName: 'A' },
      { productId: '', qty: 1, productName: 'B' },
      { productId: 'P2', qty: 0, productName: 'C' },
    ]});
    expect(n.courseProducts).toHaveLength(1);
    expect(n.courseProducts[0].productId).toBe('P1');
  });
  it('CN4: trims string fields', () => {
    const n = normalizeCourse({ ...base(), courseName: '  X  ', courseCode: '  CODE  ' });
    expect(n.courseName).toBe('X');
    expect(n.courseCode).toBe('CODE');
  });
});

describe('generateCourseId', () => {
  it('CG1: COURSE- prefix', () => {
    expect(generateCourseId()).toMatch(/^COURSE-[0-9a-z]+-[0-9a-f]{16}$/);
  });
  it('CG2: unique across 50', () => {
    const s = new Set();
    for (let i = 0; i < 50; i++) s.add(generateCourseId());
    expect(s.size).toBe(50);
  });
});
