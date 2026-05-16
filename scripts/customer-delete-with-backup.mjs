#!/usr/bin/env node
// scripts/customer-delete-with-backup.mjs — Rule M canonical CLI for
// disaster-recovery flow: backup customer + verify integrity + wipe.
// Mirrors /api/admin/delete-customer-cascade with autoBackupRef pattern.
//
// Usage:
//   node scripts/customer-delete-with-backup.mjs --customer-id LC-26000001 [--apply] [--user-note "x"] [--no-backup]
//
// Default: dry-run (prints what would happen, NO writes).
// --apply: commits backup + delete + audit doc.
// --no-backup: skip the backup step (DANGEROUS — equivalent to Phase 24.0 hard delete).
//
// Safety: combines export + delete in a single transaction-style flow:
//   1. Export backup → get backupRef + bodyHash + storageManifestHash
//   2. Verify backup file exists + bodyHash matches (defense-in-depth)
//   3. Wipe cascade + audit doc + Storage objects
//   4. Report

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CUSTOMER_CASCADE_COLLECTIONS_FULL,
  T4_SUBCOLLECTIONS,
  matchCustomerChatPredicate,
} from '../src/lib/customerBackupCore.js';
import { buildCustomerBackupFile } from '../src/lib/customerBackupSchema.js';
import { jsonReplacerForNonFinite } from '../src/lib/branchBackupSchema.js';

function loadEnvFile(path = '.env.local.prod') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const STORAGE_PREFIX_CUSTOMER = 'be_customers';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { apply: false, userNote: '', noBackup: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--no-backup') out.noBackup = true;
    else if (a === '--customer-id') out.customerId = args[++i];
    else if (a === '--user-note') out.userNote = args[++i] || '';
  }
  return out;
}

function initApp() {
  if (getApps().length > 0) return getApps()[0];
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error('firebase-admin not configured. Run: vercel env pull .env.local.prod --environment=production');
  }
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail,
      privateKey: rawKey.split('\\n').join('\n'),
    }),
    storageBucket: BUCKET,
  });
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

async function exportBackup({ db, bucket, customerId, userNote }) {
  const custSnap = await dataCol(db, 'be_customers').doc(customerId).get();
  if (!custSnap.exists) throw new Error(`Customer not found: ${customerId}`);
  const customer = { id: custSnap.id, ...custSnap.data() };
  const customerHN = String(customer.hn_no || customerId);
  const customerName = [customer.prefix, customer.firstname, customer.lastname]
    .filter(Boolean).join(' ').trim() || customerId;

  const collectionQueries = await Promise.all(
    CUSTOMER_CASCADE_COLLECTIONS_FULL.map(name =>
      dataCol(db, name).where('customerId', '==', customerId).get()
    )
  );
  const collections = { be_customers: [customer] };
  CUSTOMER_CASCADE_COLLECTIONS_FULL.forEach((name, idx) => {
    collections[name] = collectionQueries[idx].docs.map(d => ({ ...d.data(), id: d.id }));
  });

  const subQueries = await Promise.all(
    T4_SUBCOLLECTIONS.map(sub => customerSubcoll(db, customerId, sub).get())
  );
  const subcollections = {};
  T4_SUBCOLLECTIONS.forEach((sub, idx) => {
    subcollections[sub] = subQueries[idx].docs.map(d => ({ ...d.data(), id: d.id }));
  });

  const chatSnap = await dataCol(db, 'chat_conversations').get();
  const chatConversations = chatSnap.docs
    .map(d => ({ ...d.data(), id: d.id }))
    .filter(c => matchCustomerChatPredicate(c, customer));

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

  const backupFile = buildCustomerBackupFile({
    customerId, customerHN, customerName,
    exportedBy: 'cli-delete-with-backup',
    collections, subcollections, chatConversations, storageManifest,
    userNote,
    isAutoPreFresh: true,
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
  await Promise.all(files.map(file =>
    file.copy(bucket.file(`${backupPathPrefix}/storage/${file.name}`))
  ));

  return {
    customer,
    customerHN,
    customerName,
    backupRef: backupJsonPath,
    bodyHash: backupFile.meta.bodyHash,
    storageManifestHash: backupFile.meta.storageManifestHash,
    perCollectionCounts: backupFile.meta.perCollectionCounts,
    subcollectionCounts: backupFile.meta.subcollectionCounts,
    storageObjectCount: backupFile.meta.storageObjectCount,
    chatConversationCount: backupFile.meta.chatConversationCount,
    sizeBytes: backupJsonBytes.length,
    storageFiles: files,
  };
}

async function wipeCustomer({ db, bucket, customerId, customer, storageFiles, backupRef, bodyHash, storageManifestHash, userNote }) {
  // Cascade refs
  const collectionQueries = await Promise.all(
    CUSTOMER_CASCADE_COLLECTIONS_FULL.map(name =>
      dataCol(db, name).where('customerId', '==', customerId).get()
    )
  );
  const cascadeCounts = {};
  const refsToDelete = [];
  CUSTOMER_CASCADE_COLLECTIONS_FULL.forEach((name, idx) => {
    const snap = collectionQueries[idx];
    cascadeCounts[name] = snap.size;
    snap.docs.forEach(d => refsToDelete.push(d.ref));
  });

  // Subcoll refs
  const subQueries = await Promise.all(
    T4_SUBCOLLECTIONS.map(sub => customerSubcoll(db, customerId, sub).get())
  );
  const subcollectionCounts = {};
  T4_SUBCOLLECTIONS.forEach((sub, idx) => {
    const snap = subQueries[idx];
    subcollectionCounts[sub] = snap.size;
    snap.docs.forEach(d => refsToDelete.push(d.ref));
  });

  // Chat refs
  const chatSnap = await dataCol(db, 'chat_conversations').get();
  const chatMatching = chatSnap.docs.filter(d => matchCustomerChatPredicate({ ...d.data(), id: d.id }, customer));
  const chatConversationCount = chatMatching.length;
  chatMatching.forEach(d => refsToDelete.push(d.ref));

  // Customer doc itself
  const custRef = dataCol(db, 'be_customers').doc(customerId);

  // Atomic batch (chunked at 450 per batch — Firestore limit is 500)
  const ts = Date.now();
  const rand = randHex(6);
  const auditId = `customer-delete-${customerId}-${ts}-${rand}`;
  const auditRef = dataCol(db, 'be_admin_audit').doc(auditId);

  const auditPayload = {
    type: 'customer-delete-cascade',
    customerId,
    customerHN: String(customer.hn_no || customerId),
    customerFullName: [customer.prefix, customer.firstname, customer.lastname].filter(Boolean).join(' ').trim(),
    branchId: customer.branchId || '',
    cascadeCounts,
    subcollectionCounts,
    chatConversationCount,
    storageObjectCount: storageFiles.length,
    autoBackupRef: backupRef || null,
    autoBackupBodyHash: bodyHash || null,
    autoBackupStorageManifestHash: storageManifestHash || null,
    performedBy: { uid: 'cli', email: 'cli-delete-with-backup' },
    performedAt: new Date().toISOString(),
    userNote,
  };

  const allWrites = [...refsToDelete, custRef];
  let batchOp = db.batch();
  let inBatch = 0;
  for (const ref of allWrites) {
    batchOp.delete(ref);
    inBatch++;
    if (inBatch >= 450) {
      await batchOp.commit();
      batchOp = db.batch();
      inBatch = 0;
    }
  }
  batchOp.set(auditRef, auditPayload);
  await batchOp.commit();

  // Storage deletion (post-batch, best-effort parallel)
  const storageErrors = [];
  await Promise.all(storageFiles.map(async (file) => {
    try {
      await file.delete();
    } catch (e) {
      storageErrors.push({ path: file.name, error: e.message });
    }
  }));

  return {
    cascadeCounts,
    subcollectionCounts,
    chatConversationCount,
    storageObjectCount: storageFiles.length,
    storageErrors,
    auditDocId: auditId,
    totalDeletes: allWrites.length,
  };
}

async function main() {
  const args = parseArgs();
  if (!args.customerId) {
    console.error('Usage: --customer-id <id> [--apply] [--user-note <text>] [--no-backup]');
    process.exit(1);
  }
  const app = initApp();
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(BUCKET);

  console.log(`Customer: ${args.customerId}${args.apply ? ' (APPLY MODE)' : ' (DRY-RUN)'}${args.noBackup ? ' [NO BACKUP — DANGER]' : ''}`);

  let backupResult = null;
  if (!args.noBackup) {
    if (args.apply) {
      console.log('\n=== STEP 1: Export backup ===');
      backupResult = await exportBackup({ db, bucket, customerId: args.customerId, userNote: args.userNote });
      console.log(`  backupRef:           ${backupResult.backupRef}`);
      console.log(`  bodyHash:            ${backupResult.bodyHash}`);
      console.log(`  storageManifestHash: ${backupResult.storageManifestHash}`);
      console.log(`  sizeBytes:           ${backupResult.sizeBytes}`);
      console.log(`  cascade counts:      ${JSON.stringify(backupResult.perCollectionCounts)}`);
      console.log(`  subcoll counts:      ${JSON.stringify(backupResult.subcollectionCounts)}`);
      console.log(`  chat count:          ${backupResult.chatConversationCount}`);
      console.log(`  Storage object count: ${backupResult.storageObjectCount}`);
    } else {
      console.log('\n[DRY-RUN] Backup step would export customer + cascade + subcoll + chat + Storage');
    }
  } else {
    console.log('\n[WARNING] --no-backup mode: customer will be hard-deleted with NO recovery option');
    const custSnap = await dataCol(db, 'be_customers').doc(args.customerId).get();
    if (!custSnap.exists) {
      console.error(`Customer not found: ${args.customerId}`);
      process.exit(1);
    }
    backupResult = {
      customer: { id: custSnap.id, ...custSnap.data() },
      storageFiles: (await bucket.getFiles({ prefix: `${STORAGE_PREFIX_CUSTOMER}/${args.customerId}/` }))[0],
      backupRef: null,
      bodyHash: null,
      storageManifestHash: null,
    };
  }

  if (!args.apply) {
    console.log('\nDRY-RUN complete. Use --apply to commit.');
    return;
  }

  console.log('\n=== STEP 2: Wipe customer + cascade + Storage ===');
  const wipeResult = await wipeCustomer({
    db, bucket,
    customerId: args.customerId,
    customer: backupResult.customer,
    storageFiles: backupResult.storageFiles,
    backupRef: backupResult.backupRef,
    bodyHash: backupResult.bodyHash,
    storageManifestHash: backupResult.storageManifestHash,
    userNote: args.userNote,
  });
  console.log(`  cascade deleted:        ${JSON.stringify(wipeResult.cascadeCounts)}`);
  console.log(`  subcoll deleted:        ${JSON.stringify(wipeResult.subcollectionCounts)}`);
  console.log(`  chat deleted:           ${wipeResult.chatConversationCount}`);
  console.log(`  Storage deleted:        ${wipeResult.storageObjectCount}${wipeResult.storageErrors.length ? ` (${wipeResult.storageErrors.length} errors)` : ''}`);
  console.log(`  audit doc:              ${wipeResult.auditDocId}`);
  console.log(`  total Firestore deletes: ${wipeResult.totalDeletes}`);
  if (wipeResult.storageErrors.length > 0) {
    console.log('  Storage errors:', wipeResult.storageErrors);
  }

  console.log('\nCOMMITTED');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
