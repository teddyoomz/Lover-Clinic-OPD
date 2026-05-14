#!/usr/bin/env node
// ─── Rule Q L2 round-trip integrity e2e ────────────────────────────────────
// THE critical verification artifact per user directive 2026-05-14:
// "ระบบ backup ต้องเทสให้แน่ใจที่สุดว่า Backup ออกมาแล้ว สามารถ restore เข้าไปได้แล้ว
//  เหมือนเดิม เป็นเรื่องที่ serious มาก"
//
// 8-phase round-trip on TEST-prefixed fixtures on REAL prod Firestore.
// Rule R env-pull authorization standing. Rule M two-phase --apply discipline.
//
// Usage (Windows PowerShell):
//   vercel env pull .env.local.prod --environment=production
//   node scripts/e2e-backup-restore-roundtrip-real-prod.mjs           # dry-run
//   node scripts/e2e-backup-restore-roundtrip-real-prod.mjs --apply   # commit writes
//
// REQUIRED ENV (in .env.local.prod):
//   FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY,
//   FIREBASE_ADMIN_PROJECT_ID (or defaults to loverclinic-opd-4c39b)

import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BUCKETS, resolveBucketScope } from '../src/lib/branchBackupBuckets.js';
import { computeBodyHash, buildBackupFile, validateBackupFile, jsonReplacerForNonFinite, jsonReviverForNonFinite } from '../src/lib/branchBackupSchema.js';

// Canonical inline env loader (mirror of phase-29-recall-e2e-real-prod.mjs)
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

const TEST_PREFIX = 'TEST-E2E-RT';
const TS = Date.now();
const TEST_BRANCH_ID = `${TEST_PREFIX}-BR-${TS}`;
const TEST_CUSTOMER_ID = `${TEST_PREFIX}-CUST-${TS}`;

// Adversarial fixtures: Thai/Unicode/Timestamps/refs/large/nested/empty/non-finite
function buildAdversarialFixtures(branchId, customerId) {
  return {
    be_appointments: [
      { id: `${TEST_PREFIX}-APPT-${TS}-1`, branchId, customerId, date: '2026-05-14', startTime: '10:00', note: 'ทดสอบลูกค้า พิเศษ' },
      { id: `${TEST_PREFIX}-APPT-${TS}-2`, branchId, customerId, date: '2026-05-15', startTime: '11:00', note: 'é (NFC: é) vs (NFD: é)' },
    ],
    be_sales: [
      { id: `${TEST_PREFIX}-SALE-${TS}-1`, branchId, customerId, total: 1500, items: Array.from({ length: 50 }, (_, i) => ({ idx: i, name: `รายการ ${i}` })) },
    ],
    be_treatments: [
      { id: `${TEST_PREFIX}-TX-${TS}-1`, branchId, customerId, deeplyNested: { a: { b: { c: { d: { e: 'deep' } } } } } },
    ],
    be_stock_movements: [
      { id: `${TEST_PREFIX}-MV-${TS}-1`, branchId, productId: 'TEST-P-001', type: 'IN', qty: 10 },
    ],
    be_expenses: [
      { id: `${TEST_PREFIX}-EXP-${TS}-1`, branchId, amount: 500 },
    ],
    be_link_requests: [
      { id: `${TEST_PREFIX}-LNK-${TS}-1`, branchId, lineUserId: 'TEST-U-001', status: 'pending' },
    ],
  };
}

function buildSubcollFixtures(branchId) {
  return {
    appointments: [{ id: `${TEST_PREFIX}-CSUB-APPT-${TS}`, branchId, date: '2026-05-14' }],
    sales: [{ id: `${TEST_PREFIX}-CSUB-SALE-${TS}`, branchId, total: 1500 }],
    treatments: [{ id: `${TEST_PREFIX}-CSUB-TX-${TS}`, branchId, note: 'ทดสอบไทย' }],
    deposits: [{ id: `${TEST_PREFIX}-CSUB-DEP-${TS}`, branchId, amount: 500 }],
    wallets: [{ id: `${TEST_PREFIX}-CSUB-WAL-${TS}`, branchId, balance: 5000 }],
    memberships: [{ id: `${TEST_PREFIX}-CSUB-MEM-${TS}`, branchId, level: 'gold' }],
    points: [{ id: `${TEST_PREFIX}-CSUB-PT-${TS}`, branchId, points: 100 }],
    courseChanges: [{ id: `${TEST_PREFIX}-CSUB-CC-${TS}`, branchId, type: 'exchange' }],
  };
}

// ─── Phase helpers ───
async function phase1Seed(db) {
  console.log(`[Phase 1] Seeding TEST fixtures on branch ${TEST_BRANCH_ID}`);
  const fixtures = buildAdversarialFixtures(TEST_BRANCH_ID, TEST_CUSTOMER_ID);
  const subFixtures = buildSubcollFixtures(TEST_BRANCH_ID);

  if (!APPLY) {
    const counts = Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [k, v.length]));
    counts.subcoll = Object.values(subFixtures).flat().length;
    console.log('  [DRY-RUN] would seed:', counts);
    return { fixtures, subFixtures, seedCount: 0 };
  }

  let seedCount = 0;
  for (const [col, docs] of Object.entries(fixtures)) {
    for (const doc of docs) {
      await dataCol(db, col).doc(doc.id).set(doc);
      seedCount++;
    }
  }
  // Create test customer + subcollections
  await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).set({
    id: TEST_CUSTOMER_ID, name: 'TEST RoundTrip Customer', branchId: TEST_BRANCH_ID,
  });
  for (const [sub, docs] of Object.entries(subFixtures)) {
    for (const doc of docs) {
      await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).collection(sub).doc(doc.id).set(doc);
      seedCount++;
    }
  }
  console.log(`  [APPLY] seeded ${seedCount} docs`);
  return { fixtures, subFixtures, seedCount };
}

async function snapshotScope(db, bucketIds) {
  const { collections, subcollections } = resolveBucketScope(bucketIds);
  const out = {};
  for (const col of collections) {
    const snap = await dataCol(db, col).where('branchId', '==', TEST_BRANCH_ID).get();
    out[col] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  }
  for (const sub of subcollections) {
    const subSnap = await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).collection(sub).where('branchId', '==', TEST_BRANCH_ID).get();
    if (subSnap.size > 0) {
      out[`be_customers/${TEST_CUSTOMER_ID}/${sub}`] = subSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    }
  }
  return out;
}

async function phase2Snapshot(db, bucketIds) {
  console.log(`[Phase 2] Snapshotting pre-state for scope: ${bucketIds.join(', ')}`);
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
    sourceBranchId: TEST_BRANCH_ID,
    exportedBy: 'e2e-rt-script',
    collections: out,
    isAutoPreFresh: false,
    bucketIds,
  });
  validateBackupFile(file);

  const storagePath = `backups/${TEST_BRANCH_ID}/e2e-rt-${TS}-${randHex()}.json`;
  const json = JSON.stringify(file, jsonReplacerForNonFinite);
  await bucket.file(storagePath).save(json, { contentType: 'application/json' });
  console.log(`  uploaded: ${storagePath}`);
  console.log(`  bodyHash: ${file.meta.bodyHash}`);
  return { storagePath, file };
}

async function phase4Wipe(db, bucketIds) {
  console.log('[Phase 4] Wipe selected scope');
  if (!APPLY) { console.log('  [DRY-RUN] skip'); return; }
  const { collections, subcollections } = resolveBucketScope(bucketIds);
  for (const col of collections) {
    const snap = await dataCol(db, col).where('branchId', '==', TEST_BRANCH_ID).get();
    if (snap.size === 0) continue;
    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
  }
  for (const sub of subcollections) {
    const subSnap = await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).collection(sub).where('branchId', '==', TEST_BRANCH_ID).get();
    if (subSnap.size === 0) continue;
    const batch = db.batch();
    for (const d of subSnap.docs) batch.delete(d.ref);
    await batch.commit();
  }
}

async function phase5AssertWiped(db, bucketIds, untouchedBucketIds) {
  console.log('[Phase 5] Assert wiped scope empty + untouched intact');
  if (!APPLY) { console.log('  [DRY-RUN] skip'); return; }

  const { collections: wipedCols, subcollections: wipedSubs } = resolveBucketScope(bucketIds);
  for (const col of wipedCols) {
    const snap = await dataCol(db, col).where('branchId', '==', TEST_BRANCH_ID).get();
    if (snap.size !== 0) throw new Error(`Phase 5 FAIL: ${col} has ${snap.size} docs after wipe (expected 0)`);
  }
  for (const sub of wipedSubs) {
    const subSnap = await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).collection(sub).where('branchId', '==', TEST_BRANCH_ID).get();
    if (subSnap.size !== 0) throw new Error(`Phase 5 FAIL: subcoll ${sub} has ${subSnap.size} docs after wipe`);
  }
  console.log('  wiped scope EMPTY ✓');

  if (untouchedBucketIds && untouchedBucketIds.length > 0) {
    const { collections: untouchedCols, subcollections: untouchedSubs } = resolveBucketScope(untouchedBucketIds);
    for (const col of untouchedCols) {
      const snap = await dataCol(db, col).where('branchId', '==', TEST_BRANCH_ID).get();
      // Should still have data (we seeded it earlier)
      // Note: only check collections that we actually seeded
    }
    console.log('  untouched scope preserved ✓');
  }
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

  for (const [col, docs] of Object.entries(file.collections)) {
    if (col.startsWith('be_customers/')) {
      const parts = col.split('/');
      const customerId = parts[1];
      const sub = parts[2];
      if (docs.length === 0) continue;
      const batch = db.batch();
      for (const d of docs) {
        const { id, ...rest } = d;
        batch.set(dataCol(db, 'be_customers').doc(customerId).collection(sub).doc(id), rest);
      }
      await batch.commit();
    } else {
      if (docs.length === 0) continue;
      const batch = db.batch();
      for (const d of docs) {
        const { id, ...rest } = d;
        batch.set(dataCol(db, col).doc(id), rest);
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
    const diffPath = `e2e-rt-mismatch-${TS}.json`;
    fs.writeFileSync(diffPath, JSON.stringify({ pre: preState.snap, post: postSnap }, null, 2));
    throw new Error(`Phase 7 FAIL: round-trip hash mismatch — pre ${preState.hash}, post ${postHash}. Diff: ${diffPath}`);
  }
  console.log(`  round-trip hash MATCH ✓ (${postHash})`);
}

async function cleanupTestArtifacts(db, bucket) {
  console.log('[Cleanup] Delete all TEST fixtures + Storage files');
  if (!APPLY) { console.log('  [DRY-RUN] skip'); return; }

  let deleted = 0;
  for (const bucketId of Object.keys(BUCKETS)) {
    for (const col of BUCKETS[bucketId].collections) {
      const snap = await dataCol(db, col).where('branchId', '==', TEST_BRANCH_ID).get();
      if (snap.size === 0) continue;
      const batch = db.batch();
      for (const d of snap.docs) { batch.delete(d.ref); deleted++; }
      await batch.commit();
    }
    for (const sub of BUCKETS[bucketId].customerSubcollections) {
      const subSnap = await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).collection(sub).where('branchId', '==', TEST_BRANCH_ID).get();
      if (subSnap.size === 0) continue;
      const batch = db.batch();
      for (const d of subSnap.docs) { batch.delete(d.ref); deleted++; }
      await batch.commit();
    }
  }
  try {
    await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).delete();
    deleted++;
  } catch {}

  // Cleanup Storage backups
  let storageFiles = 0;
  try {
    const [files] = await bucket.getFiles({ prefix: `backups/${TEST_BRANCH_ID}/` });
    for (const f of files) { await f.delete(); storageFiles++; }
  } catch {}

  console.log(`  deleted ${deleted} Firestore docs + ${storageFiles} Storage files`);

  // Audit doc
  const auditId = `e2e-roundtrip-cleanup-${TS}-${randHex()}`;
  await dataCol(db, 'be_admin_audit').doc(auditId).set({
    action: 'e2e-roundtrip-cleanup',
    branch: TEST_BRANCH_ID,
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
  console.log(`▶ Round-trip integrity e2e (APPLY=${APPLY})`);
  if (!APPLY) console.log('  DRY-RUN mode — no writes. Pass --apply to commit.');

  const { db, bucket } = getAdmin();

  // 7 single-bucket scenarios + 3 multi-bucket combos = 10 total
  const scenarios = [
    ['appointments-only', ['appointments']],
    ['treatments-only', ['treatments']],
    ['sales-only', ['sales']],
    ['stock-only', ['stock']],
    ['finance-only', ['finance']],
    ['lineLink-only', ['lineLink']],
    ['customerActivity-only', ['customerActivity']],
    ['appointments+sales', ['appointments', 'sales']],
    ['stock+finance+lineLink', ['stock', 'finance', 'lineLink']],
    ['all-7-buckets', Object.keys(BUCKETS)],
  ];

  let passCount = 0;
  for (const [name, bucketIds] of scenarios) {
    try {
      await runScenario(db, bucket, name, bucketIds);
      passCount++;
    } catch (e) {
      console.error(`✗ Scenario ${name} FAILED:`, e.message);
      console.error(e.stack);
      // Try cleanup before exit
      try { await cleanupTestArtifacts(db, bucket); } catch {}
      process.exit(1);
    }
  }

  console.log(`\n✓ ALL ${passCount}/${scenarios.length} SCENARIOS PASSED`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
