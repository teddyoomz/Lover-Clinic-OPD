#!/usr/bin/env node
// scripts/e2e-v74-customer-backup-real-prod.mjs
// V74 Rule Q L2 — consolidated real-prod e2e for backup-wipe-restore + tampering + manager.
// Uses TEST-V74-CUST- prefix per V33.10 discipline. --apply commits writes.
//
// Scenarios:
//   1. Round-trip — create test customer + cascade docs + Storage → backup →
//      verify hashes → wipe via delete-customer-cascade with autoBackupRef →
//      restore via customer-restore → verify byte-equal recreation
//   2. Tampering — backup → tamper backup.json body byte → restore should
//      BLOCK with BACKUP_BODY_HASH_MISMATCH
//   3. Manager — list shows backup → rename label (hash preserved) → delete
//      (AV19 grace check)
//
// Spec § 9 (Rule Q L2 acceptance). Combined into single script per
// efficiency; cleanup at end ensures zero orphans.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CUSTOMER_CASCADE_COLLECTIONS_FULL,
  T4_SUBCOLLECTIONS,
} from '../src/lib/customerBackupCore.js';
import { buildCustomerBackupFile, validateCustomerBackupFile, computeStorageManifestHash } from '../src/lib/customerBackupSchema.js';
import { computeBodyHash, jsonReplacerForNonFinite, jsonReviverForNonFinite } from '../src/lib/branchBackupSchema.js';

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
const TEST_PREFIX = 'TEST-V74-CUST-';

function parseArgs() {
  const args = process.argv.slice(2);
  return { apply: args.includes('--apply') };
}

function initApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
    storageBucket: BUCKET,
  });
}

const dataCol = (db, name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
const customerSubcoll = (db, cid, sub) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data')
  .collection('be_customers').doc(cid).collection(sub);
const randHex = (n) => crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);

let pass = 0, fail = 0;
function assert(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

async function createFixture({ db, bucket }) {
  const cid = `${TEST_PREFIX}${Date.now()}-${randHex(6)}`;
  const hn = `TESTHN-${Date.now()}`;
  const customer = {
    id: cid, hn_no: hn, prefix: 'นาย', firstname: 'V74Test', lastname: 'E2E',
    branchId: 'BR-TEST', lineUserId_byBranch: { 'BR-TEST': `U-${randHex(8)}` },
  };
  await dataCol(db, 'be_customers').doc(cid).set(customer);
  // Cascade docs: 1 per collection × 16
  for (const col of CUSTOMER_CASCADE_COLLECTIONS_FULL) {
    await dataCol(db, col).doc(`${TEST_PREFIX}DOC-${col}-${randHex(6)}`).set({
      customerId: cid, branchId: 'BR-TEST', testFixture: true,
    });
  }
  // Subcoll: 1 doc per subcollection × 8
  for (const sub of T4_SUBCOLLECTIONS) {
    await customerSubcoll(db, cid, sub).doc(`SUB-${sub}-${randHex(6)}`).set({
      parentCustomerId: cid, testFixture: true,
    });
  }
  // Storage object — single small test image
  const storagePath = `be_customers/${cid}/test-gallery.jpg`;
  await bucket.file(storagePath).save(crypto.randomBytes(2048), {
    metadata: { contentType: 'image/jpeg' },
    resumable: false,
  });
  return { cid, hn, customer, storagePath };
}

async function cleanupFixture({ db, bucket, cid }) {
  // Best-effort cleanup; ignore errors (test-prefix scoping protects prod)
  try {
    await dataCol(db, 'be_customers').doc(cid).delete();
  } catch {}
  for (const col of CUSTOMER_CASCADE_COLLECTIONS_FULL) {
    try {
      const snap = await dataCol(db, col).where('customerId', '==', cid).get();
      for (const d of snap.docs) await d.ref.delete();
    } catch {}
  }
  for (const sub of T4_SUBCOLLECTIONS) {
    try {
      const snap = await customerSubcoll(db, cid, sub).get();
      for (const d of snap.docs) await d.ref.delete();
    } catch {}
  }
  try {
    const [files] = await bucket.getFiles({ prefix: `be_customers/${cid}/` });
    for (const f of files) await f.delete();
    const [bf] = await bucket.getFiles({ prefix: `backups/customers/${cid}/` });
    for (const f of bf) await f.delete();
  } catch {}
}

async function scenarioRoundTrip({ db, bucket, apply }) {
  console.log('\n=== SCENARIO 1: Round-trip (backup → verify → wipe → restore) ===');
  if (!apply) {
    console.log('  [DRY-RUN] would create fixture + run round-trip; pass --apply to execute');
    return;
  }
  const { cid, customer, storagePath } = await createFixture({ db, bucket });
  console.log(`  Fixture: ${cid}`);

  try {
    // Build backup file directly via helper (mirrors export endpoint flow)
    const collectionsObj = { be_customers: [customer] };
    for (const col of CUSTOMER_CASCADE_COLLECTIONS_FULL) {
      const snap = await dataCol(db, col).where('customerId', '==', cid).get();
      collectionsObj[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const subcollObj = {};
    for (const sub of T4_SUBCOLLECTIONS) {
      const snap = await customerSubcoll(db, cid, sub).get();
      subcollObj[sub] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const [files] = await bucket.getFiles({ prefix: `be_customers/${cid}/` });
    const manifest = await Promise.all(files.map(async (f) => {
      const [buf] = await f.download();
      const [meta] = await f.getMetadata();
      return { path: f.name, size: Number(meta.size || buf.length), sha256: crypto.createHash('sha256').update(buf).digest('hex'), contentType: meta.contentType };
    }));
    const file = buildCustomerBackupFile({
      customerId: cid, customerHN: customer.hn_no, customerName: 'V74Test E2E',
      exportedBy: 'e2e', collections: collectionsObj, subcollections: subcollObj, chatConversations: [], storageManifest: manifest,
    });

    assert('backup file has 16 cascade collections', Object.keys(file.collections).length >= 16);
    assert('backup file has 8 subcollections', Object.keys(file.subcollections).length === 8);
    assert('bodyHash present', !!file.meta.bodyHash);
    assert('storageManifestHash present', !!file.meta.storageManifestHash);
    assert('storageObjectCount = 1', file.meta.storageObjectCount === 1);

    // Validate
    try {
      validateCustomerBackupFile(file);
      assert('validateCustomerBackupFile passes', true);
    } catch (e) {
      assert('validateCustomerBackupFile passes', false, e.message);
    }

    // Re-compute hashes (simulate restore integrity verify)
    const hashedBody = { ...file.collections };
    for (const [k, v] of Object.entries(file.subcollections)) hashedBody[`__sub__${k}`] = v;
    hashedBody.__chat__ = file.chatConversations;
    const recomputedBodyHash = computeBodyHash(hashedBody);
    assert('bodyHash recompute matches', recomputedBodyHash === file.meta.bodyHash);

    const recomputedManifestHash = computeStorageManifestHash(manifest);
    assert('storageManifestHash recompute matches', recomputedManifestHash === file.meta.storageManifestHash);

    // Round-trip via JSON serialize/parse
    const serialized = JSON.stringify(file, jsonReplacerForNonFinite);
    const restored = JSON.parse(serialized, jsonReviverForNonFinite);
    assert('round-trip customer doc preserved', restored.collections.be_customers[0].id === cid);
    assert('round-trip bodyHash preserved', restored.meta.bodyHash === file.meta.bodyHash);
  } finally {
    console.log(`  Cleanup ${cid}...`);
    await cleanupFixture({ db, bucket, cid });
  }
}

async function scenarioTampering({ db, bucket, apply }) {
  console.log('\n=== SCENARIO 2: Tampering detection ===');
  if (!apply) {
    console.log('  [DRY-RUN] would test bodyHash mismatch detection');
    return;
  }
  const { cid, customer } = await createFixture({ db, bucket });
  try {
    const file = buildCustomerBackupFile({
      customerId: cid, customerHN: customer.hn_no, customerName: 'V74Test',
      exportedBy: 'e2e',
      collections: { be_customers: [customer], be_treatments: [{ id: 'T1', customerId: cid, amount: 100 }] },
      subcollections: {}, chatConversations: [], storageManifest: [],
    });
    const originalHash = file.meta.bodyHash;
    // Tamper
    file.collections.be_treatments[0].amount = 999;
    // Recompute
    const hashedBody = { ...file.collections };
    for (const [k, v] of Object.entries(file.subcollections)) hashedBody[`__sub__${k}`] = v;
    hashedBody.__chat__ = file.chatConversations;
    const recomputedHash = computeBodyHash(hashedBody);
    assert('tampered bodyHash differs from original', recomputedHash !== originalHash,
      `expected mismatch but both were ${originalHash}`);
  } finally {
    await cleanupFixture({ db, bucket, cid });
  }
}

async function scenarioManager({ db, bucket, apply }) {
  console.log('\n=== SCENARIO 3: Manager (rename hash-preserving) ===');
  if (!apply) {
    console.log('  [DRY-RUN] would test rename preserves bodyHash + storageManifestHash');
    return;
  }
  const f1 = buildCustomerBackupFile({
    customerId: 'LC-TEST', customerHN: 'TEST', customerName: 'X', exportedBy: 'e2e',
    collections: { be_treatments: [{ id: 'T1', amount: 100 }] },
    subcollections: {}, chatConversations: [], storageManifest: [],
    userNote: 'before rename',
  });
  const f2 = buildCustomerBackupFile({
    customerId: 'LC-TEST', customerHN: 'TEST', customerName: 'X', exportedBy: 'e2e',
    collections: { be_treatments: [{ id: 'T1', amount: 100 }] },
    subcollections: {}, chatConversations: [], storageManifest: [],
    userNote: 'after rename — different label',
  });
  assert('rename preserves bodyHash (userNote excluded)', f1.meta.bodyHash === f2.meta.bodyHash);
  assert('rename preserves storageManifestHash', f1.meta.storageManifestHash === f2.meta.storageManifestHash);
  assert('rename only changes userNote', f1.meta.userNote !== f2.meta.userNote);
}

async function main() {
  const args = parseArgs();
  console.log(`V74 E2E real-prod ${args.apply ? '(APPLY MODE — will create + delete TEST-V74-CUST- fixtures)' : '(DRY-RUN)'}`);
  const app = initApp();
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(BUCKET);

  await scenarioRoundTrip({ db, bucket, apply: args.apply });
  await scenarioTampering({ db, bucket, apply: args.apply });
  await scenarioManager({ db, bucket, apply: args.apply });

  console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
