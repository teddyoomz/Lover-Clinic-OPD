// ─── treatmentBuyHelpers pure helpers — Phase 12.2b + earlier ─────────────
// Covers mapPromotionProductsToConsumables, filterOutConsumablesForPromotion,
// flattenPromotionsForStockDeduction, and the Phase 12.2b Step 6
// buildCustomerPromotionGroups add-on propagation.

import { describe, it, expect } from 'vitest';
import {
  mapPromotionProductsToConsumables,
  filterOutConsumablesForPromotion,
  flattenPromotionsForStockDeduction,
  buildCustomerPromotionGroups,
  buildPurchasedCourseEntry,
} from '../src/lib/treatmentBuyHelpers.js';

describe('mapPromotionProductsToConsumables', () => {
  it('TBH1 null/undefined/non-object → []', () => {
    expect(mapPromotionProductsToConsumables(null)).toEqual([]);
    expect(mapPromotionProductsToConsumables(undefined)).toEqual([]);
    expect(mapPromotionProductsToConsumables('str')).toEqual([]);
  });
  it('TBH2 promotion without products → []', () => {
    expect(mapPromotionProductsToConsumables({ id: '1', name: 'P' })).toEqual([]);
  });
  it('TBH3 maps products with promotion tagging', () => {
    const out = mapPromotionProductsToConsumables({
      id: 'PROMO-1', name: 'Promo A',
      products: [{ id: 'p1', name: 'Bottle', qty: 2, unit: 'ขวด' }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].promotionId).toBe('PROMO-1');
    expect(out[0].promotionName).toBe('Promo A');
    expect(out[0].qty).toBe('2'); // qty carried as string for Firestore consistency
  });
});

describe('filterOutConsumablesForPromotion', () => {
  it('TBH4 removes only matching promotionId', () => {
    const cons = [
      { id: 'c1', name: 'A', promotionId: 'P1' },
      { id: 'c2', name: 'B', promotionId: 'P2' },
      { id: 'c3', name: 'C' },
    ];
    const out = filterOutConsumablesForPromotion(cons, 'P1');
    expect(out).toHaveLength(2);
    expect(out.map(c => c.id)).toEqual(['c2', 'c3']);
  });
});

describe('flattenPromotionsForStockDeduction', () => {
  it('TBH5 returns items unchanged when no promotions', () => {
    const items = { products: [{ id: 'p1' }] };
    expect(flattenPromotionsForStockDeduction(items)).toBe(items);
  });
  it('TBH6 expands promotion.products into products[] with promoQty multiplier', () => {
    const items = {
      promotions: [{ id: 'P1', name: 'Promo', qty: 3, products: [{ id: 'pp1', name: 'Bottle', qty: 2 }] }],
      products: [],
    };
    const out = flattenPromotionsForStockDeduction(items);
    expect(out.products).toHaveLength(1);
    expect(out.products[0].qty).toBe(6); // 2 × 3
    expect(out.products[0].sourceType).toBe('promotion-product');
  });
});

describe('buildCustomerPromotionGroups — Phase 12.2b Step 6', () => {
  const base = [
    {
      courseId: 'promo-P1-course-C1', courseName: 'C1 Course',
      promotionId: 'P1', isAddon: true, purchasedItemId: 'P1', purchasedItemType: 'promotion',
      products: [{ rowId: 'r1', remaining: '5', total: '10' }],
    },
    {
      courseId: 'existing-C2', courseName: 'C2 Course',
      promotionId: 'P2',
      products: [{ rowId: 'r2', remaining: '2', total: '10' }],
    },
  ];
  const promos = [
    { id: 'P1', promotionName: 'New Year Bundle', isAddon: true },
    { id: 'P2', promotionName: 'Legacy Bundle' },
  ];

  it('BCPG1 null/undefined input → []', () => {
    expect(buildCustomerPromotionGroups(null, null)).toEqual([]);
    expect(buildCustomerPromotionGroups(undefined, undefined)).toEqual([]);
  });

  it('BCPG2 non-array input → []', () => {
    expect(buildCustomerPromotionGroups('foo', 'bar')).toEqual([]);
  });

  it('BCPG3 empty arrays → []', () => {
    expect(buildCustomerPromotionGroups([], [])).toEqual([]);
  });

  it('BCPG4 groups courses by promotionId', () => {
    const out = buildCustomerPromotionGroups(base, promos);
    expect(out).toHaveLength(2);
    expect(out.find(g => g.promotionId === 'P1').courses).toHaveLength(1);
    expect(out.find(g => g.promotionId === 'P2').courses).toHaveLength(1);
  });

  it('BCPG5 isAddon TRUE for purchased-this-visit promotion (carries from course)', () => {
    const out = buildCustomerPromotionGroups(base, promos);
    const g1 = out.find(g => g.promotionId === 'P1');
    expect(g1.isAddon).toBe(true);
    expect(g1.purchasedItemId).toBe('P1');
    expect(g1.purchasedItemType).toBe('promotion');
  });

  it('BCPG6 isAddon FALSE for existing promotions (no addon flag on course)', () => {
    const out = buildCustomerPromotionGroups(base, promos);
    const g2 = out.find(g => g.promotionId === 'P2');
    expect(g2.isAddon).toBe(false);
    expect(g2.purchasedItemId).toBeNull();
    expect(g2.purchasedItemType).toBeNull();
  });

  it('BCPG7 uses promo.promotionName when provided, else falls back to courseName', () => {
    const out = buildCustomerPromotionGroups(base, promos);
    expect(out.find(g => g.promotionId === 'P1').promotionName).toBe('New Year Bundle');
  });

  it('BCPG8 fallback to "โปรโมชัน #<pid>" when no matching promo + no courseName', () => {
    const courses = [{ courseId: 'x', courseName: '', promotionId: 'PX',
      products: [{ remaining: '1', total: '5' }] }];
    const out = buildCustomerPromotionGroups(courses, []);
    expect(out[0].promotionName).toBe('โปรโมชัน #PX');
  });

  it('BCPG9 filters out promotion-courses whose every product is fully consumed', () => {
    const courses = [
      { courseId: 'zero', promotionId: 'P-Z', products: [{ remaining: '0', total: '10' }] },
      { courseId: 'some', promotionId: 'P-S', products: [{ remaining: '3', total: '10' }, { remaining: '0', total: '5' }] },
    ];
    const out = buildCustomerPromotionGroups(courses, []);
    expect(out).toHaveLength(1);
    expect(out[0].promotionId).toBe('P-S');
  });

  it('BCPG10 non-promotion courses (no promotionId) are NOT grouped', () => {
    const courses = [
      { courseId: 'C-standalone', courseName: 'Standalone', products: [{ remaining: '5', total: '5' }] },
      ...base,
    ];
    const out = buildCustomerPromotionGroups(courses, promos);
    expect(out.some(g => g.promotionId === undefined)).toBe(false);
    expect(out).toHaveLength(2); // Only P1 + P2, standalone dropped
  });

  it('BCPG11 isAddon TRUE when promo doc carries the flag even if course does not', () => {
    const courses = [
      { courseId: 'c1', promotionId: 'P-NEW', products: [{ remaining: '1', total: '1' }] },
    ];
    const promosNew = [{ id: 'P-NEW', promotionName: 'Bundle', isAddon: true }];
    const out = buildCustomerPromotionGroups(courses, promosNew);
    expect(out[0].isAddon).toBe(true);
  });

  it('BCPG12 skips null/undefined course entries defensively', () => {
    const courses = [null, undefined, ...base];
    const out = buildCustomerPromotionGroups(courses, promos);
    expect(out).toHaveLength(2); // null/undefined filtered out
  });
});

describe('buildPurchasedCourseEntry — Phase 12.2b Step 7 (เหมาตามจริง fill-later)', () => {
  const NOW = 1719999999000;

  it('BPCE1 null/undefined input → null', () => {
    expect(buildPurchasedCourseEntry(null)).toBeNull();
    expect(buildPurchasedCourseEntry(undefined)).toBeNull();
  });

  it('BPCE2 item without id → null (can\'t generate synthetic courseId)', () => {
    expect(buildPurchasedCourseEntry({ name: 'C' })).toBeNull();
  });

  it('BPCE3 standard course (ระบุสินค้าและจำนวนสินค้า) preserves qty in remaining/total', () => {
    const item = {
      id: 'C-STD', name: 'Std Course', qty: 5, unit: 'ครั้ง',
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      products: [{ id: 'p1', name: 'Bottle', qty: 3, unit: 'ขวด' }],
    };
    const out = buildPurchasedCourseEntry(item, { now: NOW });
    expect(out.isRealQty).toBe(false);
    expect(out.isPickAtTreatment).toBe(false);
    expect(out.products[0].remaining).toBe('3');
    expect(out.products[0].total).toBe('3');
    expect(out.products[0].fillLater).toBe(false);
  });

  it('BPCE4 เหมาตามจริง → isRealQty true, products carry empty remaining/total + fillLater', () => {
    const item = {
      id: 'C-REAL', name: 'Real Qty Course', qty: 0, unit: 'ครั้ง',
      courseType: 'เหมาตามจริง',
      products: [{ id: 'p1', name: 'Ampoule', qty: 0, unit: 'cc' }],
    };
    const out = buildPurchasedCourseEntry(item, { now: NOW });
    expect(out.isRealQty).toBe(true);
    expect(out.isPickAtTreatment).toBe(false);
    expect(out.products[0].remaining).toBe('');
    expect(out.products[0].total).toBe('');
    expect(out.products[0].fillLater).toBe(true);
  });

  it('BPCE5 เลือกสินค้าตามจริง → isPickAtTreatment true + fillLater on products', () => {
    const item = {
      id: 'C-PICK', name: 'Pick Course', qty: 0,
      courseType: 'เลือกสินค้าตามจริง',
      products: [],
    };
    const out = buildPurchasedCourseEntry(item, { now: NOW });
    expect(out.isRealQty).toBe(false);
    expect(out.isPickAtTreatment).toBe(true);
    expect(out.products[0].fillLater).toBe(true);
    expect(out.products[0].remaining).toBe('');
  });

  it('BPCE6 บุฟเฟต์ → NOT fillLater (qty can be tracked)', () => {
    const item = {
      id: 'C-BUF', name: 'Buffet', qty: 10,
      courseType: 'บุฟเฟต์',
      products: [{ id: 'p1', name: 'x', qty: 10, unit: 'ครั้ง' }],
    };
    const out = buildPurchasedCourseEntry(item, { now: NOW });
    expect(out.isRealQty).toBe(false);
    expect(out.isPickAtTreatment).toBe(false);
    expect(out.products[0].fillLater).toBe(false);
    expect(out.products[0].remaining).toBe('10');
  });

  it('BPCE7 missing courseType → falls back to standard (NOT fillLater)', () => {
    const item = { id: 'C-LEGACY', name: 'Legacy', qty: 2, products: [] };
    const out = buildPurchasedCourseEntry(item, { now: NOW });
    expect(out.isRealQty).toBe(false);
    expect(out.isPickAtTreatment).toBe(false);
    expect(out.products[0].fillLater).toBe(false);
    expect(out.products[0].remaining).toBe('2');
  });

  it('BPCE8 empty products[] → fallback single self-row', () => {
    const item = { id: 'C-SELF', name: 'Self', qty: 3, unit: 'คอร์ส', courseType: 'บุฟเฟต์' };
    const out = buildPurchasedCourseEntry(item, { now: NOW });
    expect(out.products).toHaveLength(1);
    expect(out.products[0].name).toBe('Self');
    expect(out.products[0].rowId).toBe('purchased-C-SELF-row-self');
  });

  it('BPCE9 self-row for fillLater uses empty markers', () => {
    const item = { id: 'C-SELF-REAL', name: 'Real', qty: 0, courseType: 'เหมาตามจริง' };
    const out = buildPurchasedCourseEntry(item, { now: NOW });
    expect(out.products[0].remaining).toBe('');
    expect(out.products[0].fillLater).toBe(true);
  });

  it('BPCE10 top-level isAddon + purchasedItemId stamped', () => {
    const out = buildPurchasedCourseEntry({ id: 'X', name: 'X', qty: 1 }, { now: NOW });
    expect(out.isAddon).toBe(true);
    expect(out.purchasedItemId).toBe('X');
    expect(out.purchasedItemType).toBe('course');
  });

  it('BPCE11 deterministic courseId when now injected', () => {
    const out = buildPurchasedCourseEntry({ id: 'Y', name: 'Y', qty: 1 }, { now: 123 });
    expect(out.courseId).toBe('purchased-course-Y-123');
  });

  it('BPCE12 courseType stamped on top-level entry (downstream DF-modal reads this)', () => {
    const out = buildPurchasedCourseEntry({ id: 'Z', name: 'Z', qty: 1, courseType: 'เหมาตามจริง' });
    expect(out.courseType).toBe('เหมาตามจริง');
  });
});
