// ─── /api/admin/line-reminder-debug-fire — admin-gated debug push ───────────
// Spec §9 + §5 C.2. 3 modes: dry-run / single / all-with-branch-name-confirm.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { getLineConfigForBranch } from './_lib/lineConfigAdmin.js';
import { buildReminderFlex } from '../../src/lib/lineReminderTemplate.js';
import {
  getCustomerLineUserIdAtBranch,
  getMergedReminderSettings,
} from '../../src/lib/lineReminderClient.js';
import { runReminderPipeline } from '../cron/line-reminder-fire.js';

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

export function validateDebugFireRequest(body, branch) {
  if (!body) return { valid: false, error: 'MISSING_BODY' };
  if (!body.branchId) return { valid: false, error: 'MISSING_BRANCH_ID' };
  if (!['dayBefore', 'dayOf'].includes(body.reminderType)) {
    return { valid: false, error: 'INVALID_REMINDER_TYPE' };
  }
  if (!['dry-run', 'single', 'all'].includes(body.mode)) {
    return { valid: false, error: 'INVALID_MODE' };
  }
  if (body.mode === 'single' && !body.customerId) {
    return { valid: false, error: 'SINGLE_MODE_REQUIRES_CUSTOMER_ID' };
  }
  if (body.mode === 'all') {
    // V67 (2026-05-15): canonical be_branches field is `name` (NOT `branchName`).
    // Mock-only `branchName` was the V66 mock-shadow drift that caused
    // BRANCH_NOT_FOUND on every all-mode test against real prod.
    const branchName = (branch && (branch.name || branch.branchName)) || '';
    if (!branch || !branchName) {
      return { valid: false, error: 'BRANCH_NOT_FOUND' };
    }
    if (String(body.confirmBranchName || '').trim() !== String(branchName).trim()) {
      return { valid: false, error: 'BRANCH_NAME_CONFIRM_MISMATCH' };
    }
  }
  return { valid: true };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const db = getAdmin();
  const { branchId, reminderType, mode, customerId, confirmBranchName } = req.body || {};

  const branchSnap = branchId
    ? await db.doc(`${BASE_PATH}/be_branches/${branchId}`).get()
    : null;
  const branch = branchSnap && branchSnap.exists
    ? { branchId: branchSnap.id, ...branchSnap.data() }
    : null;

  const validation = validateDebugFireRequest(
    { branchId, reminderType, mode, customerId, confirmBranchName },
    branch
  );
  if (!validation.valid) {
    return res.status(400).json({ ok: false, error: validation.error });
  }

  const cfg = await getLineConfigForBranch(db, branchId);
  if (!cfg || !cfg.enabled || !cfg.channelAccessToken) {
    return res.status(400).json({ ok: false, error: 'BRANCH_NO_OA_CONFIGURED' });
  }

  const merged = getMergedReminderSettings(cfg, TEMPLATE_DEFAULTS);

  // Compute target date — dayBefore = tomorrow, dayOf = today (Bangkok TZ)
  const now = new Date();
  const bkkMs = now.getTime() + 7 * 60 * 60 * 1000;
  const offset = reminderType === 'dayBefore' ? 24 * 60 * 60 * 1000 : 0;
  const d = new Date(bkkMs + offset);
  const targetDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  // Pick candidates
  // V67 (2026-05-15) Bug A: canonical Firestore field is `date` (NOT `appointmentDate`).
  // V67 (2026-05-15) Bug B: single-mode picker accepts customerId OR customerHN
  // (real customer doc.id may differ from displayed HN — e.g. doc.id=2853 with
  // customerHN=000004; user typing HN should still resolve). 2-query OR-merge.
  let candidates = [];
  if (mode === 'single') {
    const [byIdSnap, byHnSnap] = await Promise.all([
      db.collection(`${BASE_PATH}/be_appointments`)
        .where('branchId', '==', branchId)
        .where('date', '==', targetDate)
        .where('customerId', '==', customerId)
        .get(),
      db.collection(`${BASE_PATH}/be_appointments`)
        .where('branchId', '==', branchId)
        .where('date', '==', targetDate)
        .where('customerHN', '==', customerId)
        .get(),
    ]);
    const seen = new Set();
    for (const snap of [byIdSnap, byHnSnap]) {
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        candidates.push({ id: d.id, ...d.data() });
      }
    }
  } else {
    const apptsSnap = await db.collection(`${BASE_PATH}/be_appointments`)
      .where('branchId', '==', branchId)
      .where('date', '==', targetDate)
      .get();
    candidates = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(a => Array.isArray(a.notifyChannel) && a.notifyChannel.includes('line'));
  }

  if (mode === 'dry-run') {
    const previews = [];
    for (const appt of candidates.slice(0, 3)) {
      const cs = await db.doc(`${BASE_PATH}/be_customers/${appt.customerId}`).get();
      if (!cs.exists) continue;
      const cust = { id: cs.id, ...cs.data() };
      const lineUid = getCustomerLineUserIdAtBranch(cust, branchId);
      if (!lineUid) continue;
      const flex = buildReminderFlex({
        cust, appt, branch, doctor: null,
        treatments: appt.treatments || [],
        branchSettings: merged, reminderType,
      });
      previews.push({ apptId: appt.id, customerId: appt.customerId, lineUserId: lineUid, flex });
    }
    return res.status(200).json({ ok: true, mode: 'dry-run', totalEligible: candidates.length, previews });
  }

  // mode = single | all → real push
  const results = { sent: 0, failed: 0, skipped: 0, details: [] };
  const currentHour = new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCHours();
  for (const appt of candidates) {
    const cs = await db.doc(`${BASE_PATH}/be_customers/${appt.customerId}`).get();
    if (!cs.exists) { results.skipped++; continue; }
    const cust = { id: cs.id, ...cs.data() };
    const doctor = appt.doctorId
      ? await db.doc(`${BASE_PATH}/be_doctors/${appt.doctorId}`).get()
          .then(s => s.exists ? { id: s.id, ...s.data() } : null)
          .catch(() => null)
      : null;
    const out = await runReminderPipeline({
      db, appt, cust, branch, doctor,
      treatments: appt.treatments || [],
      branchCfg: cfg, reminderType, currentHour,
    });
    results.details.push({ apptId: appt.id, status: out.status });
    if (out.status === 'sent') results.sent++;
    else if (out.status && out.status.startsWith('skipped')) results.skipped++;
    else results.failed++;
  }

  return res.status(200).json({ ok: true, mode, totalAttempted: candidates.length, results });
}
