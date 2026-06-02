// ─── /api/admin/run-scheduled-task (2026-06-02) ───────────────────────────
//
// Manual "run now" for a scheduled task. Admin-authed (or scheduled_task_management
// permission). Dispatches by taskId → the SAME Vercel cron handler the schedule
// fires, invoked with a synthetic request carrying the server-side CRON_SECRET +
// force=1 (so a disabled task can still be run on demand for testing). The cron's
// own config-guard, work, audit doc, and status-doc write all run unchanged.
//
// The cron handlers are imported STATICALLY (not via a dynamic computed import) so
// Vercel's bundler traces + includes them in this function's bundle — a dynamic
// `import(map[taskId])` is NOT traceable and fails at runtime with "Cannot find
// module" (caught by post-deploy verification 2026-06-02).
import { verifyAdminOrPermissionToken } from './_lib/adminAuth.js';
import { getTask } from '../../src/lib/scheduledTasksRegistry.js';
import lineReminderFire from '../cron/line-reminder-fire.js';
import lineReminderRetry from '../cron/line-reminder-retry.js';
import wholeSystemBackup from '../cron/whole-system-backup-daily.js';
import chatHistoryRetention from '../cron/chat-history-retention-sweep.js';
import staffChatRetention from '../cron/staff-chat-retention-sweep.js';
import stockMovementRetention from '../cron/stock-movement-retention.js';
import stockLotCleanup from '../cron/stock-lot-cleanup.js';
import patientLinkCleanup from '../cron/patient-link-cleanup-sweep.js';
import chartEditSessionSweep from '../cron/chart-edit-session-sweep.js';
import opdSessionCleanup from '../cron/opd-session-cleanup-sweep.js';

// taskId → cron default handler. Must cover every registry task.
export const CRON_HANDLER = Object.freeze({
  lineReminderFire, lineReminderRetry, wholeSystemBackup, chatHistoryRetention,
  staffChatRetention, stockMovementRetention, stockLotCleanup, patientLinkCleanup,
  chartEditSessionSweep, opdSessionCleanup,
});

export default async function handler(req, res) {
  const auth = await verifyAdminOrPermissionToken(req, res, 'scheduled_task_management');
  if (!auth) return; // 401/403 already written by the helper

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const taskId = req.body?.taskId;
  const cron = getTask(taskId) ? CRON_HANDLER[taskId] : null;
  if (!cron) {
    return res.status(400).json({ error: 'UNKNOWN_TASK', taskId: taskId ?? null });
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
    await cron(fakeReq, fakeRes);
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
