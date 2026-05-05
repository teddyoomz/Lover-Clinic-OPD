// ─── Phase 17.2-octies — isCourseUsableInTreatment shape-aware ──────────
// Bug: Phase 16.7-quinquies-ter introduced isCourseUsableInTreatment with
// FLAT-shape c.qty parsing. The TFP call site (line 1982) passes
// mapRawCoursesToForm output which is GROUPED (c.products[]). Standard
// qty-tracked courses got rejected (qtyStr === '' → return false).
// Special-type courses survived because of boolean flags checked first.
//
// Fix: when c.products is non-empty array, sum across products' remaining
// — return true if any > 0. Flat-shape parse preserved as fallback.

import { describe, it, expect } from 'vitest';
import { isCourseUsableInTreatment } from '../src/lib/treatmentBuyHelpers.js';

describe('Phase 17.2-octies — isCourseUsableInTreatment shape-aware', () => {
  describe('U1 — Defensive guards', () => {
    it('U1.1 null/undefined returns false', () => {
      expect(isCourseUsableInTreatment(null)).toBe(false);
      expect(isCourseUsableInTreatment(undefined)).toBe(false);
    });
    it('U1.2 non-object returns false', () => {
      expect(isCourseUsableInTreatment('str')).toBe(false);
      expect(isCourseUsableInTreatment(123)).toBe(false);
      expect(isCourseUsableInTreatment(true)).toBe(false);
    });
    it('U1.3 empty object returns false', () => {
      expect(isCourseUsableInTreatment({})).toBe(false);
    });
  });

  describe('U2 — Special types (boolean flags / type marker) — branch-blind, qty-blind', () => {
    it('U2.1 isRealQty = true → true', () => {
      expect(isCourseUsableInTreatment({ isRealQty: true })).toBe(true);
    });
    it('U2.2 courseType "เหมาตามจริง" → true', () => {
      expect(isCourseUsableInTreatment({ courseType: 'เหมาตามจริง' })).toBe(true);
    });
    it('U2.3 qty marker "เหมาตามจริง" (legacy clone shape) → true', () => {
      expect(isCourseUsableInTreatment({ qty: 'เหมาตามจริง' })).toBe(true);
    });
    it('U2.4 isBuffet = true → true', () => {
      expect(isCourseUsableInTreatment({ isBuffet: true })).toBe(true);
    });
    it('U2.5 courseType "บุฟเฟต์" → true', () => {
      expect(isCourseUsableInTreatment({ courseType: 'บุฟเฟต์' })).toBe(true);
    });
    it('U2.6 qty marker "บุฟเฟต์" → true', () => {
      expect(isCourseUsableInTreatment({ qty: 'บุฟเฟต์' })).toBe(true);
    });
    it('U2.7 isPickAtTreatment = true → true', () => {
      expect(isCourseUsableInTreatment({ isPickAtTreatment: true })).toBe(true);
    });
    it('U2.8 needsPickSelection = true → true', () => {
      expect(isCourseUsableInTreatment({ needsPickSelection: true })).toBe(true);
    });
    it('U2.9 special type with depleted products STILL true (special > qty)', () => {
      expect(isCourseUsableInTreatment({ isBuffet: true, products: [{ remaining: 0 }] })).toBe(true);
    });
  });

  describe('U3 — GROUPED shape (mapRawCoursesToForm output) — Phase 17.2-octies fix', () => {
    it('U3.1 single product remaining > 0 → true (asdas dasd repro)', () => {
      const grouped = {
        courseType: 'ระบุสินค้าและจำนวนสินค้า',
        products: [{ name: 'IV Drip Premium #1', remaining: '8', total: '10' }],
      };
      expect(isCourseUsableInTreatment(grouped)).toBe(true);
    });
    it('U3.2 multi-product all remaining > 0 → true', () => {
      const grouped = {
        courseType: 'ระบุสินค้าและจำนวนสินค้า',
        products: [
          { remaining: '8', total: '10' },
          { remaining: '89', total: '100' },
          { remaining: '26', total: '30' },
        ],
      };
      expect(isCourseUsableInTreatment(grouped)).toBe(true);
    });
    it('U3.3 multi-product mixed (one > 0, others = 0) → true', () => {
      const grouped = {
        courseType: 'ระบุสินค้าและจำนวนสินค้า',
        products: [
          { remaining: '0', total: '10' },
          { remaining: '5', total: '10' },
          { remaining: '0', total: '10' },
        ],
      };
      expect(isCourseUsableInTreatment(grouped)).toBe(true);
    });
    it('U3.4 all products remaining = 0 → false (depleted)', () => {
      const grouped = {
        courseType: 'ระบุสินค้าและจำนวนสินค้า',
        products: [
          { remaining: '0', total: '10' },
          { remaining: '0', total: '5' },
        ],
      };
      expect(isCourseUsableInTreatment(grouped)).toBe(false);
    });
    it('U3.5 numeric remaining (not string) → still works', () => {
      const grouped = { products: [{ remaining: 8, total: 10 }] };
      expect(isCourseUsableInTreatment(grouped)).toBe(true);
    });
    it('U3.6 comma-separated remaining "7,998" → true', () => {
      const grouped = { products: [{ remaining: '7,998', total: '10,000' }] };
      expect(isCourseUsableInTreatment(grouped)).toBe(true);
    });
    it('U3.7 negative remaining (Phase 15.7 negative-stock) → false', () => {
      const grouped = { products: [{ remaining: '-5', total: '10' }] };
      expect(isCourseUsableInTreatment(grouped)).toBe(false);
    });
    it('U3.8 missing remaining field → treated as not > 0 → false', () => {
      const grouped = { products: [{ total: '10' }] };
      expect(isCourseUsableInTreatment(grouped)).toBe(false);
    });
    it('U3.9 empty products array falls through to flat-shape parse', () => {
      const empty = { products: [], qty: '5 / 10 ครั้ง' };
      expect(isCourseUsableInTreatment(empty)).toBe(true);
    });
    it('U3.10 empty products + empty qty → false', () => {
      expect(isCourseUsableInTreatment({ products: [] })).toBe(false);
    });
    it('U3.11 grouped + special type (e.g. fill-later เหมาตามจริง with products[]) — special wins', () => {
      const grouped = {
        isRealQty: true,
        courseType: 'เหมาตามจริง',
        products: [{ remaining: '0', total: '0' }],
      };
      expect(isCourseUsableInTreatment(grouped)).toBe(true);
    });
  });

  describe('U4 — FLAT shape (legacy / direct customer.courses[] entries)', () => {
    it('U4.1 standard qty "5 / 10 ครั้ง" → true', () => {
      expect(isCourseUsableInTreatment({ qty: '5 / 10 ครั้ง' })).toBe(true);
    });
    it('U4.2 depleted "0 / 10 U" → false', () => {
      expect(isCourseUsableInTreatment({ qty: '0 / 10 U' })).toBe(false);
    });
    it('U4.3 zero-total "5 / 0 X" → false', () => {
      expect(isCourseUsableInTreatment({ qty: '5 / 0 X' })).toBe(false);
    });
    it('U4.4 comma-formatted "7,998 / 10,000 Shot" → true', () => {
      expect(isCourseUsableInTreatment({ qty: '7,998 / 10,000 Shot' })).toBe(true);
    });
    it('U4.5 unparseable qty string → false', () => {
      expect(isCourseUsableInTreatment({ qty: 'gibberish' })).toBe(false);
    });
    it('U4.6 missing qty → false', () => {
      expect(isCourseUsableInTreatment({})).toBe(false);
    });
    it('U4.7 decimal "1.5 / 10 cc" → true', () => {
      expect(isCourseUsableInTreatment({ qty: '1.5 / 10 cc' })).toBe(true);
    });
    it('U4.8 zero remaining decimal "0.0 / 10" → false', () => {
      expect(isCourseUsableInTreatment({ qty: '0.0 / 10' })).toBe(false);
    });
  });

  describe('U5 — Cross-shape adversarial', () => {
    it('U5.1 GROUPED depleted + flat qty with remaining > 0 — grouped wins (depleted)', () => {
      // Grouped takes precedence when products[] non-empty
      const c = {
        products: [{ remaining: '0', total: '10' }],
        qty: '5 / 10 ครั้ง',
      };
      expect(isCourseUsableInTreatment(c)).toBe(false);
    });
    it('U5.2 GROUPED valid + flat qty depleted — grouped wins (usable)', () => {
      const c = {
        products: [{ remaining: '5', total: '10' }],
        qty: '0 / 10 ครั้ง',
      };
      expect(isCourseUsableInTreatment(c)).toBe(true);
    });
  });

  describe('U6 — Phase 17.2-octies marker', () => {
    it('U6.1 source contains Phase 17.2-octies comment marker', async () => {
      const { readFileSync } = await import('node:fs');
      const src = readFileSync('src/lib/treatmentBuyHelpers.js', 'utf8');
      expect(src).toMatch(/Phase 17\.2-octies/);
    });
  });
});
