// ─── Scheduled Task Runtime (2026-06-02) ──────────────────────────────────
//
// Admin-SDK helpers shared by every Vercel cron. Reads the per-task runtime
// config (enable/disable + params) from clinic_settings/system_config, and
// writes a per-task last-run slice into clinic_settings/scheduled_task_status
// (a denormalized status doc the ScheduledTasksTab listens to — separate from
// the immutable be_admin_audit ledger).
//
// 🛡 FAIL-SAFE: a config-read error / missing doc MUST default to enabled:true
//    with empty params, so a safety-critical cron (backup, chat-history
//    retention, opd-session cleanup) NEVER stops silently because of a transient
//    config read failure. The caller threads params as `cfg.params.X ?? CORE_DEFAULT`.

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const CONFIG_DOC = `${PREFIX}/clinic_settings/system_config`;
const STATUS_DOC = `${PREFIX}/clinic_settings/scheduled_task_status`;

/**
 * @param {import('firebase-admin/firestore').Firestore} db  admin Firestore
 * @param {string} taskId  registry task id
 * @returns {Promise<{enabled:boolean, params:object}>}
 */
export async function readScheduledTaskConfig(db, taskId) {
  try {
    const snap = await db.doc(CONFIG_DOC).get();
    const all = snap.exists ? (snap.data()?.scheduledTasks || {}) : {};
    const t = all[taskId] || {};
    return {
      enabled: t.enabled !== false, // default true (fail-safe)
      params: (t.params && typeof t.params === 'object' && !Array.isArray(t.params)) ? t.params : {},
    };
  } catch (e) {
    console.warn(`[readScheduledTaskConfig] ${taskId} read failed; FAIL-SAFE enabled:`, e.message);
    return { enabled: true, params: {} };
  }
}

/**
 * Merge a per-task status slice. Non-fatal: a status-write failure never breaks
 * the cron (the cron's real work + audit doc already succeeded).
 *
 * `warn` (2026-07-21): ran-but-PARTIALLY-failed — the cron completed (ok:true)
 * but dropped work a human should know about (backup missing collections, a
 * fully-failed reminder night). infraHealthCore.checkOneTask surfaces it as a
 * 'warn' check → daily alert card/LINE — closing the "green on a partial run"
 * silent-death class. `counts` carries the raw numbers for the health card.
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} taskId
 * @param {{ok?:boolean, summary?:string, error?:string, skipped?:boolean, warn?:boolean, counts?:object|null}} result
 */
export async function writeScheduledTaskStatus(db, taskId, { ok = true, summary = '', error = '', skipped = false, warn = false, counts = null } = {}) {
  try {
    await db.doc(STATUS_DOC).set(
      {
        [taskId]: {
          lastRunAt: new Date().toISOString(),
          ok,
          summary: String(summary).slice(0, 200),
          error: String(error).slice(0, 300),
          skipped,
          warn: warn === true,
          ...(counts && typeof counts === 'object' && !Array.isArray(counts) ? { counts } : {}),
        },
      },
      { merge: true },
    );
  } catch (e) {
    console.warn(`[writeScheduledTaskStatus] ${taskId} write failed (non-fatal):`, e.message);
  }
}
