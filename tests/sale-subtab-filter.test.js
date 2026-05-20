import { describe, it, expect } from 'vitest';
import { isCancelledSale, filterSalesBySubTab } from '../src/lib/saleSubTabFilter.js';

const A = { saleId: 'INV-1', status: 'completed', payment: { status: 'paid' } };
const A2 = { saleId: 'INV-2', payment: { status: 'unpaid' } };          // no top-level status
const C = { saleId: 'INV-3', status: 'cancelled', payment: { status: 'paid' } };

describe('saleSubTabFilter — A. predicate', () => {
  it('A.1 cancelled sale → true', () => expect(isCancelledSale(C)).toBe(true));
  it('A.2 completed sale → false', () => expect(isCancelledSale(A)).toBe(false));
  it('A.3 missing status → false', () => expect(isCancelledSale(A2)).toBe(false));
  it('A.4 null/undefined → false', () => {
    expect(isCancelledSale(null)).toBe(false);
    expect(isCancelledSale(undefined)).toBe(false);
  });
});

describe('saleSubTabFilter — B. partition', () => {
  const sales = [A, A2, C];
  it('B.1 active tab excludes cancelled', () => {
    const r = filterSalesBySubTab(sales, 'active');
    expect(r).toHaveLength(2);
    expect(r.every((s) => s.status !== 'cancelled')).toBe(true);
  });
  it('B.2 cancelled tab keeps only cancelled', () => {
    const r = filterSalesBySubTab(sales, 'cancelled');
    expect(r).toHaveLength(1);
    expect(r[0].saleId).toBe('INV-3');
  });
  it('B.3 unknown subTab defaults to active behaviour', () => {
    expect(filterSalesBySubTab(sales, 'whatever').every((s) => s.status !== 'cancelled')).toBe(true);
  });
  it('B.4 active + cancelled partition is complete + disjoint', () => {
    const act = filterSalesBySubTab(sales, 'active');
    const can = filterSalesBySubTab(sales, 'cancelled');
    expect(act.length + can.length).toBe(sales.length);
    expect(act.some((s) => can.includes(s))).toBe(false);
  });
});

describe('saleSubTabFilter — C. adversarial', () => {
  it('C.1 non-array input → []', () => {
    expect(filterSalesBySubTab(null, 'active')).toEqual([]);
    expect(filterSalesBySubTab(undefined, 'cancelled')).toEqual([]);
    expect(filterSalesBySubTab({}, 'active')).toEqual([]);
  });
  it('C.2 empty array → []', () => expect(filterSalesBySubTab([], 'active')).toEqual([]));
  it('C.3 entries with null members are tolerated', () => {
    const r = filterSalesBySubTab([null, A, undefined, C], 'cancelled');
    expect(r).toEqual([C]);
  });
  it('C.4 Thai customerName + commas do not affect partition', () => {
    const t = { saleId: 'INV-ก', status: 'cancelled', customerName: 'นางสาว วันเพ็ญ เดือนสิบสอง' };
    expect(filterSalesBySubTab([t], 'cancelled')).toEqual([t]);
  });
  it('C.5 status other than cancelled (draft/deferred) lands in active', () => {
    const d = { saleId: 'INV-d', status: 'draft' };
    expect(filterSalesBySubTab([d], 'active')).toEqual([d]);
    expect(filterSalesBySubTab([d], 'cancelled')).toEqual([]);
  });
  it('C.6 idempotent — re-filtering active yields same set', () => {
    const once = filterSalesBySubTab([A, A2, C], 'active');
    expect(filterSalesBySubTab(once, 'active')).toEqual(once);
  });
  it('C.7 forward-compat — unknown fields preserved on returned objects', () => {
    const f = { saleId: 'INV-f', status: 'cancelled', _futureField: 42 };
    expect(filterSalesBySubTab([f], 'cancelled')[0]._futureField).toBe(42);
  });
});
