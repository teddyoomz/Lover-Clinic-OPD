// api/cron/opd-session-archive-retention.js
//
// Archived opd_sessions retention (2026-07-19 — punchlist #22 residual).
// The 30-min cleanup sweep SKIPS every isArchived doc, so archived intake
// sessions (patient data) accumulated FOREVER. This daily cron safe-deletes
// archived sessions older than 180 days (user-approved policy) with every
// referenced-session guard applied in JS over a FULL scan — NO server-side
// where() (V23-class: where() silently excludes missing-field docs).
//
// Runs 03:20 BKK — AFTER the 03:00 whole-system backup, so every doc deleted
// tonight exists in tonight's backup (recoverable for the retention window).
//
// Decision logic shared via src/lib/opdSessionCleanupCore.js
// (decideArchiveRetention) — also consumed by
// scripts/opd-session-archive-retention.mjs (Rule M CLI dry-run/apply).
//
// Cron-only · CRON_SECRET-gated · idempotent · admin SDK · delete cap 400/run.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import {
  ARCHIVE_RETENTION_DAYS,
  decideArchiveRetention,
} from '../../src/lib/opdSessionCleanupCore.js';
import { readScheduledTaskConfig, writeScheduledTaskStatus } from '../_lib/scheduledTaskRuntime.js';
import { resolveParam } from '../../src/lib/scheduledTasksRegistry.js';

const TASK_ID = 'opdSessionArchiveRetention';
const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const OPD_SESSIONS_COL = `${PREFIX}/opd_sessions`;
const BE_APPOINTMENTS_COL = `${PREFIX}/be_appointments`;
const BE_DEPOSITS_COL = `${PREFIX}/be_deposits`;
const AUDIT_COL = `${PREFIX}/be_admin_audit`;
const SWEEP_LIMIT = 1000;
const DELETE_CAP = 400; // per run — the daily cadence drains any backlog

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

// Collect every opd_session id still referenced by a booking doc. select()
// keeps the read payload to one field per doc.
async function collectReferencedIds(db) {
  const referenced = new Set();
  for (const col of [BE_APPOINTMENTS_COL, BE_DEPOSITS_COL]) {
    const snap = await db.collection(col).select('linkedOpdSessionId').get();
    for (const d of snap.docs) {
      const v = d.data()?.linkedOpdSessionId;
      if (v) referenced.add(String(v));
    }
  }
  return referenced;
}

// Shared sweep — used by the cron handler AND the Rule M CLI.
// `apply=false` = dry-run (no writes at all).
export async function sweepOpdSessionArchiveRetention({
  db, now = Date.now(), limit = SWEEP_LIMIT, apply = true,
  retentionDays = ARCHIVE_RETENTION_DAYS,
}) {
  let scanned = 0, deleted = 0, skipped = 0, capped = 0;
  const reasons = {};
  const deletedIds = [];

  const referencedIds = await collectReferencedIds(db);

  // FULL scan, client-side decision (V23: a server-side isArchived equality
  // filter would skip missing-field docs — and the guards need per-doc JS
  // logic anyway).
  // Hunt R1-#2 fix (2026-07-19): CURSOR pagination — a single limit(N)
  // snapshot only ever saw the lexicographically-first N doc ids; once ≥N
  // keep-docs occupied that window, eligible docs beyond it were NEVER
  // scanned again (silent retention incompleteness). Page via startAfter
  // until exhausted (MAX_PAGES backstop far above any real population).
  const MAX_PAGES = 20;
  const toDelete = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db.collection(OPD_SESSIONS_COL).limit(limit);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    scanned += snap.size;
    for (const d of snap.docs) {
      const decision = decideArchiveRetention(d.id, d.data(), { nowMs: now, retentionDays, referencedIds });
      reasons[decision.reason] = (reasons[decision.reason] || 0) + 1;
      if (decision.action === 'delete') {
        if (toDelete.length < DELETE_CAP) toDelete.push(d.ref);
        else capped++; // no silent caps — reported in the audit doc
      } else {
        skipped++;
      }
    }
    if (snap.size < limit) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  if (apply && toDelete.length > 0) {
    const CHUNK = 400;
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const batch = db.batch();
      for (const ref of toDelete.slice(i, i + CHUNK)) batch.delete(ref);
      await batch.commit();
    }
  }
  deleted = toDelete.length;
  for (const ref of toDelete) deletedIds.push(ref.id);

  return {
    scanned, deleted, skipped, capped,
    reasons, retentionDays, referencedCount: referencedIds.size,
    deletedIds, apply,
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

  const forced = req.query?.force === '1' || req.body?.force === true;
  const cfg = await readScheduledTaskConfig(db, TASK_ID);
  if (!cfg.enabled && !forced) {
    await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: true, summary: 'disabled-by-config' });
    return res.status(200).json({ ok: true, skipped: 'disabled-by-config' });
  }

  try {
    const retentionDays = resolveParam(TASK_ID, 'retentionDays', cfg.params?.retentionDays);
    const result = await sweepOpdSessionArchiveRetention({ db, now: Date.now(), retentionDays });
    const auditId = `opd-session-archive-retention-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(AUDIT_COL).doc(auditId).set({
      op: 'opd-session-archive-retention',
      ...result,
      ranAt: new Date().toISOString(),
    });
    await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: false, summary: `ลบ archive เก่า ${result.deleted}` });
    return res.status(200).json(result);
  } catch (e) {
    await writeScheduledTaskStatus(db, TASK_ID, { ok: false, error: e.message });
    return res.status(500).json({ error: 'SWEEP_FAILED', message: e.message });
  }
}
