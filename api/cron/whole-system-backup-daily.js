// api/cron/whole-system-backup-daily.js
// V81 — Daily whole-system backup cron. Fires at 03:00 BKK (= 20:00 UTC).
// Per spec §5.1 + AV63 (CRON_SECRET gate + concurrency lock) + AV64 (cleanup retention).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { runWholeSystemBackup } from '../admin/_lib/wholeSystemBackupExecutor.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const LOCK_DOC_PATH = `${PREFIX}/be_admin_audit/whole-system-backup-running`;
const LOCK_TTL_MS = 60 * 60 * 1000; // 60min — stale lock allowed if older than this

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
  // AV63: CRON_SECRET gate. Accept either Authorization: Bearer ... or x-cron-secret header.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const provided = authHeader.replace(/^Bearer\s+/i, '') || req.headers['x-cron-secret'];
  if (!cronSecret || provided !== cronSecret) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'CRON_SECRET mismatch' });
  }

  initAdmin();
  const db = getFirestore();
  const storage = getStorage().bucket();
  const auth = getAuth();

  // AV63: concurrency lock via Firestore transaction (atomic check-and-set).
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
        // Stale lock — overwrite
      }
      tx.set(lockRef, {
        startedAt: FieldValue.serverTimestamp(),
        source: 'cron',
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
    const result = await runWholeSystemBackup({
      db, storage, auth,
      type: 'auto',
      createdBy: 'cron',
      runCleanup: true, // cron does cleanup (manual does not — per spec §5.1)
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
