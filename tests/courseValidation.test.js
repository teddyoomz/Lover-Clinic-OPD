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
  it('CV13: all 4 enumerated courseType values accepted (buffet needs daysBeforeExpire per V12.2b)', () => {
    for (const t of COURSE_TYPE_OPTIONS) {
      // Phase 14.7.H follow-up E: buffet requires daysBeforeExpire > 0.
      const extra = t === 'บุฟเฟต์' ? { daysBeforeExpire: 365 } : {};
      expect(validateCourse({ ...base(), courseType: t, ...extra })).toBeNull();
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

// ─── Phase 14.7.H follow-up E (V12.2b deferred) — period + daysBeforeExpire enforcement ─
//
// Rationale: V12.2b note flagged "Buffet courses pass save with invalid period
// field". Two failure modes the old validateNonNeg let through:
//   1. Decimal day-counts (e.g. period=7.5) — semantically nonsense
//   2. Insane upper-bound (e.g. period=999999) — silently locks course for
//      ~2700 years; typo-prone field
// Plus a buffet-specific business rule: a buffet without daysBeforeExpire
// has no expiry → unlimited free use forever (financially dangerous).
//
// Test plan:
//   PD1.1-7  : pure helper output for period (empty/null/0/integer/decimal/
//              negative/string/over-bound/boundary)
//   PD2.1-7  : same for daysBeforeExpire
//   PD3.1-5  : buffet-specific — daysBeforeExpire required
//   PD4.1-5  : flow simulate — chain courseType change → period typed → save
//              validation catches each failure
//   PD5.1-3  : adversarial — Thai numerals, scientific notation, tiny floats
//   PD6.1-2  : source-grep regression guards (Rule I)

describe('PD1: validateCourse — period (day-count integer enforcement)', () => {
  it('PD1.1: empty/null period accepted (= "ไม่จำกัด" / no rate limit)', () => {
    expect(validateCourse({ ...base(), period: '' })).toBeNull();
    expect(validateCourse({ ...base(), period: null })).toBeNull();
    expect(validateCourse({ ...base(), period: undefined })).toBeNull();
  });
  it('PD1.2: zero period accepted (no minimum interval)', () => {
    expect(validateCourse({ ...base(), period: 0 })).toBeNull();
    expect(validateCourse({ ...base(), period: '0' })).toBeNull();
  });
  it('PD1.3: positive integer period accepted (1, 7, 30, 365, 3650)', () => {
    for (const v of [1, 7, 30, 365, 3650]) {
      expect(validateCourse({ ...base(), period: v }), `period=${v}`).toBeNull();
      expect(validateCourse({ ...base(), period: String(v) }), `period="${v}"`).toBeNull();
    }
  });
  it('PD1.4: negative period rejected', () => {
    expect(validateCourse({ ...base(), period: -1 })?.[0]).toBe('period');
    expect(validateCourse({ ...base(), period: -0.5 })?.[0]).toBe('period');
  });
  it('PD1.5: decimal period rejected (must be integer days)', () => {
    expect(validateCourse({ ...base(), period: 7.5 })?.[0]).toBe('period');
    expect(validateCourse({ ...base(), period: '7.5' })?.[0]).toBe('period');
    expect(validateCourse({ ...base(), period: 0.1 })?.[0]).toBe('period');
  });
  it('PD1.6: NaN / non-numeric period rejected', () => {
    expect(validateCourse({ ...base(), period: 'abc' })?.[0]).toBe('period');
    expect(validateCourse({ ...base(), period: NaN })?.[0]).toBe('period');
    expect(validateCourse({ ...base(), period: 'seven' })?.[0]).toBe('period');
  });
  it('PD1.7: over-bound period rejected (max 3650 = 10 years)', () => {
    expect(validateCourse({ ...base(), period: 3651 })?.[0]).toBe('period');
    expect(validateCourse({ ...base(), period: 999999 })?.[0]).toBe('period');
    expect(validateCourse({ ...base(), period: Number.MAX_SAFE_INTEGER })?.[0]).toBe('period');
  });
});

describe('PD2: validateCourse — daysBeforeExpire (day-count integer enforcement)', () => {
  it('PD2.1: empty/null daysBeforeExpire accepted (for non-buffet)', () => {
    expect(validateCourse({ ...base(), daysBeforeExpire: '' })).toBeNull();
    expect(validateCourse({ ...base(), daysBeforeExpire: null })).toBeNull();
  });
  it('PD2.2: zero daysBeforeExpire accepted (for non-buffet — degenerate but allowed)', () => {
    // Buffet has its own > 0 rule (PD3.x); non-buffet allows 0.
    expect(validateCourse({ ...base(), daysBeforeExpire: 0 })).toBeNull();
  });
  it('PD2.3: positive integer daysBeforeExpire accepted', () => {
    for (const v of [1, 30, 365, 730, 3650]) {
      expect(validateCourse({ ...base(), daysBeforeExpire: v }), `dbe=${v}`).toBeNull();
    }
  });
  it('PD2.4: negative daysBeforeExpire rejected (preserves CV19 behavior)', () => {
    expect(validateCourse({ ...base(), daysBeforeExpire: -1 })?.[0]).toBe('daysBeforeExpire');
  });
  it('PD2.5: decimal daysBeforeExpire rejected', () => {
    expect(validateCourse({ ...base(), daysBeforeExpire: 365.5 })?.[0]).toBe('daysBeforeExpire');
    expect(validateCourse({ ...base(), daysBeforeExpire: '7.25' })?.[0]).toBe('daysBeforeExpire');
  });
  it('PD2.6: NaN daysBeforeExpire rejected', () => {
    expect(validateCourse({ ...base(), daysBeforeExpire: 'forever' })?.[0]).toBe('daysBeforeExpire');
  });
  it('PD2.7: over-bound daysBeforeExpire rejected (max 3650)', () => {
    expect(validateCourse({ ...base(), daysBeforeExpire: 3651 })?.[0]).toBe('daysBeforeExpire');
    expect(validateCourse({ ...base(), daysBeforeExpire: 100000 })?.[0]).toBe('daysBeforeExpire');
  });
});

describe('PD3: buffet-specific — daysBeforeExpire required (V12.2b business rule)', () => {
  const buffet = (extra = {}) => ({ ...base(), courseType: 'บุฟเฟต์', ...extra });

  it('PD3.1: buffet without daysBeforeExpire rejected', () => {
    expect(validateCourse(buffet())?.[0]).toBe('daysBeforeExpire');
    expect(validateCourse(buffet({ daysBeforeExpire: '' }))?.[0]).toBe('daysBeforeExpire');
    expect(validateCourse(buffet({ daysBeforeExpire: null }))?.[0]).toBe('daysBeforeExpire');
  });
  it('PD3.2: buffet with daysBeforeExpire = 0 rejected (must be > 0)', () => {
    expect(validateCourse(buffet({ daysBeforeExpire: 0 }))?.[0]).toBe('daysBeforeExpire');
    expect(validateCourse(buffet({ daysBeforeExpire: '0' }))?.[0]).toBe('daysBeforeExpire');
  });
  it('PD3.3: buffet with daysBeforeExpire > 0 accepted', () => {
    expect(validateCourse(buffet({ daysBeforeExpire: 1 }))).toBeNull();
    expect(validateCourse(buffet({ daysBeforeExpire: 365 }))).toBeNull();
    expect(validateCourse(buffet({ daysBeforeExpire: 3650 }))).toBeNull();
  });
  it('PD3.4: non-buffet with empty daysBeforeExpire still accepted (rule is buffet-only)', () => {
    for (const t of COURSE_TYPE_OPTIONS) {
      if (t === 'บุฟเฟต์') continue;
      expect(validateCourse({ ...base(), courseType: t, daysBeforeExpire: '' }), `type=${t}`).toBeNull();
    }
  });
  it('PD3.5: buffet-rule error message hints at the cause', () => {
    const err = validateCourse(buffet());
    expect(err?.[1]).toMatch(/บุฟเฟต์.*ระยะเวลา/);
  });
});

describe('PD4: flow simulate — courseType switch + period typed + save chain', () => {
  // Mirrors what CourseFormModal does: user types into period field, then
  // clicks save which calls validateCourse(form) before saveCourse(id, form).
  // Pure simulate — no React mount needed.
  function simulateSave(form) {
    const fail = validateCourse(form);
    if (fail) return { ok: false, errorField: fail[0], errorMsg: fail[1] };
    return { ok: true };
  }

  it('PD4.1: user picks buffet, leaves daysBeforeExpire empty, types period=7 → save fails on daysBeforeExpire (NOT period)', () => {
    const form = { ...base(), courseType: 'บุฟเฟต์', period: 7 };
    const r = simulateSave(form);
    expect(r.ok).toBe(false);
    expect(r.errorField).toBe('daysBeforeExpire'); // buffet rule fires first
  });

  it('PD4.2: user picks buffet, fills daysBeforeExpire=365, types period=7 → save ok', () => {
    const r = simulateSave({ ...base(), courseType: 'บุฟเฟต์', daysBeforeExpire: 365, period: 7 });
    expect(r.ok).toBe(true);
  });

  it('PD4.3: user picks buffet, fills daysBeforeExpire=365, types period=7.5 → save fails on period (decimal)', () => {
    const r = simulateSave({ ...base(), courseType: 'บุฟเฟต์', daysBeforeExpire: 365, period: 7.5 });
    expect(r.ok).toBe(false);
    expect(r.errorField).toBe('period');
    expect(r.errorMsg).toMatch(/จำนวนเต็ม/);
  });

  it('PD4.4: user types period=99999 → save fails on period (over-bound)', () => {
    const r = simulateSave({ ...base(), period: 99999 });
    expect(r.ok).toBe(false);
    expect(r.errorField).toBe('period');
    expect(r.errorMsg).toMatch(/3650/);
  });

  it('PD4.5: user picks specific-qty (default), leaves period empty, leaves daysBeforeExpire empty → save ok (legacy behavior preserved)', () => {
    const r = simulateSave({ ...base() }); // base() defaults to specific-qty
    expect(r.ok).toBe(true);
  });

  it('PD4.6: lifecycle — buffet save → load → re-save (no field changes) still passes', () => {
    const initial = { ...base(), courseType: 'บุฟเฟต์', daysBeforeExpire: 365, period: 7 };
    expect(simulateSave(initial).ok).toBe(true);
    // Simulate save → re-load → re-save (idempotent)
    expect(simulateSave({ ...initial })).toEqual({ ok: true });
  });

  it('PD4.7: switching from buffet to non-buffet with daysBeforeExpire=0 still passes (non-buffet allows 0)', () => {
    const before = { ...base(), courseType: 'บุฟเฟต์', daysBeforeExpire: 365 };
    expect(simulateSave(before).ok).toBe(true);
    const after = { ...before, courseType: 'ระบุสินค้าและจำนวนสินค้า', daysBeforeExpire: 0 };
    expect(simulateSave(after).ok).toBe(true);
  });
});

describe('PD5: adversarial inputs (defensive) ', () => {
  it('PD5.1: scientific notation period (Number-coerce produces large value) rejected when over-bound', () => {
    // '1e5' parses to 100000 — over 3650
    expect(validateCourse({ ...base(), period: '1e5' })?.[0]).toBe('period');
  });
  it('PD5.2: scientific notation that lands in valid range accepted', () => {
    // '3e2' = 300, integer, in range
    expect(validateCourse({ ...base(), period: '3e2' })).toBeNull();
  });
  it('PD5.3: tiny float (very close to integer but not integer) rejected', () => {
    expect(validateCourse({ ...base(), period: 7.0000001 })?.[0]).toBe('period');
  });
  it('PD5.4: negative zero accepted (Number(-0) === 0, integer, non-neg)', () => {
    // -0 is mathematically 0; not a bug to accept.
    expect(validateCourse({ ...base(), period: -0 })).toBeNull();
  });
  it('PD5.5: Infinity rejected (not finite)', () => {
    expect(validateCourse({ ...base(), period: Infinity })?.[0]).toBe('period');
    expect(validateCourse({ ...base(), period: -Infinity })?.[0]).toBe('period');
  });
  it('PD5.6: whitespace-only string treated as empty (Number(" ") === 0 — accepted as 0)', () => {
    // Note: " " coerces to 0 via Number(), which is valid (no rate limit).
    // This is acceptable — UI "" and "  " behave the same.
    expect(validateCourse({ ...base(), period: ' ' })).toBeNull();
  });
});

describe('PD6: source-grep regression guards (Rule I)', () => {
  // Prevents future refactor from re-loosening the validator. Stable
  // patterns locked into the source.
  it('PD6.1: validateDayInteger helper exists in courseValidation.js', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/lib/courseValidation.js'), 'utf8');
    expect(src).toMatch(/function validateDayInteger\(/);
    expect(src).toMatch(/Number\.isInteger\(n\)/);
    expect(src).toMatch(/n > 3650/);
  });
  it('PD6.2: validateCourse uses validateDayInteger for both period AND daysBeforeExpire', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/lib/courseValidation.js'), 'utf8');
    expect(src).toMatch(/validateDayInteger\(form\.period/);
    expect(src).toMatch(/validateDayInteger\(form\.daysBeforeExpire/);
  });
  it('PD6.3: buffet daysBeforeExpire rule uses isBuffetCourse + > 0 check', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/lib/courseValidation.js'), 'utf8');
    expect(src).toMatch(/isBuffetCourse\(form\.courseType\)/);
    expect(src).toMatch(/บุฟเฟต์ต้องระบุระยะเวลาใช้งาน/);
  });
  it('PD6.4: anti-regression — old loose validateNonNeg(form.period|daysBeforeExpire) lines removed', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/lib/courseValidation.js'), 'utf8');
    // The old chain had `validateNonNeg(form.period, ...)` and `validateNonNeg(form.daysBeforeExpire, ...)`.
    // Now those checks live in validateDayInteger. Loose checks must NOT come back.
    expect(src).not.toMatch(/validateNonNeg\(form\.period,/);
    expect(src).not.toMatch(/validateNonNeg\(form\.daysBeforeExpire,/);
  });
});
