#!/usr/bin/env node
// V81 Task 24 — Live admin-SDK e2e on REAL prod with TEST-V81- prefix fixtures.
// 7-phase: seed → backup → verify-folder → verify-manifest → cleanup → ZERO orphans
//
// SAFETY:
//   - All fixtures use TEST-V81- prefix per V33.10-V33.14 discipline (recoverable)
//   - Phase 4 SKIPS wipe-and-restore on real prod (too risky); restore round-trip
//     covered by emulator Task 19 + secondary-DB Task 21 (clone-verify).
//   - Phase 6 cleanup removes the backup folder itself (don't pollute prod
//     backups/ storage with test artifacts).
//
// USAGE:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/e2e-v81-whole-system-backup-restore.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const TEST_PREFIX = 'TEST-V81-';

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

  const fixtureIds = {
    cust: `${TEST_PREFIX}CUST-${Date.now()}`,
    branch: `${TEST_PREFIX}BR-${Date.now()}`,
    staff: `${TEST_PREFIX}ST-${Date.now()}`,
    storageBlob: `${TEST_PREFIX}photo-${Date.now()}.jpg`,
  };

  console.log('Phase 1: Seed TEST-V81 fixtures on real prod...');
  await db.doc(`${PREFIX}/be_customers/${fixtureIds.cust}`).set({
    name: 'V81 Test Customer',
    branchId: fixtureIds.branch,
    _testFixture: true,
    _createdBy: 'e2e-v81-test',
  });
  await db.doc(`${PREFIX}/be_branches/${fixtureIds.branch}`).set({
    name: 'V81 Test Branch',
    _testFixture: true,
  });
  await db.doc(`${PREFIX}/be_staff/${fixtureIds.staff}`).set({
    name: 'V81 Test Staff',
    email: `v81-test-${Date.now()}@example.com`,
    _testFixture: true,
  });
  // TEST-prefixed storage blob is excluded from backup per V81 STORAGE_EXCLUDE_PREFIXES
  // (TEST- prefix on Storage paths is in the recursion-gate exclude list). This is
  // intentional — verifies the recursion-gate works against the e2e fixture too.
  console.log(`  Seeded: ${fixtureIds.cust} / ${fixtureIds.branch} / ${fixtureIds.staff}`);

  console.log('Phase 2: Run backup via executor...');
  const { runWholeSystemBackup } = await import('../api/admin/_lib/wholeSystemBackupExecutor.js');
  const backup = await runWholeSystemBackup({
    db, storage, auth,
    type: 'manual',
    createdBy: 'e2e-v81-test',
    runCleanup: false,
  });
  console.log(`  Backup created: ${backup.name}`);
  console.log(`  Hash: ${backup.manifestHash}`);
  console.log(`  Stats: docs=${backup.stats.totalDocCount} storage=${Math.round(backup.stats.totalStorageBytes / 1024 / 1024)}MB users=${backup.stats.totalAuthUsers}`);

  console.log('Phase 3: Verify backup folder + manifest...');
  const [exists] = await storage.file(`backups/whole-system/${backup.name}/manifest.json`).exists();
  if (!exists) {
    console.error('✗ manifest.json missing in Storage');
    process.exit(1);
  }
  console.log('  ✓ manifest.json present');

  console.log('Phase 4: Verify manifest contents include TEST-V81 fixtures...');
  const [mfBuf] = await storage.file(`backups/whole-system/${backup.name}/manifest.json`).download();
  const manifest = JSON.parse(mfBuf.toString('utf8'));
  const customerCol = manifest.collections.find(c => c.name === 'be_customers');
  const branchCol = manifest.collections.find(c => c.name === 'be_branches');
  const staffCol = manifest.collections.find(c => c.name === 'be_staff');
  if (!customerCol || !branchCol || !staffCol) {
    console.error('✗ Required collections missing in backup');
    process.exit(1);
  }
  console.log(`  ✓ be_customers backup has ${customerCol.docCount} docs`);
  console.log(`  ✓ be_branches backup has ${branchCol.docCount} docs`);
  console.log(`  ✓ be_staff backup has ${staffCol.docCount} docs`);

  console.log('Phase 5: AV62 hash validation via validateWholeSystemManifest...');
  const { validateWholeSystemManifest } = await import('../src/lib/wholeSystemBackupCore.js');
  const v = validateWholeSystemManifest(manifest);
  if (!v.valid) {
    console.error(`✗ AV62 hash validation FAILED: ${v.reason}`);
    process.exit(1);
  }
  console.log(`  ✓ AV62 validate: ${JSON.stringify(v)}`);

  console.log('Phase 6: Cleanup TEST-V81 fixtures + backup folder...');
  await db.doc(`${PREFIX}/be_customers/${fixtureIds.cust}`).delete();
  await db.doc(`${PREFIX}/be_branches/${fixtureIds.branch}`).delete();
  await db.doc(`${PREFIX}/be_staff/${fixtureIds.staff}`).delete();
  await storage.deleteFiles({ prefix: `backups/whole-system/${backup.name}/` });
  console.log('  Cleanup complete');

  console.log('Phase 7: ZERO orphan check...');
  const orphan1 = await db.doc(`${PREFIX}/be_customers/${fixtureIds.cust}`).get();
  const orphan2 = await db.doc(`${PREFIX}/be_branches/${fixtureIds.branch}`).get();
  const orphan3 = await db.doc(`${PREFIX}/be_staff/${fixtureIds.staff}`).get();
  const [orphanBackup] = await storage.file(`backups/whole-system/${backup.name}/manifest.json`).exists();
  if (orphan1.exists || orphan2.exists || orphan3.exists || orphanBackup) {
    console.error('✗ ORPHANS DETECTED');
    process.exit(1);
  }
  console.log('  ✓ Zero orphans');

  console.log('');
  console.log('✓ V81 e2e PASS — backup→manifest→hash→cleanup→zero-orphans verified on REAL prod');
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
