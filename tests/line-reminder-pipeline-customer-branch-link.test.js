import { describe, it, expect, vi } from 'vitest';
import { runReminderPipeline } from '../api/cron/line-reminder-fire.js';

// LR-3: Customer LINE userId lookup uses branch-scoped helper.

describe('T4 LR-3 — customer lineUserId is branch-scoped', () => {
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

  const baseCtx = {
    branch: { branchId: 'BR-Y', branchName: 'Y' },
    doctor: null, treatments: [],
    branchCfg: { channelAccessToken: 'T', lineReminder: { quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'x', templateDayOf: 'x', cancellationPolicyText: 'c' } },
    reminderType: 'dayBefore', currentHour: 20,
  };

  it('LR3.1 customer linked only at BR-A, appt at BR-Y → skipped-no-line-this-branch', async () => {
    const db = fakeDb();
    const pushFn = vi.fn();
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-Y', branchId: 'BR-Y', customerId: 'C', status: 'pending', appointmentDate: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-A', lineUserId: 'legacy-A', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      ...baseCtx,
    });
    expect(r.status).toBe('skipped-no-line-this-branch');
    expect(pushFn).not.toHaveBeenCalled();
  });

  it('LR3.2 customer linked at appt branch via per-branch entry → uses that userId', async () => {
    const db = fakeDb();
    const pushFn = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-Y2', branchId: 'BR-Y', customerId: 'C', status: 'pending', appointmentDate: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-A', lineUserId: 'legacy-A', lineUserId_byBranch: { 'BR-Y': { lineUserId: 'U-Y' } } },
      ...baseCtx,
      pushFn,
    });
    expect(r.status).toBe('sent');
    expect(pushFn.mock.calls[0][0].lineUserId).toBe('U-Y');
  });

  it('LR3.3 legacy lineUserId valid ONLY when customer.branchId === appt.branchId', async () => {
    const db = fakeDb();
    const pushFn = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-A', branchId: 'BR-A', customerId: 'C', status: 'pending', appointmentDate: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-A', lineUserId: 'legacy-A', lineUserId_byBranch: {} },
      ...baseCtx,
      branch: { branchId: 'BR-A', branchName: 'A' },
      pushFn,
    });
    expect(r.status).toBe('sent');
    expect(pushFn.mock.calls[0][0].lineUserId).toBe('legacy-A');
  });

  it('LR3.4 per-branch stale → skipped-stale', async () => {
    const db = fakeDb();
    const pushFn = vi.fn();
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-Y3', branchId: 'BR-Y', customerId: 'C', status: 'pending', appointmentDate: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-A', lineUserId_byBranch: { 'BR-Y': { lineUserId: 'U-Y', _lineStale: true } } },
      ...baseCtx,
      pushFn,
    });
    expect(r.status).toBe('skipped-stale');
  });
});
