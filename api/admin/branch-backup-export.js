// ─── /api/admin/branch-backup-export — V40 ─────────────────────────────────
// Generate JSON backup of branch-scoped collections; upload to Firebase
// Storage at backups/{branchId}/{prefix}-{ts}-{rand}.json; return signed URL.
// Audit doc to be_admin_audit. See spec §4.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { resolveBackupScope, T4_SUBCOLLECTIONS } from '../../src/lib/branchBackupCore.js';
import { buildBackupFile } from '../../src/lib/branchBackupSchema.js';

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
  cachedBucket = getStorage(app).bucket();
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

  const { branchId, tiers = [], collections = null, isAutoPreFresh = false } = req.body || {};
  if (!branchId || typeof branchId !== 'string') {
    return res.status(400).json({ ok: false, error: 'MISSING_BRANCH_ID' });
  }

  let scope;
  try {
    scope = resolveBackupScope({ tiers, collections });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
  if (scope.length === 0) {
    return res.status(400).json({ ok: false, error: 'EMPTY_SCOPE' });
  }

  try {
    // V40 review I1 — memory model: this loop loads ALL branch-scoped docs into
    // an in-memory `out` object, then JSON.stringify serializes the full file
    // before the 100MB size check below. For very large branches (50k+ T2/T3
    // docs), peak heap can reach 2-3× the serialized size. UI must avoid
    // combining T2+T3 in a single export for high-volume branches; prefer
    // per-tier exports or use the CLI script for one-shot bulk dumps.
    const { db, bucket } = getAdmin();
    const out = {};

    for (const colName of scope) {
      if (colName === 'be_customers/__per_customer__') {
        // T4 — for every customer, query each subcollection filtered by branchId
        const customersSnap = await dataCol(db, 'be_customers').get();
        for (const cust of customersSnap.docs) {
          for (const sub of T4_SUBCOLLECTIONS) {
            const subSnap = await cust.ref.collection(sub).where('branchId', '==', branchId).get();
            if (subSnap.empty) continue;
            const key = `be_customers/${cust.id}/${sub}`;
            out[key] = subSnap.docs.map(d => ({ ...d.data(), id: d.id }));
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
      scope: { tiers, collections },
      collections: out,
      isAutoPreFresh,
    });

    const json = JSON.stringify(file);
    const sizeBytes = Buffer.byteLength(json, 'utf8');
    if (sizeBytes > 100 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: 'FILE_TOO_LARGE', sizeBytes });
    }

    const ts = Date.now();
    const prefix = isAutoPreFresh ? 'auto-pre-fresh' : 'manual';
    const filename = `${prefix}-${ts}-${randHex()}.json`;
    const storagePath = `backups/${branchId}/${filename}`;
    await bucket.file(storagePath).save(json, {
      contentType: 'application/json',
      metadata: { metadata: { branchId, sourceBranchId: branchId, schemaVersion: '1', exportedBy: caller.decoded.uid } },
    });

    const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    const auditId = `branch-backup-${ts}-${randHex()}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      action: 'branch-backup',
      branchId,
      scope: { tiers, collections },
      perCollectionCounts: file.meta.perCollectionCounts,
      sizeBytes,
      storagePath,
      isAutoPreFresh,
      exportedBy: caller.decoded.uid,
      exportedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      ok: true,
      signedUrl,
      storagePath,
      auditId,
      sizeBytes,
      perCollectionCounts: file.meta.perCollectionCounts,
    });
  } catch (e) {
    console.error('branch-backup-export error:', e);
    return res.status(500).json({ ok: false, error: 'EXPORT_FAILED', detail: e.message });
  }
}
