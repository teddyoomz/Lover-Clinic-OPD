// ─── Infra Health Core (2026-07-19) — pure SSOT ────────────────────────────
//
// Evaluates the health of every silent-failure-prone subsystem: the 13 Vercel
// crons (via the clinic_settings/scheduled_task_status doc 11 of them already
// write), the daily whole-system backup, the push-token fleet (AV210 class),
// yesterday's money reconciliation, and the client-error beacon volume.
//
// Origin: three separate silent-infra deaths — push outage 12 days (AV210),
// whole-system backup NO_MANIFEST 5 days (V122), chat-history retention cron
// dead for 46 runs. This module turns "silent for days" into "alert next
// morning" (staff-chat card + LINE OA push — both independent of FCM, because
// FCM cannot announce its own death).
//
// PURE: no firebase imports. Consumed by api/cron/infra-health-sweep.js,
// scripts/diag-infra-health.mjs, InfraHealthSection.jsx, and the test bank.
// The classifier test locks: every vercel.json crons[] path must appear in
// INFRA_TASK_EXPECTATIONS ∪ INFRA_SPECIAL_CRON_PATHS ∪ INFRA_UNMONITORED_CRON_PATHS
// ∪ INFRA_SELF_CRON_PATH — a future cron added without declaring its health
// coverage fails the build (AV142-style anti-drift).

// Stateless warmer — writes nothing to Firestore (monitoring it would cost
// 288 writes/day for a low-stakes cold-LCP nicety). Declared, not forgotten.
export const INFRA_UNMONITORED_CRON_PATHS = Object.freeze(['/api/cron/patient-view-warmup']);
export const INFRA_SELF_CRON_PATH = '/api/cron/infra-health-sweep';
// Crons checked by a mechanism other than scheduled_task_status.
export const INFRA_SPECIAL_CRON_PATHS = Object.freeze({
  '/api/cron/money-reconciliation-sweep': 'reconDaily', // deterministic be_admin_audit/recon-daily-YYYYMMDD
});

// Keyed by scheduled_task_status taskId. maxAgeHours = slack over the cron's
// real period (daily crons get 36h so one missed night = alert, not a race).
export const INFRA_TASK_EXPECTATIONS = Object.freeze({
  lineReminderFire:           { cronPath: '/api/cron/line-reminder-fire',            maxAgeHours: 6,  sev: 'warn', label: 'LINE เตือนนัด' },
  lineReminderRetry:          { cronPath: '/api/cron/line-reminder-retry',           maxAgeHours: 2,  sev: 'warn', label: 'LINE retry' },
  wholeSystemBackup:          { cronPath: '/api/cron/whole-system-backup-daily',     maxAgeHours: 36, sev: 'red',  label: 'Backup ทั้งระบบ' },
  chatHistoryRetention:       { cronPath: '/api/cron/chat-history-retention-sweep',  maxAgeHours: 36, sev: 'warn', label: 'ลบประวัติแชทลูกค้า' },
  staffChatRetention:         { cronPath: '/api/cron/staff-chat-retention-sweep',    maxAgeHours: 36, sev: 'warn', label: 'ลบไฟล์แชทพนักงานเก่า' },
  stockMovementRetention:     { cronPath: '/api/cron/stock-movement-retention',      maxAgeHours: 36, sev: 'warn', label: 'ลบ movement สต็อกเก่า' },
  stockLotCleanup:            { cronPath: '/api/cron/stock-lot-cleanup',             maxAgeHours: 36, sev: 'warn', label: 'ลบ lot สต็อกว่าง' },
  patientLinkCleanup:         { cronPath: '/api/cron/patient-link-cleanup-sweep',    maxAgeHours: 36, sev: 'warn', label: 'ลบลิงก์คนไข้เก่า' },
  chartEditSessionSweep:      { cronPath: '/api/cron/chart-edit-session-sweep',      maxAgeHours: 2,  sev: 'warn', label: 'กวาดเซสชัน chart' },
  opdSessionCleanup:          { cronPath: '/api/cron/opd-session-cleanup-sweep',     maxAgeHours: 3,  sev: 'warn', label: 'กวาด OPD session' },
  opdSessionArchiveRetention: { cronPath: '/api/cron/opd-session-archive-retention', maxAgeHours: 36, sev: 'warn', label: 'ลบ OPD archive เก่า' },
});

export const PUSH_TOKEN_FRESH_DAYS = 45;
export const CLIENT_ERROR_RETENTION_DAYS = 30;
export const DEFAULT_ERROR_THRESHOLD_24H = 5;
// V77-bis precedent: hardcoded นครราชสีมา as last-resort fallback below config,
// so the staff-chat alert works out of the box even before admin configures it.
export const INFRA_FALLBACK_STAFF_CHAT_BRANCH = 'BR-1777873556815-26df6480';

const HOUR_MS = 3600 * 1000;

function formatAgeThai(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'ไม่ทราบเวลา';
  const hours = ageMs / HOUR_MS;
  if (hours < 1) return `${Math.max(1, Math.round(ageMs / 60000))} นาทีก่อน`;
  if (hours < 48) return `${Math.round(hours)} ชม.ก่อน`;
  return `${Math.round(hours / 24)} วันก่อน`;
}

/** Count push tokens minted within freshDays. Legacy bare-string tokens have
 *  no createdAt → stale by definition (AV210 prune semantics). */
export function freshPushTokenCount(tokens, nowMs, freshDays = PUSH_TOKEN_FRESH_DAYS) {
  if (!Array.isArray(tokens)) return 0;
  const cutoff = nowMs - freshDays * 24 * HOUR_MS;
  let n = 0;
  for (const t of tokens) {
    if (!t || typeof t !== 'object') continue; // legacy string form = stale
    const ms = Date.parse(t.createdAt || '');
    if (Number.isFinite(ms) && ms >= cutoff) n += 1;
  }
  return n;
}

function checkOneTask(taskId, exp, statusMap, taskConfigMap, nowMs) {
  const id = `task:${taskId}`;
  const label = exp.label;
  const cfg = (taskConfigMap && taskConfigMap[taskId]) || {};
  if (cfg.enabled === false) {
    return { id, label, status: 'skip', detail: 'ปิดใช้งานอยู่' };
  }
  const st = statusMap ? statusMap[taskId] : null;
  if (!st || !st.lastRunAt) {
    return { id, label, status: exp.sev, detail: 'ไม่พบประวัติการรันเลย' };
  }
  if (st.skipped === true) {
    return { id, label, status: 'skip', detail: 'รอบล่าสุดถูกข้าม (ปิดใช้งานตอนรัน)' };
  }
  const runMs = Date.parse(st.lastRunAt);
  const ageMs = Number.isFinite(runMs) ? nowMs - runMs : NaN;
  if (!Number.isFinite(ageMs) || ageMs > exp.maxAgeHours * HOUR_MS) {
    return {
      id, label, status: exp.sev,
      detail: `ไม่ได้รันตามรอบ — ล่าสุด ${formatAgeThai(ageMs)} (เกณฑ์ ${exp.maxAgeHours} ชม.)`,
    };
  }
  if (st.ok === false) {
    return {
      id, label, status: exp.sev,
      detail: `รันแล้วล้มเหลว: ${String(st.error || st.summary || 'ไม่ทราบสาเหตุ').slice(0, 120)}`,
    };
  }
  // warn (2026-07-21): ran-but-PARTIAL — ok:true but the cron dropped work
  // (backup missing collections / a fully-failed reminder night). Pre-fix this
  // rendered as ✅ ปกติ = a partial run stayed invisible (silent-rot class).
  if (st.warn === true) {
    return {
      id, label, status: 'warn',
      detail: `รันสำเร็จแต่มีปัญหาบางส่วน: ${String(st.summary || 'ไม่ระบุ').slice(0, 120)}`,
    };
  }
  return { id, label, status: 'ok', detail: `ปกติ — รันล่าสุด ${formatAgeThai(ageMs)}` };
}

/**
 * evaluateSweepStaleness (2026-07-21) — watcher-of-the-watcher, client side.
 * The sweep cannot announce its OWN death (it is excluded from its task
 * expectations by design), so staff-facing shells check the age of
 * be_admin_audit/infra-health-latest.performedAt and show a banner when the
 * sweep has not run within maxAgeHours (default 36h = one missed daily run
 * + grace). Pure — caller supplies performedAt + nowMs.
 */
export const SWEEP_STALE_HOURS = 36;
export function evaluateSweepStaleness({ performedAt = null, nowMs = 0, maxAgeHours = SWEEP_STALE_HOURS } = {}) {
  if (!performedAt) return { stale: true, reason: 'never-ran', ageHours: null };
  const t = Date.parse(performedAt);
  if (!Number.isFinite(t)) return { stale: true, reason: 'never-ran', ageHours: null };
  const ageHours = (nowMs - t) / HOUR_MS;
  if (ageHours > maxAgeHours) return { stale: true, reason: 'stale', ageHours };
  return { stale: false, reason: 'fresh', ageHours };
}

/**
 * Pure evaluator. All inputs are plain data already read by the caller.
 * @returns {{overall:'ok'|'warn'|'red', checks:Array<{id:string,label:string,status:string,detail:string}>}}
 */
export function evaluateInfraHealth({
  statusMap = null,          // scheduled_task_status doc data (taskId → slice)
  taskConfigMap = null,      // system_config.scheduledTasks (taskId → {enabled,params})
  reconDoc = null,           // be_admin_audit/recon-daily-{yesterday} data or null
  reconExpected = true,
  pushTokens = [],           // push_config/tokens.tokens array
  pushSettings = null,       // push_config/settings data ({globalPushMuted})
  errorCount24h = 0,
  errorThreshold24h = DEFAULT_ERROR_THRESHOLD_24H,
  errorSamples = [],         // up to 3 short strings
  nowMs = 0,
} = {}) {
  const checks = [];

  // 1) the 11 status-doc crons (incl. the whole-system backup — the V122 class)
  for (const [taskId, exp] of Object.entries(INFRA_TASK_EXPECTATIONS)) {
    checks.push(checkOneTask(taskId, exp, statusMap, taskConfigMap, nowMs));
  }

  // 2) money reconciliation — deterministic daily doc
  if (reconExpected) {
    if (!reconDoc) {
      checks.push({ id: 'recon', label: 'ตรวจเงินรายวัน (Recon)', status: 'warn', detail: 'ไม่พบผลตรวจของเมื่อวาน — cron อาจไม่ได้รัน' });
    } else if (Number(reconDoc.discrepancyCount) > 0) {
      checks.push({ id: 'recon', label: 'ตรวจเงินรายวัน (Recon)', status: 'warn', detail: `พบ discrepancy ${Number(reconDoc.discrepancyCount)} รายการ — เปิดรายงานกระทบยอด` });
    } else {
      checks.push({ id: 'recon', label: 'ตรวจเงินรายวัน (Recon)', status: 'ok', detail: `ตรง ${Number(reconDoc.checked) || 0} ใบ` });
    }
  }

  // 3) push fleet (AV210 class — zero fresh tokens = every device dead/silent)
  const fresh = freshPushTokenCount(pushTokens, nowMs);
  if (pushSettings && pushSettings.globalPushMuted === true) {
    checks.push({ id: 'push', label: 'Push notifications', status: 'info', detail: 'ปิดเสียงแจ้งเตือนไว้ (globalPushMuted — ตั้งใจ)' });
  } else if (fresh === 0) {
    checks.push({ id: 'push', label: 'Push notifications', status: 'red', detail: `ไม่มี push token สดเลย (≤${PUSH_TOKEN_FRESH_DAYS} วัน) — สัญญาณ fleet ตายแบบ AV210` });
  } else {
    checks.push({ id: 'push', label: 'Push notifications', status: 'ok', detail: `token สด ${fresh} ตัว` });
  }

  // 4) client-error volume (the beacon feeding back into the daily alert)
  const threshold = Number(errorThreshold24h) > 0 ? Number(errorThreshold24h) : DEFAULT_ERROR_THRESHOLD_24H;
  if (Number(errorCount24h) >= threshold) {
    const samples = (Array.isArray(errorSamples) ? errorSamples : [])
      .slice(0, 3).map(s => String(s).slice(0, 80)).join(' · ');
    checks.push({
      id: 'clientErrors', label: 'Client errors 24 ชม.', status: 'warn',
      detail: `${Number(errorCount24h)} รายการ (เกณฑ์ ${threshold})${samples ? ` — ${samples}` : ''}`,
    });
  } else {
    checks.push({ id: 'clientErrors', label: 'Client errors 24 ชม.', status: 'ok', detail: `${Number(errorCount24h) || 0} รายการ` });
  }

  const overall = checks.some(c => c.status === 'red') ? 'red'
    : checks.some(c => c.status === 'warn') ? 'warn' : 'ok';
  return { overall, checks };
}

const STATUS_EMOJI = { red: '🔴', warn: '🟡' };

/** Thai alert text — issues only, red first, bounded ≤900 chars. */
export function buildInfraAlertText(result, { dateLabel = '' } = {}) {
  const issues = (result?.checks || []).filter(c => c.status === 'red' || c.status === 'warn');
  const ordered = [...issues.filter(c => c.status === 'red'), ...issues.filter(c => c.status === 'warn')];
  const head = result?.overall === 'red' ? '🩺 ระบบมีปัญหาร้ายแรง' : '🩺 ระบบมีจุดต้องตรวจ';
  const lines = [
    `${head}${dateLabel ? ` (${dateLabel})` : ''}`,
    ...ordered.map(c => `${STATUS_EMOJI[c.status] || '•'} ${c.label}: ${c.detail}`),
    'ดูรายละเอียด: Backend → ตั้งค่าระบบ → สุขภาพระบบ',
  ];
  return lines.join('\n').slice(0, 900);
}

/** Staff-chat system card doc (minus createdAt — the writer stamps it).
 *  Deterministic id per day → idempotent, no same-day spam. No undefined
 *  leaves (V14 — setDoc rejects undefined). */
export function buildInfraChatCardDoc(result, { dateKey, branchId, dateLabel = '' } = {}) {
  const issueCount = (result?.checks || []).filter(c => c.status === 'red' || c.status === 'warn').length;
  return {
    id: `CHAT-SYS-INFRA-${String(dateKey || '')}`,
    branchId: String(branchId || ''),
    deviceId: 'system',
    displayName: 'ระบบ',
    text: buildInfraAlertText(result, { dateLabel }).slice(0, 500),
    system: {
      kind: 'infra-health',
      overall: String(result?.overall || 'warn'),
      issueCount,
      dateKey: String(dateKey || ''),
    },
  };
}
