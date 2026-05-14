import { describe, it, expect } from 'vitest';
import { computeBackoffMs } from '../src/lib/lineReminderClient.js';
import { computeNextRetryAt, isRetryEligible } from '../api/cron/line-reminder-retry.js';

describe('T5 retry backoff schedule', () => {
  it('T5.1 backoff schedule matches spec §8', () => {
    expect(computeBackoffMs(0)).toBe(5 * 60 * 1000);
    expect(computeBackoffMs(1)).toBe(30 * 60 * 1000);
    expect(computeBackoffMs(2)).toBe(2 * 60 * 60 * 1000);
    expect(computeBackoffMs(3)).toBe(null);
  });

  it('T5.2 computeNextRetryAt returns null when retryCount exceeds limit', () => {
    expect(computeNextRetryAt(3)).toBe(null);
  });

  it('T5.3 isRetryEligible — retryCount < 3 + nextRetryAt <= now', () => {
    const now = new Date('2026-05-16T10:00:00Z');
    expect(isRetryEligible({ retryCount: 0, nextRetryAt: '2026-05-16T09:00:00Z' }, now)).toBe(true);
    expect(isRetryEligible({ retryCount: 2, nextRetryAt: '2026-05-16T09:00:00Z' }, now)).toBe(true);
    expect(isRetryEligible({ retryCount: 3, nextRetryAt: '2026-05-16T09:00:00Z' }, now)).toBe(false);
    expect(isRetryEligible({ retryCount: 0, nextRetryAt: '2026-05-16T11:00:00Z' }, now)).toBe(false);
    expect(isRetryEligible({ retryCount: 0 }, now)).toBe(false);
  });
});
