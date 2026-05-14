// ─── /api/admin/branch-make-fresh — V40 + 2026-05-14 selective-make-fresh ───
// Wipes selected bucket-scoped data for a target branch. REQUIRES bucketIds[]
// (selective scope) + autoBackupRef in Storage (AV19 preserved).
//
// 2026-05-14 selective-make-fresh:
//   - bucketIds[] now REQUIRED (V40 atomic-all-wipe contract retired)
//   - Pre-wipe sequence:
//       1. Validate bucketIds (non-empty, all known buckets)
//       2. AV19: bucket.file(autoBackupRef).exists()
//       3. Download backup + parse + validate
//       4. Recompute SHA-256 bodyHash + compare with file.meta.bodyHash
//          → 500 BACKUP_INTEGRITY_FAIL if mismatch (wipe ABORTED)
//       5. Optional: compare with request.expectedBodyHash (UI cross-check)
//       6. SCOPE_MISMATCH: file.meta.bucketIds === request.bucketIds (sorted)
//       7. resolveBucketScope → assertNotT1 (defense-in-depth)
//       8. Wipe resolved.collections + resolved.subcollections (where branchId == target)
//       9. Audit doc records bucketIds + bodyHash + deletedCounts

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { BUCKETS, resolveBucketScope, assertNotT1 } from '../../src/lib/branchBackupBuckets.js';
import { computeBodyHash, validateBackupFile, jsonReviverForNonFinite } from '../../src/lib/branchBackupSchema.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const BATCH_LIMIT = 400;

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
function dataCol(db, collection) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(collection);
}
function randHex(n = 8) { return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const { branchId, bucketIds, autoBackupRef, expectedBodyHash } = req.body || {};

  // ─── Request validation ───
  if (!branchId || typeof branchId !== 'string') {
    return res.status(400).json({ ok: false, error: 'MISSING_BRANCH_ID' });
  }
  if (!Array.isArray(bucketIds) || bucketIds.length === 0) {
    return res.status(400).json({ ok: false, error: 'EMPTY_BUCKET_SET' });
  }
  for (const id of bucketIds) {
    if (!BUCKETS[id]) {
      return res.status(400).json({ ok: false, error: `UNKNOWN_BUCKET: ${id}` });
    }
  }
  if (!autoBackupRef || typeof autoBackupRef !== 'string') {
    return res.status(400).json({ ok: false, error: 'AUTO_BACKUP_REQUIRED' });
  }

  try {
    const { db, bucket } = getAdmin();

    // ─── AV19: verify autoBackup file exists in Storage ───
    const [exists] = await bucket.file(autoBackupRef).exists();
    if (!exists) return res.status(400).json({ ok: false, error: 'AUTO_BACKUP_NOT_FOUND', autoBackupRef });

    // ─── Download + parse + validate backup file (BEFORE any wipe) ───
    let file;
    try {
      const [fileBuffer] = await bucket.file(autoBackupRef).download();
      file = JSON.parse(fileBuffer.toString('utf8'), jsonReviverForNonFinite);
    } catch (e) {
      return res.status(400).json({ ok: false, error: 'BACKUP_JSON_PARSE_FAILED', detail: e.message });
    }
    try {
      validateBackupFile(file);
    } catch (e) {
      return res.status(400).json({ ok: false, error: 'BACKUP_SCHEMA_INVALID', detail: e.message });
    }

    // ─── Hash verification (CRITICAL — wipe ABORTS on mismatch) ───
    // Only enforced when file has bodyHash (selective-make-fresh files). Legacy
    // V40 v2 files without bodyHash cannot use selective wipe path (rejected
    // below by SCOPE_MISMATCH since they won't have bucketIds either).
    if (!file.meta.bodyHash) {
      return res.status(400).json({ ok: false, error: 'BACKUP_MISSING_BODY_HASH', detail: 'autoBackup file must be a selective-make-fresh backup with hash' });
    }
    if (!Array.isArray(file.meta.bucketIds) || file.meta.bucketIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'BACKUP_MISSING_BUCKET_IDS' });
    }
    const recomputed = computeBodyHash(file.collections || {});
    if (recomputed !== file.meta.bodyHash) {
      return res.status(500).json({
        ok: false,
        error: 'BACKUP_INTEGRITY_FAIL',
        expected: file.meta.bodyHash,
        actual: recomputed,
      });
    }
    // Optional cross-check against UI-passed expectedBodyHash
    if (expectedBodyHash && expectedBodyHash !== file.meta.bodyHash) {
      return res.status(400).json({
        ok: false,
        error: 'BACKUP_HASH_EXPECTED_MISMATCH',
        expected: expectedBodyHash,
        actual: file.meta.bodyHash,
      });
    }
    // Scope-mismatch: file.meta.bucketIds must equal request.bucketIds (sorted)
    const sortedReq = [...bucketIds].sort();
    const sortedFile = [...file.meta.bucketIds].sort();
    if (JSON.stringify(sortedReq) !== JSON.stringify(sortedFile)) {
      return res.status(400).json({
        ok: false,
        error: 'SCOPE_MISMATCH',
        requestBucketIds: sortedReq,
        fileBucketIds: sortedFile,
      });
    }
    // sourceBranchId must match
    if (file.meta.sourceBranchId !== branchId) {
      return res.status(400).json({
        ok: false,
        error: 'BACKUP_BRANCH_MISMATCH',
        fileBranchId: file.meta.sourceBranchId,
        requestBranchId: branchId,
      });
    }

    // ─── Resolve scope + defense-in-depth T1 check ───
    let wipeCols, wipeSubs;
    try {
      const resolved = resolveBucketScope(bucketIds);
      assertNotT1(resolved.collections);
      wipeCols = resolved.collections;
      wipeSubs = resolved.subcollections;
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }

    // ─── Wipe phase — top-level collections (where branchId == target) ───
    const deletedCounts = {};
    for (const col of wipeCols) {
      const snap = await dataCol(db, col).where('branchId', '==', branchId).get();
      let deleted = 0;
      for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
        const slice = snap.docs.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (const d of slice) batch.delete(d.ref);
        await batch.commit();
        deleted += slice.length;
      }
      deletedCounts[col] = deleted;
    }

    // ─── Wipe phase — per-customer subcollections (V40-prod-fix-2 parallel-batched) ───
    if (wipeSubs.length > 0) {
      const T4_BATCH_SIZE = 50;
      const customersSnap = await dataCol(db, 'be_customers').get();
      const customerDocs = customersSnap.docs;
      let t4Deleted = 0;
      for (let bi = 0; bi < customerDocs.length; bi += T4_BATCH_SIZE) {
        const batchCustomers = customerDocs.slice(bi, bi + T4_BATCH_SIZE);
        const subSnaps = await Promise.all(batchCustomers.flatMap(cust =>
          wipeSubs.map(async sub => {
            const subSnap = await cust.ref.collection(sub).where('branchId', '==', branchId).get();
            return subSnap;
          })
        ));
        for (const subSnap of subSnaps) {
          for (let i = 0; i < subSnap.docs.length; i += BATCH_LIMIT) {
            const slice = subSnap.docs.slice(i, i + BATCH_LIMIT);
            const writeBatch = db.batch();
            for (const d of slice) writeBatch.delete(d.ref);
            await writeBatch.commit();
            t4Deleted += slice.length;
          }
        }
      }
      deletedCounts['be_customers/__per_customer__'] = t4Deleted;
    }

    // ─── Audit doc ───
    const auditId = `branch-make-fresh-${Date.now()}-${randHex()}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      action: 'branch-make-fresh',
      branchId,
      bucketIds: sortedReq,
      autoBackupRef,
      bodyHash: file.meta.bodyHash,
      deletedCounts,
      executedBy: caller.decoded.uid,
      executedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      ok: true,
      deletedCounts,
      autoBackupRef,
      bodyHash: file.meta.bodyHash,
      bucketIds: sortedReq,
      auditId,
    });
  } catch (e) {
    console.error('branch-make-fresh error:', e);
    return res.status(500).json({ ok: false, error: 'MAKE_FRESH_FAILED', detail: e.message });
  }
}
