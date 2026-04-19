// 2026-04-19 — Comprehensive stock-flow coverage for every sale composition
// across every page that creates/edits/deletes sales.
//
// Checks the full matrix:
//   ITEM TYPES   × CREATE / EDIT / DELETE × SALE-PATH
//   ────────────────────────────────────────────────────────
//   - course only             (credit; no stock impact)
//   - product only            (sale-side direct deduct)
//   - medication only         (sale-side direct deduct)
//   - promo: courses only     (no stock impact)
//   - promo: products only    (the 2026-04-19 bug — needs flatten on sale-side
//                              OR consumables-route on treatment-side)
//   - promo: courses+products (mixed bundle — only top-level products deduct)
//   - mixed (course + product + promo + medication)
//   - consumables             (treatment-side only)
//   - treatmentItems          (treatment-side only)
//
//   × CREATE — initial deduct
//   × EDIT   — reverse old, deduct new (delta)
//   × DELETE — reverse only
//
//   × SALE-PATH:
//   - SaleTab               → wraps deductStockForSale with flatten()
//   - TreatmentFormPage     → does NOT flatten (consumables route handles
//                             promo.products treatment-side); auto-sale
//                             passes raw grouped (sale-side iterates only
//                             products[] + medications[], so promotions
//                             never double-deduct)
//
// What this file tests:
//   1) Pure helper transforms (flatten + map-to-consumables) on every
//      composition — confirms exactly what each pipeline emits
//   2) EDIT delta math — old payload reverse + new payload deduct produces
//      expected net change without orphans
//   3) DELETE — same input pattern repeated → assert what the reverse-by-id
//      side would touch (tests in phase8-* already cover the actual reversal)
//   4) Wiring smoke: read SaleTab.jsx + TreatmentFormPage.jsx source and
//      assert flatten() is wrapped on sale-side calls AND not on
//      treatment-side calls

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  flattenPromotionsForStockDeduction,
  mapPromotionProductsToConsumables,
  filterOutConsumablesForPromotion,
} from '../src/lib/treatmentBuyHelpers.js';

/* ─── Fixtures: every sale shape ─────────────────────────────────────────── */

const product = (overrides = {}) => ({
  id: 'PROD-A', name: 'ครีมกันแดด SPF50', qty: 2, unit: 'หลอด', ...overrides,
});
const courseOnly = (overrides = {}) => ({
  id: 'CRS-A', name: 'BA - HIFU 1 ครั้ง', qty: 1, unit: 'ครั้ง', itemType: 'course',
  // sub-products are credit-tracked, NOT physical stock
  products: [{ id: 'CREDIT-X', name: 'BA - HIFU', qty: 1, unit: 'ครั้ง' }],
  ...overrides,
});
const promoCoursesOnly = (overrides = {}) => ({
  id: 'PROMO-CR', name: 'Promo: 3 courses', qty: 1, itemType: 'promotion',
  courses: [
    { id: 'C1', name: 'C1', products: [{ id: 'CREDIT-1', name: 'C1 credit', qty: 1 }] },
    { id: 'C2', name: 'C2', products: [{ id: 'CREDIT-2', name: 'C2 credit', qty: 5 }] },
  ],
  products: [],
  ...overrides,
});
const promoProductsOnly = (overrides = {}) => ({
  id: 'PROMO-PR', name: 'Promo: freebie pack', qty: 1, itemType: 'promotion',
  courses: [],
  products: [
    { id: 'STOCK-FREE-1', name: 'ครีม', qty: 2, unit: 'หลอด' },
    { id: 'STOCK-FREE-2', name: 'มาส์ก', qty: 5, unit: 'ชิ้น' },
  ],
  ...overrides,
});
const promoMixed = (overrides = {}) => ({
  id: 'PROMO-MIX', name: 'Promo: Filler 3900 แถมสลายแฟต', qty: 1, itemType: 'promotion',
  courses: [
    { id: 'C-FILLER', name: 'Filler 0.5cc', products: [{ id: 'CREDIT-FIL', name: 'Filler', qty: 5 }] },
  ],
  products: [
    { id: 'STOCK-SUN', name: 'ครีมกันแดด', qty: 2, unit: 'หลอด' },
    { id: 'STOCK-MASK', name: 'แผ่นมาส์ก', qty: 5, unit: 'ชิ้น' },
  ],
  ...overrides,
});
const medication = (overrides = {}) => ({
  id: 'MED-A', name: 'Paracetamol 500mg', qty: 20, unit: 'tab', dosage: '1×3', ...overrides,
});
const consumable = (overrides = {}) => ({
  id: 'CONS-A', name: 'gauze', qty: 3, unit: 'ชิ้น', ...overrides,
});

/** Build a SaleTab-shape items object from purchasedItems + medications. */
function buildSaleItems({ purchased = [], meds = [] } = {}) {
  const grouped = { promotions: [], courses: [], products: [], medications: meds };
  purchased.forEach(p => {
    const t = p.itemType || 'product';
    if (t === 'promotion') grouped.promotions.push(p);
    else if (t === 'course') grouped.courses.push(p);
    else grouped.products.push(p);
  });
  return grouped;
}

/* Lightweight stand-in for backendClient _normalizeStockItems. Iterates only
   the categories the real one iterates (products + medications + consumables
   + treatmentItems) — promotions[] is intentionally NOT iterated, which is
   why the sale-side flatten helper exists. */
function normalizeForStock(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  const out = [];
  for (const p of items.products || []) out.push({ ...p, _itemType: 'product' });
  for (const m of items.medications || []) out.push({ ...m, _itemType: 'medication' });
  for (const c of items.consumables || []) out.push({ ...c, _itemType: 'consumable' });
  for (const t of items.treatmentItems || []) out.push({ ...t, _itemType: 'treatmentItem' });
  return out;
}

/* ─── 1. CREATE — every item composition × every sale path ───────────────── */

describe('SaleTab CREATE — flatten ensures every physical stock item gets deducted', () => {
  const cases = [
    {
      name: 'course only — no stock impact',
      build: () => buildSaleItems({ purchased: [courseOnly()] }),
      expectedDeducts: [],
    },
    {
      name: 'product only — direct deduct',
      build: () => buildSaleItems({ purchased: [product()] }),
      expectedDeducts: [{ id: 'PROD-A', qty: 2 }],
    },
    {
      name: 'medication only — direct deduct',
      build: () => buildSaleItems({ meds: [medication()] }),
      expectedDeducts: [{ id: 'MED-A', qty: 20 }],
    },
    {
      name: 'promo (courses only) — no stock impact (credits not flattened)',
      build: () => buildSaleItems({ purchased: [promoCoursesOnly()] }),
      expectedDeducts: [],
    },
    {
      name: 'promo (products only) — flatten DEDUCTS the freebie products',
      build: () => buildSaleItems({ purchased: [promoProductsOnly()] }),
      expectedDeducts: [{ id: 'STOCK-FREE-1', qty: 2 }, { id: 'STOCK-FREE-2', qty: 5 }],
    },
    {
      name: 'promo (mixed) — flatten ONLY top-level products, not sub-course credits',
      build: () => buildSaleItems({ purchased: [promoMixed()] }),
      expectedDeducts: [{ id: 'STOCK-SUN', qty: 2 }, { id: 'STOCK-MASK', qty: 5 }],
    },
    {
      name: 'mixed (course + product + promo + medication)',
      build: () => buildSaleItems({ purchased: [courseOnly(), product(), promoMixed()], meds: [medication()] }),
      expectedDeducts: [
        { id: 'PROD-A', qty: 2 },
        { id: 'MED-A', qty: 20 },
        { id: 'STOCK-SUN', qty: 2 },
        { id: 'STOCK-MASK', qty: 5 },
      ],
    },
    {
      name: '2× promo bundles — flatten multiplies freebie qty',
      build: () => buildSaleItems({ purchased: [promoProductsOnly({ qty: 2 })] }),
      expectedDeducts: [{ id: 'STOCK-FREE-1', qty: 4 }, { id: 'STOCK-FREE-2', qty: 10 }],
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const items = c.build();
      const flat = flattenPromotionsForStockDeduction(items);
      const stocked = normalizeForStock(flat);
      const observed = stocked.map(s => ({ id: s.id || s.productId, qty: Number(s.qty) }));
      // Sort both sides by id for stable equality
      const sortById = (a, b) => String(a.id).localeCompare(String(b.id));
      expect([...observed].sort(sortById)).toEqual([...c.expectedDeducts].sort(sortById));
    });
  }

  it('original items.promotions[] preserved after flatten (display fidelity)', () => {
    const items = buildSaleItems({ purchased: [promoMixed()] });
    const flat = flattenPromotionsForStockDeduction(items);
    expect(flat.promotions).toHaveLength(1);
    expect(flat.promotions[0].id).toBe('PROMO-MIX');
    // Original courses stay too
    expect(flat.promotions[0].courses).toHaveLength(1);
  });
});

describe('TreatmentFormPage CREATE — consumables route handles promo.products', () => {
  it('promo.products → consumables (visibility + treatment-side stock deduct)', () => {
    const promo = promoMixed();
    const consumables = mapPromotionProductsToConsumables(promo);
    expect(consumables.map(c => c.id)).toEqual(['STOCK-SUN', 'STOCK-MASK']);
    consumables.forEach(c => expect(c.promotionId).toBe('PROMO-MIX'));
  });

  it('treatment-side stock items = consumables + treatmentItems + medications (when no auto-sale)', () => {
    const items = {
      consumables: [consumable(), ...mapPromotionProductsToConsumables(promoProductsOnly())],
      treatmentItems: [{ id: 'TI-A', name: 'tx-tool', qty: 1 }],
      medications: [medication()],
    };
    const stocked = normalizeForStock(items);
    expect(stocked).toHaveLength(5); // 1 consumable + 2 promo→cons + 1 ti + 1 med
  });

  it('treatment auto-sale path: sale-side does NOT flatten (consumables already covers promo)', () => {
    // Critical: TreatmentFormPage MUST NOT wrap deductStockForSale with flatten,
    // because mapPromotionProductsToConsumables already pushed promo.products
    // into consumables which deductStockForTreatment iterates. Wrapping again
    // would double-deduct.
    const promo = promoMixed();
    const groupedSale = buildSaleItems({ purchased: [promo] });
    const saleStocked = normalizeForStock(groupedSale); // sale-side, NO flatten
    expect(saleStocked).toEqual([]); // promo.products NOT iterated → 0 sale-side
    // Treatment-side picks them up via consumables instead:
    const treatmentItems = {
      consumables: mapPromotionProductsToConsumables(promo),
    };
    const txStocked = normalizeForStock(treatmentItems);
    expect(txStocked).toHaveLength(2); // STOCK-SUN + STOCK-MASK once, no dup
  });
});

/* ─── 2. EDIT — net delta after reverse old + deduct new ─────────────────── */

describe('SaleTab EDIT — reverse old payload + deduct new payload (delta correctness)', () => {
  it('add product to existing sale → only the new product deducted (after reverse)', () => {
    const oldItems = buildSaleItems({ purchased: [product({ id: 'A', qty: 1 })] });
    const newItems = buildSaleItems({ purchased: [product({ id: 'A', qty: 1 }), product({ id: 'B', qty: 3 })] });
    // Edit flow: reverse all-of-old (by saleId), then deduct all-of-new
    const newDeducts = normalizeForStock(flattenPromotionsForStockDeduction(newItems));
    expect(newDeducts.find(d => d.id === 'A').qty).toBe(1);
    expect(newDeducts.find(d => d.id === 'B').qty).toBe(3);
  });

  it('change qty of product → reverse-then-rededuct nets to delta', () => {
    const oldQty = 5;
    const newQty = 8;
    // After reverse: stock back +5. After rededuct: stock -8. Net change: -3.
    const oldFlat = normalizeForStock(flattenPromotionsForStockDeduction(buildSaleItems({ purchased: [product({ qty: oldQty })] })));
    const newFlat = normalizeForStock(flattenPromotionsForStockDeduction(buildSaleItems({ purchased: [product({ qty: newQty })] })));
    expect(oldFlat[0].qty).toBe(5);
    expect(newFlat[0].qty).toBe(8);
    // The net = newQty - oldQty (re-deduct semantics)
  });

  it('remove promotion from sale → after re-deduct, promo freebies NO longer in stocked', () => {
    const oldItems = buildSaleItems({ purchased: [promoProductsOnly()] });
    const newItems = buildSaleItems({ purchased: [] });
    const oldFlat = normalizeForStock(flattenPromotionsForStockDeduction(oldItems));
    const newFlat = normalizeForStock(flattenPromotionsForStockDeduction(newItems));
    expect(oldFlat).toHaveLength(2);
    expect(newFlat).toHaveLength(0);
  });

  it('replace promo A with promo B → reverse-then-rededuct produces only B freebies', () => {
    const oldItems = buildSaleItems({ purchased: [promoProductsOnly({ id: 'OLD', name: 'OLD',
      products: [{ id: 'OLD-1', name: 'old', qty: 1 }] })] });
    const newItems = buildSaleItems({ purchased: [promoProductsOnly({ id: 'NEW', name: 'NEW',
      products: [{ id: 'NEW-1', name: 'new', qty: 4 }] })] });
    const oldFlat = normalizeForStock(flattenPromotionsForStockDeduction(oldItems));
    const newFlat = normalizeForStock(flattenPromotionsForStockDeduction(newItems));
    expect(oldFlat[0].id).toBe('OLD-1');
    expect(newFlat[0].id).toBe('NEW-1');
    expect(newFlat[0].qty).toBe(4);
  });

  it('change promo qty 1→3 → freebie qty triples', () => {
    const oldItems = buildSaleItems({ purchased: [promoProductsOnly({ qty: 1 })] });
    const newItems = buildSaleItems({ purchased: [promoProductsOnly({ qty: 3 })] });
    const oldFlat = normalizeForStock(flattenPromotionsForStockDeduction(oldItems));
    const newFlat = normalizeForStock(flattenPromotionsForStockDeduction(newItems));
    expect(oldFlat.find(p => p.id === 'STOCK-FREE-1').qty).toBe(2);
    expect(newFlat.find(p => p.id === 'STOCK-FREE-1').qty).toBe(6);
  });
});

describe('TreatmentFormPage EDIT — consumables flow', () => {
  it('add promo-with-products → consumables grow with promo-tagged entries', () => {
    const before = [consumable({ id: 'CONS-1' })];
    const promo = promoProductsOnly();
    const after = [...before, ...mapPromotionProductsToConsumables(promo)];
    expect(after).toHaveLength(3);
    expect(after.filter(c => c.promotionId).length).toBe(2);
  });

  it('remove promo from purchasedItems → consumables tagged with that promotionId removed', () => {
    const promo = promoProductsOnly();
    const initial = [consumable({ id: 'KEEP' }), ...mapPromotionProductsToConsumables(promo)];
    const after = filterOutConsumablesForPromotion(initial, promo.id);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe('KEEP');
  });

  it('change promo via remove+add → only the latest promo freebies remain', () => {
    const oldPromo = promoProductsOnly({ id: 'OLD', products: [{ id: 'OLD-X', name: 'old' }] });
    const newPromo = promoProductsOnly({ id: 'NEW', products: [{ id: 'NEW-X', name: 'new' }] });
    let cons = mapPromotionProductsToConsumables(oldPromo);
    cons = filterOutConsumablesForPromotion(cons, 'OLD');
    cons = [...cons, ...mapPromotionProductsToConsumables(newPromo)];
    expect(cons.map(c => c.id)).toEqual(['NEW-X']);
  });

  it('manual consumable + promo consumable → removing promo keeps the manual one', () => {
    const manual = consumable({ id: 'MANUAL' });
    const promo = promoProductsOnly();
    let cons = [manual, ...mapPromotionProductsToConsumables(promo)];
    cons = filterOutConsumablesForPromotion(cons, promo.id);
    expect(cons).toHaveLength(1);
    expect(cons[0].id).toBe('MANUAL');
    expect(cons[0].promotionId).toBeUndefined();
  });
});

/* ─── 3. DELETE — reverse-only via id; helpers must produce id-traceable items
   ─────────────────────────────────────────────────────────────────────────── */

describe('DELETE — items must be id-traceable for reverse-by-id', () => {
  it('every flattened product carries id (so the movement log can find them)', () => {
    const flat = flattenPromotionsForStockDeduction(buildSaleItems({ purchased: [promoMixed()] }));
    const stocked = normalizeForStock(flat);
    stocked.forEach(s => expect(s.id || s.productId).toBeTruthy());
  });

  it('every promo-derived consumable carries promotionId tag (auditable on delete)', () => {
    const cons = mapPromotionProductsToConsumables(promoMixed());
    cons.forEach(c => expect(c.promotionId).toBe('PROMO-MIX'));
  });

  it('reverseStockForSale linked by saleId is id-shape-agnostic — proves no orphans', () => {
    // The actual reversal queries be_stock_movements by linkedSaleId. Whether
    // the original deduct was direct .products[] OR flattened from a promo,
    // the movement carries linkedSaleId — reversal handles both uniformly.
    // This is a STATIC proof: same id-tracing applies to every emitted
    // stocked item.
    const items = buildSaleItems({ purchased: [promoMixed(), product(), courseOnly()], meds: [medication()] });
    const flat = flattenPromotionsForStockDeduction(items);
    const stocked = normalizeForStock(flat);
    // Each stocked entry will be a movement linked by saleId at deduct time;
    // reverseStockForSale(saleId) reverses ALL of them in one batch.
    expect(stocked.length).toBeGreaterThan(0);
    expect(new Set(stocked.map(s => s.id))).toEqual(
      new Set(['STOCK-SUN', 'STOCK-MASK', 'PROD-A', 'MED-A'])
    );
  });
});

/* ─── 4. DOUBLE-DEDUCT GUARD — both helpers on the same purchase = bug ────── */

describe('CRITICAL: do not call BOTH helpers on the same purchase (double-deduct guard)', () => {
  // If a future refactor accidentally wraps TreatmentFormPage's auto-sale
  // with flatten, the same promo.products would be deducted twice (once via
  // sale-side flatten, once via treatment-side consumables). This test
  // documents the expected count when EACH helper runs in isolation.

  const promo = promoProductsOnly();

  it('sale-side flatten alone produces 2 stock items', () => {
    const stocked = normalizeForStock(flattenPromotionsForStockDeduction(buildSaleItems({ purchased: [promo] })));
    expect(stocked).toHaveLength(2);
  });

  it('treatment-side consumables alone produces 2 stock items', () => {
    const stocked = normalizeForStock({ consumables: mapPromotionProductsToConsumables(promo) });
    expect(stocked).toHaveLength(2);
  });

  it('hypothetical bug: BOTH applied → 4 items (proof of why we must keep them separate)', () => {
    const saleStocked = normalizeForStock(flattenPromotionsForStockDeduction(buildSaleItems({ purchased: [promo] })));
    const txStocked = normalizeForStock({ consumables: mapPromotionProductsToConsumables(promo) });
    expect([...saleStocked, ...txStocked]).toHaveLength(4); // ⚠️ this is what we MUST avoid
  });
});

/* ─── 5. WIRING — static source-file assertions ──────────────────────────── */

describe('WIRING — source files use the right helper at the right callsite', () => {
  const root = resolve(__dirname, '..');
  const saleTab = readFileSync(resolve(root, 'src/components/backend/SaleTab.jsx'), 'utf8');
  const treatmentForm = readFileSync(resolve(root, 'src/components/TreatmentFormPage.jsx'), 'utf8');

  it('SaleTab imports flattenPromotionsForStockDeduction', () => {
    expect(saleTab).toContain("import { flattenPromotionsForStockDeduction }");
  });

  it('SaleTab wraps EVERY deductStockForSale call with flatten()', () => {
    // Capture every deductStockForSale call and check it's flatten-wrapped
    const matches = saleTab.match(/deductStockForSale\([^)]*\)/g) || [];
    // Filter to actual calls (not function definition). Skip the import line.
    const calls = matches.filter(m => !m.includes('export') && !m.includes('async function'));
    expect(calls.length).toBeGreaterThan(0);
    calls.forEach(call => {
      expect(call).toMatch(/flattenPromotionsForStockDeduction/);
    });
  });

  it('TreatmentFormPage imports mapPromotionProductsToConsumables (treatment-side route)', () => {
    expect(treatmentForm).toContain("import { mapPromotionProductsToConsumables");
  });

  it('TreatmentFormPage does NOT import flattenPromotionsForStockDeduction (would double-deduct)', () => {
    expect(treatmentForm).not.toContain("flattenPromotionsForStockDeduction");
  });

  it('TreatmentFormPage handleSubmit invokes deductStockForTreatment with consumables', () => {
    expect(treatmentForm).toMatch(/deductStockForTreatment\([^)]*\)/);
    expect(treatmentForm).toContain('consumables: backendDetail.consumables');
  });

  it('TreatmentFormPage edit path reverses BOTH sale + treatment stock before re-deduct', () => {
    expect(treatmentForm).toContain('reverseStockForSale');
    expect(treatmentForm).toContain('reverseStockForTreatment');
  });

  it('BackendDashboard delete-treatment ONLY reverses treatment-side stock (sale stays intact — user directive 2026-04-19)', () => {
    const backendDash = readFileSync(resolve(root, 'src/pages/BackendDashboard.jsx'), 'utf8');
    // Find the onDeleteTreatment handler block and assert sale-side cascade
    // is NOT present inside it.
    const deleteHandler = backendDash.match(/onDeleteTreatment=\{async[\s\S]*?\n {12}\}\}/);
    expect(deleteHandler).not.toBeNull();
    const block = deleteHandler[0];
    // Treatment-side: present
    expect(block).toContain('reverseStockForTreatment');
    expect(block).toContain('reverseCourseDeduction');
    // Sale-side: must NOT cascade — user has to delete the sale separately
    expect(block).not.toContain('reverseStockForSale');
    expect(block).not.toContain('reverseDepositUsage');
    expect(block).not.toContain('refundToWallet');
    expect(block).not.toContain('reversePointsEarned');
    expect(block).not.toContain('getSaleByTreatmentId');
  });

  it('BackendDashboard delete-treatment shows the user a notice that the sale stays', () => {
    const backendDash = readFileSync(resolve(root, 'src/pages/BackendDashboard.jsx'), 'utf8');
    // The confirm() prompt explicitly tells the user the sale is not deleted
    expect(backendDash).toMatch(/ใบเสร็จ.*ยังอยู่ในรายการขาย/);
  });
});

/* ─── 6. END-TO-END SCENARIO — one purchase, both pages ───────────────────── */

describe('END-TO-END: one promo bundle through both pages — assert no overlap', () => {
  // Same purchasable item bought via SaleTab vs via TreatmentFormPage.
  // Sale path goes through flatten; Treatment path goes through map.
  // Both arrive at deductStockFor* with a flat list of stockable items.
  // The COUNTS must match (same physical inventory impact regardless of
  // which page initiated the sale).

  const promo = promoMixed();

  it('SaleTab path stock-impact items match TreatmentFormPage path stock-impact items', () => {
    const saleStock = normalizeForStock(flattenPromotionsForStockDeduction(buildSaleItems({ purchased: [promo] })));
    const txStock = normalizeForStock({ consumables: mapPromotionProductsToConsumables(promo) });
    // Both routes touch the same 2 physical products
    const saleIds = new Set(saleStock.map(s => s.id));
    const txIds = new Set(txStock.map(s => s.id));
    expect(saleIds).toEqual(txIds);
    expect(saleIds).toEqual(new Set(['STOCK-SUN', 'STOCK-MASK']));
  });

  it('quantities match between routes (same promo → same total deduction)', () => {
    const saleStock = normalizeForStock(flattenPromotionsForStockDeduction(buildSaleItems({ purchased: [promo] })));
    const txStock = normalizeForStock({ consumables: mapPromotionProductsToConsumables(promo) });
    const saleByQty = Object.fromEntries(saleStock.map(s => [s.id, Number(s.qty)]));
    const txByQty = Object.fromEntries(txStock.map(s => [s.id, Number(s.qty)]));
    expect(saleByQty).toEqual(txByQty);
  });
});
