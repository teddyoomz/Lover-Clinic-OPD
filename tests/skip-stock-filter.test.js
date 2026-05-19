// tests/skip-stock-filter.test.js
// V43-followup (2026-05-19 NIGHT+5 EOD+1) — Tier 1 unit for the pure
// skip-stock filter helper. Branch-agnostic. ~50 assertions covering
// happy paths + adversarial (null/undefined/Thai/Unicode/numeric flag).

import { describe, it, expect } from 'vitest';
import { filterOutSkippedProducts, isSkippedProduct } from '../src/lib/skipStockFilter.js';

describe('V43-followup skipStockFilter — Tier 1 unit', () => {
  describe('A. isSkippedProduct predicate', () => {
    it('A.1 returns true for explicit boolean true', () => {
      expect(isSkippedProduct({ skipStockDeduction: true })).toBe(true);
    });
    it('A.2 returns false for explicit boolean false', () => {
      expect(isSkippedProduct({ skipStockDeduction: false })).toBe(false);
    });
    it('A.3 returns false for undefined field (legacy products)', () => {
      expect(isSkippedProduct({ productId: 'P1' })).toBe(false);
    });
    it('A.4 returns false for null field', () => {
      expect(isSkippedProduct({ skipStockDeduction: null })).toBe(false);
    });
    it('A.5 returns false for empty string', () => {
      expect(isSkippedProduct({ skipStockDeduction: '' })).toBe(false);
    });
    it('A.6 returns false for numeric 0', () => {
      expect(isSkippedProduct({ skipStockDeduction: 0 })).toBe(false);
    });
    it('A.7 returns false for numeric 1 (strict boolean check)', () => {
      expect(isSkippedProduct({ skipStockDeduction: 1 })).toBe(false);
    });
    it('A.8 returns false for string "true" (strict boolean check)', () => {
      expect(isSkippedProduct({ skipStockDeduction: 'true' })).toBe(false);
    });
    it('A.9 returns false for null input', () => {
      expect(isSkippedProduct(null)).toBe(false);
    });
    it('A.10 returns false for undefined input', () => {
      expect(isSkippedProduct(undefined)).toBe(false);
    });
    it('A.11 returns false for non-object input', () => {
      expect(isSkippedProduct('string')).toBe(false);
      expect(isSkippedProduct(42)).toBe(false);
      expect(isSkippedProduct([])).toBe(false);
    });
  });

  describe('B. filterOutSkippedProducts — happy path', () => {
    it('B.1 returns empty array on empty input', () => {
      expect(filterOutSkippedProducts([])).toEqual([]);
    });
    it('B.2 preserves all products when none flagged', () => {
      const input = [{ productId: 'P1', skipStockDeduction: false }, { productId: 'P2' }];
      const out = filterOutSkippedProducts(input);
      expect(out.length).toBe(2);
      expect(out.map(p => p.productId)).toEqual(['P1', 'P2']);
    });
    it('B.3 filters out single flagged product', () => {
      const input = [{ productId: 'P1', skipStockDeduction: true }];
      expect(filterOutSkippedProducts(input)).toEqual([]);
    });
    it('B.4 filters out only flagged product, keeps others', () => {
      const input = [
        { productId: 'P1', skipStockDeduction: false },
        { productId: 'P2', skipStockDeduction: true },
        { productId: 'P3' },
      ];
      const out = filterOutSkippedProducts(input);
      expect(out.map(p => p.productId)).toEqual(['P1', 'P3']);
    });
    it('B.5 preserves product order', () => {
      const input = [
        { productId: 'P3' }, { productId: 'P1', skipStockDeduction: true }, { productId: 'P2' },
      ];
      const out = filterOutSkippedProducts(input);
      expect(out.map(p => p.productId)).toEqual(['P3', 'P2']);
    });
    it('B.6 does not mutate input array', () => {
      const input = [{ productId: 'P1', skipStockDeduction: true }];
      filterOutSkippedProducts(input);
      expect(input.length).toBe(1);
    });
    it('B.7 returns a new array reference', () => {
      const input = [];
      expect(filterOutSkippedProducts(input)).not.toBe(input);
    });
  });

  describe('C. filterOutSkippedProducts — adversarial', () => {
    it('C.1 handles null input gracefully', () => {
      expect(filterOutSkippedProducts(null)).toEqual([]);
    });
    it('C.2 handles undefined input', () => {
      expect(filterOutSkippedProducts(undefined)).toEqual([]);
    });
    it('C.3 handles non-array input', () => {
      expect(filterOutSkippedProducts('string')).toEqual([]);
      expect(filterOutSkippedProducts(42)).toEqual([]);
      expect(filterOutSkippedProducts({})).toEqual([]);
    });
    it('C.4 handles array with null items', () => {
      const input = [null, { productId: 'P1' }, undefined];
      const out = filterOutSkippedProducts(input);
      expect(out.length).toBe(1);
      expect(out[0].productId).toBe('P1');
    });
    it('C.5 handles Thai-named products', () => {
      const input = [
        { productId: 'P1', productName: 'ผ่าตัดทำหมันชาย', skipStockDeduction: true },
        { productId: 'P2', productName: 'ยาแก้ปวด', skipStockDeduction: false },
      ];
      const out = filterOutSkippedProducts(input);
      expect(out.length).toBe(1);
      expect(out[0].productName).toBe('ยาแก้ปวด');
    });
    it('C.6 handles Unicode NFC vs NFD product names without confusion', () => {
      const nfc = 'é'; // é precomposed
      const nfd = 'é'; // e + combining acute
      const input = [
        { productId: 'P1', productName: nfc, skipStockDeduction: true },
        { productId: 'P2', productName: nfd, skipStockDeduction: false },
      ];
      expect(filterOutSkippedProducts(input).length).toBe(1);
    });
    it('C.7 handles 10K-char product name', () => {
      const longName = 'a'.repeat(10000);
      const input = [{ productId: 'P1', productName: longName, skipStockDeduction: true }];
      expect(filterOutSkippedProducts(input)).toEqual([]);
    });
    it('C.8 handles NUL byte in product name', () => {
      const input = [
        { productId: 'P1', productName: 'a b', skipStockDeduction: false },
      ];
      expect(filterOutSkippedProducts(input).length).toBe(1);
    });
    it('C.9 handles numeric productId vs string productId', () => {
      const input = [
        { productId: 42, skipStockDeduction: true },
        { productId: '42', skipStockDeduction: false },
      ];
      const out = filterOutSkippedProducts(input);
      expect(out.length).toBe(1);
      expect(out[0].productId).toBe('42');
    });
    it('C.10 handles 1000-product list performance', () => {
      const input = Array.from({ length: 1000 }, (_, i) => ({
        productId: `P${i}`,
        skipStockDeduction: i % 7 === 0,
      }));
      const start = Date.now();
      const out = filterOutSkippedProducts(input);
      const elapsed = Date.now() - start;
      expect(out.length).toBe(1000 - Math.ceil(1000 / 7));
      expect(elapsed).toBeLessThan(50); // 50ms budget — generous
    });
  });

  describe('D. filterOutSkippedProducts — idempotency', () => {
    it('D.1 calling twice yields same result', () => {
      const input = [
        { productId: 'P1', skipStockDeduction: true },
        { productId: 'P2' },
      ];
      const a = filterOutSkippedProducts(input);
      const b = filterOutSkippedProducts(input);
      expect(a).toEqual(b);
    });
    it('D.2 filtering already-filtered list is a no-op', () => {
      const input = [{ productId: 'P1' }, { productId: 'P2' }];
      const once = filterOutSkippedProducts(input);
      const twice = filterOutSkippedProducts(once);
      expect(twice).toEqual(once);
    });
  });

  describe('E. forward-compat', () => {
    it('E.1 preserves arbitrary extra fields on products', () => {
      const input = [{
        productId: 'P1',
        productName: 'Test',
        futureField: { nested: 'value' },
        _v43FollowupTimestamp: '2026-05-19',
      }];
      const out = filterOutSkippedProducts(input);
      expect(out[0].futureField.nested).toBe('value');
      expect(out[0]._v43FollowupTimestamp).toBe('2026-05-19');
    });
  });
});
