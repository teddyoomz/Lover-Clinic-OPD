// ─── Phase 12.4 · deposit validation adversarial tests ───────────────────
import { describe, it, expect } from 'vitest';
import {
  validateDeposit, normalizeDeposit, emptyDepositForm, distributeDepositEvenly,
  MAX_SELLERS, STATUS_OPTIONS,
} from '../src/lib/depositValidation.js';

const base = (over = {}) => ({
  ...emptyDepositForm(),
  customerId: 'CUST-1',
  customerName: 'สมชาย',
  amount: 1000,
  paymentChannel: 'เงินสด',
  paymentDate: '2026-04-20',
  ...over,
});

describe('validateDeposit — strict required-field gate', () => {
  it('DV1: null/array rejected', () => {
    expect(validateDeposit(null)?.[0]).toBe('form');
    expect(validateDeposit([])?.[0]).toBe('form');
  });
  it('DV2: strict requires customerId', () => {
    expect(validateDeposit({ ...base(), customerId: '' }, { strict: true })?.[0]).toBe('customerId');
  });
  it('DV3: strict requires paymentChannel', () => {
    expect(validateDeposit({ ...base(), paymentChannel: '' }, { strict: true })?.[0]).toBe('paymentChannel');
  });
  it('DV4: strict rejects zero amount', () => {
    expect(validateDeposit({ ...base(), amount: 0 }, { strict: true })?.[0]).toBe('amount');
  });
  it('DV5: non-strict allows zero amount', () => {
    expect(validateDeposit({ ...base(), amount: 0 })).toBeNull();
  });
  it('DV6: amount must be number', () => {
    expect(validateDeposit({ ...base(), amount: 'abc' })?.[0]).toBe('amount');
  });
  it('DV7: negative amount rejected', () => {
    expect(validateDeposit({ ...base(), amount: -100 })?.[0]).toBe('amount');
  });
  it('DV8: paymentDate must be YYYY-MM-DD', () => {
    expect(validateDeposit({ ...base(), paymentDate: '20/04/2026' })?.[0]).toBe('paymentDate');
  });
  it('DV9: empty paymentDate allowed', () => {
    expect(validateDeposit({ ...base(), paymentDate: '' })).toBeNull();
  });
  it('DV10: valid strict accepted', () => {
    expect(validateDeposit(base(), { strict: true })).toBeNull();
  });
});

describe('validateDeposit — 5 sellers', () => {
  it('DV11: sellers must be array', () => {
    expect(validateDeposit({ ...base(), sellers: 'S1' })?.[0]).toBe('sellers');
  });
  it('DV12: seller count > 5 rejected', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ sellerId: `S${i+1}`, percent: 16.67, total: 166.67 }));
    expect(validateDeposit({ ...base(), sellers: six })?.[0]).toBe('sellers');
  });
  it('DV13: MAX_SELLERS is 5', () => {
    expect(MAX_SELLERS).toBe(5);
  });
  it('DV14: empty seller id rejected', () => {
    expect(validateDeposit({ ...base(), sellers: [{ sellerId: '', percent: 100, total: 1000 }] })?.[0]).toBe('sellers');
  });
  it('DV15: duplicate seller id rejected', () => {
    expect(validateDeposit({ ...base(), sellers: [
      { sellerId: 'S1', percent: 50, total: 500 },
      { sellerId: 'S1', percent: 50, total: 500 },
    ]})?.[0]).toBe('sellers');
  });
  it('DV16: percent > 100 rejected', () => {
    expect(validateDeposit({ ...base(), sellers: [{ sellerId: 'S1', percent: 150, total: 1000 }] })?.[0]).toBe('sellers');
  });
  it('DV17: negative percent rejected', () => {
    expect(validateDeposit({ ...base(), sellers: [{ sellerId: 'S1', percent: -10, total: 0 }] })?.[0]).toBe('sellers');
  });
  it('DV18: negative total rejected', () => {
    expect(validateDeposit({ ...base(), sellers: [{ sellerId: 'S1', percent: 100, total: -1 }] })?.[0]).toBe('sellers');
  });
  it('DV19: single 100% seller matching amount accepted', () => {
    expect(validateDeposit({ ...base(), sellers: [{ sellerId: 'S1', percent: 100, total: 1000 }] })).toBeNull();
  });
  it('DV20: 2 sellers split 60/40 accepted', () => {
    expect(validateDeposit({ ...base(), sellers: [
      { sellerId: 'S1', percent: 60, total: 600 },
      { sellerId: 'S2', percent: 40, total: 400 },
    ]})).toBeNull();
  });
  it('DV21: sum percent != 100 rejected', () => {
    expect(validateDeposit({ ...base(), sellers: [
      { sellerId: 'S1', percent: 60, total: 600 },
      { sellerId: 'S2', percent: 30, total: 300 },
    ]})?.[0]).toBe('sellers');
  });
  it('DV22: sum total != amount rejected', () => {
    expect(validateDeposit({ ...base(), amount: 1000, sellers: [
      { sellerId: 'S1', percent: 100, total: 999 },
    ]})?.[0]).toBe('sellers');
  });
  it('DV23: 5 sellers 20% each accepted', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ sellerId: `S${i+1}`, percent: 20, total: 200 }));
    expect(validateDeposit({ ...base(), sellers: five })).toBeNull();
  });
  it('DV24: rounding tolerance allows 33.33 + 33.33 + 33.34 == 100', () => {
    expect(validateDeposit({ ...base(), amount: 300, sellers: [
      { sellerId: 'S1', percent: 33.33, total: 99.99 },
      { sellerId: 'S2', percent: 33.33, total: 99.99 },
      { sellerId: 'S3', percent: 33.34, total: 100.02 },
    ]})).toBeNull();
  });
  it('DV25: accepts legacy shape with sale_percent / sale_total keys', () => {
    expect(validateDeposit({ ...base(), sellers: [
      { sellerId: 'S1', sale_percent: 100, sale_total: 1000 },
    ]})).toBeNull();
  });
  it('DV26: empty sellers array OK (single-seller legacy flow)', () => {
    expect(validateDeposit({ ...base(), sellers: [] })).toBeNull();
  });
});

describe('validateDeposit — refund + balance invariants', () => {
  it('DV27: refundAmount > amount rejected', () => {
    expect(validateDeposit({ ...base(), amount: 1000, refundAmount: 1500 })?.[0]).toBe('refundAmount');
  });
  it('DV28: refundAmount < 0 rejected', () => {
    expect(validateDeposit({ ...base(), refundAmount: -50 })?.[0]).toBe('refundAmount');
  });
  it('DV29: refundAmount = amount accepted', () => {
    expect(validateDeposit({ ...base(), amount: 1000, refundAmount: 1000 })).toBeNull();
  });
  it('DV30: used + remaining != amount rejected', () => {
    expect(validateDeposit({ ...base(), amount: 1000, usedAmount: 400, remainingAmount: 500 })?.[0]).toBe('amount');
  });
  it('DV31: used + remaining == amount accepted', () => {
    expect(validateDeposit({ ...base(), amount: 1000, usedAmount: 400, remainingAmount: 600 })).toBeNull();
  });
  it('DV32: each enumerated status accepted', () => {
    for (const s of STATUS_OPTIONS) {
      expect(validateDeposit({ ...base(), status: s })).toBeNull();
    }
  });
  it('DV33: unknown status rejected', () => {
    expect(validateDeposit({ ...base(), status: 'archived' })?.[0]).toBe('status');
  });
});

describe('normalizeDeposit', () => {
  it('DN1: coerces numeric strings', () => {
    const n = normalizeDeposit({ ...base(), amount: '1500', usedAmount: '500' });
    expect(n.amount).toBe(1500);
    expect(n.usedAmount).toBe(500);
    expect(n.remainingAmount).toBe(1000);
  });
  it('DN2: caps sellers at 5', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ sellerId: `S${i+1}`, percent: 11.11, total: 111.11 }));
    const n = normalizeDeposit({ ...base(), sellers: nine });
    expect(n.sellers).toHaveLength(5);
  });
  it('DN3: drops sellers with empty sellerId', () => {
    const n = normalizeDeposit({ ...base(), sellers: [
      { sellerId: 'S1', percent: 50, total: 500 },
      { sellerId: '', percent: 50, total: 500 },
    ]});
    expect(n.sellers).toHaveLength(1);
  });
  it('DN4: snake_case sale_percent / sale_total → percent / total', () => {
    const n = normalizeDeposit({ ...base(), sellers: [
      { sellerId: 'S1', sale_percent: 80, sale_total: 800 },
    ]});
    expect(n.sellers[0].percent).toBe(80);
    expect(n.sellers[0].total).toBe(800);
  });
  it('DN5: invalid status → active', () => {
    expect(normalizeDeposit({ ...base(), status: 'weird' }).status).toBe('active');
  });
});

describe('distributeDepositEvenly', () => {
  it('DE1: empty input → empty output', () => {
    expect(distributeDepositEvenly(1000, [])).toEqual([]);
  });
  it('DE2: > MAX_SELLERS throws', () => {
    expect(() => distributeDepositEvenly(1000, ['S1','S2','S3','S4','S5','S6'])).toThrow();
  });
  it('DE3: single seller gets 100%', () => {
    const out = distributeDepositEvenly(1000, ['S1']);
    expect(out).toEqual([{ sellerId: 'S1', percent: 100, total: 1000 }]);
  });
  it('DE4: 3 sellers split with last absorbing rounding', () => {
    const out = distributeDepositEvenly(1000, ['S1','S2','S3']);
    expect(out).toHaveLength(3);
    const pctSum = out.reduce((a, s) => a + s.percent, 0);
    const totSum = out.reduce((a, s) => a + s.total, 0);
    expect(Math.abs(pctSum - 100)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(totSum - 1000)).toBeLessThanOrEqual(0.01);
  });
  it('DE5: output passes validateDeposit', () => {
    const sellers = distributeDepositEvenly(1000, ['S1','S2','S3']);
    expect(validateDeposit({ ...base(), sellers })).toBeNull();
  });
  it('DE6: 5 sellers produce sum = 100 / amount', () => {
    const sellers = distributeDepositEvenly(500, ['A','B','C','D','E']);
    const pctSum = sellers.reduce((a, s) => a + s.percent, 0);
    const totSum = sellers.reduce((a, s) => a + s.total, 0);
    expect(Math.abs(pctSum - 100)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(totSum - 500)).toBeLessThanOrEqual(0.01);
  });
});
