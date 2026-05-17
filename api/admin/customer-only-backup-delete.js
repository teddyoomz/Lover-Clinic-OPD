// api/admin/customer-only-backup-delete.js
// V81-fix6 — Delete customer-only backup folder(s). Mirror of whole-system-backup-delete.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { NAME_PATTERN } from '../../src/lib/wholeSystemBackupCore.js';

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
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  initAdmin();
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const { names = [] } = req.body || {};
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'NAMES_REQUIRED' });
  }
  for (const n of names) {
    if (!NAME_PATTERN.test(n)) return res.status(400).json({ error: 'INVALID_NAME', name: n });
  }

  const storage = getStorage().bucket();
  const deleted = [];
  const failed = [];
  for (const name of names) {
    try {
      await storage.deleteFiles({ prefix: `backups/customer-only/${name}/` });
      deleted.push(name);
    } catch (e) {
      failed.push({ name, error: e.message });
    }
  }
  return res.status(200).json({ deleted, failed });
}
