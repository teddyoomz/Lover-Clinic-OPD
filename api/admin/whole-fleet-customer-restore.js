// api/admin/whole-fleet-customer-restore.js
// V75 Item 2 — Whole-fleet customer restore.
//
// Loads a whole-fleet manifest.json from Storage (path `backups/whole-fleet-
// customers/{ts-rand}/manifest.json` emitted by --all-customers CLI), iterates
// per-customer backup files (linked via manifest.customers[].fileEntry), and
// runs V74 SAFE restore per customer with Q3=B conflict resolution.
//
// AV56 invariant: restore mode verifies manifestHash via the shared
// computeWholeFleetManifestHash helper + refuses with
// WHOLE_FLEET_MANIFEST_TAMPERED on mismatch with caller-provided
// confirmManifestHash.
//
// Per-customer failure isolation: one customer's BLOCK / SCHEMA_INVALID /
// STORAGE_INTEGRITY_FAIL does NOT abort the batch. Aggregated into
// perCustomer[] + the counters {restored, skippedConflict, failed}.
//
// Actions:
//   preview  — full scan + per-customer outcome report, NO writes
//   restore  — verifies manifestHash, then per-customer V74 SAFE restore
//
// Returns 200 with aggregated result on success; 400 on validation
// failures (manifest broken, missing backupRef, etc.); 409 on hash tamper.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'node:crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import {
  CUSTOMER_CASCADE_COLLECTIONS_FULL,
  T4_SUBCOLLECTIONS,
} from '../../src/lib/customerBackupCore.js';
import {
  validateCustomerBackupFile,
  computeStorageManifestHash,
} from '../../src/lib/customerBackupSchema.js';
import {
  computeBodyHash,
  jsonReviverForNonFinite,
} from '../../src/lib/branchBackupSchema.js';
import {
  scanRestoreConflicts,
  stripLineConflicts,
} from '../../src/lib/customerBackupConflict.js';
import {
  validateWholeFleetManifest,
  computeWholeFleetManifestHash,
} from '../../src/lib/wholeFleetBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

let cachedDb = null;
let cachedBucket = null;
function getAdmin() {
  if (cachedDb && cachedBucket) return { db: cachedDb, bucket: cachedBucket };
  let app;
  if (getApps().length > 0) app = getApp();
  else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) {
      throw new Error('firebase-admin not configured');
    }
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
      storageBucket: BUCKET,
    });
  }
  cachedDb = getFirestore(app);
  cachedBucket = getStorage(app).bucket(BUCKET);
  return { db: cachedDb, bucket: cachedBucket };
}

function dataCol(db, name) {
  return db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('public')
    .doc('data')
    .collection(name);
}
function customerSubcoll(db, customerId, subName) {
  return db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('public')
    .doc('data')
    .collection('be_customers')
    .doc(customerId)
    .collection(subName);
}
function randHex(n = 8) {
  return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

// ─── Per-customer backup file load + integrity verify ─────────────────────
// Mirrors api/admin/customer-restore.js loadAndVerifyBackup but returns
// {ok, file, backupPrefix, error?} rather than writing 400.
async function loadAndVerifyPerCustomer({ bucket, backupRef }) {
  const [exists] = await bucket.file(backupRef).exists();
  if (!exists) return { ok: false, error: 'BACKUP_NOT_FOUND' };

  let file;
  try {
    const [buf] = await bucket.file(backupRef).download();
    file = JSON.parse(buf.toString('utf8'), jsonReviverForNonFinite);
  } catch (e) {
    return { ok: false, error: 'BACKUP_JSON_PARSE_FAILED', detail: e.message };
  }

  try {
    validateCustomerBackupFile(file);
  } catch (e) {
    return { ok: false, error: 'BACKUP_SCHEMA_INVALID', detail: e.message };
  }

  const hashedBody = { ...(file.collections || {}) };
  for (const [subName, docs] of Object.entries(file.subcollections || {})) {
    hashedBody[`__sub__${subName}`] = Array.isArray(docs) ? docs : [];
  }
  hashedBody.__chat__ = Array.isArray(file.chatConversations) ? file.chatConversations : [];
  const recomputedBodyHash = computeBodyHash(hashedBody);
  if (file.meta.bodyHash && recomputedBodyHash !== file.meta.bodyHash) {
    return {
      ok: false,
      error: 'BACKUP_BODY_HASH_MISMATCH',
      detail: { expected: file.meta.bodyHash, recomputed: recomputedBodyHash },
    };
  }

  const manifest = file.meta.storageManifest || [];
  const recomputedManifestHash = computeStorageManifestHash(manifest);
  if (
    file.meta.storageManifestHash &&
    recomputedManifestHash !== file.meta.storageManifestHash
  ) {
    return {
      ok: false,
      error: 'BACKUP_STORAGE_MANIFEST_HASH_MISMATCH',
      detail: { expected: file.meta.storageManifestHash, recomputed: recomputedManifestHash },
    };
  }

  const backupPrefix = backupRef.replace(/\/backup\.json$/, '');
  return { ok: true, file, backupPrefix };
}

// ─── Per-customer restore writes ──────────────────────────────────────────
// Mirrors the V74 customer-restore batch-write + Storage-copy flow.
async function restoreSingleCustomer({
  db,
  bucket,
  file,
  backupPrefix,
  conflicts,
  caller,
  parentBatchAuditId,
}) {
  const backupCustomer = (file.collections?.be_customers || [])[0];
  if (!backupCustomer) {
    return { ok: false, error: 'BACKUP_CUSTOMER_DOC_MISSING' };
  }
  // V77-fix2 (P1-2): trust file.meta.customerId (server-stamped at export
  // time) over backupCustomer.id (could be poisoned by V38 spread-order
  // legacy data field). Mirror V38 lesson at restore-side too.
  const customerId = String(file.meta.customerId || backupCustomer.id);

  const restoredCustomer = stripLineConflicts(backupCustomer, conflicts.lineConflicts);
  const strippedLineConflicts = conflicts.lineConflicts;

  const ts = Date.now();
  const rand = randHex(8);
  const auditId = `customer-restore-${customerId}-${ts}-${rand}`;

  let batchOp = db.batch();
  let inBatch = 0;
  let totalWrites = 0;
  async function flushIfFull() {
    if (inBatch >= 450) {
      await batchOp.commit();
      batchOp = db.batch();
      inBatch = 0;
    }
  }

  batchOp.set(dataCol(db, 'be_customers').doc(customerId), restoredCustomer);
  inBatch++;
  totalWrites++;
  await flushIfFull();

  for (const colName of CUSTOMER_CASCADE_COLLECTIONS_FULL) {
    const docs = file.collections?.[colName] || [];
    for (const doc of docs) {
      const docId = String(doc.id);
      const { id: _ignoredId, ...payload } = doc;
      batchOp.set(dataCol(db, colName).doc(docId), payload);
      inBatch++;
      totalWrites++;
      await flushIfFull();
    }
  }

  for (const sub of T4_SUBCOLLECTIONS) {
    const docs = file.subcollections?.[sub] || [];
    for (const doc of docs) {
      const docId = String(doc.id);
      const { id: _ignoredId, ...payload } = doc;
      batchOp.set(customerSubcoll(db, customerId, sub).doc(docId), payload);
      inBatch++;
      totalWrites++;
      await flushIfFull();
    }
  }

  for (const chat of file.chatConversations || []) {
    const chatId = String(chat.id);
    const { id: _ignoredId, ...payload } = chat;
    batchOp.set(dataCol(db, 'chat_conversations').doc(chatId), payload);
    inBatch++;
    totalWrites++;
    await flushIfFull();
  }

  const auditPayload = {
    type: 'customer-restore',
    parentBatch: parentBatchAuditId,
    customerId,
    customerHN: file.meta.customerHN,
    customerName: file.meta.customerName,
    bodyHash: file.meta.bodyHash,
    storageManifestHash: file.meta.storageManifestHash,
    strippedLineConflicts,
    totalWrites,
    performedBy: { uid: caller.uid || '', email: caller.email || '' },
    performedAt: FieldValue.serverTimestamp(),
  };
  batchOp.set(dataCol(db, 'be_admin_audit').doc(auditId), auditPayload);
  inBatch++;
  totalWrites++;
  await batchOp.commit();

  // Copy Storage objects back to canonical paths
  const storageManifest = file.meta.storageManifest || [];
  const storageErrors = [];
  await Promise.all(
    storageManifest.map(async (entry) => {
      const srcPath = `${backupPrefix}/storage/${entry.path}`;
      const dstPath = entry.path;
      try {
        const [srcExists] = await bucket.file(srcPath).exists();
        if (!srcExists) {
          storageErrors.push({ path: entry.path, error: 'STORAGE_SOURCE_MISSING' });
          return;
        }
        await bucket.file(srcPath).copy(bucket.file(dstPath));
      } catch (e) {
        storageErrors.push({ path: entry.path, error: e.message });
      }
    })
  );

  return {
    ok: true,
    customerId,
    totalWrites,
    strippedLineConflicts,
    storageErrors,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const start = Date.now();
  const action = String(req.body?.action || 'preview').trim();
  const backupRef = String(req.body?.backupRef || '').trim();
  const confirmManifestHash = String(req.body?.confirmManifestHash || '').trim();

  if (!backupRef) {
    return res.status(400).json({ ok: false, error: 'MISSING_BACKUP_REF' });
  }
  if (!['preview', 'restore'].includes(action)) {
    return res.status(400).json({
      ok: false,
      error: 'INVALID_ACTION',
      detail: { action, valid: ['preview', 'restore'] },
    });
  }

  try {
    const { db, bucket } = getAdmin();

    // 1. Download manifest.json
    const [manifestExists] = await bucket.file(backupRef).exists();
    if (!manifestExists) {
      return res.status(400).json({ ok: false, error: 'WHOLE_FLEET_MANIFEST_NOT_FOUND' });
    }
    const [manifestBuf] = await bucket.file(backupRef).download();
    let manifest;
    try {
      manifest = JSON.parse(manifestBuf.toString('utf8'));
    } catch (e) {
      return res
        .status(400)
        .json({ ok: false, error: 'INVALID_MANIFEST', reason: 'JSON parse failed: ' + e.message });
    }

    // 2. Validate manifest shape
    const valid = validateWholeFleetManifest(manifest);
    if (!valid.valid) {
      return res
        .status(400)
        .json({ ok: false, error: 'INVALID_MANIFEST', reason: valid.reason });
    }

    // 3. Compute manifestHash + verify (restore mode only)
    const recomputedHash = computeWholeFleetManifestHash(manifest);
    if (action === 'restore') {
      if (!confirmManifestHash) {
        return res
          .status(400)
          .json({ ok: false, error: 'MISSING_CONFIRM_MANIFEST_HASH' });
      }
      if (recomputedHash !== confirmManifestHash) {
        return res.status(409).json({
          ok: false,
          error: 'WHOLE_FLEET_MANIFEST_TAMPERED',
          detail: { expectedHash: recomputedHash, providedHash: confirmManifestHash },
        });
      }
    }

    // 4. Live customers snapshot (for conflict scan)
    // V77-fix2 (P1-1): spread-order V38 lesson — docId wins over data.id
    const liveSnap = await dataCol(db, 'be_customers').get();
    const liveCustomers = liveSnap.docs.map((d) => ({ ...d.data(), id: d.id }));

    // 5. Per-customer loop with failure isolation
    const parentBatchAuditId = `whole-fleet-restore-${Date.now()}-${randHex(4)}`;
    const perCustomer = [];
    let restored = 0;
    let skippedConflict = 0;
    let failed = 0;
    let wouldRestore = 0;
    let wouldSkipBlocked = 0;
    let wouldStripLine = 0;

    // V77-fix2 (P1-7): track restored customers in-memory so successive
    // restore iterations can detect HN-collision against EARLIER successes
    // (otherwise duplicate HNs in backup all pass conflict scan because they
    // all compare against the original liveCustomers snapshot).
    const restoredLive = [...liveCustomers];

    for (const entry of manifest.customers || []) {
      const cid = String(entry.cid || '');
      // V77-fix2 (SP-2): path-traversal sanitize. fileEntry comes from
      // manifest.json (admin-controlled but Storage-blob-tamperable). Reject
      // anything not under the canonical backups/customers/ prefix to prevent
      // restore from pulling arbitrary JSON files via path traversal.
      const safeFileEntry = String(entry.fileEntry || '').trim();
      if (!safeFileEntry.startsWith('backups/customers/')) {
        failed++;
        perCustomer.push({
          cid,
          outcome: 'failed',
          error: 'INVALID_FILE_ENTRY_PATH',
          detail: { fileEntry: safeFileEntry.slice(0, 120) },
        });
        continue;
      }
      try {
        const loadResult = await loadAndVerifyPerCustomer({
          bucket,
          backupRef: safeFileEntry,
        });
        if (!loadResult.ok) {
          failed++;
          perCustomer.push({
            cid,
            outcome: 'failed',
            error: loadResult.error,
            detail: loadResult.detail,
          });
          continue;
        }

        const { file, backupPrefix } = loadResult;
        const backupCustomer = (file.collections?.be_customers || [])[0];
        if (!backupCustomer) {
          failed++;
          perCustomer.push({ cid, outcome: 'failed', error: 'BACKUP_CUSTOMER_DOC_MISSING' });
          continue;
        }

        // V77-fix2 (P1-7): use restoredLive (grows as customers are restored)
        // so successive iterations detect HN-collision against earlier
        // restores in THIS batch, not just the original snapshot.
        const conflicts = scanRestoreConflicts({ backupCustomer, liveCustomers: restoredLive });

        if (conflicts.customerIdExists || conflicts.hnCollision) {
          skippedConflict++;
          if (action === 'preview') wouldSkipBlocked++;
          perCustomer.push({
            cid,
            outcome: 'skipped-conflict',
            reason: conflicts.customerIdExists
              ? 'CUSTOMER_ID_EXISTS'
              : 'HN_COLLISION',
            detail: conflicts.hnCollision || { customerId: cid },
          });
          continue;
        }

        if (action === 'preview') {
          wouldRestore++;
          if (conflicts.lineConflicts.length > 0) wouldStripLine++;
          perCustomer.push({
            cid,
            outcome: 'would-restore',
            wouldStripLineConflicts: conflicts.lineConflicts.length,
          });
          continue;
        }

        // Restore mode
        const restoreResult = await restoreSingleCustomer({
          db,
          bucket,
          file,
          backupPrefix,
          conflicts,
          caller,
          parentBatchAuditId,
        });
        if (!restoreResult.ok) {
          failed++;
          perCustomer.push({
            cid,
            outcome: 'failed',
            error: restoreResult.error,
          });
          continue;
        }
        restored++;
        // V77-fix2 (P1-7): append restored customer to restoredLive so
        // subsequent iterations see them for collision detection.
        restoredLive.push({
          ...backupCustomer,
          id: String(file.meta.customerId || backupCustomer.id),
        });
        perCustomer.push({
          cid,
          outcome: 'restored',
          totalWrites: restoreResult.totalWrites,
          strippedLineConflicts: restoreResult.strippedLineConflicts,
          storageErrors: restoreResult.storageErrors,
        });
      } catch (err) {
        failed++;
        perCustomer.push({ cid, outcome: 'failed', error: err.message });
      }
    }

    // 6. Parent audit doc (restore mode only)
    if (action === 'restore') {
      await dataCol(db, 'be_admin_audit').doc(parentBatchAuditId).set({
        type: 'whole-fleet-customer-restore',
        backupRef,
        manifestHash: recomputedHash,
        restored,
        skippedConflict,
        failed,
        totalCustomers: (manifest.customers || []).length,
        perCustomer,
        durationMs: Date.now() - start,
        performedBy: { uid: caller.uid || '', email: caller.email || '' },
        performedAt: FieldValue.serverTimestamp(),
      });
    }

    // 7. Aggregated response
    if (action === 'preview') {
      return res.status(200).json({
        ok: true,
        action,
        backupRef,
        manifestHash: recomputedHash,
        customerCount: (manifest.customers || []).length,
        wouldRestore,
        wouldSkipBlocked,
        wouldStripLine,
        skippedConflict,
        failed,
        perCustomer,
        durationMs: Date.now() - start,
      });
    }

    return res.status(200).json({
      ok: true,
      action,
      backupRef,
      manifestHash: recomputedHash,
      parentBatchAuditId,
      restored,
      skippedConflict,
      failed,
      totalCustomers: (manifest.customers || []).length,
      perCustomer,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'INTERNAL', detail: err.message });
  }
}
