#!/usr/bin/env node
// scripts/v82-followup-full-customer-wipe.mjs
// V82-followup (2026-05-17 EOD+3) — FULL CUSTOMER WIPE + HN counter reset.
//
// User directive: ลบข้อมูลลูกค้าและคอร์สคงเหลือ และทุกอย่างที่เกี่ยวกับลูกค้าทุกคน
//                  แล้วรีให้ HN กลับมาเริ่ม LC-26000001
// Scope chosen: FULL CUSTOMER WIPE (recommended option from AskUserQuestion).
//
// AV19 mandate: this script REFUSES to --apply unless a fresh V81 whole-system
// backup exists at backups/whole-system/pre-restore-<recent>/ (≤ 60 min old).
// Take backup first via:
//   node scripts/whole-system-backup-export.mjs --type=pre-restore
//
// USAGE:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/v82-followup-full-customer-wipe.mjs            # dry-run
//   node scripts/v82-followup-full-customer-wipe.mjs --apply    # commit
//   node scripts/v82-followup-full-customer-wipe.mjs --apply --skip-backup-check  # override (NOT recommended)
//
// What gets WIPED (per FULL CUSTOMER WIPE scope):
//   - be_customers (every doc + 8 customer subcollections recursive)
//   - be_treatments, be_sales, be_appointments, be_deposits
//   - be_quotations, be_online_sales, be_sale_insurance_claims, be_recalls
//   - chat_conversations, chat_history, opd_sessions
//   - Storage: uploads/be_customers/**, uploads/be_treatments/**, uploads/be_sales/**,
//     uploads/be_appointments/**, uploads/be_deposits/**, uploads/be_quotations/**,
//     uploads/be_online_sales/**, uploads/be_sale_insurance_claims/**, uploads/be_recalls/**
//   - HN counter: be_customer_counter/counter (deleted → next HN restarts at LC-26000001)
//
// What's PRESERVED:
//   - be_stock_*, be_products, be_courses (master), be_doctors, be_staff,
//     be_branches, be_admin_audit, be_promotions/coupons/vouchers, master_data,
//     be_*_configs, clinic_settings (except customer_counter), be_exam_rooms,
//     be_staff_schedules, be_staff_chat_messages, staff-chat-attachments/
//   - Storage: backups/**, uploads/be_staff/**, uploads/be_doctors/**, etc.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const BASE = ['artifacts', APP_ID, 'public', 'data'];

// Collections to wipe FULL (every doc).
const WIPE_COLLECTIONS = [
  'be_customers',
  'be_treatments',
  'be_sales',
  'be_appointments',
  'be_deposits',
  'be_quotations',
  'be_online_sales',
  'be_sale_insurance_claims',
  'be_recalls',
  'chat_conversations',
  'chat_history',
  'opd_sessions',
];

// Per-customer subcollections (V74 T4 — under be_customers/{cid}/).
const CUSTOMER_SUBCOLLECTIONS = [
  'wallets', 'memberships', 'points', 'treatments',
  'sales', 'appointments', 'deposits', 'courseChanges',
];

// Storage prefixes to wipe.
const STORAGE_PREFIXES = [
  'uploads/be_customers/',
  'uploads/be_treatments/',
  'uploads/be_sales/',
  'uploads/be_appointments/',
  'uploads/be_deposits/',
  'uploads/be_quotations/',
  'uploads/be_online_sales/',
  'uploads/be_sale_insurance_claims/',
  'uploads/be_recalls/',
];

// AV19 safety: require a recent V81 whole-system backup.
const BACKUP_MAX_AGE_MIN = 60;

function loadEnv() {
  const envPath = path.resolve('.env.local.prod');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local.prod missing — run `vercel env pull .env.local.prod --environment=production` first');
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function parseArgs() {
  const opts = { apply: false, skipBackupCheck: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--apply') opts.apply = true;
    if (a === '--skip-backup-check') opts.skipBackupCheck = true;
  }
  return opts;
}

function initAdmin(env) {
  if (getApps().length) return;
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!env.FIREBASE_ADMIN_CLIENT_EMAIL || !privateKey) {
    throw new Error('FIREBASE_ADMIN_* env vars missing in .env.local.prod');
  }
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: BUCKET,
  });
}

function dataCol(db, name) {
  let ref = db;
  for (const seg of BASE) ref = ref.collection ? ref.collection(seg) : ref.doc(seg);
  return ref.collection(name);
}

function dataDoc(db, collection, docId) {
  return dataCol(db, collection).doc(docId);
}

async function findFreshBackup(bucket) {
  const [files] = await bucket.getFiles({ prefix: 'backups/whole-system/' });
  const folders = new Set();
  for (const f of files) {
    const parts = f.name.split('/');
    if (parts.length >= 3) folders.add(parts.slice(0, 3).join('/'));
  }
  const recent = [];
  for (const folder of folders) {
    const manifestPath = `${folder}/manifest.json`;
    const mf = files.find(f => f.name === manifestPath);
    if (!mf) continue;
    const [meta] = await mf.getMetadata().catch(() => [null]);
    if (!meta?.timeCreated) continue;
    const ageMin = (Date.now() - new Date(meta.timeCreated).getTime()) / 60_000;
    recent.push({ folder, ageMin, timeCreated: meta.timeCreated });
  }
  recent.sort((a, b) => a.ageMin - b.ageMin);
  return recent[0] || null;
}

async function countDocs(query) {
  // Use count() aggregation if available (faster than getDocs for count-only).
  try {
    const snap = await query.count().get();
    return snap.data().count;
  } catch {
    const snap = await query.get();
    return snap.size;
  }
}

async function deleteAllInQuery(query, opts = { batchSize: 400 }) {
  let totalDeleted = 0;
  while (true) {
    const snap = await query.limit(opts.batchSize).get();
    if (snap.empty) break;
    const batch = query.firestore.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < opts.batchSize) break;
  }
  return totalDeleted;
}

async function deleteSubcollection(parentDocRef, subName) {
  const subRef = parentDocRef.collection(subName);
  return deleteAllInQuery(subRef);
}

async function listStoragePrefix(bucket, prefix) {
  const [files] = await bucket.getFiles({ prefix });
  return files;
}

async function deleteStorageFiles(files, concurrency = 25) {
  let deleted = 0, failed = 0;
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    await Promise.all(chunk.map(f => f.delete().then(() => deleted++).catch(() => failed++)));
  }
  return { deleted, failed };
}

function fmt(n) { return n.toLocaleString('en-US'); }

async function main() {
  const opts = parseArgs();
  const env = loadEnv();
  initAdmin(env);
  const db = getFirestore();
  const bucket = getStorage().bucket(BUCKET);

  console.log('=== V82-followup FULL CUSTOMER WIPE — ' + (opts.apply ? 'APPLY' : 'DRY-RUN') + ' ===');
  console.log(`Project: ${APP_ID}`);
  console.log(`Time:    ${new Date().toISOString()}\n`);

  // ─── AV19 safety check ────────────────────────────────────────────────
  if (opts.apply && !opts.skipBackupCheck) {
    console.log('[AV19] Checking for fresh V81 whole-system backup...');
    const fresh = await findFreshBackup(bucket);
    if (!fresh) {
      throw new Error(
        '[AV19 ABORT] No V81 whole-system backup found at backups/whole-system/.\n' +
        '  Run: node scripts/whole-system-backup-export.mjs --type=pre-restore\n' +
        '  Then re-run this script. (Or pass --skip-backup-check to override; NOT recommended.)'
      );
    }
    console.log(`  ✓ Found: ${fresh.folder} (age: ${fresh.ageMin.toFixed(1)} min, created: ${fresh.timeCreated})`);
    if (fresh.ageMin > BACKUP_MAX_AGE_MIN) {
      throw new Error(
        `[AV19 ABORT] Most recent backup is ${fresh.ageMin.toFixed(1)} min old (> ${BACKUP_MAX_AGE_MIN} min limit).\n` +
        '  Take a fresh backup first.'
      );
    }
    console.log('  ✓ AV19 gate passed.\n');
  } else if (opts.apply && opts.skipBackupCheck) {
    console.log('[AV19 OVERRIDE] --skip-backup-check active. No backup gate.\n');
  }

  const plan = {
    collections: {},
    customerSubcollections: { totalSubDocs: 0, perSubName: {} },
    storage: {},
    counterDeleted: false,
  };

  // ─── Phase 1: Count main collections ──────────────────────────────────
  console.log('[scan] Counting docs in WIPE_COLLECTIONS...');
  for (const col of WIPE_COLLECTIONS) {
    const n = await countDocs(dataCol(db, col));
    plan.collections[col] = n;
    console.log(`  - ${col}: ${fmt(n)}`);
  }

  // ─── Phase 2: Count customer subcollections (sample 20 customers) ─────
  console.log('\n[scan] Sampling 20 be_customers for subcollection counts...');
  const customerSampleSnap = await dataCol(db, 'be_customers').limit(20).get();
  let sampledTotal = 0;
  for (const subName of CUSTOMER_SUBCOLLECTIONS) {
    plan.customerSubcollections.perSubName[subName] = 0;
  }
  for (const custDoc of customerSampleSnap.docs) {
    for (const subName of CUSTOMER_SUBCOLLECTIONS) {
      const n = await countDocs(custDoc.ref.collection(subName));
      plan.customerSubcollections.perSubName[subName] += n;
      sampledTotal += n;
    }
  }
  const totalCustomers = plan.collections.be_customers;
  const estimatedTotalSubdocs = sampledTotal === 0
    ? 0
    : Math.round((sampledTotal / Math.max(1, customerSampleSnap.size)) * totalCustomers);
  plan.customerSubcollections.totalSubDocs = estimatedTotalSubdocs;
  console.log(`  Sampled ${customerSampleSnap.size} customers → ${fmt(sampledTotal)} subdocs total`);
  for (const [sub, n] of Object.entries(plan.customerSubcollections.perSubName)) {
    console.log(`    - ${sub}: ${fmt(n)} (in sample)`);
  }
  console.log(`  Estimated total customer subdocs (extrapolated to ${fmt(totalCustomers)} customers): ~${fmt(estimatedTotalSubdocs)}`);

  // ─── Phase 3: Storage prefixes ────────────────────────────────────────
  console.log('\n[scan] Listing Storage prefixes...');
  for (const prefix of STORAGE_PREFIXES) {
    const files = await listStoragePrefix(bucket, prefix);
    plan.storage[prefix] = files.length;
    console.log(`  - ${prefix}: ${fmt(files.length)} files`);
  }

  // ─── Phase 4: HN counter ──────────────────────────────────────────────
  console.log('\n[scan] HN counter doc...');
  const counterRef = dataDoc(db, 'be_customer_counter', 'counter');
  const counterSnap = await counterRef.get();
  if (counterSnap.exists) {
    plan.counterDeleted = true;
    console.log(`  - be_customer_counter/counter EXISTS → ${JSON.stringify(counterSnap.data())}`);
  } else {
    console.log('  - be_customer_counter/counter does NOT exist (already reset state)');
  }

  // ─── Summary ───────────────────────────────────────────────────────────
  const totalMainDocs = Object.values(plan.collections).reduce((a, b) => a + b, 0);
  const totalStorageFiles = Object.values(plan.storage).reduce((a, b) => a + b, 0);
  console.log('\n=== TOTALS ===');
  console.log(`  Main-collection docs:                   ${fmt(totalMainDocs)}`);
  console.log(`  Customer subcollection docs (~est):     ${fmt(estimatedTotalSubdocs)}`);
  console.log(`  Storage files (across ${STORAGE_PREFIXES.length} prefixes):    ${fmt(totalStorageFiles)}`);
  console.log(`  HN counter doc:                         ${plan.counterDeleted ? 'will delete' : 'absent'}`);

  if (!opts.apply) {
    console.log('\n[DRY-RUN] No changes made. Re-run with --apply to commit.');
    return;
  }

  // ─── APPLY PHASE ───────────────────────────────────────────────────────
  console.log('\n=== APPLY PHASE ===');
  const results = {
    perCollection: {},
    customerSubdocs: 0,
    storageDeleted: 0,
    storageFailed: 0,
    counterDeleted: false,
  };

  // (1) Customer subcollections — delete BEFORE deleting parent docs.
  console.log('[apply] Wiping be_customers subcollections (per-customer recursive)...');
  let custProcessed = 0;
  const allCustomersSnap = await dataCol(db, 'be_customers').select().get();
  for (const custDoc of allCustomersSnap.docs) {
    for (const subName of CUSTOMER_SUBCOLLECTIONS) {
      const n = await deleteSubcollection(custDoc.ref, subName);
      results.customerSubdocs += n;
    }
    custProcessed++;
    if (custProcessed % 50 === 0) {
      console.log(`  Subcollection wipe progress: ${fmt(custProcessed)}/${fmt(allCustomersSnap.size)} customers; ${fmt(results.customerSubdocs)} subdocs deleted so far`);
    }
  }
  console.log(`  ✓ ${fmt(results.customerSubdocs)} customer subcollection docs deleted across ${fmt(allCustomersSnap.size)} customers`);

  // (2) Main-collection docs.
  console.log('\n[apply] Wiping main collections...');
  for (const col of WIPE_COLLECTIONS) {
    const n = await deleteAllInQuery(dataCol(db, col));
    results.perCollection[col] = n;
    console.log(`  ✓ ${col}: ${fmt(n)} deleted`);
  }

  // (3) HN counter.
  console.log('\n[apply] Deleting HN counter...');
  if (counterSnap.exists) {
    await counterRef.delete();
    results.counterDeleted = true;
    console.log('  ✓ be_customer_counter/counter deleted (next HN → LC-26000001)');
  } else {
    console.log('  - already absent, no action');
  }

  // (4) Storage prefixes.
  console.log('\n[apply] Deleting Storage files...');
  for (const prefix of STORAGE_PREFIXES) {
    const files = await listStoragePrefix(bucket, prefix);
    if (files.length === 0) {
      console.log(`  - ${prefix}: 0 files (skip)`);
      continue;
    }
    const r = await deleteStorageFiles(files);
    results.storageDeleted += r.deleted;
    results.storageFailed += r.failed;
    console.log(`  ✓ ${prefix}: ${fmt(r.deleted)} deleted, ${fmt(r.failed)} failed`);
  }

  // (5) Audit doc.
  console.log('\n[apply] Writing audit doc...');
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const auditId = `v82-followup-full-customer-wipe-${ts}-${rand}`;
  await dataCol(db, 'be_admin_audit').doc(auditId).set({
    type: 'v82-followup-full-customer-wipe',
    performedAt: new Date().toISOString(),
    scope: 'FULL_CUSTOMER_WIPE',
    wipedCollections: results.perCollection,
    wipedCustomerSubdocs: results.customerSubdocs,
    wipedStorageFiles: results.storageDeleted,
    failedStorageFiles: results.storageFailed,
    hnCounterDeleted: results.counterDeleted,
    nextHN: 'LC-26000001',
    reason: 'User directive: ลบข้อมูลลูกค้าและคอร์สคงเหลือ และทุกอย่างที่เกี่ยวกับลูกค้าทุกคน + reset HN to LC-26000001',
  });
  console.log(`  ✓ Audit: be_admin_audit/${auditId}`);

  console.log('\n=== APPLY COMPLETE ===');
  console.log(`  Customer subcoll docs deleted:  ${fmt(results.customerSubdocs)}`);
  console.log(`  Main-collection docs deleted:   ${fmt(Object.values(results.perCollection).reduce((a, b) => a + b, 0))}`);
  console.log(`  Storage files deleted:          ${fmt(results.storageDeleted)}  (${fmt(results.storageFailed)} failed)`);
  console.log(`  HN counter:                     ${results.counterDeleted ? 'deleted (next → LC-26000001)' : 'unchanged'}`);
  console.log(`  Audit: be_admin_audit/${auditId}`);
  console.log('\nNext: verify via `node scripts/v82-followup-verify-wipe.mjs` (if exists) OR query be_customers count = 0.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('\n[FATAL]', err.message || err);
    process.exit(1);
  });
}
