// api/admin/backup-manager-bulk-delete.js
// V74 T17 — Bulk delete (max 50 per call) with per-file AV19 72h-grace check.
// Returns partial-success summary {deletedCount, failedRefs, auditDocIds}.
//
// Spec § 4.7

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomBytes } from 'node:crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const GRACE_HOURS = 72;
const MAX_BULK = 50;

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

async function checkGracePeriod(db, backupRef) {
  const since = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000).toISOString();
  const types = ['customer-delete-cascade', 'branch-make-fresh', 'central-stock-make-fresh'];
  for (const t of types) {
    const snap = await dataCol(db, 'be_admin_audit')
      .where('type', '==', t)
      .where('performedAt', '>=', since)
      .get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data?.autoBackupRef === backupRef || data?.v74BackupRef === backupRef) {
        return { auditDocId: doc.id, type: t };
      }
    }
  }
  return null;
}

async function deleteOne({ db, bucket, backupRef, forceOverrideGrace, caller }) {
  if (!forceOverrideGrace) {
    const recent = await checkGracePeriod(db, backupRef);
    if (recent) {
      return { ok: false, error: 'AV19_GRACE_PERIOD', auditDocId: recent.auditDocId };
    }
  }
  const [exists] = await bucket.file(backupRef).exists();
  if (!exists) return { ok: false, error: 'BACKUP_NOT_FOUND' };
  const prefix = backupRef.replace(/\/backup\.json$/, '').replace(/\.json$/, '');
  let deletedObjectCount = 0;
  const [siblingFiles] = await bucket.getFiles({ prefix: `${prefix}/storage/` });
  await Promise.all(siblingFiles.map(async (f) => {
    try { await f.delete(); deletedObjectCount++; } catch { /* ignore */ }
  }));
  await bucket.file(backupRef).delete();
  deletedObjectCount++;

  const ts = Date.now();
  const rand = randomBytes(4).toString('hex');
  const auditId = `backup-delete-${ts}-${rand}`;
  await dataCol(db, 'be_admin_audit').doc(auditId).set({
    type: 'backup-delete',
    backupRef,
    deletedObjectCount,
    forceOverrideGrace,
    viaBulk: true,
    performedBy: { uid: caller.uid || '', email: caller.email || '' },
    performedAt: new Date().toISOString(),
  });
  return { ok: true, auditDocId: auditId, deletedObjectCount };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const backupRefs = Array.isArray(req.body?.backupRefs) ? req.body.backupRefs : null;
  const forceOverrideGrace = !!req.body?.forceOverrideGrace;
  if (!backupRefs || backupRefs.length === 0) {
    return res.status(400).json({ ok: false, error: 'EMPTY_SET' });
  }
  if (backupRefs.length > MAX_BULK) {
    return res.status(400).json({ ok: false, error: 'BULK_LIMIT_EXCEEDED', detail: { max: MAX_BULK, requested: backupRefs.length } });
  }

  try {
    const { db, bucket } = getAdmin();
    const auditDocIds = [];
    const failedRefs = [];
    let deletedCount = 0;
    let totalObjectCount = 0;
    for (const ref of backupRefs) {
      const result = await deleteOne({ db, bucket, backupRef: ref, forceOverrideGrace, caller });
      if (result.ok) {
        deletedCount++;
        totalObjectCount += result.deletedObjectCount || 0;
        auditDocIds.push(result.auditDocId);
      } else {
        failedRefs.push({ ref, reason: result.error, auditDocId: result.auditDocId || null });
      }
    }
    return res.status(200).json({
      ok: true,
      deletedCount,
      failedRefs,
      auditDocIds,
      totalObjectCount,
      requestedCount: backupRefs.length,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'BULK_DELETE_FAILED' });
  }
}
