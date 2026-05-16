// api/admin/whole-system-restore.js
// V81 — Restore endpoint with Fresh-only + Replace modes.
// AV62 manifestHash validation BEFORE any wipe/restore.
// AV19 elevation: Replace mode auto-pre-backup MANDATORY.

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

  const {
    backupRef,
    mode = 'fresh',
    confirmName,
    sendPasswordResetEmails = false,
  } = req.body || {};

  if (!backupRef) {
    return res.status(400).json({ error: 'BACKUP_REF_REQUIRED' });
  }
  if (!['fresh', 'replace'].includes(mode)) {
    return res.status(400).json({
      error: 'INVALID_MODE',
      message: 'mode must be fresh|replace',
    });
  }
  if (confirmName !== backupRef) {
    return res.status(400).json({
      error: 'CONFIRM_NAME_MISMATCH',
      message: 'พิมพ์ชื่อ backup ให้ตรงเพื่อยืนยัน',
    });
  }

  try {
    const result = await runWholeSystemRestore({
      db: getFirestore(),
      storage: getStorage().bucket(),
      auth: getAuth(),
      backupRef,
      mode,
      callerUid: caller.uid,
      sendPasswordResetEmails,
    });
    return res.status(200).json(result);
  } catch (e) {
    if (e.code === 'WHOLE_SYSTEM_MANIFEST_TAMPERED') {
      return res.status(409).json({
        error: e.code,
        message: 'ไฟล์ backup เสียหายหรือถูกแก้ไข — ยกเลิกการ restore',
      });
    }
    if (e.code === 'TARGET_NOT_EMPTY') {
      return res.status(409).json({
        error: e.code,
        message: 'Target Firebase มีข้อมูลอยู่แล้ว — Fresh-only mode ปฏิเสธ',
        firstNonEmpty: e.firstNonEmpty,
      });
    }
    if (e.code === 'AUTO_PRE_BACKUP_FAILED') {
      return res.status(500).json({
        error: e.code,
        message: 'Auto-pre-backup ก่อน Replace ล้มเหลว — ยกเลิก',
      });
    }
    return res.status(500).json({ error: 'RESTORE_FAILED', message: e.message });
  }
}
