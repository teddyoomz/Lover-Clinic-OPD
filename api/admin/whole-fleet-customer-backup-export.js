// api/admin/whole-fleet-customer-backup-export.js
// V77 (2026-05-16 EOD+1) — Whole-fleet customer backup export.
//
// Mirrors customer-backup-export.js single-customer flow + iterates ALL
// customers (optionally filtered by branchId). Per-customer failure
// isolation: one customer's BLOCK / SCHEMA_INVALID / STORAGE_INTEGRITY_FAIL
// does NOT abort the batch — aggregated into `failedCustomers[]` array.
//
// Returns whole-fleet manifest.json at backups/whole-fleet-customers/{ts-rand}/
// + signed URL for manifest download + per-customer summary.
//
// AV56 invariant: manifestHash via shared computeWholeFleetManifestHash;
// userNote EXCLUDED (Q5b=Y); fileHash/storageManifestHash linkage to V74
// per-customer files.
//
// Timeout warning: 6500-customer clinics may exceed Vercel maxDuration.
// vercel.json bumps function timeout to 300s for this endpoint. ENORMOUS
// clinics should use the CLI mirror (scripts/customer-backup-export.mjs
// --all-customers --apply) which has no timeout.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import {
  CUSTOMER_CASCADE_COLLECTIONS_FULL,
  T4_SUBCOLLECTIONS,
  matchCustomerChatPredicate,
} from '../../src/lib/customerBackupCore.js';
import { buildCustomerBackupFile } from '../../src/lib/customerBackupSchema.js';
import { jsonReplacerForNonFinite } from '../../src/lib/branchBackupSchema.js';
import {
  buildWholeFleetManifest,
  computeWholeFleetManifestHash,
} from '../../src/lib/wholeFleetBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const STORAGE_PREFIX_CUSTOMER = 'be_customers';

let cachedDb = null;
let cachedBucket = null;
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
  return db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('public')
    .doc('data')
    .collection(name);
}

function customerSubcollection(db, customerId, subName) {
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

// ─── Per-customer export (factored from customer-backup-export.js) ────────
async function exportSingleCustomer({ db, bucket, customer, customerId, exporterLabel, userNote, allChatConversations }) {
  const customerHN = String(customer.hn_no || customerId);
  const customerName = [customer.prefix, customer.firstname, customer.lastname]
    .filter(Boolean)
    .join(' ')
    .trim() || customerId;

  // Enumerate 16 cascade collections (parallel)
  const collectionQueries = await Promise.all(
    CUSTOMER_CASCADE_COLLECTIONS_FULL.map((name) =>
      dataCol(db, name).where('customerId', '==', customerId).get()
    )
  );
  const collections = { be_customers: [customer] };
  CUSTOMER_CASCADE_COLLECTIONS_FULL.forEach((name, idx) => {
    collections[name] = collectionQueries[idx].docs.map((d) => ({ id: d.id, ...d.data() }));
  });

  // Enumerate 8 customer-attached subcollections (parallel)
  const subQueries = await Promise.all(
    T4_SUBCOLLECTIONS.map((sub) => customerSubcollection(db, customerId, sub).get())
  );
  const subcollections = {};
  T4_SUBCOLLECTIONS.forEach((sub, idx) => {
    subcollections[sub] = subQueries[idx].docs.map((d) => ({ id: d.id, ...d.data() }));
  });

  // Match chat conversations from pre-fetched all-chats array (avoid N+1 fetches)
  const chatConversations = allChatConversations.filter((c) =>
    matchCustomerChatPredicate(c, customer)
  );

  // Enumerate Storage objects + per-object SHA-256
  const storagePrefix = `${STORAGE_PREFIX_CUSTOMER}/${customerId}/`;
  const [files] = await bucket.getFiles({ prefix: storagePrefix });
  const storageManifest = await Promise.all(
    files.map(async (file) => {
      const [buf] = await file.download();
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const [meta] = await file.getMetadata();
      return {
        path: file.name,
        size: Number(meta.size || buf.length),
        sha256,
        contentType: meta.contentType || 'application/octet-stream',
      };
    })
  );

  const backupFile = buildCustomerBackupFile({
    customerId,
    customerHN,
    customerName,
    exportedBy: exporterLabel,
    collections,
    subcollections,
    chatConversations,
    storageManifest,
    userNote,
  });

  const ts = Date.now();
  const rand = randHex(8);
  const backupPathPrefix = `backups/customers/${customerId}/${ts}-${rand}`;
  const backupJsonPath = `${backupPathPrefix}/backup.json`;
  const backupJsonBytes = Buffer.from(
    JSON.stringify(backupFile, jsonReplacerForNonFinite, 2),
    'utf8'
  );

  await bucket.file(backupJsonPath).save(backupJsonBytes, {
    metadata: { contentType: 'application/json' },
    resumable: false,
  });

  // Copy Storage objects (parallel)
  await Promise.all(
    files.map(async (file) => {
      const destPath = `${backupPathPrefix}/storage/${file.name}`;
      await file.copy(bucket.file(destPath));
    })
  );

  return {
    customerId,
    customerHN,
    customerName,
    backupRef: backupJsonPath,
    sizeBytes: backupJsonBytes.length,
    bodyHash: backupFile.meta.bodyHash,
    storageManifestHash: backupFile.meta.storageManifestHash,
    perCollectionCounts: backupFile.meta.perCollectionCounts,
    subcollectionCounts: backupFile.meta.subcollectionCounts,
    chatConversationCount: backupFile.meta.chatConversationCount,
    storageObjectCount: storageManifest.length,
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
  const userNote = String(req.body?.userNote || '').slice(0, 200);
  const branchIdFilter = String(req.body?.branchId || '').trim();
  // Optional limit (admin can preview with small subset before full run)
  const maxCustomers = Math.min(
    Number(req.body?.maxCustomers) || 0,
    10000
  );

  try {
    const { db, bucket } = getAdmin();

    // 1. Enumerate target customers (optionally branch-filtered)
    let custQuery = dataCol(db, 'be_customers');
    if (branchIdFilter) {
      custQuery = custQuery.where('branchId', '==', branchIdFilter);
    }
    const allCustomersSnap = await custQuery.get();
    const customerList = allCustomersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const totalCustomers = customerList.length;
    const scoped = maxCustomers > 0 ? customerList.slice(0, maxCustomers) : customerList;

    if (scoped.length === 0) {
      return res.status(200).json({
        ok: true,
        action: 'whole-fleet-backup',
        totalCustomers: 0,
        customers: [],
        failedCustomers: [],
        durationMs: Date.now() - start,
        warning: 'NO_CUSTOMERS_FOUND',
      });
    }

    // 2. Pre-fetch ALL chat_conversations ONCE (avoid N+1 per customer)
    const chatSnap = await dataCol(db, 'chat_conversations').get();
    const allChatConversations = chatSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 3. Per-customer export with failure isolation
    const exporterLabel = `${caller.email || ''} (${caller.uid || ''})`.trim();
    const customerSummaries = [];
    const failedCustomers = [];

    for (const customer of scoped) {
      const customerId = customer.id;
      try {
        const summary = await exportSingleCustomer({
          db,
          bucket,
          customer,
          customerId,
          exporterLabel,
          userNote,
          allChatConversations,
        });
        customerSummaries.push({
          cid: summary.customerId,
          hn: summary.customerHN,
          displayName: summary.customerName,
          fileEntry: summary.backupRef,
          fileHash: summary.bodyHash || '',
          storageManifestHash: summary.storageManifestHash || '',
          totals: {
            appointmentCount: summary.perCollectionCounts?.be_appointments || 0,
            saleCount: summary.perCollectionCounts?.be_sales || 0,
            treatmentCount: summary.perCollectionCounts?.be_treatments || 0,
          },
          exportedAt: new Date().toISOString(),
        });
      } catch (err) {
        failedCustomers.push({ cid: customerId, reason: err?.message || 'EXPORT_FAILED' });
      }
    }

    // 4. Build manifest + computeWholeFleetManifestHash (AV56)
    const manifest = buildWholeFleetManifest({
      customers: customerSummaries,
      failedCustomers,
      userNote,
      exportedAt: new Date().toISOString(),
      exporterUid: caller.uid || '',
    });
    const manifestHash = computeWholeFleetManifestHash(manifest);
    manifest.manifestHash = manifestHash;

    // 5. Write manifest.json + signed URL
    const ts = Date.now();
    const rand = randHex(8);
    const manifestPath = `backups/whole-fleet-customers/${ts}-${rand}/manifest.json`;
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    await bucket.file(manifestPath).save(manifestBytes, {
      metadata: { contentType: 'application/json' },
      resumable: false,
    });
    const [signedUrl] = await bucket.file(manifestPath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    // 6. Audit doc
    const auditId = `whole-fleet-backup-export-${ts}-${rand}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      type: 'whole-fleet-backup-export',
      manifestRef: manifestPath,
      manifestHash,
      branchIdFilter: branchIdFilter || null,
      customerCount: customerSummaries.length,
      failedCount: failedCustomers.length,
      totalScanned: scoped.length,
      sizeBytes: manifestBytes.length,
      durationMs: Date.now() - start,
      exportedBy: { uid: caller.uid || '', email: caller.email || '' },
      exportedAt: new Date().toISOString(),
      userNote,
    });

    return res.status(200).json({
      ok: true,
      action: 'whole-fleet-backup',
      manifestRef: manifestPath,
      manifestHash,
      downloadUrl: signedUrl,
      totalCustomers,
      scanned: scoped.length,
      successful: customerSummaries.length,
      failed: failedCustomers.length,
      failedCustomers,
      branchIdFilter: branchIdFilter || null,
      auditDocId: auditId,
      sizeBytes: manifestBytes.length,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'WHOLE_FLEET_BACKUP_FAILED',
      durationMs: Date.now() - start,
    });
  }
}
