// Task 1 (2026-05-31) — unit for resolveSalePaidAmount / resolveSaleOutstanding /
// resolveSalePaidTone (spec Q1=A). paid = Σ payment.channels → totalPaidAmount → 0.
import { describe, it, expect } from 'vitest';
import { resolveSalePaidAmount, resolveSaleOutstanding, resolveSalePaidTone } from '../src/lib/financeUtils.js';

describe('resolveSalePaidAmount', () => {
  it('paid in full — sums channels = net', () => expect(resolveSalePaidAmount({ billing: { netTotal: 8900 }, payment: { channels: [{ amount: 8900, enabled: true }] } })).toBe(8900));
  it('split — sums partial channels', () => expect(resolveSalePaidAmount({ billing: { netTotal: 8900 }, payment: { channels: [{ amount: 3000 }, { amount: 2000 }] } })).toBe(5000));
  it('unpaid — empty channels => 0', () => expect(resolveSalePaidAmount({ billing: { netTotal: 8900 }, payment: { channels: [] } })).toBe(0));
  it('0baht sale => 0', () => expect(resolveSalePaidAmount({ billing: { netTotal: 0 }, payment: { channels: [{ amount: 0 }] } })).toBe(0));
  it('fallback to totalPaidAmount when no channels', () => expect(resolveSalePaidAmount({ billing: { netTotal: 5000 }, totalPaidAmount: 5000 })).toBe(5000));
  it('channels win over totalPaidAmount', () => expect(resolveSalePaidAmount({ payment: { channels: [{ amount: 3000 }] }, totalPaidAmount: 9999 })).toBe(3000));
  it('amount as string', () => expect(resolveSalePaidAmount({ payment: { channels: [{ amount: '1500.50' }] } })).toBe(1500.5));
  it('null/garbage safe', () => {
    expect(resolveSalePaidAmount(null)).toBe(0);
    expect(resolveSalePaidAmount({})).toBe(0);
    expect(resolveSalePaidAmount({ payment: { channels: [{ amount: null }, { amount: 'x' }] } })).toBe(0);
  });
  it('negative channel tolerated', () => expect(resolveSalePaidAmount({ payment: { channels: [{ amount: 5000 }, { amount: -1000 }] } })).toBe(4000));
  it('rounds 2dp', () => expect(resolveSalePaidAmount({ payment: { channels: [{ amount: 33.333 }, { amount: 33.333 }] } })).toBe(66.67));
});

describe('resolveSaleOutstanding', () => {
  it('full => 0', () => expect(resolveSaleOutstanding({ billing: { netTotal: 8900 }, payment: { channels: [{ amount: 8900 }] } })).toBe(0));
  it('split => remainder', () => expect(resolveSaleOutstanding({ billing: { netTotal: 8900 }, payment: { channels: [{ amount: 5000 }] } })).toBe(3900));
  it('unpaid => full net', () => expect(resolveSaleOutstanding({ billing: { netTotal: 42500 }, payment: { channels: [] } })).toBe(42500));
  it('over-paid => 0 never negative', () => expect(resolveSaleOutstanding({ billing: { netTotal: 1000 }, payment: { channels: [{ amount: 1500 }] } })).toBe(0));
  it('null safe', () => expect(resolveSaleOutstanding(null)).toBe(0));
});

describe('resolveSalePaidTone', () => {
  it('full when paid>=net', () => expect(resolveSalePaidTone(8900, 8900)).toBe('full'));
  it('full for 0baht paid-in-full', () => expect(resolveSalePaidTone(0, 0)).toBe('full'));
  it('full when over-paid', () => expect(resolveSalePaidTone(1500, 1000)).toBe('full'));
  it('partial when 0<paid<net', () => expect(resolveSalePaidTone(5000, 8900)).toBe('partial'));
  it('zero when paid 0 net>0', () => expect(resolveSalePaidTone(0, 8900)).toBe('zero'));
});
