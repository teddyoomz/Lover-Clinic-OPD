import { describe, it, expect } from 'vitest';
import {
  CUSTOMER_CASCADE_COLLECTIONS_FULL,
  T4_SUBCOLLECTIONS,
  AUDIT_IMMUTABLE_COLLECTIONS,
  matchCustomerChatPredicate,
} from '../src/lib/customerBackupCore.js';

describe('CUSTOMER_CASCADE_COLLECTIONS_FULL', () => {
  it('C1.1 includes all 11 Phase 24.0 cascade collections', () => {
    const phase24 = [
      // 2026-06-18 — be_wallets → be_customer_wallets (Phase-24.0 phantom rename)
      'be_treatments', 'be_sales', 'be_deposits', 'be_customer_wallets',
      'be_wallet_transactions', 'be_memberships', 'be_point_transactions',
      'be_appointments', 'be_course_changes', 'be_link_requests',
      'be_customer_link_tokens',
    ];
    for (const col of phase24) {
      expect(CUSTOMER_CASCADE_COLLECTIONS_FULL).toContain(col);
    }
  });
  it('C1.2 includes 5 gap collections (V74 closes Phase 24.0 stale)', () => {
    const gaps = [
      'be_quotations', 'be_vendor_sales', 'be_online_sales',
      'be_sale_insurance_claims', 'be_recalls',
    ];
    for (const col of gaps) {
      expect(CUSTOMER_CASCADE_COLLECTIONS_FULL).toContain(col);
    }
  });
  it('C1.3 total of 17 collections (16 + be_assessments 2026-06-18)', () => {
    expect(CUSTOMER_CASCADE_COLLECTIONS_FULL).toHaveLength(17);
    expect(CUSTOMER_CASCADE_COLLECTIONS_FULL).toContain('be_assessments');
  });
});

describe('T4_SUBCOLLECTIONS', () => {
  it('C2.1 lists 8 customer-attached subcollections', () => {
    expect(T4_SUBCOLLECTIONS).toHaveLength(8);
    expect(T4_SUBCOLLECTIONS).toContain('treatments');
    expect(T4_SUBCOLLECTIONS).toContain('courseChanges');
  });
});

describe('AUDIT_IMMUTABLE_COLLECTIONS', () => {
  it('C3.1 lists 6 audit-immutable (NEVER wiped, NEVER restored)', () => {
    expect(AUDIT_IMMUTABLE_COLLECTIONS).toHaveLength(6);
    expect(AUDIT_IMMUTABLE_COLLECTIONS).toContain('be_admin_audit');
    expect(AUDIT_IMMUTABLE_COLLECTIONS).toContain('be_stock_movements');
  });
  it('C3.2 disjoint from CUSTOMER_CASCADE_COLLECTIONS_FULL', () => {
    for (const col of AUDIT_IMMUTABLE_COLLECTIONS) {
      expect(CUSTOMER_CASCADE_COLLECTIONS_FULL).not.toContain(col);
    }
  });
});

describe('matchCustomerChatPredicate', () => {
  it('C4.1 matches when chat.customerId === customer.id', () => {
    expect(matchCustomerChatPredicate(
      { customerId: 'C1' },
      { id: 'C1' }
    )).toBe(true);
  });
  it('C4.2 matches when chat.lineUserId in customer.lineUserId_byBranch values', () => {
    expect(matchCustomerChatPredicate(
      { lineUserId: 'U_LINE_1' },
      { id: 'C2', lineUserId_byBranch: { 'BR-A': 'U_LINE_1' } }
    )).toBe(true);
  });
  it('C4.3 no match when both fields differ', () => {
    expect(matchCustomerChatPredicate(
      { customerId: 'X', lineUserId: 'Y' },
      { id: 'C3', lineUserId_byBranch: { 'BR-A': 'Z' } }
    )).toBe(false);
  });
  it('C4.4 defensive: missing customer.lineUserId_byBranch defaults to empty', () => {
    expect(matchCustomerChatPredicate(
      { lineUserId: 'U_LINE_1' },
      { id: 'C4' }
    )).toBe(false);
  });
  it('C4.5 defensive: null doc returns false', () => {
    expect(matchCustomerChatPredicate(null, { id: 'C5' })).toBe(false);
    expect(matchCustomerChatPredicate({ customerId: 'C5' }, null)).toBe(false);
  });
});
