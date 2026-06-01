// api/cron/stock-movement-retention.js
// V106 — Daily stock-movement retention. Fires 03:30 BKK (= 20:30 UTC).
// Archive->Storage then hard-delete movements older than RETENTION_DAYS.
// Cron-only · idempotent · incremental (<= RETENTION_BATCH_LIMIT/run drains backlog).
// AV99: archive-before-delete; THIS cron is the ONLY deleter of be_stock_movements.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomBytes } from 'node:crypto';
import {
  RETENTION_DAYS, RETENTION_BATCH_LIMIT, computeCutoffISO, archiveStoragePath,
  groupByBranchMonth, groupKeyForMovement, mergeArchive, buildArchiveFileBody,
  normalizeCreatedAtForCompare,
} from '../../src/lib/stockMovementRetentionCore.js';
import { readScheduledTaskConfig, writeScheduledTaskStatus } from '../_lib/scheduledTaskRuntime.js';

const TASK_ID = 'stockMovementRetention';
const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const MOVEMENTS_COL = `${PREFIX}/be_stock_movements`;
const AUDIT_COL = `${PREFIX}/be_admin_audit`;

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

// Read an existing archive file (returns [] if absent or unreadable).
async function readArchiveMovements(storage, path) {
  const file = storage.file(path);
  const [exists] = await file.exists();
  if (!exists) return [];
  try {
    const [buf] = await file.download();
    const body = JSON.parse(buf.toString('utf8'));
    return Array.isArray(body && body.movements) ? body.movements : [];
  } catch {
    return []; // corrupt file — mergeArchive rebuilds; never block delete-gate on a read error
  }
}

export default async function handler(req, res) {
  // CRON_SECRET gate (mirror whole-system-backup-daily).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const provided = authHeader.replace(/^Bearer\s+/i, '') || req.headers['x-cron-secret'];
  if (!cronSecret || provided !== cronSecret) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'CRON_SECRET mismatch' });
  }

  initAdmin();
  const db = getFirestore();
  const storage = getStorage().bucket();

  const forced = req.query?.force === '1' || req.body?.force === true;
  const cfg = await readScheduledTaskConfig(db, TASK_ID);
  if (!cfg.enabled && !forced) {
    await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: true, summary: 'disabled-by-config' });
    return res.status(200).json({ ok: true, skipped: 'disabled-by-config' });
  }

  try {
    const retentionDays = cfg.params?.retentionDays ?? RETENTION_DAYS;
    const cutoffISO = computeCutoffISO(new Date(), retentionDays);

    // Coarse fetch — single-field range+order on createdAt (no composite index needed).
    const snap = await db.collection(MOVEMENTS_COL)
      .where('createdAt', '<', cutoffISO)
      .orderBy('createdAt', 'asc')
      .limit(RETENTION_BATCH_LIMIT)
      .get();
    const scanned = snap.size;

    // Precise re-gate: normalized ISO age < cutoff (guards mixed Timestamp/ISO type-ordering).
    const eligible = [];
    for (const doc of snap.docs) {
      const data = { ...doc.data(), movementId: doc.id };
      const isoAge = normalizeCreatedAtForCompare(data.createdAt);
      if (isoAge && isoAge < cutoffISO) eligible.push({ ref: doc.ref, data });
    }

    // Group + archive FIRST (capture-before-destroy / AV99).
    const groups = groupByBranchMonth(eligible.map(e => e.data));
    const archivedKeys = new Set();
    const archiveRefs = [];
    for (const [key, movements] of Object.entries(groups)) {
      const [branchId, month] = key.split('|');
      const path = archiveStoragePath(branchId, month);
      const existing = await readArchiveMovements(storage, path);
      const merged = mergeArchive(existing, movements);
      const body = buildArchiveFileBody({ branchId, month, movements: merged });
      await storage.file(path).save(JSON.stringify(body), { contentType: 'application/json' });
      archivedKeys.add(key);
      archiveRefs.push(path);
    }

    // Delete ONLY docs whose group archive write succeeded.
    let deleted = 0, inBatch = 0;
    let batch = db.batch();
    for (const e of eligible) {
      if (!archivedKeys.has(groupKeyForMovement(e.data))) continue;
      batch.delete(e.ref); deleted++; inBatch++;
      if (inBatch >= 450) { await batch.commit(); batch = db.batch(); inBatch = 0; }
    }
    if (inBatch > 0) await batch.commit();

    const auditId = `stock-movement-retention-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const moreRemaining = scanned >= RETENTION_BATCH_LIMIT;
    await db.collection(AUDIT_COL).doc(auditId).set({
      op: 'stock-movement-retention',
      cutoffISO, retentionDays,
      scanned, archived: eligible.length, deleted,
      monthsTouched: Object.keys(groups), archiveRefs, moreRemaining,
      ranAt: new Date().toISOString(),
    });

    await writeScheduledTaskStatus(db, TASK_ID, { ok: true, skipped: false, summary: `archive ${eligible.length} / ลบ ${deleted}` });
    return res.status(200).json({ scanned, archived: eligible.length, deleted, moreRemaining, cutoffISO });
  } catch (e) {
    await writeScheduledTaskStatus(db, TASK_ID, { ok: false, error: e.message });
    return res.status(500).json({ error: 'RETENTION_FAILED', message: e.message });
  }
}
