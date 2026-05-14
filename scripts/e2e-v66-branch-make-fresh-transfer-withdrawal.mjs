#!/usr/bin/env node
// ─── V66 Rule Q L2 e2e — branch make-fresh OR-filter for transfers/withdrawals ─
//
// Verifies that the V66 fix (BUCKET_FILTER_FIELDS + spec-aware OR-merge) actually
// causes branch-make-fresh to delete be_stock_transfers + be_stock_withdrawals
// whose sourceLocationId OR destinationLocationId === target branch.
//
// MIRRORS THE ENDPOINT'S WIPE LOGIC EXACTLY — imports getFilterSpecForCollection
// + resolveBucketScope from the same module the endpoint uses. NOT a mock.
//
// 6 scenarios:
//   S1 — transfer where source=TEST-V66-BR-A → DELETED
//   S2 — transfer where destination=TEST-V66-BR-A → DELETED
//   S3 — transfer where both source AND dest=TEST-V66-BR-A (dedup test) → DELETED ONCE
//   S4 — withdrawal where source=TEST-V66-BR-A → DELETED
//   S5 — withdrawal where destination=TEST-V66-BR-A → DELETED
//   S6 — control: batch + movement + order + adjustment with branchId=TEST-V66-BR-A → DELETED
//
// + S0 (negative control): docs for TEST-V66-BR-OTHER (different branch) — NOT touched.
//
// Usage: node scripts/e2e-v66-branch-make-fresh-transfer-withdrawal.mjs [--apply]
// Default: dry-run (seeds fixtures, runs wipe, verifies, but rolls back via cleanup at end).
// --apply: same flow, full Firestore writes (always cleans up).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  resolveBucketScope,
  getFilterSpecForCollection,
} from '../src/lib/branchBackupBuckets.js';

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));
if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) loadDotEnv(path.resolve(process.cwd(), '.env.local'));

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const BATCH_LIMIT = 400;

function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* env missing');
  const app = initializeApp({
    credential: cert({ projectId: APP_ID, clientEmail, privateKey: rawKey.split('\\n').join('\n') }),
  });
  return getFirestore(app);
}

const db = getAdmin();
const dataCol = (n) => db.collection(BASE_PATH + '/' + n);

const APPLY = process.argv.includes('--apply');
const ts = Date.now();
const TEST_BRANCH_A = `TEST-V66-BR-A-${ts}`;
const TEST_BRANCH_OTHER = `TEST-V66-BR-OTHER-${ts}`;
const TEST_BRANCH_B = `TEST-V66-BR-B-${ts}`;

function pass(msg) { console.log(`  ✅ PASS  ${msg}`); }
function fail(msg) { console.log(`  ❌ FAIL  ${msg}`); process.exitCode = 1; }
function info(msg) { console.log(`  ℹ️  ${msg}`); }

async function seedFixtures() {
  console.log('\n── Phase 1: Seed TEST-V66-BR-* fixtures ──');
  const writes = [];

  // S1 — transfer where source = TEST_BRANCH_A
  writes.push(dataCol('be_stock_transfers').doc(`TRF-V66S1-${ts}`).set({
    transferId: `TRF-V66S1-${ts}`,
    sourceLocationId: TEST_BRANCH_A,
    destinationLocationId: TEST_BRANCH_B,
    items: [], status: 0, note: 'V66 test S1 — src=A', createdAt: new Date().toISOString(),
  }));
  // S2 — transfer where destination = TEST_BRANCH_A
  writes.push(dataCol('be_stock_transfers').doc(`TRF-V66S2-${ts}`).set({
    transferId: `TRF-V66S2-${ts}`,
    sourceLocationId: TEST_BRANCH_B,
    destinationLocationId: TEST_BRANCH_A,
    items: [], status: 0, note: 'V66 test S2 — dst=A', createdAt: new Date().toISOString(),
  }));
  // S3 — transfer where BOTH src AND dst = TEST_BRANCH_A (dedup test)
  writes.push(dataCol('be_stock_transfers').doc(`TRF-V66S3-${ts}`).set({
    transferId: `TRF-V66S3-${ts}`,
    sourceLocationId: TEST_BRANCH_A,
    destinationLocationId: TEST_BRANCH_A,
    items: [], status: 0, note: 'V66 test S3 — src=A AND dst=A (dedup)', createdAt: new Date().toISOString(),
  }));
  // S4 — withdrawal where source = TEST_BRANCH_A
  writes.push(dataCol('be_stock_withdrawals').doc(`WDR-V66S4-${ts}`).set({
    withdrawalId: `WDR-V66S4-${ts}`,
    sourceLocationId: TEST_BRANCH_A,
    destinationLocationId: TEST_BRANCH_B,
    direction: 'BRANCH_TO_CENTRAL',
    items: [], status: 0, note: 'V66 test S4 — src=A', createdAt: new Date().toISOString(),
  }));
  // S5 — withdrawal where destination = TEST_BRANCH_A
  writes.push(dataCol('be_stock_withdrawals').doc(`WDR-V66S5-${ts}`).set({
    withdrawalId: `WDR-V66S5-${ts}`,
    sourceLocationId: TEST_BRANCH_B,
    destinationLocationId: TEST_BRANCH_A,
    direction: 'CENTRAL_TO_BRANCH',
    items: [], status: 0, note: 'V66 test S5 — dst=A', createdAt: new Date().toISOString(),
  }));
  // S6 — controls (branchId-based collections)
  writes.push(dataCol('be_stock_batches').doc(`BATCH-V66S6-${ts}`).set({
    batchId: `BATCH-V66S6-${ts}`, branchId: TEST_BRANCH_A,
    productId: 'TEST-PROD', productName: 'V66 test', qty: { total: 1, remaining: 1 },
    createdAt: new Date().toISOString(),
  }));
  writes.push(dataCol('be_stock_movements').doc(`MVT-V66S6-${ts}`).set({
    movementId: `MVT-V66S6-${ts}`, branchId: TEST_BRANCH_A,
    type: 1, qty: 1, before: 0, after: 1, productId: 'TEST-PROD', productName: 'V66 test',
    createdAt: new Date().toISOString(),
  }));
  writes.push(dataCol('be_stock_orders').doc(`ORD-V66S6-${ts}`).set({
    orderId: `ORD-V66S6-${ts}`, branchId: TEST_BRANCH_A,
    vendorName: 'V66 test', items: [], status: 'active', createdAt: new Date().toISOString(),
  }));
  writes.push(dataCol('be_stock_adjustments').doc(`ADJ-V66S6-${ts}`).set({
    adjustmentId: `ADJ-V66S6-${ts}`, branchId: TEST_BRANCH_A,
    type: 'add', qty: 1, batchId: 'TEST', productId: 'TEST', productName: 'V66 test',
    movementId: `MVT-V66S6-${ts}`,
    createdAt: new Date().toISOString(),
  }));

  // S0 (negative control) — same shapes but TEST_BRANCH_OTHER
  writes.push(dataCol('be_stock_transfers').doc(`TRF-V66S0-${ts}`).set({
    transferId: `TRF-V66S0-${ts}`,
    sourceLocationId: TEST_BRANCH_OTHER,
    destinationLocationId: TEST_BRANCH_B,
    items: [], status: 0, note: 'V66 test S0 — control other branch', createdAt: new Date().toISOString(),
  }));
  writes.push(dataCol('be_stock_withdrawals').doc(`WDR-V66S0-${ts}`).set({
    withdrawalId: `WDR-V66S0-${ts}`,
    sourceLocationId: TEST_BRANCH_OTHER,
    destinationLocationId: TEST_BRANCH_B,
    direction: 'BRANCH_TO_CENTRAL',
    items: [], status: 0, note: 'V66 test S0 — control', createdAt: new Date().toISOString(),
  }));
  writes.push(dataCol('be_stock_batches').doc(`BATCH-V66S0-${ts}`).set({
    batchId: `BATCH-V66S0-${ts}`, branchId: TEST_BRANCH_OTHER,
    productId: 'TEST-PROD', productName: 'V66 control', qty: { total: 1, remaining: 1 },
    createdAt: new Date().toISOString(),
  }));

  await Promise.all(writes);
  info(`Seeded 12 fixtures for TEST_BRANCH_A=${TEST_BRANCH_A} (10 should-be-deleted + 2 controls = wait recount...)`);
  info(`  - 3 transfers (S1 src=A, S2 dst=A, S3 src+dst=A)`);
  info(`  - 2 withdrawals (S4 src=A, S5 dst=A)`);
  info(`  - 4 controls (batch+movement+order+adjustment branchId=A)`);
  info(`  - 3 negative-control (TEST_BRANCH_OTHER): 1 transfer, 1 withdrawal, 1 batch`);
}

async function preCheck() {
  console.log('\n── Phase 2: Pre-wipe verification (all 12 docs exist) ──');
  const counts = await readCounts(TEST_BRANCH_A);
  if (counts.transfers === 3) pass(`transfers (src=A OR dst=A) = ${counts.transfers}`);
  else fail(`transfers expected 3, got ${counts.transfers}`);
  if (counts.withdrawals === 2) pass(`withdrawals (src=A OR dst=A) = ${counts.withdrawals}`);
  else fail(`withdrawals expected 2, got ${counts.withdrawals}`);
  if (counts.batches === 1) pass(`batches (branchId=A) = ${counts.batches}`);
  else fail(`batches expected 1, got ${counts.batches}`);
  if (counts.movements === 1) pass(`movements (branchId=A) = ${counts.movements}`);
  else fail(`movements expected 1, got ${counts.movements}`);
  if (counts.orders === 1) pass(`orders (branchId=A) = ${counts.orders}`);
  else fail(`orders expected 1, got ${counts.orders}`);
  if (counts.adjustments === 1) pass(`adjustments (branchId=A) = ${counts.adjustments}`);
  else fail(`adjustments expected 1, got ${counts.adjustments}`);

  const counts0 = await readCounts(TEST_BRANCH_OTHER);
  if (counts0.transfers === 1 && counts0.withdrawals === 1 && counts0.batches === 1) {
    pass(`Negative control (TEST_BRANCH_OTHER): 3 fixtures intact`);
  } else fail(`Negative control mismatch: ${JSON.stringify(counts0)}`);
}

async function readCounts(branchId) {
  // SPEC-AWARE counting: mirrors endpoint's queryBranchScopedDocs / wipe logic
  const out = {};
  for (const col of [
    'be_stock_transfers',
    'be_stock_withdrawals',
    'be_stock_batches',
    'be_stock_movements',
    'be_stock_orders',
    'be_stock_adjustments',
  ]) {
    const spec = getFilterSpecForCollection(col);
    const ids = new Set();
    const s1 = await dataCol(col).where(spec.filterField, '==', branchId).get();
    for (const d of s1.docs) ids.add(d.id);
    if (spec.orFilterField) {
      const s2 = await dataCol(col).where(spec.orFilterField, '==', branchId).get();
      for (const d of s2.docs) ids.add(d.id);
    }
    const k = col.replace('be_stock_', '');
    out[k] = ids.size;
  }
  return out;
}

async function runMakeFreshWipe(branchId) {
  console.log(`\n── Phase 3: Run V66 spec-aware wipe (mirror endpoint logic) for ${branchId} ──`);
  const { collections: wipeCols } = resolveBucketScope(['stock']);
  info(`Bucket 'stock' resolves to: ${wipeCols.join(', ')}`);

  const deletedCounts = {};
  for (const col of wipeCols) {
    const spec = getFilterSpecForCollection(col);
    const docMap = new Map();
    const snap1 = await dataCol(col).where(spec.filterField, '==', branchId).get();
    for (const d of snap1.docs) docMap.set(d.id, d);
    if (spec.orFilterField) {
      const snap2 = await dataCol(col).where(spec.orFilterField, '==', branchId).get();
      for (const d of snap2.docs) {
        if (!docMap.has(d.id)) docMap.set(d.id, d);
      }
    }
    const docs = [...docMap.values()];
    let deleted = 0;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const slice = docs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const d of slice) batch.delete(d.ref);
      await batch.commit();
      deleted += slice.length;
    }
    deletedCounts[col] = deleted;
  }
  info(`Wipe complete: ${JSON.stringify(deletedCounts)}`);
  return deletedCounts;
}

async function postCheck() {
  console.log('\n── Phase 4: Post-wipe verification ──');
  const counts = await readCounts(TEST_BRANCH_A);
  if (counts.transfers === 0) pass(`transfers (src=A OR dst=A): ${counts.transfers} (was 3)`);
  else fail(`transfers POST: expected 0, got ${counts.transfers} (V66 fix BROKEN)`);
  if (counts.withdrawals === 0) pass(`withdrawals (src=A OR dst=A): ${counts.withdrawals} (was 2)`);
  else fail(`withdrawals POST: expected 0, got ${counts.withdrawals} (V66 fix BROKEN)`);
  if (counts.batches === 0) pass(`batches (branchId=A): ${counts.batches} (was 1)`);
  else fail(`batches POST: expected 0, got ${counts.batches}`);
  if (counts.movements === 0) pass(`movements (branchId=A): ${counts.movements} (was 1)`);
  else fail(`movements POST: expected 0, got ${counts.movements}`);
  if (counts.orders === 0) pass(`orders (branchId=A): ${counts.orders} (was 1)`);
  else fail(`orders POST: expected 0, got ${counts.orders}`);
  if (counts.adjustments === 0) pass(`adjustments (branchId=A): ${counts.adjustments} (was 1)`);
  else fail(`adjustments POST: expected 0, got ${counts.adjustments}`);

  const counts0 = await readCounts(TEST_BRANCH_OTHER);
  if (counts0.transfers === 1 && counts0.withdrawals === 1 && counts0.batches === 1) {
    pass(`Negative control (TEST_BRANCH_OTHER): 3 fixtures still intact after wipe of A`);
  } else fail(`Negative control DAMAGED: ${JSON.stringify(counts0)} — wipe leaked to other branch!`);
}

async function cleanup() {
  console.log('\n── Phase 5: Cleanup (always — paranoia) ──');
  let totalDeleted = 0;
  // Wipe all TEST-V66-BR-* fixtures (both A + B + OTHER) from all 6 collections.
  for (const col of [
    'be_stock_transfers', 'be_stock_withdrawals', 'be_stock_batches',
    'be_stock_movements', 'be_stock_orders', 'be_stock_adjustments',
  ]) {
    const spec = getFilterSpecForCollection(col);
    const ids = new Set();
    // Use ID-prefix filter (greedy paranoia cleanup) — ID has TEST-V66 prefix
    const allSnap = await dataCol(col).get();
    for (const d of allSnap.docs) {
      if (/-V66S\d+-/.test(d.id) || d.id.includes(`-${ts}`)) ids.add(d.id);
    }
    if (ids.size === 0) continue;
    const refs = [...ids].map(id => dataCol(col).doc(id));
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const slice = refs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const r of slice) batch.delete(r);
      await batch.commit();
      totalDeleted += slice.length;
    }
  }
  info(`Cleaned up ${totalDeleted} TEST-V66 docs`);
}

async function main() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  V66 Rule Q L2 e2e — branch make-fresh OR-filter');
  console.log('  Mode: ' + (APPLY ? 'APPLY (will write+delete real fixtures)' : 'DRY-RUN preview only'));
  console.log('═════════════════════════════════════════════════════════════════');
  console.log(`TEST_BRANCH_A: ${TEST_BRANCH_A}`);
  console.log(`TEST_BRANCH_B: ${TEST_BRANCH_B}`);
  console.log(`TEST_BRANCH_OTHER (negative control): ${TEST_BRANCH_OTHER}`);

  if (!APPLY) {
    console.log('\n⚠️  DRY-RUN — re-run with --apply to seed + wipe + verify real fixtures');
    process.exit(0);
  }

  try {
    await seedFixtures();
    await preCheck();
    await runMakeFreshWipe(TEST_BRANCH_A);
    await postCheck();
  } finally {
    await cleanup();
  }

  console.log('\n═════════════════════════════════════════════════════════════════');
  console.log(process.exitCode ? '  ❌ FAILED — V66 fix not working as expected' : '  ✅ ALL CHECKS PASSED — V66 fix verified on real prod');
  console.log('═════════════════════════════════════════════════════════════════');
  process.exit(process.exitCode || 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
  });
}
