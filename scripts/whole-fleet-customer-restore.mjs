#!/usr/bin/env node
// scripts/whole-fleet-customer-restore.mjs
// V75 Item 2 — Rule M canonical CLI mirror of
// /api/admin/whole-fleet-customer-restore. Restores a whole-fleet
// customer backup (manifest.json at backups/whole-fleet-customers/{ts}-
// {rand}/manifest.json) to current production Firestore + Storage.
//
// Usage:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/whole-fleet-customer-restore.mjs \
//        --backup-ref backups/whole-fleet-customers/123-abc/manifest.json
//   # ↑ defaults to PREVIEW (dry-run) — no writes, just per-customer report
//
//   node scripts/whole-fleet-customer-restore.mjs \
//        --backup-ref backups/whole-fleet-customers/123-abc/manifest.json \
//        --apply
//   # ↑ ACTUAL restore — verifies manifestHash, then per-customer SAFE restore
//
// Optional flags:
//   --local-manifest <path>    Use a local manifest.json file instead of
//                              downloading from Storage. Per-customer file
//                              entries still resolved relative to Storage.
//   --confirm-hash <hex>       Override the auto-recomputed hash (advanced).
//
// Q3=B SAFE conflict resolution per V74 contract: customerId-exists +
// HN-collision → BLOCK that customer (continue with others); conflicting
// lineUserId_byBranch entries → STRIP at restore time + log to audit;
// stale FK refs → restored as-is (V41 lookup-map handles display).
//
// Per-customer failure isolation per AV56: one customer's failure does NOT
// abort the whole-fleet pass. Accumulated into perCustomer[] + counters.

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
import {
  validateCustomerBackupFile,
  computeStorageManifestHash,
} from '../src/lib/customerBackupSchema.js';
import {
  computeBodyHash,
  jsonReviverForNonFinite,
} from '../src/lib/branchBackupSchema.js';
import {
  scanRestoreConflicts,
  stripLineConflicts,
} from '../src/lib/customerBackupConflict.js';
import {
  validateWholeFleetManifest,
  computeWholeFleetManifestHash,
} from '../src/lib/wholeFleetBackupCore.js';

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
    else if (a === '--local-manifest') out.localManifest = args[++i];
    else if (a === '--confirm-hash') out.confirmHash = args[++i];
  }
  return out;
}

function initApp() {
  if (getApps().length > 0) return getApps()[0];
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error(
      'firebase-admin not configured (run: vercel env pull .env.local.prod --environment=production)'
    );
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
  return db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('public')
    .doc('data')
    .collection(name);
}
function customerSubcoll(db, customerId, subName) {
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

async function loadAndVerifyPerCustomer({ bucket, backupRef }) {
  const [exists] = await bucket.file(backupRef).exists();
  if (!exists) return { ok: false, error: 'BACKUP_NOT_FOUND' };
  let file;
  try {
    const [buf] = await bucket.file(backupRef).download();
    file = JSON.parse(buf.toString('utf8'), jsonReviverForNonFinite);
  } catch (e) {
    return { ok: false, error: 'BACKUP_JSON_PARSE_FAILED', detail: e.message };
  }
  try {
    validateCustomerBackupFile(file);
  } catch (e) {
    return { ok: false, error: 'BACKUP_SCHEMA_INVALID', detail: e.message };
  }
  const hashedBody = { ...(file.collections || {}) };
  for (const [subName, docs] of Object.entries(file.subcollections || {})) {
    hashedBody[`__sub__${subName}`] = Array.isArray(docs) ? docs : [];
  }
  hashedBody.__chat__ = Array.isArray(file.chatConversations) ? file.chatConversations : [];
  const recomputedBodyHash = computeBodyHash(hashedBody);
  if (file.meta.bodyHash && recomputedBodyHash !== file.meta.bodyHash) {
    return {
      ok: false,
      error: 'BACKUP_BODY_HASH_MISMATCH',
      detail: { expected: file.meta.bodyHash, recomputed: recomputedBodyHash },
    };
  }
  const manifest = file.meta.storageManifest || [];
  const recomputedManifestHash = computeStorageManifestHash(manifest);
  if (
    file.meta.storageManifestHash &&
    recomputedManifestHash !== file.meta.storageManifestHash
  ) {
    return {
      ok: false,
      error: 'BACKUP_STORAGE_MANIFEST_HASH_MISMATCH',
      detail: { expected: file.meta.storageManifestHash, recomputed: recomputedManifestHash },
    };
  }
  const backupPrefix = backupRef.replace(/\/backup\.json$/, '');
  return { ok: true, file, backupPrefix };
}

async function restoreSingleCustomer({ db, bucket, file, backupPrefix, conflicts }) {
  const backupCustomer = (file.collections?.be_customers || [])[0];
  if (!backupCustomer) {
    return { ok: false, error: 'BACKUP_CUSTOMER_DOC_MISSING' };
  }
  const customerId = String(backupCustomer.id || file.meta.customerId);
  const restoredCustomer = stripLineConflicts(backupCustomer, conflicts.lineConflicts);
  const strippedLineConflicts = conflicts.lineConflicts;

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
  inBatch++;
  totalWrites++;
  await flushIfFull();

  for (const colName of CUSTOMER_CASCADE_COLLECTIONS_FULL) {
    for (const doc of file.collections?.[colName] || []) {
      const { id: _ignored, ...payload } = doc;
      batchOp.set(dataCol(db, colName).doc(String(doc.id)), payload);
      inBatch++;
      totalWrites++;
      await flushIfFull();
    }
  }
  for (const sub of T4_SUBCOLLECTIONS) {
    for (const doc of file.subcollections?.[sub] || []) {
      const { id: _ignored, ...payload } = doc;
      batchOp.set(customerSubcoll(db, customerId, sub).doc(String(doc.id)), payload);
      inBatch++;
      totalWrites++;
      await flushIfFull();
    }
  }
  for (const chat of file.chatConversations || []) {
    const { id: _ignored, ...payload } = chat;
    batchOp.set(dataCol(db, 'chat_conversations').doc(String(chat.id)), payload);
    inBatch++;
    totalWrites++;
    await flushIfFull();
  }
  await batchOp.commit();

  // Copy Storage objects back
  const storageManifest = file.meta.storageManifest || [];
  const storageErrors = [];
  await Promise.all(
    storageManifest.map(async (entry) => {
      const srcPath = `${backupPrefix}/storage/${entry.path}`;
      try {
        const [srcExists] = await bucket.file(srcPath).exists();
        if (!srcExists) {
          storageErrors.push({ path: entry.path, error: 'STORAGE_SOURCE_MISSING' });
          return;
        }
        await bucket.file(srcPath).copy(bucket.file(entry.path));
      } catch (e) {
        storageErrors.push({ path: entry.path, error: e.message });
      }
    })
  );

  return { ok: true, customerId, totalWrites, strippedLineConflicts, storageErrors };
}

async function loadWholeFleetManifest({ bucket, backupRef, localManifest }) {
  if (localManifest) {
    if (!existsSync(localManifest)) {
      throw new Error(`Local manifest file not found: ${localManifest}`);
    }
    return JSON.parse(readFileSync(localManifest, 'utf8'));
  }
  const [exists] = await bucket.file(backupRef).exists();
  if (!exists) throw new Error(`WHOLE_FLEET_MANIFEST_NOT_FOUND: ${backupRef}`);
  const [buf] = await bucket.file(backupRef).download();
  return JSON.parse(buf.toString('utf8'));
}

async function main() {
  const args = parseArgs();
  if (!args.backupRef && !args.localManifest) {
    console.error('Usage:');
    console.error(
      '  node scripts/whole-fleet-customer-restore.mjs --backup-ref <path> [--apply] [--confirm-hash <hex>]'
    );
    console.error(
      '  node scripts/whole-fleet-customer-restore.mjs --local-manifest <local-path> [--apply]'
    );
    process.exit(1);
  }

  const app = initApp();
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(BUCKET);

  console.log(
    `V75 whole-fleet customer restore — mode=${args.apply ? 'APPLY' : 'DRY-RUN/PREVIEW'}`
  );
  console.log(`Source: ${args.backupRef || args.localManifest}`);

  const manifest = await loadWholeFleetManifest({
    bucket,
    backupRef: args.backupRef,
    localManifest: args.localManifest,
  });

  const v = validateWholeFleetManifest(manifest);
  if (!v.valid) {
    console.error(`[ABORT] INVALID_MANIFEST: ${v.reason}`);
    process.exit(2);
  }

  const recomputedHash = computeWholeFleetManifestHash(manifest);
  console.log(`Manifest customers: ${manifest.customers?.length || 0}`);
  console.log(`Recomputed manifestHash: ${recomputedHash}`);

  if (args.apply) {
    const expectedHash = args.confirmHash || manifest.manifestHash;
    if (expectedHash && expectedHash !== recomputedHash) {
      console.error(
        `[ABORT] WHOLE_FLEET_MANIFEST_TAMPERED: expected=${expectedHash} recomputed=${recomputedHash}`
      );
      process.exit(3);
    }
    if (!expectedHash) {
      console.warn(
        '[WARN] No expected hash provided + manifest.manifestHash empty — proceeding with recomputed (use --confirm-hash to lock).'
      );
    }
  }

  const liveSnap = await dataCol(db, 'be_customers').get();
  const liveCustomers = liveSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Live customers in be_customers: ${liveCustomers.length}`);

  const start = Date.now();
  const parentBatchAuditId = `whole-fleet-restore-${Date.now()}-${randHex(8)}`;
  const perCustomer = [];
  let restored = 0;
  let skippedConflict = 0;
  let failed = 0;
  let wouldRestore = 0;
  let wouldSkipBlocked = 0;
  let wouldStripLine = 0;

  for (const entry of manifest.customers || []) {
    const cid = String(entry.cid || '');
    try {
      const loadResult = await loadAndVerifyPerCustomer({
        bucket,
        backupRef: entry.fileEntry,
      });
      if (!loadResult.ok) {
        failed++;
        perCustomer.push({ cid, outcome: 'failed', error: loadResult.error });
        console.warn(`[FAIL] ${cid}: ${loadResult.error}`);
        continue;
      }
      const { file, backupPrefix } = loadResult;
      const backupCustomer = (file.collections?.be_customers || [])[0];
      if (!backupCustomer) {
        failed++;
        perCustomer.push({ cid, outcome: 'failed', error: 'BACKUP_CUSTOMER_DOC_MISSING' });
        continue;
      }
      const conflicts = scanRestoreConflicts({ backupCustomer, liveCustomers });

      if (conflicts.customerIdExists || conflicts.hnCollision) {
        skippedConflict++;
        if (!args.apply) wouldSkipBlocked++;
        const reason = conflicts.customerIdExists
          ? 'CUSTOMER_ID_EXISTS'
          : 'HN_COLLISION';
        perCustomer.push({
          cid,
          outcome: 'skipped-conflict',
          reason,
          detail: conflicts.hnCollision || { customerId: cid },
        });
        console.warn(`[SKIP] ${cid}: ${reason}`);
        continue;
      }

      if (!args.apply) {
        wouldRestore++;
        if (conflicts.lineConflicts.length > 0) wouldStripLine++;
        perCustomer.push({
          cid,
          outcome: 'would-restore',
          wouldStripLineConflicts: conflicts.lineConflicts.length,
        });
        console.log(`[PREVIEW] ${cid}: would-restore (strip ${conflicts.lineConflicts.length} line conflicts)`);
        continue;
      }

      const restoreResult = await restoreSingleCustomer({
        db,
        bucket,
        file,
        backupPrefix,
        conflicts,
      });
      if (!restoreResult.ok) {
        failed++;
        perCustomer.push({ cid, outcome: 'failed', error: restoreResult.error });
        console.warn(`[FAIL] ${cid}: ${restoreResult.error}`);
        continue;
      }
      restored++;
      perCustomer.push({
        cid,
        outcome: 'restored',
        totalWrites: restoreResult.totalWrites,
        strippedLineConflicts: restoreResult.strippedLineConflicts,
        storageErrors: restoreResult.storageErrors,
      });
      console.log(
        `[OK] ${cid}: restored (${restoreResult.totalWrites} writes, ${restoreResult.storageErrors.length} storage errors)`
      );
    } catch (e) {
      failed++;
      perCustomer.push({ cid, outcome: 'failed', error: e.message });
      console.warn(`[FAIL] ${cid}: ${e.message}`);
    }
  }

  const durationMs = Date.now() - start;

  if (args.apply) {
    await dataCol(db, 'be_admin_audit').doc(parentBatchAuditId).set({
      type: 'whole-fleet-customer-restore',
      backupRef: args.backupRef || `local:${args.localManifest}`,
      manifestHash: recomputedHash,
      restored,
      skippedConflict,
      failed,
      totalCustomers: (manifest.customers || []).length,
      perCustomer,
      durationMs,
      performedBy: { uid: 'cli', email: 'cli-script' },
      performedAt: new Date().toISOString(),
    });
    console.log(`\n[OK] whole-fleet restore complete`);
    console.log(`     restored=${restored}  skipped=${skippedConflict}  failed=${failed}`);
    console.log(`     audit: ${parentBatchAuditId}`);
    console.log(`     duration: ${durationMs} ms`);
  } else {
    console.log(`\n[DRY-RUN] whole-fleet restore preview`);
    console.log(`  Would restore: ${wouldRestore}`);
    console.log(`  Would skip (blocked): ${wouldSkipBlocked}`);
    console.log(`  Would strip line-conflicts: ${wouldStripLine}`);
    console.log(`  Failed (load/verify): ${failed}`);
    console.log(`  Re-run with --apply to commit writes.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(99);
  });
}
