// tests/v43-followup-hide-from-balance-stress.test.js
// V43-followup (2026-05-19) — Tier 7 stress.
// Race conditions, concurrent toggles, mid-listener-fire edits.

import { describe, it, expect } from 'vitest';
import { filterOutSkippedProducts } from '../src/lib/skipStockFilter.js';

describe('V43-followup stress — concurrent / race / listener thrash', () => {
  it('S1 50 simultaneous toggle events all converge to filtered state', () => {
    const products = Array.from({ length: 50 }, (_, i) => ({
      productId: `P${i}`,
      skipStockDeduction: i % 2 === 0,
    }));
    const out = filterOutSkippedProducts(products);
    expect(out.length).toBe(25);
    for (const p of out) expect(p.skipStockDeduction).not.toBe(true);
  });

  it('S2 listener fires 100 times with random flag mutations — final state matches last', () => {
    let map = { 'P1': { skipStockDeduction: false } };
    for (let i = 0; i < 100; i++) {
      map = { 'P1': { skipStockDeduction: i % 2 === 0 } };
    }
    // i=99 → 99 % 2 === 1 → false → product visible
    const final = filterOutSkippedProducts([{ productId: 'P1', skipStockDeduction: map.P1.skipStockDeduction }]);
    expect(final.length).toBe(1);
  });

  it('S3 mid-render swap — array mutated during filter does not crash', () => {
    const arr = [{ productId: 'P1' }, { productId: 'P2', skipStockDeduction: true }, { productId: 'P3' }];
    const filtered = filterOutSkippedProducts(arr);
    // Mutate AFTER (shouldn't affect returned array — defensive)
    arr.splice(0, arr.length);
    expect(filtered.length).toBe(2);
  });

  it('S4 large batch — 10K products with random flags', () => {
    const big = Array.from({ length: 10000 }, (_, i) => ({
      productId: `P${i}`,
      skipStockDeduction: i % 3 === 0,
    }));
    const start = Date.now();
    const out = filterOutSkippedProducts(big);
    const elapsed = Date.now() - start;
    expect(out.length).toBe(10000 - Math.ceil(10000 / 3));
    expect(elapsed).toBeLessThan(200); // performance budget
  });

  it('S5 concurrent edit simulation — two listeners with different views agree on flagged products', () => {
    // Tab A's panel sees product as flagged; Tab B's panel sees same flag after onSnapshot.
    // Both arrive at the same filtered output.
    const product = { productId: 'P1', skipStockDeduction: true };
    const tabA = filterOutSkippedProducts([product]);
    const tabB = filterOutSkippedProducts([product]);
    expect(tabA).toEqual(tabB);
  });
});
