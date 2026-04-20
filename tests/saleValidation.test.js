// ─── Phase 12.9 · sale validator adversarial tests ───────────────────────
import { describe, it, expect } from 'vitest';
import {
  validateSaleStrict, normalizeSale, emptySaleForm,
  STATUS_OPTIONS, DISCOUNT_TYPE_OPTIONS, MAX_SELLERS, MAX_PAYMENT_METHODS,
} from '../src/lib/saleValidation.js';

const base = (over = {}) => ({
  ...emptySaleForm(),
  customerId: 'CUST-1',
  saleDate: '2026-04-20',
  items: [{ productId: 'PROD-1', qty: 1, price: 100 }],
  billing: { netTotal: 100 },
  ...over,
});

describe('validateSaleStrict — required + items', () => {
  it('SV1: null/array rejected', () => {
    expect(validateSaleStrict(null)?.[0]).toBe('form');
    expect(validateSaleStrict([])?.[0]).toBe('form');
  });
  it('SV2: missing customerId rejected', () => {
    expect(validateSaleStrict({ ...base(), customerId: '' })?.[0]).toBe('customerId');
  });
  it('SV3: empty items array rejected', () => {
    expect(validateSaleStrict({ ...base(), items: [] })?.[0]).toBe('items');
  });
  it('SV4: item without productId or courseId rejected', () => {
    expect(validateSaleStrict({ ...base(), items: [{ qty: 1, price: 100 }] })?.[0]).toBe('items');
  });
  it('SV5: item with BOTH productId and courseId rejected', () => {
    expect(validateSaleStrict({ ...base(), items: [{ productId: 'P1', courseId: 'C1', qty: 1, price: 100 }] })?.[0]).toBe('items');
  });
  it('SV6: item qty ≤ 0 rejected', () => {
    expect(validateSaleStrict({ ...base(), items: [{ productId: 'P1', qty: 0, price: 100 }] })?.[0]).toBe('items');
  });
  it('SV7: item negative price rejected', () => {
    expect(validateSaleStrict({ ...base(), items: [{ productId: 'P1', qty: 1, price: -1 }] })?.[0]).toBe('items');
  });
  it('SV8: course-only item accepted', () => {
    expect(validateSaleStrict({ ...base(), items: [{ courseId: 'C1', qty: 1, price: 1000 }] })).toBeNull();
  });
  it('SV9: negative netTotal rejected', () => {
    expect(validateSaleStrict({ ...base(), billing: { netTotal: -1 } })?.[0]).toBe('netTotal');
  });
  it('SV10: minimal valid sale accepted', () => {
    expect(validateSaleStrict(base())).toBeNull();
  });
});

describe('validateSaleStrict — 5 sellers', () => {
  it('SV11: sellers > 5 rejected', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ sellerId: `S${i+1}`, percent: 16.67, total: 16.67 }));
    expect(validateSaleStrict({ ...base(), sellers: six })?.[0]).toBe('sellers');
  });
  it('SV12: MAX_SELLERS is 5', () => expect(MAX_SELLERS).toBe(5));
  it('SV13: duplicate sellerId rejected', () => {
    expect(validateSaleStrict({ ...base(), sellers: [
      { sellerId: 'S1', percent: 50, total: 50 },
      { sellerId: 'S1', percent: 50, total: 50 },
    ] })?.[0]).toBe('sellers');
  });
  it('SV14: seller percent > 100 rejected', () => {
    expect(validateSaleStrict({ ...base(), sellers: [{ sellerId: 'S1', percent: 150, total: 100 }] })?.[0]).toBe('sellers');
  });
  it('SV15: sum percent != 100 rejected', () => {
    expect(validateSaleStrict({ ...base(), sellers: [
      { sellerId: 'S1', percent: 60, total: 60 },
      { sellerId: 'S2', percent: 30, total: 30 },
    ] })?.[0]).toBe('sellers');
  });
  it('SV16: sum total != netTotal rejected', () => {
    expect(validateSaleStrict({ ...base(), billing: { netTotal: 100 }, sellers: [
      { sellerId: 'S1', percent: 100, total: 99 },
    ] })?.[0]).toBe('sellers');
  });
  it('SV17: 5 sellers 20%/20 each accepted', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ sellerId: `S${i+1}`, percent: 20, total: 20 }));
    expect(validateSaleStrict({ ...base(), billing: { netTotal: 100 }, sellers: five })).toBeNull();
  });
  it('SV18: empty sellers OK (single-seller legacy)', () => {
    expect(validateSaleStrict({ ...base(), sellers: [] })).toBeNull();
  });
});

describe('validateSaleStrict — 3 payment methods', () => {
  it('SV19: payments > 3 rejected', () => {
    expect(validateSaleStrict({ ...base(), payments: [
      { method: 'เงินสด', amount: 30 }, { method: 'โอน', amount: 30 },
      { method: 'QR', amount: 30 }, { method: 'Credit', amount: 10 },
    ] })?.[0]).toBe('payments');
  });
  it('SV20: MAX_PAYMENT_METHODS = 3', () => expect(MAX_PAYMENT_METHODS).toBe(3));
  it('SV21: payment without method rejected', () => {
    expect(validateSaleStrict({ ...base(), payments: [{ amount: 100 }] })?.[0]).toBe('payments');
  });
  it('SV22: payment negative amount rejected', () => {
    expect(validateSaleStrict({ ...base(), payments: [{ method: 'cash', amount: -1 }] })?.[0]).toBe('payments');
  });
  it('SV23: sum payments != totalPaidAmount rejected', () => {
    expect(validateSaleStrict({ ...base(), totalPaidAmount: 100, payments: [
      { method: 'cash', amount: 90 },
    ] })?.[0]).toBe('payments');
  });
  it('SV24: 3 payments splitting totalPaidAmount accepted', () => {
    expect(validateSaleStrict({ ...base(), totalPaidAmount: 100, payments: [
      { method: 'cash', amount: 40 },
      { method: 'transfer', amount: 35 },
      { method: 'QR', amount: 25 },
    ] })).toBeNull();
  });
});

describe('validateSaleStrict — deposit + wallet', () => {
  it('SV25: usingDeposit without amount rejected', () => {
    expect(validateSaleStrict({ ...base(), usingDeposit: true })?.[0]).toBe('deposit');
  });
  it('SV26: usingDeposit + deposit>0 accepted', () => {
    expect(validateSaleStrict({ ...base(), usingDeposit: true, deposit: 50 })).toBeNull();
  });
  it('SV27: usingWallet without walletId rejected', () => {
    expect(validateSaleStrict({ ...base(), usingWallet: true })?.[0]).toBe('customerWalletId');
  });
  it('SV28: usingWallet without credit rejected', () => {
    expect(validateSaleStrict({ ...base(), usingWallet: true, customerWalletId: 'W1' })?.[0]).toBe('credit');
  });
  it('SV29: usingWallet + walletId + credit accepted', () => {
    expect(validateSaleStrict({ ...base(), usingWallet: true, customerWalletId: 'W1', credit: 20 })).toBeNull();
  });
});

describe('validateSaleStrict — discount + status', () => {
  it('SV30: negative discount rejected', () => {
    expect(validateSaleStrict({ ...base(), discount: -5 })?.[0]).toBe('discount');
  });
  it('SV31: unknown discountType rejected', () => {
    expect(validateSaleStrict({ ...base(), discountType: 'gift' })?.[0]).toBe('discountType');
  });
  it('SV32: percent discount > 100 rejected', () => {
    expect(validateSaleStrict({ ...base(), discountType: 'percent', discount: 150 })?.[0]).toBe('discount');
  });
  it('SV33: each enumerated status accepted', () => {
    for (const s of STATUS_OPTIONS) {
      const f = s === 'cancelled'
        ? { ...base(), status: s, cancelDetail: 'x', cancelledAt: '2026-04-20' }
        : { ...base(), status: s };
      expect(validateSaleStrict(f)).toBeNull();
    }
  });
  it('SV34: cancelled without cancelDetail rejected', () => {
    expect(validateSaleStrict({ ...base(), status: 'cancelled' })?.[0]).toBe('cancelDetail');
  });
  it('SV35: cancelled without cancelledAt rejected', () => {
    expect(validateSaleStrict({ ...base(), status: 'cancelled', cancelDetail: 'x' })?.[0]).toBe('cancelledAt');
  });
  it('SV36: refundValue > totalPaidAmount rejected', () => {
    expect(validateSaleStrict({ ...base(), refunded: true, totalPaidAmount: 100, refundValue: 150 })?.[0]).toBe('refundValue');
  });
  it('SV37: refundValue = totalPaidAmount accepted', () => {
    expect(validateSaleStrict({ ...base(), refunded: true, totalPaidAmount: 100, refundValue: 100 })).toBeNull();
  });
  it('SV38: saleDate bad format rejected', () => {
    expect(validateSaleStrict({ ...base(), saleDate: '20/04/2026' })?.[0]).toBe('saleDate');
  });
});

describe('normalizeSale', () => {
  it('SN1: caps sellers at 5', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ sellerId: `S${i+1}`, percent: 11, total: 11 }));
    expect(normalizeSale({ ...base(), sellers: nine }).sellers).toHaveLength(5);
  });
  it('SN2: caps payments at 3', () => {
    const five = [
      { method: 'a', amount: 20 }, { method: 'b', amount: 20 },
      { method: 'c', amount: 20 }, { method: 'd', amount: 20 }, { method: 'e', amount: 20 },
    ];
    expect(normalizeSale({ ...base(), payments: five }).payments).toHaveLength(3);
  });
  it('SN3: drops payments with zero amount', () => {
    expect(normalizeSale({ ...base(), payments: [
      { method: 'cash', amount: 100 },
      { method: 'transfer', amount: 0 },
    ]}).payments).toHaveLength(1);
  });
  it('SN4: invalid status → draft', () => {
    expect(normalizeSale({ ...base(), status: 'weird' }).status).toBe('draft');
  });
  it('SN5: supports legacy snake_case seller keys', () => {
    const n = normalizeSale({ ...base(), sellers: [{ seller_id: 'S1', sale_percent: 100, sale_total: 100 }] });
    expect(n.sellers[0].sellerId).toBe('S1');
    expect(n.sellers[0].percent).toBe(100);
  });
  it('SN6: supports legacy snake_case payment keys', () => {
    const n = normalizeSale({ ...base(), payments: [{ payment_method: 'cash', paid_amount: 100 }] });
    expect(n.payments[0].method).toBe('cash');
    expect(n.payments[0].amount).toBe(100);
  });
});
