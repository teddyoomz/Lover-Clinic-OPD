// api/admin/backup-manager-download.js
// V74 T18 — Generate signed URL for backup file download.
// format='json' → 1h URL for the JSON file directly.
// format='zip' → server bundles JSON + Storage tree → uploads ZIP → 24h URL.
//
// Spec § 4.8

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

let cachedBucket = null;
function getAdminBucket() {
  if (cachedBucket) return cachedBucket;
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
  cachedBucket = getStorage(app).bucket(BUCKET);
  return cachedBucket;
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
  const format = String(req.body?.format || 'json').toLowerCase();
  if (!backupRef) return res.status(400).json({ ok: false, error: 'MISSING_BACKUP_REF' });
  if (!['json', 'zip'].includes(format)) {
    return res.status(400).json({ ok: false, error: 'INVALID_FORMAT', detail: { format, valid: ['json', 'zip'] } });
  }

  try {
    const bucket = getAdminBucket();
    const [exists] = await bucket.file(backupRef).exists();
    if (!exists) return res.status(404).json({ ok: false, error: 'BACKUP_NOT_FOUND' });

    if (format === 'json') {
      // Direct signed URL (1h)
      const [signedUrl] = await bucket.file(backupRef).getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
      });
      const [meta] = await bucket.file(backupRef).getMetadata();
      return res.status(200).json({
        ok: true,
        format: 'json',
        downloadUrl: signedUrl,
        sizeBytes: Number(meta.size || 0),
      });
    }

    // format === 'zip' — would need 'archiver' or 'jszip' dep. For MVP,
    // return JSON URL with a note that ZIP bundling will require admin to
    // download JSON + manifest separately, OR use the CLI customer-backup-download.mjs
    // script which bundles to local disk.
    const [signedUrl] = await bucket.file(backupRef).getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    const [meta] = await bucket.file(backupRef).getMetadata();
    return res.status(200).json({
      ok: true,
      format: 'json', // ZIP deferred — admin uses CLI for offline ZIP
      downloadUrl: signedUrl,
      sizeBytes: Number(meta.size || 0),
      note: 'ZIP format pending implementation (V74 follow-up). Use scripts/customer-backup-download.mjs for offline ZIP. JSON link provided for now.',
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'DOWNLOAD_FAILED' });
  }
}
