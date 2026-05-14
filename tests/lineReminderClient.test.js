import { describe, it, expect, vi } from 'vitest';
import { getCustomerLineUserIdAtBranch, computeBackoffMs, getReminderLogKey } from '../src/lib/lineReminderClient.js';

describe('T3 getCustomerLineUserIdAtBranch', () => {
  it('T3.1 prefers lineUserId_byBranch[branchId]', () => {
    const c = { branchId: 'BR-A', lineUserId: 'legacy', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' }, 'BR-B': { lineUserId: 'U-B' } } };
    expect(getCustomerLineUserIdAtBranch(c, 'BR-A')).toBe('U-A');
    expect(getCustomerLineUserIdAtBranch(c, 'BR-B')).toBe('U-B');
  });

  it('T3.2 falls back to legacy lineUserId iff customer.branchId === branchId', () => {
    const c = { branchId: 'BR-A', lineUserId: 'legacy', lineUserId_byBranch: {} };
    expect(getCustomerLineUserIdAtBranch(c, 'BR-A')).toBe('legacy');
    expect(getCustomerLineUserIdAtBranch(c, 'BR-B')).toBe(null);
  });

  it('T3.3 returns null when stale at branch', () => {
    const c = { branchId: 'BR-A', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A', _lineStale: true } } };
    expect(getCustomerLineUserIdAtBranch(c, 'BR-A')).toBe(null);
  });

  it('T3.4 returns null when legacy lineUserId stale at customer level', () => {
    const c = { branchId: 'BR-A', lineUserId: 'legacy', _lineStale: true, lineUserId_byBranch: {} };
    expect(getCustomerLineUserIdAtBranch(c, 'BR-A')).toBe(null);
  });

  it('T3.5 returns null when no linkage anywhere', () => {
    expect(getCustomerLineUserIdAtBranch({ branchId: 'BR-A' }, 'BR-A')).toBe(null);
    expect(getCustomerLineUserIdAtBranch({}, 'BR-A')).toBe(null);
  });

  it('T3.6 customer linked to other branch — appt at this branch — returns null', () => {
    const c = { branchId: 'BR-A', lineUserId: 'legacy', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } };
    expect(getCustomerLineUserIdAtBranch(c, 'BR-Y')).toBe(null);
  });
});

describe('T3 computeBackoffMs', () => {
  it('T3.7 retry 0 (immediate first retry) = 5 minutes', () => {
    expect(computeBackoffMs(0)).toBe(5 * 60 * 1000);
  });
  it('T3.8 retry 1 = 30 minutes', () => {
    expect(computeBackoffMs(1)).toBe(30 * 60 * 1000);
  });
  it('T3.9 retry 2 = 2 hours', () => {
    expect(computeBackoffMs(2)).toBe(2 * 60 * 60 * 1000);
  });
  it('T3.10 retry >= 3 returns null (DEAD)', () => {
    expect(computeBackoffMs(3)).toBe(null);
    expect(computeBackoffMs(99)).toBe(null);
  });
});

describe('T3 getReminderLogKey', () => {
  it('T3.11 returns appointmentId_reminderType', () => {
    expect(getReminderLogKey('BA-x', 'dayBefore')).toBe('BA-x_dayBefore');
    expect(getReminderLogKey('BA-y', 'dayOf')).toBe('BA-y_dayOf');
  });
});
