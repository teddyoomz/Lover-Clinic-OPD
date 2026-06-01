import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted — the factory runs at import-resolution time (before the module body),
// so mockVerify must be hoisted too, otherwise it's in the TDZ when captured.
const { mockVerify } = vi.hoisted(() => ({ mockVerify: vi.fn() }));
vi.mock('../api/admin/_lib/adminAuth.js', () => ({
  verifyAdminOrPermissionToken: (...a) => mockVerify(...a),
}));

import handler, { CRON_MODULE } from '../api/admin/run-scheduled-task.js';
import { SCHEDULED_TASKS } from '../src/lib/scheduledTasksRegistry.js';

function mkRes() {
  const r = { _status: 200, _json: null };
  r.status = (c) => { r._status = c; return r; };
  r.json = (o) => { r._json = o; return r; };
  return r;
}

describe('run-scheduled-task endpoint', () => {
  beforeEach(() => mockVerify.mockReset());

  it('CRON_MODULE covers exactly every registry task', () => {
    for (const t of SCHEDULED_TASKS) expect(CRON_MODULE[t.id]).toBeTruthy();
    expect(Object.keys(CRON_MODULE).length).toBe(SCHEDULED_TASKS.length);
  });

  it('returns early when auth fails (helper returned null → no further output)', async () => {
    mockVerify.mockResolvedValue(null); // helper already wrote 401/403 + returned null
    const res = mkRes();
    const out = await handler({ method: 'POST', body: { taskId: 'chatHistoryRetention' } }, res);
    expect(out).toBeUndefined();   // handler hit `if (!auth) return;`
    expect(res._json).toBeNull();  // handler wrote nothing further (no 405/400/dispatch)
    expect(mockVerify).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'scheduled_task_management');
  });

  it('405 on non-POST', async () => {
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'a@b.com', isAdmin: true });
    const res = mkRes();
    await handler({ method: 'GET', body: {} }, res);
    expect(res._status).toBe(405);
  });

  it('400 on unknown taskId', async () => {
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'a@b.com', isAdmin: true });
    const res = mkRes();
    await handler({ method: 'POST', body: { taskId: 'nope' } }, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('UNKNOWN_TASK');
  });

  it('dispatches a valid task (wiring proven: taskId surfaced, not 400/405)', async () => {
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'admin@x.com', isAdmin: true });
    const res = mkRes();
    await handler({ method: 'POST', body: { taskId: 'stockLotCleanup' } }, res);
    // The real cron runs with the synthetic CRON_SECRET request; regardless of its
    // outcome (401 on missing secret / 500 on no admin creds in test), the endpoint
    // surfaces taskId → proves the dispatch reached the cron module.
    expect(res._status).not.toBe(400);
    expect(res._status).not.toBe(405);
    expect(res._json.taskId).toBe('stockLotCleanup');
  });
});
