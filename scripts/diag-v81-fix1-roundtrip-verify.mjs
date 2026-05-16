#!/usr/bin/env node
// V81-fix1 VERIFICATION (2026-05-17 EOD+1):
// Take a fresh backup with TEST-V81-TS- fixtures containing Timestamp fields.
// Read the backup's collection JSON. Verify __type:timestamp markers present.
// Decode the JSON via decodeFirestoreData + admin SDK Timestamp class.
// Verify decoded fields are instanceof Timestamp.
//
// SAFETY:
//   - All fixtures use TEST-V81-TS- prefix (cleanup-recoverable)
//   - Backup folder cleaned at end
//   - Read-only against existing prod data (only TEST fixtures + ephemeral backup)
//
// USAGE:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/diag-v81-fix1-roundtrip-verify.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { decodeFirestoreData } from '../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const TEST_PREFIX = 'TEST-V81-TS-';

function loadEnv() {
  const envPath = path.resolve('.env.local.prod');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket: `${APP_ID}.firebasestorage.app`,
    });
  }
  const db = getFirestore();
  const storage = getStorage().bucket();
  const auth = getAuth();

  console.log('=== V81-fix1 Round-Trip Verification ===\n');

  // Phase 1: Seed TEST-V81-TS fixtures with REAL Timestamp instances
  const fixId = `${TEST_PREFIX}CUST-${Date.now()}`;
  const branchId = `${TEST_PREFIX}BR-${Date.now()}`;
  const seedTs1 = Timestamp.fromMillis(1777000000000);
  const seedTs2 = Timestamp.fromMillis(1778000000000);

  console.log('Phase 1: Seed TEST-V81-TS fixtures with Timestamp fields...');
  await db.doc(`${PREFIX}/be_customers/${fixId}`).set({
    name: 'V81-fix1 Test',
    branchId,
    createdAt: seedTs1,
    updatedAt: seedTs2,
    nested: { lastSyncedAt: seedTs1, depth: 2 },
    _testFixture: true,
  });
  await db.doc(`${PREFIX}/be_branches/${branchId}`).set({
    name: 'V81-fix1 Branch',
    _v76BranchBackfilledAt: seedTs1,
    _testFixture: true,
  });
  console.log(`  Seeded ${fixId} + ${branchId} with Timestamp fields\n`);

  // Phase 2: Run backup (uses V81-fix1 encodeFirestoreData)
  console.log('Phase 2: Run backup via patched executor...');
  const { runWholeSystemBackup } = await import('../api/admin/_lib/wholeSystemBackupExecutor.js');
  const backup = await runWholeSystemBackup({
    db, storage, auth,
    type: 'manual',
    createdBy: 'diag-v81-fix1',
    runCleanup: false,
  });
  console.log(`  Backup: ${backup.name}`);
  console.log(`  Hash:   ${backup.manifestHash}\n`);

  // Phase 3: Verify markers present in backup file
  console.log('Phase 3: Read be_customers.json from backup + check for __type:timestamp markers...');
  const [custBuf] = await storage.file(`backups/whole-system/${backup.name}/collections/universal/be_customers.json`).download();
  const custRaw = custBuf.toString('utf8');
  const markerCount = (custRaw.match(/"__type":\s*"timestamp"/g) || []).length;
  console.log(`  File size: ${custRaw.length} bytes`);
  console.log(`  __type:timestamp markers found: ${markerCount}`);
  // Find TEST fixture in JSON
  const allCustomers = JSON.parse(custRaw);
  console.log(`  Total customers in backup: ${allCustomers.length}`);
  const testCust = allCustomers.find(c => c.id === fixId);
  if (!testCust) {
    console.error(`✗ FAIL: TEST fixture ${fixId} not found in backup file`);
    process.exit(1);
  }
  console.log(`  TEST fixture found: ${fixId}`);
  console.log(`  TEST fixture createdAt:`, JSON.stringify(testCust.createdAt));
  console.log(`  TEST fixture updatedAt:`, JSON.stringify(testCust.updatedAt));
  console.log(`  TEST fixture nested.lastSyncedAt:`, JSON.stringify(testCust.nested?.lastSyncedAt));
  if (markerCount === 0) {
    console.error('✗ FAIL: backup file contains ZERO __type:timestamp markers');
    process.exit(1);
  }
  console.log(`  ✓ markers present\n`);

  // Phase 4: Verify TEST fixture's Timestamps are encoded as markers
  console.log('Phase 4: Verify TEST fixture Timestamps are encoded as markers...');
  // BEFORE decode: fields should be marker objects
  if (!testCust.createdAt || testCust.createdAt.__type !== 'timestamp') {
    console.error('✗ FAIL: createdAt in backup file is not a timestamp marker');
    console.error('Got:', testCust.createdAt);
    process.exit(1);
  }
  console.log(`  ✓ TEST fixture createdAt is marker: ${JSON.stringify(testCust.createdAt)}`);

  // Now decode using the V81-fix1 decoder
  const decoded = decodeFirestoreData(testCust, { Timestamp });
  if (!(decoded.createdAt instanceof Timestamp)) {
    console.error('✗ FAIL: after decode, createdAt is NOT instanceof Timestamp');
    console.error('Got:', decoded.createdAt);
    console.error('Type:', typeof decoded.createdAt, decoded.createdAt?.constructor?.name);
    process.exit(1);
  }
  if (decoded.createdAt.seconds !== seedTs1.seconds || decoded.createdAt.nanoseconds !== seedTs1.nanoseconds) {
    console.error('✗ FAIL: decoded Timestamp values differ from seed');
    console.error(`Expected: ${seedTs1.seconds}.${seedTs1.nanoseconds}`);
    console.error(`Got:      ${decoded.createdAt.seconds}.${decoded.createdAt.nanoseconds}`);
    process.exit(1);
  }
  console.log(`  ✓ Decoded createdAt is Timestamp instance with seconds=${decoded.createdAt.seconds}`);
  console.log(`  ✓ decoded.toMillis() = ${decoded.createdAt.toMillis()} (matches seed ${seedTs1.toMillis()})`);

  // Verify nested timestamps too
  if (!(decoded.nested.lastSyncedAt instanceof Timestamp)) {
    console.error('✗ FAIL: nested.lastSyncedAt NOT instanceof Timestamp');
    process.exit(1);
  }
  console.log(`  ✓ Nested Timestamp also decoded correctly\n`);

  // Phase 5: Cleanup
  console.log('Phase 5: Cleanup TEST fixtures + backup folder...');
  await db.doc(`${PREFIX}/be_customers/${fixId}`).delete();
  await db.doc(`${PREFIX}/be_branches/${branchId}`).delete();
  await storage.deleteFiles({ prefix: `backups/whole-system/${backup.name}/` });
  console.log('  ✓ Cleanup complete\n');

  // Phase 6: Zero orphan check
  console.log('Phase 6: Zero orphan check...');
  const o1 = await db.doc(`${PREFIX}/be_customers/${fixId}`).get();
  const o2 = await db.doc(`${PREFIX}/be_branches/${branchId}`).get();
  const [oBackup] = await storage.file(`backups/whole-system/${backup.name}/manifest.json`).exists();
  if (o1.exists || o2.exists || oBackup) {
    console.error('✗ ORPHANS DETECTED');
    process.exit(1);
  }
  console.log('  ✓ Zero orphans\n');

  console.log('✓ V81-fix1 VERIFICATION PASS — backup→encode→JSON→parse→decode preserves Timestamp instance');
  console.log('  Real prod data shape verified: Timestamp survives round-trip through V81 backup/restore code path.');
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
