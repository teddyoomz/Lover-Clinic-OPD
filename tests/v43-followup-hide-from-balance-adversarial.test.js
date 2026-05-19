// tests/v43-followup-hide-from-balance-adversarial.test.js
// V43-followup (2026-05-19) — Tier 4 adversarial mulberry32 PRNG.
// 100 fixtures × 4 product types × 3 tiers = 1200 invariant-checked scenarios.

import { describe, it, expect } from 'vitest';
import { filterOutSkippedProducts, isSkippedProduct } from '../src/lib/skipStockFilter.js';

// Deterministic PRNG — same seed → same sequence (reproducible).
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRODUCT_TYPES = ['ยา', 'สินค้าหน้าร้าน', 'สินค้าสิ้นเปลือง', 'บริการ'];
const TIERS = [
  { id: 'branch-existing', branchId: 'BR-1777873556815-26df6480' },
  { id: 'branch-future',   branchId: 'TEST-BR-FUTURE-V43F' },
  { id: 'central',         branchId: 'CENTRAL-WH-001' },
];
const QTY_SHAPES = ['positive', 'zero', 'negative', 'multi-batch', 'expired', 'near-expiry'];

function generateFixture(seed, type, tier) {
  const rand = mulberry32(seed);
  const flag = rand() > 0.5;
  const qtyShape = QTY_SHAPES[Math.floor(rand() * QTY_SHAPES.length)];
  const qty = qtyShape === 'positive' ? Math.floor(rand() * 100) + 1
    : qtyShape === 'zero' ? 0
    : qtyShape === 'negative' ? -Math.floor(rand() * 100) - 1
    : qtyShape === 'multi-batch' ? null
    : qtyShape === 'expired' ? Math.floor(rand() * 50)
    : Math.floor(rand() * 30) + 1;
  return {
    seed,
    productId: `TEST-V43F-${type}-${tier.id}-${seed}`,
    productName: `${type} ${seed}`,
    productType: type,
    branchId: tier.branchId,
    qty,
    qtyShape,
    skipStockDeduction: flag,
  };
}

describe('V43-followup adversarial — 4 types × 3 tiers × 100 seeds = 1200 fixtures', () => {
  for (const type of PRODUCT_TYPES) {
    for (const tier of TIERS) {
      describe(`${type} @ ${tier.id}`, () => {
        for (let seed = 0; seed < 100; seed++) {
          const fixture = generateFixture(seed, type, tier);
          it(`seed=${seed} — flag=${fixture.skipStockDeduction} qty=${fixture.qty} qtyShape=${fixture.qtyShape}`, () => {
            const products = [fixture];
            const out = filterOutSkippedProducts(products);
            if (fixture.skipStockDeduction === true) {
              expect(out.length).toBe(0);
            } else {
              expect(out.length).toBe(1);
              expect(out[0].productId).toBe(fixture.productId);
            }
          });
        }
      });
    }
  }
});

describe('V43-followup adversarial — bulk filter integrity', () => {
  it('B.1 all 1200 fixtures combined: visible count = unflagged count', () => {
    const all = [];
    for (const type of PRODUCT_TYPES) {
      for (const tier of TIERS) {
        for (let seed = 0; seed < 100; seed++) {
          all.push(generateFixture(seed, type, tier));
        }
      }
    }
    const expectedVisible = all.filter(p => !p.skipStockDeduction).length;
    const actualVisible = filterOutSkippedProducts(all).length;
    expect(actualVisible).toBe(expectedVisible);
    expect(all.length).toBe(1200);
  });
  it('B.2 every visible product is unflagged', () => {
    const all = [];
    for (const type of PRODUCT_TYPES) {
      for (const tier of TIERS) {
        for (let seed = 0; seed < 100; seed++) {
          all.push(generateFixture(seed, type, tier));
        }
      }
    }
    const visible = filterOutSkippedProducts(all);
    for (const p of visible) expect(p.skipStockDeduction).not.toBe(true);
  });
  it('B.3 every filtered-out product is flagged', () => {
    const all = [];
    for (const type of PRODUCT_TYPES) {
      for (const tier of TIERS) {
        for (let seed = 0; seed < 100; seed++) {
          all.push(generateFixture(seed, type, tier));
        }
      }
    }
    const visible = filterOutSkippedProducts(all);
    const visibleIds = new Set(visible.map(p => p.productId));
    const hidden = all.filter(p => !visibleIds.has(p.productId));
    for (const p of hidden) expect(p.skipStockDeduction).toBe(true);
  });
});

describe('V43-followup adversarial — cross-tier identity', () => {
  it('C.1 flag behavior is identical across all 3 tiers (per-branch, future-branch, central)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const results = TIERS.map(tier => {
        const f = generateFixture(seed, 'ยา', tier);
        return filterOutSkippedProducts([f]).length;
      });
      // All 3 should agree (same seed → same flag → same filter outcome)
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    }
  });
});
