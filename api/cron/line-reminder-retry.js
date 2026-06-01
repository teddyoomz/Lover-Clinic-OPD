// ─── /api/cron/line-reminder-retry — Vercel Cron every 5 min ────────────────
// Spec §8. Re-runs pipeline Step 6+ for failed logs with retryCount<3.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getLineConfigForBranch } from '../admin/_lib/lineConfigAdmin.js';
import { buildReminderFlex } from '../../src/lib/lineReminderTemplate.js';
import {
  pushLineMessage, getCustomerLineUserIdAtBranch, computeBackoffMs,
  getMergedReminderSettings,
} from '../../src/lib/lineReminderClient.js';
import { readScheduledTaskConfig, writeScheduledTaskStatus } from '../_lib/scheduledTaskRuntime.js';

const TASK_ID = 'lineReminderRetry';
const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

const TEMPLATE_DEFAULTS = {
  templateDayBefore: 'สวัสดี {{customerName}} พรุ่งนี้ {{date}} {{time}} ที่ {{branchName}}',
  templateDayOf: 'สวัสดี {{customerName}} วันนี้ {{time}} ที่ {{branchName}}',
  cancellationPolicyText: 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง',
};

function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const app = initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
  return getFirestore(app);
}

export function computeNextRetryAt(retryCount) {
  const ms = computeBackoffMs(retryCount);
  if (ms === null) return null;
  return new Date(Date.now() + ms).toISOString();
}

export function isRetryEligible(log, nowDate = new Date()) {
  if (!log || typeof log.retryCount !== 'number' || log.retryCount >= 3) return false;
  if (!log.nextRetryAt) return false;
  return new Date(log.nextRetryAt) <= nowDate;
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const db = getAdmin();
  const now = new Date();

  const forced = req.query?.force === '1' || req.body?.force === true;
  const cfg = await readScheduledTaskConfig(db, TASK_ID);
  if (!cfg.enabled && !forced) {
    await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: true, summary: 'disabled-by-config' });
    return res.status(200).json({ ok: true, skipped: 'disabled-by-config' });
  }

  // Firestore allows 1 inequality field per query. Filter retryCount<3 in-memory.
  const failedSnap = await db.collection(`${BASE_PATH}/be_line_reminder_log`)
    .where('status', '==', 'failed')
    .where('nextRetryAt', '<=', now.toISOString())
    .limit(50)
    .get();

  const summary = { retried: 0, succeeded: 0, failed: 0, exhausted: 0, skipped: 0 };

  for (const logDoc of failedSnap.docs) {
    const log = logDoc.data();
    if (!isRetryEligible(log, now)) {
      summary.skipped++;
      continue;
    }

    // Re-fetch appointment + customer (fresh state since first attempt)
    const apptSnap = await db.doc(`${BASE_PATH}/be_appointments/${log.appointmentId}`).get();
    if (!apptSnap.exists || apptSnap.data().status === 'cancelled') {
      await logDoc.ref.update({ status: 'skipped-cancelled', retriedAt: now.toISOString() });
      summary.retried++;
      summary.skipped++;
      continue;
    }
    const apptData = apptSnap.data();

    const custSnap = await db.doc(`${BASE_PATH}/be_customers/${log.customerId}`).get();
    if (!custSnap.exists) {
      await logDoc.ref.update({ status: 'skipped-no-line-this-branch', retriedAt: now.toISOString() });
      summary.retried++;
      summary.skipped++;
      continue;
    }
    const cust = custSnap.data();
    if (cust.notifyOptOut === true) {
      await logDoc.ref.update({ status: 'skipped-optout', retriedAt: now.toISOString() });
      summary.retried++;
      summary.skipped++;
      continue;
    }
    const lineUserId = getCustomerLineUserIdAtBranch(cust, log.branchId);
    if (!lineUserId) {
      await logDoc.ref.update({ status: 'skipped-no-line-this-branch', retriedAt: now.toISOString() });
      summary.retried++;
      summary.skipped++;
      continue;
    }

    // Branch cfg (might be disabled or removed since last attempt)
    const branchCfg = await getLineConfigForBranch(db, log.branchId);
    if (!branchCfg || !branchCfg.enabled || !branchCfg.channelAccessToken) {
      await logDoc.ref.update({ status: 'skipped-branch-no-oa', retriedAt: now.toISOString() });
      summary.retried++;
      summary.skipped++;
      continue;
    }

    // Rebuild flex (templateRendered field might be stale if template changed; re-render)
    const merged = getMergedReminderSettings(branchCfg, TEMPLATE_DEFAULTS);
    const branchSnap = await db.doc(`${BASE_PATH}/be_branches/${log.branchId}`).get();
    const branch = branchSnap.exists ? { branchId: branchSnap.id, ...branchSnap.data() } : { branchId: log.branchId };
    const flex = buildReminderFlex({
      cust, appt: { id: log.appointmentId, ...apptData },
      branch, doctor: null, treatments: apptData.treatments || [],
      branchSettings: merged, reminderType: log.reminderType,
    });

    const apiRes = await pushLineMessage({
      channelAccessToken: branchCfg.channelAccessToken,
      lineUserId,
      flexJson: flex,
    });
    summary.retried++;

    if (apiRes.statusCode === 200) {
      await logDoc.ref.update({ status: 'sent', lineApiResult: apiRes, retriedAt: now.toISOString() });
      summary.succeeded++;
    } else if (apiRes.statusCode === 410) {
      await db.doc(`${BASE_PATH}/be_customers/${log.customerId}`).update({
        [`lineUserId_byBranch.${log.branchId}._lineStale`]: true,
        [`lineUserId_byBranch.${log.branchId}._lineStaleAt`]: now.toISOString(),
      });
      await logDoc.ref.update({ status: 'failed', lineApiResult: apiRes, lastError: 'user-blocked-or-unfollowed', retriedAt: now.toISOString() });
      summary.failed++;
    } else {
      const newRetryCount = (log.retryCount || 0) + 1;
      const nextRetryAt = computeNextRetryAt(newRetryCount);
      const update = {
        retryCount: newRetryCount,
        lineApiResult: apiRes,
        lastError: `status-${apiRes.statusCode}`,
        retriedAt: now.toISOString(),
      };
      if (nextRetryAt === null) {
        update.status = 'failed';
        update.deadAt = now.toISOString();
        // Admin alert audit doc
        await db.doc(`${BASE_PATH}/be_admin_audit/line-alert-${Date.now()}-${log.appointmentId.slice(-6)}`).set({
          type: 'reminder-retry-exhausted',
          severity: 'warn',
          appointmentId: log.appointmentId,
          customerId: log.customerId,
          branchId: log.branchId,
          createdAt: now.toISOString(),
        });
        summary.exhausted++;
      } else {
        update.nextRetryAt = nextRetryAt;
        summary.failed++;
      }
      await logDoc.ref.update(update);
    }
  }

  await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: false, summary: `retry ${summary.retried} / สำเร็จ ${summary.succeeded}` });
  return res.status(200).json({ ok: true, summary });
}
