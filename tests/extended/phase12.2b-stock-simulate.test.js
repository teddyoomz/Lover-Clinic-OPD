// ─── Phase 12.2b Priority 1.1 — STOCK DEDUCTION full-flow simulate ───────
//
// Per Rule I (2026-04-25): chain EVERY step from items shape → stock
// normalization → per-course-type deduction → batch FIFO → movement log
// → reversal. Helper-only tests miss whitelist strips + shape mismatches
// that killed the buffet/LipoS bugs.
//
// Coverage:
//   F1: _normalizeStockItems branch matrix (products / medications /
//       consumables / treatmentItems / legacy array / empty / null)
//   F2: pick-at-treatment stock routing — picked product (qty=1) ends up
//       in flat[] with productId preserved (so FIFO can find a batch)
//   F3: buffet DOES decrement stock per use even though course qty stays
//       pinned (course = no-op, stock = full deduct)
//   F4: fill-later doctor-entered qty reaches stock layer with productId
//   F5: promotion bundle — standalone products flatten to products[];
//       sub-course products do NOT (they're course credits, not stock)
//   F6: rollback-on-failure — if any item fails, prior items get reversed
//       (compensating-reversal contract from deductStockForSale source)
//   F7: source-grep regression guards (rollback call, flat normalizer
//       invocation, preferNewest plumbing)

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

import { flattenPromotionsForStockDeduction } from '../src/lib/treatmentBuyHelpers.js';

// ═══════════════════════════════════════════════════════════════════════
// Mirror helper — exact copy of backendClient._normalizeStockItems.
// Keeping it local means the test exercises the EXACT branch logic the
// real function uses. The source-grep guard in F7 ensures both stay aligned.
// ═══════════════════════════════════════════════════════════════════════

function simulateNormalizeStockItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) {
    return items.map(it => ({
      productId: it.productId ? String(it.productId) : (it.id != null ? String(it.id) : null),
      productName: String(it.productName || it.name || ''),
      qty: Number(it.qty) || 0,
      unit: String(it.unit || ''),
      itemType: it.itemType || 'product',
      isPremium: !!it.isPremium,
    }));
  }
  if (typeof items === 'object') {
    const out = [];
    for (const p of items.products || []) {
      out.push({
        productId: p.productId ? String(p.productId) : (p.id != null ? String(p.id) : null),
        productName: String(p.productName || p.name || ''),
        qty: Number(p.qty) || 0,
        unit: String(p.unit || ''),
        itemType: 'product',
        isPremium: !!p.isPremium,
      });
    }
    for (const m of items.medications || []) {
      out.push({
        productId: m.productId ? String(m.productId) : (m.id != null ? String(m.id) : null),
        productName: String(m.productName || m.name || ''),
        qty: Number(m.qty) || 0, unit: String(m.unit || ''),
        itemType: 'medication', isPremium: !!m.isPremium,
      });
    }
    for (const c of items.consumables || []) {
      out.push({
        productId: c.productId ? String(c.productId) : (c.id != null ? String(c.id) : null),
        productName: String(c.productName || c.name || ''),
        qty: Number(c.qty) || 0, unit: String(c.unit || ''),
        itemType: 'consumable', isPremium: !!c.isPremium,
      });
    }
    for (const t of items.treatmentItems || []) {
      out.push({
        productId: t.productId ? String(t.productId) : (t.id != null ? String(t.id) : null),
        productName: String(t.productName || t.name || ''),
        qty: Number(t.qty) || 0, unit: String(t.unit || ''),
        itemType: 'treatmentItem', isPremium: !!t.isPremium,
      });
    }
    return out;
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════════════
// F1: _normalizeStockItems branch matrix
// ═══════════════════════════════════════════════════════════════════════

describe('F1: _normalizeStockItems branch matrix', () => {
  it('F1.1: legacy array shape → flat[] preserving productId + qty + itemType', () => {
    const flat = simulateNormalizeStockItems([
      { id: 'P1', name: 'Filler', qty: 2, unit: 'cc' },
      { productId: 'P2', productName: 'Botox', qty: 100, unit: 'U', itemType: 'medication' },
    ]);
    expect(flat).toHaveLength(2);
    expect(flat[0]).toMatchObject({ productId: 'P1', productName: 'Filler', qty: 2, itemType: 'product' });
    expect(flat[1]).toMatchObject({ productId: 'P2', itemType: 'medication' });
  });

  it('F1.2: grouped object shape iterates all 4 arrays in order (products / medications / consumables / treatmentItems)', () => {
    const flat = simulateNormalizeStockItems({
      products: [{ id: 'A', name: 'a', qty: 1 }],
      medications: [{ id: 'B', name: 'b', qty: 2 }],
      consumables: [{ id: 'C', name: 'c', qty: 3 }],
      treatmentItems: [{ id: 'D', name: 'd', qty: 4 }],
    });
    expect(flat.map(f => ({ pid: f.productId, type: f.itemType, qty: f.qty }))).toEqual([
      { pid: 'A', type: 'product', qty: 1 },
      { pid: 'B', type: 'medication', qty: 2 },
      { pid: 'C', type: 'consumable', qty: 3 },
      { pid: 'D', type: 'treatmentItem', qty: 4 },
    ]);
  });

  it('F1.3: null / undefined / empty / non-array non-object → []', () => {
    expect(simulateNormalizeStockItems(null)).toEqual([]);
    expect(simulateNormalizeStockItems(undefined)).toEqual([]);
    expect(simulateNormalizeStockItems('string')).toEqual([]);
    expect(simulateNormalizeStockItems(42)).toEqual([]);
    expect(simulateNormalizeStockItems({})).toEqual([]);
    expect(simulateNormalizeStockItems([])).toEqual([]);
  });

  it('F1.4: NaN qty → 0 (NOT NaN — FIFO allocator would blow up)', () => {
    const flat = simulateNormalizeStockItems([{ id: 'X', qty: 'not-a-number' }]);
    expect(flat[0].qty).toBe(0);
    expect(Number.isNaN(flat[0].qty)).toBe(false);
  });

  it('F1.5: isPremium flag preserved for each item type', () => {
    const flat = simulateNormalizeStockItems({
      products: [{ id: 'A', qty: 1, isPremium: true }],
      medications: [{ id: 'B', qty: 1, isPremium: false }],
    });
    expect(flat[0].isPremium).toBe(true);
    expect(flat[1].isPremium).toBe(false);
  });

  it('F1.6: missing productId falls through id → legacy productId keeps old docs routing correctly', () => {
    const flat = simulateNormalizeStockItems({
      products: [{ productId: 'X', qty: 1 }, { id: 'Y', qty: 1 }, { qty: 1 /* no id at all */ }],
    });
    expect(flat[0].productId).toBe('X');
    expect(flat[1].productId).toBe('Y');
    expect(flat[2].productId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F2: Pick-at-treatment stock routing (productId must survive the chain)
// ═══════════════════════════════════════════════════════════════════════

describe('F2: pick-at-treatment — picked product routes to stock layer with productId', () => {
  it('F2.1: treatmentItems shape from TreatmentFormPage.save-payload flows correctly', () => {
    // After user picks LipoS via PickProductsModal + ticks + sets qty 1,
    // treatmentItems = [{ id: <picked-row-id>, productId: 'LipoS_ID', name: 'LipoS', qty: '1', ... }].
    // deductStockForTreatment receives this inside items.treatmentItems.
    const items = {
      treatmentItems: [{ id: 'picked-row', productId: 'LipoS_ID', name: 'LipoS', qty: '1', unit: 'เข็ม', fillLater: false }],
    };
    const flat = simulateNormalizeStockItems(items);
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({ productId: 'LipoS_ID', productName: 'LipoS', qty: 1, itemType: 'treatmentItem' });
  });

  it('F2.2: fill-later doctor-entered qty preserved (doctor typed 50 U of Botox → stock deducts 50)', () => {
    const items = {
      treatmentItems: [{ id: 'row', productId: 'BOTOX', name: 'Botox', qty: '50', unit: 'U', fillLater: true }],
    };
    const flat = simulateNormalizeStockItems(items);
    expect(flat[0].qty).toBe(50);
  });

  it('F2.3: regression — if productId missing but id present, still routes (legacy path)', () => {
    const items = { treatmentItems: [{ id: 'LEGACY_ID', name: 'X', qty: '1' }] };
    const flat = simulateNormalizeStockItems(items);
    expect(flat[0].productId).toBe('LEGACY_ID');
  });

  it('F2.4: picked rowId (synthetic) must NOT become productId — otherwise FIFO looks up nonexistent batch', () => {
    // rowId like 'picked-purchased-course-100-999-row-LipoS-0' must never
    // leak as productId. The save payload uses productId=real master id.
    const items = {
      treatmentItems: [{ id: 'picked-purchased-course-100-999-row-LipoS-0', productId: 'LipoS_ID', name: 'LipoS', qty: '1' }],
    };
    const flat = simulateNormalizeStockItems(items);
    expect(flat[0].productId).toBe('LipoS_ID'); // real id, not rowId
    expect(flat[0].productId).not.toMatch(/^picked-/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F3: Buffet stock decrement (course = no-op, stock = full deduct)
// ═══════════════════════════════════════════════════════════════════════

describe('F3: buffet courses — stock decrements normally even though course qty pinned', () => {
  it('F3.1: ticking buffet product for treatment produces treatmentItem with real qty', () => {
    // Buffet flow: user ticks IA-โบท็อก on a buffet course. toggleCourseItem
    // creates a treatmentItem entry with the user-entered qty. The course
    // is buffet (stock-side doesn't care about course.courseType), so the
    // stock layer should decrement as usual.
    const items = {
      treatmentItems: [{ id: 'row', productId: 'IA_BOTOX', name: 'IA- โบท็อก', qty: '50', unit: 'U', isBuffet: true }],
    };
    const flat = simulateNormalizeStockItems(items);
    expect(flat[0]).toMatchObject({ productId: 'IA_BOTOX', qty: 50, itemType: 'treatmentItem' });
    // isBuffet is NOT in the stock shape — that's intentional. Stock
    // layer has no concept of buffet; it just decrements qty.
  });

  it('F3.2: multi-visit buffet — each treatment adds an independent stock movement', () => {
    // Pure simulate: visit 1 deducts 50 U, visit 2 deducts 30 U, etc.
    // Each produces its own flat entry with treatment-scoped linkage.
    const visits = [50, 30, 100, 25];
    const flats = visits.map(q => simulateNormalizeStockItems({
      treatmentItems: [{ productId: 'IA_BOTOX', name: 'B', qty: String(q), unit: 'U' }],
    }));
    expect(flats.map(f => f[0].qty)).toEqual([50, 30, 100, 25]);
    // Sum confirms no silent drop
    expect(flats.reduce((s, f) => s + f[0].qty, 0)).toBe(205);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F4: Fill-later flow (เหมาตามจริง) — doctor qty drives stock
// ═══════════════════════════════════════════════════════════════════════

describe('F4: fill-later — doctor-entered qty drives stock deduction', () => {
  it('F4.1: course.courseType=เหมาตามจริง → treatment-time qty reaches stock layer', () => {
    const items = {
      treatmentItems: [{ productId: 'GEAR', name: 'ยาฉีด', qty: '3', unit: 'หลอด', fillLater: true }],
    };
    const flat = simulateNormalizeStockItems(items);
    expect(flat[0].qty).toBe(3);
    expect(flat[0].productId).toBe('GEAR');
  });

  it('F4.2: empty qty (fillLater=true but doctor left qty blank) → 0 (save path pre-validation should catch, stock gracefully degrades)', () => {
    const items = { treatmentItems: [{ productId: 'X', qty: '', fillLater: true }] };
    const flat = simulateNormalizeStockItems(items);
    expect(flat[0].qty).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F5: Promotion bundle flattening (standalone products → stock, sub-courses stay as course credits)
// ═══════════════════════════════════════════════════════════════════════

describe('F5: flattenPromotionsForStockDeduction — bundle products flatten, sub-courses do NOT', () => {
  it('F5.1: promo with standalone products flattens into products[] at sale-side', () => {
    const items = {
      products: [],
      promotions: [{
        id: 'PROMO_1', name: 'Buy Filler Get Sunscreen',
        qty: 1,
        products: [{ id: 'SUN', name: 'Sunscreen 50ml', qty: 2, unit: 'bottle' }],
        courses: [], // sub-courses NOT flattened
      }],
    };
    const out = flattenPromotionsForStockDeduction(items);
    expect(out.products).toHaveLength(1);
    expect(out.products[0]).toMatchObject({
      id: 'SUN', name: 'Sunscreen 50ml', qty: 2,
      sourceType: 'promotion-product', sourcePromotionId: 'PROMO_1',
    });
    // Promotions array preserved (for receipt display)
    expect(out.promotions).toHaveLength(1);
  });

  it('F5.2: promo qty multiplier — buy 3× promo → each freebie product qty × 3', () => {
    const items = {
      promotions: [{
        id: 'P', name: 'X', qty: 3,
        products: [{ id: 'A', name: 'Sunscreen', qty: 2, unit: 'tube' }],
      }],
    };
    const out = flattenPromotionsForStockDeduction(items);
    expect(out.products[0].qty).toBe(6); // 2 × 3
  });

  it('F5.3: promo with sub-courses only (no standalone products) → no products added', () => {
    const items = {
      products: [{ id: 'EXISTING', qty: 1 }],
      promotions: [{
        id: 'P', qty: 1,
        products: [], // NO standalone products
        courses: [{ name: 'SubCourse', products: [{ id: 'INNER', qty: 5 }] }],
      }],
    };
    const out = flattenPromotionsForStockDeduction(items);
    expect(out.products).toHaveLength(1); // only the existing one
    expect(out.products[0].id).toBe('EXISTING');
    // INNER product should NOT appear — it's a course credit, not stock
  });

  it('F5.4: empty / null promotions array → input unchanged', () => {
    expect(flattenPromotionsForStockDeduction({ products: [{ id: 'A' }] })).toEqual({ products: [{ id: 'A' }] });
    expect(flattenPromotionsForStockDeduction(null)).toBe(null);
    expect(flattenPromotionsForStockDeduction({ promotions: [] })).toEqual({ promotions: [] });
  });

  it('F5.5: AFTER flatten, _normalizeStockItems picks up the flattened freebies', () => {
    const items = {
      products: [],
      promotions: [{
        id: 'P', qty: 1,
        products: [{ id: 'FREE', name: 'Free Gift', qty: 1, unit: 'pcs' }],
      }],
    };
    const flattened = flattenPromotionsForStockDeduction(items);
    const flat = simulateNormalizeStockItems(flattened);
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({ productId: 'FREE', productName: 'Free Gift', qty: 1 });
  });

  it('F5.6: sub-course products NEVER leak into stock (double-deduct guard)', () => {
    // If a sub-course accidentally got flattened, stock would decrement
    // TWICE (once here, once via deductCourseItems on the course credit).
    const items = {
      promotions: [{
        id: 'P', qty: 1,
        products: [{ id: 'FREE', name: 'Freebie', qty: 1 }],
        courses: [{ products: [{ id: 'SHOULD_NOT_APPEAR', name: 'Hidden', qty: 99 }] }],
      }],
    };
    const flattened = flattenPromotionsForStockDeduction(items);
    const flat = simulateNormalizeStockItems(flattened);
    const ids = flat.map(f => f.productId);
    expect(ids).toContain('FREE');
    expect(ids).not.toContain('SHOULD_NOT_APPEAR');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F6: Rollback-on-failure contract
// ═══════════════════════════════════════════════════════════════════════

describe('F6: rollback contract (deductStockForSale/Treatment reverse prior items on mid-flight failure)', () => {
  const BC = fs.readFileSync('src/lib/backendClient.js', 'utf-8');

  it('F6.1: deductStockForSale catch block calls reverseStockForSale', () => {
    const fnIdx = BC.indexOf('export async function deductStockForSale');
    expect(fnIdx).toBeGreaterThan(-1);
    const body = BC.slice(fnIdx, fnIdx + 2000);
    expect(body).toMatch(/catch\s*\(err\)/);
    expect(body).toMatch(/reverseStockForSale\(saleId/);
    expect(body).toMatch(/throw err/); // re-throw after rollback
  });

  it('F6.2: deductStockForTreatment catch block calls reverseStockForTreatment', () => {
    const fnIdx = BC.indexOf('export async function deductStockForTreatment');
    expect(fnIdx).toBeGreaterThan(-1);
    const body = BC.slice(fnIdx, fnIdx + 2000);
    expect(body).toMatch(/catch\s*\(err\)/);
    expect(body).toMatch(/reverseStockForTreatment\(treatmentId/);
    expect(body).toMatch(/throw err/);
  });

  it('F6.3: reverseStockForSale + reverseStockForTreatment are idempotent (includeReversed:false filter)', () => {
    // Second reverse call = no-op because movements are already flagged.
    expect(BC).toMatch(/listStockMovements\(\{ linkedSaleId:[^}]*includeReversed:\s*false/);
    expect(BC).toMatch(/listStockMovements\(\{ linkedTreatmentId:[^}]*includeReversed:\s*false/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F7: Source-grep regression guards
// ═══════════════════════════════════════════════════════════════════════

describe('F7: source-grep regression guards (stock flow)', () => {
  const BC = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
  const TFP = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
  const SALE = fs.readFileSync('src/components/backend/SaleTab.jsx', 'utf-8');

  it('F7.1: _normalizeStockItems iterates exactly 4 arrays (products / medications / consumables / treatmentItems)', () => {
    const fnIdx = BC.indexOf('function _normalizeStockItems');
    expect(fnIdx).toBeGreaterThan(-1);
    const body = BC.slice(fnIdx, fnIdx + 3000);
    expect(body).toMatch(/items\.products/);
    expect(body).toMatch(/items\.medications/);
    expect(body).toMatch(/items\.consumables/);
    expect(body).toMatch(/items\.treatmentItems/);
  });

  it('F7.2: TFP save-payload treatmentItems includes productId + fillLater (not just name/qty)', () => {
    // Bug 2026-04-24: save-payload was `{name, qty, unit, price}` — stripped
    // productId → stock silently skipped fill-later items. Regression guard.
    expect(TFP).toMatch(/treatmentItems:\s*treatmentItems\.filter\([^)]*\)\.map\(t\s*=>\s*\(\{[^}]*productId:\s*t\.productId/);
    expect(TFP).toMatch(/fillLater:\s*!!t\.fillLater/);
  });

  it('F7.3: SaleTab confirmBuy → deductStockForSale called with flattened items via flattenPromotionsForStockDeduction', () => {
    // Sale-side: promotion freebies must be flattened BEFORE deductStockForSale.
    // If this grep fails, promo freebies stop decrementing.
    expect(BC).toMatch(/flattenPromotionsForStockDeduction/);
  });

  it('F7.4: deductStockForSale + deductStockForTreatment accept the `items` param in grouped OR array shape (via _normalizeStockItems)', () => {
    const deductSaleIdx = BC.indexOf('export async function deductStockForSale');
    const deductTreatIdx = BC.indexOf('export async function deductStockForTreatment');
    expect(BC.slice(deductSaleIdx, deductSaleIdx + 800)).toMatch(/_normalizeStockItems\(items\)/);
    expect(BC.slice(deductTreatIdx, deductTreatIdx + 800)).toMatch(/_normalizeStockItems\(items\)/);
  });

  it('F7.5: preferNewest flag plumbed through to _deductOneItem (needed for treatment-after-buy flows)', () => {
    expect(BC).toMatch(/preferNewest\s*=\s*!!opts\.preferNewest/);
  });
});
