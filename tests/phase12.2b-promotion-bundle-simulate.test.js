// ─── Phase 12.2b Priority 2.8 — PROMOTION BUNDLE full-flow simulate ──────
//
// Promotions carry THREE things:
//   1. sub-courses  → behave like standalone courses after assign
//                    (customerCourses entries with linkedSaleId + promotionId)
//   2. standalone products (e.g. "buy Filler get 2 Sunscreens free")
//                    → sale-side: flattened into items.products[] for stock
//                    → treatment-side: mapped into consumables[] for stock
//   3. promotion-level price (the bundle discount total)
//
// Critical invariants:
//   - flattenPromotionsForStockDeduction does NOT touch sub-courses'
//     products (those are course credits, not stock)
//   - mapPromotionProductsToConsumables (treatment side) tags each
//     consumable with promotionId so removePurchasedItem can clean
//     them up symmetrically when the promotion is removed
//   - filterOutConsumablesForPromotion removes ONLY entries with the
//     matching promotionId (leaves others)
//
// Coverage:
//   F1: mapPromotionProductsToConsumables — tags + pass-through qty/unit
//   F2: filterOutConsumablesForPromotion — targeted removal invariant
//   F3: flattenPromotionsForStockDeduction — sub-course guard (already
//       partially covered in stock-simulate F5; expand adversarial here)
//   F4: buildCustomerPromotionGroups — groups courses by promotionId +
//       preserves isAddon + purchasedItemId chain
//   F5: end-to-end — buy promo → assign sub-courses → ticking works

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

import {
  mapPromotionProductsToConsumables,
  filterOutConsumablesForPromotion,
  flattenPromotionsForStockDeduction,
  buildCustomerPromotionGroups,
} from '../src/lib/treatmentBuyHelpers.js';

// ═══════════════════════════════════════════════════════════════════════
// F1: mapPromotionProductsToConsumables — treatment-side flattening
// ═══════════════════════════════════════════════════════════════════════

describe('F1: mapPromotionProductsToConsumables — promo standalone products → consumables', () => {
  it('F1.1: basic mapping — id + name + qty + unit + promotionId + promotionName', () => {
    const promo = {
      id: 'PR1', name: 'Filler-3900 Promo',
      products: [{ id: 'SUN', name: 'Sunscreen 50', qty: 2, unit: 'bottle' }],
    };
    const out = mapPromotionProductsToConsumables(promo);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'SUN', name: 'Sunscreen 50', qty: '2', unit: 'bottle',
      promotionId: 'PR1', promotionName: 'Filler-3900 Promo',
    });
  });

  it('F1.2: empty / null / non-object input → []', () => {
    expect(mapPromotionProductsToConsumables(null)).toEqual([]);
    expect(mapPromotionProductsToConsumables({})).toEqual([]);
    expect(mapPromotionProductsToConsumables({ products: [] })).toEqual([]);
  });

  it('F1.3: products without name OR productName → skipped (defensive)', () => {
    const out = mapPromotionProductsToConsumables({
      id: 'P', name: 'X',
      products: [{ id: 'NoName', qty: 1 }, { id: 'Ok', name: 'Has Name', qty: 1 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Has Name');
  });

  it('F1.4: productId fallback chain — p.id → p.productId → synthetic string', () => {
    const promo = {
      id: 'PR', name: 'X',
      products: [
        { id: 'A', name: 'Has id' },
        { productId: 'B', name: 'Has productId' },
        { name: 'No ID' },
      ],
    };
    const out = mapPromotionProductsToConsumables(promo);
    expect(out[0].id).toBe('A');
    expect(out[1].id).toBe('B');
    expect(out[2].id).toBe('promo-PR-prod-No ID'); // synthetic
  });

  it('F1.5: qty defaults to "1" when missing (String conversion)', () => {
    const out = mapPromotionProductsToConsumables({
      id: 'X', name: 'Y',
      products: [{ id: 'P', name: 'Q' }], // no qty
    });
    expect(out[0].qty).toBe('1');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F2: filterOutConsumablesForPromotion — symmetric removal
// ═══════════════════════════════════════════════════════════════════════

describe('F2: filterOutConsumablesForPromotion — remove only matching promotionId', () => {
  it('F2.1: basic filter — keeps non-matching, removes matching', () => {
    const consumables = [
      { id: 'A', promotionId: 'P1' },
      { id: 'B', promotionId: 'P2' },
      { id: 'C', promotionId: 'P1' },
      { id: 'D' /* no promo */ },
    ];
    const out = filterOutConsumablesForPromotion(consumables, 'P1');
    expect(out.map(c => c.id)).toEqual(['B', 'D']);
  });

  it('F2.2: empty input → returns input unchanged', () => {
    expect(filterOutConsumablesForPromotion([])).toEqual([]);
    expect(filterOutConsumablesForPromotion(null)).toEqual([]);
  });

  it('F2.3: null promotionId → returns input unchanged (identity preservation)', () => {
    const consumables = [{ id: 'A', promotionId: 'P1' }];
    expect(filterOutConsumablesForPromotion(consumables, null)).toBe(consumables);
    expect(filterOutConsumablesForPromotion(consumables, '')).toBe(consumables);
  });

  it('F2.4: no matches → returns SAME reference (React identity preservation)', () => {
    const consumables = [{ id: 'A', promotionId: 'P1' }];
    expect(filterOutConsumablesForPromotion(consumables, 'P999')).toBe(consumables);
  });

  it('F2.5: string/number promotionId coerced to string for comparison', () => {
    const consumables = [{ id: 'A', promotionId: 123 }, { id: 'B', promotionId: '123' }];
    const out = filterOutConsumablesForPromotion(consumables, '123');
    expect(out).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F3: flattenPromotionsForStockDeduction — double-deduct guard
// ═══════════════════════════════════════════════════════════════════════

describe('F3: flattenPromotionsForStockDeduction — sub-course products NEVER leak to stock', () => {
  it('F3.1: sub-courses carry products → those products do NOT flatten (course credits)', () => {
    const items = {
      products: [],
      promotions: [{
        id: 'PR', qty: 1,
        products: [], // NO standalone products
        courses: [{ products: [{ id: 'InsideCourse', name: 'Don\'t leak', qty: 99 }] }],
      }],
    };
    const out = flattenPromotionsForStockDeduction(items);
    // products remain empty — inner course products are course credits
    expect(out.products).toEqual([]);
  });

  it('F3.2: multiple promos with mixed standalone + sub-courses', () => {
    const items = {
      products: [{ id: 'BASE', qty: 1 }],
      promotions: [
        {
          id: 'PR1', qty: 2, name: 'A',
          products: [{ id: 'FREE1', name: 'Gift1', qty: 1 }],
          courses: [{ products: [{ id: 'LEAK1', name: 'no', qty: 50 }] }],
        },
        {
          id: 'PR2', qty: 1, name: 'B',
          products: [{ id: 'FREE2', name: 'Gift2', qty: 3 }],
        },
      ],
    };
    const out = flattenPromotionsForStockDeduction(items);
    const ids = out.products.map(p => p.id);
    expect(ids).toContain('BASE');
    expect(ids).toContain('FREE1');
    expect(ids).toContain('FREE2');
    expect(ids).not.toContain('LEAK1');
    // Verify qty multiplier (promo qty × baseQty)
    const free1 = out.products.find(p => p.id === 'FREE1');
    expect(free1.qty).toBe(2); // 1 × promo qty 2
    const free2 = out.products.find(p => p.id === 'FREE2');
    expect(free2.qty).toBe(3); // 3 × promo qty 1
  });

  it('F3.3: each flattened product carries sourcePromotionId + sourcePromotionName + sourceType', () => {
    const items = {
      promotions: [{
        id: 'PR', name: 'PromoName', qty: 1,
        products: [{ id: 'A', name: 'X', qty: 1 }],
      }],
    };
    const out = flattenPromotionsForStockDeduction(items);
    expect(out.products[0]).toMatchObject({
      sourceType: 'promotion-product',
      sourcePromotionId: 'PR',
      sourcePromotionName: 'PromoName',
    });
  });

  it('F3.4: promotions[] preserved after flatten (receipt display)', () => {
    const items = {
      promotions: [{ id: 'PR', name: 'X', qty: 1, products: [{ id: 'A', name: 'Y', qty: 1 }] }],
    };
    const out = flattenPromotionsForStockDeduction(items);
    expect(out.promotions).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F4: buildCustomerPromotionGroups — group courses by promotionId
// ═══════════════════════════════════════════════════════════════════════

describe('F4: buildCustomerPromotionGroups — promotion grouping with add-on detection', () => {
  it('F4.1: courses with same promotionId group together', () => {
    const courses = [
      { promotionId: 'P1', courseName: 'Sub1', products: [{ remaining: '3', total: '3' }] },
      { promotionId: 'P1', courseName: 'Sub2', products: [{ remaining: '5', total: '5' }] },
      { promotionId: 'P2', courseName: 'Other', products: [{ remaining: '1', total: '1' }] },
    ];
    const groups = buildCustomerPromotionGroups(courses, []);
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.promotionId === 'P1').courses).toHaveLength(2);
    expect(groups.find(g => g.promotionId === 'P2').courses).toHaveLength(1);
  });

  it('F4.2: course-with-zero-remaining is filtered (keep groups visible only while usable)', () => {
    const courses = [
      { promotionId: 'P1', courseName: 'Used', products: [{ remaining: '0', total: '1' }] },
    ];
    const groups = buildCustomerPromotionGroups(courses, []);
    // A course with no remaining products is filtered → no groups produced
    expect(groups).toHaveLength(0);
  });

  it('F4.3: isAddon detection — course OR promo isAddon flag propagates', () => {
    const courses = [
      { promotionId: 'P1', courseName: 'X', isAddon: true, purchasedItemId: 100, purchasedItemType: 'promotion',
        products: [{ remaining: '1', total: '1' }] },
    ];
    const customerPromos = [{ id: 'P1', promotionName: 'P1 name', isAddon: true }];
    const groups = buildCustomerPromotionGroups(courses, customerPromos);
    expect(groups[0].isAddon).toBe(true);
    expect(groups[0].purchasedItemId).toBe(100);
    expect(groups[0].purchasedItemType).toBe('promotion');
    expect(groups[0].promotionName).toBe('P1 name');
  });

  it('F4.4: fallback promotionName when customerPromos has no match', () => {
    const courses = [
      { promotionId: 'P99', courseName: 'Standalone', products: [{ remaining: '1', total: '1' }] },
    ];
    const groups = buildCustomerPromotionGroups(courses, []);
    // Falls back to courseName or `โปรโมชัน #P99`
    expect(groups[0].promotionName).toMatch(/Standalone|P99/);
  });

  it('F4.5: empty inputs → []', () => {
    expect(buildCustomerPromotionGroups([], [])).toEqual([]);
    expect(buildCustomerPromotionGroups(null, null)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F5: End-to-end — buy promo → customer.courses shape post-assign
// ═══════════════════════════════════════════════════════════════════════

describe('F5: end-to-end — buy promo bundle, customer.courses after assign', () => {
  it('F5.1: buy promo with 2 sub-courses + 1 freebie → customer.courses has 2 entries (one per sub-course product)', () => {
    // SaleTab handleSubmit iterates promo.courses[] and calls
    // assignCourseToCustomer per sub-course. Simulate the result:
    const assigned = [
      { name: 'Sub1', product: 'P1a', qty: '3 / 3 U', linkedSaleId: 'S1', promotionId: 'PR1', parentName: 'โปรโมชัน: PromoBundle' },
      { name: 'Sub2', product: 'P2a', qty: '5 / 5 U', linkedSaleId: 'S1', promotionId: 'PR1', parentName: 'โปรโมชัน: PromoBundle' },
    ];
    // Group them
    const groups = buildCustomerPromotionGroups(
      assigned.map(a => ({ ...a, courseName: a.name, products: [{ remaining: a.qty.split(' / ')[0], total: a.qty.split(' / ')[1].split(' ')[0] }] })),
      [{ id: 'PR1', promotionName: 'PromoBundle' }]
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].courses).toHaveLength(2);
    expect(groups[0].promotionName).toBe('PromoBundle');
  });

  it('F5.2: sale-side freebie products → flattenPromotionsForStockDeduction adds to items.products → stock deducts', () => {
    const items = {
      products: [{ id: 'BASE', name: 'Base', qty: 1 }],
      promotions: [{
        id: 'PR', qty: 1, name: 'Bundle',
        products: [{ id: 'FREE', name: 'Freebie', qty: 2, unit: 'pcs' }],
        courses: [{ products: [{ id: 'SUB_COURSE_PRODUCT', name: 'x', qty: 10 }] }],
      }],
    };
    const flattened = flattenPromotionsForStockDeduction(items);
    const productIds = flattened.products.map(p => p.id);
    expect(productIds).toContain('BASE');
    expect(productIds).toContain('FREE');
    expect(productIds).not.toContain('SUB_COURSE_PRODUCT'); // double-deduct guard
  });

  it('F5.3: treatment-side freebie → mapPromotionProductsToConsumables → consumables[]', () => {
    const promo = {
      id: 'PR', name: 'InVisitBuy',
      products: [{ id: 'F', name: 'FreeGift', qty: 1, unit: 'pcs' }],
    };
    const consumables = mapPromotionProductsToConsumables(promo);
    expect(consumables[0].promotionId).toBe('PR');
    // Later, removePurchasedItem passes consumables + promoId → filter works
    const kept = filterOutConsumablesForPromotion(consumables, 'PR');
    expect(kept).toHaveLength(0);
  });
});
