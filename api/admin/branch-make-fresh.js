// ─── /api/admin/branch-make-fresh — V40 ────────────────────────────────────
// Wipes all branch-scoped data for a target branch. REQUIRES autoBackupRef
// in Storage to exist as pre-condition (caller must call /branch-backup-export
// with isAutoPreFresh=true first). See spec §6.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { TIER_MAP, BACKUP_TIER_T1, BACKUP_TIER_T2, BACKUP_TIER_T3, BACKUP_TIER_T4, T4_SUBCOLLECTIONS } from '../../src/lib/branchBackupCore.js';

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
  // V40-prod-fix (2026-05-08) — pass BUCKET explicitly (mirror branch-backup-export
  // fix). Reused-app via getApps().length > 0 may lack storageBucket → bucket()
  // no-arg throws "Bucket name not specified or invalid".
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

  const { branchId, autoBackupRef } = req.body || {};
  if (!branchId) return res.status(400).json({ ok: false, error: 'MISSING_BRANCH_ID' });
  if (!autoBackupRef || typeof autoBackupRef !== 'string') {
    return res.status(400).json({ ok: false, error: 'AUTO_BACKUP_REQUIRED' });
  }

  try {
    const { db, bucket } = getAdmin();
    const [exists] = await bucket.file(autoBackupRef).exists();
    if (!exists) return res.status(400).json({ ok: false, error: 'AUTO_BACKUP_NOT_FOUND', autoBackupRef });

    const wipeList = [
      ...TIER_MAP[BACKUP_TIER_T1],
      ...TIER_MAP[BACKUP_TIER_T2],
      ...TIER_MAP[BACKUP_TIER_T3],
    ];
    const deletedCounts = {};

    for (const col of wipeList) {
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

    // V40 review I3 — scaling note: this loop reads ALL be_customers docs
    // (universal collection, not branch-scoped) regardless of which branches
    // they actually transacted at. For 5k+ customer install, the read +
    // subcollection scan can approach Vercel's 60s function timeout. UI MUST
    // warn the admin before triggering make-fresh on a large customer base.
    // Future: maintain be_customer_branch_index/{branchId} → [customerId] for
    // O(branch-customer-count) wipes instead of O(total-customer-count).
    //
    // V40-prod-fix-2 (2026-05-08) — parallel-batched READ of subcollection
    // snapshots (mirrors branch-backup-export). Read 50 customers × 8 subs
    // concurrently → ~5s for 375 customers. DELETE batches stay sequential
    // because each is a writeBatch.commit() that needs to land before the
    // next BATCH_LIMIT slice (Firestore limit 500 ops/batch).
    const T4_BATCH_SIZE = 50;
    const customersSnap = await dataCol(db, 'be_customers').get();
    const customerDocs = customersSnap.docs;
    let t4Deleted = 0;
    for (let bi = 0; bi < customerDocs.length; bi += T4_BATCH_SIZE) {
      const batch = customerDocs.slice(bi, bi + T4_BATCH_SIZE);
      const subSnaps = await Promise.all(batch.flatMap(cust =>
        T4_SUBCOLLECTIONS.map(async sub => {
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

    const auditId = `branch-make-fresh-${Date.now()}-${randHex()}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      action: 'branch-make-fresh',
      branchId,
      autoBackupRef,
      deletedCounts,
      executedBy: caller.decoded.uid,
      executedAt: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, deletedCounts, autoBackupRef, auditId });
  } catch (e) {
    console.error('branch-make-fresh error:', e);
    return res.status(500).json({ ok: false, error: 'MAKE_FRESH_FAILED', detail: e.message });
  }
}
