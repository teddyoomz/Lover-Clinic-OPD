import { describe, it, expect, vi } from 'vitest';
import { runReminderPipeline } from '../api/cron/line-reminder-fire.js';

// LR-1: Push API call uses per-branch channelAccessToken (NOT global).

describe('T4 LR-1 — per-branch channelAccessToken discipline', () => {
  function fakeDb() {
    const data = new Map();
    return {
      data,
      doc(p) {
        return {
          get: async () => ({ exists: data.has(p), data: () => data.get(p) || null, id: p.split('/').pop() }),
          set: async (v) => { data.set(p, v); },
          update: async (v) => { data.set(p, { ...(data.get(p) || {}), ...v }); },
        };
      },
    };
  }

  it('LR1.1 BR-A push uses cfg-A token', async () => {
    const db = fakeDb();
    const pushFn = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    await runReminderPipeline({
      db,
      appt: { id: 'BA-A', branchId: 'BR-A', customerId: 'C', status: 'pending', date: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-A', name: 'X', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      branch: { branchId: 'BR-A', branchName: 'A' },
      doctor: null, treatments: [],
      branchCfg: { channelAccessToken: 'TOKEN-A', lineReminder: { quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'x', templateDayOf: 'x', cancellationPolicyText: 'c' } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn,
    });
    expect(pushFn.mock.calls[0][0].channelAccessToken).toBe('TOKEN-A');
  });

  it('LR1.2 BR-B push uses cfg-B token', async () => {
    const db = fakeDb();
    const pushFn = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    await runReminderPipeline({
      db,
      appt: { id: 'BA-B', branchId: 'BR-B', customerId: 'C', status: 'pending', date: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-B', name: 'X', lineUserId_byBranch: { 'BR-B': { lineUserId: 'U-B' } } },
      branch: { branchId: 'BR-B', branchName: 'B' },
      doctor: null, treatments: [],
      branchCfg: { channelAccessToken: 'TOKEN-B', lineReminder: { quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'x', templateDayOf: 'x', cancellationPolicyText: 'c' } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn,
    });
    expect(pushFn.mock.calls[0][0].channelAccessToken).toBe('TOKEN-B');
  });

  it('LR1.3 No fallback to global chat_config when branchCfg missing token → throws', async () => {
    const db = fakeDb();
    const pushFn = vi.fn();
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-X', branchId: 'BR-X', customerId: 'C', status: 'pending', date: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-X', name: 'X', lineUserId_byBranch: { 'BR-X': { lineUserId: 'U-X' } } },
      branch: { branchId: 'BR-X', branchName: 'X' },
      doctor: null, treatments: [],
      branchCfg: { channelAccessToken: '', lineReminder: { quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'x', templateDayOf: 'x', cancellationPolicyText: 'c' } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn,
    });
    expect(r.status).toMatch(/skipped-branch-no-oa/);
    expect(pushFn).not.toHaveBeenCalled();
  });
});
