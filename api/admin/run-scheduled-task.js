// ─── /api/admin/run-scheduled-task (2026-06-02) ───────────────────────────
//
// Manual "run now" for a scheduled task. Admin-authed (or scheduled_task_management
// permission). Triggers the task's OWN deployed Vercel cron function via an internal
// HTTP call carrying the server-side CRON_SECRET + ?force=1 (so a disabled task can
// still be run on demand). The cron's own config-guard, work, audit doc, and
// status-doc write all run unchanged, in its OWN function context.
//
// Why HTTP instead of importing the cron handler: this function inits firebase-admin
// (via verifyAdminOrPermissionToken) WITHOUT a storageBucket; a statically-imported
// cron's own initAdmin() then no-ops (getApps().length>0) and getStorage().bucket()
// fails. Triggering the cron's own function avoids the shared-app-init conflict.
import { verifyAdminOrPermissionToken } from './_lib/adminAuth.js';
import { getTask } from '../../src/lib/scheduledTasksRegistry.js';

export default async function handler(req, res) {
  const auth = await verifyAdminOrPermissionToken(req, res, 'scheduled_task_management');
  if (!auth) return; // 401/403 already written by the helper

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const taskId = req.body?.taskId;
  const task = getTask(taskId);
  if (!task) {
    return res.status(400).json({ error: 'UNKNOWN_TASK', taskId: taskId ?? null });
  }

  // Call the cron's own deployed function on this same host, with CRON_SECRET + force.
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const base = host ? `https://${host}` : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  let result = null, cronStatus = 0;
  try {
    const cr = await fetch(`${base}${task.cronPath}?force=1`, {
      method: 'GET',
      headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
    });
    cronStatus = cr.status;
    result = await cr.json().catch(() => null);
  } catch (e) {
    return res.status(502).json({ error: 'CRON_TRIGGER_FAILED', taskId, message: e.message });
  }

  return res.status(cronStatus >= 400 ? cronStatus : 200).json({
    ranBy: auth.email || auth.uid,
    taskId,
    cronStatus,
    result,
  });
}
