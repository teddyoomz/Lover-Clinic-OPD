// ─── /api/cron/line-reminder-fire — Vercel Cron hourly tick ─────────────────
// Spec §2 + §3. Reads all be_line_configs (enabled branches), for each branch
// at the matching hour: lists tomorrow's appts (dayBefore) or today's appts
// (dayOf), runs pipeline per appt, writes audit doc at end.
//
// Auth: Authorization: Bearer ${CRON_SECRET} (Vercel injects via env).

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildReminderFlex } from '../../src/lib/lineReminderTemplate.js';
import {
  pushLineMessage, getCustomerLineUserIdAtBranch, computeBackoffMs,
  getReminderLogKey, getMergedReminderSettings, isQuietHour, buildReminderLogDoc,
} from '../../src/lib/lineReminderClient.js';
import { readScheduledTaskConfig, writeScheduledTaskStatus } from '../_lib/scheduledTaskRuntime.js';

const TASK_ID = 'lineReminderFire';
const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

// Defaults — also used by getMergedReminderSettings fallback.
const TEMPLATE_DEFAULTS = {
  dayBeforeHour: 20,
  dayOfHour: 9,
  quietHourStart: 22,
  quietHourEnd: 8,
  templateDayBefore: 'สวัสดีคุณ {{customerName}} ค่ะ พรุ่งนี้ {{date}} เวลา {{time}} คุณมีนัดที่สาขา {{branchName}} กับ {{doctorName}}\nบริการ: {{treatments}}\n\n{{cancellationPolicyText}}',
  templateDayOf: 'สวัสดีคุณ {{customerName}} ค่ะ วันนี้คุณมีนัดเวลา {{time}} ที่สาขา {{branchName}} กับ {{doctorName}}\nบริการ: {{treatments}}',
  cancellationPolicyText: 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง',
};

function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
  const app = initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail,
      privateKey: rawKey.replace(/\\n/g, '\n'),
    }),
  });
  return getFirestore(app);
}

export function bangkokHour(now = new Date()) {
  // Bangkok UTC+7
  const utcMs = now.getTime();
  const bkkMs = utcMs + 7 * 60 * 60 * 1000;
  return new Date(bkkMs).getUTCHours();
}

export function bangkokDateISO(now = new Date()) {
  const utcMs = now.getTime();
  const bkkMs = utcMs + 7 * 60 * 60 * 1000;
  const d = new Date(bkkMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function tomorrowISO(now = new Date()) {
  const utcMs = now.getTime();
  const bkkMs = utcMs + 7 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000;
  const d = new Date(bkkMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Exported for unit tests AND for Task 6 (debug-fire endpoint).
// Injects fake db + pushFn so the function is unit-testable without admin SDK.
//
// LR-1 invariant: push uses branchCfg.channelAccessToken (per-branch, never global).
// LR-3 invariant: customer lookup via getCustomerLineUserIdAtBranch helper.
// LR-5 invariant: every reminder log doc has branchId field populated.
export async function runReminderPipeline(ctx) {
  const {
    db, appt, cust, branch, doctor, treatments, branchCfg, reminderType, currentHour, pushFn,
    // V69.A (2026-05-15) — `force=true` bypasses Step 1 idempotency check.
    // Used by debug-fire endpoint when admin opts in via UI checkbox to
    // re-test an already-sent reminder. Cron + retry NEVER pass force=true
    // (production must respect idempotency to avoid customer-spam).
    force = false,
  } = ctx;

  const logKey = getReminderLogKey(appt.id, reminderType);
  const logRef = db.doc(`${BASE_PATH}/be_line_reminder_log/${logKey}`);

  // Step 1: idempotency (skipped when force=true)
  if (!force) {
    const existingLog = await logRef.get();
    if (existingLog.exists && existingLog.data().status === 'sent') {
      return { status: 'already-sent' };
    }
  }

  // Step 0/branch enable: branch must have config + channelAccessToken
  // LR-1: never fall back to global / process.env tokens.
  if (!branchCfg || !branchCfg.channelAccessToken) {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: null, reminderType, status: 'skipped-branch-no-oa',
    }));
    return { status: 'skipped-branch-no-oa' };
  }

  // Step 2: appt cancelled
  if (appt.status === 'cancelled') {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: null, reminderType, status: 'skipped-cancelled',
    }));
    return { status: 'skipped-cancelled' };
  }

  // Step 3: customer opt-out
  if (cust?.notifyOptOut === true) {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: null, reminderType, status: 'skipped-optout',
    }));
    return { status: 'skipped-optout' };
  }

  // Step 4: LINE link check (BRANCH-SCOPED — LR-3)
  const lineUserId = getCustomerLineUserIdAtBranch(cust, appt.branchId);
  if (!lineUserId) {
    // Distinguish stale (exists but blocked) vs no-link
    const branchLink = cust?.lineUserId_byBranch?.[appt.branchId];
    const isStale = branchLink?._lineStale === true ||
      (cust?.branchId === appt.branchId && cust?._lineStale === true);
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: null, reminderType,
      status: isStale ? 'skipped-stale' : 'skipped-no-line-this-branch',
    }));
    return { status: isStale ? 'skipped-stale' : 'skipped-no-line-this-branch' };
  }

  // Step 5: quiet hours defensive guard
  const merged = getMergedReminderSettings(branchCfg, TEMPLATE_DEFAULTS);
  if (isQuietHour(currentHour, merged.quietHourStart, merged.quietHourEnd)) {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: lineUserId, reminderType, status: 'skipped-quiet-hours',
    }));
    return { status: 'skipped-quiet-hours' };
  }

  // Step 6: build flex
  const flex = buildReminderFlex({
    cust, appt, branch, doctor, treatments,
    branchSettings: merged,
    reminderType,
  });
  const templateRendered = JSON.stringify(flex);

  // Step 7: push (LR-1 — per-branch channelAccessToken)
  const pushImpl = pushFn || pushLineMessage;
  let lineApiResult;
  try {
    lineApiResult = await pushImpl({
      channelAccessToken: branchCfg.channelAccessToken,
      lineUserId,
      flexJson: flex,
    });
  } catch (e) {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: lineUserId, reminderType,
      status: 'failed', lastError: e.message || 'push-throw',
      retryCount: 0, nextRetryAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      templateRendered,
    }));
    return { status: 'failed', error: e.message };
  }

  // Step 8: response handling
  const sc = lineApiResult.statusCode;
  if (sc === 200) {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: lineUserId, reminderType, status: 'sent', lineApiResult, templateRendered,
    }));
    // Update appointment.notifyMeta (best-effort — appt doc may not exist in fakeDb tests)
    const apptRef = db.doc(`${BASE_PATH}/be_appointments/${appt.id}`);
    const apptSnap = await apptRef.get();
    if (apptSnap.exists) {
      await apptRef.update({
        [`notifyMeta.sent${reminderType[0].toUpperCase() + reminderType.slice(1)}`]: {
          at: new Date().toISOString(),
          lineApiStatusCode: 200,
        },
      });
    }
    return { status: 'sent' };
  }
  if (sc === 410) {
    // User blocked/unfollowed THIS branch's OA
    const custRef = db.doc(`${BASE_PATH}/be_customers/${appt.customerId}`);
    try {
      await custRef.update({
        [`lineUserId_byBranch.${appt.branchId}._lineStale`]: true,
        [`lineUserId_byBranch.${appt.branchId}._lineStaleAt`]: new Date().toISOString(),
      });
    } catch (_) {
      // best-effort; customer doc may not exist in fakeDb tests
    }
    // Admin alert audit doc — surfaces in LineSettingsTab health panel
    try {
      const alertRef = db.doc(
        `${BASE_PATH}/be_admin_audit/line-alert-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      );
      await alertRef.set({
        kind: 'line-410-user-blocked',
        appointmentId: appt.id,
        customerId: appt.customerId,
        branchId: appt.branchId,
        reminderType,
        at: new Date().toISOString(),
      });
    } catch (_) { /* best-effort */ }
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: lineUserId, reminderType,
      status: 'failed', lineApiResult, lastError: 'user-blocked-or-unfollowed',
      templateRendered,
    }));
    return { status: 'failed', error: '410' };
  }
  // 429/5xx → retry queue
  const isRetryable = sc === 429 || (sc >= 500 && sc < 600);
  if (isRetryable) {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: lineUserId, reminderType,
      status: 'failed', lineApiResult,
      retryCount: 0, nextRetryAt: new Date(Date.now() + computeBackoffMs(0)).toISOString(),
      lastError: `status-${sc}`, templateRendered,
    }));
    return { status: 'failed', error: `retryable-${sc}` };
  }
  // 4xx other → no retry
  await logRef.set(buildReminderLogDoc({
    appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
    customerLineUserId: lineUserId, reminderType,
    status: 'failed', lineApiResult, lastError: `status-${sc}`, templateRendered,
  }));
  return { status: 'failed', error: `client-${sc}` };
}

export default async function handler(req, res) {
  // Auth
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const db = getAdmin();
  const now = new Date();
  const currentHour = bangkokHour(now);
  const tomorrow = tomorrowISO(now);
  const today = bangkokDateISO(now);

  const forced = req.query?.force === '1' || req.body?.force === true;
  const cfg = await readScheduledTaskConfig(db, TASK_ID);
  if (!cfg.enabled && !forced) {
    await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: true, summary: 'disabled-by-config' });
    return res.status(200).json({ ok: true, skipped: 'disabled-by-config' });
  }

  const configsSnap = await db.collection(`${BASE_PATH}/be_line_configs`).get();
  const summary = { branchesProcessed: 0, totalAppts: 0, sent: 0, failed: 0, skipped: 0 };

  for (const cfgDoc of configsSnap.docs) {
    const branchCfg = { branchId: cfgDoc.id, ...cfgDoc.data() };
    if (!branchCfg.enabled || !branchCfg.channelAccessToken) continue;
    const merged = getMergedReminderSettings(branchCfg, TEMPLATE_DEFAULTS);
    if (!merged.enabled) continue;

    const isDayBeforeWindow = currentHour === merged.dayBeforeHour;
    const isDayOfWindow = merged.dayOfHour !== null && currentHour === merged.dayOfHour;
    if (!isDayBeforeWindow && !isDayOfWindow) continue;

    summary.branchesProcessed++;
    const reminderType = isDayBeforeWindow ? 'dayBefore' : 'dayOf';
    const targetDate = isDayBeforeWindow ? tomorrow : today;

    // Get branch info
    const branchSnap = await db.doc(`${BASE_PATH}/be_branches/${branchCfg.branchId}`).get();
    const branch = branchSnap.exists
      ? { branchId: branchSnap.id, ...branchSnap.data() }
      : { branchId: branchCfg.branchId };

    // Get appointments for this branch + target date
    // V67 (2026-05-15): canonical Firestore field is `date` (NOT `appointmentDate`).
    // Wave 1 implementer used invented `appointmentDate` per spec; real backendClient.js
    // writers (lines 2077, 2107) write `date: targetDate`. Returns 0 results otherwise.
    const apptsSnap = await db.collection(`${BASE_PATH}/be_appointments`)
      .where('branchId', '==', branchCfg.branchId)
      .where('date', '==', targetDate)
      .get();

    for (const apptDoc of apptsSnap.docs) {
      const appt = { id: apptDoc.id, ...apptDoc.data() };
      summary.totalAppts++;

      // Skip if notifyChannel doesn't include 'line'
      if (!Array.isArray(appt.notifyChannel) || !appt.notifyChannel.includes('line')) continue;

      const custSnap = await db.doc(`${BASE_PATH}/be_customers/${appt.customerId}`).get();
      if (!custSnap.exists) continue;
      const cust = { id: custSnap.id, ...custSnap.data() };

      // Doctor + treatments (best-effort; nulls OK)
      const doctor = appt.doctorId
        ? await db.doc(`${BASE_PATH}/be_doctors/${appt.doctorId}`).get()
            .then(s => s.exists ? { id: s.id, ...s.data() } : null)
            .catch(() => null)
        : null;
      const treatments = Array.isArray(appt.treatments) ? appt.treatments : [];

      const result = await runReminderPipeline({
        db, appt, cust, branch, doctor, treatments, branchCfg, reminderType, currentHour,
      });
      if (result.status === 'sent') summary.sent++;
      else if (result.status && result.status.startsWith('skipped')) summary.skipped++;
      else summary.failed++;
    }
  }

  // Daily aggregate audit (writes a daily-rollup doc on every tick — idempotent merge)
  const aggregateRef = db.doc(`${BASE_PATH}/be_admin_audit/line-reminder-daily-${today}`);
  await aggregateRef.set({
    date: today,
    lastUpdated: new Date().toISOString(),
    [`hourly.${currentHour}`]: summary,
  }, { merge: true });

  await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: false, summary: `ส่ง ${summary.sent} / ข้าม ${summary.skipped}` });
  return res.status(200).json({ ok: true, currentHour, tomorrow, today, summary });
}
