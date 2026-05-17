// api/admin/customer-only-backup-download.js
// V81-fix6b — pure JSON bundle download (mirror of whole-system-backup-download).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdminToken } from './_lib/adminAuth.js';

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  initAdmin();
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const { backupRef } = req.body || {};
  if (!backupRef) return res.status(400).json({ error: 'BACKUP_REF_REQUIRED' });

  const storage = getStorage().bucket();
  const bundlePath = `backups/customer-only/${backupRef}/__bundle.json`;
  const bundleFile = storage.file(bundlePath);

  try {
    const [exists] = await bundleFile.exists();
    if (exists) {
      const [meta] = await bundleFile.getMetadata();
      const ageMs = Date.now() - new Date(meta.timeCreated).getTime();
      if (ageMs < ARCHIVE_TTL_MS) {
        const [url] = await bundleFile.getSignedUrl({ action: 'read', expires: Date.now() + ARCHIVE_TTL_MS });
        return res.status(200).json({
          downloadUrl: url,
          archiveSize: parseInt(meta.size || '0', 10),
          reused: true,
          format: 'json-bundle-v1',
          expiresAt: new Date(Date.now() + ARCHIVE_TTL_MS).toISOString(),
        });
      }
    }
  } catch { /* fall through */ }

  try {
    const [files] = await storage.getFiles({ prefix: `backups/customer-only/${backupRef}/` });
    const bundle = { format: 'json-bundle-v1', backupRef, scope: 'customer-only', files: {} };
    for (const f of files) {
      const relPath = f.name.replace(`backups/customer-only/${backupRef}/`, '');
      if (relPath === '__bundle.json') continue;
      const [buf] = await f.download();
      const isJson = relPath.endsWith('.json');
      if (isJson) {
        try {
          bundle.files[relPath] = { kind: 'json', data: JSON.parse(buf.toString('utf8')) };
        } catch {
          bundle.files[relPath] = { kind: 'text', data: buf.toString('utf8') };
        }
      } else {
        bundle.files[relPath] = { kind: 'base64', data: buf.toString('base64') };
      }
    }

    const bundleJson = JSON.stringify(bundle);
    await bundleFile.save(bundleJson, { contentType: 'application/json' });
    const [meta] = await bundleFile.getMetadata();
    const [url] = await bundleFile.getSignedUrl({ action: 'read', expires: Date.now() + ARCHIVE_TTL_MS });

    return res.status(200).json({
      downloadUrl: url,
      archiveSize: parseInt(meta.size || '0', 10),
      reused: false,
      format: 'json-bundle-v1',
      fileCount: Object.keys(bundle.files).length,
      expiresAt: new Date(Date.now() + ARCHIVE_TTL_MS).toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: 'BUNDLE_FAILED', message: e.message, stack: e.stack?.slice(0, 500) });
  }
}
