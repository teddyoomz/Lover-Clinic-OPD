// api/admin/_lib/wholeSystemRestoreExecutor.js
// V81 — Shared whole-system restore executor.
// Fresh-only mode in Task 9; Replace mode + AV19 elevation in Task 10.

import { FieldValue, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import {
  validateWholeSystemManifest,
  computeWholeSystemManifestHash,
  CUSTOMER_SUBCOLLECTIONS,
  CUSTOMER_ONLY_UNIVERSAL,        // V81-fix6
  CUSTOMER_ONLY_BRANCH_SCOPED,    // V81-fix6
  CUSTOMER_ONLY_STORAGE_INCLUDE_PREFIXES, // V81-fix6
  decodeFirestoreData, // V81-fix1: re-hydrate Timestamp/GeoPoint/Bytes from markers
  mapWithConcurrency,            // V122: bounded-parallel I/O (300s timeout fix)
  FULL_SCOPE_COLLECTION_DENYLIST, // V122: deliberate full-scope exclusions
} from '../../../src/lib/wholeSystemBackupCore.js';
import { computeAppointmentSlotDocs } from '../../../src/lib/appointmentSlotKeys.js';

// V81-fix1: SDK constructors used by decodeFirestoreData
const FB_TYPE_OPTS = { Timestamp, GeoPoint };

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const BATCH_SIZE = 450; // Firestore writeBatch limit is 500; 450 = safe headroom

// V122 (2026-05-26): bounded parallelism — same 300s-timeout fix as the backup
// executor (restore was also fully sequential: per-collection restore, 107-customer
// subcoll wipe, per-file storage copy). Replace mode also runs the backup executor
// as its auto-pre-backup, so both must be parallel to fit 300s.
const COLLECTION_CONCURRENCY = 15;
const SUBCOLL_CONCURRENCY = 40;
const STORAGE_CONCURRENCY = 15;

// V81-fix6: scope-aware backup path
function backupPathPrefix(scope) {
  return scope === 'customer-only' ? 'backups/customer-only' : 'backups/whole-system';
}

// V122: dynamic collection list for full-scope wipe + assertTargetEmpty.
// Mirrors the backup executor's dynamic enumeration so a Replace restore wipes
// EVERY current collection (not just the 53 hardcoded ones) before restoring —
// otherwise the 28 previously-omitted collections would survive as stale data.
async function listScopedCollections(db, scope) {
  if (scope === 'customer-only') {
    return [...CUSTOMER_ONLY_UNIVERSAL, ...CUSTOMER_ONLY_BRANCH_SCOPED];
  }
  const discovered = await db.doc(PREFIX).listCollections();
  return discovered.map(c => c.id).filter(id => !FULL_SCOPE_COLLECTION_DENYLIST.includes(id));
}

async function readManifest(storage, backupRef, scope = 'full') {
  const [buf] = await storage.file(`${backupPathPrefix(scope)}/${backupRef}/manifest.json`).download();
  return JSON.parse(buf.toString('utf8'));
}

async function assertTargetEmpty(db, scope = 'full') {
  // Scan scoped non-audit collections; refuse if any has docs.
  // V122: dynamic enumeration (full scope) so newly-added collections are also
  // checked. listCollections() only returns NON-EMPTY collections → a clean
  // target yields [] → passes; any data → caught. Parallel for speed.
  const cols = (await listScopedCollections(db, scope)).filter(c => c !== 'be_admin_audit');
  const checks = await mapWithConcurrency(cols, COLLECTION_CONCURRENCY, async (col) => {
    const snap = await db.collection(`${PREFIX}/${col}`).limit(1).get();
    return { col, empty: snap.empty };
  });
  const nonEmpty = checks.find(c => !c.empty);
  if (nonEmpty) {
    const err = new Error('Target not empty');
    err.code = 'TARGET_NOT_EMPTY';
    err.firstNonEmpty = nonEmpty.col;
    throw err;
  }
}

async function restoreCollections(db, storage, manifest, backupRef, scope = 'full') {
  // V81-fix7 (2026-05-17 EOD+2 LATE+3): per-doc resilience — if ONE doc in a
  // batch fails, log + skip THAT doc; other docs still restored. Previous
  // per-collection try/catch silently dropped entire collections (S2 stress
  // test root cause — 102 docs restored out of 3722+ expected).
  //
  // Strategy:
  //   1. Try downloading the collection file (per-collection try/catch)
  //   2. Parse JSON + decode types (per-collection)
  //   3. Try a fast-path batch.commit (most common case — whole batch succeeds)
  //   4. If batch fails → fall back to per-doc individual writes with try/catch
  //   5. Track restoredDocs + failedDocsCount per collection + per-doc errors

  const failedDocs = [];
  // V122: PARALLEL across collections (inner per-batch + per-doc fallback unchanged).
  const perColRestored = await mapWithConcurrency(manifest.collections || [], COLLECTION_CONCURRENCY, async (c) => {
    let buf;
    try {
      [buf] = await storage.file(`${backupPathPrefix(scope)}/${backupRef}/${c.path}`).download();
    } catch (e) {
      failedDocs.push({ collection: c.name, phase: 'download', error: e.message });
      return 0;
    }

    let docs;
    try {
      const rawDocs = JSON.parse(buf.toString('utf8'));
      docs = rawDocs.map(d => decodeFirestoreData(d, FB_TYPE_OPTS));
    } catch (e) {
      failedDocs.push({ collection: c.name, phase: 'parse', error: e.message });
      return 0;
    }

    const colPath = `${PREFIX}/${c.name}`;
    let perCollectionRestored = 0;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const slice = docs.slice(i, i + BATCH_SIZE);
      // Fast path: try whole batch
      try {
        const batch = db.batch();
        for (const doc of slice) {
          const { id, ...data } = doc;
          batch.set(db.doc(`${colPath}/${id}`), data);
        }
        await batch.commit();
        perCollectionRestored += slice.length;
        continue;
      } catch (batchErr) {
        // Slow path: per-doc fallback — find the bad doc(s), preserve the good ones (V81-fix7)
        for (const doc of slice) {
          const { id, ...data } = doc;
          try {
            await db.doc(`${colPath}/${id}`).set(data);
            perCollectionRestored += 1;
          } catch (docErr) {
            failedDocs.push({
              collection: c.name,
              docId: id,
              phase: 'per-doc-set',
              error: docErr.message,
              hint: 'isolated by V81-fix7 per-doc fallback (was silent-swallow pre-fix)',
            });
          }
        }
      }
    }
    if (perCollectionRestored !== docs.length) {
      failedDocs.push({
        collection: c.name,
        phase: 'partial-restore',
        attempted: docs.length,
        succeeded: perCollectionRestored,
      });
    }
    return perCollectionRestored;
  });
  const restoredDocs = perColRestored.reduce((s, n) => s + (n || 0), 0);
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
  const failedStorage = [];
  // V122: PARALLEL copies (was sequential per-file).
  const results = await mapWithConcurrency(manifest.storageObjects || [], STORAGE_CONCURRENCY, async (s) => {
    try {
      const srcPath = `${backupPathPrefix(scope)}/${backupRef}/${s.path}`;
      await storage.file(srcPath).copy(storage.file(s.originalGsPath));
      return 1;
    } catch (e) {
      failedStorage.push({ path: s.originalGsPath, error: e.message });
      return 0;
    }
  });
  const restoredStorage = results.reduce((a, b) => a + b, 0);
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
  // V81-fix6: scope-aware wipe. Customer-only restore wipes ONLY scoped collections.
  // V122: full scope enumerates dynamically (listScopedCollections) so a Replace
  // restore wipes EVERY current collection — the pre-V122 hardcoded list left the
  // 28 omitted collections as stale data after a "full replace".
  const cols = (await listScopedCollections(db, scope)).filter(c => c !== 'be_admin_audit');

  // V122 ORDERING FIX: subcollections MUST be wiped BEFORE their parent collection.
  // Firestore does NOT cascade-delete subcollections, and once be_customers docs
  // are deleted, `be_customers.get()` returns nothing → the pre-V122 order ran the
  // subcoll wipe against an already-empty parent → orphaned subcollections survived
  // a "full replace" (a restore-fidelity bug). Capture doc refs (incl. phantom
  // parents) via listDocuments() up front, wipe subcollections, THEN wipe collections.
  const custDocs = await db.collection(`${PREFIX}/be_customers`).listDocuments();
  const convDocs = await db.collection(`${PREFIX}/chat_conversations`).listDocuments();

  // 1. Wipe customer subcollections (V74 T4) — PARALLEL over (customer × subcoll).
  const subPairs = [];
  for (const cRef of custDocs) for (const sub of CUSTOMER_SUBCOLLECTIONS) subPairs.push({ cid: cRef.id, sub });
  await mapWithConcurrency(subPairs, SUBCOLL_CONCURRENCY, async ({ cid, sub }) => {
    const subSnap = await db.collection(`${PREFIX}/be_customers/${cid}/${sub}`).get();
    if (subSnap.empty) return;
    const batch = db.batch();
    subSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  });

  // 2. Wipe chat_conversations messages subcoll — PARALLEL over conversations.
  await mapWithConcurrency(convDocs, SUBCOLL_CONCURRENCY, async (cRef) => {
    const msgsSnap = await db.collection(`${PREFIX}/chat_conversations/${cRef.id}/messages`).get();
    if (msgsSnap.empty) return;
    const batch = db.batch();
    msgsSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  });

  // 3. Wipe top-level Firestore collections — PARALLEL across collections
  //    (pagination loop stays sequential within each collection).
  await mapWithConcurrency(cols, COLLECTION_CONCURRENCY, async (col) => {
    let snap;
    do {
      snap = await db.collection(`${PREFIX}/${col}`).limit(BATCH_SIZE).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } while (snap.size === BATCH_SIZE);
  });

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

  // 4. Wipe Storage objects (V81-fix6: scope-aware filter) — V122: PARALLEL.
  //    Whole-system: wipe everything except backups/. Customer-only: customers/ only.
  const [allFiles] = await storage.getFiles();
  const toDelete = allFiles.filter(f => {
    if (f.name.startsWith('backups/')) return false;
    if (scope === 'customer-only') {
      return CUSTOMER_ONLY_STORAGE_INCLUDE_PREFIXES.some(p => f.name.startsWith(p));
    }
    return true;
  });
  await mapWithConcurrency(toDelete, STORAGE_CONCURRENCY, async (f) => {
    try { await f.delete(); } catch { /* tolerant */ }
  });
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
// appointment-loop R9 (2026-06-03) — rebuild be_appointment_slots for restored
// live appointments when the manifest did NOT include be_appointment_slots (the
// customer-only scope's curated list excludes it; slots are keyed
// date_doctor_time, not by branch/customer). Without this, a customer-only
// restore brings back live appts with NO atomic double-booking guard → their
// times silently bookable. No-op for full scope (V122 dynamic enumeration already
// captures + restores be_appointment_slots consistently). Reads the restored
// be_appointments file (scoped) + rebuilds; idempotent; chunked.
async function rebuildAppointmentSlotsIfMissing(db, storage, manifest, backupRef, scope) {
  const cols = manifest.collections || [];
  const apptCol = cols.find(c => c.name === 'be_appointments');
  const hasSlots = cols.some(c => c.name === 'be_appointment_slots');
  if (!apptCol || hasSlots) return 0;   // nothing to rebuild, OR slots already restored
  let docs;
  try {
    const [buf] = await storage.file(`${backupPathPrefix(scope)}/${backupRef}/${apptCol.path}`).download();
    docs = JSON.parse(buf.toString('utf8')).map(d => decodeFirestoreData(d, FB_TYPE_OPTS));
  } catch { return 0; }
  let rebuilt = 0, batch = db.batch(), n = 0;
  const flush = async () => { if (n > 0) { await batch.commit(); batch = db.batch(); n = 0; } };
  const takenAt = new Date().toISOString();
  for (const a of docs) {
    for (const { key, doc } of computeAppointmentSlotDocs(a, { takenAt })) {
      batch.set(db.doc(`${PREFIX}/be_appointment_slots/${key}`), doc);
      n++; rebuilt++;
      if (n >= BATCH_SIZE) await flush();
    }
  }
  await flush();
  return rebuilt;
}

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
  // R9 — restore the AP1-bis slot guard for restored appts (no-op for full scope).
  const slotsRebuilt = await rebuildAppointmentSlotsIfMissing(db, storage, manifest, backupRef, scope);
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
  // V81-fix6: scope-aware audit op + id naming
  const auditOp = scope === 'customer-only' ? 'customer-only-restore' : 'whole-system-restore';
  const auditId = `${auditOp}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${PREFIX}/be_admin_audit/${auditId}`).set({
    op: auditOp,
    scope,
    backupRef,
    mode,
    autoBackupRef,
    replaceAuthFromBackup,
    authPreserved: scope === 'customer-only' || (mode === 'replace' && !replaceAuthFromBackup),
    stats: {
      ...colResult,
      ...authResult,
      ...storResult,
      slotsRebuilt,   // R9 — appointment slots rebuilt (customer-only scope)
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
      slotsRebuilt,   // R9 — appointment slots rebuilt (customer-only scope)
    },
    passwordResetEmailsSent,
  };
}
