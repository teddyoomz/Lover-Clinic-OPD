// ─── Phase 17.1 marketing extension — adapter-specific invariants ──────────
// V41 marketing-extension lock tests. Run alongside
// phase-17-1-cross-branch-import-adapters.test.js (which has the generic
// contract loop). This file has the adversarial + source-grep + UI
// integration locks specific to the 3 marketing entities.
//
// Spec: docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ADAPTERS, ENTITY_TYPES, getAdapter } from '../src/lib/crossBranchImportAdapters/index.js';

const MARKETING_TYPES = ['promotions', 'coupons', 'vouchers'];
const REQUIRED_KEYS = ['entityType', 'collection', 'canonicalIdField', 'dedupKey', 'fkRefs', 'clone', 'displayRow'];

describe('M1 — adapter shape conformance (V39 contract per marketing entity)', () => {
  for (const t of MARKETING_TYPES) {
    describe(t, () => {
      const adapter = getAdapter(t);

      it(`M1.${t}.1 exports all required keys including canonicalIdField`, () => {
        for (const k of REQUIRED_KEYS) {
          expect(adapter[k], `missing key ${k}`).toBeDefined();
        }
      });

      it(`M1.${t}.2 canonicalIdField is the expected entity field`, () => {
        const expected = { promotions: 'promotionId', coupons: 'couponId', vouchers: 'voucherId' }[t];
        expect(adapter.canonicalIdField).toBe(expected);
      });

      it(`M1.${t}.3 collection matches be_<entity> pattern`, () => {
        const expected = { promotions: 'be_promotions', coupons: 'be_coupons', vouchers: 'be_vouchers' }[t];
        expect(adapter.collection).toBe(expected);
      });

      it(`M1.${t}.4 clone strips canonicalIdField`, () => {
        const idField = adapter.canonicalIdField;
        const sourceItem = {
          [idField]: 'SRC-CANON',
          promotion_name: 'X', coupon_code: 'X', voucher_name: 'X', platform: 'HDmall',
        };
        const cloned = adapter.clone(sourceItem, 'BR-target', 'admin-uid');
        // Note: V39 endpoint will re-stamp canonicalIdField after clone, but
        // the adapter clone itself should NOT carry source's canonical value.
        expect(cloned[idField]).toBeUndefined();
      });

      it(`M1.${t}.5 displayRow returns object with primary/secondary/tertiary`, () => {
        const row = adapter.displayRow({
          promotion_name: 'X', coupon_name: 'X', voucher_name: 'X',
          coupon_code: 'X', platform: 'HDmall',
        });
        expect(row).toHaveProperty('primary');
        expect(row).toHaveProperty('secondary');
        expect(row).toHaveProperty('tertiary');   // may be null for items without dates
      });
    });
  }
});

describe('M2 — coupons branch_ids reset (Q2 lock)', () => {
  const adapter = getAdapter('coupons');

  it('M2.1 null branch_ids → []', () => {
    const cloned = adapter.clone({ coupon_code: 'X', branch_ids: null }, 'BR-T', 'a');
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.2 empty array → []', () => {
    const cloned = adapter.clone({ coupon_code: 'X', branch_ids: [] }, 'BR-T', 'a');
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.3 single-entry array → []', () => {
    const cloned = adapter.clone({ coupon_code: 'X', branch_ids: ['28'] }, 'BR-T', 'a');
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.4 multi-entry array → []', () => {
    const cloned = adapter.clone({ coupon_code: 'X', branch_ids: ['28', '29', '30'] }, 'BR-T', 'a');
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.5 preserves other fields when stripping branch_ids', () => {
    const cloned = adapter.clone({
      coupon_code: 'SUMMER',
      coupon_name: 'Summer 2026',
      discount: 10,
      discount_type: 'percent',
      max_qty: 100,
      branch_ids: ['28', '29'],
    }, 'BR-T', 'admin');
    expect(cloned.coupon_code).toBe('SUMMER');
    expect(cloned.coupon_name).toBe('Summer 2026');
    expect(cloned.discount).toBe(10);
    expect(cloned.discount_type).toBe('percent');
    expect(cloned.max_qty).toBe(100);
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.6 idempotent — calling clone twice resets branch_ids each time', () => {
    const a = adapter.clone({ coupon_code: 'X', branch_ids: ['28'] }, 'BR-A', 'admin');
    const b = adapter.clone({ ...a, branch_ids: ['29'] }, 'BR-B', 'admin');
    expect(b.branch_ids).toEqual([]);
  });

  it('M2.7 undefined branch_ids → []', () => {
    const cloned = adapter.clone({ coupon_code: 'X' }, 'BR-T', 'a');
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.8 source had no branch_ids key — output has empty array', () => {
    const cloned = adapter.clone({ coupon_code: 'X', coupon_name: 'Y' }, 'BR-T', 'a');
    expect('branch_ids' in cloned).toBe(true);
    expect(cloned.branch_ids).toEqual([]);
  });
});

describe('M3 — promotions FK refs', () => {
  const adapter = getAdapter('promotions');

  it('M3.1 courses-only — single ref group for courses', () => {
    const refs = adapter.fkRefs({ courses: [{ id: 'C-1' }] });
    expect(refs.length).toBe(1);
    expect(refs[0].collection).toBe('be_courses');
    expect(refs[0].ids).toEqual(['C-1']);
  });

  it('M3.2 products-only — single ref group for products', () => {
    const refs = adapter.fkRefs({ products: [{ id: 'P-1' }] });
    expect(refs.length).toBe(1);
    expect(refs[0].collection).toBe('be_products');
    expect(refs[0].ids).toEqual(['P-1']);
  });

  it('M3.3 both arrays — two ref groups', () => {
    const refs = adapter.fkRefs({ courses: [{ id: 'C-1' }], products: [{ id: 'P-1' }] });
    expect(refs.length).toBe(2);
  });

  it('M3.4 neither array — empty refs', () => {
    expect(adapter.fkRefs({})).toEqual([]);
  });

  it('M3.5 mixed valid + null id entries — only valid ids collected', () => {
    const refs = adapter.fkRefs({
      courses: [{ id: 'C-1' }, { id: null }, {}, { id: 'C-2' }],
      products: [{ id: '' }, { id: 'P-1' }],
    });
    expect(refs.find(r => r.collection === 'be_courses').ids).toEqual(['C-1', 'C-2']);
    expect(refs.find(r => r.collection === 'be_products').ids).toEqual(['P-1']);
  });

  it('M3.6 non-array inputs (defensive)', () => {
    expect(() => adapter.fkRefs({ courses: 'not-array' })).not.toThrow();
    expect(adapter.fkRefs({ courses: 'not-array' })).toEqual([]);
  });
});

describe('M4 — vouchers dedupKey discriminator (platform-aware)', () => {
  const adapter = getAdapter('vouchers');

  it('M4.1 same name different platforms → different keys', () => {
    expect(adapter.dedupKey({ voucher_name: 'Promo', platform: 'HDmall' }))
      .not.toBe(adapter.dedupKey({ voucher_name: 'Promo', platform: 'GoWabi' }));
  });

  it('M4.2 null platform yields name:', () => {
    expect(adapter.dedupKey({ voucher_name: 'Promo', platform: null })).toBe('Promo:');
  });

  it('M4.3 empty platform yields name:', () => {
    expect(adapter.dedupKey({ voucher_name: 'Promo', platform: '' })).toBe('Promo:');
  });

  it('M4.4 Thai chars preserved in voucher_name', () => {
    expect(adapter.dedupKey({ voucher_name: 'โปรโมชั่น A', platform: 'HDmall' }))
      .toBe('โปรโมชั่น A:HDmall');
  });

  it('M4.5 both fields missing → ":"', () => {
    expect(adapter.dedupKey({})).toBe(':');
  });

  it('M4.6 deterministic — same input twice yields same key', () => {
    const item = { voucher_name: 'X', platform: 'HDmall' };
    expect(adapter.dedupKey(item)).toBe(adapter.dedupKey(item));
  });
});

describe('M5 — registry source-grep regression', () => {
  it('M5.1 ADAPTERS has exactly 10 entries', () => {
    expect(Object.keys(ADAPTERS).length).toBe(10);
  });

  it('M5.2 ENTITY_TYPES contains all 3 marketing types', () => {
    for (const t of MARKETING_TYPES) {
      expect(ENTITY_TYPES).toContain(t);
    }
  });

  it('M5.3 index.js imports all 3 marketing adapters', () => {
    const src = readFileSync('src/lib/crossBranchImportAdapters/index.js', 'utf-8');
    expect(src).toMatch(/import promotionsAdapter from '\.\/promotions\.js';/);
    expect(src).toMatch(/import couponsAdapter from '\.\/coupons\.js';/);
    expect(src).toMatch(/import vouchersAdapter from '\.\/vouchers\.js';/);
  });

  it('M5.4 ADAPTERS map registers 3 marketing entries', () => {
    const src = readFileSync('src/lib/crossBranchImportAdapters/index.js', 'utf-8');
    expect(src).toMatch(/'promotions':\s*promotionsAdapter/);
    expect(src).toMatch(/'coupons':\s*couponsAdapter/);
    expect(src).toMatch(/'vouchers':\s*vouchersAdapter/);
  });

  it('M5.5 each marketing adapter file exists and exports default', () => {
    for (const t of MARKETING_TYPES) {
      const adapter = getAdapter(t);
      expect(adapter).toBeDefined();
      expect(typeof adapter.clone).toBe('function');
    }
  });

  it('M5.6 each marketing adapter strips its own canonicalIdField', () => {
    for (const t of MARKETING_TYPES) {
      const adapter = getAdapter(t);
      const idField = adapter.canonicalIdField;
      const cloned = adapter.clone({ [idField]: 'SRC' }, 'BR-T', 'a');
      expect(cloned[idField], `${t} should strip ${idField}`).toBeUndefined();
    }
  });

  it('M5.7 each marketing clone stamps target branchId', () => {
    for (const t of MARKETING_TYPES) {
      const cloned = getAdapter(t).clone({}, 'BR-TARGET', 'a');
      expect(cloned.branchId).toBe('BR-TARGET');
    }
  });

  it('M5.8 each marketing clone preserves createdAt + createdBy from source', () => {
    for (const t of MARKETING_TYPES) {
      const cloned = getAdapter(t).clone(
        { createdAt: '2026-01-01T00:00:00Z', createdBy: 'src-admin' },
        'BR-T', 'tgt-admin'
      );
      expect(cloned.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(cloned.createdBy).toBe('src-admin');
    }
  });

  it('M5.9 each marketing clone sets new updatedBy', () => {
    for (const t of MARKETING_TYPES) {
      const cloned = getAdapter(t).clone({}, 'BR-T', 'tgt-admin');
      expect(cloned.updatedBy).toBe('tgt-admin');
    }
  });

  it('M5.10 each marketing clone strips stray `id` field (V39 lock)', () => {
    for (const t of MARKETING_TYPES) {
      const cloned = getAdapter(t).clone({ id: 'STRAY-1' }, 'BR-T', 'a');
      expect(cloned.id, `${t} should strip stray id`).toBeUndefined();
    }
  });
});

describe('M6 — UI integration source-grep (PromotionTab/CouponTab/VoucherTab)', () => {
  it('M6.1 PromotionTab imports CrossBranchImportButton', () => {
    const src = readFileSync('src/components/backend/PromotionTab.jsx', 'utf-8');
    expect(src).toMatch(/import\s+CrossBranchImportButton\s+from/);
    expect(src).toMatch(/<CrossBranchImportButton[\s\S]*?entityType=["']promotions["']/);
  });

  it('M6.2 CouponTab imports CrossBranchImportButton', () => {
    const src = readFileSync('src/components/backend/CouponTab.jsx', 'utf-8');
    expect(src).toMatch(/import\s+CrossBranchImportButton\s+from/);
    expect(src).toMatch(/<CrossBranchImportButton[\s\S]*?entityType=["']coupons["']/);
  });

  it('M6.3 VoucherTab imports CrossBranchImportButton', () => {
    const src = readFileSync('src/components/backend/VoucherTab.jsx', 'utf-8');
    expect(src).toMatch(/import\s+CrossBranchImportButton\s+from/);
    expect(src).toMatch(/<CrossBranchImportButton[\s\S]*?entityType=["']vouchers["']/);
  });

  it('M6.4 each tab passes onImported wired to reload (direct ref or arrow wrapper) inside the button element', () => {
    // Anchor inside <CrossBranchImportButton ...> element to avoid false-positive
    // matches against other components in the same file. Accept both
    // `onImported={reload}` (direct ref) and `onImported={() => reload()}`
    // (arrow wrapper, matches existing 7-tab convention in ProductsTab/CoursesTab/etc).
    for (const file of ['PromotionTab.jsx', 'CouponTab.jsx', 'VoucherTab.jsx']) {
      const src = readFileSync(`src/components/backend/${file}`, 'utf-8');
      expect(src).toMatch(/<CrossBranchImportButton[\s\S]{0,300}?onImported=\{(?:reload|\(\)\s*=>\s*reload\(\))\}/);
    }
  });

  it('M6.5 each tab passes isDark inside the CrossBranchImportButton element', () => {
    // Anchor inside <CrossBranchImportButton ...> element so the test does NOT
    // false-positive on the existing FormModal isDark prop in the same file.
    // Accept both `isDark={isDark}` (local var) and `isDark={theme === 'dark'}`
    // (inline expression — matches existing 7-tab convention).
    for (const file of ['PromotionTab.jsx', 'CouponTab.jsx', 'VoucherTab.jsx']) {
      const src = readFileSync(`src/components/backend/${file}`, 'utf-8');
      expect(src).toMatch(/<CrossBranchImportButton[\s\S]{0,300}?isDark=\{[^}]+\}/);
    }
  });
});
