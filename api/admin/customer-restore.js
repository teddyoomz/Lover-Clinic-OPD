// api/admin/customer-restore.js
// V74 — Per-customer global restore from Storage backup file.
// Admin-only (verifyAdminToken). Supports action='preview' + action='restore'.
//
// Q3=B SAFE conflict resolution:
//   - customerId already exists → 400 BLOCK CUSTOMER_ID_EXISTS
//   - hn_no collision with another customer → 400 BLOCK HN_COLLISION
//   - lineUserId_byBranch[X] taken by another customer → STRIP that branch's
//     entry + record in audit.lineConflicts[]
//   - stale staff/doctor FK → restore as-is (V41 lookup-map handles missing-FK)
//
// Flow (action='restore'):
//   1. Auth gate
//   2. Download backup.json + parse + validate
//   3. Integrity verify (bodyHash + storageManifestHash + per-Storage-object SHA-256)
//   4. Conflict scan against live customers
//   5. If BLOCK conflict → 400 with detail
//   6. Strip line conflicts from customer doc
//   7. Batch-write all docs at original IDs (chunk by 450)
//   8. Copy Storage objects from backup tree to canonical paths
//   9. Write audit doc with restore counts + stripped conflicts + hashes
//
// Spec § 4.3

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import {
  CUSTOMER_CASCADE_COLLECTIONS_FULL,
  T4_SUBCOLLECTIONS,
} from '../../src/lib/customerBackupCore.js';
import { validateCustomerBackupFile, computeStorageManifestHash } from '../../src/lib/customerBackupSchema.js';
import { computeBodyHash, jsonReviverForNonFinite } from '../../src/lib/branchBackupSchema.js';
import { scanRestoreConflicts, stripLineConflicts } from '../../src/lib/customerBackupConflict.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const STORAGE_PREFIX_CUSTOMER = 'be_customers';

let cachedDb = null, cachedBucket = null;
function getAdmin() {
  if (cachedDb && cachedBucket) return { db: cachedDb, bucket: cachedBucket };
  let app;
  if (getApps().length > 0) app = getApp();
  else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
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
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}
function customerSubcoll(db, customerId, subName) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data')
    .collection('be_customers').doc(customerId).collection(subName);
}
function randHex(n = 8) {
  return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

/**
 * Download + parse + integrity-verify a backup file. Mirrors the
 * verifyAutoBackupIntegrity in delete-customer-cascade.js.
 */
async function loadAndVerifyBackup({ bucket, backupRef }) {
  const [exists] = await bucket.file(backupRef).exists();
  if (!exists) return { ok: false, error: 'BACKUP_NOT_FOUND' };

  let file;
  try {
    const [buf] = await bucket.file(backupRef).download();
    file = JSON.parse(buf.toString('utf8'), jsonReviverForNonFinite);
  } catch (e) {
    return { ok: false, error: 'BACKUP_JSON_PARSE_FAILED', detail: { message: e.message } };
  }

  try {
    validateCustomerBackupFile(file);
  } catch (e) {
    return { ok: false, error: 'BACKUP_SCHEMA_INVALID', detail: { message: e.message } };
  }

  // bodyHash verify
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

  // storageManifestHash verify
  const manifest = file.meta.storageManifest || [];
  const recomputedManifestHash = computeStorageManifestHash(manifest);
  if (file.meta.storageManifestHash && recomputedManifestHash !== file.meta.storageManifestHash) {
    return {
      ok: false,
      error: 'BACKUP_STORAGE_MANIFEST_HASH_MISMATCH',
      detail: { expected: file.meta.storageManifestHash, recomputed: recomputedManifestHash },
    };
  }

  // Per-Storage-object SHA-256 verify
  const backupPrefix = backupRef.replace(/\/backup\.json$/, '');
  const objectErrors = [];
  await Promise.all(manifest.map(async (entry) => {
    const objPath = `${backupPrefix}/storage/${entry.path}`;
    try {
      const [objExists] = await bucket.file(objPath).exists();
      if (!objExists) {
        objectErrors.push({ path: entry.path, error: 'STORAGE_OBJECT_MISSING' });
        return;
      }
      const [objBuf] = await bucket.file(objPath).download();
      const sha256 = crypto.createHash('sha256').update(objBuf).digest('hex');
      if (sha256 !== entry.sha256) {
        objectErrors.push({ path: entry.path, error: 'STORAGE_OBJECT_SHA256_MISMATCH' });
      }
    } catch (e) {
      objectErrors.push({ path: entry.path, error: e.message });
    }
  }));
  if (objectErrors.length > 0) {
    return { ok: false, error: 'BACKUP_STORAGE_INTEGRITY_FAIL', detail: { objectErrors } };
  }

  return { ok: true, file, backupPrefix };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const backupRef = String(req.body?.backupRef || '').trim();
  const action = String(req.body?.action || 'preview').trim();
  if (!backupRef) return res.status(400).json({ ok: false, error: 'MISSING_BACKUP_REF' });
  if (!['preview', 'restore'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'INVALID_ACTION', detail: { action, valid: ['preview', 'restore'] } });
  }

  try {
    const { db, bucket } = getAdmin();

    // 1-3. Load + parse + integrity-verify
    const loadResult = await loadAndVerifyBackup({ bucket, backupRef });
    if (!loadResult.ok) {
      return res.status(400).json({ ok: false, ...loadResult });
    }
    const { file, backupPrefix } = loadResult;
    const backupCustomer = (file.collections?.be_customers || [])[0];
    if (!backupCustomer) {
      return res.status(400).json({ ok: false, error: 'BACKUP_CUSTOMER_DOC_MISSING' });
    }
    const customerId = String(backupCustomer.id || file.meta.customerId);

    // 4. Conflict scan (against live customers)
    const liveSnap = await dataCol(db, 'be_customers').get();
    const liveCustomers = liveSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    const conflicts = scanRestoreConflicts({ backupCustomer, liveCustomers });

    // Counts for preview/restore response
    const cascadeRecreateCounts = {};
    for (const colName of CUSTOMER_CASCADE_COLLECTIONS_FULL) {
      cascadeRecreateCounts[colName] = (file.collections?.[colName] || []).length;
    }
    const subcollectionRecreateCounts = {};
    for (const sub of T4_SUBCOLLECTIONS) {
      subcollectionRecreateCounts[sub] = (file.subcollections?.[sub] || []).length;
    }
    const chatConversationCount = (file.chatConversations || []).length;
    const storageObjectCount = (file.meta.storageManifest || []).length;

    // 5. BLOCK on identity conflicts (Q3=B SAFE)
    if (action === 'preview') {
      return res.status(200).json({
        ok: true,
        action: 'preview',
        backupRef,
        customerId,
        customerHN: file.meta.customerHN,
        customerName: file.meta.customerName,
        cascadeRecreateCounts,
        subcollectionRecreateCounts,
        chatConversationCount,
        storageObjectCount,
        conflicts,
        wouldBlock: conflicts.customerIdExists || !!conflicts.hnCollision,
      });
    }

    // action === 'restore'
    if (conflicts.customerIdExists) {
      return res.status(400).json({
        ok: false,
        error: 'CUSTOMER_ID_EXISTS',
        detail: { customerId, message: 'ลูกค้านี้ยังอยู่ในระบบ — กรุณาลบก่อน restore' },
      });
    }
    if (conflicts.hnCollision) {
      return res.status(400).json({
        ok: false,
        error: 'HN_COLLISION',
        detail: conflicts.hnCollision,
      });
    }

    // 6. Strip line conflicts from customer doc
    const restoredCustomer = stripLineConflicts(backupCustomer, conflicts.lineConflicts);
    const strippedLineConflicts = conflicts.lineConflicts;

    // 7. Batch-write all docs at original IDs
    const ts = Date.now();
    const rand = randHex(8);
    const auditId = `customer-restore-${customerId}-${ts}-${rand}`;
    const auditRef = dataCol(db, 'be_admin_audit').doc(auditId);

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

    // Customer doc
    batchOp.set(dataCol(db, 'be_customers').doc(customerId), restoredCustomer);
    inBatch++; totalWrites++;
    await flushIfFull();

    // Cascade collections
    for (const colName of CUSTOMER_CASCADE_COLLECTIONS_FULL) {
      const docs = file.collections?.[colName] || [];
      for (const doc of docs) {
        const docId = String(doc.id);
        const { id: _ignoredId, ...payload } = doc;
        batchOp.set(dataCol(db, colName).doc(docId), payload);
        inBatch++; totalWrites++;
        await flushIfFull();
      }
    }

    // Subcollections
    for (const sub of T4_SUBCOLLECTIONS) {
      const docs = file.subcollections?.[sub] || [];
      for (const doc of docs) {
        const docId = String(doc.id);
        const { id: _ignoredId, ...payload } = doc;
        batchOp.set(customerSubcoll(db, customerId, sub).doc(docId), payload);
        inBatch++; totalWrites++;
        await flushIfFull();
      }
    }

    // Chat conversations
    for (const chat of file.chatConversations || []) {
      const chatId = String(chat.id);
      const { id: _ignoredId, ...payload } = chat;
      batchOp.set(dataCol(db, 'chat_conversations').doc(chatId), payload);
      inBatch++; totalWrites++;
      await flushIfFull();
    }

    // Audit doc (final batch)
    const auditPayload = {
      type: 'customer-restore',
      customerId,
      customerHN: file.meta.customerHN,
      customerName: file.meta.customerName,
      backupRef,
      bodyHash: file.meta.bodyHash,
      storageManifestHash: file.meta.storageManifestHash,
      cascadeRecreateCounts,
      subcollectionRecreateCounts,
      chatConversationCount,
      storageObjectCount,
      strippedLineConflicts,
      performedBy: { uid: caller.uid || '', email: caller.email || '' },
      performedAt: new Date().toISOString(),
    };
    batchOp.set(auditRef, auditPayload);
    inBatch++; totalWrites++;
    await batchOp.commit();

    // 8. Copy Storage objects back from backup tree to canonical paths
    const manifest = file.meta.storageManifest || [];
    const storageRestoreErrors = [];
    await Promise.all(manifest.map(async (entry) => {
      const srcPath = `${backupPrefix}/storage/${entry.path}`;
      const dstPath = entry.path; // canonical path stays the same (be_customers/{cid}/...)
      try {
        await bucket.file(srcPath).copy(bucket.file(dstPath));
      } catch (e) {
        storageRestoreErrors.push({ path: entry.path, error: e.message });
      }
    }));

    return res.status(200).json({
      ok: true,
      action: 'restore',
      customerId,
      customerHN: file.meta.customerHN,
      customerName: file.meta.customerName,
      cascadeRecreateCounts,
      subcollectionRecreateCounts,
      chatConversationCount,
      storageObjectCount,
      storageRestoreErrors: storageRestoreErrors.length > 0 ? storageRestoreErrors : null,
      strippedLineConflicts,
      auditDocId: auditId,
      totalWrites,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'RESTORE_FAILED' });
  }
}
