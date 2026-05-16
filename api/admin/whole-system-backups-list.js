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
    // List all manifest.json files
    const [files] = await storage.getFiles({ prefix: 'backups/whole-system/' });
    const manifestPaths = files.filter(f => f.name.endsWith('/manifest.json'));

    const backups = [];
    for (const mf of manifestPaths) {
      const m = mf.name.match(/^backups\/whole-system\/([^/]+)\/manifest\.json$/);
      if (!m) continue;
      const name = m[1];
      const parsed = parseBackupName(name);
      if (!parsed.valid) continue;

      try {
        const [buf] = await mf.download();
        const manifest = JSON.parse(buf.toString('utf8'));
        const v = validateWholeSystemManifest(manifest);
        backups.push({
          name,
          type: parsed.type,
          createdAt: manifest.createdAt,
          createdBy: manifest.createdBy,
          manifestHash: manifest.manifestHash,
          hashOk: v.valid,
          stats: manifest.stats || {},
        });
      } catch (e) {
        backups.push({ name, type: parsed.type, error: e.message });
      }
    }

    // Sort by createdAt desc (newest first)
    backups.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.status(200).json({ backups });
  } catch (e) {
    return res.status(500).json({ error: 'LIST_FAILED', message: e.message });
  }
}
