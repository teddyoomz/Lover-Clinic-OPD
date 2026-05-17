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
  CUSTOMER_ONLY_UNIVERSAL,        // V81-fix6
  CUSTOMER_ONLY_BRANCH_SCOPED,    // V81-fix6
  CUSTOMER_ONLY_STORAGE_INCLUDE_PREFIXES, // V81-fix6
  decodeFirestoreData, // V81-fix1: re-hydrate Timestamp/GeoPoint/Bytes from markers
} from '../../../src/lib/wholeSystemBackupCore.js';

// V81-fix1: SDK constructors used by decodeFirestoreData
const FB_TYPE_OPTS = { Timestamp, GeoPoint };

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const BATCH_SIZE = 450; // Firestore writeBatch limit is 500; 450 = safe headroom

// V81-fix6: scope-aware backup path
function backupPathPrefix(scope) {
  return scope === 'customer-only' ? 'backups/customer-only' : 'backups/whole-system';
}

async function readManifest(storage, backupRef, scope = 'full') {
  const [buf] = await storage.file(`${backupPathPrefix(scope)}/${backupRef}/manifest.json`).download();
  return JSON.parse(buf.toString('utf8'));
}

async function assertTargetEmpty(db, scope = 'full') {
  // Scan scoped non-audit collections; refuse if any has docs.
  // V81-fix6: customer-only restore checks ONLY customer-scoped collections.
  const cols = scope === 'customer-only'
    ? [...CUSTOMER_ONLY_UNIVERSAL, ...CUSTOMER_ONLY_BRANCH_SCOPED]
    : [...UNIVERSAL_COLLECTIONS, ...BRANCH_SCOPED_COLLECTIONS];
  for (const col of cols) {
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

async function restoreCollections(db, storage, manifest, backupRef, scope = 'full') {
  let restoredDocs = 0;
  const failedDocs = [];
  for (const c of manifest.collections) {
    try {
      const [buf] = await storage.file(`${backupPathPrefix(scope)}/${backupRef}/${c.path}`).download();
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

async function restoreAuthUsers(auth, storage, manifest, backupRef, callerUid, scope = 'full') {
  let restoredAuth = 0;
  const failedAuth = [];
  try {
    const [buf] = await storage.file(`${backupPathPrefix(scope)}/${backupRef}/${manifest.authUsers.path}`).download();
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

async function restoreStorage(storage, manifest, backupRef, scope = 'full') {
  let restoredStorage = 0;
  const failedStorage = [];
  for (const s of (manifest.storageObjects || [])) {
    try {
      const srcPath = `${backupPathPrefix(scope)}/${backupRef}/${s.path}`;
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
async function wipeFirebase(db, storage, auth, callerUid, { wipeAuth = false, scope = 'full' } = {}) {
  // V81-fix6: scope-aware wipe. Customer-only restore wipes ONLY scoped collections;
  // other collections (staff, products, courses, branches, etc.) untouched.
  const cols = scope === 'customer-only'
    ? [...CUSTOMER_ONLY_UNIVERSAL, ...CUSTOMER_ONLY_BRANCH_SCOPED]
    : [...UNIVERSAL_COLLECTIONS, ...BRANCH_SCOPED_COLLECTIONS];

  // Wipe Firestore collections (V74 cascade pattern)
  for (const col of cols) {
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

  // Wipe customer subcollections (V74 T4 cascade) — applies to BOTH scopes
  // since customer-only also includes per-customer subcolls
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

  // Wipe chat_conversations messages subcoll (applies to both scopes)
  const convSnap = await db.collection(`${PREFIX}/chat_conversations`).get();
  for (const c of convSnap.docs) {
    const msgsSnap = await db.collection(`${PREFIX}/chat_conversations/${c.id}/messages`).get();
    if (msgsSnap.empty) continue;
    const batch = db.batch();
    msgsSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // V81-fix4: Auth wipe is OPT-IN. Default = preserve Auth (no login loss).
  // V81-fix6: customer-only scope NEVER wipes Auth regardless of wipeAuth.
  if (wipeAuth && scope !== 'customer-only') {
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

  // Wipe Storage objects (V81-fix6: scope-aware filter)
  // Whole-system: wipe everything except backups/
  // Customer-only: wipe ONLY customers/ paths
  const [allFiles] = await storage.getFiles();
  for (const f of allFiles) {
    if (f.name.startsWith('backups/')) continue;
    if (scope === 'customer-only') {
      if (!CUSTOMER_ONLY_STORAGE_INCLUDE_PREFIXES.some(p => f.name.startsWith(p))) continue;
    }
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
  // V81-fix6 (2026-05-17 EOD+2 LATE+1): scope filter — 'full' (whole-system,
  // default backward-compat) OR 'customer-only' (be_customers + transactions +
  // subcollections + customers/* storage; Auth always preserved).
  scope = 'full',
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
  const manifest = await readManifest(storage, backupRef, scope);
  const v = validateWholeSystemManifest(manifest);
  if (!v.valid) {
    const err = new Error(`Manifest invalid: ${v.reason}`);
    err.code = 'WHOLE_SYSTEM_MANIFEST_TAMPERED';
    throw err;
  }

  // 2. Mode-specific pre-flight
  let autoBackupRef = null;
  if (mode === 'fresh') {
    await assertTargetEmpty(db, scope);
  } else if (mode === 'replace') {
    // AV19 elevation: auto-pre-backup MANDATORY before wipe (same scope as restore).
    const { runWholeSystemBackup } = await import('./wholeSystemBackupExecutor.js');
    const pre = await runWholeSystemBackup({
      db, storage, auth,
      type: 'pre-restore',
      createdBy: `pre-restore-for-${backupRef}`,
      runCleanup: false,
      scope, // V81-fix6: pre-backup matches restore scope
    });
    autoBackupRef = pre.name;
    const [exists] = await storage.file(`${backupPathPrefix(scope)}/${autoBackupRef}/manifest.json`).exists();
    if (!exists) {
      const err = new Error('Auto-pre-backup not verifiable');
      err.code = 'AUTO_PRE_BACKUP_FAILED';
      throw err;
    }
    // V81-fix4/fix6: wipeAuth follows replaceAuthFromBackup flag + scope
    await wipeFirebase(db, storage, auth, callerUid, { wipeAuth: replaceAuthFromBackup, scope });
  } else {
    const err = new Error(`Unknown mode: ${mode}`);
    err.code = 'INVALID_MODE';
    throw err;
  }

  // 3. Restore phases
  const colResult = await restoreCollections(db, storage, manifest, backupRef, scope);
  // V81-fix4/fix6: Auth restore only on full-scope replace mode with explicit opt-in.
  // Customer-only NEVER touches Auth. Whole-system default = preserve.
  const authResult = (scope === 'customer-only' || (mode === 'replace' && !replaceAuthFromBackup))
    ? { restoredAuth: 0, failedAuth: [], skipped: true, skippedReason: scope === 'customer-only' ? 'V81-fix6: customer-only never touches Auth' : 'V81-fix4: Auth preserved (replaceAuthFromBackup=false)' }
    : await restoreAuthUsers(auth, storage, manifest, backupRef, callerUid, scope);
  const storResult = await restoreStorage(storage, manifest, backupRef, scope);

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
