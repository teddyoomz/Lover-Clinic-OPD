// 2026-04-19 bug fix #2 — when a promotion containing standalone products is
// sold via SaleTab (or any direct-sale path), _normalizeStockItems would
// IGNORE the promotion's products[] entirely (because it only iterates
// items.products[] + items.medications[]). Result: physical inventory was
// never decremented for the freebie/takeaway items in promo bundles.
//
// Fix: flattenPromotionsForStockDeduction(items) — pure helper that expands
// each items.promotions[*].products[] into items.products[] so the existing
// stock-deduction path picks them up. Used at sale-side ONLY (SaleTab).
// TreatmentFormPage uses the treatment-side consumables path instead, so
// flatten-here would double-deduct.

import { describe, it, expect } from 'vitest';
import { flattenPromotionsForStockDeduction } from '../src/lib/treatmentBuyHelpers.js';

const promoBundle = {
  id: 'PROMO-FILLER-3900',
  name: 'Filler 3900 แถมสลายแฟต',
  qty: 1,
  // sub-courses (credits, NOT physical stock — must NOT be flattened)
  courses: [
    { id: 'C1', name: 'Filler 0.5cc', products: [{ id: 'STOCK-X', name: 'Internal X', qty: 5 }] },
  ],
  // standalone products (physical inventory — MUST be flattened)
  products: [
    { id: 'PROD-SUNSCREEN', name: 'ครีมกันแดด SPF50', qty: 2, unit: 'หลอด' },
    { id: 'PROD-MASK',      name: 'แผ่นมาส์กหน้า',   qty: 5, unit: 'ชิ้น' },
  ],
};

/* ─── Pass-through cases ──────────────────────────────────────────────────── */

describe('flattenPromotionsForStockDeduction — pass-through (no-op)', () => {
  it('returns input unchanged for null / undefined / non-object', () => {
    expect(flattenPromotionsForStockDeduction(null)).toBeNull();
    expect(flattenPromotionsForStockDeduction(undefined)).toBeUndefined();
    expect(flattenPromotionsForStockDeduction(42)).toBe(42);
    expect(flattenPromotionsForStockDeduction('str')).toBe('str');
  });

  it('returns input unchanged when arrays are empty', () => {
    const empty = { promotions: [], products: [], medications: [] };
    expect(flattenPromotionsForStockDeduction(empty)).toBe(empty);
  });

  it('returns input unchanged when no promotions field', () => {
    const noPromos = { products: [{ id: 'A' }] };
    expect(flattenPromotionsForStockDeduction(noPromos)).toBe(noPromos);
  });

  it('returns input unchanged when promotions exist but none have products[]', () => {
    const onlyCourseyPromos = {
      promotions: [{ id: 'P1', name: 'Course-only promo', courses: [{ name: 'C' }] }],
      products: [],
    };
    expect(flattenPromotionsForStockDeduction(onlyCourseyPromos)).toBe(onlyCourseyPromos);
  });

  it('skips array input (must be plain items object)', () => {
    expect(flattenPromotionsForStockDeduction([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

/* ─── Flattening behavior ─────────────────────────────────────────────────── */

describe('flattenPromotionsForStockDeduction — expand promo.products into products[]', () => {
  it('appends promotion.products[] to items.products[] (never replaces)', () => {
    const items = {
      promotions: [promoBundle],
      products: [{ id: 'PROD-OTHER', name: 'Other product', qty: 1 }],
    };
    const out = flattenPromotionsForStockDeduction(items);
    expect(out.products).toHaveLength(3); // 1 original + 2 flattened
    expect(out.products[0].id).toBe('PROD-OTHER');
    expect(out.products[1].id).toBe('PROD-SUNSCREEN');
    expect(out.products[2].id).toBe('PROD-MASK');
  });

  it('preserves promotions[] (display fidelity for receipts/reports)', () => {
    const items = { promotions: [promoBundle], products: [] };
    const out = flattenPromotionsForStockDeduction(items);
    expect(out.promotions).toBe(items.promotions);
    expect(out.promotions[0].id).toBe('PROMO-FILLER-3900');
  });

  it('multiplies product.qty by promotion.qty (selling 2 promos → 2× freebies)', () => {
    const twoPromos = {
      promotions: [{ ...promoBundle, qty: 2 }],
      products: [],
    };
    const out = flattenPromotionsForStockDeduction(twoPromos);
    expect(out.products[0].qty).toBe(4);  // 2 × 2 sunscreens
    expect(out.products[1].qty).toBe(10); // 2 × 5 masks
  });

  it('defaults promo.qty to 1 when missing or invalid', () => {
    const noQty = {
      promotions: [{ id: 'P', products: [{ id: 'X', name: 'X', qty: 3 }] }],
      products: [],
    };
    expect(flattenPromotionsForStockDeduction(noQty).products[0].qty).toBe(3);

    const zeroQty = {
      promotions: [{ id: 'P', qty: 0, products: [{ id: 'X', name: 'X', qty: 3 }] }],
      products: [],
    };
    // Math.max(1, 0) = 1 — defensive against bad data deflating freebie qty
    expect(flattenPromotionsForStockDeduction(zeroQty).products[0].qty).toBe(3);
  });

  it('defaults product.qty to 1 when missing', () => {
    const noQty = {
      promotions: [{ id: 'P', products: [{ id: 'X', name: 'X' }] }],
      products: [],
    };
    expect(flattenPromotionsForStockDeduction(noQty).products[0].qty).toBe(1);
  });

  it('handles multiple promotions in the bundle', () => {
    const multi = {
      promotions: [
        { id: 'PROMO-A', name: 'A', products: [{ id: 'PA1', name: 'A1', qty: 1 }] },
        { id: 'PROMO-B', name: 'B', products: [{ id: 'PB1', name: 'B1', qty: 2 }, { id: 'PB2', name: 'B2', qty: 3 }] },
      ],
      products: [],
    };
    const out = flattenPromotionsForStockDeduction(multi);
    expect(out.products).toHaveLength(3);
    expect(out.products.map(p => p.id)).toEqual(['PA1', 'PB1', 'PB2']);
  });

  it('does NOT flatten sub-courses inside the promotion (those are credits, not stock)', () => {
    const out = flattenPromotionsForStockDeduction({ promotions: [promoBundle], products: [] });
    // promoBundle.courses[0].products = [{ id: 'STOCK-X' ... }] — must be SKIPPED
    expect(out.products.find(p => p.id === 'STOCK-X')).toBeUndefined();
  });

  it('filters out malformed products (no name / no productName)', () => {
    const corrupt = {
      promotions: [{
        id: 'P',
        products: [
          { id: 'A', qty: 1 },              // no name → skip
          { id: 'B', name: '', qty: 1 },    // empty name → skip
          { id: 'C', name: 'OK', qty: 1 },  // keep
        ],
      }],
      products: [],
    };
    const out = flattenPromotionsForStockDeduction(corrupt);
    expect(out.products).toHaveLength(1);
    expect(out.products[0].id).toBe('C');
  });

  it('skips non-object promotion entries gracefully', () => {
    const corrupt = {
      promotions: [null, undefined, 42, { id: 'OK', products: [{ id: 'X', name: 'X', qty: 1 }] }],
      products: [],
    };
    const out = flattenPromotionsForStockDeduction(corrupt);
    expect(out.products).toHaveLength(1);
  });

  it('handles non-array .products on a promotion gracefully', () => {
    const bad = {
      promotions: [{ id: 'P', products: 'not an array' }],
      products: [],
    };
    const out = flattenPromotionsForStockDeduction(bad);
    expect(out).toBe(bad); // no-op since no real products
  });
});

/* ─── Audit trail ─────────────────────────────────────────────────────────── */

describe('flattenPromotionsForStockDeduction — audit trail tagging', () => {
  const out = flattenPromotionsForStockDeduction({ promotions: [promoBundle], products: [] });

  it('tags each flattened product with sourceType="promotion-product"', () => {
    out.products.forEach(p => expect(p.sourceType).toBe('promotion-product'));
  });

  it('tags each flattened product with sourcePromotionId + sourcePromotionName', () => {
    expect(out.products[0].sourcePromotionId).toBe('PROMO-FILLER-3900');
    expect(out.products[0].sourcePromotionName).toBe('Filler 3900 แถมสลายแฟต');
  });

  it('emits both id + productId aliases (different stock helpers read different keys)', () => {
    expect(out.products[0].id).toBe('PROD-SUNSCREEN');
    expect(out.products[0].productId).toBe('PROD-SUNSCREEN');
    expect(out.products[0].name).toBe('ครีมกันแดด SPF50');
    expect(out.products[0].productName).toBe('ครีมกันแดด SPF50');
  });
});

/* ─── Purity ──────────────────────────────────────────────────────────────── */

describe('flattenPromotionsForStockDeduction — pure / non-mutating / idempotent', () => {
  it('does NOT mutate the input items object', () => {
    const items = { promotions: [promoBundle], products: [{ id: 'X', name: 'X', qty: 1 }] };
    const before = JSON.stringify(items);
    flattenPromotionsForStockDeduction(items);
    expect(JSON.stringify(items)).toBe(before);
  });

  it('does NOT mutate items.products[] (creates a new array)', () => {
    const original = [{ id: 'X', name: 'X', qty: 1 }];
    const items = { promotions: [promoBundle], products: original };
    const out = flattenPromotionsForStockDeduction(items);
    expect(out.products).not.toBe(original);
    expect(original).toHaveLength(1);
  });

  it('same input → same output (deep equal)', () => {
    const a = flattenPromotionsForStockDeduction({ promotions: [promoBundle], products: [] });
    const b = flattenPromotionsForStockDeduction({ promotions: [promoBundle], products: [] });
    expect(a).toEqual(b);
  });
});

/* ─── End-to-end: stock-deduction shape ───────────────────────────────────── */

describe('integration — _normalizeStockItems iterates flattened products[]', () => {
  // We can't import _normalizeStockItems (it's private) but we can simulate
  // its iteration over items.products[] to prove flattened items would be
  // counted by deductStockForSale.

  it('deduction path would iterate exactly the right number of items', () => {
    const items = { promotions: [promoBundle], products: [{ id: 'PRE', name: 'Pre', qty: 1 }] };
    const flat = flattenPromotionsForStockDeduction(items);
    // Simulating _normalizeStockItems: iterates products[] + medications[] + ...
    const productCount = (flat.products || []).length;
    expect(productCount).toBe(3); // 1 pre-existing + 2 flattened from promo
  });

  it('deduction qty values are coercible Numbers (not strings) for FIFO math', () => {
    const flat = flattenPromotionsForStockDeduction({ promotions: [promoBundle], products: [] });
    flat.products.forEach(p => {
      expect(typeof p.qty).toBe('number');
      expect(p.qty).toBeGreaterThan(0);
    });
  });

  it('selling 3 promos compounds correctly (inventory deducts 3× freebies)', () => {
    const items = { promotions: [{ ...promoBundle, qty: 3 }], products: [] };
    const flat = flattenPromotionsForStockDeduction(items);
    expect(flat.products[0].qty).toBe(6);  // 3 promos × 2 sunscreens
    expect(flat.products[1].qty).toBe(15); // 3 promos × 5 masks
  });
});
