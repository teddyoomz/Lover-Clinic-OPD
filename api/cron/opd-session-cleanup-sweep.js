// api/cron/opd-session-cleanup-sweep.js
//
// opd_sessions auto-cleanup sweep. Fires every 30 minutes.
//
// Moved 2026-05-24 from inline AdminDashboard.jsx onSnapshot listener
// (line 2256-2287) → cron. Reason: in-listener cleanup wrote to
// opd_sessions on every snapshot fire → cascade (write → snapshot → re-evaluate
// → maybe more writes) + N-tab race + listener pool saturation. Frontend
// page slowed dramatically. Cron = single owner, no race, no cascade.
//
// Decision logic shared via src/lib/opdSessionCleanupCore.js (Rule of 3 —
// also consumed by scripts/opd-session-cleanup-sweep.mjs).
//
// Cron-only · CRON_SECRET-gated · idempotent (re-run skips already-terminal
// docs) · admin SDK.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import {
  SESSION_TIMEOUT_MS,
  decideCleanupAction,
} from '../../src/lib/opdSessionCleanupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const OPD_SESSIONS_COL = `${PREFIX}/opd_sessions`;
const BE_APPOINTMENTS_COL = `${PREFIX}/be_appointments`;
const AUDIT_COL = `${PREFIX}/be_admin_audit`;
const SWEEP_LIMIT = 500;

// ③ (2026-05-26) — Bangkok (UTC+7) 'YYYY-MM-DD' for the given epoch ms.
function bangkokTodayISO(nowMs) {
  const u = new Date(nowMs + 7 * 60 * 60 * 1000);
  return `${u.getUTCFullYear()}-${String(u.getUTCMonth() + 1).padStart(2, '0')}-${String(u.getUTCDate()).padStart(2, '0')}`;
}

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

// Shared sweep — used by cron handler AND scripts/opd-session-cleanup-sweep.mjs.
// `apply=false` = dry-run.
export async function sweepOpdSessionCleanup({ db, now = Date.now(), limit = SWEEP_LIMIT, apply = true }) {
  let scanned = 0, archived = 0, hidden = 0, deleted = 0, skipped = 0;
  const reasonsByAction = { archive: {}, hide: {}, delete: {}, skip: {} };

  // Full scan (NO server filter on isArchived) — Firestore where(==,false)
  // skips docs with MISSING isArchived field. Legacy docs (pre-V116 etc.)
  // may have isArchived unset; the inline listener used a JS falsy-check
  // that matched undefined. Matching that semantic requires client-side
  // filter. opd_sessions is small (~100 docs); full scan once per 30min
  // is cheap. limit(500) caps the page size.
  const snap = await db.collection(OPD_SESSIONS_COL).limit(limit).get();
  scanned = snap.size;

  const todayISO = bangkokTodayISO(now);

  // ③ (2026-05-26) — sessions don't store the appt date (R5). Collect linked
  // appointment ids for sessions lacking data.appointmentDate, batch-join
  // be_appointments, and stamp the date onto an effective-data copy so the pure
  // decideCleanupAction can apply the date-passed branch. AV131.
  const needDateIds = [...new Set(
    snap.docs
      .map((d) => d.data())
      .filter((s) => !s.appointmentDate && s.linkedAppointmentId)
      .map((s) => String(s.linkedAppointmentId)),
  )];
  const apptDateById = new Map();
  if (needDateIds.length > 0) {
    const refs = needDateIds.map((id) => db.collection(BE_APPOINTMENTS_COL).doc(id));
    const snaps = await db.getAll(...refs);
    for (const s of snaps) {
      if (s.exists) {
        const a = s.data() || {};
        if (typeof a.date === 'string') apptDateById.set(s.id, a.date);
      }
    }
  }

  const writes = []; // { ref, op: 'archive'|'hide'|'delete' }
  for (const d of snap.docs) {
    const data = d.data();
    const joinedDate = data.appointmentDate
      || (data.linkedAppointmentId ? apptDateById.get(String(data.linkedAppointmentId)) : '')
      || '';
    const effectiveData = (joinedDate && !data.appointmentDate)
      ? { ...data, appointmentDate: joinedDate }
      : data;
    const action = decideCleanupAction(effectiveData, now, SESSION_TIMEOUT_MS, todayISO);
    reasonsByAction[action.action][action.reason] = (reasonsByAction[action.action][action.reason] || 0) + 1;
    if (action.action === 'skip') { skipped++; continue; }
    writes.push({ ref: d.ref, op: action.action });
  }

  if (apply && writes.length > 0) {
    const CHUNK = 450;
    for (let i = 0; i < writes.length; i += CHUNK) {
      const batch = db.batch();
      for (const { ref, op } of writes.slice(i, i + CHUNK)) {
        if (op === 'delete') {
          batch.delete(ref);
        } else if (op === 'archive') {
          batch.update(ref, { isArchived: true, archivedAt: FieldValue.serverTimestamp() });
        } else if (op === 'hide') {
          batch.update(ref, { isHiddenFromQueue: true, hiddenFromQueueAt: FieldValue.serverTimestamp() });
        }
      }
      await batch.commit();
    }
  }

  for (const { op } of writes) {
    if (op === 'archive') archived++;
    else if (op === 'hide') hidden++;
    else if (op === 'delete') deleted++;
  }

  return {
    scanned, archived, hidden, deleted, skipped,
    reasonsByAction,
    sessionTimeoutMs: SESSION_TIMEOUT_MS,
    apply,
  };
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const provided = authHeader.replace(/^Bearer\s+/i, '') || req.headers['x-cron-secret'];
  if (!cronSecret || provided !== cronSecret) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'CRON_SECRET mismatch' });
  }

  initAdmin();
  const db = getFirestore();

  try {
    const result = await sweepOpdSessionCleanup({ db, now: Date.now() });
    const auditId = `opd-session-cleanup-sweep-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(AUDIT_COL).doc(auditId).set({
      op: 'opd-session-cleanup-sweep',
      ...result,
      ranAt: new Date().toISOString(),
    });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: 'SWEEP_FAILED', message: e.message });
  }
}
