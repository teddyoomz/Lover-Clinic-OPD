// api/admin/whole-system-backup-download.js
// V81-fix6b (2026-05-17 EOD+2 LATE+1): switched from `archiver` (broken at Vercel
// runtime; FUNCTION_INVOCATION_FAILED 500 despite lockfile fix — archiver tar-stream
// pipe to @google-cloud/storage createWriteStream fails opaquely on serverless)
// to a PURE JSON bundle approach (zero native deps).
//
// Bundle shape:
//   { manifest, files: { [relativePath]: <content-or-base64> } }
//
// JSON files → embedded as strings; binary Storage payloads → base64 encoded.
// Single file (backup.bundle.json) cached at __bundle.json for 24h.

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
  const bundlePath = `backups/whole-system/${backupRef}/__bundle.json`;
  const bundleFile = storage.file(bundlePath);

  // V81-fix7: force browser download (responseDisposition)
  const filename = `lover-clinic-backup-${backupRef}.json`;
  const responseDisposition = `attachment; filename="${filename}"`;

  // 1. Reuse cached bundle if < 24h old (avoid re-bundling)
  try {
    const [exists] = await bundleFile.exists();
    if (exists) {
      const [meta] = await bundleFile.getMetadata();
      const ageMs = Date.now() - new Date(meta.timeCreated).getTime();
      if (ageMs < ARCHIVE_TTL_MS) {
        const [url] = await bundleFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + ARCHIVE_TTL_MS,
          responseDisposition,
        });
        return res.status(200).json({
          downloadUrl: url,
          archiveSize: parseInt(meta.size || '0', 10),
          reused: true,
          format: 'json-bundle-v1',
          filename,
          expiresAt: new Date(Date.now() + ARCHIVE_TTL_MS).toISOString(),
        });
      }
    }
  } catch { /* fall through to create */ }

  // 2. Build JSON bundle (pure JS, no native deps)
  try {
    const [files] = await storage.getFiles({ prefix: `backups/whole-system/${backupRef}/` });
    const bundle = { format: 'json-bundle-v1', backupRef, files: {} };
    for (const f of files) {
      const relPath = f.name.replace(`backups/whole-system/${backupRef}/`, '');
      if (relPath === '__bundle.json') continue; // skip self
      const [buf] = await f.download();
      const isJson = relPath.endsWith('.json');
      // JSON files → store as parsed JSON for direct re-use; binary → base64
      if (isJson) {
        try {
          bundle.files[relPath] = { kind: 'json', data: JSON.parse(buf.toString('utf8')) };
        } catch {
          // Malformed JSON → keep as string fallback
          bundle.files[relPath] = { kind: 'text', data: buf.toString('utf8') };
        }
      } else {
        bundle.files[relPath] = { kind: 'base64', data: buf.toString('base64') };
      }
    }

    const bundleJson = JSON.stringify(bundle);
    await bundleFile.save(bundleJson, { contentType: 'application/json' });
    const [meta] = await bundleFile.getMetadata();
    const [url] = await bundleFile.getSignedUrl({
      action: 'read',
      expires: Date.now() + ARCHIVE_TTL_MS,
      responseDisposition,
    });

    return res.status(200).json({
      downloadUrl: url,
      archiveSize: parseInt(meta.size || '0', 10),
      reused: false,
      format: 'json-bundle-v1',
      filename,
      fileCount: Object.keys(bundle.files).length,
      expiresAt: new Date(Date.now() + ARCHIVE_TTL_MS).toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: 'BUNDLE_FAILED', message: e.message, stack: e.stack?.slice(0, 500) });
  }
}
