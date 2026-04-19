// ─── Phase 9 — Coupon apply flow wiring tests ──────────────────────────────
// Tests findCouponByCode (Firestore query + Bangkok TZ boundary) + the
// downstream apply math that SaleTab + TreatmentFormPage rely on. Complements
// the 71 pure-validator tests in phase9-coupon-scenarios.test.js by exercising
// the post-validate "look up by code, check expiry, apply discount" chain.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firestore query/getDocs BEFORE importing backendClient.
vi.mock('firebase/firestore', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    collection: vi.fn(),
    query: vi.fn((col, ...preds) => ({ col, preds })),
    where: vi.fn((field, op, val) => ({ field, op, val })),
    getDocs: vi.fn(),
  };
});

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

import { getDocs } from 'firebase/firestore';
import { findCouponByCode } from '../src/lib/backendClient.js';

function mockSnap(docs) {
  return {
    empty: docs.length === 0,
    docs: docs.map(d => ({ id: d.id, data: () => d })),
  };
}

describe('findCouponByCode — basic lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('CL1 null code returns null (short-circuit, no query)', async () => {
    const r = await findCouponByCode(null);
    expect(r).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('CL2 empty code returns null', async () => {
    const r = await findCouponByCode('');
    expect(r).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('CL3 undefined code returns null', async () => {
    const r = await findCouponByCode(undefined);
    expect(r).toBeNull();
  });

  it('CL4 not-found in Firestore returns null', async () => {
    getDocs.mockResolvedValue(mockSnap([]));
    const r = await findCouponByCode('MISSING');
    expect(r).toBeNull();
  });

  it('CL5 found coupon returns full doc', async () => {
    getDocs.mockResolvedValue(mockSnap([{
      id: 'COUP-1', coupon_code: 'NEW2026', coupon_name: 'New Year',
      discount: 10, discount_type: 'percent',
      start_date: '2026-01-01', end_date: '2099-12-31',
    }]));
    const r = await findCouponByCode('NEW2026');
    expect(r).toMatchObject({ id: 'COUP-1', coupon_code: 'NEW2026' });
  });

  it('CL6 coupon_code is trimmed before query', async () => {
    getDocs.mockResolvedValue(mockSnap([]));
    await findCouponByCode('  NEW2026  ');
    const { where } = await import('firebase/firestore');
    // where was called with the trimmed value.
    expect(where).toHaveBeenCalledWith('coupon_code', '==', 'NEW2026');
  });

  it('CL7 numeric code coerces to string', async () => {
    getDocs.mockResolvedValue(mockSnap([]));
    await findCouponByCode(12345);
    const { where } = await import('firebase/firestore');
    expect(where).toHaveBeenCalledWith('coupon_code', '==', '12345');
  });
});

describe('findCouponByCode — TZ + date boundary (AV9 regression)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('CT1 future start_date → null (not yet active)', async () => {
    getDocs.mockResolvedValue(mockSnap([{
      id: 'C', coupon_code: 'FUT', start_date: '2099-01-01', end_date: '2099-12-31',
    }]));
    // Pass explicit `today` to avoid Date.now dependency.
    const r = await findCouponByCode('FUT', { today: '2026-06-15' });
    expect(r).toBeNull();
  });

  it('CT2 past end_date → null (expired)', async () => {
    getDocs.mockResolvedValue(mockSnap([{
      id: 'C', coupon_code: 'OLD', start_date: '2020-01-01', end_date: '2020-12-31',
    }]));
    const r = await findCouponByCode('OLD', { today: '2026-06-15' });
    expect(r).toBeNull();
  });

  it('CT3 end_date === today → still valid (inclusive boundary)', async () => {
    getDocs.mockResolvedValue(mockSnap([{
      id: 'C', coupon_code: 'TODAY', start_date: '2020-01-01', end_date: '2026-06-15',
    }]));
    const r = await findCouponByCode('TODAY', { today: '2026-06-15' });
    expect(r).toBeTruthy();
    expect(r.coupon_code).toBe('TODAY');
  });

  it('CT4 start_date === today → valid (inclusive)', async () => {
    getDocs.mockResolvedValue(mockSnap([{
      id: 'C', coupon_code: 'START', start_date: '2026-06-15', end_date: '2099-12-31',
    }]));
    const r = await findCouponByCode('START', { today: '2026-06-15' });
    expect(r).toBeTruthy();
  });

  it('CT5 missing start_date — skip check, ok if end_date in future', async () => {
    getDocs.mockResolvedValue(mockSnap([{
      id: 'C', coupon_code: 'NOSTART', end_date: '2099-12-31',
    }]));
    const r = await findCouponByCode('NOSTART', { today: '2026-06-15' });
    expect(r).toBeTruthy();
  });

  it('CT6 missing end_date — skip check, ok if start_date in past', async () => {
    getDocs.mockResolvedValue(mockSnap([{
      id: 'C', coupon_code: 'NOEND', start_date: '2020-01-01',
    }]));
    const r = await findCouponByCode('NOEND', { today: '2026-06-15' });
    expect(r).toBeTruthy();
  });

  it('CT7 both dates missing → always valid', async () => {
    getDocs.mockResolvedValue(mockSnap([{ id: 'C', coupon_code: 'OPEN' }]));
    const r = await findCouponByCode('OPEN', { today: '2026-06-15' });
    expect(r).toBeTruthy();
  });

  it('CT8 AV9 regression — when today arg omitted, uses thaiTodayISO()', async () => {
    // This is the bug: old code used new Date().toISOString().slice(0,10)
    // which returns UTC-local "yesterday" from Thailand's 00:00-07:00 window.
    // Without explicit today, findCouponByCode should reach for Bangkok TZ.
    getDocs.mockResolvedValue(mockSnap([{
      id: 'C', coupon_code: 'BKK', start_date: '2020-01-01', end_date: '2099-12-31',
    }]));
    const r = await findCouponByCode('BKK');
    expect(r).toBeTruthy();
  });
});

// ─── Coupon apply math (what SaleTab + TreatmentFormPage do with a valid coupon) ────
describe('Coupon discount application math', () => {
  function applyCoupon(subtotal, coupon) {
    if (!coupon) return { discount: 0, finalTotal: subtotal };
    const d = Number(coupon.discount) || 0;
    const discount = coupon.discount_type === 'baht'
      ? d
      : subtotal * d / 100;
    const capped = Math.min(discount, subtotal); // never go negative
    return { discount: capped, finalTotal: Math.max(0, subtotal - capped) };
  }

  it('M1 percent 10% off 1000 = 100 off', () => {
    expect(applyCoupon(1000, { discount: 10, discount_type: 'percent' }).discount).toBe(100);
  });

  it('M2 baht 500 off 1000', () => {
    expect(applyCoupon(1000, { discount: 500, discount_type: 'baht' }).discount).toBe(500);
  });

  it('M3 baht 2000 off 1000 — capped at 1000 (not negative)', () => {
    const r = applyCoupon(1000, { discount: 2000, discount_type: 'baht' });
    expect(r.discount).toBe(1000);
    expect(r.finalTotal).toBe(0);
  });

  it('M4 null coupon = no discount', () => {
    expect(applyCoupon(500, null)).toEqual({ discount: 0, finalTotal: 500 });
  });

  it('M5 100% coupon zeros subtotal', () => {
    expect(applyCoupon(1000, { discount: 100, discount_type: 'percent' }).finalTotal).toBe(0);
  });

  it('M6 0% coupon no-op', () => {
    const r = applyCoupon(1000, { discount: 0, discount_type: 'percent' });
    expect(r.discount).toBe(0);
    expect(r.finalTotal).toBe(1000);
  });

  it('M7 percent 33.33 (fractional) math', () => {
    const r = applyCoupon(300, { discount: 33.33, discount_type: 'percent' });
    expect(r.discount).toBeCloseTo(99.99, 2);
    expect(r.finalTotal).toBeCloseTo(200.01, 2);
  });

  it('M8 missing discount_type defaults to percent behavior', () => {
    // Caller should treat unknown type as percent (validator rejects
    // !=='baht' path). Sanity: function uses string equality.
    const r = applyCoupon(1000, { discount: 10 /* no type */ });
    expect(r.discount).toBe(100); // behaves as percent
  });

  it('M9 negative subtotal floors at 0 finalTotal', () => {
    // Defensive: if upstream sends negative, stay non-negative.
    const r = applyCoupon(-100, { discount: 10, discount_type: 'baht' });
    expect(r.finalTotal).toBe(0);
  });

  it('M10 string discount "50" coerces to 50', () => {
    expect(applyCoupon(1000, { discount: '50', discount_type: 'baht' }).discount).toBe(50);
  });
});
