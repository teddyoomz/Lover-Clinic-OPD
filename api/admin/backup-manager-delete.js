// api/admin/backup-manager-delete.js
// V74 T16 — Delete single backup file (JSON + Storage tree) + AV19 72h-grace.
// Admin-only. Refuses if file was the autoBackupRef for a wipe in last 72h.
//
// Spec § 4.6 + AV55 (72h-grace)

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomBytes } from 'node:crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const GRACE_HOURS = 72;

let cachedDb = null, cachedBucket = null;
function getAdmin() {
  if (cachedDb && cachedBucket) return { db: cachedDb, bucket: cachedBucket };
  let app;
  if (getApps().length > 0) app = getApp();
  else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
      storageBucket: BUCKET,
    });
  }
  cachedDb = getFirestore(app);
  cachedBucket = getStorage(app).bucket(BUCKET);
  return { db: cachedDb, bucket: cachedBucket };
}

function dataCol(db, name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}

/**
 * AV19 72h-grace — query be_admin_audit for any doc in last GRACE_HOURS
 * where autoBackupRef === target. Returns the audit doc id if found.
 *
 * AV75 (2026-05-17 post-V81-fix7b) — explicit `.orderBy('performedAt','desc')`
 * matches the deployed composite index `be_admin_audit (type ASC, performedAt
 * DESCENDING)` (firestore.indexes.json). Without the explicit DESC orderBy,
 * Firestore implicitly orders by `performedAt ASC` for the `>=` range filter
 * → composite-index direction mismatch → FAILED_PRECONDITION at runtime.
 */
async function checkGracePeriod(db, backupRef) {
  const since = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000).toISOString();
  // Query 3 audit types that may reference autoBackupRef
  const types = ['customer-delete-cascade', 'branch-make-fresh', 'central-stock-make-fresh'];
  for (const t of types) {
    const snap = await dataCol(db, 'be_admin_audit')
      .where('type', '==', t)
      .where('performedAt', '>=', since)
      .orderBy('performedAt', 'desc')
      .get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data?.autoBackupRef === backupRef || data?.v74BackupRef === backupRef) {
        return { auditDocId: doc.id, type: t, performedAt: data.performedAt };
      }
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const backupRef = String(req.body?.backupRef || '').trim();
  const forceOverrideGrace = !!req.body?.forceOverrideGrace;
  if (!backupRef) return res.status(400).json({ ok: false, error: 'MISSING_BACKUP_REF' });
  if (!backupRef.startsWith('backups/') || !backupRef.endsWith('.json')) {
    return res.status(400).json({ ok: false, error: 'INVALID_BACKUP_REF' });
  }

  try {
    const { db, bucket } = getAdmin();

    // AV19 72h-grace check
    if (!forceOverrideGrace) {
      const recent = await checkGracePeriod(db, backupRef);
      if (recent) {
        const hoursAgo = Math.round((Date.now() - new Date(recent.performedAt).getTime()) / 36e5);
        return res.status(400).json({
          ok: false,
          error: 'AV19_GRACE_PERIOD',
          detail: {
            recentAuditDocRef: recent.auditDocId,
            type: recent.type,
            performedAt: recent.performedAt,
            hoursAgo,
            graceRemaining: GRACE_HOURS - hoursAgo,
            message: `Backup was used as autoBackupRef ${hoursAgo}h ago (within ${GRACE_HOURS}h safety window). Pass forceOverrideGrace=true to skip.`,
          },
        });
      }
    }

    const [exists] = await bucket.file(backupRef).exists();
    if (!exists) return res.status(404).json({ ok: false, error: 'BACKUP_NOT_FOUND' });

    // Recursive delete: backup.json + sibling /storage/ tree (for V74 customer backups)
    const prefix = backupRef.replace(/\/backup\.json$/, '').replace(/\.json$/, '');
    let deletedObjectCount = 0;
    // Delete sibling storage tree if exists (V74 customer pattern: backups/customers/{cid}/{ts-rand}/storage/...)
    const [siblingFiles] = await bucket.getFiles({ prefix: `${prefix}/storage/` });
    await Promise.all(siblingFiles.map(async (f) => {
      try { await f.delete(); deletedObjectCount++; } catch { /* ignore */ }
    }));
    // Delete the JSON file itself
    await bucket.file(backupRef).delete();
    deletedObjectCount++;

    // Audit doc
    const ts = Date.now();
    const rand = randomBytes(4).toString('hex');
    const auditId = `backup-delete-${ts}-${rand}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      type: 'backup-delete',
      backupRef,
      deletedObjectCount,
      forceOverrideGrace,
      performedBy: { uid: caller.uid || '', email: caller.email || '' },
      performedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      ok: true,
      backupRef,
      deletedObjectCount,
      auditDocId: auditId,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'DELETE_FAILED' });
  }
}
