// V74 T1 — Vanilla customer round-trip
// Minimal customer (1 treatment / 1 sale / 1 deposit / 1 appt / 1 LINE link)
// → buildCustomerBackupFile → JSON.stringify+parse → deep-equal assertion.

import { describe, it, expect } from 'vitest';
import { buildCustomerBackupFile, validateCustomerBackupFile } from '../src/lib/customerBackupSchema.js';
import { jsonReplacerForNonFinite, jsonReviverForNonFinite } from '../src/lib/branchBackupSchema.js';

describe('T1 — Vanilla customer round-trip', () => {
  const customer = {
    id: 'LC-1', hn_no: '0001', prefix: 'นางสาว', firstname: 'A', lastname: 'B',
    branchId: 'BR-A', lineUserId_byBranch: { 'BR-A': 'U123' },
    courses: [{ courseId: 'C1', remaining: 5 }],
  };
  const collections = {
    be_customers: [customer],
    be_treatments: [{ id: 'T1', customerId: 'LC-1', date: '2026-05-16' }],
    be_sales: [{ id: 'S1', customerId: 'LC-1', total: 1000 }],
    be_deposits: [{ id: 'D1', customerId: 'LC-1', amount: 500 }],
    be_appointments: [{ id: 'A1', customerId: 'LC-1', date: '2026-05-20' }],
    be_link_requests: [{ id: 'LR1', customerId: 'LC-1', status: 'approved' }],
  };
  const subcollections = {
    treatments: [{ id: 'T1', parentCustomerId: 'LC-1' }],
    sales: [{ id: 'S1', parentCustomerId: 'LC-1' }],
    appointments: [{ id: 'A1', parentCustomerId: 'LC-1' }],
    deposits: [{ id: 'D1', parentCustomerId: 'LC-1' }],
    wallets: [], memberships: [], points: [], courseChanges: [],
  };
  const chatConversations = [{ id: 'CH1', lineUserId: 'U123', text: 'สวัสดี' }];

  it('T1.1 build → stringify → parse → deep-equal collections+subcoll+chat', () => {
    const file = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'นางสาว A B',
      exportedBy: 'admin', collections, subcollections, chatConversations, storageManifest: [],
    });
    const serialized = JSON.stringify(file, jsonReplacerForNonFinite);
    const restored = JSON.parse(serialized, jsonReviverForNonFinite);
    expect(restored.collections).toEqual(collections);
    expect(restored.subcollections).toEqual(subcollections);
    expect(restored.chatConversations).toEqual(chatConversations);
  });
  it('T1.2 bodyHash deterministic across round-trip', () => {
    const f1 = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'A',
      exportedBy: 'x', collections, subcollections, chatConversations, storageManifest: [],
    });
    const restored = JSON.parse(JSON.stringify(f1, jsonReplacerForNonFinite), jsonReviverForNonFinite);
    expect(restored.meta.bodyHash).toBe(f1.meta.bodyHash);
  });
  it('T1.3 validate restored file passes', () => {
    const f1 = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'A',
      exportedBy: 'x', collections, subcollections, chatConversations, storageManifest: [],
    });
    const restored = JSON.parse(JSON.stringify(f1, jsonReplacerForNonFinite), jsonReviverForNonFinite);
    expect(() => validateCustomerBackupFile(restored)).not.toThrow();
  });
});
