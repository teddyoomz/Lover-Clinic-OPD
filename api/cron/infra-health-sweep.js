// ─── /api/cron/infra-health-sweep (2026-07-19) ─────────────────────────────
//
// Daily 07:30 BKK (00:30 UTC — after every night cron: backup 03:00, retention
// 03:20-04:30, recon 04:15). Reads the liveness surfaces, evaluates via the
// pure src/lib/infraHealthCore.js, writes a deterministic status doc, and on
// warn/red alerts through TWO FCM-independent channels: a staff-chat system
// card + LINE OA text push (FCM cannot announce its own death — AV210).
//
// Origin: push outage silent 12 days (AV210) · backup NO_MANIFEST silent 5
// days (V122) · chat-history retention cron dead 46 runs. This cron is the
// "next-morning alert" for that whole class.
//
// Writes: be_admin_audit/infra-health-latest (full overwrite — the UI banner
// reads this by id) + be_admin_audit/infra-health-{YYYYMMDD} (history) +
// scheduled_task_status.infraHealthSweep. Alert failures are NON-FATAL (the
// status docs already landed). Tail duty: purge client_error_log older than
// CLIENT_ERROR_RETENTION_DAYS (bounded batch ≤500 — AV141).
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readScheduledTaskConfig, writeScheduledTaskStatus } from '../_lib/scheduledTaskRuntime.js';
import { getLineConfigForBranch } from '../admin/_lib/lineConfigAdmin.js';
import { pushLineMessage } from '../../src/lib/lineReminderClient.js';
import { resolveParam } from '../../src/lib/scheduledTasksRegistry.js';
import {
  evaluateInfraHealth,
  buildInfraAlertText,
  buildInfraChatCardDoc,
  INFRA_FALLBACK_STAFF_CHAT_BRANCH,
  CLIENT_ERROR_RETENTION_DAYS,
  DEFAULT_ERROR_THRESHOLD_24H,
} from '../../src/lib/infraHealthCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const TASK_ID = 'infraHealthSweep';

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

function bangkokParts(nowMs = Date.now()) {
  const iso = new Date(nowMs + 7 * 3600000).toISOString();
  const dateISO = iso.slice(0, 10);
  return {
    dateISO,
    dateKey: dateISO.replace(/-/g, ''),
    // dd/mm/พ.ศ. HH:MM — Thai display convention
    dateLabel: `${dateISO.slice(8, 10)}/${dateISO.slice(5, 7)}/${Number(dateISO.slice(0, 4)) + 543} ${iso.slice(11, 16)}`,
  };
}

function bangkokYesterdayKey(nowMs = Date.now()) {
  const bkk = new Date(nowMs + 7 * 3600000);
  bkk.setUTCDate(bkk.getUTCDate() - 1);
  return bkk.toISOString().slice(0, 10).replace(/-/g, '');
}

async function safeGetDoc(db, path) {
  try {
    const snap = await db.doc(path).get();
    return snap.exists ? snap.data() : null;
  } catch {
    return null;
  }
}

// Shared sweep — exported for scripts/diag-infra-health.mjs (Rule of 3 with
// money-reconciliation-sweep's export pattern). readOnly skips every write.
export async function sweepInfraHealth({ db, nowMs = Date.now(), readOnly = false, forceAlert = false }) {
  const { dateKey, dateLabel } = bangkokParts(nowMs);

  // ── reads ────────────────────────────────────────────────────────────────
  const statusMap = await safeGetDoc(db, `${PREFIX}/clinic_settings/scheduled_task_status`);
  const sysConfig = await safeGetDoc(db, `${PREFIX}/clinic_settings/system_config`);
  const taskConfigMap = (sysConfig && sysConfig.scheduledTasks) || {};
  const infraCfg = (sysConfig && sysConfig.infraHealth) || {};
  const reconDoc = await safeGetDoc(db, `${PREFIX}/be_admin_audit/recon-daily-${bangkokYesterdayKey(nowMs)}`);
  const pushTokensDoc = await safeGetDoc(db, `${PREFIX}/push_config/tokens`);
  const pushSettings = await safeGetDoc(db, `${PREFIX}/push_config/settings`);

  const errorThreshold24h = resolveParam(TASK_ID, 'errorThreshold24h',
    taskConfigMap?.[TASK_ID]?.params?.errorThreshold24h) ?? DEFAULT_ERROR_THRESHOLD_24H;
  const errCol = db.collection(`${PREFIX}/client_error_log`);
  let errorCount24h = 0;
  let errorSamples = [];
  try {
    const cutoff = nowMs - 24 * 3600000;
    const agg = await errCol.where('createdAtMs', '>', cutoff).count().get();
    errorCount24h = agg.data().count || 0;
    if (errorCount24h >= errorThreshold24h) {
      const snap = await errCol.where('createdAtMs', '>', cutoff)
        .orderBy('createdAtMs', 'desc').limit(3).get();
      errorSamples = snap.docs.map(d => String(d.data().message || '').slice(0, 80));
    }
  } catch (e) {
    console.warn('[infra-health] error-count read failed (non-fatal):', e.message);
  }

  // ── evaluate (pure) ──────────────────────────────────────────────────────
  const result = evaluateInfraHealth({
    statusMap, taskConfigMap, reconDoc, reconExpected: true,
    pushTokens: (pushTokensDoc && pushTokensDoc.tokens) || [],
    pushSettings, errorCount24h, errorThreshold24h, errorSamples, nowMs,
  });

  const alerted = { staffChat: false, staffChatBranchId: '', line: [] };
  const lineTargets = Array.isArray(infraCfg.lineTargets) ? infraCfg.lineTargets.slice(0, 5) : [];

  if (!readOnly) {
    // ── status docs (always, before alerts — alert failure must not lose state) ─
    const statusDoc = {
      type: 'infra-health',
      overall: result.overall,
      checks: result.checks,
      dateKey,
      lineTargetCount: lineTargets.length,
      performedAt: new Date(nowMs).toISOString(),
    };
    await db.doc(`${PREFIX}/be_admin_audit/infra-health-latest`).set({ ...statusDoc, alerted });
    await db.doc(`${PREFIX}/be_admin_audit/infra-health-${dateKey}`).set({ ...statusDoc, alerted });

    // ── alerts (warn/red only; each channel non-fatal) ─────────────────────
    if (result.overall !== 'ok' || forceAlert) {
      // ① staff-chat system card — deterministic per-day id = no same-day spam
      try {
        const branchId = String(infraCfg.staffChatBranchId || '') || INFRA_FALLBACK_STAFF_CHAT_BRANCH;
        const card = buildInfraChatCardDoc(result, { dateKey, branchId, dateLabel });
        await db.doc(`${PREFIX}/be_staff_chat_messages/${card.id}`)
          .set({ ...card, createdAt: FieldValue.serverTimestamp() });
        alerted.staffChat = true;
        alerted.staffChatBranchId = branchId;
      } catch (e) {
        console.warn('[infra-health] staff-chat alert failed (non-fatal):', e.message);
      }
      // ② LINE OA text push per configured target (per-branch OA token — the
      //    recipient must be a friend of THAT branch's OA; 410 = unfollowed)
      const text = buildInfraAlertText(result, { dateLabel });
      for (const t of lineTargets) {
        const entry = { lineUserId: String(t?.lineUserId || ''), branchId: String(t?.branchId || ''), statusCode: 0 };
        try {
          const cfg = await getLineConfigForBranch(db, entry.branchId);
          if (!cfg || !cfg.channelAccessToken) { entry.statusCode = -1; }
          else {
            const r = await pushLineMessage({
              channelAccessToken: cfg.channelAccessToken,
              lineUserId: entry.lineUserId,
              flexJson: { type: 'text', text },
            });
            entry.statusCode = r.statusCode;
          }
        } catch (e) {
          entry.statusCode = -2;
          console.warn('[infra-health] LINE alert failed (non-fatal):', e.message);
        }
        alerted.line.push(entry);
      }
      // persist alert outcomes onto the latest doc
      await db.doc(`${PREFIX}/be_admin_audit/infra-health-latest`).set({ alerted }, { merge: true });
      await db.doc(`${PREFIX}/be_admin_audit/infra-health-${dateKey}`).set({ alerted }, { merge: true });
    }

    // ── retention tail: purge client_error_log > 30d (bounded — AV141) ─────
    try {
      const purgeCutoff = nowMs - CLIENT_ERROR_RETENTION_DAYS * 24 * 3600000;
      const old = await errCol.where('createdAtMs', '<', purgeCutoff).limit(500).get();
      if (!old.empty) {
        const batch = db.batch();
        old.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) {
      console.warn('[infra-health] error-log purge failed (non-fatal):', e.message);
    }
  }

  return { result, alerted, errorCount24h, dateKey };
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const provided = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '')
    || req.headers?.['x-cron-secret'];
  if (!cronSecret || provided !== cronSecret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    initAdmin();
    const db = getFirestore();
    const force = String(req.query?.force || '') === '1'; // run-scheduled-task "run now"
    const cfg = await readScheduledTaskConfig(db, TASK_ID);
    if (!cfg.enabled && !force) {
      await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: true, summary: 'ปิดใช้งาน' });
      return res.status(200).json({ ok: true, skipped: true });
    }

    const { result, alerted, errorCount24h } = await sweepInfraHealth({ db });
    await writeScheduledTaskStatus(db, TASK_ID, {
      ok: true,
      summary: `overall=${result.overall} · issues=${result.checks.filter(c => c.status === 'red' || c.status === 'warn').length} · errors24h=${errorCount24h}`,
    });
    return res.status(200).json({ ok: true, overall: result.overall, checks: result.checks, alerted });
  } catch (e) {
    console.error('[infra-health-sweep] failed:', e);
    try {
      initAdmin();
      await writeScheduledTaskStatus(getFirestore(), TASK_ID, { ok: false, error: String(e?.message || e) });
    } catch { /* non-fatal */ }
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
