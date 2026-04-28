// ─── BCC — buildCustomerCourseGroups (2026-04-28) ──────────────────────────
//
// Group flat customerCourses entries by purchase event so the
// "ข้อมูลการใช้คอร์ส" panel renders ONE header + N nested products
// (instead of repeating the header per product).
//
// User report (verbatim):
//   "อะไรที่มาจากคอร์สเดียวกัน โปรโมชั่นเดียวกัน จัดให้อยู่ใน Group ย่อย
//   เดียวกัน ให้ดูง่าย ไม่รกแบบนี้"
//
// User-confirmed grouping key (Plan mode AskUserQuestion 2026-04-28):
//   same courseName + different linkedSaleId = SEPARATE groups
//   (preserves "bought twice = 2 groups" semantic).
//
// File location: top-level `tests/` (not `tests/extended/`) because
// vitest 4 CLI dropped the --include flag, breaking npm run test:extended.
// Co-located with default suite so `npm test` exercises BCC every run.

import { describe, it, expect } from 'vitest';
import { buildCustomerCourseGroups } from '../src/lib/treatmentBuyHelpers.js';

describe('buildCustomerCourseGroups', () => {
  it('BCC.1 empty/null/non-array input → []', () => {
    expect(buildCustomerCourseGroups()).toEqual([]);
    expect(buildCustomerCourseGroups(null)).toEqual([]);
    expect(buildCustomerCourseGroups(undefined)).toEqual([]);
    expect(buildCustomerCourseGroups('str')).toEqual([]);
    expect(buildCustomerCourseGroups([])).toEqual([]);
  });

  it('BCC.2 4 entries same courseName + linkedSaleId → 1 group with 4 products', () => {
    const entries = ['Fluimucil', 'Collagen', 'Tranaxamic', 'NSS'].map((n, i) => ({
      courseId: `be-course-${i}`,
      courseName: '[IV Drip] Aura bright x 2',
      linkedSaleId: 'INV-100',
      linkedTreatmentId: null,
      products: [{ rowId: `be-row-${i}`, name: n, remaining: '1', total: '1', unit: 'amp.' }],
    }));
    const groups = buildCustomerCourseGroups(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].courseName).toBe('[IV Drip] Aura bright x 2');
    expect(groups[0].linkedSaleId).toBe('INV-100');
    expect(groups[0].products).toHaveLength(4);
    expect(groups[0].products.map(p => p.name)).toEqual(['Fluimucil', 'Collagen', 'Tranaxamic', 'NSS']);
  });

  it('BCC.3 same courseName, different linkedSaleId → 2 groups', () => {
    const entries = [
      { courseId: 'c1', courseName: 'Botox', linkedSaleId: 'INV-1', products: [{ rowId: 'r1', name: 'A' }] },
      { courseId: 'c2', courseName: 'Botox', linkedSaleId: 'INV-1', products: [{ rowId: 'r2', name: 'B' }] },
      { courseId: 'c3', courseName: 'Botox', linkedSaleId: 'INV-2', products: [{ rowId: 'r3', name: 'A' }] },
    ];
    const groups = buildCustomerCourseGroups(entries);
    expect(groups).toHaveLength(2);
    expect(groups[0].linkedSaleId).toBe('INV-1');
    expect(groups[0].products).toHaveLength(2);
    expect(groups[1].linkedSaleId).toBe('INV-2');
    expect(groups[1].products).toHaveLength(1);
  });

  it('BCC.4 same courseName, one with linkedSaleId, one without → 2 groups (null is distinct)', () => {
    const entries = [
      { courseId: 'c1', courseName: 'Filler', linkedSaleId: 'INV-1', products: [{ rowId: 'r1', name: 'A' }] },
      { courseId: 'c2', courseName: 'Filler', linkedSaleId: null, products: [{ rowId: 'r2', name: 'A' }] },
    ];
    const groups = buildCustomerCourseGroups(entries);
    expect(groups).toHaveLength(2);
  });

  it('BCC.5 filters out promotionId-linked entries (handled by buildCustomerPromotionGroups)', () => {
    const entries = [
      { courseId: 'c1', courseName: 'Botox', linkedSaleId: 'INV-1', products: [{ rowId: 'r1', name: 'A' }] },
      { courseId: 'c2', courseName: 'PromoCourse', promotionId: 'PROMO-1', products: [{ rowId: 'r2', name: 'B' }] },
    ];
    const groups = buildCustomerCourseGroups(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].courseName).toBe('Botox');
  });

  it('BCC.6 preserves order: group-first-seen + product-first-seen within group', () => {
    const entries = [
      { courseId: 'c1', courseName: 'B', linkedSaleId: 'INV-1', products: [{ rowId: 'r1', name: 'B-1' }] },
      { courseId: 'c2', courseName: 'A', linkedSaleId: 'INV-1', products: [{ rowId: 'r2', name: 'A-1' }] },
      { courseId: 'c3', courseName: 'B', linkedSaleId: 'INV-1', products: [{ rowId: 'r3', name: 'B-2' }] },
    ];
    const groups = buildCustomerCourseGroups(entries);
    expect(groups.map(g => g.courseName)).toEqual(['B', 'A']); // B first because seen first
    expect(groups[0].products.map(p => p.name)).toEqual(['B-1', 'B-2']);
  });

  it('BCC.7 pick-at-treatment placeholder is its own group with availableProducts intact', () => {
    const entries = [
      {
        courseId: 'pick-1', courseName: 'Pick course',
        isPickAtTreatment: true, needsPickSelection: true,
        availableProducts: [{ productId: 'P-A', name: 'Option A', qty: 1, unit: 'ครั้ง' }],
        products: [],
      },
    ];
    const groups = buildCustomerCourseGroups(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].isPickAtTreatment).toBe(true);
    expect(groups[0].needsPickSelection).toBe(true);
    expect(groups[0].availableProducts).toHaveLength(1);
    expect(groups[0].products).toEqual([]);
  });

  it('BCC.8 buffet entries propagate isBuffet to group level + group correctly', () => {
    const entries = [
      {
        courseId: 'be-0', courseName: 'Buffet IV', linkedSaleId: 'INV-1',
        courseType: 'บุฟเฟต์', isBuffet: true,
        products: [{ rowId: 'r1', name: 'A', isBuffet: true }],
      },
      {
        courseId: 'be-1', courseName: 'Buffet IV', linkedSaleId: 'INV-1',
        courseType: 'บุฟเฟต์', isBuffet: true,
        products: [{ rowId: 'r2', name: 'B', isBuffet: true }],
      },
    ];
    const groups = buildCustomerCourseGroups(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].isBuffet).toBe(true);
    expect(groups[0].courseType).toBe('บุฟเฟต์');
    expect(groups[0].products).toHaveLength(2);
  });

  it('BCC.9 parentName disambiguator — same courseName under different parents = 2 groups', () => {
    const entries = [
      { courseId: 'c1', courseName: 'Filler', linkedSaleId: 'INV-1', parentName: 'BIG SET A', products: [{ rowId: 'r1', name: 'A' }] },
      { courseId: 'c2', courseName: 'Filler', linkedSaleId: 'INV-1', parentName: 'BIG SET B', products: [{ rowId: 'r2', name: 'A' }] },
    ];
    const groups = buildCustomerCourseGroups(entries);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.parentName).sort()).toEqual(['BIG SET A', 'BIG SET B']);
  });

  it('BCC.10 legacy fallback — entries with all-null grouping fields use courseId so they stay separate', () => {
    const entries = [
      { courseId: 'legacy-1', courseName: '', linkedSaleId: null, linkedTreatmentId: null, products: [{ rowId: 'r1', name: 'A' }] },
      { courseId: 'legacy-2', courseName: '', linkedSaleId: null, linkedTreatmentId: null, products: [{ rowId: 'r2', name: 'B' }] },
    ];
    const groups = buildCustomerCourseGroups(entries);
    expect(groups).toHaveLength(2); // NOT collapsed despite all empty keys
  });

  it('BCC.11 products[] flattening preserves rowId / fillLater / isBuffet / skipStockDeduction (V14 — no undefined leaves)', () => {
    const entries = [
      {
        courseId: 'be-0', courseName: 'X', linkedSaleId: 'INV-1',
        products: [{
          rowId: 'r-1', name: 'A', remaining: '1', total: '1', unit: 'amp.',
          fillLater: false, isBuffet: false, skipStockDeduction: true,
        }],
      },
    ];
    const groups = buildCustomerCourseGroups(entries);
    expect(groups[0].products[0]).toMatchObject({
      rowId: 'r-1', name: 'A', fillLater: false, isBuffet: false, skipStockDeduction: true,
    });
  });

  it('BCC.12 idempotent — running twice = same shape', () => {
    const entries = [
      { courseId: 'c1', courseName: 'A', linkedSaleId: 'INV-1', products: [{ rowId: 'r1', name: 'P1' }] },
      { courseId: 'c2', courseName: 'A', linkedSaleId: 'INV-1', products: [{ rowId: 'r2', name: 'P2' }] },
    ];
    const once = buildCustomerCourseGroups(entries);
    // Re-flatten back into fake entries shape and re-run — output products list should be identical
    const fakeEntries = once.flatMap(g => g.products.map(p => ({
      courseId: g.groupId,
      courseName: g.courseName,
      linkedSaleId: g.linkedSaleId,
      linkedTreatmentId: g.linkedTreatmentId,
      parentName: g.parentName,
      products: [p],
    })));
    const twice = buildCustomerCourseGroups(fakeEntries);
    expect(twice).toHaveLength(1);
    expect(twice[0].products).toHaveLength(2);
    expect(twice[0].products.map(p => p.name)).toEqual(['P1', 'P2']);
  });
});
