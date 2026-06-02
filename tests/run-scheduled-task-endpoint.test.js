import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const { mockVerify } = vi.hoisted(() => ({ mockVerify: vi.fn() }));
vi.mock('../api/admin/_lib/adminAuth.js', () => ({
  verifyAdminOrPermissionToken: (...a) => mockVerify(...a),
}));

import handler from '../api/admin/run-scheduled-task.js';
import { SCHEDULED_TASKS } from '../src/lib/scheduledTasksRegistry.js';

function mkRes() {
  const r = { _status: 200, _json: null };
  r.status = (c) => { r._status = c; return r; };
  r.json = (o) => { r._json = o; return r; };
  return r;
}

const ORIGINAL_FETCH = global.fetch;
beforeEach(() => mockVerify.mockReset());
afterAll(() => { if (ORIGINAL_FETCH === undefined) delete global.fetch; else global.fetch = ORIGINAL_FETCH; });

describe('run-scheduled-task endpoint (internal-HTTP trigger)', () => {
  it('every registry task has a /api/cron/ trigger target', () => {
    for (const t of SCHEDULED_TASKS) expect(t.cronPath).toMatch(/^\/api\/cron\/[\w-]+$/);
  });

  it('returns early when auth fails (helper returned null)', async () => {
    mockVerify.mockResolvedValue(null);
    const res = mkRes();
    const out = await handler({ method: 'POST', body: { taskId: 'chartEditSessionSweep' } }, res);
    expect(out).toBeUndefined();
    expect(res._json).toBeNull();
    expect(mockVerify).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'scheduled_task_management');
  });

  it('405 on non-POST', async () => {
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'a@b.com', isAdmin: true });
    const res = mkRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res._status).toBe(405);
  });

  it('400 on unknown taskId', async () => {
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'a@b.com', isAdmin: true });
    const res = mkRes();
    await handler({ method: 'POST', headers: {}, body: { taskId: 'nope' } }, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('UNKNOWN_TASK');
  });

  it('triggers the cron function on the same host with ?force=1 + CRON_SECRET', async () => {
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'admin@x.com', isAdmin: true });
    process.env.CRON_SECRET = 'sek';
    global.fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ scanned: 3, deleted: 1 }) });
    const res = mkRes();
    await handler({ method: 'POST', headers: { host: 'app.test' }, body: { taskId: 'chartEditSessionSweep' } }, res);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://app.test/api/cron/chart-edit-session-sweep?force=1');
    expect(opts.method).toBe('GET');
    expect(opts.headers.authorization).toBe('Bearer sek');
    expect(res._status).toBe(200);
    expect(res._json).toMatchObject({ taskId: 'chartEditSessionSweep', cronStatus: 200, ranBy: 'admin@x.com' });
    expect(res._json.result.deleted).toBe(1);
  });

  it('surfaces a cron error status (e.g. 500) + 502 on network failure', async () => {
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'admin@x.com', isAdmin: true });
    global.fetch = vi.fn().mockResolvedValue({ status: 500, json: async () => ({ error: 'SWEEP_FAILED' }) });
    const res1 = mkRes();
    await handler({ method: 'POST', headers: { host: 'h' }, body: { taskId: 'stockLotCleanup' } }, res1);
    expect(res1._status).toBe(500);

    global.fetch = vi.fn().mockRejectedValue(new Error('econn'));
    const res2 = mkRes();
    await handler({ method: 'POST', headers: { host: 'h' }, body: { taskId: 'stockLotCleanup' } }, res2);
    expect(res2._status).toBe(502);
    expect(res2._json.error).toBe('CRON_TRIGGER_FAILED');
  });
});
