// ─── /api/admin/branch-backup-export — V40 + 2026-05-14 selective-make-fresh ─
// Generate JSON backup of branch-scoped collections; upload to Firebase
// Storage at backups/{branchId}/{prefix}-{ts}-{rand}.json; return signed URL.
// Audit doc to be_admin_audit. See spec §4.
//
// 2026-05-14 selective-make-fresh — added:
//   - Request `bucketIds: string[]` (optional) → selective scope via
//     resolveBucketScope (T1 protected via assertNotT1)
//   - Request `dryRun: boolean` (optional) → count-only mode; no Storage
//     upload, no audit. Returns per-bucket counts + size estimate.
//   - When bucketIds is non-empty: buildBackupFile embeds SHA-256 bodyHash
//     in meta for integrity verification at branch-make-fresh.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { resolveBackupScope, T4_SUBCOLLECTIONS } from '../../src/lib/branchBackupCore.js';
import { BUCKETS, resolveBucketScope, assertNotT1 } from '../../src/lib/branchBackupBuckets.js';
import { buildBackupFile, jsonReplacerForNonFinite } from '../../src/lib/branchBackupSchema.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

let cachedDb = null;
let cachedBucket = null;
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
  // V40-prod-fix (2026-05-08) — pass BUCKET explicitly. On Vercel, OTHER admin
  // endpoints may have already initialized the firebase-admin app WITHOUT a
  // storageBucket option (they don't use Storage). When this endpoint runs in
  // the same serverless container and hits the `getApps().length > 0` branch,
  // it reuses that app — and `bucket()` no-arg fails with "Bucket name not
  // specified or invalid". Explicit `bucket(BUCKET)` works regardless of app
  // config.
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

  const {
    branchId,
    tiers = [],
    collections = null,
    bucketIds = null,
    dryRun = false,
    isAutoPreFresh = false,
  } = req.body || {};

  if (!branchId || typeof branchId !== 'string') {
    return res.status(400).json({ ok: false, error: 'MISSING_BRANCH_ID' });
  }

  // ─── Scope resolution: bucket mode (selective-make-fresh) OR legacy tiers/collections (V40) ───
  let scope;             // flat list of collection names, may include 'be_customers/__per_customer__'
  let subsToTraverse;    // T4 subcollections list for per-customer iteration
  let usingBucketMode = false;
  let sortedBucketIds = [];

  if (Array.isArray(bucketIds) && bucketIds.length > 0) {
    usingBucketMode = true;
    let resolved;
    try {
      resolved = resolveBucketScope(bucketIds);
      assertNotT1(resolved.collections);
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
    scope = [...resolved.collections];
    subsToTraverse = [...resolved.subcollections];
    if (subsToTraverse.length > 0) {
      scope.push('be_customers/__per_customer__');
    }
    sortedBucketIds = [...bucketIds].sort();
  } else {
    // Legacy V40 path
    try {
      scope = resolveBackupScope({ tiers, collections });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
    subsToTraverse = T4_SUBCOLLECTIONS;
  }

  if (scope.length === 0) {
    return res.status(400).json({ ok: false, error: 'EMPTY_SCOPE' });
  }

  // ─── DRY-RUN path (2026-05-14): count-only, no Storage upload, no audit ───
  if (dryRun === true) {
    try {
      const { db } = getAdmin();
      const perBucket = {};
      let totalDocs = 0;
      let estSizeBytes = 0;

      if (usingBucketMode) {
        // Pre-fetch ALL customers ONCE (avoid N×M reads when multiple buckets have subcollections)
        const customersSnap = await dataCol(db, 'be_customers').get();

        for (const bucketId of bucketIds) {
          const bucketDef = BUCKETS[bucketId];
          let docs = 0;
          let subDocs = 0;
          let sizeBytes = 0;

          for (const col of bucketDef.collections) {
            const snap = await dataCol(db, col).where('branchId', '==', branchId).get();
            docs += snap.size;
            for (const d of snap.docs) sizeBytes += JSON.stringify(d.data()).length;
          }

          if (bucketDef.customerSubcollections.length > 0) {
            const T4_BATCH_SIZE = 50;
            const customerDocs = customersSnap.docs;
            for (let i = 0; i < customerDocs.length; i += T4_BATCH_SIZE) {
              const batch = customerDocs.slice(i, i + T4_BATCH_SIZE);
              const batchResults = await Promise.all(batch.flatMap(cust =>
                bucketDef.customerSubcollections.map(async sub => {
                  const subSnap = await cust.ref.collection(sub).where('branchId', '==', branchId).get();
                  let size = 0;
                  for (const d of subSnap.docs) size += JSON.stringify(d.data()).length;
                  return { count: subSnap.size, size };
                })
              ));
              for (const r of batchResults) {
                subDocs += r.count;
                sizeBytes += r.size;
              }
            }
          }

          perBucket[bucketId] = { docs, subDocs, sizeBytes };
          totalDocs += docs + subDocs;
          estSizeBytes += sizeBytes;
        }
      } else {
        // Legacy mode flat count (no per-bucket breakdown)
        for (const col of scope) {
          if (col === 'be_customers/__per_customer__') continue;
          const snap = await dataCol(db, col).where('branchId', '==', branchId).get();
          totalDocs += snap.size;
          for (const d of snap.docs) estSizeBytes += JSON.stringify(d.data()).length;
        }
      }

      return res.status(200).json({
        ok: true,
        dryRun: true,
        scopeMode: usingBucketMode ? 'buckets' : 'legacy',
        bucketIds: sortedBucketIds,
        perBucket,
        totalDocs,
        estSizeBytes,
      });
    } catch (e) {
      console.error('branch-backup-export dryRun error:', e);
      return res.status(500).json({ ok: false, error: 'DRYRUN_FAILED', detail: e.message });
    }
  }

  // ─── Normal build + upload path ───
  try {
    // V40 review I1 — memory model note: this loop loads ALL branch-scoped docs
    // into an in-memory `out` object; peak heap can reach 2-3× the serialized
    // size for very large branches.
    const { db, bucket } = getAdmin();
    const out = {};

    for (const colName of scope) {
      if (colName === 'be_customers/__per_customer__') {
        // T4 — iterate selected subcollections (NOT full T4_SUBCOLLECTIONS) per customer
        const T4_BATCH_SIZE = 50;
        const customersSnap = await dataCol(db, 'be_customers').get();
        const customerDocs = customersSnap.docs;
        for (let i = 0; i < customerDocs.length; i += T4_BATCH_SIZE) {
          const batch = customerDocs.slice(i, i + T4_BATCH_SIZE);
          const batchResults = await Promise.all(batch.flatMap(cust =>
            subsToTraverse.map(async sub => {
              const subSnap = await cust.ref.collection(sub).where('branchId', '==', branchId).get();
              if (subSnap.empty) return null;
              return {
                key: `be_customers/${cust.id}/${sub}`,
                docs: subSnap.docs.map(d => ({ ...d.data(), id: d.id })),
              };
            })
          ));
          for (const result of batchResults) {
            if (result) out[result.key] = result.docs;
          }
        }
      } else {
        const snap = await dataCol(db, colName).where('branchId', '==', branchId).get();
        out[colName] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      }
    }

    const file = buildBackupFile({
      sourceBranchId: branchId,
      exportedBy: caller.decoded.uid,
      scope: usingBucketMode ? { bucketIds: sortedBucketIds } : { tiers, collections },
      collections: out,
      isAutoPreFresh,
      bucketIds: usingBucketMode ? sortedBucketIds : undefined,  // → triggers bodyHash emission
    });

    // V40-prod-fix-5 (2026-05-08) — encode NaN/Infinity via sentinel.
    const json = JSON.stringify(file, jsonReplacerForNonFinite);
    const sizeBytes = Buffer.byteLength(json, 'utf8');
    if (sizeBytes > 100 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: 'FILE_TOO_LARGE', sizeBytes });
    }

    const ts = Date.now();
    const prefix = isAutoPreFresh ? 'auto-pre-fresh' : 'manual';
    const filename = `${prefix}-${ts}-${randHex()}.json`;
    const storagePath = `backups/${branchId}/${filename}`;
    const storageMeta = {
      branchId,
      sourceBranchId: branchId,
      schemaVersion: '2',
      exportedBy: caller.decoded.uid,
    };
    if (usingBucketMode) {
      storageMeta.bucketIds = JSON.stringify(sortedBucketIds);
      storageMeta.bodyHash = file.meta.bodyHash;
    }
    await bucket.file(storagePath).save(json, {
      contentType: 'application/json',
      metadata: { metadata: storageMeta },
    });

    // V40-prod-fix-4 — force browser download via responseDisposition.
    const downloadName = `loverclinic-backup-${branchId}-${new Date(ts).toISOString().replace(/[:.]/g, '-')}.json`;
    const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000,
      responseDisposition: `attachment; filename="${downloadName}"`,
      responseType: 'application/json',
    });

    const auditId = `branch-backup-${ts}-${randHex()}`;
    const auditDoc = {
      action: 'branch-backup',
      branchId,
      scopeMode: usingBucketMode ? 'buckets' : 'legacy',
      scope: usingBucketMode ? { bucketIds: sortedBucketIds } : { tiers, collections },
      perCollectionCounts: file.meta.perCollectionCounts,
      sizeBytes,
      storagePath,
      isAutoPreFresh,
      exportedBy: caller.decoded.uid,
      exportedAt: new Date().toISOString(),
    };
    if (usingBucketMode) {
      auditDoc.bucketIds = sortedBucketIds;
      auditDoc.bodyHash = file.meta.bodyHash;
    }
    await dataCol(db, 'be_admin_audit').doc(auditId).set(auditDoc);

    return res.status(200).json({
      ok: true,
      signedUrl,
      storagePath,
      auditId,
      sizeBytes,
      scopeMode: usingBucketMode ? 'buckets' : 'legacy',
      bucketIds: usingBucketMode ? sortedBucketIds : [],
      bodyHash: usingBucketMode ? file.meta.bodyHash : null,
      perCollectionCounts: file.meta.perCollectionCounts,
    });
  } catch (e) {
    console.error('branch-backup-export error:', e);
    return res.status(500).json({ ok: false, error: 'EXPORT_FAILED', detail: e.message });
  }
}
