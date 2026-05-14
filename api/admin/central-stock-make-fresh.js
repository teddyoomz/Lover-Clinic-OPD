// ─── /api/admin/central-stock-make-fresh — 2026-05-15 Task 7 ★ ────────────
// Wipes selected central-stock-scoped data for one or more warehouses.
// REQUIRES bucketIds[] + warehouseIds[] (or allWarehouses:true) +
// autoBackupRef + hash verify BEFORE any wipe (★ CRITICAL).
//
// Mirror of branch-make-fresh.js structure with:
//   - scope: warehouseId/locationId instead of branchId
//   - assertWarehouseMasterProtected defense-in-depth
//   - WAREHOUSE_MISMATCH check (in addition to SCOPE_MISMATCH)
//   - Counter doc batch.delete after wipe (PO sequence resets to 0)
//
// Pre-wipe sequence (ALL must pass before any delete):
//   1. Validate bucketIds non-empty + all known + warehouseIds OR allWarehouses
//   2. AV19: bucket.file(autoBackupRef).exists()
//   3. Download + parse + validateBackupFile
//   4. Require file.meta.bodyHash + meta.bucketIds + meta.scopeKind='central'
//   5. Recompute computeBodyHash(file.collections) + compare with file.meta.bodyHash
//      → 500 BACKUP_INTEGRITY_FAIL if mismatch (wipe ABORTED)
//   6. expectedBodyHash cross-check → 400 BACKUP_HASH_EXPECTED_MISMATCH
//   7. SCOPE_MISMATCH: sorted bucketIds match
//   8. WAREHOUSE_MISMATCH: sorted warehouseIds match
//   9. resolveCentralBucketScope → assertWarehouseMasterProtected
//  10. Wipe per warehouseId × per spec (filterField + orFilterField dedup)
//  11. Reset counter docs (batch.delete)
//  12. Audit doc + return

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { CENTRAL_BUCKETS, resolveCentralBucketScope, assertWarehouseMasterProtected } from '../../src/lib/centralStockBuckets.js';
import { computeBodyHash, validateBackupFile, jsonReviverForNonFinite } from '../../src/lib/branchBackupSchema.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const BATCH_LIMIT = 400;

let cachedDb = null, cachedBucket = null;
function getAdmin() {
  if (cachedDb && cachedBucket) return { db: cachedDb, bucket: cachedBucket };
  let app;
  if (getApps().length > 0) {
    app = getApp();
  } else {
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

  const { warehouseIds, allWarehouses = false, bucketIds, autoBackupRef, expectedBodyHash } = req.body || {};

  // ─── Request validation ───
  if (!Array.isArray(bucketIds) || bucketIds.length === 0) {
    return res.status(400).json({ ok: false, error: 'EMPTY_BUCKET_SET' });
  }
  for (const id of bucketIds) {
    if (!CENTRAL_BUCKETS[id]) return res.status(400).json({ ok: false, error: `UNKNOWN_BUCKET: ${id}` });
  }
  if (!allWarehouses && (!Array.isArray(warehouseIds) || warehouseIds.length === 0)) {
    return res.status(400).json({ ok: false, error: 'MISSING_WAREHOUSE_SCOPE' });
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

    // ─── Scope verification ───
    if (file.meta.scopeKind !== 'central') {
      return res.status(400).json({ ok: false, error: 'BACKUP_SCOPE_KIND_MISMATCH', expected: 'central', actual: file.meta.scopeKind });
    }
    if (!file.meta.bodyHash) {
      return res.status(400).json({ ok: false, error: 'BACKUP_MISSING_BODY_HASH' });
    }
    if (!Array.isArray(file.meta.bucketIds) || file.meta.bucketIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'BACKUP_MISSING_BUCKET_IDS' });
    }
    if (!Array.isArray(file.meta.warehouseIds)) {
      return res.status(400).json({ ok: false, error: 'BACKUP_MISSING_WAREHOUSE_IDS' });
    }

    // ─── Hash verification (CRITICAL — wipe ABORTS on mismatch) ───
    const recomputed = computeBodyHash(file.collections || {});
    if (recomputed !== file.meta.bodyHash) {
      return res.status(500).json({
        ok: false,
        error: 'BACKUP_INTEGRITY_FAIL',
        expected: file.meta.bodyHash,
        actual: recomputed,
      });
    }
    if (expectedBodyHash && expectedBodyHash !== file.meta.bodyHash) {
      return res.status(400).json({
        ok: false,
        error: 'BACKUP_HASH_EXPECTED_MISMATCH',
        expected: expectedBodyHash,
        actual: file.meta.bodyHash,
      });
    }

    // SCOPE_MISMATCH check
    const sortedReqBuckets = [...bucketIds].sort();
    const sortedFileBuckets = [...file.meta.bucketIds].sort();
    if (JSON.stringify(sortedReqBuckets) !== JSON.stringify(sortedFileBuckets)) {
      return res.status(400).json({
        ok: false,
        error: 'SCOPE_MISMATCH',
        requestBucketIds: sortedReqBuckets,
        fileBucketIds: sortedFileBuckets,
      });
    }

    // Resolve warehouseIds (when allWarehouses=true, list all)
    let resolvedWarehouseIds = Array.isArray(warehouseIds) ? [...warehouseIds] : [];
    if (allWarehouses) {
      const whSnap = await dataCol(db, 'be_central_stock_warehouses').get();
      resolvedWarehouseIds = whSnap.docs.map(d => d.id);
    }

    // WAREHOUSE_MISMATCH check
    const sortedReqWh = [...resolvedWarehouseIds].sort();
    const sortedFileWh = [...file.meta.warehouseIds].sort();
    if (JSON.stringify(sortedReqWh) !== JSON.stringify(sortedFileWh)) {
      return res.status(400).json({
        ok: false,
        error: 'WAREHOUSE_MISMATCH',
        requestWarehouseIds: sortedReqWh,
        fileWarehouseIds: sortedFileWh,
      });
    }

    // ─── Resolve scope + defense-in-depth warehouse master check ───
    let resolved;
    try {
      resolved = resolveCentralBucketScope(bucketIds);
      assertWarehouseMasterProtected(resolved.collections);
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }

    // ─── Wipe phase (only reached after ALL pre-checks pass) ───
    const deletedCounts = {};
    for (const wid of resolvedWarehouseIds) {
      for (const spec of resolved.collections) {
        // Primary filter
        const primarySnap = await dataCol(db, spec.name).where(spec.filterField, '==', wid).get();
        const seen = new Set(primarySnap.docs.map(d => d.id));
        const allDocs = [...primarySnap.docs];
        // orFilterField (e.g. transfers dest=warehouseId)
        if (spec.orFilterField) {
          const orSnap = await dataCol(db, spec.name).where(spec.orFilterField, '==', wid).get();
          for (const d of orSnap.docs) {
            if (!seen.has(d.id)) {
              seen.add(d.id);
              allDocs.push(d);
            }
          }
        }
        let deleted = 0;
        for (let i = 0; i < allDocs.length; i += BATCH_LIMIT) {
          const slice = allDocs.slice(i, i + BATCH_LIMIT);
          const batch = db.batch();
          for (const d of slice) batch.delete(d.ref);
          await batch.commit();
          deleted += slice.length;
        }
        const key = `${spec.name}/${wid}`;
        deletedCounts[key] = (deletedCounts[key] || 0) + deleted;
      }
    }

    // ─── Counter doc reset (batch.delete — re-init to 0 at next PO creation) ───
    let countersDeleted = 0;
    for (const cdName of resolved.counterDocs) {
      const ref = dataCol(db, cdName).doc('counter');
      const snap = await ref.get();
      if (snap.exists) {
        await ref.delete();
        countersDeleted += 1;
      }
    }
    if (countersDeleted > 0) deletedCounts['__counters__'] = countersDeleted;

    // ─── Audit doc ───
    const auditId = `central-stock-make-fresh-${Date.now()}-${randHex()}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      action: 'central-stock-make-fresh',
      scopeKind: 'central',
      warehouseIds: sortedReqWh,
      bucketIds: sortedReqBuckets,
      autoBackupRef,
      bodyHash: file.meta.bodyHash,
      deletedCounts,
      executedBy: caller.decoded.uid,
      executedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      ok: true,
      scopeKind: 'central',
      deletedCounts,
      autoBackupRef,
      bodyHash: file.meta.bodyHash,
      bucketIds: sortedReqBuckets,
      warehouseIds: sortedReqWh,
      auditId,
    });
  } catch (e) {
    console.error('central-stock-make-fresh error:', e);
    return res.status(500).json({ ok: false, error: 'MAKE_FRESH_FAILED', detail: e.message });
  }
}
