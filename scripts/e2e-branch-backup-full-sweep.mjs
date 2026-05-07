#!/usr/bin/env node
// ─── V40 Bonus 3: Live full-sweep E2E on real prod Firestore + Storage ──────
// Exercises EVERY backup/restore/clone/make-fresh path with TEST-V40-* fixtures.
// ALL fixtures are TEST-prefixed per V33.10/11/12/13 prefix discipline.
// Cleanup runs in try/finally — always fires on success AND failure.
//
// Run: node scripts/e2e-branch-backup-full-sweep.mjs
//
// Steps:
//   1 — Multi-collection T1 backup with FK chain (product + course referencing it)
//   2 — Overwrite restore (wipe both → restore → verify FK preserved)
//   3 — Clone-T1 to different branch (re-mint IDs + FK remap)
//   4 — Storage existence check (precondition for make-fresh safety gate)
//   5 — Make-fresh simulation (auto-backup + wipe + restore-from-backup)
//   6 — Schema-version rejection (schemaVersion: 99 must throw)
//   7 — Universal collection rejection (resolveBackupScope(['be_staff']) must throw)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import {
  resolveBackupScope,
  T1_FK_SPEC,
  buildFkRemapTable,
  applyFkRemap,
  TIER_MAP,
  BACKUP_TIER_T1,
  isUniversalCollection,
} from '../src/lib/branchBackupCore.js';
import { buildBackupFile, validateBackupFile, BACKUP_SCHEMA_VERSION } from '../src/lib/branchBackupSchema.js';

// ─── env / SDK init ──────────────────────────────────────────────────────────
const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const BUCKET = `${APP_ID}.firebasestorage.app`;

const ts = Date.now();
const randHex = (n = 8) => randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);

const SOURCE_BRANCH = `TEST-BR-V40-SWEEP-${ts}`;
const CLONE_BRANCH  = `TEST-BR-V40-CLONE-${ts}`;

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
    storageBucket: BUCKET,
  });
}
const db  = getFirestore();
const bucket = getStorage().bucket();

function dataCol(name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}

// ─── cleanup registry ────────────────────────────────────────────────────────
const cleanupRefs    = [];   // { ref }
const cleanupPaths   = [];   // storage paths (strings)

// ─── step runner ─────────────────────────────────────────────────────────────
const results = [];
async function step(name, fn) {
  console.log(`\n─── ${name} ───`);
  try {
    await fn();
    results.push({ name, status: '✓' });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, status: '✗', err: e.message });
    console.error(`✗ ${name}: ${e.message}`);
  }
}

// ─── shared state (populated by step 1, consumed by 2/3/4/5) ────────────────
let prodRef   = null;   // Firestore DocumentReference (source product)
let courseRef  = null;  // Firestore DocumentReference (source course)
let PROD_ID    = '';
let COURSE_ID  = '';
let backupStoragePath  = '';   // step 1 backup
let autoFreshPath      = '';   // step 5 auto-pre-fresh backup

// ─── Step 1 ──────────────────────────────────────────────────────────────────
async function s1_multiCollectionBackup() {
  // Create TEST product
  PROD_ID = `TEST-V40-PROD-${ts}`;
  prodRef = dataCol('be_products').doc(PROD_ID);
  await prodRef.set({
    productId: PROD_ID,
    productName: 'V40 Sweep Product',
    branchId: SOURCE_BRANCH,
    productType: 'ยา',
    price: 250,
    status: 'ใช้งาน',
  });
  cleanupRefs.push(prodRef);
  console.log(`  Created product: ${PROD_ID}`);

  // Create TEST course that references the product via items[].productId
  COURSE_ID = `TEST-V40-COURSE-${ts}`;
  courseRef = dataCol('be_courses').doc(COURSE_ID);
  await courseRef.set({
    courseId: COURSE_ID,
    courseName: 'V40 Sweep Course',
    branchId: SOURCE_BRANCH,
    items: [{ productId: PROD_ID, qty: 2, unit: 'ชิ้น' }],
    price: 500,
    status: 'ใช้งาน',
  });
  cleanupRefs.push(courseRef);
  console.log(`  Created course:  ${COURSE_ID}`);

  // Export via admin SDK (mirrors endpoint logic)
  const prodSnap   = await dataCol('be_products').where('branchId', '==', SOURCE_BRANCH).get();
  const courseSnap = await dataCol('be_courses').where('branchId', '==', SOURCE_BRANCH).get();
  const collections = {
    be_products: prodSnap.docs.map(d => ({ ...d.data(), id: d.id })),
    be_courses:  courseSnap.docs.map(d => ({ ...d.data(), id: d.id })),
  };

  // Build + validate schema
  const file = buildBackupFile({
    sourceBranchId: SOURCE_BRANCH,
    exportedBy: 'e2e-full-sweep',
    scope: { tiers: ['T1'] },
    collections,
    isAutoPreFresh: false,
  });
  validateBackupFile(file);  // must not throw

  // Upload to Storage
  const json = JSON.stringify(file);
  backupStoragePath = `backups/${SOURCE_BRANCH}/full-sweep-${ts}.json`;
  await bucket.file(backupStoragePath).save(json, { contentType: 'application/json' });
  cleanupPaths.push(backupStoragePath);
  console.log(`  Backup uploaded: ${backupStoragePath} (${json.length} bytes)`);

  // Assertions
  const f = JSON.parse(json);
  const backedProd   = f.collections.be_products?.find(d => d.id === PROD_ID);
  const backedCourse = f.collections.be_courses?.find(d => d.id === COURSE_ID);
  if (!backedProd)   throw new Error(`ASSERT_FAIL: product ${PROD_ID} not in backup`);
  if (!backedCourse) throw new Error(`ASSERT_FAIL: course ${COURSE_ID} not in backup`);
  if (backedCourse.items?.[0]?.productId !== PROD_ID)
    throw new Error(`ASSERT_FAIL: course.items[0].productId should be ${PROD_ID}`);
  console.log(`  Asserted: product in backup ✓`);
  console.log(`  Asserted: course FK items[0].productId === ${PROD_ID} ✓`);
}

// ─── Step 2 ──────────────────────────────────────────────────────────────────
async function s2_overwriteRestore() {
  // Wipe both docs
  await prodRef.delete();
  await courseRef.delete();
  console.log(`  Wiped source docs (simulating data loss)`);

  // Download backup + restore
  const [data] = await bucket.file(backupStoragePath).download();
  const file   = JSON.parse(data.toString('utf8'));
  validateBackupFile(file);

  for (const [col, docs] of Object.entries(file.collections)) {
    for (const d of docs) {
      const { id, ...rest } = d;
      await dataCol(col).doc(id).set({ ...rest, branchId: SOURCE_BRANCH }, { merge: false });
    }
  }
  console.log(`  Restored ${Object.values(file.collections).flat().length} doc(s)`);

  // Verify product
  const pSnap = await prodRef.get();
  if (!pSnap.exists) throw new Error('ASSERT_FAIL: product missing after restore');
  const pd = pSnap.data();
  if (pd.branchId !== SOURCE_BRANCH) throw new Error(`ASSERT_FAIL: product branchId wrong (${pd.branchId})`);
  if (pd.productName !== 'V40 Sweep Product') throw new Error('ASSERT_FAIL: productName mismatch');

  // Verify course + FK
  const cSnap = await courseRef.get();
  if (!cSnap.exists) throw new Error('ASSERT_FAIL: course missing after restore');
  const cd = cSnap.data();
  if (cd.branchId !== SOURCE_BRANCH) throw new Error(`ASSERT_FAIL: course branchId wrong (${cd.branchId})`);
  if (cd.items?.[0]?.productId !== PROD_ID)
    throw new Error(`ASSERT_FAIL: course FK not preserved after restore (got ${cd.items?.[0]?.productId})`);

  console.log(`  Asserted: product restored with correct branchId ✓`);
  console.log(`  Asserted: course FK items[0].productId === ${PROD_ID} (verbatim, not remapped) ✓`);
}

// ─── Step 3 ──────────────────────────────────────────────────────────────────
async function s3_cloneToNewBranch() {
  // Download backup
  const [data] = await bucket.file(backupStoragePath).download();
  const file   = JSON.parse(data.toString('utf8'));

  // Pre-mint deterministic new IDs
  const PRODUCT_NEW_ID = `PRODUCTS_${ts}_${randHex(4).toUpperCase()}_0`;
  const COURSE_NEW_ID  = `COURSES_${ts}_${randHex(4).toUpperCase()}_0`;

  const prodSources   = file.collections.be_products || [];
  const courseSources = file.collections.be_courses  || [];

  // Build remap tables: be_products + be_courses
  const remapTables = {
    be_products: buildFkRemapTable(prodSources, [PRODUCT_NEW_ID]),
    be_courses:  buildFkRemapTable(courseSources, [COURSE_NEW_ID]),
  };

  // Apply FK remap to course — items[].productId must become PRODUCT_NEW_ID
  const sourceCourse = courseSources.find(d => d.id === COURSE_ID);
  if (!sourceCourse) throw new Error('ASSERT_FAIL: source course not found in backup for clone step');
  const auditCtx = { unmapped: [] };
  const remappedCourse = applyFkRemap(sourceCourse, T1_FK_SPEC.be_courses, remapTables, auditCtx);
  if (remappedCourse.items?.[0]?.productId !== PRODUCT_NEW_ID)
    throw new Error(`ASSERT_FAIL: applyFkRemap did not remap to ${PRODUCT_NEW_ID} (got ${remappedCourse.items?.[0]?.productId})`);
  console.log(`  applyFkRemap → items[0].productId remapped to ${PRODUCT_NEW_ID} ✓`);

  // Write cloned product to CLONE_BRANCH
  const clonedProdRef = dataCol('be_products').doc(PRODUCT_NEW_ID);
  const { id: _p, ...prodRest } = prodSources.find(d => d.id === PROD_ID) || {};
  await clonedProdRef.set({
    ...prodRest,
    productId: PRODUCT_NEW_ID,
    branchId: CLONE_BRANCH,
  }, { merge: false });
  cleanupRefs.push(clonedProdRef);
  console.log(`  Cloned product → ${PRODUCT_NEW_ID} in branch ${CLONE_BRANCH}`);

  // Write cloned course to CLONE_BRANCH (with remapped FK)
  const clonedCourseRef = dataCol('be_courses').doc(COURSE_NEW_ID);
  const { id: _c, ...courseRest } = remappedCourse;
  await clonedCourseRef.set({
    ...courseRest,
    courseId: COURSE_NEW_ID,
    branchId: CLONE_BRANCH,
  }, { merge: false });
  cleanupRefs.push(clonedCourseRef);
  console.log(`  Cloned course  → ${COURSE_NEW_ID} in branch ${CLONE_BRANCH}`);

  // Verify cloned product exists + correct branch
  const cpSnap = await clonedProdRef.get();
  if (!cpSnap.exists) throw new Error(`ASSERT_FAIL: cloned product ${PRODUCT_NEW_ID} missing`);
  const cpd = cpSnap.data();
  if (cpd.branchId !== CLONE_BRANCH) throw new Error(`ASSERT_FAIL: cloned product branchId wrong (${cpd.branchId})`);
  if (cpd.productId !== PRODUCT_NEW_ID) throw new Error(`ASSERT_FAIL: cloned product.productId should be ${PRODUCT_NEW_ID}`);

  // Verify cloned course + FK points to NEW product (not old)
  const ccSnap = await clonedCourseRef.get();
  if (!ccSnap.exists) throw new Error(`ASSERT_FAIL: cloned course ${COURSE_NEW_ID} missing`);
  const ccd = ccSnap.data();
  if (ccd.branchId !== CLONE_BRANCH) throw new Error(`ASSERT_FAIL: cloned course branchId wrong (${ccd.branchId})`);
  if (ccd.items?.[0]?.productId !== PRODUCT_NEW_ID)
    throw new Error(`ASSERT_FAIL: cloned course FK should point to ${PRODUCT_NEW_ID}, got ${ccd.items?.[0]?.productId}`);
  if (ccd.items?.[0]?.productId === PROD_ID)
    throw new Error(`ASSERT_FAIL: cloned course FK still points to OLD ${PROD_ID} — remap failed`);

  console.log(`  Asserted: cloned product exists with correct branchId + canonical productId ✓`);
  console.log(`  Asserted: cloned course FK → ${PRODUCT_NEW_ID} (NOT old ${PROD_ID}) ✓`);
  if (auditCtx.unmapped.length > 0) {
    console.log(`  (unmapped FKs: ${auditCtx.unmapped.length} — expected 0 for this fixture)`);
  }
}

// ─── Step 4 ──────────────────────────────────────────────────────────────────
async function s4_storageExistenceCheck() {
  // Confirm our backup exists (precondition of make-fresh safety gate)
  const [exists] = await bucket.file(backupStoragePath).exists();
  if (!exists) throw new Error(`ASSERT_FAIL: backup should exist at ${backupStoragePath}`);
  console.log(`  Confirmed backup exists at ${backupStoragePath} ✓`);

  // Confirm a nonexistent path returns false (the safety gate would reject this)
  const fakeRef = `backups/NONEXISTENT-${ts}.json`;
  const [fakeExists] = await bucket.file(fakeRef).exists();
  if (fakeExists) throw new Error(`ASSERT_FAIL: fake path should NOT exist`);
  console.log(`  Confirmed nonexistent path returns false (make-fresh gate would reject) ✓`);

  // Source-grep check: branch-make-fresh.mjs must contain the safety guard
  const mfSource = readFileSync(new URL('../scripts/branch-make-fresh.mjs', import.meta.url), 'utf8');
  if (!mfSource.includes('FATAL: backup verify FAILED')) {
    throw new Error('ASSERT_FAIL: branch-make-fresh.mjs missing safety guard comment "FATAL: backup verify FAILED"');
  }
  console.log(`  Confirmed branch-make-fresh.mjs has backup-verify safety gate ✓`);
}

// ─── Step 5 ──────────────────────────────────────────────────────────────────
async function s5_makeFreshSimulation() {
  // Generate auto-pre-fresh backup (mirrors branch-make-fresh.mjs Step 1)
  const t1Scope = resolveBackupScope({ tiers: ['T1'] });
  const outCollections = {};
  for (const colName of t1Scope) {
    if (colName === 'be_customers/__per_customer__') continue; // T4: skip for this minimal fixture
    const snap = await dataCol(colName).where('branchId', '==', SOURCE_BRANCH).get();
    if (!snap.empty) {
      outCollections[colName] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    }
  }

  const autoFile = buildBackupFile({
    sourceBranchId: SOURCE_BRANCH,
    exportedBy: 'e2e-full-sweep-auto',
    scope: { tiers: ['T1'] },
    collections: outCollections,
    isAutoPreFresh: true,
  });
  if (!autoFile.meta.isAutoPreFresh) throw new Error('ASSERT_FAIL: isAutoPreFresh must be true');

  const autoJson = JSON.stringify(autoFile);
  autoFreshPath = `backups/${SOURCE_BRANCH}/auto-pre-fresh-${ts}-${randHex(4)}.json`;
  await bucket.file(autoFreshPath).save(autoJson, { contentType: 'application/json' });
  cleanupPaths.push(autoFreshPath);
  console.log(`  Auto-backup uploaded: ${autoFreshPath} ✓`);

  // Verify exists (the safety gate check)
  const [exists] = await bucket.file(autoFreshPath).exists();
  if (!exists) throw new Error('ASSERT_FAIL: auto-pre-fresh backup must exist before wipe');
  console.log(`  Verified auto-backup exists before wipe ✓`);

  // Wipe T1 docs for SOURCE_BRANCH (be_products + be_courses only — what we created)
  const wipeCollections = ['be_products', 'be_courses'];
  let wipedTotal = 0;
  for (const col of wipeCollections) {
    const snap = await dataCol(col).where('branchId', '==', SOURCE_BRANCH).get();
    if (!snap.empty) {
      const batch = db.batch();
      for (const d of snap.docs) batch.delete(d.ref);
      await batch.commit();
      wipedTotal += snap.size;
      console.log(`  Wiped ${snap.size} ${col} doc(s) for ${SOURCE_BRANCH}`);
    }
  }
  if (wipedTotal === 0) throw new Error('ASSERT_FAIL: expected at least some docs to wipe');

  // Verify wipe occurred
  for (const col of wipeCollections) {
    const snap = await dataCol(col).where('branchId', '==', SOURCE_BRANCH).get();
    if (!snap.empty) throw new Error(`ASSERT_FAIL: ${col} still has docs after wipe (${snap.size})`);
  }
  console.log(`  Verified wipe: 0 docs remain for ${SOURCE_BRANCH} in wiped collections ✓`);

  // Restore from auto-pre-fresh backup
  const [autoData] = await bucket.file(autoFreshPath).download();
  const restoredFile = JSON.parse(autoData.toString('utf8'));
  validateBackupFile(restoredFile);
  let restoredTotal = 0;
  for (const [col, docs] of Object.entries(restoredFile.collections)) {
    for (const d of docs) {
      const { id, ...rest } = d;
      await dataCol(col).doc(id).set({ ...rest, branchId: SOURCE_BRANCH }, { merge: false });
      restoredTotal++;
    }
  }
  console.log(`  Restored ${restoredTotal} doc(s) from auto-pre-fresh backup`);

  // Verify docs are back
  const pSnap = await prodRef.get();
  if (!pSnap.exists) throw new Error('ASSERT_FAIL: product missing after make-fresh restore');
  const pd = pSnap.data();
  if (pd.branchId !== SOURCE_BRANCH) throw new Error(`ASSERT_FAIL: product branchId wrong after restore (${pd.branchId})`);

  const cSnap = await courseRef.get();
  if (!cSnap.exists) throw new Error('ASSERT_FAIL: course missing after make-fresh restore');
  const cd = cSnap.data();
  if (cd.branchId !== SOURCE_BRANCH) throw new Error(`ASSERT_FAIL: course branchId wrong after restore (${cd.branchId})`);
  if (cd.items?.[0]?.productId !== PROD_ID)
    throw new Error(`ASSERT_FAIL: course FK mismatch after make-fresh restore (got ${cd.items?.[0]?.productId})`);

  console.log(`  Asserted: product back with correct branchId ✓`);
  console.log(`  Asserted: course back with correct FK ✓`);
}

// ─── Step 6 ──────────────────────────────────────────────────────────────────
async function s6_schemaVersionReject() {
  const badFile = {
    meta: {
      schemaVersion: 99,
      sourceBranchId: SOURCE_BRANCH,
      exportedBy: 'e2e-bad',
      exportedAt: new Date().toISOString(),
      scope: { tiers: ['T1'] },
      perCollectionCounts: {},
      isAutoPreFresh: false,
    },
    collections: {},
  };

  let threw = false;
  let thrownMsg = '';
  try {
    validateBackupFile(badFile);
  } catch (e) {
    threw = true;
    thrownMsg = e.message;
  }

  if (!threw) throw new Error('ASSERT_FAIL: validateBackupFile should throw for schemaVersion 99');
  if (!thrownMsg.includes('SCHEMA_VERSION_UNSUPPORTED'))
    throw new Error(`ASSERT_FAIL: expected SCHEMA_VERSION_UNSUPPORTED, got: ${thrownMsg}`);

  console.log(`  validateBackupFile(schemaVersion:99) → threw SCHEMA_VERSION_UNSUPPORTED ✓`);
  console.log(`  Current BACKUP_SCHEMA_VERSION = ${BACKUP_SCHEMA_VERSION}`);
}

// ─── Step 7 ──────────────────────────────────────────────────────────────────
async function s7_universalCollectionReject() {
  const universalCases = ['be_staff', 'be_customers', 'be_branches', 'chat_conversations'];
  for (const col of universalCases) {
    let threw = false;
    let thrownMsg = '';
    try {
      resolveBackupScope({ collections: [col] });
    } catch (e) {
      threw = true;
      thrownMsg = e.message;
    }
    if (!threw) throw new Error(`ASSERT_FAIL: resolveBackupScope(['${col}']) should throw`);
    if (!thrownMsg.includes('UNIVERSAL_COLLECTION_NOT_BACKUPABLE'))
      throw new Error(`ASSERT_FAIL: expected UNIVERSAL_COLLECTION_NOT_BACKUPABLE for ${col}, got: ${thrownMsg}`);
    console.log(`  resolveBackupScope(['${col}']) → UNIVERSAL_COLLECTION_NOT_BACKUPABLE ✓`);
  }

  // Also verify isUniversalCollection returns true for them
  for (const col of universalCases) {
    if (!isUniversalCollection(col))
      throw new Error(`ASSERT_FAIL: isUniversalCollection('${col}') should return true`);
  }
  console.log(`  isUniversalCollection checks all passed ✓`);
}

// ─── cleanup ─────────────────────────────────────────────────────────────────
async function doCleanup() {
  console.log('\n🧹 Cleanup...');
  let cleaned = 0;

  for (const ref of cleanupRefs) {
    try {
      const snap = await ref.get();
      if (snap.exists) {
        await ref.delete();
        cleaned++;
      }
    } catch (e) {
      console.log(`  ! ref cleanup error: ${e.message}`);
    }
  }

  for (const path of cleanupPaths) {
    try {
      const [exists] = await bucket.file(path).exists();
      if (exists) {
        await bucket.file(path).delete();
        cleaned++;
      }
    } catch (e) {
      console.log(`  ! storage cleanup error (${path}): ${e.message}`);
    }
  }

  // Orphan sweep: query both branches for any TEST-V40-* residue
  for (const col of ['be_products', 'be_courses']) {
    for (const branch of [SOURCE_BRANCH, CLONE_BRANCH]) {
      try {
        const snap = await dataCol(col).where('branchId', '==', branch).get();
        for (const d of snap.docs) {
          await d.ref.delete();
          cleaned++;
          console.log(`  ! orphan deleted: ${col}/${d.id}`);
        }
      } catch (e) { /* ignore */ }
    }
  }

  console.log(`   ✓ ${cleaned} items cleaned`);
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══ V40 Full-Sweep E2E ═══');
  console.log(`Test branch (source): ${SOURCE_BRANCH}`);
  console.log(`Test branch (clone target): ${CLONE_BRANCH}`);

  await step('Step 1: Multi-collection T1 backup with FK chain', s1_multiCollectionBackup);
  await step('Step 2: Overwrite restore', s2_overwriteRestore);
  await step('Step 3: Clone-T1 to different branch', s3_cloneToNewBranch);
  await step('Step 4: Storage existence check (make-fresh safety gate)', s4_storageExistenceCheck);
  await step('Step 5: Make-fresh simulation (auto-backup + wipe + restore)', s5_makeFreshSimulation);
  await step('Step 6: Schema-version rejection (schemaVersion: 99)', s6_schemaVersionReject);
  await step('Step 7: Universal collection rejection', s7_universalCollectionReject);

  console.log('\n');
  const passed = results.filter(r => r.status === '✓').length;
  const failed = results.filter(r => r.status === '✗').length;
  console.log(`═══ Summary: ${passed}/${results.length} PASS ═══`);
  if (failed > 0) {
    for (const r of results.filter(r => r.status === '✗')) {
      console.log(`  ✗ ${r.name}: ${r.err}`);
    }
  }

  await doCleanup();

  if (failed > 0) {
    console.log('\n═══ ✗ FULL SWEEP — SOME STEPS FAILED ═══');
    process.exit(1);
  } else {
    console.log('\n═══ ✓ FULL SWEEP PASS ═══');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(async (e) => {
    console.error('\nFATAL (unhandled):', e.message || e);
    await doCleanup();
    process.exit(1);
  });
}
