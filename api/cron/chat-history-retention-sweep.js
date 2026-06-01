// api/cron/chat-history-retention-sweep.js
//
// chat_history retention sweep — daily delete docs older than RETENTION_HOURS
// (default 24h = 1 day per user directive 2026-05-24).
//
// Why: chat_history accumulated 3,855 docs in ~2 months because the original
// in-listener auto-delete (per comment in AdminDashboard.jsx) was never
// actually wired. Frontend page load slowed (~7.5 MB on wire per ChatPanel
// listener snapshot). One-shot Rule M reduced to 100; this cron keeps it bounded.
//
// Cron-only (CRON_SECRET-gated) · idempotent · admin SDK (client write rule-blocked).
// Mirrors staff-chat-retention-sweep.js + chart-edit-session-sweep.js patterns.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import {
  RETENTION_HOURS,
  resolvedAtMs,
  isExpired,
} from '../../src/lib/chatHistoryRetentionCore.js';
import { readScheduledTaskConfig, writeScheduledTaskStatus } from '../_lib/scheduledTaskRuntime.js';

const TASK_ID = 'chatHistoryRetention';
const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const CHAT_HISTORY_COL = `${PREFIX}/chat_history`;
const AUDIT_COL = `${PREFIX}/be_admin_audit`;
const SWEEP_LIMIT = 500; // per-run cap; cron fires daily, so up to 500/day

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

// Shared sweep — used by the cron handler AND scripts/chat-history-retention-sweep.mjs
// (Rule of 3). `apply=false` = dry-run (count only, no writes).
export async function sweepChatHistoryRetention({ db, now = Date.now(), limit = SWEEP_LIMIT, apply = true, retentionHours = RETENTION_HOURS }) {
  let scanned = 0, deleted = 0, kept = 0, noTimestamp = 0;
  const cutoff = Timestamp.fromMillis(now - retentionHours * 60 * 60 * 1000);

  // Server-side filter for efficiency. Docs with NO resolvedAt won't match
  // this filter (Firestore treats missing field as "not less than X") → those
  // get the noTimestamp branch via a fallback scan if SWEEP_LIMIT not reached.
  const snap = await db.collection(CHAT_HISTORY_COL)
    .where('resolvedAt', '<', cutoff)
    .limit(limit)
    .get();
  scanned = snap.size;

  const toDelete = [];
  for (const d of snap.docs) {
    const data = d.data();
    const ms = resolvedAtMs(data);
    if (ms == null) {
      // Server-side filter MATCHED but client-side can't parse → server says
      // doc is older than cutoff. Safe to delete (otherwise it'd be unknown-age
      // forever). But conservatively, count as noTimestamp + skip.
      noTimestamp++;
    } else if (isExpired(ms, now)) {
      toDelete.push(d.ref);
    } else {
      // Server matched but client says not expired — shouldn't happen unless
      // clock skew. Skip conservatively.
      kept++;
    }
  }

  if (apply && toDelete.length > 0) {
    const CHUNK = 450; // Firestore batch max 500
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const batch = db.batch();
      for (const ref of toDelete.slice(i, i + CHUNK)) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  }
  deleted = toDelete.length;

  return { scanned, deleted, kept, noTimestamp, retentionHours, apply };
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
    const result = await sweepChatHistoryRetention({ db, now: Date.now(), retentionHours: cfg.params?.retentionHours ?? RETENTION_HOURS });
    const auditId = `chat-history-retention-sweep-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(AUDIT_COL).doc(auditId).set({
      op: 'chat-history-retention-sweep',
      ...result,
      ranAt: new Date().toISOString(),
    });
    await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: false, summary: `ลบ ${result.deleted} / สแกน ${result.scanned}` });
    return res.status(200).json(result);
  } catch (e) {
    await writeScheduledTaskStatus(db, TASK_ID, { ok: false, error: e.message });
    return res.status(500).json({ error: 'SWEEP_FAILED', message: e.message });
  }
}
