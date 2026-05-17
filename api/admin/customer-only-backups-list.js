// api/admin/customer-only-backups-list.js
// V81-fix6 — Mirror of whole-system-backups-list.js but for backups/customer-only/.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { parseBackupName, validateWholeSystemManifest } from '../../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';

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

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  initAdmin();
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const storage = getStorage().bucket();
  try {
    const [files] = await storage.getFiles({ prefix: 'backups/customer-only/' });
    const folderFiles = new Map();
    for (const f of files) {
      const m = f.name.match(/^backups\/customer-only\/([^/]+)\/(.+)$/);
      if (!m) continue;
      const folder = m[1];
      const rest = m[2];
      const sizeBytes = parseInt(f.metadata?.size || '0', 10);
      if (!folderFiles.has(folder)) folderFiles.set(folder, { manifest: null, totalBytes: 0, fileCount: 0 });
      const entry = folderFiles.get(folder);
      entry.totalBytes += sizeBytes;
      entry.fileCount += 1;
      if (rest === 'manifest.json') entry.manifest = f;
    }

    const backups = [];
    for (const [folder, entry] of folderFiles.entries()) {
      const parsed = parseBackupName(folder);
      if (!parsed.valid) continue;
      if (!entry.manifest) {
        backups.push({ name: folder, type: parsed.type, totalBytes: entry.totalBytes, fileCount: entry.fileCount, error: 'NO_MANIFEST' });
        continue;
      }
      try {
        const [buf] = await entry.manifest.download();
        const manifest = JSON.parse(buf.toString('utf8'));
        const v = validateWholeSystemManifest(manifest);
        backups.push({
          name: folder,
          type: parsed.type,
          scope: manifest.scope || 'customer-only',
          createdAt: manifest.createdAt,
          createdBy: manifest.createdBy,
          manifestHash: manifest.manifestHash,
          hashOk: v.valid,
          totalBytes: entry.totalBytes,
          fileCount: entry.fileCount,
          stats: manifest.stats || {},
        });
      } catch (e) {
        backups.push({ name: folder, type: parsed.type, totalBytes: entry.totalBytes, fileCount: entry.fileCount, error: e.message });
      }
    }

    backups.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.status(200).json({ backups });
  } catch (e) {
    return res.status(500).json({ error: 'LIST_FAILED', message: e.message });
  }
}
