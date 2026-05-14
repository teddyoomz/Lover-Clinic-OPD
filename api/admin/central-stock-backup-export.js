// ─── /api/admin/central-stock-backup-export — 2026-05-15 Task 6 ──────────
// Generate JSON backup of central-stock-scoped collections for one or more
// warehouses. Uploads to Firebase Storage at backups/central/{...}/{...}.json.
// Returns signed URL + audit doc to be_admin_audit.
//
// Mirror of branch-backup-export.js structure with:
//   - scope: warehouseId/locationId instead of branchId
//   - 4-bucket schema from centralStockBuckets.js
//   - assertWarehouseMasterProtected defense-in-depth (be_central_stock_warehouses never wipeable)
//   - Counter doc state capture for restore (PO sequence preserved)
//   - Storage path: backups/central/{warehouseId | all}/{prefix}-{ts}-{rand}.json
//   - Audit doc: action='central-stock-backup', scopeKind='central'
//
// Request body:
//   warehouseIds?: string[]      — selective (one or more warehouses)
//   allWarehouses?: boolean      — bulk-all (lists all from be_central_stock_warehouses)
//   bucketIds: string[]          — REQUIRED non-empty
//   dryRun?: boolean             — count-only mode (no Storage write, no audit doc)
//   isAutoPreFresh?: boolean     — V40 AV19 marker

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { CENTRAL_BUCKETS, resolveCentralBucketScope, assertWarehouseMasterProtected } from '../../src/lib/centralStockBuckets.js';
import { buildBackupFile, jsonReplacerForNonFinite, computeBodyHash } from '../../src/lib/branchBackupSchema.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

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

  const { warehouseIds = null, allWarehouses = false, bucketIds = null, dryRun = false, isAutoPreFresh = false } = req.body || {};

  if (!Array.isArray(bucketIds) || bucketIds.length === 0) {
    return res.status(400).json({ ok: false, error: 'EMPTY_BUCKET_SET' });
  }
  if (!allWarehouses && (!Array.isArray(warehouseIds) || warehouseIds.length === 0)) {
    return res.status(400).json({ ok: false, error: 'MISSING_WAREHOUSE_SCOPE' });
  }

  // Resolve scope + defense-in-depth warehouse master check
  let resolved;
  try {
    resolved = resolveCentralBucketScope(bucketIds);
    assertWarehouseMasterProtected(resolved.collections);
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }

  try {
    const { db, bucket } = getAdmin();

    // Resolve scopeWarehouseIds — when allWarehouses=true, list all warehouses
    let scopeWarehouseIds = Array.isArray(warehouseIds) ? [...warehouseIds] : [];
    if (allWarehouses) {
      const snap = await dataCol(db, 'be_central_stock_warehouses').get();
      scopeWarehouseIds = snap.docs.map(d => d.id);
    }

    // ─── DRY-RUN path: count-only, no Storage write ───
    if (dryRun === true) {
      const perBucket = {};
      let totalDocs = 0;
      let estSizeBytes = 0;
      for (const bucketId of bucketIds) {
        const bucketDef = CENTRAL_BUCKETS[bucketId];
        let docs = 0, sizeBytes = 0;
        for (const wid of scopeWarehouseIds) {
          for (const spec of bucketDef.collections) {
            const primarySnap = await dataCol(db, spec.name).where(spec.filterField, '==', wid).get();
            docs += primarySnap.size;
            for (const d of primarySnap.docs) sizeBytes += JSON.stringify(d.data()).length;
            if (spec.orFilterField) {
              const orSnap = await dataCol(db, spec.name).where(spec.orFilterField, '==', wid).get();
              const primaryIds = new Set(primarySnap.docs.map(d => d.id));
              for (const d of orSnap.docs) {
                if (!primaryIds.has(d.id)) {
                  docs += 1;
                  sizeBytes += JSON.stringify(d.data()).length;
                }
              }
            }
          }
        }
        perBucket[bucketId] = { docs, sizeBytes };
        totalDocs += docs;
        estSizeBytes += sizeBytes;
      }
      return res.status(200).json({
        ok: true,
        dryRun: true,
        scopeKind: 'central',
        warehouseIds: [...scopeWarehouseIds].sort(),
        bucketIds: [...bucketIds].sort(),
        perBucket,
        totalDocs,
        estSizeBytes,
      });
    }

    // ─── Normal build + upload path ───
    const out = {};
    for (const bucketId of bucketIds) {
      const bucketDef = CENTRAL_BUCKETS[bucketId];
      for (const wid of scopeWarehouseIds) {
        for (const spec of bucketDef.collections) {
          const key = `${spec.name}/${wid}`;
          const seen = new Set();
          const collected = [];
          const primarySnap = await dataCol(db, spec.name).where(spec.filterField, '==', wid).get();
          for (const d of primarySnap.docs) {
            seen.add(d.id);
            collected.push({ ...d.data(), id: d.id });
          }
          if (spec.orFilterField) {
            const orSnap = await dataCol(db, spec.name).where(spec.orFilterField, '==', wid).get();
            for (const d of orSnap.docs) {
              if (!seen.has(d.id)) {
                seen.add(d.id);
                collected.push({ ...d.data(), id: d.id });
              }
            }
          }
          if (collected.length > 0) out[key] = collected;
        }
      }
      // Capture counter doc state per bucket (for restore)
      for (const cdName of bucketDef.counterDocs) {
        const cdSnap = await dataCol(db, cdName).doc('counter').get();
        if (cdSnap.exists) {
          out[`${cdName}/counter`] = [{ id: 'counter', ...cdSnap.data() }];
        }
      }
    }

    const file = buildBackupFile({
      sourceBranchId: scopeWarehouseIds.join(',') || 'all',  // reuse field; central uses meta.warehouseIds below
      exportedBy: caller.decoded.uid,
      scope: { scopeKind: 'central', warehouseIds: [...scopeWarehouseIds].sort(), bucketIds: [...bucketIds].sort() },
      collections: out,
      isAutoPreFresh,
      bucketIds,  // emits meta.bodyHash + meta.bucketIds
    });
    // Inject scopeKind + warehouseIds into meta (bodyHash already computed over file.collections)
    file.meta.scopeKind = 'central';
    file.meta.warehouseIds = [...scopeWarehouseIds].sort();

    const json = JSON.stringify(file, jsonReplacerForNonFinite);
    const sizeBytes = Buffer.byteLength(json, 'utf8');
    if (sizeBytes > 100 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: 'FILE_TOO_LARGE', sizeBytes });
    }

    const ts = Date.now();
    const folder = allWarehouses ? 'all' : (scopeWarehouseIds.length === 1 ? scopeWarehouseIds[0] : scopeWarehouseIds.join('+'));
    const filename = `${isAutoPreFresh ? 'auto-pre-fresh' : 'manual'}-${ts}-${randHex()}.json`;
    const storagePath = `backups/central/${folder}/${filename}`;
    await bucket.file(storagePath).save(json, {
      contentType: 'application/json',
      metadata: {
        metadata: {
          scopeKind: 'central',
          warehouseIds: JSON.stringify([...scopeWarehouseIds].sort()),
          bucketIds: JSON.stringify([...bucketIds].sort()),
          schemaVersion: '2',
          exportedBy: caller.decoded.uid,
          bodyHash: file.meta.bodyHash,
        },
      },
    });

    const downloadName = `loverclinic-central-${folder}-${new Date(ts).toISOString().replace(/[:.]/g, '-')}.json`;
    const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000,
      responseDisposition: `attachment; filename="${downloadName}"`,
      responseType: 'application/json',
    });

    const auditId = `central-stock-backup-${ts}-${randHex()}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      action: 'central-stock-backup',
      scopeKind: 'central',
      warehouseIds: [...scopeWarehouseIds].sort(),
      bucketIds: [...bucketIds].sort(),
      perCollectionCounts: file.meta.perCollectionCounts,
      sizeBytes,
      storagePath,
      isAutoPreFresh,
      bodyHash: file.meta.bodyHash,
      exportedBy: caller.decoded.uid,
      exportedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      ok: true,
      scopeKind: 'central',
      warehouseIds: [...scopeWarehouseIds].sort(),
      bucketIds: [...bucketIds].sort(),
      signedUrl,
      storagePath,
      auditId,
      sizeBytes,
      bodyHash: file.meta.bodyHash,
      perCollectionCounts: file.meta.perCollectionCounts,
    });
  } catch (e) {
    console.error('central-stock-backup-export error:', e);
    return res.status(500).json({ ok: false, error: 'EXPORT_FAILED', detail: e.message });
  }
}
