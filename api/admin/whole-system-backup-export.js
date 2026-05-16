// api/admin/whole-system-backup-export.js
// V81 — Admin manual whole-system backup trigger.
// Reuses cron's shared executor (api/admin/_lib/wholeSystemBackupExecutor.js).
// Differs from cron in: type='manual' (or 'pre-restore'), runCleanup=false, admin token auth.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { runWholeSystemBackup } from './_lib/wholeSystemBackupExecutor.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const LOCK_DOC_PATH = `${PREFIX}/be_admin_audit/whole-system-backup-running`;
const LOCK_TTL_MS = 60 * 60 * 1000;

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
  if (!caller) return; // verifyAdminToken writes 401/403 itself

  const db = getFirestore();
  const storage = getStorage().bucket();
  const auth = getAuth();

  // Shared concurrency lock with cron — AV63
  const lockRef = db.doc(LOCK_DOC_PATH);
  let lockAcquired = false;
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      if (snap.exists) {
        const startedAt = snap.data()?.startedAt?.toMillis?.() || 0;
        if (Date.now() - startedAt < LOCK_TTL_MS) {
          throw new Error('LOCK_BUSY');
        }
      }
      tx.set(lockRef, {
        startedAt: FieldValue.serverTimestamp(),
        source: `manual-admin-${caller.uid}`,
      });
    });
    lockAcquired = true;
  } catch (e) {
    if (e.message === 'LOCK_BUSY') {
      return res.status(409).json({
        error: 'LOCK_BUSY',
        message: 'Whole-system backup already in progress',
      });
    }
    throw e;
  }

  try {
    // Default type=manual; admin can pass type='pre-restore' for restore-flow pre-backup
    const requestedType = req.body?.type;
    const type = requestedType === 'pre-restore' ? 'pre-restore' : 'manual';

    const result = await runWholeSystemBackup({
      db, storage, auth,
      type,
      createdBy: `manual-admin-${caller.uid}`,
      runCleanup: false, // manual does NOT cleanup (cron-only per spec §5.1)
    });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: 'BACKUP_FAILED', message: e.message });
  } finally {
    if (lockAcquired) {
      await lockRef.delete().catch(() => {});
    }
  }
}
