import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import {
  getCustomerLineUserIdAtBranch,
  computeBackoffMs,
  getReminderLogKey,
  pushLineMessage,
  getMergedReminderSettings,
  isQuietHour,
  buildReminderLogDoc,
} from '../src/lib/lineReminderClient.js';

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

describe('T3 pushLineMessage error labels', () => {
  it('T3.12 throws LINE_PUSH_NO_TOKEN on missing channelAccessToken', async () => {
    await expect(pushLineMessage({ lineUserId: 'U', flexJson: {} })).rejects.toThrow('LINE_PUSH_NO_TOKEN');
  });
  it('T3.13 throws LINE_PUSH_NO_USER_ID on missing lineUserId', async () => {
    await expect(pushLineMessage({ channelAccessToken: 'T', flexJson: {} })).rejects.toThrow('LINE_PUSH_NO_USER_ID');
  });
  it('T3.14 throws LINE_PUSH_NO_PAYLOAD on missing flexJson', async () => {
    await expect(pushLineMessage({ channelAccessToken: 'T', lineUserId: 'U' })).rejects.toThrow('LINE_PUSH_NO_PAYLOAD');
  });
});

describe('T3 getMergedReminderSettings', () => {
  const defaults = { dayBeforeHour: 20, dayOfHour: 9, quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'tb', templateDayOf: 'to', cancellationPolicyText: 'cp' };
  it('T3.15 full cfg.lineReminder passes through', () => {
    const cfg = { lineReminder: { enabled: true, dayBeforeHour: 18, dayOfHour: 10, quietHourStart: 21, quietHourEnd: 7, templateDayBefore: 'X', templateDayOf: 'Y', cancellationPolicyText: 'Z' } };
    const m = getMergedReminderSettings(cfg, defaults);
    expect(m).toEqual({ enabled: true, dayBeforeHour: 18, dayOfHour: 10, quietHourStart: 21, quietHourEnd: 7, templateDayBefore: 'X', templateDayOf: 'Y', cancellationPolicyText: 'Z' });
  });
  it('T3.16 partial cfg falls back to defaults', () => {
    const m = getMergedReminderSettings({ lineReminder: { enabled: true, dayBeforeHour: 15 } }, defaults);
    expect(m.dayBeforeHour).toBe(15);
    expect(m.dayOfHour).toBe(9);
    expect(m.quietHourStart).toBe(22);
    expect(m.templateDayBefore).toBe('tb');
  });
  it('T3.17 dayOfHour=null is preserved (disable day-of)', () => {
    const m = getMergedReminderSettings({ lineReminder: { enabled: true, dayOfHour: null } }, defaults);
    expect(m.dayOfHour).toBe(null);
  });
  it('T3.18 empty cfg → all defaults', () => {
    const m = getMergedReminderSettings({}, defaults);
    expect(m.enabled).toBe(false);
    expect(m.dayBeforeHour).toBe(20);
  });
});

describe('T3 isQuietHour edge cases', () => {
  it('T3.19 equal start=end → never quiet', () => {
    expect(isQuietHour(0, 12, 12)).toBe(false);
    expect(isQuietHour(12, 12, 12)).toBe(false);
  });
  it('T3.20 normal range 9-17 quiet only at 9-16', () => {
    expect(isQuietHour(8, 9, 17)).toBe(false);
    expect(isQuietHour(9, 9, 17)).toBe(true);
    expect(isQuietHour(16, 9, 17)).toBe(true);
    expect(isQuietHour(17, 9, 17)).toBe(false);
  });
  it('T3.21 wrap-around 22-8 quiet at 22, 23, 0-7', () => {
    expect(isQuietHour(21, 22, 8)).toBe(false);
    expect(isQuietHour(22, 22, 8)).toBe(true);
    expect(isQuietHour(23, 22, 8)).toBe(true);
    expect(isQuietHour(0, 22, 8)).toBe(true);
    expect(isQuietHour(7, 22, 8)).toBe(true);
    expect(isQuietHour(8, 22, 8)).toBe(false);
    expect(isQuietHour(9, 22, 8)).toBe(false);
  });
});

describe('T3 buildReminderLogDoc', () => {
  it('T3.22 full input → all 12 fields populated', () => {
    const doc = buildReminderLogDoc({
      appointmentId: 'BA-1', customerId: 'C-1', branchId: 'BR-A', customerLineUserId: 'U-A',
      reminderType: 'dayBefore', status: 'sent', lineApiResult: { statusCode: 200, body: 'ok' },
      retryCount: 1, nextRetryAt: '2026-05-16T10:00:00Z', lastError: 'none', templateRendered: '{}',
    });
    expect(doc.appointmentId).toBe('BA-1');
    expect(doc.branchId).toBe('BR-A');
    expect(doc.customerLineUserId).toBe('U-A');
    expect(doc.lineApiResult).toEqual({ statusCode: 200, body: 'ok' });
    expect(doc.retryCount).toBe(1);
    expect(doc.attemptedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
  it('T3.23 missing optional fields → safe defaults (no undefined leaks per V14)', () => {
    const doc = buildReminderLogDoc({
      appointmentId: 'BA-1', customerId: 'C-1', branchId: 'BR-A',
      reminderType: 'dayBefore', status: 'sent',
    });
    expect(doc.customerLineUserId).toBe(null);
    expect(doc.lineApiResult).toBe(null);
    expect(doc.retryCount).toBe(0);
    expect(doc.nextRetryAt).toBe(null);
    expect(doc.lastError).toBe(null);
    expect(doc.templateRendered).toBe('');
  });
  it('T3.24 missing appointmentId throws REMINDER_LOG_MISSING_REQUIRED_FIELDS', () => {
    expect(() => buildReminderLogDoc({ customerId: 'C', branchId: 'B', reminderType: 'dayBefore', status: 'sent' })).toThrow('REMINDER_LOG_MISSING_REQUIRED_FIELDS');
  });
  it('T3.25 missing branchId throws REMINDER_LOG_MISSING_REQUIRED_FIELDS', () => {
    expect(() => buildReminderLogDoc({ appointmentId: 'A', customerId: 'C', reminderType: 'dayBefore', status: 'sent' })).toThrow('REMINDER_LOG_MISSING_REQUIRED_FIELDS');
  });
});
