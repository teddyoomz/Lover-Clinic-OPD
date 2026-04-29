// tests/phase16.7-quinquies-commission.test.js — Phase 16.7-quinquies (2026-04-29 session 33)
//
// computeCommissionFromSales coverage. Tests sale.sellers[].percent path +
// commission accumulation per seller + branch filter + adversarial.

import { describe, it, expect } from 'vitest';
import { computeCommissionFromSales } from '../src/lib/payrollHelpers.js';

describe('CM.A — single sale × single seller', () => {
  it('CM.A.1 — percent=10 × netTotal=10000 → commission=1000', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: 10 }],
    }];
    const m = computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' });
    expect(m.get('D-1').totalCommission).toBe(1000);
    expect(m.get('D-1').perSale).toHaveLength(1);
  });
  it('CM.A.2 — percent string="5" works', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: '5' }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).get('D-1').totalCommission).toBe(500);
  });
});

describe('CM.B — multi-seller split', () => {
  it('CM.B.1 — 2 sellers, each percent=5 → each gets ฿500', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: 5 }, { id: 'D-2', percent: 5 }],
    }];
    const m = computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' });
    expect(m.get('D-1').totalCommission).toBe(500);
    expect(m.get('D-2').totalCommission).toBe(500);
  });
});

describe('CM.C — multi-sale aggregation', () => {
  it('CM.C.1 — 2 sales × seller D-1 → totals sum', () => {
    const sales = [
      { saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 10000 }, sellers: [{ id: 'D-1', percent: 5 }] },
      { saleId: 'INV-2', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 20000 }, sellers: [{ id: 'D-1', percent: 5 }] },
    ];
    const m = computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' });
    expect(m.get('D-1').totalCommission).toBe(1500);
    expect(m.get('D-1').perSale).toHaveLength(2);
  });
});

describe('CM.D — percent=0 → no commission (no equal-split)', () => {
  it('CM.D.1 — single seller with percent=0 → empty Map', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: 0 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
});

describe('CM.E — cancelled / refunded → skipped', () => {
  it('CM.E.1 — status=cancelled → skipped', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'cancelled',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: 10 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
  it('CM.E.2 — refunded=true → skipped', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', refunded: true,
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: 10 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
});

describe('CM.F — branch filter', () => {
  it('CM.F.1 — branchIds=[BR-A] excludes BR-B sale', () => {
    const sales = [
      { saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 10000 }, sellers: [{ id: 'D-1', percent: 5 }], branchId: 'BR-A' },
      { saleId: 'INV-2', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 20000 }, sellers: [{ id: 'D-1', percent: 5 }], branchId: 'BR-B' },
    ];
    const m = computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] });
    expect(m.get('D-1').totalCommission).toBe(500);
  });
});

describe('CM.G — id vs sellerId field schema', () => {
  it('CM.G.1 — sellerId field works', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ sellerId: 'D-1', percent: 10 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).get('D-1').totalCommission).toBe(1000);
  });
});

describe('CM.H — adversarial', () => {
  it('CM.H.1 — null sales → empty Map', () => {
    expect(computeCommissionFromSales(null, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
  it('CM.H.2 — sale with no sellers → skipped', () => {
    const sales = [{ saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 10000 }, sellers: [] }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
  it('CM.H.3 — netTotal=0 → no commission', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 0 },
      sellers: [{ id: 'D-1', percent: 10 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
  it('CM.H.4 — share field falls back when percent missing', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', share: 0.1 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).get('D-1').totalCommission).toBe(1000);
  });
});
