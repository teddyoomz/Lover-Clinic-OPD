// api/admin/customer-only-backup-export.js
// V81-fix6 (2026-05-17 EOD+2 LATE+1) — Customer-only single-file backup trigger.
// Per user directive "ปุ่ม Backup ลูกค้าที่กดทีเดียว Backup ทุกคน แล้ว restore กลับได้".
// Reuses V81 infrastructure with scope='customer-only' → writes to backups/customer-only/.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { runWholeSystemBackup } from './_lib/wholeSystemBackupExecutor.js';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  initAdmin();
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  try {
    const result = await runWholeSystemBackup({
      db: getFirestore(),
      storage: getStorage().bucket(),
      auth: getAuth(),
      type: 'manual',
      createdBy: `customer-only-backup:${caller.uid}`,
      runCleanup: false,
      scope: 'customer-only',
    });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: 'BACKUP_FAILED', message: e.message });
  }
}
