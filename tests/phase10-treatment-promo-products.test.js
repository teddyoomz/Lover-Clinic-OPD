// 2026-04-19 bug fix — promotion's standalone products[] must flow to
// consumables when bought in TreatmentFormPage so they (a) show up in the UI
// section "สินค้าสิ้นเปลือง" and (b) get deducted from stock via
// deductStockForTreatment which iterates items.consumables[].
//
// Tests cover the pure mapping helper + the symmetric removal helper +
// the integration shape consumed by _normalizeStockItems.

import { describe, it, expect } from 'vitest';
import {
  mapPromotionProductsToConsumables,
  filterOutConsumablesForPromotion,
} from '../src/lib/treatmentBuyHelpers.js';

/* ─── Pure mapping ────────────────────────────────────────────────────────── */

describe('mapPromotionProductsToConsumables — promotion.products → consumables', () => {
  const promotion = {
    id: 'PROMO-001',
    name: 'Filler 3900 แถมสลายแฟต',
    products: [
      { id: 'PROD-A', name: 'ครีมกันแดด SPF50', qty: 2, unit: 'หลอด' },
      { id: 'PROD-B', name: 'แผ่นมาส์กหน้า', qty: 5, unit: 'ชิ้น' },
    ],
  };

  it('maps each product to a consumable carrying name/qty/unit', () => {
    const out = mapPromotionProductsToConsumables(promotion);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      id: 'PROD-A',
      name: 'ครีมกันแดด SPF50',
      qty: '2',
      unit: 'หลอด',
      promotionId: 'PROMO-001',
      promotionName: 'Filler 3900 แถมสลายแฟต',
    });
    expect(out[1]).toEqual({
      id: 'PROD-B',
      name: 'แผ่นมาส์กหน้า',
      qty: '5',
      unit: 'ชิ้น',
      promotionId: 'PROMO-001',
      promotionName: 'Filler 3900 แถมสลายแฟต',
    });
  });

  it('every consumable gets the promotionId tag (for symmetric removal)', () => {
    const out = mapPromotionProductsToConsumables(promotion);
    out.forEach(c => expect(c.promotionId).toBe('PROMO-001'));
  });

  it('returns [] for null / undefined / non-object input', () => {
    expect(mapPromotionProductsToConsumables(null)).toEqual([]);
    expect(mapPromotionProductsToConsumables(undefined)).toEqual([]);
    expect(mapPromotionProductsToConsumables('string')).toEqual([]);
    expect(mapPromotionProductsToConsumables(42)).toEqual([]);
  });

  it('returns [] when promotion has no products[] (only courses)', () => {
    expect(mapPromotionProductsToConsumables({ id: 'X', name: 'Y' })).toEqual([]);
    expect(mapPromotionProductsToConsumables({ id: 'X', name: 'Y', products: null })).toEqual([]);
    expect(mapPromotionProductsToConsumables({ id: 'X', name: 'Y', products: [] })).toEqual([]);
  });

  it('filters out products without a name (defensive — corrupted source)', () => {
    const corrupt = {
      id: 'PROMO-X',
      name: 'X',
      products: [
        { id: 'A', name: '', qty: 1 },
        { id: 'B', qty: 1 },
        { id: 'C', name: 'Real product', qty: 1 },
      ],
    };
    const out = mapPromotionProductsToConsumables(corrupt);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Real product');
  });

  it('accepts productName as alias for name', () => {
    const promo = { id: 'X', name: 'X', products: [{ id: 'A', productName: 'Aliased', qty: 1 }] };
    expect(mapPromotionProductsToConsumables(promo)[0].name).toBe('Aliased');
  });

  it('defaults qty to "1" and unit to "" when missing', () => {
    const promo = { id: 'X', name: 'X', products: [{ id: 'A', name: 'X' }] };
    const out = mapPromotionProductsToConsumables(promo);
    expect(out[0].qty).toBe('1');
    expect(out[0].unit).toBe('');
  });

  it('preserves qty=0 (not coerced to 1) — for "free" products that should still appear', () => {
    const promo = { id: 'X', name: 'X', products: [{ id: 'A', name: 'X', qty: 0 }] };
    expect(mapPromotionProductsToConsumables(promo)[0].qty).toBe('0');
  });

  it('coerces numeric id/promotionId to strings (Firestore IDs vary)', () => {
    const promo = { id: 12345, name: 'X', products: [{ id: 99, name: 'Y', qty: 1 }] };
    const out = mapPromotionProductsToConsumables(promo);
    expect(out[0].id).toBe('99');
    expect(out[0].promotionId).toBe('12345');
  });

  it('falls back to productId when id missing; falls back to synthesized id when both missing', () => {
    const promo = {
      id: 'X', name: 'X',
      products: [
        { productId: 'PID', name: 'Has productId', qty: 1 },
        { name: 'No id at all', qty: 1 },
      ],
    };
    const out = mapPromotionProductsToConsumables(promo);
    expect(out[0].id).toBe('PID');
    expect(out[1].id).toContain('promo-X-prod-No id at all');
  });

  it('is deterministic — same input twice → same output', () => {
    const a = mapPromotionProductsToConsumables(promotion);
    const b = mapPromotionProductsToConsumables(promotion);
    expect(a).toEqual(b);
  });

  it('does NOT mutate the input promotion or its products array', () => {
    const before = JSON.stringify(promotion);
    mapPromotionProductsToConsumables(promotion);
    expect(JSON.stringify(promotion)).toBe(before);
  });
});

/* ─── Symmetric removal ───────────────────────────────────────────────────── */

describe('filterOutConsumablesForPromotion — symmetric removal', () => {
  const consumables = [
    { id: 'A', name: 'Manual cons',   qty: '1', unit: 'pc' },                                 // user-added
    { id: 'B', name: 'Promo X cons',  qty: '2', unit: 'pc', promotionId: 'PROMO-X' },         // from PROMO-X
    { id: 'C', name: 'Promo Y cons',  qty: '3', unit: 'pc', promotionId: 'PROMO-Y' },         // from PROMO-Y
    { id: 'D', name: 'Promo X cons2', qty: '1', unit: 'pc', promotionId: 'PROMO-X' },         // from PROMO-X
  ];

  it('removes ONLY consumables tagged with the matching promotionId', () => {
    const out = filterOutConsumablesForPromotion(consumables, 'PROMO-X');
    expect(out).toHaveLength(2);
    expect(out.map(c => c.id)).toEqual(['A', 'C']);
  });

  it('returns the same reference when no consumable matches (cheap React identity)', () => {
    const out = filterOutConsumablesForPromotion(consumables, 'PROMO-NOPE');
    expect(out).toBe(consumables);
  });

  it('returns the same reference when promotionId is empty/null', () => {
    expect(filterOutConsumablesForPromotion(consumables, null)).toBe(consumables);
    expect(filterOutConsumablesForPromotion(consumables, '')).toBe(consumables);
    expect(filterOutConsumablesForPromotion(consumables, undefined)).toBe(consumables);
  });

  it('returns [] for non-array input without throwing', () => {
    expect(filterOutConsumablesForPromotion(null, 'X')).toEqual([]);
    expect(filterOutConsumablesForPromotion(undefined, 'X')).toEqual([]);
  });

  it('coerces numeric promotionId to string (handles Firestore numeric IDs)', () => {
    const cons = [{ id: 'A', promotionId: '123' }];
    expect(filterOutConsumablesForPromotion(cons, 123)).toEqual([]);
  });

  it('does NOT mutate the input array', () => {
    const before = consumables.length;
    filterOutConsumablesForPromotion(consumables, 'PROMO-X');
    expect(consumables.length).toBe(before);
  });
});

/* ─── Integration shape (consumed by _normalizeStockItems via deductStockForTreatment)
   ─────────────────────────────────────────────────────────────────────────── */

describe('integration — consumables shape consumed by stock deduction', () => {
  // _normalizeStockItems iterates items.consumables[] and reads
  // { id|productId, name|productName, qty, unit, isPremium }. Verify our
  // mapping emits the keys it expects so deductStockForTreatment will see
  // a deductable item.
  it('emits id + name + qty + unit (the keys _normalizeStockItems reads)', () => {
    const promo = { id: 'PROMO', name: 'P', products: [{ id: 'STOCK-1', name: 'X', qty: 3, unit: 'pc' }] };
    const out = mapPromotionProductsToConsumables(promo);
    out.forEach(c => {
      expect(c).toHaveProperty('id');
      expect(c).toHaveProperty('name');
      expect(c).toHaveProperty('qty');
      expect(c).toHaveProperty('unit');
    });
  });

  it('qty is coercible back to a positive Number for stock math', () => {
    const promo = { id: 'PROMO', name: 'P', products: [{ id: 'A', name: 'X', qty: 7, unit: 'pc' }] };
    const out = mapPromotionProductsToConsumables(promo);
    expect(Number(out[0].qty)).toBe(7);
  });
});
