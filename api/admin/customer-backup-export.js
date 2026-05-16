// api/admin/customer-backup-export.js
// V74 — Per-customer global backup export. Admin-only (verifyAdminToken).
// Writes backup.json + Storage tree to gs://.../backups/customers/{customerId}/{ts-rand}/
// Returns signed URL + integrity hashes.
//
// Flow:
//   1. Auth gate (admin claim required)
//   2. Read customer doc
//   3. Enumerate 16 cascade collections in parallel (where customerId == X)
//   4. Enumerate 8 customer-attached subcollections in parallel
//   5. Match chat_conversations via matchCustomerChatPredicate
//   6. List Storage objects under be_customers/{customerId}/ + compute per-object SHA-256
//   7. Compose backup file via buildCustomerBackupFile
//   8. Write backup.json to Storage
//   9. Copy Storage objects to backup tree under /storage/
//  10. Generate 24h signed URL + write audit doc
//
// Spec § 4.1

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

function customerSubcollection(db, customerId, subName) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data')
    .collection('be_customers').doc(customerId).collection(subName);
}

function randHex(n = 12) {
  return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const customerId = String(req.body?.customerId || '').trim();
  const userNote = String(req.body?.userNote || '').slice(0, 200);
  if (!customerId) {
    return res.status(400).json({ ok: false, error: 'MISSING_CUSTOMER_ID', field: 'customerId' });
  }

  try {
    const { db, bucket } = getAdmin();

    // 1. Read customer doc
    const custSnap = await dataCol(db, 'be_customers').doc(customerId).get();
    if (!custSnap.exists) {
      return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });
    }
    const customer = { id: custSnap.id, ...custSnap.data() };
    const customerHN = String(customer.hn_no || customerId);
    const customerName = [customer.prefix, customer.firstname, customer.lastname]
      .filter(Boolean).join(' ').trim() || customerId;

    // 2. Enumerate 16 cascade collections (parallel)
    const collectionQueries = await Promise.all(
      CUSTOMER_CASCADE_COLLECTIONS_FULL.map(name =>
        dataCol(db, name).where('customerId', '==', customerId).get()
      )
    );
    const collections = { be_customers: [customer] };
    CUSTOMER_CASCADE_COLLECTIONS_FULL.forEach((name, idx) => {
      collections[name] = collectionQueries[idx].docs.map(d => ({ id: d.id, ...d.data() }));
    });

    // 3. Enumerate 8 customer-attached subcollections (parallel)
    const subQueries = await Promise.all(
      T4_SUBCOLLECTIONS.map(sub => customerSubcollection(db, customerId, sub).get())
    );
    const subcollections = {};
    T4_SUBCOLLECTIONS.forEach((sub, idx) => {
      subcollections[sub] = subQueries[idx].docs.map(d => ({ id: d.id, ...d.data() }));
    });

    // 4. Enumerate matching chat_conversations
    const chatSnap = await dataCol(db, 'chat_conversations').get();
    const chatConversations = chatSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => matchCustomerChatPredicate(c, customer));

    // 5. Enumerate Storage objects under be_customers/{customerId}/ prefix
    const storagePrefix = `${STORAGE_PREFIX_CUSTOMER}/${customerId}/`;
    const [files] = await bucket.getFiles({ prefix: storagePrefix });
    const storageManifest = await Promise.all(files.map(async (file) => {
      const [buf] = await file.download();
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const [meta] = await file.getMetadata();
      return {
        path: file.name,
        size: Number(meta.size || buf.length),
        sha256,
        contentType: meta.contentType || 'application/octet-stream',
      };
    }));

    // 6. Compose backup file
    const backupFile = buildCustomerBackupFile({
      customerId, customerHN, customerName,
      exportedBy: `${caller.email || ''} (${caller.uid || ''})`.trim(),
      collections, subcollections, chatConversations, storageManifest,
      userNote,
    });

    // 7. Write backup.json to Storage
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

    // 8. Copy Storage objects to backup tree (parallel)
    await Promise.all(files.map(async (file) => {
      const destPath = `${backupPathPrefix}/storage/${file.name}`;
      await file.copy(bucket.file(destPath));
    }));

    // 9. Generate 24h signed URL for backup.json
    const [signedUrl] = await bucket.file(backupJsonPath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    // 10. Audit doc
    const auditId = `customer-backup-export-${customerId}-${ts}-${rand}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      type: 'customer-backup-export',
      customerId, customerHN, customerName,
      backupRef: backupJsonPath,
      bodyHash: backupFile.meta.bodyHash,
      storageManifestHash: backupFile.meta.storageManifestHash,
      storageObjectCount: storageManifest.length,
      sizeBytes: backupJsonBytes.length,
      perCollectionCounts: backupFile.meta.perCollectionCounts,
      subcollectionCounts: backupFile.meta.subcollectionCounts,
      chatConversationCount: backupFile.meta.chatConversationCount,
      exportedBy: { uid: caller.uid || '', email: caller.email || '' },
      exportedAt: new Date().toISOString(),
      userNote,
    });

    return res.status(200).json({
      ok: true,
      backupRef: backupJsonPath,
      downloadUrl: signedUrl,
      sizeBytes: backupJsonBytes.length,
      bodyHash: backupFile.meta.bodyHash,
      storageManifestHash: backupFile.meta.storageManifestHash,
      perCollectionCounts: backupFile.meta.perCollectionCounts,
      subcollectionCounts: backupFile.meta.subcollectionCounts,
      chatConversationCount: backupFile.meta.chatConversationCount,
      storageObjectCount: backupFile.meta.storageObjectCount,
      auditDocId: auditId,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'BACKUP_EXPORT_FAILED' });
  }
}
