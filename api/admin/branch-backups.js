// ─── /api/admin/branch-backups — V40-prod-fix-3 (2026-05-08) ──────────────
// List backup files in Storage at backups/{branchId}/*. Returns one row per
// file with name, size, createdAt, isAutoPreFresh flag, + 1h signed URL for
// Download. Used by BranchBackupTab "Backups ที่มี" section + RestoreSection
// quick-pick.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

let cachedBucket = null;
function getBucket() {
  if (cachedBucket) return cachedBucket;
  let app;
  if (getApps().length > 0) {
    app = getApp();
  } else {
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
  // V40-prod-fix (2026-05-08) — pass BUCKET explicitly. Reused-app via
  // getApps().length > 0 may lack storageBucket → bucket() no-arg throws.
  cachedBucket = getStorage(app).bucket(BUCKET);
  return cachedBucket;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const branchId = req.query?.branchId;
  if (!branchId || typeof branchId !== 'string') {
    return res.status(400).json({ ok: false, error: 'MISSING_BRANCH_ID' });
  }

  try {
    const bucket = getBucket();
    const [files] = await bucket.getFiles({ prefix: `backups/${branchId}/` });

    const backups = await Promise.all(files.map(async (file) => {
      const [metadata] = await file.getMetadata();
      const name = file.name.split('/').pop();
      const isAutoPreFresh = name?.startsWith('auto-pre-fresh-') || false;
      // V40-prod-fix-4 (2026-05-08) — force browser download via responseDisposition.
      // Without this, clicking the URL opens JSON inline (user reported).
      const downloadName = `loverclinic-backup-${branchId}-${name}`;
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1h read access
        responseDisposition: `attachment; filename="${downloadName}"`,
        responseType: 'application/json',
      });
      return {
        storagePath: file.name,
        name,
        size: parseInt(metadata.size, 10) || 0,
        createdAt: metadata.timeCreated || null,
        updatedAt: metadata.updated || null,
        isAutoPreFresh,
        signedUrl,
        // Custom metadata stamped by branch-backup-export
        metaSourceBranchId: metadata.metadata?.sourceBranchId || null,
        metaSchemaVersion: metadata.metadata?.schemaVersion || null,
      };
    }));

    // Newest first
    backups.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return res.status(200).json({ ok: true, backups, count: backups.length });
  } catch (e) {
    console.error('branch-backups error:', e);
    return res.status(500).json({ ok: false, error: 'LIST_FAILED', detail: e.message });
  }
}
