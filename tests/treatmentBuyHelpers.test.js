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
  findMissingFillLaterQty,
  findOutOfRangePickAtTreatmentQty,
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

  // Phase 12.2b Step 7 follow-up (2026-04-24): productId preservation so
  // the treatment-time stock path can resolve the be_products doc and
  // actually deduct a batch (previously rowId was stored as the only
  // identifier → _normalizeStockItems fell back to rowId which matches
  // nothing in be_products → every fill-later sale skipped stock silently).

  it('BPCE13 productId preserved from p.id when products[] carries it', () => {
    const item = {
      id: 'C-PID', name: 'C', qty: 0, courseType: 'เหมาตามจริง',
      products: [{ id: 'PROD-281', name: 'BA - Allergan', qty: 0, unit: 'U' }],
    };
    const out = buildPurchasedCourseEntry(item);
    expect(out.products[0].productId).toBe('PROD-281');
  });

  it('BPCE14 productId preserved from p.productId (master_data shape)', () => {
    const item = {
      id: 'C-PID', name: 'C', qty: 1,
      products: [{ productId: 'P-42', name: 'X', qty: 1, unit: 'U' }],
    };
    expect(buildPurchasedCourseEntry(item).products[0].productId).toBe('P-42');
  });

  it('BPCE15 productId coerced to string (master ids often arrive as number)', () => {
    const item = {
      id: 'C-NUM', name: 'C', qty: 1,
      products: [{ id: 281, name: 'X', qty: 1 }],
    };
    expect(buildPurchasedCourseEntry(item).products[0].productId).toBe('281');
  });

  it('BPCE16 rowId still uses productId (not Math.random) for stability', () => {
    const item = {
      id: 'C-STABLE', name: 'C', qty: 1,
      products: [{ id: 'P-5', name: 'X', qty: 1 }],
    };
    const out = buildPurchasedCourseEntry(item, { now: 999 });
    expect(out.products[0].rowId).toBe('purchased-C-STABLE-row-P-5');
  });

  it('BPCE17 self-fallback row has empty productId (no sub-product id to carry)', () => {
    const item = { id: 'C-SELF', name: 'C', qty: 1 };
    const out = buildPurchasedCourseEntry(item);
    expect(out.products).toHaveLength(1);
    expect(out.products[0].productId).toBe('');
  });
});

describe('findMissingFillLaterQty — Phase 12.2b Step 7 save-time validator', () => {
  it('FMFLQ1 null/undefined/non-array input → null (no offender)', () => {
    expect(findMissingFillLaterQty(null)).toBeNull();
    expect(findMissingFillLaterQty(undefined)).toBeNull();
    expect(findMissingFillLaterQty('str')).toBeNull();
  });

  it('FMFLQ2 empty array → null', () => {
    expect(findMissingFillLaterQty([])).toBeNull();
  });

  it('FMFLQ3 non-fill-later items with empty qty are ignored (not our concern)', () => {
    const items = [{ id: 'r1', name: 'X', qty: '', fillLater: false }];
    expect(findMissingFillLaterQty(items)).toBeNull();
  });

  it('FMFLQ4 fill-later item with empty string qty → offender', () => {
    const items = [{ id: 'r1', name: 'X', qty: '', fillLater: true }];
    const out = findMissingFillLaterQty(items);
    expect(out?.id).toBe('r1');
    expect(out?.name).toBe('X');
  });

  it('FMFLQ5 fill-later item with null/undefined qty → offender', () => {
    expect(findMissingFillLaterQty([{ id: 'r1', qty: null, fillLater: true }])?.id).toBe('r1');
    expect(findMissingFillLaterQty([{ id: 'r1', qty: undefined, fillLater: true }])?.id).toBe('r1');
  });

  it('FMFLQ6 fill-later item with qty "0" → offender (must be > 0)', () => {
    expect(findMissingFillLaterQty([{ id: 'r1', qty: '0', fillLater: true }])?.id).toBe('r1');
    expect(findMissingFillLaterQty([{ id: 'r1', qty: 0, fillLater: true }])?.id).toBe('r1');
  });

  it('FMFLQ7 fill-later item with non-numeric qty → offender', () => {
    expect(findMissingFillLaterQty([{ id: 'r1', qty: 'abc', fillLater: true }])?.id).toBe('r1');
  });

  it('FMFLQ8 fill-later item with valid qty → null', () => {
    expect(findMissingFillLaterQty([{ id: 'r1', qty: '2', fillLater: true }])).toBeNull();
    expect(findMissingFillLaterQty([{ id: 'r1', qty: 5, fillLater: true }])).toBeNull();
    expect(findMissingFillLaterQty([{ id: 'r1', qty: '0.5', fillLater: true }])).toBeNull();
  });

  it('FMFLQ9 returns the FIRST offender when multiple are missing', () => {
    const items = [
      { id: 'ok', qty: '3', fillLater: true },
      { id: 'bad1', qty: '', fillLater: true },
      { id: 'bad2', qty: '0', fillLater: true },
    ];
    expect(findMissingFillLaterQty(items)?.id).toBe('bad1');
  });

  it('FMFLQ10 null/undefined entries in array skipped defensively', () => {
    const items = [null, undefined, { id: 'r1', qty: '', fillLater: true }];
    expect(findMissingFillLaterQty(items)?.id).toBe('r1');
  });

  it('FMFLQ11 mixed items: returns only fill-later offender, ignores empty non-fill-later', () => {
    const items = [
      { id: 'std-empty', qty: '', fillLater: false }, // ignored (not fill-later)
      { id: 'real-bad', qty: '', fillLater: true },
    ];
    expect(findMissingFillLaterQty(items)?.id).toBe('real-bad');
  });
});

describe('findOutOfRangePickAtTreatmentQty — Phase 12.2b pick-at-treatment limits', () => {
  // User directive: "มันเป็นแค่การกำหนดลิมิตมา แล้วระบุว่าใช้จริงเท่าไหร่
  // โดยไม่ต่ำกว่าที่กำหนด และไม่สูงกว่าที่กำหนด ไม่ใช่ระบบเหมาเท่าไหร่ก็ได้".

  it('FOOR1 null / undefined / non-array → null (no offender)', () => {
    expect(findOutOfRangePickAtTreatmentQty(null)).toBeNull();
    expect(findOutOfRangePickAtTreatmentQty(undefined)).toBeNull();
    expect(findOutOfRangePickAtTreatmentQty('foo')).toBeNull();
  });

  it('FOOR2 empty array → null', () => {
    expect(findOutOfRangePickAtTreatmentQty([])).toBeNull();
  });

  it('FOOR3 non-pick-at-treatment items ignored entirely', () => {
    const items = [
      { id: 'r1', qty: '999', isPickAtTreatment: false, minQty: 1, maxQty: 10 },
      { id: 'r2', qty: '-5', fillLater: true, minQty: 1, maxQty: 10 },
    ];
    expect(findOutOfRangePickAtTreatmentQty(items)).toBeNull();
  });

  it('FOOR4 blank qty on pick-at-treatment → skipped (fillLater validator handles it)', () => {
    const items = [{ id: 'r1', qty: '', isPickAtTreatment: true, minQty: 1, maxQty: 10 }];
    expect(findOutOfRangePickAtTreatmentQty(items)).toBeNull();
  });

  it('FOOR5 qty below minQty → offender with reason=below', () => {
    const items = [{ id: 'r1', name: 'Allergan', qty: '0.5', isPickAtTreatment: true, minQty: 1, maxQty: 10 }];
    const out = findOutOfRangePickAtTreatmentQty(items);
    expect(out?.reason).toBe('below');
    expect(out?.limit).toBe(1);
    expect(out?.item.id).toBe('r1');
  });

  it('FOOR6 qty above maxQty → offender with reason=above', () => {
    const items = [{ id: 'r1', name: 'Allergan', qty: '15', isPickAtTreatment: true, minQty: 1, maxQty: 10 }];
    const out = findOutOfRangePickAtTreatmentQty(items);
    expect(out?.reason).toBe('above');
    expect(out?.limit).toBe(10);
  });

  it('FOOR7 qty exactly at minQty is OK (inclusive)', () => {
    const items = [{ id: 'r1', qty: '1', isPickAtTreatment: true, minQty: 1, maxQty: 10 }];
    expect(findOutOfRangePickAtTreatmentQty(items)).toBeNull();
  });

  it('FOOR8 qty exactly at maxQty is OK (inclusive)', () => {
    const items = [{ id: 'r1', qty: '10', isPickAtTreatment: true, minQty: 1, maxQty: 10 }];
    expect(findOutOfRangePickAtTreatmentQty(items)).toBeNull();
  });

  it('FOOR9 only maxQty set (no min) — unlimited below, capped above', () => {
    const items = [{ id: 'r1', qty: '0.0001', isPickAtTreatment: true, maxQty: 10 }];
    expect(findOutOfRangePickAtTreatmentQty(items)).toBeNull(); // no min → no floor
    const hi = [{ id: 'r1', qty: '100', isPickAtTreatment: true, maxQty: 10 }];
    expect(findOutOfRangePickAtTreatmentQty(hi)?.reason).toBe('above');
  });

  it('FOOR10 only minQty set (no max) — enforces floor, no ceiling', () => {
    const items = [{ id: 'r1', qty: '0', isPickAtTreatment: true, minQty: 5 }];
    expect(findOutOfRangePickAtTreatmentQty(items)?.reason).toBe('below');
    const hi = [{ id: 'r1', qty: '99999', isPickAtTreatment: true, minQty: 5 }];
    expect(findOutOfRangePickAtTreatmentQty(hi)).toBeNull(); // no max → no ceiling
  });

  it('FOOR11 neither min nor max set → always valid (no limit configured)', () => {
    const items = [{ id: 'r1', qty: '0', isPickAtTreatment: true }];
    expect(findOutOfRangePickAtTreatmentQty(items)).toBeNull();
  });

  it('FOOR12 returns FIRST offender + stops scanning (short-circuit)', () => {
    const items = [
      { id: 'ok', qty: '5', isPickAtTreatment: true, minQty: 1, maxQty: 10 },
      { id: 'first-bad', qty: '50', isPickAtTreatment: true, minQty: 1, maxQty: 10 },
      { id: 'second-bad', qty: '0.1', isPickAtTreatment: true, minQty: 1, maxQty: 10 },
    ];
    expect(findOutOfRangePickAtTreatmentQty(items)?.item.id).toBe('first-bad');
  });

  it('FOOR13 non-numeric qty skipped (can\'t evaluate range)', () => {
    const items = [{ id: 'r1', qty: 'abc', isPickAtTreatment: true, minQty: 1, maxQty: 10 }];
    expect(findOutOfRangePickAtTreatmentQty(items)).toBeNull();
  });

  it('FOOR14 decimal limits work (e.g. 0.5 cc)', () => {
    const items = [{ id: 'r1', qty: '0.3', isPickAtTreatment: true, minQty: 0.5, maxQty: 1.5 }];
    expect(findOutOfRangePickAtTreatmentQty(items)?.reason).toBe('below');
  });
});
