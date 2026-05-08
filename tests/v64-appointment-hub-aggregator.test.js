import { describe, it, expect } from 'vitest';
import { buildCustomerSummaryMap } from '../src/lib/appointmentHubAggregator.js';

const FIXED_NOW = new Date('2026-05-08T07:00:00+07:00');

describe('V64.A buildCustomerSummaryMap — single-load aggregation (Q3=C)', () => {
  it('A1.1 empty inputs → empty Map', () => {
    expect(buildCustomerSummaryMap({ customers: [], deposits: [], sales: [], memberships: [], wallets: [], now: FIXED_NOW }).size).toBe(0);
  });

  it('A1.2 single customer with all fields populated (multi-wallet sum per V64 schema fix)', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1', hn: 'HN001', patientData: { firstName: 'Alice', gender: 'F', phone: '0811111111', customerType2: 'VIP' } }],
      deposits: [{ id: 'D1', customerId: 'C1', amount: 5000, status: 'active' }, { id: 'D2', customerId: 'C1', amount: 3000, status: 'active' }],
      sales: [
        { id: 'S1', customerId: 'C1', totalAmount: 10000, totalRemaining: 0, paymentStatus: 'paid' },
        { id: 'S2', customerId: 'C1', totalAmount: 5000, totalRemaining: 1500, paymentStatus: 'partial' },
      ],
      memberships: [{ id: 'M1', customerId: 'C1', tier: 'GOLD', expiresAt: '2027-04-13', status: 'active' }],
      // V64 schema: composite doc IDs; customerId is a FIELD, balance summed across wallet types
      wallets: [
        { id: 'C1__cash',   customerId: 'C1', balance: 9000,  walletTypeId: 'cash' },
        { id: 'C1__points', customerId: 'C1', balance: 3000,  walletTypeId: 'points' },
      ],
      now: FIXED_NOW,
    });
    const s = m.get('C1');
    expect(s.hn).toBe('HN001');
    expect(s.name).toBe('Alice');
    expect(s.gender).toBe('F');
    expect(s.phone).toBe('0811111111');
    expect(s.customerType).toBe('VIP');
    expect(s.activeDepositTotal).toBe(8000);
    expect(s.outstandingTotal).toBe(1500);
    expect(s.lifetimeSaleTotal).toBe(15000);
    expect(s.membershipTier).toBe('GOLD');
    expect(s.membershipDaysLeft).toBeGreaterThan(330);
    expect(s.membershipDaysLeft).toBeLessThan(345);
    expect(s.walletBalance).toBe(12000);
  });

  it('A1.3 customer with no membership → tier="" days=0', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1', hn: 'HN001', patientData: { firstName: 'Bob' } }],
      deposits: [], sales: [], memberships: [], wallets: [], now: FIXED_NOW,
    });
    expect(m.get('C1').membershipTier).toBe('');
    expect(m.get('C1').membershipDaysLeft).toBe(0);
  });

  it('A1.4 expired membership → tier="" days=0', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1', hn: 'HN001', patientData: { firstName: 'Bob' } }],
      memberships: [{ id: 'M1', customerId: 'C1', tier: 'GOLD', expiresAt: '2025-01-01', status: 'active' }],
      deposits: [], sales: [], wallets: [], now: FIXED_NOW,
    });
    expect(m.get('C1').membershipTier).toBe('');
    expect(m.get('C1').membershipDaysLeft).toBe(0);
  });

  it('A1.5 deposit-status filter — only active counted', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1' }],
      deposits: [
        { customerId: 'C1', amount: 1000, status: 'active' },
        { customerId: 'C1', amount: 5000, status: 'used' },
        { customerId: 'C1', amount: 2000, status: 'cancelled' },
      ],
      sales: [], memberships: [], wallets: [], now: FIXED_NOW,
    });
    expect(m.get('C1').activeDepositTotal).toBe(1000);
  });

  it('A1.6 outstanding sums totalRemaining where paymentStatus !== paid', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1' }],
      sales: [
        { customerId: 'C1', totalAmount: 1000, totalRemaining: 0, paymentStatus: 'paid' },
        { customerId: 'C1', totalAmount: 2000, totalRemaining: 500, paymentStatus: 'partial' },
        { customerId: 'C1', totalAmount: 3000, totalRemaining: 3000, paymentStatus: 'unpaid' },
      ],
      deposits: [], memberships: [], wallets: [], now: FIXED_NOW,
    });
    expect(m.get('C1').outstandingTotal).toBe(3500);
    expect(m.get('C1').lifetimeSaleTotal).toBe(6000);
  });

  it('A1.7 void sales excluded from lifetime total', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1' }],
      sales: [
        { customerId: 'C1', totalAmount: 1000, totalRemaining: 0, paymentStatus: 'paid' },
        { customerId: 'C1', totalAmount: 500, totalRemaining: 0, paymentStatus: 'cancelled', isVoid: true },
      ],
      deposits: [], memberships: [], wallets: [], now: FIXED_NOW,
    });
    expect(m.get('C1').lifetimeSaleTotal).toBe(1000);
  });

  it('A1.8 multiple customers — independent', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1' }, { id: 'C2' }],
      deposits: [
        { customerId: 'C1', amount: 100, status: 'active' },
        { customerId: 'C2', amount: 200, status: 'active' },
      ],
      sales: [], memberships: [], wallets: [], now: FIXED_NOW,
    });
    expect(m.get('C1').activeDepositTotal).toBe(100);
    expect(m.get('C2').activeDepositTotal).toBe(200);
  });

  it('A1.9 adversarial — null fields', () => {
    const m = buildCustomerSummaryMap({
      customers: [{ id: 'C1', patientData: null }],
      deposits: [{ customerId: 'C1', amount: null, status: 'active' }],
      sales: [{ customerId: 'C1', totalAmount: null, totalRemaining: null, paymentStatus: null }],
      memberships: [], wallets: [], now: FIXED_NOW,
    });
    const s = m.get('C1');
    expect(s.activeDepositTotal).toBe(0);
    expect(s.outstandingTotal).toBe(0);
    expect(s.lifetimeSaleTotal).toBe(0);
  });

  it('A1.10 idempotent — same inputs → same output', () => {
    const inputs = {
      customers: [{ id: 'C1', hn: 'HN001', patientData: { firstName: 'X' } }],
      deposits: [{ customerId: 'C1', amount: 100, status: 'active' }],
      sales: [], memberships: [], wallets: [],
      now: FIXED_NOW,
    };
    const m1 = buildCustomerSummaryMap(inputs);
    const m2 = buildCustomerSummaryMap(inputs);
    expect(JSON.stringify([...m1])).toBe(JSON.stringify([...m2]));
  });

  it('A1.11 branch-blind invariant (toString.grep — no branchId reference)', () => {
    expect(buildCustomerSummaryMap.toString()).not.toMatch(/branchId/);
  });
});
