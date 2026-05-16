// api/admin/whole-system-backups-list.js
// V81 — List all whole-system backups + their integrity status.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdminToken } from './_lib/adminAuth.js';
import {
  parseBackupName,
  validateWholeSystemManifest,
} from '../../src/lib/wholeSystemBackupCore.js';

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
    // List ALL files under backups/whole-system/ (manifests AND payload files).
    // We need to (a) find each backup folder via manifest.json AND
    // (b) sum total folder size for display per V81-fix4 Bug A2.
    const [files] = await storage.getFiles({ prefix: 'backups/whole-system/' });

    // Group files by backup folder name
    const folderFiles = new Map(); // folder → { manifest: File|null, totalBytes: number, fileCount: number }
    for (const f of files) {
      const m = f.name.match(/^backups\/whole-system\/([^/]+)\/(.+)$/);
      if (!m) continue;
      const folder = m[1];
      const rest = m[2];
      const sizeBytes = parseInt(f.metadata?.size || '0', 10);
      if (!folderFiles.has(folder)) {
        folderFiles.set(folder, { manifest: null, totalBytes: 0, fileCount: 0 });
      }
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
        // Backup folder exists but no manifest.json yet → in-progress or corrupt
        backups.push({
          name: folder,
          type: parsed.type,
          totalBytes: entry.totalBytes,
          fileCount: entry.fileCount,
          error: 'NO_MANIFEST',
        });
        continue;
      }

      try {
        const [buf] = await entry.manifest.download();
        const manifest = JSON.parse(buf.toString('utf8'));
        const v = validateWholeSystemManifest(manifest);
        backups.push({
          name: folder,
          type: parsed.type,
          createdAt: manifest.createdAt,
          createdBy: manifest.createdBy,
          manifestHash: manifest.manifestHash,
          hashOk: v.valid,
          // V81-fix4 Bug A2: totalBytes = actual on-disk size of entire backup folder
          // (collections JSON + storage payloads + auth/users.json + manifest.json itself).
          // Replaces buggy display of `stats.totalStorageBytes` which was 0 when clinic
          // had no patient photos but the backup was actually MB of Firestore JSON.
          totalBytes: entry.totalBytes,
          fileCount: entry.fileCount,
          stats: manifest.stats || {},
        });
      } catch (e) {
        backups.push({
          name: folder,
          type: parsed.type,
          totalBytes: entry.totalBytes,
          fileCount: entry.fileCount,
          error: e.message,
        });
      }
    }

    // Sort by createdAt desc (newest first); folders without manifest sort last
    backups.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.status(200).json({ backups });
  } catch (e) {
    return res.status(500).json({ error: 'LIST_FAILED', message: e.message });
  }
}
