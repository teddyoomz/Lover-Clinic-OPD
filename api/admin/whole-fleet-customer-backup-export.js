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
// V77-fix3 (P2-2): use jsonReplacerForNonFinite for manifest too — mirrors
// per-customer file serialization. Defensive against NaN/Infinity slipping
// into totals (shouldn't but if it does, sentinel-encoded round-trip works).

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

function randHex(n = 16) {
  // V77-fix2 (P2-4): bumped default 8 → 16 hex chars (32 → 64 bits entropy).
  // Prevents path collision when N customers share Date.now() ms within one
  // call. With 8 chars, 6500 customers had ~1/600 collision chance per call.
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
    collections[name] = collectionQueries[idx].docs.map((d) => ({ ...d.data(), id: d.id }));
  });

  // Enumerate 8 customer-attached subcollections (parallel)
  const subQueries = await Promise.all(
    T4_SUBCOLLECTIONS.map((sub) => customerSubcollection(db, customerId, sub).get())
  );
  const subcollections = {};
  T4_SUBCOLLECTIONS.forEach((sub, idx) => {
    subcollections[sub] = subQueries[idx].docs.map((d) => ({ ...d.data(), id: d.id }));
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
  // V77-fix3 (P1-9): cap branchIdFilter length to 64 chars (Firestore docId
  // max is 1500B; real branchIds are ~20 chars). Prevents audit-doc-size
  // blowup from a tampered/garbage filter.
  const branchIdFilter = String(req.body?.branchId || '').trim().slice(0, 64);
  // V77-fix3 (P1-10): strict numeric validation for maxCustomers. Pre-fix
  // Number("abc") → NaN → || 0 → silently runs entire fleet instead of
  // refusing. Now rejects non-numeric strings with explicit 400.
  let maxCustomers = 0;
  const rawMaxN = req.body?.maxCustomers;
  if (rawMaxN !== undefined && rawMaxN !== null && rawMaxN !== '') {
    const n = Number(rawMaxN);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_MAX_CUSTOMERS',
        detail: { received: rawMaxN, expected: 'positive integer 1-10000' },
      });
    }
    maxCustomers = Math.min(Math.floor(n), 10000);
  }

  try {
    const { db, bucket } = getAdmin();

    // 1. Enumerate target customers (optionally branch-filtered)
    let custQuery = dataCol(db, 'be_customers');
    if (branchIdFilter) {
      custQuery = custQuery.where('branchId', '==', branchIdFilter);
    }
    const allCustomersSnap = await custQuery.get();
    // V77-fix2 (2026-05-16 NIGHT — P1-1 V38 spread-order regression).
    // {...d.data(), id: d.id} ensures docId always wins; legacy customers with
    // stray `id` data fields (per V38 baseline-migration cohort) no longer
    // poison customer.id → cascade query uses correct customerId.
    const customerList = allCustomersSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const totalCustomers = customerList.length;
    const scoped = maxCustomers > 0 ? customerList.slice(0, maxCustomers) : customerList;

    // V77-fix2 (P0-8): refuse runaway iterations. Sequential for-loop × N
    // customers easily exceeds 300s maxDuration for N>30. Endpoint enforces
    // 50-customer cap unless caller passes force:true (CLI bypass). For
    // >50-customer clinics, CLI mirror has no timeout.
    const FORCE = req.body?.force === true;
    const ENDPOINT_CUSTOMER_CAP = 50;
    if (!FORCE && scoped.length > ENDPOINT_CUSTOMER_CAP) {
      return res.status(413).json({
        ok: false,
        error: 'WHOLE_FLEET_TOO_LARGE_FOR_ENDPOINT',
        detail: {
          scanned: scoped.length,
          cap: ENDPOINT_CUSTOMER_CAP,
          hint:
            `กรุณาใช้ CLI สำหรับ ${scoped.length} ลูกค้า: ` +
            `node scripts/customer-backup-export.mjs --all-customers --apply ` +
            `(no timeout). หรือใส่ maxCustomers ≤ ${ENDPOINT_CUSTOMER_CAP} ` +
            `เพื่อทดสอบบางส่วนผ่าน endpoint.`,
        },
        durationMs: Date.now() - start,
      });
    }

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
    // V77-fix2: spread-order V38 lesson (docId wins over stray data.id)
    const chatSnap = await dataCol(db, 'chat_conversations').get();
    const allChatConversations = chatSnap.docs.map((d) => ({ ...d.data(), id: d.id }));

    // 3. Per-customer export with failure isolation
    // V77-fix3 (P1-4): exporterLabel previously could be `()` when both
    // email + uid empty. Now use filter+join → 'unknown-admin' fallback.
    const exporterLabel =
      [caller.email, caller.uid].filter(Boolean).join(' / ') || 'unknown-admin';
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
        // V77-fix3 (P1-3): preserve structured error context (code + name +
        // first stack line) so admin can differentiate transient (retryable
        // network/quota) from permanent (schema/permission). Generic bare
        // message string was insufficient for triage.
        failedCustomers.push({
          cid: customerId,
          reason: err?.message || 'EXPORT_FAILED',
          code: err?.code || '',
          type: err?.name || 'Error',
          stack: err?.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ').slice(0, 400) : '',
        });
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
    const rand = randHex(); // V77-fix2 default 16 chars
    const manifestPath = `backups/whole-fleet-customers/${ts}-${rand}/manifest.json`;
    // V77-fix3 (P2-2): consistent sentinel-encoded NaN/Infinity serialization
    const manifestBytes = Buffer.from(
      JSON.stringify(manifest, jsonReplacerForNonFinite, 2),
      'utf8'
    );
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
