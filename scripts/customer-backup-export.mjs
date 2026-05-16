#!/usr/bin/env node
// scripts/customer-backup-export.mjs — Rule M canonical CLI mirror of
// /api/admin/customer-backup-export. Single-customer, branch-batch, or
// whole-fleet (V75 Item 2). Dry-run default; --apply commits writes.
//
// Usage:
//   node scripts/customer-backup-export.mjs --customer-id LC-26000001 [--apply] [--user-note "x"]
//   node scripts/customer-backup-export.mjs --all-in-branch BR-... [--apply]
//   node scripts/customer-backup-export.mjs --all-customers [--apply] [--user-note "EOD"]
//
// V75 Item 2 (2026-05-16) — --all-customers whole-fleet mode iterates every
// be_customers doc + invokes exportSingleCustomer for each, then emits a
// whole-fleet MANIFEST at backups/whole-fleet-customers/{ts-rand}/manifest.json
// linking all per-customer backup refs. Per AV56: manifestHash covers every
// customer fileHash + storageManifestHash (userNote EXCLUDED per Q5b=Y).

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
// V75 Item 2 — whole-fleet manifest helpers (AV56).
import {
  buildWholeFleetManifest,
  computeWholeFleetManifestHash,
} from '../src/lib/wholeFleetBackupCore.js';

// Inline .env.local.prod loader (mirrors Phase 18.0+19.0 CLI scripts)
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
  const out = { apply: false, userNote: '' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--customer-id') out.customerId = args[++i];
    else if (a === '--all-in-branch') out.branchId = args[++i];
    else if (a === '--all-customers') out.allCustomers = true; // V75 Item 2 whole-fleet
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

async function exportSingleCustomer({ db, bucket, customerId, userNote, apply }) {
  const custSnap = await dataCol(db, 'be_customers').doc(customerId).get();
  if (!custSnap.exists) {
    console.log(`[SKIP] ${customerId}: not found`);
    return null;
  }
  const customer = { id: custSnap.id, ...custSnap.data() };
  const customerHN = String(customer.hn_no || customerId);
  const customerName = [customer.prefix, customer.firstname, customer.lastname]
    .filter(Boolean).join(' ').trim() || customerId;

  // Enumerate cascade collections
  const collectionQueries = await Promise.all(
    CUSTOMER_CASCADE_COLLECTIONS_FULL.map(name =>
      dataCol(db, name).where('customerId', '==', customerId).get()
    )
  );
  const collections = { be_customers: [customer] };
  CUSTOMER_CASCADE_COLLECTIONS_FULL.forEach((name, idx) => {
    collections[name] = collectionQueries[idx].docs.map(d => ({ ...d.data(), id: d.id }));
  });

  // Enumerate subcollections
  const subQueries = await Promise.all(
    T4_SUBCOLLECTIONS.map(sub => customerSubcoll(db, customerId, sub).get())
  );
  const subcollections = {};
  T4_SUBCOLLECTIONS.forEach((sub, idx) => {
    subcollections[sub] = subQueries[idx].docs.map(d => ({ ...d.data(), id: d.id }));
  });

  // Matching chat conversations
  const chatSnap = await dataCol(db, 'chat_conversations').get();
  const chatConversations = chatSnap.docs
    .map(d => ({ ...d.data(), id: d.id }))
    .filter(c => matchCustomerChatPredicate(c, customer));

  // Storage objects
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
    exportedBy: 'cli-script',
    collections, subcollections, chatConversations, storageManifest,
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

  const summary = {
    customerId, customerHN, customerName,
    backupRef: backupJsonPath,
    sizeBytes: backupJsonBytes.length,
    // V75 Item 2 — surface hashes so whole-fleet manifest can include them (AV56)
    bodyHash: backupFile.meta.bodyHash,
    storageManifestHash: backupFile.meta.storageManifestHash,
    perCollectionCounts: backupFile.meta.perCollectionCounts,
    subcollectionCounts: backupFile.meta.subcollectionCounts,
    chatConversationCount: backupFile.meta.chatConversationCount,
    storageObjectCount: backupFile.meta.storageObjectCount,
  };

  if (!apply) {
    console.log(`[DRY-RUN] ${customerId}:`, JSON.stringify(summary, null, 2));
    return summary;
  }

  // Write backup.json
  await bucket.file(backupJsonPath).save(backupJsonBytes, {
    metadata: { contentType: 'application/json' },
    resumable: false,
  });
  // Copy Storage objects
  await Promise.all(files.map(file =>
    file.copy(bucket.file(`${backupPathPrefix}/storage/${file.name}`))
  ));
  // Audit doc
  const auditId = `customer-backup-export-${customerId}-${ts}-${rand}`;
  await dataCol(db, 'be_admin_audit').doc(auditId).set({
    type: 'customer-backup-export',
    ...summary,
    bodyHash: backupFile.meta.bodyHash,
    storageManifestHash: backupFile.meta.storageManifestHash,
    exportedBy: { uid: 'cli', email: 'cli-script' },
    exportedAt: new Date().toISOString(),
    userNote,
  });

  console.log(`[OK] ${customerId} → ${backupJsonPath} (${backupJsonBytes.length} bytes, ${storageManifest.length} storage objects, audit=${auditId})`);
  return summary;
}

async function exportWholeFleet({ db, bucket, userNote, apply }) {
  // V75 Item 2 — iterate ALL be_customers + invoke exportSingleCustomer per
  // customer + emit a whole-fleet manifest linking all per-customer backups.
  // AV56: manifestHash seal covers every fileHash + storageManifestHash.
  console.log('V75 whole-fleet customer backup — iterating ALL customers...');
  const snap = await dataCol(db, 'be_customers').get();
  console.log(`Found ${snap.size} total customers across all branches`);

  const customers = [];
  const failedCustomers = [];
  const start = Date.now();

  for (const doc of snap.docs) {
    try {
      const summary = await exportSingleCustomer({
        db, bucket, customerId: doc.id, userNote, apply,
      });
      if (summary) {
        customers.push({
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
      }
    } catch (e) {
      console.warn(`[FAIL] ${doc.id}: ${e.message}`);
      failedCustomers.push({ cid: doc.id, reason: e.message });
    }
  }

  const manifest = buildWholeFleetManifest({
    customers,
    failedCustomers,
    userNote,
    exportedAt: new Date().toISOString(),
    exporterUid: 'cli-script',
  });
  const manifestHash = computeWholeFleetManifestHash(manifest);
  manifest.manifestHash = manifestHash;

  const ts = Date.now();
  const rand = randHex(8);
  const manifestPath = `backups/whole-fleet-customers/${ts}-${rand}/manifest.json`;

  if (apply) {
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    await bucket.file(manifestPath).save(manifestBytes, {
      metadata: { contentType: 'application/json' },
      resumable: false,
    });
    // Audit doc
    const auditId = `whole-fleet-backup-export-${ts}-${rand}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      type: 'whole-fleet-backup-export',
      manifestPath,
      manifestHash,
      customerCount: customers.length,
      failedCount: failedCustomers.length,
      durationMs: Date.now() - start,
      exportedBy: { uid: 'cli', email: 'cli-script' },
      exportedAt: new Date().toISOString(),
      userNote,
    });
    console.log(`\n[OK] whole-fleet manifest → ${manifestPath}`);
    console.log(`     ${customers.length} customers backed up, ${failedCustomers.length} failed`);
    console.log(`     manifestHash: ${manifestHash}`);
    console.log(`     audit: ${auditId}`);
  } else {
    console.log(`\n[DRY-RUN] whole-fleet:`);
    console.log(`  Would back up ${customers.length} customers`);
    console.log(`  Failed: ${failedCustomers.length}`);
    console.log(`  manifestHash (preview): ${manifestHash}`);
    console.log(`  manifestPath (preview): ${manifestPath}`);
  }

  return { manifestPath, manifestHash, customerCount: customers.length, failedCount: failedCustomers.length };
}

async function main() {
  const args = parseArgs();
  if (!args.customerId && !args.branchId && !args.allCustomers) {
    console.error('Usage:');
    console.error('  --customer-id <id> [--apply] [--user-note <text>]');
    console.error('  --all-in-branch <branchId> [--apply] [--user-note <text>]');
    console.error('  --all-customers [--apply] [--user-note <text>]  # V75 whole-fleet');
    process.exit(1);
  }
  const app = initApp();
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(BUCKET);

  if (args.customerId) {
    await exportSingleCustomer({ db, bucket, customerId: args.customerId, userNote: args.userNote, apply: args.apply });
  } else if (args.allCustomers) {
    // V75 Item 2 — whole-fleet
    await exportWholeFleet({ db, bucket, userNote: args.userNote, apply: args.apply });
  } else {
    const snap = await dataCol(db, 'be_customers').where('branchId', '==', args.branchId).get();
    console.log(`Found ${snap.size} customers in branch ${args.branchId}`);
    for (const doc of snap.docs) {
      await exportSingleCustomer({ db, bucket, customerId: doc.id, userNote: args.userNote, apply: args.apply });
    }
  }
  console.log(args.apply ? '\nCOMMITTED' : '\nDRY-RUN (use --apply to commit)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
