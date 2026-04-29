// tests/phase16.7-quinquies-ter-audit-product.test.js — Phase 16.7-quinquies-ter (2026-04-29)
//
// buildChangeAuditEntry now accepts + emits productName/productQty/productUnit
// for kind='use' audits so ประวัติการใช้คอร์ส tab can show the actual product
// consumed within the wrapper course (e.g. Allergan 100 U -75 U inside
// "เทส IV แก้แฮงค์2"). User directive: "หาบั๊คแล้วแก้ให้แสดงทุกการใช้คอร์ส
// ตัดคอร์ส จริงๆ".

import { describe, it, expect } from 'vitest';
import { buildChangeAuditEntry, inferCourseType } from '../src/lib/courseExchange.js';

describe('AP.A — buildChangeAuditEntry shape with new product fields', () => {
  it('AP.A.1 — emit doc with productName/productQty/productUnit (use)', () => {
    const audit = buildChangeAuditEntry({
      customerId: 'CUST-1',
      kind: 'use',
      fromCourse: { courseId: 'C1', name: 'เทส IV แก้แฮงค์2', value: '200000.00 บาท', status: 'กำลังใช้งาน' },
      qtyDelta: -1, qtyBefore: '1 / 1 U', qtyAfter: '0 / 1 U',
      linkedTreatmentId: 'BT-1',
      productName: 'Allergan 100 U',
      productQty: 75,
      productUnit: 'U',
    });
    expect(audit.productName).toBe('Allergan 100 U');
    expect(audit.productQty).toBe(75);
    expect(audit.productUnit).toBe('U');
  });

  it('AP.A.2 — coerce numeric productQty (string input)', () => {
    const audit = buildChangeAuditEntry({
      customerId: 'CUST-1', kind: 'use',
      fromCourse: { name: 'A' },
      productName: 'Med X',
      productQty: '50',
      productUnit: 'mg',
    });
    expect(audit.productQty).toBe(50);
  });

  it('AP.A.3 — V14 lock: undefined productName → "" not undefined', () => {
    const audit = buildChangeAuditEntry({
      customerId: 'CUST-1', kind: 'use',
      fromCourse: { name: 'A' },
    });
    expect(audit.productName).toBe('');
    expect(audit.productQty).toBe(0);
    expect(audit.productUnit).toBe('');
    // No `: undefined` leaves
    const json = JSON.stringify(audit);
    expect(json).not.toMatch(/:\s*undefined/);
  });

  it('AP.A.4 — non-use audits also accept the fields harmlessly', () => {
    const audit = buildChangeAuditEntry({
      customerId: 'CUST-1', kind: 'cancel',
      fromCourse: { name: 'A' },
      reason: 'test',
    });
    expect(audit.productName).toBe('');
    expect(audit.productQty).toBe(0);
    expect(audit.productUnit).toBe('');
  });
});

describe('AP.B — source-grep regression guards', () => {
  it('AP.B.1 — buildChangeAuditEntry signature includes productName param', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/courseExchange.js', 'utf-8');
    expect(src).toMatch(/buildChangeAuditEntry\(\{[^}]*productName/);
  });

  it('AP.B.2 — buildChangeAuditEntry returned object includes 3 product fields', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/courseExchange.js', 'utf-8');
    expect(src).toMatch(/productName:\s*String\(productName/);
    expect(src).toMatch(/productQty:\s*typeof productQty/);
    expect(src).toMatch(/productUnit:\s*String\(productUnit/);
  });

  it('AP.B.3 — deductCourseItems passes productName to buildChangeAuditEntry', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/backendClient.js', 'utf-8');
    // Locate the deductCourseItems audit emit block + verify productName is passed.
    // Slice generously: function is ~200 lines; use 12000 chars to comfortably
    // cover the audit emit at the end.
    const idx = src.indexOf('export async function deductCourseItems');
    const slice = src.slice(idx, idx + 12000);
    expect(slice).toMatch(/productByIndex/);
    expect(slice).toMatch(/productName: productInfo\.productName/);
    expect(slice).toMatch(/productQty: productInfo\.productQty/);
    expect(slice).toMatch(/productUnit: productInfo\.productUnit/);
  });

  it('AP.B.4 — CourseHistoryTab renders product line for kind="use"', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/backend/CourseHistoryTab.jsx', 'utf-8');
    expect(src).toMatch(/showProductLine/);
    expect(src).toMatch(/entry\.productName/);
    expect(src).toMatch(/entry\.productQty/);
  });

  it('AP.B.6 — CourseHistoryTab suppresses qty line when product line shown', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/backend/CourseHistoryTab.jsx', 'utf-8');
    expect(src).toMatch(/showQtyLine\s*=\s*\(qtyBefore[^)]*\)\s*&&\s*!showProductLine/);
  });

  it('AP.B.7 — buildChangeAuditEntry persists fromCourse.courseType via inferCourseType', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/courseExchange.js', 'utf-8');
    expect(src).toMatch(/courseType:\s*inferCourseType\(fromCourse\)/);
  });

  it('AP.B.8 — deductCourseItems emits audit for buffet (qty unchanged but attributed deduction)', async () => {
    // Buffet courses keep qty static (consumeRealQty skips them), so the
    // audit gate must include "OR a deduction was attributed" to avoid
    // silently dropping buffet usage from the audit log.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/backendClient.js', 'utf-8');
    expect(src).toMatch(/hadAttributedDeduction\s*=\s*productByIndex\.has\(i\)/);
    expect(src).toMatch(/!qtyChanged\s*&&\s*!hadAttributedDeduction/);
  });

  it('AP.B.9 — CourseHistoryTab renders courseType badge', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/backend/CourseHistoryTab.jsx', 'utf-8');
    expect(src).toMatch(/COURSE_TYPE_META/);
    expect(src).toMatch(/courseTypeMeta/);
    expect(src).toMatch(/'เหมาตามจริง':/);
    expect(src).toMatch(/'บุฟเฟต์':/);
  });
});

describe('AP.C — inferCourseType helper', () => {
  it('AP.C.1 — explicit courseType field wins', () => {
    expect(inferCourseType({ courseType: 'เหมาตามจริง', qty: '1 / 1 U' })).toBe('เหมาตามจริง');
    expect(inferCourseType({ courseType: 'บุฟเฟต์', qty: '10 / 10 ครั้ง' })).toBe('บุฟเฟต์');
  });
  it('AP.C.2 — qty="เหมาตามจริง" string (no field) → "เหมาตามจริง"', () => {
    expect(inferCourseType({ qty: 'เหมาตามจริง' })).toBe('เหมาตามจริง');
  });
  it('AP.C.3 — qty="บุฟเฟต์" string → "บุฟเฟต์"', () => {
    expect(inferCourseType({ qty: 'บุฟเฟต์' })).toBe('บุฟเฟต์');
  });
  it('AP.C.4 — isRealQty flag → "เหมาตามจริง"', () => {
    expect(inferCourseType({ isRealQty: true })).toBe('เหมาตามจริง');
  });
  it('AP.C.5 — isBuffet flag → "บุฟเฟต์"', () => {
    expect(inferCourseType({ isBuffet: true })).toBe('บุฟเฟต์');
  });
  it('AP.C.6 — isPickAtTreatment → "pick-at-treatment"', () => {
    expect(inferCourseType({ isPickAtTreatment: true })).toBe('pick-at-treatment');
  });
  it('AP.C.7 — standard course → "" (no badge)', () => {
    expect(inferCourseType({ qty: '5 / 10 ครั้ง' })).toBe('');
  });
  it('AP.C.8 — null/undefined/non-object → ""', () => {
    expect(inferCourseType(null)).toBe('');
    expect(inferCourseType(undefined)).toBe('');
    expect(inferCourseType('string')).toBe('');
  });

  it('AP.C.9 — buildChangeAuditEntry uses inferCourseType for fromCourse.courseType', () => {
    // Pass a course with NO courseType field, qty="เหมาตามจริง"; audit should
    // record courseType='เหมาตามจริง' via inferCourseType.
    const audit = buildChangeAuditEntry({
      customerId: 'CUST-1',
      kind: 'use',
      fromCourse: { name: 'Allergan เหมาทั่วหน้า', qty: 'เหมาตามจริง' },
    });
    expect(audit.fromCourse.courseType).toBe('เหมาตามจริง');
  });

  it('AP.B.5 — Phase 16.7-quinquies-ter marker present in courseExchange', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/courseExchange.js', 'utf-8');
    expect(src).toMatch(/Phase 16\.7-quinquies-ter/);
  });
});
