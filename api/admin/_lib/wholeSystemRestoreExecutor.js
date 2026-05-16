// api/admin/_lib/wholeSystemRestoreExecutor.js
// V81 — Shared whole-system restore executor.
// Fresh-only mode in Task 9; Replace mode + AV19 elevation in Task 10.

import { FieldValue, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import {
  validateWholeSystemManifest,
  computeWholeSystemManifestHash,
  UNIVERSAL_COLLECTIONS,
  BRANCH_SCOPED_COLLECTIONS,
  CUSTOMER_SUBCOLLECTIONS,
  decodeFirestoreData, // V81-fix1: re-hydrate Timestamp/GeoPoint/Bytes from markers
} from '../../../src/lib/wholeSystemBackupCore.js';

// V81-fix1: SDK constructors used by decodeFirestoreData
const FB_TYPE_OPTS = { Timestamp, GeoPoint };

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const BATCH_SIZE = 450; // Firestore writeBatch limit is 500; 450 = safe headroom

async function readManifest(storage, backupRef) {
  const [buf] = await storage.file(`backups/whole-system/${backupRef}/manifest.json`).download();
  return JSON.parse(buf.toString('utf8'));
}

async function assertTargetEmpty(db) {
  // Scan ALL non-audit collections; refuse if any has docs.
  // Excludes be_admin_audit (restore writes audit doc; that's expected).
  const scope = [...UNIVERSAL_COLLECTIONS, ...BRANCH_SCOPED_COLLECTIONS];
  for (const col of scope) {
    if (col === 'be_admin_audit') continue;
    const snap = await db.collection(`${PREFIX}/${col}`).limit(1).get();
    if (!snap.empty) {
      const err = new Error('Target not empty');
      err.code = 'TARGET_NOT_EMPTY';
      err.firstNonEmpty = col;
      throw err;
    }
  }
}

async function restoreCollections(db, storage, manifest, backupRef) {
  let restoredDocs = 0;
  const failedDocs = [];
  for (const c of manifest.collections) {
    try {
      const [buf] = await storage.file(`backups/whole-system/${backupRef}/${c.path}`).download();
      const rawDocs = JSON.parse(buf.toString('utf8'));
      // V81-fix1: re-hydrate Firestore-native types (Timestamp/GeoPoint/Bytes) from markers
      // BEFORE batch.set. Without this, Timestamp fields written as plain Maps.
      const docs = rawDocs.map(d => decodeFirestoreData(d, FB_TYPE_OPTS));
      // Subcollections have name like 'be_customers/{cid}/{sub}' OR
      // 'chat_conversations/{convId}/messages' — Firestore handles nested paths.
      const colPath = `${PREFIX}/${c.name}`;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const doc of docs.slice(i, i + BATCH_SIZE)) {
          const { id, ...data } = doc;
          batch.set(db.doc(`${colPath}/${id}`), data);
        }
        await batch.commit();
      }
      restoredDocs += docs.length;
    } catch (e) {
      failedDocs.push({ collection: c.name, error: e.message });
    }
  }
  return { restoredDocs, failedDocs };
}

async function restoreAuthUsers(auth, storage, manifest, backupRef, callerUid) {
  let restoredAuth = 0;
  const failedAuth = [];
  try {
    const [buf] = await storage.file(`backups/whole-system/${backupRef}/${manifest.authUsers.path}`).download();
    const users = JSON.parse(buf.toString('utf8'));
    // V31 self-skip: don't import caller's own uid (avoids "uid already exists" conflict
    // since the caller is currently logged in with that uid)
    const toImport = users.filter(u => u && u.uid && u.uid !== callerUid);
    for (let i = 0; i < toImport.length; i += 1000) {
      const chunk = toImport.slice(i, i + 1000);
      try {
        const importable = chunk.map(u => ({
          uid: u.uid,
          email: u.email,
          emailVerified: !!u.emailVerified,
          displayName: u.displayName,
          photoURL: u.photoURL,
          phoneNumber: u.phoneNumber,
          disabled: !!u.disabled,
          providerData: u.providerData || [],
          customClaims: u.customClaims || {},
        }));
        const res = await auth.importUsers(importable);
        restoredAuth += res.successCount;
        for (const err of (res.errors || [])) {
          failedAuth.push({ uid: chunk[err.index]?.uid, error: err.error?.message });
        }
      } catch (e) {
        failedAuth.push({ chunk_size: chunk.length, error: e.message });
      }
    }
  } catch (e) {
    failedAuth.push({ phase: '__auth_read__', error: e.message });
  }
  return { restoredAuth, failedAuth };
}

async function restoreStorage(storage, manifest, backupRef) {
  let restoredStorage = 0;
  const failedStorage = [];
  for (const s of (manifest.storageObjects || [])) {
    try {
      const srcPath = `backups/whole-system/${backupRef}/${s.path}`;
      await storage.file(srcPath).copy(storage.file(s.originalGsPath));
      restoredStorage += 1;
    } catch (e) {
      failedStorage.push({ path: s.originalGsPath, error: e.message });
    }
  }
  return { restoredStorage, failedStorage };
}

/**
 * wipeFirebase — wipe Firestore + Storage + (optionally) Auth.
 *
 * V81-fix4 (2026-05-17 EOD+2): Auth wipe is now OPT-IN via `wipeAuth` flag
 * (default false = preserve all login credentials + sessions on same-project
 * restore). User directive: "ถ้าเป็น vercel เดิมจะไม่ศุนย์เสีย รหัส หรือ email
 * login ไป แม้แต่อันเดียว ทุกตำแหน่งต้องสามารถใช้รหัสเดิม login เดิม หรือ
 * แม้กระทั่งไม่หลุด login เลย หลังจากเรา restore". Skipping Auth wipe AND
 * Auth restore means: passwords intact, sessions intact, refresh tokens intact.
 *
 * AUTH_WIPE_AND_RESTORE_FROM_BACKUP is the legacy V81 behavior — only used
 * for cross-project clone (advanced; loses passwords because Rule C2 strips
 * passwordHash from backup files anyway).
 */
async function wipeFirebase(db, storage, auth, callerUid, { wipeAuth = false } = {}) {
  // Wipe Firestore collections (V74 cascade pattern)
  const scope = [...UNIVERSAL_COLLECTIONS, ...BRANCH_SCOPED_COLLECTIONS];
  for (const col of scope) {
    if (col === 'be_admin_audit') continue; // audit immutable per Rule D
    let snap;
    do {
      snap = await db.collection(`${PREFIX}/${col}`).limit(BATCH_SIZE).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } while (snap.size === BATCH_SIZE);
  }

  // Wipe customer subcollections (V74 T4 cascade)
  const custSnap = await db.collection(`${PREFIX}/be_customers`).get();
  for (const c of custSnap.docs) {
    for (const sub of CUSTOMER_SUBCOLLECTIONS) {
      const subSnap = await db.collection(`${PREFIX}/be_customers/${c.id}/${sub}`).get();
      if (subSnap.empty) continue;
      const batch = db.batch();
      subSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }

  // Wipe chat_conversations messages subcoll
  const convSnap = await db.collection(`${PREFIX}/chat_conversations`).get();
  for (const c of convSnap.docs) {
    const msgsSnap = await db.collection(`${PREFIX}/chat_conversations/${c.id}/messages`).get();
    if (msgsSnap.empty) continue;
    const batch = db.batch();
    msgsSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // V81-fix4: Auth wipe is OPT-IN. Default = preserve Auth (no login loss).
  if (wipeAuth) {
    // Wipe Auth users (V31 self-skip — caller stays logged in)
    let nextPageToken;
    do {
      const page = await auth.listUsers(1000, nextPageToken);
      for (const u of page.users) {
        if (u.uid === callerUid) continue;
        try {
          await auth.deleteUser(u.uid);
        } catch { /* tolerant */ }
      }
      nextPageToken = page.pageToken;
    } while (nextPageToken);
  }

  // Wipe Storage objects (CRITICAL: skip backups/ prefix to preserve all backups
  // incl. the pre-restore safety net just created)
  const [allFiles] = await storage.getFiles();
  for (const f of allFiles) {
    if (f.name.startsWith('backups/')) continue;
    try {
      await f.delete();
    } catch { /* tolerant */ }
  }
}

/**
 * runWholeSystemRestore — restore a backup into the current Firebase project.
 *
 * Fresh-only mode: refuses if target has any non-audit data (TARGET_NOT_EMPTY 409).
 * Replace mode: triggers auto-pre-backup (AV19 elevation), verifies pre-backup
 *   exists, then wipes + restores.
 *
 * @returns {Promise<{backupRef, mode, autoBackupRef, stats, passwordResetEmailsSent}>}
 */
export async function runWholeSystemRestore({
  db, storage, auth, backupRef, mode, callerUid,
  sendPasswordResetEmails,
  ackPasswordResetRequired, // V81-fix2 (2026-05-17 EOD+1): only required if replaceAuthFromBackup=true
  // V81-fix4 (2026-05-17 EOD+2): Auth preservation by default for same-Vercel restore.
  // false (default) = preserve all Auth users (no login loss, sessions stay alive)
  // true (advanced/cross-project) = wipe Auth + restore from backup file
  //   (Rule C2 strips passwords → all users must reset; AV66/V81-fix2 ack-gate still applies)
  replaceAuthFromBackup = false,
}) {
  const start = Date.now();

  // V81-fix4: ack-gate only applies when caller explicitly opts into Auth wipe+restore.
  // Default Replace mode preserves Auth → no lockout possible → no ack needed.
  if (mode === 'replace' && replaceAuthFromBackup && ackPasswordResetRequired !== true) {
    const err = new Error('Replace + replaceAuthFromBackup=true requires explicit ackPasswordResetRequired: true (passwords will be lost; staff must reset)');
    err.code = 'REPLACE_ACK_REQUIRED';
    throw err;
  }

  // V81-fix4: reset emails only meaningful when Auth was wiped. Skip otherwise.
  const effectiveSendResetEmails = (mode === 'replace' && replaceAuthFromBackup)
    ? true
    : !!sendPasswordResetEmails;

  // 1. AV62: read + validate manifest (tamper detection via recomputed hash)
  const manifest = await readManifest(storage, backupRef);
  const v = validateWholeSystemManifest(manifest);
  if (!v.valid) {
    const err = new Error(`Manifest invalid: ${v.reason}`);
    err.code = 'WHOLE_SYSTEM_MANIFEST_TAMPERED';
    throw err;
  }

  // 2. Mode-specific pre-flight
  let autoBackupRef = null;
  if (mode === 'fresh') {
    await assertTargetEmpty(db);
  } else if (mode === 'replace') {
    // AV19 elevation: auto-pre-backup MANDATORY before wipe.
    const { runWholeSystemBackup } = await import('./wholeSystemBackupExecutor.js');
    const pre = await runWholeSystemBackup({
      db, storage, auth,
      type: 'pre-restore',
      createdBy: `pre-restore-for-${backupRef}`,
      runCleanup: false,
    });
    autoBackupRef = pre.name;
    // Verify pre-backup folder exists BEFORE wipe (defense against silent fail)
    const [exists] = await storage.file(`backups/whole-system/${autoBackupRef}/manifest.json`).exists();
    if (!exists) {
      const err = new Error('Auto-pre-backup not verifiable');
      err.code = 'AUTO_PRE_BACKUP_FAILED';
      throw err;
    }
    // V81-fix4: wipeAuth follows replaceAuthFromBackup flag
    await wipeFirebase(db, storage, auth, callerUid, { wipeAuth: replaceAuthFromBackup });
  } else {
    const err = new Error(`Unknown mode: ${mode}`);
    err.code = 'INVALID_MODE';
    throw err;
  }

  // 3. Restore phases
  const colResult = await restoreCollections(db, storage, manifest, backupRef);
  // V81-fix4: Auth restore only when caller opted into Auth wipe+restore.
  // Default = preserve current Auth state (no import, no overwrite, no churn).
  const authResult = (mode === 'replace' && !replaceAuthFromBackup)
    ? { restoredAuth: 0, failedAuth: [], skipped: true, skippedReason: 'V81-fix4: Auth preserved (replaceAuthFromBackup=false)' }
    : await restoreAuthUsers(auth, storage, manifest, backupRef, callerUid);
  const storResult = await restoreStorage(storage, manifest, backupRef);

  // 4. Send password-reset emails ONLY when Auth was wiped + restored (legacy path)
  let passwordResetEmailsSent = 0;
  if (effectiveSendResetEmails) {
    try {
      const [buf] = await storage.file(`backups/whole-system/${backupRef}/${manifest.authUsers.path}`).download();
      const users = JSON.parse(buf.toString('utf8'));
      for (const u of users) {
        if (!u?.email) continue;
        try {
          await auth.generatePasswordResetLink(u.email);
          passwordResetEmailsSent += 1;
        } catch { /* best-effort */ }
      }
    } catch { /* skip if auth file unreadable */ }
  }

  // 5. Audit doc
  const auditId = `whole-system-restore-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${PREFIX}/be_admin_audit/${auditId}`).set({
    op: 'whole-system-restore',
    backupRef,
    mode,
    autoBackupRef,
    replaceAuthFromBackup,
    authPreserved: mode === 'replace' && !replaceAuthFromBackup,
    stats: {
      ...colResult,
      ...authResult,
      ...storResult,
    },
    passwordResetEmailsSent,
    elapsedSec: Math.round((Date.now() - start) / 1000),
    completedAt: FieldValue.serverTimestamp(),
  });

  return {
    backupRef,
    mode,
    autoBackupRef,
    replaceAuthFromBackup,
    authPreserved: mode === 'replace' && !replaceAuthFromBackup,
    stats: {
      ...colResult,
      ...authResult,
      ...storResult,
    },
    passwordResetEmailsSent,
  };
}
