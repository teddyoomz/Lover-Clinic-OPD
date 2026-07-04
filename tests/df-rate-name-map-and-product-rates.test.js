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

// Pure mirror of treatmentCoursesForDf Source 2 cid resolution
// (TreatmentFormPage.jsx — chain: course map → product map → pseudo-name).
// Locked against the real implementation by source-grep group D.
function simulateSource2Cid(name, courseMap, productMap) {
  return courseMap.get(name) || productMap.get(name) || name;
}

describe('B. Source 2 chain — course → product → pseudo-name (Rule I mirror)', () => {
  const courseMap = buildMasterIdByName(CANON_COURSES, ['courseName', 'name'], ['id', 'courseId']);
  const productMap = buildMasterIdByName(CANON_PRODUCTS, ['productName', 'name'], ['id', 'productId']);
  // Real prod group shape (DFG-0526-b1399741 "ผู้ช่วยแพทย์") + the NEW product rate row.
  const GROUP = normalizeDfGroup({
    id: 'DFG-0526-b1399741', name: 'ผู้ช่วยแพทย์', status: 'active',
    rates: [
      { courseId: 'COURSES_1778150447655_AE530C40', courseName: 'Shock Wave 6 ครั้ง + ติดตามอาการกับแพทย์ 1 ครั้ง', value: 10, type: 'baht' },
      { courseId: 'PRODUCTS_1778150429849_3D0F5DAE', courseName: 'Shock wave', value: 300, type: 'baht', kind: 'product' },
    ],
  });

  it('B1: REPRO บั๊คผู้ใช้ (screenshot 2026-07-04) — แถวคอร์ส resolve เป็น 10 บาท จากกลุ่ม', () => {
    const cid = simulateSource2Cid('Shock Wave 6 ครั้ง + ติดตามอาการกับแพทย์ 1 ครั้ง', courseMap, productMap);
    expect(cid).toBe('COURSES_1778150447655_AE530C40');
    const rows = buildDefaultRows(
      [{ courseId: cid, courseName: 'Shock Wave 6 ครั้ง ...' }],
      'staff-yayee', 'DFG-0526-b1399741', [GROUP], [], getRateForStaffCourse
    );
    expect(rows[0]).toMatchObject({ value: 10, type: 'baht', enabled: true, source: 'group' });
  });

  it('B2: แถวสินค้า Shock wave เฉยๆ resolve เป็น 300 บาท (kind: product)', () => {
    const cid = simulateSource2Cid('Shock wave', courseMap, productMap);
    expect(cid).toBe('PRODUCTS_1778150429849_3D0F5DAE');
    const rows = buildDefaultRows(
      [{ courseId: cid, courseName: 'Shock wave' }],
      'staff-yayee', 'DFG-0526-b1399741', [GROUP], [], getRateForStaffCourse
    );
    expect(rows[0]).toMatchObject({ value: 300, enabled: true, source: 'group' });
  });

  it('B3: ชื่อที่เป็นทั้งคอร์สและสินค้า → course-first (คงพฤติกรรม Phase 14.4)', () => {
    const cm = buildMasterIdByName([{ id: 'C-BOTH', courseName: 'ชนกัน' }], ['courseName', 'name'], ['id', 'courseId']);
    const pm = buildMasterIdByName([{ id: 'P-BOTH', productName: 'ชนกัน' }], ['productName', 'name'], ['id', 'productId']);
    expect(simulateSource2Cid('ชนกัน', cm, pm)).toBe('C-BOTH');
  });

  it('B4: ไม่ match อะไรเลย → pseudo-name (แถวยังโผล่ กรอกมือได้ + ไม่มีอัตรา)', () => {
    const cid = simulateSource2Cid('หัตถการลอย', courseMap, productMap);
    expect(cid).toBe('หัตถการลอย');
    const rows = buildDefaultRows(
      [{ courseId: cid, courseName: 'หัตถการลอย' }],
      'staff-yayee', 'DFG-0526-b1399741', [GROUP], [], getRateForStaffCourse
    );
    expect(rows[0]).toMatchObject({ value: 0, enabled: false, source: null });
  });

  it('B5: PRE-FIX repro — map ที่อ่าน name (legacy) กับ docs canonical → 0 บาท (บั๊คเดิม)', () => {
    const brokenMap = buildMasterIdByName(CANON_COURSES, ['name'], ['id']); // จำลองโค้ดก่อนแก้
    expect(brokenMap.size).toBe(0);
    const cid = simulateSource2Cid('Shock Wave 6 ครั้ง + ติดตามอาการกับแพทย์ 1 ครั้ง', brokenMap, new Map());
    const rows = buildDefaultRows(
      [{ courseId: cid, courseName: 'x' }],
      'staff-yayee', 'DFG-0526-b1399741', [GROUP], [], getRateForStaffCourse
    );
    expect(rows[0].value).toBe(0); // สิ่งที่ผู้ใช้เห็นก่อนแก้
  });

  it('B6: staff override ยังชนะ group (resolver contract ไม่เปลี่ยน)', () => {
    const staffRates = [{ staffId: 'staff-yayee', rates: [{ courseId: 'PRODUCTS_1778150429849_3D0F5DAE', value: 500, type: 'baht' }] }];
    const rows = buildDefaultRows(
      [{ courseId: 'PRODUCTS_1778150429849_3D0F5DAE', courseName: 'Shock wave' }],
      'staff-yayee', 'DFG-0526-b1399741', [GROUP], staffRates, getRateForStaffCourse
    );
    expect(rows[0]).toMatchObject({ value: 500, source: 'staff' });
  });
});

describe('C. normalizeDfGroup — kind preservation (V14 undefined-free)', () => {
  it('C1: kind product รอด normalize (จำเป็นสำหรับ UI แยก section)', () => {
    const out = normalizeDfGroup({ name: 'g', rates: [{ courseId: 'P1', courseName: 'Shock wave', value: 300, type: 'baht', kind: 'product' }] });
    expect(out.rates[0].kind).toBe('product');
  });

  it('C2: แถวคอร์ส (ไม่มี kind) → ไม่มี field kind เลย (ห้าม undefined — V14)', () => {
    const out = normalizeDfGroup({ name: 'g', rates: [{ courseId: 'C1', courseName: 'คอร์ส', value: 10, type: 'baht' }] });
    expect('kind' in out.rates[0]).toBe(false);
    expect(Object.values(out.rates[0]).some((v) => v === undefined)).toBe(false);
  });

  it('C3: kind แปลกปลอม → drop (treat as course)', () => {
    const out = normalizeDfGroup({ name: 'g', rates: [{ courseId: 'C1', value: 10, type: 'baht', kind: 'weird' }] });
    expect('kind' in out.rates[0]).toBe(false);
  });

  it('C4: validator เดิมผ่านกับแถว product (DFG-3..5 ไม่แตะ kind)', () => {
    const fail = validateDfGroupStrict(normalizeDfGroup({ name: 'g', rates: [{ courseId: 'P1', courseName: 'Shock wave', value: 300, type: 'baht', kind: 'product' }] }));
    expect(fail).toBeNull();
  });

  it('C5: percent product rate เกิน 100 ยังโดน validator บล็อค (DFG-5 คุมทุก kind)', () => {
    const fail = validateDfGroupStrict(normalizeDfGroup({ name: 'g', rates: [{ courseId: 'P1', value: 150, type: 'percent', kind: 'product' }] }));
    expect(fail).not.toBeNull();
    expect(fail[0]).toBe('rates');
  });
});
