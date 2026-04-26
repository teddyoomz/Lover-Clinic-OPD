// ─── Phase 9 — Cross-cutting wiring tests ──────────────────────────────────
// End-to-end wiring through nav → tabs → cover_image display chain +
// migration roundtrip. Catches integration bugs where units pass individually
// but the wire between them drops data.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// ═══════════════════════════════════════════════════════════════════════════
// Part A — Nav config wiring: pinned appointments + all phase 9 tabs present
// ═══════════════════════════════════════════════════════════════════════════
import { NAV_SECTIONS, PINNED_ITEMS, ALL_ITEM_IDS, itemById, sectionOf } from '../src/components/backend/nav/navConfig.js';

describe('Phase 9 nav wiring', () => {
  it('W1 promotions tab lives under "การตลาด" section', () => {
    expect(sectionOf('promotions')).toBe('marketing');
  });

  it('W2 coupons tab lives under "การตลาด"', () => {
    expect(sectionOf('coupons')).toBe('marketing');
  });

  it('W3 vouchers tab lives under "การตลาด"', () => {
    expect(sectionOf('vouchers')).toBe('marketing');
  });

  it('W4 การตลาด section has exactly 3 items (promotion + coupon + voucher)', () => {
    const marketing = NAV_SECTIONS.find(s => s.id === 'marketing');
    expect(marketing.items.map(i => i.id).sort()).toEqual(['coupons', 'promotions', 'vouchers']);
  });

  it('W5 appointments is pinned (user request)', () => {
    expect(PINNED_ITEMS.some(p => p.id === 'appointments')).toBe(true);
  });

  it('W6 marketing labels are Thai', () => {
    expect(itemById('promotions').label).toBe('โปรโมชัน');
    expect(itemById('coupons').label).toBe('คูปอง');
    expect(itemById('vouchers').label).toBe('Voucher');
  });

  it('W7 cmdk palette keywords include both Thai + English', () => {
    expect(itemById('promotions').palette).toMatch(/promotion/);
    expect(itemById('promotions').palette).toMatch(/โปรโมชัน/);
    expect(itemById('coupons').palette).toMatch(/coupon/);
    expect(itemById('coupons').palette).toMatch(/คูปอง/);
    expect(itemById('vouchers').palette).toMatch(/voucher/);
  });

  it('W8 each marketing item has orange accent (palette consistency)', () => {
    expect(itemById('promotions').color).toBe('orange');
    expect(itemById('coupons').color).toBe('orange');
    expect(itemById('vouchers').color).toBe('orange');
  });

  it('W9 legacy deep-link ids preserved (URL compat)', () => {
    expect(ALL_ITEM_IDS).toContain('promotions');
    expect(ALL_ITEM_IDS).toContain('coupons');
    expect(ALL_ITEM_IDS).toContain('vouchers');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part B — Phase 9 mappers roundtrip
// ═══════════════════════════════════════════════════════════════════════════
import { buildBePromotionFromMaster, buildBeCouponFromMaster, buildBeVoucherFromMaster } from '../src/lib/phase9Mappers.js';

const NOW = '2026-04-19T10:00:00.000Z';

describe('Phase 9 migration mapper roundtrip', () => {
  it('M1 master promotion → be_promotions shape preserves promotion_name', () => {
    const result = buildBePromotionFromMaster({ id: '42', name: 'Big Sale', price: '5000' }, '42', NOW);
    expect(result.promotion_name).toBe('Big Sale');
    expect(result.sale_price).toBe(5000);
    expect(result.promotionId).toBe('42');
  });

  it('M2 nested courses[] preserved (incl. products[])', () => {
    const result = buildBePromotionFromMaster({
      id: '42', name: 'X', price: '1000',
      courses: [{ id: 'c1', name: 'Botox', qty: 2, products: [{ id: 'p1', name: 'Nabota 200U', qty: 200, unit: 'U' }] }],
    }, '42', NOW);
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].products).toHaveLength(1);
    expect(result.courses[0].products[0].name).toBe('Nabota 200U');
  });

  it('M3 existing createdAt preserved (no regenerate)', () => {
    const result = buildBePromotionFromMaster(
      { id: '42', name: 'X', price: '1000' },
      '42', NOW, '2026-01-15T00:00:00.000Z'
    );
    expect(result.createdAt).toBe('2026-01-15T00:00:00.000Z');
  });

  it('M4 migratedAt + updatedAt set to now', () => {
    const r = buildBePromotionFromMaster({ id: '1', name: 'X' }, '1', NOW);
    expect(r.migratedAt).toBe(NOW);
    expect(r.updatedAt).toBe(NOW);
  });

  it('M5 idempotent — same input produces same output', () => {
    const master = { id: '1', name: 'A', price: '100', courses: [] };
    const r1 = buildBePromotionFromMaster(master, '1', NOW);
    const r2 = buildBePromotionFromMaster(master, '1', NOW, r1.createdAt);
    expect(r2.createdAt).toBe(r1.createdAt);
    expect(r2.promotion_name).toBe(r1.promotion_name);
    expect(r2.sale_price).toBe(r1.sale_price);
    expect(r2.courses).toEqual(r1.courses);
  });

  it('M6 defaults for unset fields (no undefined leaks)', () => {
    const r = buildBePromotionFromMaster({ id: 'X', name: 'Y' }, 'X', NOW);
    expect(r.sale_price).toBe(0);
    expect(r.courses).toEqual([]);
    expect(r.products).toEqual([]);
    expect(r.cover_image).toBe('');
    expect(r.promotion_type).toBe('fixed');
    expect(r.status).toBe('active');
  });

  it('M7 string price coerces', () => {
    const r = buildBePromotionFromMaster({ id: '1', name: 'X', price: '1500.50' }, '1', NOW);
    expect(r.sale_price).toBe(1500.5);
  });

  it('M8 invalid price → 0', () => {
    const r = buildBePromotionFromMaster({ id: '1', name: 'X', price: 'abc' }, '1', NOW);
    expect(r.sale_price).toBe(0);
  });

  it('M9 null src returns null (not crash)', () => {
    expect(buildBePromotionFromMaster(null, 'X', NOW)).toBeNull();
    expect(buildBePromotionFromMaster(undefined, 'X', NOW)).toBeNull();
  });

  it('M10 empty name → null (guard)', () => {
    expect(buildBePromotionFromMaster({ name: '' }, 'X', NOW)).toBeNull();
    expect(buildBePromotionFromMaster({ name: '   ' }, 'X', NOW)).toBeNull();
  });

  it('M11 coupon mapper preserves code + discount + branches', () => {
    const r = buildBeCouponFromMaster({
      name: 'New Year',
      coupon_code: 'NY2026',
      discount: '15',
      discount_type: 'baht',
      max_qty: 50,
      is_limit_per_user: true,
      branch_ids: [28, 29],
    }, 'C1', NOW);
    expect(r.coupon_name).toBe('New Year');
    expect(r.coupon_code).toBe('NY2026');
    expect(r.discount).toBe(15);
    expect(r.discount_type).toBe('baht');
    expect(r.max_qty).toBe(50);
    expect(r.is_limit_per_user).toBe(true);
    expect(r.branch_ids).toEqual([28, 29]);
    expect(r.couponId).toBe('C1');
  });

  it('M12 voucher mapper: platform + commission + period detection', () => {
    const r = buildBeVoucherFromMaster({
      name: 'HDmall Voucher',
      price: '1500',
      commission_percent: '12.5',
      platform: 'HDmall',
      period_start: '2026-06-01',
      period_end: '2026-06-30',
    }, 'V1', NOW);
    expect(r.voucher_name).toBe('HDmall Voucher');
    expect(r.sale_price).toBe(1500);
    expect(r.commission_percent).toBe(12.5);
    expect(r.platform).toBe('HDmall');
    expect(r.has_period).toBe(true); // auto-inferred from period_start presence
    expect(r.period_start).toBe('2026-06-01');
    expect(r.voucherId).toBe('V1');
  });

  it('M13 voucher default status is "active"', () => {
    const r = buildBeVoucherFromMaster({ name: 'V' }, '1', NOW);
    expect(r.status).toBe('active');
  });

  it('M14 voucher suspended status preserved', () => {
    const r = buildBeVoucherFromMaster({ name: 'V', status: 'suspended' }, '1', NOW);
    expect(r.status).toBe('suspended');
  });

  it('M15 coupon without coupon_code → empty string (not null)', () => {
    const r = buildBeCouponFromMaster({ name: 'X' }, '1', NOW);
    expect(r.coupon_code).toBe('');
    expect(typeof r.coupon_code).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part C — cover_image roundtrip through PromotionTab card rendering
// ═══════════════════════════════════════════════════════════════════════════
vi.mock('../src/lib/backendClient.js', () => ({
  listPromotions: vi.fn(),
  deletePromotion: vi.fn(),
  savePromotion: vi.fn(),
  getAllMasterDataItems: vi.fn(async () => []),
}));
vi.mock('../src/components/backend/PromotionFormModal.jsx', () => ({ default: () => null }));

import PromotionTab from '../src/components/backend/PromotionTab.jsx';
import { listPromotions } from '../src/lib/backendClient.js';

describe('cover_image wiring — PromotionTab render chain', () => {
  beforeEach(() => vi.clearAllMocks());

  it('C1 Firestore-stored cover_image URL → <img src=...>', async () => {
    listPromotions.mockResolvedValue([{
      promotionId: 'P1', id: 'P1', promotion_name: 'X', sale_price: 100, status: 'active',
      cover_image: 'https://example.com/promo.jpg',
    }]);
    const { container } = render(<PromotionTab clinicSettings={{ accentColor: '#dc2626' }} theme="dark" />);
    await waitFor(() => expect(screen.getByText('X')).toBeInTheDocument());
    const img = container.querySelector('img[src="https://example.com/promo.jpg"]');
    expect(img).toBeTruthy();
  });

  it('C2 Firestore null cover_image → fallback Tag icon', async () => {
    listPromotions.mockResolvedValue([{
      promotionId: 'P1', id: 'P1', promotion_name: 'X', sale_price: 100, status: 'active',
      cover_image: null,
    }]);
    const { container } = render(<PromotionTab clinicSettings={{ accentColor: '#dc2626' }} />);
    await waitFor(() => expect(screen.getByText('X')).toBeInTheDocument());
    expect(container.querySelector('img')).toBeNull();
    // Fallback Tag icon SVG visible
    const thumb = container.querySelector('.w-12.h-12');
    expect(thumb.querySelector('svg')).toBeTruthy();
  });

  it('C3 missing cover_image field (legacy doc) → fallback icon', async () => {
    listPromotions.mockResolvedValue([{
      promotionId: 'P1', id: 'P1', promotion_name: 'X', sale_price: 100, status: 'active',
    }]);
    const { container } = render(<PromotionTab clinicSettings={{ accentColor: '#dc2626' }} />);
    await waitFor(() => expect(screen.getByText('X')).toBeInTheDocument());
    expect(container.querySelector('img')).toBeNull();
  });

  it('C4 10 promotions: mix of with/without cover → each card correct', async () => {
    listPromotions.mockResolvedValue([
      { promotionId: 'P1', id: 'P1', promotion_name: 'with', sale_price: 100, status: 'active', cover_image: 'https://x.com/1.jpg' },
      { promotionId: 'P2', id: 'P2', promotion_name: 'without', sale_price: 200, status: 'active' },
      { promotionId: 'P3', id: 'P3', promotion_name: 'with', sale_price: 300, status: 'active', cover_image: 'https://x.com/3.jpg' },
    ]);
    const { container } = render(<PromotionTab clinicSettings={{ accentColor: '#dc2626' }} />);
    await waitFor(() => expect(screen.getAllByText('with').length).toBeGreaterThan(0));
    expect(container.querySelectorAll('img').length).toBe(2); // only 2 cards have URLs
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part D — Marketing entity ID format
// ═══════════════════════════════════════════════════════════════════════════
import { generateMarketingId } from '../src/lib/marketingUiUtils.js';

describe('Marketing ID format wiring — no collision with ProClinic pc_* ids', () => {
  it('D1 promotion id format: PROMO-<ts>-<8 hex>', () => {
    expect(generateMarketingId('PROMO')).toMatch(/^PROMO-\d{10,}-[0-9a-f]{8}$/);
  });
  it('D2 coupon id format: COUP-<ts>-<8 hex>', () => {
    expect(generateMarketingId('COUP')).toMatch(/^COUP-\d{10,}-[0-9a-f]{8}$/);
  });
  it('D3 voucher id format: VOUC-<ts>-<8 hex>', () => {
    expect(generateMarketingId('VOUC')).toMatch(/^VOUC-\d{10,}-[0-9a-f]{8}$/);
  });
  it('D4 no collision with ProClinic numeric ids', () => {
    const id = generateMarketingId('PROMO');
    expect(id).not.toMatch(/^\d+$/);
  });
  it('D5 1000 IDs with same prefix all unique', () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(generateMarketingId('PROMO'));
    expect(seen.size).toBe(1000);
  });
});
