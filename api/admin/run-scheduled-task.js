// ─── /api/admin/run-scheduled-task (2026-06-02) ───────────────────────────
//
// Manual "run now" for a scheduled task. Admin-authed (or scheduled_task_management
// permission). Dispatches by taskId → the SAME Vercel cron handler the schedule
// fires, invoked with a synthetic request carrying the server-side CRON_SECRET +
// force=1 (so a disabled task can still be run on demand for testing). The cron's
// own config-guard, work, audit doc, and status-doc write all run unchanged.
//
// Reuses the exact cron logic (no core duplication). The endpoint is gated at its
// OWN layer (admin/perm); the synthetic CRON_SECRET never leaves the server.

import { verifyAdminOrPermissionToken } from './_lib/adminAuth.js';
import { getTask } from '../../src/lib/scheduledTasksRegistry.js';

// taskId → cron module (relative to api/admin/). Must cover every registry task.
export const CRON_MODULE = Object.freeze({
  lineReminderFire: '../cron/line-reminder-fire.js',
  lineReminderRetry: '../cron/line-reminder-retry.js',
  wholeSystemBackup: '../cron/whole-system-backup-daily.js',
  chatHistoryRetention: '../cron/chat-history-retention-sweep.js',
  staffChatRetention: '../cron/staff-chat-retention-sweep.js',
  stockMovementRetention: '../cron/stock-movement-retention.js',
  stockLotCleanup: '../cron/stock-lot-cleanup.js',
  patientLinkCleanup: '../cron/patient-link-cleanup-sweep.js',
  chartEditSessionSweep: '../cron/chart-edit-session-sweep.js',
  opdSessionCleanup: '../cron/opd-session-cleanup-sweep.js',
});

export default async function handler(req, res) {
  const auth = await verifyAdminOrPermissionToken(req, res, 'scheduled_task_management');
  if (!auth) return; // 401/403 already written by the helper

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const taskId = req.body?.taskId;
  if (!getTask(taskId) || !CRON_MODULE[taskId]) {
    return res.status(400).json({ error: 'UNKNOWN_TASK', taskId: taskId ?? null });
  }

  let mod;
  try {
    mod = await import(CRON_MODULE[taskId]);
  } catch (e) {
    return res.status(500).json({ error: 'CRON_IMPORT_FAILED', taskId, message: e.message });
  }

  // Synthetic request — server-side CRON_SECRET + force=1 (run even if disabled).
  const fakeReq = {
    method: 'GET',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
    query: { force: '1' },
    body: { force: true },
  };
  let payload = null, status = 200;
  const fakeRes = {
    status(c) { status = c; return this; },
    json(o) { payload = o; return this; },
    send(o) { payload = o; return this; },
    end() { return this; },
  };

  try {
    await mod.default(fakeReq, fakeRes);
  } catch (e) {
    return res.status(500).json({ error: 'RUN_FAILED', taskId, message: e.message });
  }

  return res.status(status >= 400 ? status : 200).json({
    ranBy: auth.email || auth.uid,
    taskId,
    cronStatus: status,
    result: payload,
  });
}
