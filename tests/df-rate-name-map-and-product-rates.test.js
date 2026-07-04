// ─── DF rate name-map canonical fix + product rates (AV200, 2026-07-04) ────
// Bug: TFP's inline masterCourseIdByName read `mc.name` but ALL 405 prod
// be_courses docs are canonical (`courseName` only) → empty map → every
// DfEntryModal row resolved null → "0 บาท / (ไม่มีอัตราในกลุ่มนี้)" while the
// entered rates existed (group แพทย์ 120 + ผู้ช่วยแพทย์ 68 rates on prod).
// V49-class canonical-shape multi-reader-sweep missed site.
// Plus Q1=A: DF group rates for products/procedures (kind: 'product').
// Spec: docs/superpowers/specs/2026-07-04-df-product-rates-and-course-rate-fix-design.html

import { describe, it, expect } from 'vitest';
import { buildMasterIdByName, buildDefaultRows } from '../src/lib/dfEntryValidation.js';
import { getRateForStaffCourse, normalizeDfGroup, validateDfGroupStrict } from '../src/lib/dfGroupValidation.js';

// CANONICAL fixtures — deliberately NO `name` field, locking the bug shape
// (prod reality per scripts/diag-df-rate-mismatch.mjs: 405/405 courseName-only).
const CANON_COURSES = [
  { id: 'COURSES_1778150447655_AE530C40', courseId: 'COURSES_1778150447655_AE530C40', courseName: 'Shock Wave 6 ครั้ง + ติดตามอาการกับแพทย์ 1 ครั้ง', salePrice: 8900 },
  { id: 'COURSE-mq6f4n4q-b68eee4a46055b85', courseId: 'COURSE-mq6f4n4q-b68eee4a46055b85', courseName: 'Shock wave 1 ครั้ง', salePrice: 1890 },
];
const CANON_PRODUCTS = [
  { id: 'PRODUCTS_1778150429849_3D0F5DAE', productId: 'PRODUCTS_1778150429849_3D0F5DAE', productName: 'Shock wave' },
];

describe('A. buildMasterIdByName — canonical-first (บั๊ค 0 บาท 2026-07-04)', () => {
  it('A1: canonical courseName-only docs → map resolves (บั๊คเดิม: map ว่าง)', () => {
    const m = buildMasterIdByName(CANON_COURSES, ['courseName', 'name'], ['id', 'courseId']);
    expect(m.get('Shock Wave 6 ครั้ง + ติดตามอาการกับแพทย์ 1 ครั้ง')).toBe('COURSES_1778150447655_AE530C40');
    expect(m.size).toBe(2);
  });

  it('A2: legacy name-only docs ยัง resolve ได้ (fallback)', () => {
    const m = buildMasterIdByName([{ id: '56451', name: 'Shock Wave 6' }], ['courseName', 'name'], ['id', 'courseId']);
    expect(m.get('Shock Wave 6')).toBe('56451');
  });

  it('A3: ชื่อซ้ำ → first-hit wins (พฤติกรรมเดิมของ inline map)', () => {
    const m = buildMasterIdByName([
      { id: 'X1', courseName: 'ซ้ำ' }, { id: 'X2', courseName: 'ซ้ำ' },
    ], ['courseName', 'name'], ['id', 'courseId']);
    expect(m.get('ซ้ำ')).toBe('X1');
  });

  it('A4: adversarial — null/empty/whitespace/no-id ไม่ crash', () => {
    const m = buildMasterIdByName(
      [null, {}, { courseName: '   ' }, { courseName: 'มี id ว่าง' }, 'string-junk', 42],
      ['courseName', 'name'], ['id', 'courseId']
    );
    expect(m.get('มี id ว่าง')).toBe('');
    expect(m.size).toBe(1);
  });

  it('A5: products — productName-first', () => {
    const m = buildMasterIdByName(CANON_PRODUCTS, ['productName', 'name'], ['id', 'productId']);
    expect(m.get('Shock wave')).toBe('PRODUCTS_1778150429849_3D0F5DAE');
  });

  it('A6: non-array → empty map', () => {
    expect(buildMasterIdByName(null, ['courseName'], ['id']).size).toBe(0);
    expect(buildMasterIdByName(undefined, ['courseName'], ['id']).size).toBe(0);
    expect(buildMasterIdByName({}, ['courseName'], ['id']).size).toBe(0);
  });

  it('A7: name โดน trim ก่อนใช้เป็น key (mirror inline map เดิม)', () => {
    const m = buildMasterIdByName([{ id: 'T1', courseName: '  เว้นวรรค  ' }], ['courseName', 'name'], ['id', 'courseId']);
    expect(m.get('เว้นวรรค')).toBe('T1');
  });
});
