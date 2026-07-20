// api/cron/chart-edit-session-sweep.js
// Tablet Chart Editor (2026-05-20) — orphan-session sweep. Fires every 15 min.
// Backstop for crashed clients: cancels stale non-terminal sessions (frees the
// tablet + cleans Storage), GCs old terminal sessions. The client-side 30s
// watchdog handles the live UX; this cron just garbage-collects orphans.
// Cron-only · CRON_SECRET-gated · idempotent. Mirrors stock-movement-retention.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { shouldReap, isTerminal } from '../../src/lib/chartEditSessionCore.js';
import { readScheduledTaskConfig, writeScheduledTaskStatus } from '../_lib/scheduledTaskRuntime.js';

const TASK_ID = 'chartEditSessionSweep';
const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const SESSIONS_COL = `${PREFIX}/be_chart_edit_sessions`;
const PRESENCE_COL = `${PREFIX}/be_chart_tablet_presence`;
const AUDIT_COL = `${PREFIX}/be_admin_audit`;
const SWEEP_LIMIT = 500;

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

async function cleanupStorage(storage, sessionId) {
  try {
    const [files] = await storage.getFiles({ prefix: `uploads/chart-edit-sessions/${sessionId}/` });
    await Promise.all(files.map(f => f.delete().catch(() => {})));
  } catch { /* nothing to clean */ }
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
  const storage = getStorage().bucket();
  const now = Date.now();

  const forced = req.query?.force === '1' || req.body?.force === true;
  const cfg = await readScheduledTaskConfig(db, TASK_ID);
  if (!cfg.enabled && !forced) {
    await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: true, summary: 'disabled-by-config' });
    return res.status(200).json({ ok: true, skipped: 'disabled-by-config' });
  }

  try {
    const snap = await db.collection(SESSIONS_COL).limit(SWEEP_LIMIT).get();
    const scanned = snap.size;
    let cancelled = 0, deleted = 0, freed = 0;

    for (const doc of snap.docs) {
      const data = { ...doc.data(), sessionId: doc.id };
      if (!shouldReap(data, now)) continue;
      if (isTerminal(data.status)) {
        // GC old terminal doc + its Storage folder.
        await cleanupStorage(storage, doc.id);
        await doc.ref.delete();
        deleted++;
      } else {
        // Live orphan: cancel (any surviving listener reacts) + free the tablet + clean Storage.
        await doc.ref.update({ status: 'cancelled', cancelledBy: 'timeout', updatedAt: new Date().toISOString() });
        cancelled++;
        if (data.tabletDeviceId) {
          await db.collection(PRESENCE_COL).doc(data.tabletDeviceId)
            .set({ status: 'idle', updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
          freed++;
        }
        await cleanupStorage(storage, doc.id);
      }
    }

    // 2026-07-21 — deterministic per-day heartbeat doc (mirrors recon-daily /
    // infra-health). Pre-fix: a random-ID doc per */15 run = 96 docs/day of
    // pure cron noise with NO retention → ~35k docs/year, each re-read by the
    // nightly whole-system backup (V122 headroom-erosion class). One doc/day,
    // counters accumulate via increment — zero information loss.
    const dayKey = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    await db.collection(AUDIT_COL).doc(`chart-edit-session-sweep-${dayKey}`).set({
      op: 'chart-edit-session-sweep',
      dateKey: dayKey,
      runsToday: FieldValue.increment(1),
      scanned: FieldValue.increment(scanned),
      cancelled: FieldValue.increment(cancelled),
      deleted: FieldValue.increment(deleted),
      freed: FieldValue.increment(freed),
      lastRanAt: new Date().toISOString(),
    }, { merge: true });

    await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: false, summary: `คืน ${freed} / ลบ ${deleted}` });
    return res.status(200).json({ scanned, cancelled, deleted, freed });
  } catch (e) {
    await writeScheduledTaskStatus(db, TASK_ID, { ok: false, error: e.message });
    return res.status(500).json({ error: 'SWEEP_FAILED', message: e.message });
  }
}
