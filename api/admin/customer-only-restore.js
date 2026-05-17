// api/admin/customer-only-restore.js
// V81-fix6 — Customer-only restore endpoint.
// Auth ALWAYS preserved (no Auth wipe; scope='customer-only' enforced).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { runWholeSystemRestore } from './_lib/wholeSystemRestoreExecutor.js';

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

  const { backupRef, mode = 'replace', confirmName } = req.body || {};
  if (!backupRef) return res.status(400).json({ error: 'BACKUP_REF_REQUIRED' });
  if (!['fresh', 'replace'].includes(mode)) return res.status(400).json({ error: 'INVALID_MODE' });
  if (confirmName !== backupRef) {
    return res.status(400).json({ error: 'CONFIRM_NAME_MISMATCH', message: 'พิมพ์ชื่อ backup ให้ตรงเพื่อยืนยัน' });
  }

  try {
    const result = await runWholeSystemRestore({
      db: getFirestore(),
      storage: getStorage().bucket(),
      auth: getAuth(),
      backupRef,
      mode,
      callerUid: caller.uid,
      sendPasswordResetEmails: false,
      ackPasswordResetRequired: false,
      replaceAuthFromBackup: false, // V81-fix6: customer-only NEVER touches Auth
      scope: 'customer-only',
    });
    return res.status(200).json(result);
  } catch (e) {
    if (e.code === 'WHOLE_SYSTEM_MANIFEST_TAMPERED') {
      return res.status(409).json({ error: e.code, message: 'ไฟล์ backup เสียหายหรือถูกแก้ไข' });
    }
    if (e.code === 'TARGET_NOT_EMPTY') {
      return res.status(409).json({ error: e.code, firstNonEmpty: e.firstNonEmpty });
    }
    if (e.code === 'AUTO_PRE_BACKUP_FAILED') {
      return res.status(500).json({ error: e.code, message: 'Auto-pre-backup ก่อน Replace ล้มเหลว — ยกเลิก' });
    }
    return res.status(500).json({ error: 'RESTORE_FAILED', message: e.message });
  }
}
