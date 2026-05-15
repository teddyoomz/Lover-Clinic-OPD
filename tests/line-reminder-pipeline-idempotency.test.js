import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the pipeline-step helper exported from the cron handler module.
// The handler exports runReminderPipeline for testing (with injected db + push fn).
import { runReminderPipeline } from '../api/cron/line-reminder-fire.js';

function fakeDb() {
  const data = new Map();
  function pathKey(parts) { return parts.join('/'); }
  return {
    data,
    doc(p) {
      const key = pathKey([p]);
      return {
        get: async () => ({ exists: data.has(key), data: () => data.get(key) || null, id: p.split('/').pop() }),
        set: async (v) => { data.set(key, v); },
        update: async (v) => { data.set(key, { ...(data.get(key) || {}), ...v }); },
      };
    },
  };
}

describe('T4 runReminderPipeline — idempotency + skip paths', () => {
  it('T4.1 already-sent log → returns "already-sent"', async () => {
    const db = fakeDb();
    const apptId = 'BA-1';
    const reminderType = 'dayBefore';
    db.data.set(`artifacts/loverclinic-opd-4c39b/public/data/be_line_reminder_log/${apptId}_${reminderType}`, { status: 'sent' });
    const result = await runReminderPipeline({
      db,
      appt: { id: apptId, branchId: 'BR-A', customerId: 'C1', status: 'pending' },
      cust: { id: 'C1', branchId: 'BR-A', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      branch: { branchId: 'BR-A' },
      branchCfg: { channelAccessToken: 'TOK', lineReminder: { quietHourStart: 22, quietHourEnd: 8 } },
      reminderType,
      currentHour: 20,
      pushFn: vi.fn(),
    });
    expect(result.status).toBe('already-sent');
  });

  it('T4.2 appt.status=cancelled → skipped-cancelled', async () => {
    const db = fakeDb();
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-2', branchId: 'BR-A', customerId: 'C1', status: 'cancelled' },
      cust: { id: 'C1', branchId: 'BR-A', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      branch: { branchId: 'BR-A' },
      branchCfg: { channelAccessToken: 'TOK', lineReminder: { quietHourStart: 22, quietHourEnd: 8 } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn: vi.fn(),
    });
    expect(r.status).toBe('skipped-cancelled');
  });

  it('T4.3 customer.notifyOptOut=true → skipped-optout', async () => {
    const db = fakeDb();
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-3', branchId: 'BR-A', customerId: 'C1', status: 'pending' },
      cust: { id: 'C1', branchId: 'BR-A', notifyOptOut: true, lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      branch: { branchId: 'BR-A' },
      branchCfg: { channelAccessToken: 'TOK', lineReminder: { quietHourStart: 22, quietHourEnd: 8 } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn: vi.fn(),
    });
    expect(r.status).toBe('skipped-optout');
  });

  it('T4.4 successful push → status sent + log + appointment notifyMeta updated', async () => {
    const db = fakeDb();
    const apptId = 'BA-4';
    db.data.set(`artifacts/loverclinic-opd-4c39b/public/data/be_appointments/${apptId}`, { id: apptId });
    const pushFn = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const r = await runReminderPipeline({
      db,
      appt: { id: apptId, branchId: 'BR-A', customerId: 'C1', status: 'pending', date: '2026-05-16', startTime: '14:30' },
      cust: { id: 'C1', branchId: 'BR-A', name: 'X', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      branch: { branchId: 'BR-A', branchName: 'Nakhon' },
      doctor: null,
      treatments: [],
      branchCfg: { channelAccessToken: 'TOK', lineReminder: { quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'hi {{customerName}}', templateDayOf: 'x', cancellationPolicyText: 'c' } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn,
    });
    expect(r.status).toBe('sent');
    expect(pushFn).toHaveBeenCalledOnce();
    const callArg = pushFn.mock.calls[0][0];
    expect(callArg.channelAccessToken).toBe('TOK');  // ← LR-1: per-branch
    expect(callArg.lineUserId).toBe('U-A');
    const logKey = `artifacts/loverclinic-opd-4c39b/public/data/be_line_reminder_log/${apptId}_dayBefore`;
    const log = db.data.get(logKey);
    expect(log.status).toBe('sent');
    expect(log.branchId).toBe('BR-A');  // ← LR-5: branchId stamped
  });
});
