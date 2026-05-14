#!/usr/bin/env node
// ─── Rule Q L2 round-trip integrity e2e for CENTRAL STOCK ──────────────────
// THE critical verification artifact per user directive 2026-05-15:
// "ระบบ backup ทุกอันต้องเทสให้แน่ใจที่สุดว่า Backup ออกมาแล้ว สามารถ restore
//  เข้าไปได้แล้วเหมือนเดิม 100% เหมือนกัน"
//
// 8-phase round-trip on TEST-CSRT-prefixed warehouse + fixtures on REAL prod
// Firestore. Rule R env-pull authorization standing. Rule M two-phase --apply
// discipline.
//
// Usage (Windows PowerShell):
//   vercel env pull .env.local.prod --environment=production
//   node scripts/e2e-central-stock-roundtrip-real-prod.mjs           # dry-run
//   node scripts/e2e-central-stock-roundtrip-real-prod.mjs --apply   # commit writes

import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CENTRAL_BUCKETS, resolveCentralBucketScope } from '../src/lib/centralStockBuckets.js';
import { computeBodyHash, buildBackupFile, validateBackupFile, jsonReplacerForNonFinite, jsonReviverForNonFinite } from '../src/lib/branchBackupSchema.js';

// Canonical inline env loader (mirror of branch e2e script)
function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
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
const BUCKET_NAME = `${APP_ID}.firebasestorage.app`;
const APPLY = process.argv.includes('--apply');

function getAdmin() {
  if (getApps().length > 0) {
    const app = getApp();
    return { db: getFirestore(app), bucket: getStorage(app).bucket(BUCKET_NAME) };
  }
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error('Missing FIREBASE_ADMIN_* env. Run: vercel env pull .env.local.prod --environment=production');
  }
  const app = initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail,
      privateKey: rawKey.split('\\n').join('\n'),
    }),
    storageBucket: BUCKET_NAME,
  });
  return { db: getFirestore(app), bucket: getStorage(app).bucket(BUCKET_NAME) };
}

function dataCol(db, name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}
function randHex(n = 8) { return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n); }

const TEST_PREFIX = 'TEST-CSRT';
const TS = Date.now();
const TEST_WAREHOUSE_ID = `${TEST_PREFIX}-WH-${TS}`;

// Adversarial fixtures: Thai/Unicode/Timestamps/refs/large/nested/counter
function buildAdversarialFixtures(warehouseId) {
  return {
    be_central_stock_orders: [
      { id: `${TEST_PREFIX}-PO-${TS}-1`, warehouseId, vendor: 'ผู้ขายตัวอย่าง', items: [{ name: 'รายการ ก', qty: 50 }], total: 12500 },
      { id: `${TEST_PREFIX}-PO-${TS}-2`, warehouseId, vendor: 'é vendor (NFC: é)', total: 8800 },
    ],
    be_central_stock_movements: [
      { id: `${TEST_PREFIX}-MV-${TS}-1`, warehouseId, type: 'IN', qty: 50, productId: 'TEST-P-001' },
    ],
    be_stock_batches: [
      { id: `${TEST_PREFIX}-BATCH-${TS}-1`, locationId: warehouseId, productId: 'TEST-P-001', qty: { remaining: 50, total: 50 }, note: 'ทดสอบไทย' },
    ],
    be_stock_movements: [
      { id: `${TEST_PREFIX}-SM-${TS}-1`, locationId: warehouseId, productId: 'TEST-P-001', type: 'IN', qty: 50, deeplyNested: { a: { b: { c: { d: 'deep' } } } } },
    ],
    be_stock_transfers: [
      { id: `${TEST_PREFIX}-TR-${TS}-1`, sourceLocationId: warehouseId, destLocationId: 'TEST-BRANCH-X', qty: 10, status: 'completed' },
    ],
    be_stock_withdrawals: [
      { id: `${TEST_PREFIX}-WD-${TS}-1`, sourceLocationId: warehouseId, requestingBranchId: 'TEST-BRANCH-X', qty: 5, status: 'pending' },
    ],
    be_stock_adjustments: [
      { id: `${TEST_PREFIX}-ADJ-${TS}-1`, locationId: warehouseId, type: 'add', qty: 3, reason: 'ทดสอบปรับเพิ่ม' },
    ],
  };
}

function buildCounterDoc() {
  return { yearMonth: '2026-05', seq: 42, updatedAt: new Date().toISOString() };
}

async function phase1Seed(db) {
  console.log(`[Phase 1] Seeding TEST fixtures on warehouse ${TEST_WAREHOUSE_ID}`);
  const fixtures = buildAdversarialFixtures(TEST_WAREHOUSE_ID);
  const counterData = buildCounterDoc();

  if (!APPLY) {
    const counts = Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [k, v.length]));
    counts.warehouse_master = 1;
    counts.counter_doc = 1;
    console.log('  [DRY-RUN] would seed:', counts);
    return { fixtures, counterData };
  }

  let seedCount = 0;
  // Seed warehouse master record (NEVER wiped — should survive all scenarios)
  await dataCol(db, 'be_central_stock_warehouses').doc(TEST_WAREHOUSE_ID).set({
    id: TEST_WAREHOUSE_ID, stockId: TEST_WAREHOUSE_ID,
    stockName: 'TEST CSRT Warehouse', isActive: true,
  });
  seedCount++;

  // Seed fixtures
  for (const [col, docs] of Object.entries(fixtures)) {
    for (const doc of docs) {
      await dataCol(db, col).doc(doc.id).set(doc);
      seedCount++;
    }
  }

  // Seed counter doc
  await dataCol(db, 'be_central_stock_orders_counter').doc('counter').set(counterData);
  seedCount++;

  console.log(`  [APPLY] seeded ${seedCount} docs`);
  return { fixtures, counterData };
}

async function snapshotScope(db, bucketIds) {
  const { collections, counterDocs } = resolveCentralBucketScope(bucketIds);
  const out = {};
  const wid = TEST_WAREHOUSE_ID;
  for (const spec of collections) {
    const key = `${spec.name}/${wid}`;
    const seen = new Set();
    const collected = [];
    const primary = await dataCol(db, spec.name).where(spec.filterField, '==', wid).get();
    for (const d of primary.docs) {
      seen.add(d.id);
      collected.push({ ...d.data(), id: d.id });
    }
    if (spec.orFilterField) {
      const or = await dataCol(db, spec.name).where(spec.orFilterField, '==', wid).get();
      for (const d of or.docs) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          collected.push({ ...d.data(), id: d.id });
        }
      }
    }
    if (collected.length > 0) out[key] = collected;
  }
  for (const cdName of counterDocs) {
    const cdSnap = await dataCol(db, cdName).doc('counter').get();
    if (cdSnap.exists) {
      out[`${cdName}/counter`] = [{ id: 'counter', ...cdSnap.data() }];
    }
  }
  return out;
}

async function phase2Snapshot(db, bucketIds) {
  console.log(`[Phase 2] Snapshotting pre-state for buckets: ${bucketIds.join(', ')}`);
  if (!APPLY) { console.log('  [DRY-RUN] skip'); return { snap: {}, hash: '' }; }
  const snap = await snapshotScope(db, bucketIds);
  const hash = computeBodyHash(snap);
  console.log(`  pre-state hash: ${hash}`);
  return { snap, hash };
}

async function phase3Backup(db, bucket, bucketIds) {
  console.log('[Phase 3] Build + upload selective backup');
  if (!APPLY) { console.log('  [DRY-RUN] skip'); return { storagePath: null, file: null }; }

  const out = await snapshotScope(db, bucketIds);
  const file = buildBackupFile({
    sourceBranchId: TEST_WAREHOUSE_ID,
    exportedBy: 'e2e-csrt-script',
    scope: { scopeKind: 'central', warehouseIds: [TEST_WAREHOUSE_ID], bucketIds },
    collections: out,
    isAutoPreFresh: false,
    bucketIds,
  });
  // Inject central-specific meta (mirror central-stock-backup-export.js)
  file.meta.scopeKind = 'central';
  file.meta.warehouseIds = [TEST_WAREHOUSE_ID];
  validateBackupFile(file);

  const storagePath = `backups/central/${TEST_WAREHOUSE_ID}/e2e-csrt-${TS}-${randHex()}.json`;
  const json = JSON.stringify(file, jsonReplacerForNonFinite);
  await bucket.file(storagePath).save(json, { contentType: 'application/json' });
  console.log(`  uploaded: ${storagePath}`);
  console.log(`  bodyHash: ${file.meta.bodyHash}`);
  return { storagePath, file };
}

async function phase4Wipe(db, bucketIds) {
  console.log('[Phase 4] Wipe selected scope');
  if (!APPLY) { console.log('  [DRY-RUN] skip'); return; }
  const { collections, counterDocs } = resolveCentralBucketScope(bucketIds);
  const wid = TEST_WAREHOUSE_ID;
  for (const spec of collections) {
    const seen = new Set();
    const allDocs = [];
    const primary = await dataCol(db, spec.name).where(spec.filterField, '==', wid).get();
    for (const d of primary.docs) { seen.add(d.id); allDocs.push(d); }
    if (spec.orFilterField) {
      const or = await dataCol(db, spec.name).where(spec.orFilterField, '==', wid).get();
      for (const d of or.docs) if (!seen.has(d.id)) { seen.add(d.id); allDocs.push(d); }
    }
    if (allDocs.length === 0) continue;
    const batch = db.batch();
    for (const d of allDocs) batch.delete(d.ref);
    await batch.commit();
  }
  // Counter docs delete
  for (const cdName of counterDocs) {
    const ref = dataCol(db, cdName).doc('counter');
    const snap = await ref.get();
    if (snap.exists) await ref.delete();
  }
}

async function phase5AssertWiped(db, bucketIds) {
  console.log('[Phase 5] Assert wiped scope empty + warehouse master intact');
  if (!APPLY) { console.log('  [DRY-RUN] skip'); return; }

  const { collections, counterDocs } = resolveCentralBucketScope(bucketIds);
  const wid = TEST_WAREHOUSE_ID;
  for (const spec of collections) {
    const primary = await dataCol(db, spec.name).where(spec.filterField, '==', wid).get();
    if (primary.size !== 0) throw new Error(`Phase 5 FAIL: ${spec.name} primary has ${primary.size} docs after wipe`);
    if (spec.orFilterField) {
      const or = await dataCol(db, spec.name).where(spec.orFilterField, '==', wid).get();
      if (or.size !== 0) throw new Error(`Phase 5 FAIL: ${spec.name} ${spec.orFilterField} has ${or.size} docs after wipe`);
    }
  }
  for (const cdName of counterDocs) {
    const cdSnap = await dataCol(db, cdName).doc('counter').get();
    if (cdSnap.exists) throw new Error(`Phase 5 FAIL: counter ${cdName} still exists after wipe`);
  }
  // Warehouse master MUST be untouched
  const masterSnap = await dataCol(db, 'be_central_stock_warehouses').doc(wid).get();
  if (!masterSnap.exists) throw new Error('Phase 5 FAIL: warehouse master was wiped (should NEVER happen)');
  console.log('  wiped scope EMPTY ✓');
  console.log('  warehouse master INTACT ✓');
}

async function phase6Restore(db, bucket, storagePath) {
  console.log(`[Phase 6] Restore from ${storagePath}`);
  if (!APPLY) { console.log('  [DRY-RUN] skip'); return; }

  const [data] = await bucket.file(storagePath).download();
  const file = JSON.parse(data.toString('utf8'), jsonReviverForNonFinite);
  validateBackupFile(file);
  const recomputed = computeBodyHash(file.collections);
  if (recomputed !== file.meta.bodyHash) {
    throw new Error(`Phase 6 FAIL: hash mismatch on download — file says ${file.meta.bodyHash}, recomputed ${recomputed}`);
  }
  console.log('  hash verified on download ✓');

  for (const [key, docs] of Object.entries(file.collections)) {
    if (docs.length === 0) continue;
    // Key shape: "be_xxx/{warehouseId}" or "be_xxx_counter/counter"
    const parts = key.split('/');
    const colName = parts[0];
    if (key.endsWith('/counter')) {
      // Counter doc restore
      for (const d of docs) {
        const { id, ...rest } = d;
        await dataCol(db, colName).doc('counter').set(rest);
      }
    } else {
      const batch = db.batch();
      for (const d of docs) {
        const { id, ...rest } = d;
        batch.set(dataCol(db, colName).doc(id), rest);
      }
      await batch.commit();
    }
  }
  console.log('  restored');
}

async function phase7AssertRoundTrip(db, bucketIds, preState) {
  console.log('[Phase 7] Assert post-restore == pre-state (HASH BYTE-EQUAL)');
  if (!APPLY) { console.log('  [DRY-RUN] skip'); return; }

  const postSnap = await snapshotScope(db, bucketIds);
  const postHash = computeBodyHash(postSnap);

  if (postHash !== preState.hash) {
    const diffPath = `e2e-csrt-mismatch-${TS}.json`;
    fs.writeFileSync(diffPath, JSON.stringify({ pre: preState.snap, post: postSnap }, null, 2));
    throw new Error(`Phase 7 FAIL: round-trip hash mismatch — pre ${preState.hash}, post ${postHash}. Diff: ${diffPath}`);
  }
  console.log(`  round-trip hash MATCH ✓ (${postHash})`);
}

async function cleanupTestArtifacts(db, bucket) {
  console.log('[Cleanup] Delete all TEST fixtures + Storage files + warehouse master');
  if (!APPLY) { console.log('  [DRY-RUN] skip'); return; }

  let deleted = 0;
  const wid = TEST_WAREHOUSE_ID;
  // Wipe ALL central collections related to test warehouse
  for (const bucketId of Object.keys(CENTRAL_BUCKETS)) {
    const bucketDef = CENTRAL_BUCKETS[bucketId];
    for (const spec of bucketDef.collections) {
      const seen = new Set();
      const allDocs = [];
      const primary = await dataCol(db, spec.name).where(spec.filterField, '==', wid).get();
      for (const d of primary.docs) { seen.add(d.id); allDocs.push(d); }
      if (spec.orFilterField) {
        const or = await dataCol(db, spec.name).where(spec.orFilterField, '==', wid).get();
        for (const d of or.docs) if (!seen.has(d.id)) { seen.add(d.id); allDocs.push(d); }
      }
      if (allDocs.length === 0) continue;
      const batch = db.batch();
      for (const d of allDocs) { batch.delete(d.ref); deleted++; }
      await batch.commit();
    }
    for (const cdName of bucketDef.counterDocs) {
      const ref = dataCol(db, cdName).doc('counter');
      const snap = await ref.get();
      if (snap.exists) { await ref.delete(); deleted++; }
    }
  }
  // Delete warehouse master
  try {
    await dataCol(db, 'be_central_stock_warehouses').doc(wid).delete();
    deleted++;
  } catch {}

  // Cleanup Storage backups
  let storageFiles = 0;
  try {
    const [files] = await bucket.getFiles({ prefix: `backups/central/${wid}/` });
    for (const f of files) { await f.delete(); storageFiles++; }
  } catch {}

  console.log(`  deleted ${deleted} Firestore docs + ${storageFiles} Storage files`);

  const auditId = `e2e-central-csrt-cleanup-${TS}-${randHex()}`;
  await dataCol(db, 'be_admin_audit').doc(auditId).set({
    action: 'e2e-central-csrt-cleanup',
    warehouse: TEST_WAREHOUSE_ID,
    deleted,
    storageFiles,
    executedAt: new Date().toISOString(),
  });
}

async function runScenario(db, bucket, scenarioName, bucketIds) {
  console.log(`\n━━━ Scenario: ${scenarioName} (buckets: ${bucketIds.join(', ')}) ━━━`);
  await phase1Seed(db);
  const preState = await phase2Snapshot(db, bucketIds);
  const { storagePath } = await phase3Backup(db, bucket, bucketIds);
  await phase4Wipe(db, bucketIds);
  await phase5AssertWiped(db, bucketIds);
  await phase6Restore(db, bucket, storagePath);
  await phase7AssertRoundTrip(db, bucketIds, preState);
  await cleanupTestArtifacts(db, bucket);
  console.log(`✓ Scenario ${scenarioName} PASSED`);
}

async function main() {
  console.log(`▶ Central Stock round-trip integrity e2e (APPLY=${APPLY})`);
  if (!APPLY) console.log('  DRY-RUN mode — no writes. Pass --apply to commit.');

  const { db, bucket } = getAdmin();

  // 4 single-bucket scenarios + 1 all-4 combined = 5 total
  const scenarios = [
    ['cs_po-only', ['cs_po']],
    ['cs_stock_ledger-only', ['cs_stock_ledger']],
    ['cs_transfers_withdrawals-only', ['cs_transfers_withdrawals']],
    ['cs_adjustments-only', ['cs_adjustments']],
    ['all-4-buckets', Object.keys(CENTRAL_BUCKETS)],
  ];

  let passCount = 0;
  for (const [name, bucketIds] of scenarios) {
    try {
      await runScenario(db, bucket, name, bucketIds);
      passCount++;
    } catch (e) {
      console.error(`✗ Scenario ${name} FAILED:`, e.message);
      console.error(e.stack);
      try { await cleanupTestArtifacts(db, bucket); } catch {}
      process.exit(1);
    }
  }

  console.log(`\n✓ ALL ${passCount}/${scenarios.length} SCENARIOS PASSED`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
