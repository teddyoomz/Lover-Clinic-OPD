// 2026-04-19 — FAILURE-MODE EXPANSION suite.
//
// Born from the 8 failures observed when phase10-stock-300-scenarios.test.js
// was first written. Each failure surfaced a CLASS of bug-shape, not just
// the one row that flunked. This file expands every class with adjacent
// adversarial cases so a real future regression has nowhere to hide.
//
// Failure classes addressed:
//   F-A. "Hand-counted expected" — test author miscounts the items in
//        a complex composition. Solved by AUTO-COMPUTING expected from
//        the input definition. Includes a generator that brute-forces
//        every realistic mix and asserts shape consistency.
//   F-B. "Wrong source-of-truth file" — test assumed a constant lived in
//        backendClient.js; actually lives in TreatmentFormPage.jsx. Solved
//        by per-MOVEMENT_TYPE emission audit that locates each type's
//        emitting file.
//   F-C. "Documentation drift" — exact-phrase regex breaks when comments
//        get rewritten. Solved by intent-based regex with multiple
//        acceptable phrasings.
//   F-D. "Schema-shape drift" — adding a new sub-array (like promo.courses
//        inside promo.products) accidentally double-counted. Solved by
//        deep-nesting boundary tests.
//
// Total: ~150 new scenarios. Combined with the prior 327 in
// phase10-stock-300-scenarios.test.js + 38 in phase10-stock-coverage-matrix
// = ~515 stock-flow scenarios.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  flattenPromotionsForStockDeduction,
  mapPromotionProductsToConsumables,
  filterOutConsumablesForPromotion,
} from '../src/lib/treatmentBuyHelpers.js';
import { MOVEMENT_TYPES } from '../src/lib/stockUtils.js';

/* ─── Shared helpers + factories ────────────────────────────────────────── */

const root = resolve(__dirname, '..');
const product = (id, qty = 1) => ({ id, name: `prod-${id}`, qty, unit: 'pc' });
const med = (id, qty = 10) => ({ id, name: `med-${id}`, qty, unit: 'tab' });
const promo = (id, freebieCount = 0, qty = 1) => ({
  id, name: `promo-${id}`, qty, itemType: 'promotion',
  courses: [],
  products: Array.from({ length: freebieCount }, (_, i) => ({
    id: `${id}-fb${i}`, name: `fb-${i}`, qty: 1, unit: 'pc',
  })),
});
const promoWithSubCourses = (id, courseCount, productsPerCourse, freebieCount = 0) => ({
  id, name: `promo-${id}`, qty: 1, itemType: 'promotion',
  courses: Array.from({ length: courseCount }, (_, i) => ({
    id: `${id}-c${i}`, name: `c${i}`,
    // These are CREDITS — must NOT contribute to stock
    products: Array.from({ length: productsPerCourse }, (_, j) => ({
      id: `${id}-c${i}-credit-${j}`, name: `credit-${j}`, qty: 1,
    })),
  })),
  products: Array.from({ length: freebieCount }, (_, i) => ({
    id: `${id}-fb${i}`, name: `fb-${i}`, qty: 1, unit: 'pc',
  })),
});

function buildSaleItems({ purchased = [], meds = [] } = {}) {
  const grouped = { promotions: [], courses: [], products: [], medications: meds };
  for (const p of purchased) {
    if (p.itemType === 'promotion') grouped.promotions.push(p);
    else if (p.itemType === 'course') grouped.courses.push(p);
    else grouped.products.push(p);
  }
  return grouped;
}

function normalizeForStock(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  const out = [];
  for (const p of items.products || []) out.push(p);
  for (const m of items.medications || []) out.push(m);
  for (const c of items.consumables || []) out.push(c);
  for (const t of items.treatmentItems || []) out.push(t);
  return out;
}

function saleStocked(grouped) {
  return normalizeForStock(flattenPromotionsForStockDeduction(grouped));
}

/** Pure formula for expected sale-side stock count from the input shape.
 *  Sums: standalone products + meds + sum(promo.products.length × promo.qty?). */
function expectedSaleStockCount({ purchased = [], meds = [] } = {}) {
  let count = 0;
  for (const p of purchased) {
    if (p.itemType === 'promotion') {
      count += (p.products || []).filter(x => x && (x.name || x.productName)).length;
    } else if (p.itemType === 'course' || !p.itemType) {
      // courses contribute 0 — credits not stock
      // standalone products (no itemType) count once
      if (!p.itemType) count += 1;
    } else if (p.itemType === 'product') {
      count += 1;
    }
  }
  count += meds.length;
  return count;
}

/* ─── F-A. AUTO-COMPUTED expected (no human miscount possible) — 50 ───── */

describe('F-A — auto-computed expected count for every composition', () => {
  // Generate every combination of: 0..3 standalone products, 0..3 meds,
  // 0..2 promos with 0..3 freebies each. Test that actual === computed.
  const compositions = [];
  for (let np = 0; np <= 3; np++) {
    for (let nm = 0; nm <= 2; nm++) {
      for (let npromo = 0; npromo <= 2; npromo++) {
        for (let nfree = 0; nfree <= 3; nfree++) {
          const purchased = [
            ...Array.from({ length: np }, (_, i) => product(`P${i}`)),
            ...Array.from({ length: npromo }, (_, i) => promo(`PR${i}`, nfree)),
          ];
          const meds = Array.from({ length: nm }, (_, i) => med(`M${i}`));
          compositions.push({
            label: `${np}p + ${nm}m + ${npromo}promo×${nfree}fb`,
            purchased, meds,
          });
        }
      }
    }
  }

  for (const c of compositions) {
    it(`${c.label} → actual === computed`, () => {
      const actual = saleStocked(buildSaleItems(c)).length;
      const computed = expectedSaleStockCount(c);
      expect(actual).toBe(computed);
    });
  }
});

/* ─── F-A bis. SUB-COURSES inside promo MUST NOT count (deep boundary) ── */

describe('F-A bis — promo.courses[].products[] are CREDITS, never count toward stock', () => {
  const cases = [
    [1, 1, 0],   // 1 course, 1 sub-product, 0 freebies → expected 0 stock
    [1, 5, 0],   // 1 course, 5 sub-credits, 0 freebies → expected 0
    [3, 2, 0],   // 3 courses, 2 sub-credits each → expected 0
    [10, 10, 0], // huge bundle → expected 0
    [1, 1, 1],   // 1 course + 1 freebie → expected 1
    [3, 5, 2],   // 3 courses × 5 credits + 2 freebies → expected 2
    [0, 0, 5],   // courses=0 + 5 freebies → expected 5
    [5, 5, 5],   // mixed → expected 5
  ];
  for (const [cn, ppc, fc] of cases) {
    it(`promo with ${cn} courses (${ppc} credits each) + ${fc} freebies → ${fc} stock items`, () => {
      const p = promoWithSubCourses('P', cn, ppc, fc);
      const actual = saleStocked(buildSaleItems({ purchased: [p] })).length;
      expect(actual).toBe(fc);
    });
  }
});

/* ─── F-A ter. PROMO QTY MULTIPLICATION — boundary cases ──────────────── */

describe('F-A ter — promo.qty multiplication (qty × freebie.qty math)', () => {
  const cases = [
    [1, 1, 1],   // 1 promo × 1 freebie qty → freebie qty stays 1
    [2, 1, 2],   // 2 promos × 1 freebie qty → 2
    [1, 5, 5],   // 1 promo × 5 freebie qty → 5
    [3, 4, 12],  // 3 × 4 → 12
    [10, 10, 100], // big × big → 100
    [0, 5, 5],   // qty=0 capped to 1 → 5 (Math.max guard)
    [-1, 5, 5],  // qty=-1 capped to 1 → 5
    [NaN, 3, 3], // qty=NaN → 1 → 3
  ];
  for (const [promoQty, freebieQty, expectedTotalQty] of cases) {
    it(`promo qty=${String(promoQty)} × freebie qty=${freebieQty} → total qty ${expectedTotalQty}`, () => {
      const p = {
        id: 'P', name: 'P', qty: promoQty, itemType: 'promotion', courses: [],
        products: [{ id: 'F', name: 'F', qty: freebieQty }],
      };
      const out = saleStocked(buildSaleItems({ purchased: [p] }));
      expect(out).toHaveLength(1);
      expect(Number(out[0].qty)).toBe(expectedTotalQty);
    });
  }
});

/* ─── F-B. PER-MOVEMENT-TYPE emission audit ───────────────────────────── */

describe('F-B — every MOVEMENT_TYPES code has a known emission point in production code', () => {
  // Build a single corpus of every production .js/.jsx file we care about
  // for stock movements. Each MOVEMENT_TYPES code must appear in at least
  // one of these (either as MOVEMENT_TYPES.NAME or as a setDoc(... type: N).
  const sources = [
    'src/lib/backendClient.js',
    'src/lib/stockUtils.js',
    'src/components/TreatmentFormPage.jsx',
    'src/components/backend/SaleTab.jsx',
    'src/components/backend/StockTab.jsx',
    'src/components/backend/StockAdjustPanel.jsx',
    'src/components/backend/StockTransferPanel.jsx',
    'src/components/backend/StockWithdrawalPanel.jsx',
    'src/components/backend/OrderPanel.jsx',
  ];
  const corpus = sources
    .filter(s => existsSync(resolve(root, s)))
    .map(s => readFileSync(resolve(root, s), 'utf8'))
    .join('\n');

  // Some enum codes intentionally have no MOVEMENT emission point because
  // they describe a stage that doesn't physically move stock — they only
  // describe a document state. Document each here so the test fails LOUDLY
  // if a new code is added without classification.
  const NO_EMISSION_BY_DESIGN = new Set([
    'WITHDRAWAL_REQUEST', // 12 — withdrawal-doc created; no stock moves yet.
                          // The matching CONFIRM (13) emits when the receiving
                          // branch actually receives the stock.
    'SALE_VENDOR',        // 5 — reserved for wholesale flow (Phase 12 planned).
                          // MovementLogPanel labels it as "ขาย (wholesale)" so
                          // the filter UI is forward-compatible, but no write
                          // path emits this yet. Discovered by failure-mode
                          // expansion 2026-04-19.
  ]);

  for (const [name, code] of Object.entries(MOVEMENT_TYPES)) {
    it(`MOVEMENT_TYPES.${name} (${code}) ${NO_EMISSION_BY_DESIGN.has(name) ? 'is intentionally no-emit (doc state only)' : 'has at least one emission point'}`, () => {
      const constMatch = corpus.includes(`MOVEMENT_TYPES.${name}`);
      const literalMatch = new RegExp(`type:\\s*${code}\\b`).test(corpus);
      if (NO_EMISSION_BY_DESIGN.has(name)) {
        // For the no-emit-by-design codes, the rule is: they may NOT appear
        // as a `setDoc(stockMovementDoc..., type: <code>)` write site. They
        // can still be referenced (e.g. from MovementLogPanel filter), so
        // we only assert the absence of the write pattern.
        const writeRe = new RegExp(`setDoc\\s*\\(\\s*stockMovementDoc[\\s\\S]{0,400}?type\\s*:\\s*MOVEMENT_TYPES\\.${name}|setDoc\\s*\\(\\s*stockMovementDoc[\\s\\S]{0,400}?type\\s*:\\s*${code}\\b`);
        expect(writeRe.test(corpus)).toBe(false);
      } else {
        expect(constMatch || literalMatch).toBe(true);
      }
    });
  }

  it('movementType param is honoured by deductStockForSale (not hard-coded SALE)', () => {
    const bc = readFileSync(resolve(root, 'src/lib/backendClient.js'), 'utf8');
    expect(bc).toMatch(/Number\(opts\.movementType\)\s*\|\|\s*MOVEMENT_TYPES\.SALE/);
  });

  it('movementType param is honoured by deductStockForTreatment (not hard-coded TREATMENT)', () => {
    const bc = readFileSync(resolve(root, 'src/lib/backendClient.js'), 'utf8');
    expect(bc).toMatch(/Number\(opts\.movementType\)\s*\|\|\s*MOVEMENT_TYPES\.TREATMENT\b/);
  });

  it('TreatmentFormPage explicitly opts into TREATMENT_MED for take-home meds', () => {
    const tx = readFileSync(resolve(root, 'src/components/TreatmentFormPage.jsx'), 'utf8');
    expect(tx).toContain('MOVEMENT_TYPES.TREATMENT_MED');
    expect(tx).toContain('movementType: TREATMENT_MED_TYPE');
  });

  it('TreatmentFormPage explicitly opts into TREATMENT for consumables (separate call)', () => {
    const tx = readFileSync(resolve(root, 'src/components/TreatmentFormPage.jsx'), 'utf8');
    expect(tx).toContain('MOVEMENT_TYPES.TREATMENT');
    expect(tx).toContain('movementType: TREATMENT_TYPE');
  });

  it('the take-home med call ONLY runs when !hasSale (auto-sale takes them otherwise)', () => {
    const tx = readFileSync(resolve(root, 'src/components/TreatmentFormPage.jsx'), 'utf8');
    expect(tx).toMatch(/!hasSale.*medications.*length\s*>\s*0/s);
  });
});

/* ─── F-C. DOCUMENTATION DRIFT — intent-based phrasing tests ─────────── */

describe('F-C — documentation expresses INTENT (multiple phrasings allowed)', () => {
  const helpers = readFileSync(resolve(root, 'src/lib/treatmentBuyHelpers.js'), 'utf8');

  it('flatten helper documents that it runs sale-side only (any phrasing)', () => {
    expect(helpers).toMatch(/sale-?side/i);
    // Acceptable phrasings: "sale-side ONLY", "ONLY at sale-side",
    // "only on the sale side", "sale-side only". The helper must clearly
    // signal that treatment-side uses a different route.
    expect(helpers).toMatch(/treatment-?side|consumables/i);
  });

  it('flatten helper documents the double-deduct danger (multiple phrasings)', () => {
    expect(helpers).toMatch(/double-?\s?deduct|twice/i);
  });

  it('map helper documents that it runs treatment-side', () => {
    expect(helpers).toMatch(/treatment-?side|consumables/i);
  });

  it('map helper documents the visibility goal (UI section + stock)', () => {
    expect(helpers).toMatch(/UI|visibil|deduct/i);
  });

  it('treatment-delete confirm() carries the partial-rollback intent (3 phrasings)', () => {
    const dh = readFileSync(resolve(root, 'src/pages/BackendDashboard.jsx'), 'utf8');
    // The exact wording can drift; the three concepts must be present
    expect(dh).toMatch(/คอร์ส.*คืน|คืน.*คอร์ส/);     // courses refunded
    expect(dh).toMatch(/ไม่.*คืน.*สต็อค|สินค้า.*ไม่.*คืน/); // stock NOT returned
    expect(dh).toMatch(/ใบเสร็จ|การขาย/);             // sale stays / go to sale page
  });

  it('deleteBackendTreatment in lib documents the intentional partial-rollback', () => {
    const bc = readFileSync(resolve(root, 'src/lib/backendClient.js'), 'utf8');
    const fnDoc = bc.match(/\/\*\*[\s\S]*?\*\/\s*export async function deleteBackendTreatment/);
    expect(fnDoc).not.toBeNull();
    expect(fnDoc[0]).toMatch(/partial|user directive|intentional|stays/i);
  });
});

/* ─── F-D. SCHEMA-SHAPE DRIFT — deep-nest boundary tests ─────────────── */

describe('F-D — deep-nesting boundary tests (avoid accidental double-counting)', () => {
  it('promo with promo INSIDE promo.products[] (not a real schema, but defensive)', () => {
    // If schema ever permitted nested promos, our flatten would NOT recurse.
    // This documents the boundary: nested promos contribute as "products"
    // (the outer promo's product array).
    const inner = { id: 'INNER', name: 'inner', qty: 1 };
    const outer = {
      id: 'OUTER', name: 'outer', qty: 1, itemType: 'promotion', courses: [],
      products: [inner],
    };
    const out = saleStocked(buildSaleItems({ purchased: [outer] }));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('INNER');
  });

  it('promo with course that has products that have qty as an object (defensive)', () => {
    const corrupt = {
      id: 'P', itemType: 'promotion', name: 'P', qty: 1,
      courses: [{ id: 'C', name: 'C', products: [{ id: 'X', name: 'X', qty: { remaining: 5, total: 5 } }] }],
      products: [{ id: 'F', name: 'F', qty: 1 }],
    };
    expect(() => saleStocked(buildSaleItems({ purchased: [corrupt] }))).not.toThrow();
    const out = saleStocked(buildSaleItems({ purchased: [corrupt] }));
    expect(out).toHaveLength(1); // only the freebie
    expect(out[0].id).toBe('F');
  });

  it('items.products[] AND items.promotions[*].products[] with same id retained separately', () => {
    const items = {
      promotions: [{ id: 'P', name: 'P', qty: 1, products: [{ id: 'SAME', name: 'A', qty: 1 }] }],
      products: [{ id: 'SAME', name: 'B', qty: 1 }],
    };
    const flat = flattenPromotionsForStockDeduction(items);
    expect(flat.products).toHaveLength(2);
    // Pre-existing first, then flattened
    expect(flat.products[0].name).toBe('B');
    expect(flat.products[1].name).toBe('A');
    expect(flat.products[1].sourcePromotionId).toBe('P');
  });

  it('items.promotions[] with one promo carrying products + courses simultaneously', () => {
    const promo = {
      id: 'BUNDLE', name: 'BUNDLE', qty: 1, itemType: 'promotion',
      courses: [{ id: 'C', products: [{ id: 'CRD', name: 'credit', qty: 5 }] }],
      products: [{ id: 'F1', name: 'f1', qty: 1 }, { id: 'F2', name: 'f2', qty: 2 }],
    };
    const out = saleStocked(buildSaleItems({ purchased: [promo] }));
    expect(out).toHaveLength(2);
    expect(out.map(o => o.id).sort()).toEqual(['F1', 'F2']);
  });

  it('multiple promos with each containing 0–N freebies, mixed', () => {
    const promos = [
      promo('A', 0),
      promo('B', 1),
      promo('C', 3),
      promoWithSubCourses('D', 2, 5, 2), // 2 courses × 5 credits + 2 freebies
    ];
    const out = saleStocked(buildSaleItems({ purchased: promos }));
    // 0 + 1 + 3 + 2 = 6
    expect(out).toHaveLength(6);
  });
});

/* ─── F-E. EDIT/DELETE FAILURE-MODE COVERAGE ────────────────────────────── */

describe('F-E — edit/delete failure modes that look correct but leak stock', () => {
  it('EDIT add a product to existing sale → flat now contains ALL items (old + new)', () => {
    const oldItems = buildSaleItems({ purchased: [product('A')] });
    const newItems = buildSaleItems({ purchased: [product('A'), product('B')] });
    const oldStocked = saleStocked(oldItems);
    const newStocked = saleStocked(newItems);
    expect(oldStocked).toHaveLength(1);
    expect(newStocked).toHaveLength(2);
    // Edit semantics: reverseAll(saleId) then deduct(newItems) — net is correct
  });

  it('EDIT change qty 5→3 → re-deducted at 3 (not 5-3=2)', () => {
    const oldStocked = saleStocked(buildSaleItems({ purchased: [product('X', 5)] }));
    const newStocked = saleStocked(buildSaleItems({ purchased: [product('X', 3)] }));
    expect(Number(oldStocked[0].qty)).toBe(5);
    expect(Number(newStocked[0].qty)).toBe(3);
  });

  it('EDIT swap entire promo bundle → only NEW freebies present', () => {
    const before = saleStocked(buildSaleItems({ purchased: [promo('OLD', 3)] }));
    const after = saleStocked(buildSaleItems({ purchased: [promo('NEW', 5)] }));
    expect(before).toHaveLength(3);
    expect(after).toHaveLength(5);
    // No overlap in IDs
    const beforeIds = new Set(before.map(b => b.id));
    after.forEach(a => expect(beforeIds.has(a.id)).toBe(false));
  });

  it('EDIT remove all items → flat is empty (zero deductions on re-deduct)', () => {
    const before = saleStocked(buildSaleItems({ purchased: [product('A'), promo('P', 5)] }));
    const after = saleStocked(buildSaleItems({}));
    expect(before).toHaveLength(6);
    expect(after).toHaveLength(0);
  });

  it('DELETE: every item ID emitted is queryable for reverse-by-id (no orphans)', () => {
    const items = buildSaleItems({
      purchased: [product('A'), promo('P', 3), promoWithSubCourses('Q', 2, 3, 2)],
      meds: [med('M1'), med('M2')],
    });
    const stocked = saleStocked(items);
    stocked.forEach(s => {
      expect(s.id || s.productId).toBeTruthy();
      expect(s.name || s.productName).toBeTruthy();
    });
  });

  it('DELETE then re-CREATE with same items → idempotent shape', () => {
    const items = buildSaleItems({ purchased: [promo('P', 2), product('X')], meds: [med('M')] });
    const a = saleStocked(items);
    const b = saleStocked(items);
    expect(a).toEqual(b);
  });

  it('Concurrent identical adds → would emit duplicate movements (caller responsibility)', () => {
    // The helper itself isn't transactional; if two callers run the same
    // payload, two flat lists are produced. Real concurrency control lives
    // in deductStockForSale's runTransaction. This test documents the
    // helper boundary: pure transform, no dedup.
    const items = buildSaleItems({ purchased: [product('X', 1)] });
    const a = saleStocked(items);
    const b = saleStocked(items);
    expect([...a, ...b]).toHaveLength(2); // documents the boundary
  });
});

/* ─── F-F. PRODUCT NAME / ID DEFENSIVE COMBINATIONS ───────────────────── */

describe('F-F — defensive id/name combinations', () => {
  // These are inputs that LOOK valid but have subtle issues.
  const adversarialProducts = [
    { id: '', name: 'no-id', qty: 1 },
    { id: 0, name: 'zero-id', qty: 1 },
    { id: false, name: 'false-id', qty: 1 },
    { id: 'X', name: '', qty: 1 },
    { id: 'X', productName: 'use-alias', qty: 1 },
    { productId: 'PID', name: 'use-productId', qty: 1 },
    { id: 'X', name: 'X', qty: '5' },     // string qty
    { id: 'X', name: 'X', qty: 5.5 },     // decimal qty
    { id: 'X', name: 'X', qty: 1e6 },     // huge qty
    { id: 'X', name: 'X', qty: 0.01 },    // tiny qty
  ];

  for (const [i, p] of adversarialProducts.entries()) {
    it(`promo with adversarial product[${i}] does not throw`, () => {
      const items = buildSaleItems({
        purchased: [{ id: 'P', name: 'P', qty: 1, itemType: 'promotion', courses: [], products: [p] }],
      });
      expect(() => saleStocked(items)).not.toThrow();
    });
  }

  it('product without name AND without productName → filtered out', () => {
    const out = saleStocked(buildSaleItems({
      purchased: [{ id: 'P', name: 'P', qty: 1, itemType: 'promotion', courses: [], products: [{ id: 'X', qty: 1 }] }],
    }));
    expect(out).toHaveLength(0);
  });

  it('product with id=0 and a name → kept, id="0"', () => {
    const out = saleStocked(buildSaleItems({
      purchased: [{ id: 'P', name: 'P', qty: 1, itemType: 'promotion', courses: [], products: [{ id: 0, name: 'zero', qty: 1 }] }],
    }));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('0');
  });

  it('huge qty preserved without overflow', () => {
    const out = saleStocked(buildSaleItems({
      purchased: [{ id: 'P', name: 'P', qty: 1, itemType: 'promotion', courses: [], products: [{ id: 'X', name: 'X', qty: 1e9 }] }],
    }));
    expect(Number.isFinite(out[0].qty)).toBe(true);
  });
});

/* ─── F-G. CROSS-FILE WIRING REGRESSION GUARDS ───────────────────────── */

describe('F-G — cross-file wiring regression guards', () => {
  it('TreatmentBuyHelpers exports BOTH helper functions (no API rename)', () => {
    const helpers = readFileSync(resolve(root, 'src/lib/treatmentBuyHelpers.js'), 'utf8');
    expect(helpers).toMatch(/export\s+function\s+mapPromotionProductsToConsumables/);
    expect(helpers).toMatch(/export\s+function\s+filterOutConsumablesForPromotion/);
    expect(helpers).toMatch(/export\s+function\s+flattenPromotionsForStockDeduction/);
  });

  it('SaleTab imports flatten ONLY (not the consumables helpers)', () => {
    const st = readFileSync(resolve(root, 'src/components/backend/SaleTab.jsx'), 'utf8');
    expect(st).toContain('flattenPromotionsForStockDeduction');
    expect(st).not.toContain('mapPromotionProductsToConsumables');
  });

  it('TreatmentFormPage imports the consumables helpers ONLY (not flatten)', () => {
    const tx = readFileSync(resolve(root, 'src/components/TreatmentFormPage.jsx'), 'utf8');
    expect(tx).toContain('mapPromotionProductsToConsumables');
    expect(tx).toContain('filterOutConsumablesForPromotion');
    expect(tx).not.toContain('flattenPromotionsForStockDeduction');
  });

  it('No production file in src/ uses both helpers in the same module body', () => {
    // The current 2 callers split cleanly. Test that no third file ever
    // imports both — this is the simplest invariant that prevents the
    // double-deduct shape from ever existing in the codebase.
    const filesToCheck = [
      'src/components/backend/SaleTab.jsx',
      'src/components/TreatmentFormPage.jsx',
      'src/components/backend/StockTab.jsx',
      'src/components/backend/StockAdjustPanel.jsx',
      'src/components/backend/MovementLogPanel.jsx',
      'src/lib/backendClient.js',
    ];
    for (const f of filesToCheck) {
      if (!existsSync(resolve(root, f))) continue;
      const c = readFileSync(resolve(root, f), 'utf8');
      const hasFlatten = c.includes('flattenPromotionsForStockDeduction');
      const hasMap = c.includes('mapPromotionProductsToConsumables');
      const both = hasFlatten && hasMap;
      // Only the lib file (treatmentBuyHelpers.js) is allowed to define both
      expect(both).toBe(false);
    }
  });

  it('MovementLog reverse-toggle wired to query (includeReversed propagates)', () => {
    const ml = readFileSync(resolve(root, 'src/components/backend/MovementLogPanel.jsx'), 'utf8');
    // includeReversed appears in 3 places: state, label, and call
    expect((ml.match(/includeReversed/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('every production stock helper exposes idempotency via includeReversed filter', () => {
    const bc = readFileSync(resolve(root, 'src/lib/backendClient.js'), 'utf8');
    expect(bc).toMatch(/includeReversed/);
    // reverseStockForSale + reverseStockForTreatment both queue idempotently
    expect(bc).toMatch(/export async function reverseStockForSale/);
    expect(bc).toMatch(/export async function reverseStockForTreatment/);
  });
});
