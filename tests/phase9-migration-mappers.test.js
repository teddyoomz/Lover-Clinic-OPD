// ─── Phase 9 migration mappers — 40 adversarial scenarios ────────────────
import { describe, it, expect } from 'vitest';
import {
  buildBePromotionFromMaster,
  buildBeCouponFromMaster,
  buildBeVoucherFromMaster,
} from '../src/lib/phase9Mappers.js';

const NOW = '2026-04-19T10:00:00.000Z';

describe('buildBePromotionFromMaster — 20 scenarios', () => {
  it('MP1 null src returns null', () => expect(buildBePromotionFromMaster(null, 'p1', NOW)).toBeNull());
  it('MP2 undefined src returns null', () => expect(buildBePromotionFromMaster(undefined, 'p1', NOW)).toBeNull());
  it('MP3 non-object src returns null', () => expect(buildBePromotionFromMaster('string', 'p1', NOW)).toBeNull());
  it('MP4 empty name returns null', () => expect(buildBePromotionFromMaster({ name: '' }, 'p1', NOW)).toBeNull());
  it('MP5 whitespace name returns null', () => expect(buildBePromotionFromMaster({ name: '   ' }, 'p1', NOW)).toBeNull());

  it('MP6 minimal src maps name + defaults', () => {
    const r = buildBePromotionFromMaster({ name: 'Promo' }, '1', NOW);
    expect(r.promotion_name).toBe('Promo');
    expect(r.promotionId).toBe('1');
    expect(r.sale_price).toBe(0);
    expect(r.courses).toEqual([]);
    expect(r.products).toEqual([]);
    expect(r.status).toBe('active');
    expect(r.promotion_type).toBe('fixed');
    expect(r.usage_type).toBe('clinic');
    expect(r.migratedFromMasterData).toBe(true);
  });

  it('MP7 preserves createdAt when existing provided', () => {
    const r = buildBePromotionFromMaster({ name: 'P' }, '1', NOW, '2025-01-01T00:00:00.000Z');
    expect(r.createdAt).toBe('2025-01-01T00:00:00.000Z');
    expect(r.updatedAt).toBe(NOW);
  });

  it('MP8 uses now when no existing createdAt', () => {
    const r = buildBePromotionFromMaster({ name: 'P' }, '1', NOW);
    expect(r.createdAt).toBe(NOW);
  });

  it('MP9 maps price numerically', () => {
    const r = buildBePromotionFromMaster({ name: 'P', price: '1500.50' }, '1', NOW);
    expect(r.sale_price).toBe(1500.5);
    expect(r.sale_price_incl_vat).toBe(1500.5);
  });

  it('MP10 handles NaN price → 0', () => {
    expect(buildBePromotionFromMaster({ name: 'P', price: 'abc' }, '1', NOW).sale_price).toBe(0);
  });

  it('MP11 isVatIncluded=1 → boolean true', () => {
    expect(buildBePromotionFromMaster({ name: 'P', isVatIncluded: 1 }, '1', NOW).is_vat_included).toBe(true);
  });

  it('MP12 isVatIncluded=0 → false', () => {
    expect(buildBePromotionFromMaster({ name: 'P', isVatIncluded: 0 }, '1', NOW).is_vat_included).toBe(false);
  });

  it('MP13 category mapping', () => {
    expect(buildBePromotionFromMaster({ name: 'P', category: 'CHA01' }, '1', NOW).category_name).toBe('CHA01');
  });

  it('MP14 courses array with full structure preserved', () => {
    const src = {
      name: 'P',
      courses: [
        { id: 10, name: 'C1', qty: 3, price: 500, products: [{ id: 'p1', name: 'Prod1', qty: 1, unit: 'ชิ้น' }] },
        { id: 20, name: 'C2', qty: 1, products: [] },
      ],
    };
    const r = buildBePromotionFromMaster(src, '1', NOW);
    expect(r.courses).toHaveLength(2);
    expect(r.courses[0].id).toBe(10);
    expect(r.courses[0].name).toBe('C1');
    expect(r.courses[0].qty).toBe(3);
    expect(r.courses[0].price).toBe(500);
    expect(r.courses[0].products).toHaveLength(1);
    expect(r.courses[0].products[0].id).toBe('p1');
    expect(r.courses[1].products).toEqual([]);
  });

  it('MP15 courses with missing products field → []', () => {
    const r = buildBePromotionFromMaster({
      name: 'P', courses: [{ id: 1, name: 'C' }],
    }, '1', NOW);
    expect(r.courses[0].products).toEqual([]);
  });

  it('MP16 courses not an array → [] (defensive)', () => {
    const r = buildBePromotionFromMaster({
      name: 'P', courses: 'not-an-array',
    }, '1', NOW);
    expect(r.courses).toEqual([]);
  });

  it('MP17 products at promotion level', () => {
    const r = buildBePromotionFromMaster({
      name: 'P',
      products: [{ id: 'x', name: 'Prod', qty: 2, price: 100, unit: 'หลอด' }],
    }, '1', NOW);
    expect(r.products).toEqual([{ id: 'x', name: 'Prod', qty: 2, price: 100, unit: 'หลอด' }]);
  });

  it('MP18 qty defaults to 1 for courses missing qty', () => {
    const r = buildBePromotionFromMaster({
      name: 'P', courses: [{ id: 1, name: 'C' }],
    }, '1', NOW);
    expect(r.courses[0].qty).toBe(1);
  });

  it('MP19 id is coerced from function arg (not src.id)', () => {
    const r = buildBePromotionFromMaster({ name: 'P', id: 999 }, 'override-id', NOW);
    expect(r.promotionId).toBe('override-id');
    expect(r.proClinicSourceId).toBe('override-id');
  });

  it('MP20 idempotent re-run yields same shape (except updatedAt)', () => {
    const src = { name: 'Idempot', price: 100, courses: [{ id: 1, name: 'C' }] };
    const r1 = buildBePromotionFromMaster(src, '1', '2026-01-01T00:00:00.000Z', null);
    const r2 = buildBePromotionFromMaster(src, '1', '2026-02-01T00:00:00.000Z', r1.createdAt);
    expect(r2.createdAt).toBe(r1.createdAt);
    expect(r2.updatedAt).not.toBe(r1.updatedAt);
    const { updatedAt: _a, migratedAt: _b, ...r1Rest } = r1;
    const { updatedAt: _c, migratedAt: _d, ...r2Rest } = r2;
    expect(r2Rest).toEqual(r1Rest);
  });
});

describe('buildBeCouponFromMaster — 10 scenarios', () => {
  it('MC1 null src returns null', () => expect(buildBeCouponFromMaster(null, 'c1', NOW)).toBeNull());
  it('MC2 empty name returns null', () => expect(buildBeCouponFromMaster({ name: '' }, 'c1', NOW)).toBeNull());
  it('MC3 accepts src.coupon_name fallback', () => {
    expect(buildBeCouponFromMaster({ coupon_name: 'FallbackName' }, 'c1', NOW).coupon_name).toBe('FallbackName');
  });
  it('MC4 src.name wins over coupon_name', () => {
    expect(buildBeCouponFromMaster({ name: 'A', coupon_name: 'B' }, 'c1', NOW).coupon_name).toBe('A');
  });
  it('MC5 coupon_code defaults empty', () => {
    expect(buildBeCouponFromMaster({ name: 'C' }, 'c1', NOW).coupon_code).toBe('');
  });
  it('MC6 src.code fallback for coupon_code', () => {
    expect(buildBeCouponFromMaster({ name: 'C', code: 'XMAS' }, 'c1', NOW).coupon_code).toBe('XMAS');
  });
  it('MC7 discount_type baht preserved', () => {
    expect(buildBeCouponFromMaster({ name: 'C', discount_type: 'baht' }, 'c1', NOW).discount_type).toBe('baht');
  });
  it('MC8 unknown discount_type defaults to percent', () => {
    expect(buildBeCouponFromMaster({ name: 'C', discount_type: 'dollar' }, 'c1', NOW).discount_type).toBe('percent');
  });
  it('MC9 is_limit_per_user coerced to boolean', () => {
    expect(buildBeCouponFromMaster({ name: 'C', is_limit_per_user: 1 }, 'c1', NOW).is_limit_per_user).toBe(true);
    expect(buildBeCouponFromMaster({ name: 'C', is_limit_per_user: 0 }, 'c1', NOW).is_limit_per_user).toBe(false);
    expect(buildBeCouponFromMaster({ name: 'C' }, 'c1', NOW).is_limit_per_user).toBe(false);
  });
  it('MC10 branch_ids preserved when array, replaced by [] otherwise', () => {
    expect(buildBeCouponFromMaster({ name: 'C', branch_ids: [1, 2] }, 'c1', NOW).branch_ids).toEqual([1, 2]);
    expect(buildBeCouponFromMaster({ name: 'C', branch_ids: 'not-arr' }, 'c1', NOW).branch_ids).toEqual([]);
    expect(buildBeCouponFromMaster({ name: 'C' }, 'c1', NOW).branch_ids).toEqual([]);
  });
});

describe('buildBeVoucherFromMaster — 10 scenarios', () => {
  it('MV1 null src returns null', () => expect(buildBeVoucherFromMaster(null, 'v1', NOW)).toBeNull());
  it('MV2 empty name returns null', () => expect(buildBeVoucherFromMaster({ name: '' }, 'v1', NOW)).toBeNull());
  it('MV3 src.voucher_name fallback', () => {
    expect(buildBeVoucherFromMaster({ voucher_name: 'Fallback' }, 'v1', NOW).voucher_name).toBe('Fallback');
  });
  it('MV4 src.name wins', () => {
    expect(buildBeVoucherFromMaster({ name: 'A', voucher_name: 'B' }, 'v1', NOW).voucher_name).toBe('A');
  });
  it('MV5 sale_price from price field', () => {
    expect(buildBeVoucherFromMaster({ name: 'V', price: 1500 }, 'v1', NOW).sale_price).toBe(1500);
  });
  it('MV6 sale_price from sale_price field (direct)', () => {
    expect(buildBeVoucherFromMaster({ name: 'V', sale_price: 2000 }, 'v1', NOW).sale_price).toBe(2000);
  });
  it('MV7 has_period truthy when period_start set', () => {
    expect(buildBeVoucherFromMaster({ name: 'V', period_start: '2026-01-01' }, 'v1', NOW).has_period).toBe(true);
  });
  it('MV8 has_period false when no dates + no flag', () => {
    expect(buildBeVoucherFromMaster({ name: 'V' }, 'v1', NOW).has_period).toBe(false);
  });
  it('MV9 status suspended preserved', () => {
    expect(buildBeVoucherFromMaster({ name: 'V', status: 'suspended' }, 'v1', NOW).status).toBe('suspended');
  });
  it('MV10 unknown status defaults to active', () => {
    expect(buildBeVoucherFromMaster({ name: 'V', status: 'weird' }, 'v1', NOW).status).toBe('active');
    expect(buildBeVoucherFromMaster({ name: 'V' }, 'v1', NOW).status).toBe('active');
  });
});
