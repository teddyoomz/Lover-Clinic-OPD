// api/admin/whole-system-backup-download.js
// V81 — Server-side stream tar.gz of backup folder; return 24h signed URL.
// Reuses existing __archive.tar.gz if < 24h old (avoids re-zipping).
// Per spec §5.4 + AV64 archive retention.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdminToken } from './_lib/adminAuth.js';
import archiver from 'archiver';

const APP_ID = 'loverclinic-opd-4c39b';
const ARCHIVE_TTL_MS = 24 * 60 * 60 * 1000;

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  initAdmin();
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const { backupRef } = req.body || {};
  if (!backupRef) {
    return res.status(400).json({ error: 'BACKUP_REF_REQUIRED' });
  }

  const storage = getStorage().bucket();
  const archivePath = `backups/whole-system/${backupRef}/__archive.tar.gz`;
  const archiveFile = storage.file(archivePath);

  // 1. Check if existing archive < 24h old → reuse (avoid re-zipping)
  try {
    const [exists] = await archiveFile.exists();
    if (exists) {
      const [meta] = await archiveFile.getMetadata();
      const ageMs = Date.now() - new Date(meta.timeCreated).getTime();
      if (ageMs < ARCHIVE_TTL_MS) {
        const [url] = await archiveFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + ARCHIVE_TTL_MS,
        });
        return res.status(200).json({
          downloadUrl: url,
          archiveSize: parseInt(meta.size || '0', 10),
          reused: true,
          expiresAt: new Date(Date.now() + ARCHIVE_TTL_MS).toISOString(),
        });
      }
    }
  } catch { /* file probe failed; proceed to create new archive */ }

  // 2. Stream tar.gz creation
  try {
    await new Promise((resolve, reject) => {
      const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });
      const writeStream = archiveFile.createWriteStream({ contentType: 'application/gzip' });

      archive.on('error', reject);
      archive.on('warning', (err) => {
        // Non-fatal warnings (e.g. file not found in mid-stream) — log + continue
        if (err.code !== 'ENOENT') reject(err);
      });
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);

      archive.pipe(writeStream);

      // Enumerate folder + stream each file (excluding self)
      storage.getFiles({ prefix: `backups/whole-system/${backupRef}/` })
        .then(([files]) => {
          for (const f of files) {
            if (f.name.endsWith('__archive.tar.gz')) continue; // don't include self
            const relPath = f.name.replace(`backups/whole-system/${backupRef}/`, '');
            archive.append(f.createReadStream(), { name: relPath });
          }
          archive.finalize();
        })
        .catch(reject);
    });

    // 3. Read final meta + sign URL
    const [meta] = await archiveFile.getMetadata();
    const [url] = await archiveFile.getSignedUrl({
      action: 'read',
      expires: Date.now() + ARCHIVE_TTL_MS,
    });

    return res.status(200).json({
      downloadUrl: url,
      archiveSize: parseInt(meta.size || '0', 10),
      reused: false,
      expiresAt: new Date(Date.now() + ARCHIVE_TTL_MS).toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: 'ARCHIVE_FAILED', message: e.message });
  }
}
