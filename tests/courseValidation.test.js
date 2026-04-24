// ─── Phase 12.2 · course validation adversarial tests ─────────────────────
import { describe, it, expect } from 'vitest';
import {
  validateCourse, emptyCourseForm, normalizeCourse, generateCourseId,
  STATUS_OPTIONS,
  COURSE_TYPE_OPTIONS, USAGE_TYPE_OPTIONS,
  isRealQtyCourse, isBuffetCourse, isPickAtTreatmentCourse, isSpecificQtyCourse,
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

describe('validateCourse — Phase 12.2b fields (course types + parity)', () => {
  it('CV12: unknown courseType rejected', () => {
    expect(validateCourse({ ...base(), courseType: 'custom' })?.[0]).toBe('courseType');
  });
  it('CV13: all 4 enumerated courseType values accepted', () => {
    for (const t of COURSE_TYPE_OPTIONS) {
      expect(validateCourse({ ...base(), courseType: t })).toBeNull();
    }
  });
  it('CV14: unknown usageType rejected', () => {
    expect(validateCourse({ ...base(), usageType: 'global' })?.[0]).toBe('usageType');
  });
  it('CV15: each usageType option accepted', () => {
    for (const u of USAGE_TYPE_OPTIONS) {
      expect(validateCourse({ ...base(), usageType: u })).toBeNull();
    }
  });
  it('CV16: negative deductCost rejected', () => {
    expect(validateCourse({ ...base(), deductCost: -1 })?.[0]).toBe('deductCost');
  });
  it('CV17: minQty > maxQty rejected', () => {
    expect(validateCourse({ ...base(), minQty: 10, maxQty: 5 })?.[0]).toBe('minQty');
  });
  it('CV18: minQty = maxQty accepted (equal bounds)', () => {
    expect(validateCourse({ ...base(), minQty: 5, maxQty: 5 })).toBeNull();
  });
  it('CV19: negative daysBeforeExpire rejected', () => {
    expect(validateCourse({ ...base(), daysBeforeExpire: -1 })?.[0]).toBe('daysBeforeExpire');
  });
  it('CV20: non-boolean isDf rejected', () => {
    expect(validateCourse({ ...base(), isDf: 'yes' })?.[0]).toBe('isDf');
  });
  it('CV21: sub-item minQty > maxQty rejected', () => {
    const r = validateCourse({ ...base(), courseProducts: [{ productId: 'P1', qty: 1, minQty: 5, maxQty: 2 }] });
    expect(r?.[0]).toBe('courseProducts');
  });
  it('CV22: sub-item non-boolean isRequired rejected', () => {
    const r = validateCourse({ ...base(), courseProducts: [{ productId: 'P1', qty: 1, isRequired: 'yes' }] });
    expect(r?.[0]).toBe('courseProducts');
  });
});

describe('normalizeCourse — Phase 12.2b defaults', () => {
  it('CN3: missing/unknown courseType defaults to ระบุสินค้าและจำนวนสินค้า', () => {
    expect(normalizeCourse({ ...base() }).courseType).toBe('ระบุสินค้าและจำนวนสินค้า');
    expect(normalizeCourse({ ...base(), courseType: '' }).courseType).toBe('ระบุสินค้าและจำนวนสินค้า');
    expect(normalizeCourse({ ...base(), courseType: 'bogus' }).courseType).toBe('ระบุสินค้าและจำนวนสินค้า');
  });
  it('CN4: missing/unknown usageType defaults to ระดับคลินิก', () => {
    expect(normalizeCourse({ ...base(), usageType: '' }).usageType).toBe('ระดับคลินิก');
    expect(normalizeCourse({ ...base(), usageType: 'global' }).usageType).toBe('ระดับคลินิก');
  });
  it('CN5: isDf default to true when omitted', () => {
    const { isDf, ...rest } = base();
    expect(normalizeCourse(rest).isDf).toBe(true);
  });
  it('CN6: numeric Phase 12.2b fields coerce via numOrNull', () => {
    const n = normalizeCourse({ ...base(), deductCost: '150', mainQty: '10', qtyPerTime: '2', minQty: '1', maxQty: '5', daysBeforeExpire: '30', period: '7' });
    expect(n.deductCost).toBe(150);
    expect(n.mainQty).toBe(10);
    expect(n.qtyPerTime).toBe(2);
    expect(n.daysBeforeExpire).toBe(30);
    expect(n.period).toBe(7);
  });
  it('CN7: sub-item flag defaults (isRequired=false, isDf=true, isHidden=false)', () => {
    const n = normalizeCourse({ ...base(), courseProducts: [{ productId: 'P1', qty: 1 }] });
    expect(n.courseProducts[0].isRequired).toBe(false);
    expect(n.courseProducts[0].isDf).toBe(true);
    expect(n.courseProducts[0].isHidden).toBe(false);
  });
});

describe('course-type gate helpers (Phase 12.2b)', () => {
  it('CT1: isRealQtyCourse matches only เหมาตามจริง', () => {
    expect(isRealQtyCourse('เหมาตามจริง')).toBe(true);
    for (const t of COURSE_TYPE_OPTIONS) {
      if (t !== 'เหมาตามจริง') expect(isRealQtyCourse(t)).toBe(false);
    }
  });
  it('CT2: isBuffetCourse matches only บุฟเฟต์', () => {
    expect(isBuffetCourse('บุฟเฟต์')).toBe(true);
    for (const t of COURSE_TYPE_OPTIONS) {
      if (t !== 'บุฟเฟต์') expect(isBuffetCourse(t)).toBe(false);
    }
  });
  it('CT3: isPickAtTreatmentCourse matches only เลือกสินค้าตามจริง', () => {
    expect(isPickAtTreatmentCourse('เลือกสินค้าตามจริง')).toBe(true);
    for (const t of COURSE_TYPE_OPTIONS) {
      if (t !== 'เลือกสินค้าตามจริง') expect(isPickAtTreatmentCourse(t)).toBe(false);
    }
  });
  it('CT4: isSpecificQtyCourse matches ระบุสินค้าและจำนวนสินค้า + empty (legacy default)', () => {
    expect(isSpecificQtyCourse('ระบุสินค้าและจำนวนสินค้า')).toBe(true);
    expect(isSpecificQtyCourse('')).toBe(true);
    expect(isSpecificQtyCourse(undefined)).toBe(true);
    expect(isSpecificQtyCourse('บุฟเฟต์')).toBe(false);
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
