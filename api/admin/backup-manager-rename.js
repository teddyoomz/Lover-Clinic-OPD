// api/admin/backup-manager-rename.js
// V74 T15 — Edit backup file's meta.userNote (Q5b=Y label-edit, hash-preserving).
// Admin-only. Updates JSON; bodyHash + storageManifestHash unchanged because
// userNote is excluded from hashing per V74 spec § 3.3.
//
// Spec § 4.5

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomBytes } from 'node:crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const backupRef = String(req.body?.backupRef || '').trim();
  const userNote = String(req.body?.userNote || '').slice(0, 200);
  if (!backupRef) return res.status(400).json({ ok: false, error: 'MISSING_BACKUP_REF' });
  if (!backupRef.startsWith('backups/') || !backupRef.endsWith('.json')) {
    return res.status(400).json({ ok: false, error: 'INVALID_BACKUP_REF' });
  }

  try {
    const { db, bucket } = getAdmin();
    const [exists] = await bucket.file(backupRef).exists();
    if (!exists) return res.status(404).json({ ok: false, error: 'BACKUP_NOT_FOUND' });

    // Download + parse + update meta.userNote + re-upload
    const [buf] = await bucket.file(backupRef).download();
    let file;
    try {
      file = JSON.parse(buf.toString('utf8'));
    } catch (e) {
      return res.status(400).json({ ok: false, error: 'BACKUP_JSON_PARSE_FAILED', detail: e.message });
    }

    const oldUserNote = file?.meta?.userNote || '';
    if (!file.meta) file.meta = {};
    file.meta.userNote = userNote;

    // Re-upload (overwrites existing file). Hash fields UNCHANGED because
    // userNote is excluded from bodyHash + storageManifestHash per spec § 3.3.
    const updatedBytes = Buffer.from(JSON.stringify(file, null, 2), 'utf8');
    await bucket.file(backupRef).save(updatedBytes, {
      metadata: { contentType: 'application/json' },
      resumable: false,
    });

    // Audit doc
    const ts = Date.now();
    const rand = randomBytes(4).toString('hex');
    const auditId = `backup-rename-${ts}-${rand}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      type: 'backup-rename',
      backupRef,
      oldUserNote,
      newUserNote: userNote,
      performedBy: { uid: caller.uid || '', email: caller.email || '' },
      performedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      ok: true,
      backupRef,
      userNote,
      bodyHash: file?.meta?.bodyHash || '',
      storageManifestHash: file?.meta?.storageManifestHash || '',
      auditDocId: auditId,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'RENAME_FAILED' });
  }
}
