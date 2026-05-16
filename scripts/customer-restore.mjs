#!/usr/bin/env node
// scripts/customer-restore.mjs — Rule M canonical CLI for customer restore.
// Mirrors /api/admin/customer-restore. Supports --backup-ref (Storage path)
// OR --local-file (local JSON path). Dry-run default; --apply commits.
//
// Usage:
//   node scripts/customer-restore.mjs --backup-ref backups/customers/LC-X/123-abc/backup.json [--apply]
//   node scripts/customer-restore.mjs --local-file ./backup.json [--apply]
//
// Conflict policy (Q3=B SAFE): BLOCK on customerId-exists or HN-collision;
// STRIP conflicting lineUserId_byBranch entries; ALLOW stale FKs as-is.

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
import { validateCustomerBackupFile, computeStorageManifestHash } from '../src/lib/customerBackupSchema.js';
import { computeBodyHash, jsonReviverForNonFinite } from '../src/lib/branchBackupSchema.js';
import { scanRestoreConflicts, stripLineConflicts } from '../src/lib/customerBackupConflict.js';

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

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { apply: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--backup-ref') out.backupRef = args[++i];
    else if (a === '--local-file') out.localFile = args[++i];
  }
  return out;
}

function initApp() {
  if (getApps().length > 0) return getApps()[0];
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured (run: vercel env pull .env.local.prod --environment=production)');
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

async function loadBackup({ bucket, backupRef, localFile }) {
  let backupBytes;
  let backupPrefix = null;
  if (localFile) {
    if (!existsSync(localFile)) throw new Error(`Local file not found: ${localFile}`);
    backupBytes = readFileSync(localFile);
  } else if (backupRef) {
    const [exists] = await bucket.file(backupRef).exists();
    if (!exists) throw new Error(`Backup not found in Storage: ${backupRef}`);
    [backupBytes] = await bucket.file(backupRef).download();
    backupPrefix = backupRef.replace(/\/backup\.json$/, '');
  } else {
    throw new Error('Must provide --backup-ref or --local-file');
  }
  const file = JSON.parse(backupBytes.toString('utf8'), jsonReviverForNonFinite);
  validateCustomerBackupFile(file);
  return { file, backupPrefix };
}

async function verifyIntegrity({ bucket, file, backupPrefix }) {
  // bodyHash
  const hashedBody = { ...(file.collections || {}) };
  for (const [subName, docs] of Object.entries(file.subcollections || {})) {
    hashedBody[`__sub__${subName}`] = Array.isArray(docs) ? docs : [];
  }
  hashedBody.__chat__ = Array.isArray(file.chatConversations) ? file.chatConversations : [];
  const recomputedBodyHash = computeBodyHash(hashedBody);
  if (file.meta.bodyHash && recomputedBodyHash !== file.meta.bodyHash) {
    throw new Error(`bodyHash mismatch: expected ${file.meta.bodyHash}, got ${recomputedBodyHash}`);
  }

  // storageManifestHash
  const manifest = file.meta.storageManifest || [];
  const recomputedManifestHash = computeStorageManifestHash(manifest);
  if (file.meta.storageManifestHash && recomputedManifestHash !== file.meta.storageManifestHash) {
    throw new Error(`storageManifestHash mismatch: expected ${file.meta.storageManifestHash}, got ${recomputedManifestHash}`);
  }

  // Per-object SHA-256 (only if backup is in Storage and we have a prefix)
  if (backupPrefix) {
    const errors = [];
    await Promise.all(manifest.map(async (entry) => {
      const objPath = `${backupPrefix}/storage/${entry.path}`;
      try {
        const [objExists] = await bucket.file(objPath).exists();
        if (!objExists) {
          errors.push({ path: entry.path, error: 'MISSING' });
          return;
        }
        const [objBuf] = await bucket.file(objPath).download();
        const sha256 = crypto.createHash('sha256').update(objBuf).digest('hex');
        if (sha256 !== entry.sha256) {
          errors.push({ path: entry.path, error: 'SHA256_MISMATCH' });
        }
      } catch (e) {
        errors.push({ path: entry.path, error: e.message });
      }
    }));
    if (errors.length > 0) throw new Error(`Storage integrity fail: ${JSON.stringify(errors)}`);
  } else {
    console.warn('[WARN] Local backup file — skipping per-Storage-object SHA-256 verification');
  }
}

async function main() {
  const args = parseArgs();
  if (!args.backupRef && !args.localFile) {
    console.error('Usage: --backup-ref <Storage path> OR --local-file <local path> [--apply]');
    process.exit(1);
  }
  const app = initApp();
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(BUCKET);

  console.log(`Source: ${args.localFile || args.backupRef}${args.apply ? ' (APPLY MODE)' : ' (DRY-RUN)'}`);

  // Load + verify
  console.log('\n=== STEP 1: Load + integrity verify ===');
  const { file, backupPrefix } = await loadBackup({ bucket, backupRef: args.backupRef, localFile: args.localFile });
  await verifyIntegrity({ bucket, file, backupPrefix });
  const backupCustomer = (file.collections?.be_customers || [])[0];
  if (!backupCustomer) throw new Error('Backup customer doc missing');
  const customerId = String(backupCustomer.id || file.meta.customerId);
  console.log(`  customerId:          ${customerId}`);
  console.log(`  customerHN:          ${file.meta.customerHN}`);
  console.log(`  customerName:        ${file.meta.customerName}`);
  console.log(`  bodyHash:            ${file.meta.bodyHash} ✓`);
  console.log(`  storageManifestHash: ${file.meta.storageManifestHash} ✓`);
  console.log(`  storageObjectCount:  ${file.meta.storageObjectCount}`);

  // Conflict scan
  console.log('\n=== STEP 2: Conflict scan ===');
  const liveSnap = await dataCol(db, 'be_customers').get();
  // V77-fix2 (P1-1): spread-order V38 lesson — docId wins over data.id
  const liveCustomers = liveSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  const conflicts = scanRestoreConflicts({ backupCustomer, liveCustomers });
  console.log(`  customerIdExists: ${conflicts.customerIdExists}`);
  console.log(`  hnCollision:      ${conflicts.hnCollision ? JSON.stringify(conflicts.hnCollision) : 'none'}`);
  console.log(`  lineConflicts:    ${conflicts.lineConflicts.length} (will be STRIPPED on restore)`);

  if (conflicts.customerIdExists) {
    console.error(`\n[BLOCK] customerId ${customerId} already exists — delete first before restore`);
    process.exit(1);
  }
  if (conflicts.hnCollision) {
    console.error(`\n[BLOCK] HN collision: ${JSON.stringify(conflicts.hnCollision)}`);
    process.exit(1);
  }

  if (!args.apply) {
    console.log('\n=== STEP 3 (DRY-RUN): Would recreate ===');
    console.log(`  customer doc + ${Object.entries(file.collections || {}).filter(([k]) => k !== 'be_customers').reduce((acc, [, v]) => acc + v.length, 0)} cascade docs`);
    console.log(`  + ${Object.values(file.subcollections || {}).reduce((acc, v) => acc + v.length, 0)} subcoll docs`);
    console.log(`  + ${(file.chatConversations || []).length} chat docs`);
    console.log(`  + ${file.meta.storageObjectCount} Storage objects copied back to canonical paths`);
    console.log('\nDRY-RUN complete. Use --apply to commit.');
    return;
  }

  // Apply restore
  console.log('\n=== STEP 3: Apply restore ===');
  const restoredCustomer = stripLineConflicts(backupCustomer, conflicts.lineConflicts);

  let batchOp = db.batch();
  let inBatch = 0;
  let totalWrites = 0;
  async function flushIfFull() {
    if (inBatch >= 450) {
      await batchOp.commit();
      batchOp = db.batch();
      inBatch = 0;
    }
  }

  batchOp.set(dataCol(db, 'be_customers').doc(customerId), restoredCustomer);
  inBatch++; totalWrites++;
  await flushIfFull();

  for (const colName of CUSTOMER_CASCADE_COLLECTIONS_FULL) {
    const docs = file.collections?.[colName] || [];
    for (const doc of docs) {
      const docId = String(doc.id);
      const { id: _ignoredId, ...payload } = doc;
      batchOp.set(dataCol(db, colName).doc(docId), payload);
      inBatch++; totalWrites++;
      await flushIfFull();
    }
  }

  for (const sub of T4_SUBCOLLECTIONS) {
    const docs = file.subcollections?.[sub] || [];
    for (const doc of docs) {
      const docId = String(doc.id);
      const { id: _ignoredId, ...payload } = doc;
      batchOp.set(customerSubcoll(db, customerId, sub).doc(docId), payload);
      inBatch++; totalWrites++;
      await flushIfFull();
    }
  }

  for (const chat of file.chatConversations || []) {
    const chatId = String(chat.id);
    const { id: _ignoredId, ...payload } = chat;
    batchOp.set(dataCol(db, 'chat_conversations').doc(chatId), payload);
    inBatch++; totalWrites++;
    await flushIfFull();
  }

  const ts = Date.now();
  const rand = randHex(8);
  const auditId = `customer-restore-${customerId}-${ts}-${rand}`;
  batchOp.set(dataCol(db, 'be_admin_audit').doc(auditId), {
    type: 'customer-restore',
    customerId,
    customerHN: file.meta.customerHN,
    customerName: file.meta.customerName,
    backupRef: args.backupRef || `(local: ${args.localFile})`,
    bodyHash: file.meta.bodyHash,
    storageManifestHash: file.meta.storageManifestHash,
    strippedLineConflicts: conflicts.lineConflicts,
    performedBy: { uid: 'cli', email: 'cli-restore' },
    performedAt: new Date().toISOString(),
  });
  inBatch++; totalWrites++;
  await batchOp.commit();

  // Storage restoration
  const manifest = file.meta.storageManifest || [];
  if (manifest.length > 0 && backupPrefix) {
    console.log(`  Copying ${manifest.length} Storage objects back...`);
    const storageErrors = [];
    await Promise.all(manifest.map(async (entry) => {
      const srcPath = `${backupPrefix}/storage/${entry.path}`;
      try {
        await bucket.file(srcPath).copy(bucket.file(entry.path));
      } catch (e) {
        storageErrors.push({ path: entry.path, error: e.message });
      }
    }));
    if (storageErrors.length > 0) {
      console.warn(`  Storage errors: ${storageErrors.length}`);
      console.warn(storageErrors);
    }
  } else if (manifest.length > 0) {
    console.warn('  [WARN] Storage manifest present but loaded from --local-file; Storage restore SKIPPED');
  }

  console.log(`\nCOMMITTED — ${totalWrites} Firestore writes + ${manifest.length} Storage objects copied + audit ${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
