import { describe, it, expect } from 'vitest';
import { scanRestoreConflicts, stripLineConflicts } from '../src/lib/customerBackupConflict.js';

describe('scanRestoreConflicts', () => {
  it('CR1.1 BLOCK when customerId already exists', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: {} },
      liveCustomers: [{ id: 'LC-1', hn_no: '0001' }],
    });
    expect(result.customerIdExists).toBe(true);
  });
  it('CR1.2 BLOCK on HN collision with different customer', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: {} },
      liveCustomers: [{ id: 'LC-OTHER', hn_no: '0001' }],
    });
    expect(result.hnCollision).toEqual({ takenBy: 'LC-OTHER', hn: '0001' });
  });
  it('CR1.3 no HN collision when same customer.id (just exists)', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: {} },
      liveCustomers: [{ id: 'LC-1', hn_no: '0001' }],
    });
    expect(result.hnCollision).toBeNull();
  });
  it('CR1.4 lineConflict when lineUserId now linked to another customer', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: { 'BR-A': 'U123' } },
      liveCustomers: [{ id: 'LC-OTHER', lineUserId_byBranch: { 'BR-A': 'U123' } }],
    });
    expect(result.lineConflicts).toEqual([
      { branchId: 'BR-A', originalLineUserId: 'U123', takenBy: 'LC-OTHER' },
    ]);
  });
  it('CR1.5 no lineConflict when lineUserId free in branch', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: { 'BR-A': 'U123' } },
      liveCustomers: [],
    });
    expect(result.lineConflicts).toEqual([]);
  });
  it('CR1.6 returns clean result when no conflicts', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: {} },
      liveCustomers: [],
    });
    expect(result).toEqual({
      customerIdExists: false,
      hnCollision: null,
      lineConflicts: [],
      staleFKs: [],
    });
  });
  it('CR1.7 lineConflict on SAME customer is ignored (self-link OK)', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: { 'BR-A': 'U123' } },
      liveCustomers: [{ id: 'LC-1', lineUserId_byBranch: { 'BR-A': 'U123' } }],
    });
    expect(result.lineConflicts).toEqual([]);
  });
  it('CR1.8 multiple lineConflicts across branches', () => {
    const result = scanRestoreConflicts({
      backupCustomer: {
        id: 'LC-1', hn_no: '0001',
        lineUserId_byBranch: { 'BR-A': 'U123', 'BR-B': 'U456' },
      },
      liveCustomers: [
        { id: 'LC-X', lineUserId_byBranch: { 'BR-A': 'U123' } },
        { id: 'LC-Y', lineUserId_byBranch: { 'BR-B': 'U456' } },
      ],
    });
    expect(result.lineConflicts).toHaveLength(2);
    expect(result.lineConflicts).toContainEqual({ branchId: 'BR-A', originalLineUserId: 'U123', takenBy: 'LC-X' });
    expect(result.lineConflicts).toContainEqual({ branchId: 'BR-B', originalLineUserId: 'U456', takenBy: 'LC-Y' });
  });
  it('CR1.9 empty backup lineUserId_byBranch → no lineConflicts', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001' },
      liveCustomers: [{ id: 'LC-X', lineUserId_byBranch: { 'BR-A': 'U123' } }],
    });
    expect(result.lineConflicts).toEqual([]);
  });
  it('CR1.10 missing hn_no does not trigger collision', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', lineUserId_byBranch: {} },
      liveCustomers: [{ id: 'LC-OTHER' }],
    });
    expect(result.hnCollision).toBeNull();
  });
});

describe('stripLineConflicts', () => {
  it('CR2.1 removes conflicting branch keys, keeps others', () => {
    const customer = {
      id: 'LC-1',
      lineUserId_byBranch: { 'BR-A': 'U123', 'BR-B': 'U456' },
    };
    const conflicts = [{ branchId: 'BR-A', originalLineUserId: 'U123', takenBy: 'LC-OTHER' }];
    const result = stripLineConflicts(customer, conflicts);
    expect(result.lineUserId_byBranch).toEqual({ 'BR-B': 'U456' });
  });
  it('CR2.2 no mutation of original object', () => {
    const customer = { id: 'LC-1', lineUserId_byBranch: { 'BR-A': 'U123' } };
    const conflicts = [{ branchId: 'BR-A' }];
    stripLineConflicts(customer, conflicts);
    expect(customer.lineUserId_byBranch).toEqual({ 'BR-A': 'U123' });
  });
  it('CR2.3 empty conflicts returns customer unchanged', () => {
    const customer = { id: 'LC-1', lineUserId_byBranch: { 'BR-A': 'U123' } };
    const result = stripLineConflicts(customer, []);
    expect(result).toEqual(customer);
  });
  it('CR2.4 handles missing lineUserId_byBranch', () => {
    const customer = { id: 'LC-1' };
    const result = stripLineConflicts(customer, [{ branchId: 'BR-A' }]);
    expect(result).toEqual(customer);
  });
  it('CR2.5 strip ALL branches when every branch conflicts', () => {
    const customer = {
      id: 'LC-1',
      lineUserId_byBranch: { 'BR-A': 'U123', 'BR-B': 'U456' },
    };
    const conflicts = [
      { branchId: 'BR-A', originalLineUserId: 'U123', takenBy: 'X' },
      { branchId: 'BR-B', originalLineUserId: 'U456', takenBy: 'Y' },
    ];
    const result = stripLineConflicts(customer, conflicts);
    expect(result.lineUserId_byBranch).toEqual({});
  });
  it('CR2.6 null customer returns null', () => {
    expect(stripLineConflicts(null, [{ branchId: 'BR-A' }])).toBeNull();
  });
});
