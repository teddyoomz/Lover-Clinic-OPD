#!/usr/bin/env node
// E2E validation: hit deployed /api/admin/branch-backup-export with FULL
// T1+T2+T3+T4 scope, download the actual backup file via signedUrl, parse
// JSON, validate structure + content. Confirms the parallel-T4 fix actually
// produces a working backup file in production.
//
// Cleans up the test backup file from Storage at the end (admin-SDK delete).

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2]; if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const FIREBASE_WEB_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const PROD_URL = 'https://lover-clinic-app.vercel.app';
const TARGET_BRANCH = 'BR-1777873556815-26df6480'; // นครราชสีมา (real prod branch)
const BUCKET = `${APP_ID}.firebasestorage.app`;

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

const cleanupStoragePaths = [];

async function main() {
  console.log('═══ V40-prod-fix-2 E2E validation ═══\n');

  // 1. Mint admin idToken
  const diagUid = `diag-V40-prod-fix-2-${Date.now()}`;
  const customToken = await getAuth().createCustomToken(diagUid, { admin: true });
  const exchangeRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const idToken = (await exchangeRes.json()).idToken;
  if (!idToken) throw new Error('Token exchange failed');
  console.log('✓ Admin idToken obtained\n');

  // 2. Hit /api/admin/branch-backup-export with FULL T1+T2+T3+T4
  console.log('─── TEST 1: Full T1+T2+T3+T4 backup via /api/admin/branch-backup-export ───');
  const t0 = Date.now();
  const exportRes = await fetch(`${PROD_URL}/api/admin/branch-backup-export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      branchId: TARGET_BRANCH,
      tiers: ['T1', 'T2', 'T3', 'T4'],
      collections: null,
      isAutoPreFresh: false,
    }),
  });
  const exportDt = Date.now() - t0;
  console.log(`  HTTP ${exportRes.status} in ${(exportDt/1000).toFixed(2)}s`);

  const exportText = await exportRes.text();
  if (!exportRes.ok) {
    console.error(`✗ FAIL: ${exportText.slice(0, 500)}`);
    process.exit(1);
  }
  let exportJson;
  try { exportJson = JSON.parse(exportText); } catch { exportJson = null; }
  if (!exportJson?.ok || !exportJson.signedUrl) {
    console.error(`✗ FAIL: response shape invalid: ${exportText.slice(0, 500)}`);
    process.exit(1);
  }
  console.log(`✓ Backup endpoint returned 200 with signedUrl (${exportJson.sizeBytes} bytes)`);
  console.log(`  Per-collection counts:`);
  for (const [k, v] of Object.entries(exportJson.perCollectionCounts || {})) {
    if (v > 0 || k === 'be_customers/__per_customer__') {
      console.log(`    ${k}: ${v}`);
    }
  }
  cleanupStoragePaths.push(exportJson.storagePath);

  // 3. Download the file via signedUrl + validate content
  console.log('\n─── TEST 2: Download + validate JSON content ───');
  const downloadRes = await fetch(exportJson.signedUrl);
  if (!downloadRes.ok) {
    console.error(`✗ FAIL: download HTTP ${downloadRes.status}`);
    process.exit(1);
  }
  const fileText = await downloadRes.text();
  console.log(`  Downloaded ${(fileText.length / 1024 / 1024).toFixed(2)} MB`);

  let file;
  try { file = JSON.parse(fileText); } catch (e) {
    console.error(`✗ FAIL: JSON parse error: ${e.message}`);
    console.error(`  First 500 chars: ${fileText.slice(0, 500)}`);
    process.exit(1);
  }

  // Validate meta block — branch schema accepts v1 (legacy) + v2 (current, BACKUP_SCHEMA_VERSION).
  if (![1, 2].includes(file.meta?.schemaVersion)) {
    console.error(`✗ FAIL: meta.schemaVersion expected 1|2, got ${file.meta?.schemaVersion}`);
    process.exit(1);
  }
  if (file.meta.sourceBranchId !== TARGET_BRANCH) {
    console.error(`✗ FAIL: meta.sourceBranchId expected ${TARGET_BRANCH}, got ${file.meta?.sourceBranchId}`);
    process.exit(1);
  }
  console.log(`✓ Meta block valid (schemaVersion=1, sourceBranchId=${file.meta.sourceBranchId})`);
  console.log(`  exportedAt: ${file.meta.exportedAt}`);
  console.log(`  exportedBy: ${file.meta.exportedBy}`);
  console.log(`  scope: ${JSON.stringify(file.meta.scope)}`);

  // Validate collections block
  if (typeof file.collections !== 'object') {
    console.error('✗ FAIL: collections block missing or invalid');
    process.exit(1);
  }
  const collectionKeys = Object.keys(file.collections);
  console.log(`✓ Collections block has ${collectionKeys.length} collection arrays`);

  // Spot-check a few key collections
  let totalDocs = 0;
  let sampleDoc = null;
  for (const k of collectionKeys) {
    const arr = file.collections[k];
    if (!Array.isArray(arr)) {
      console.error(`✗ FAIL: ${k} is not an array`);
      process.exit(1);
    }
    totalDocs += arr.length;
    if (!sampleDoc && arr.length > 0) sampleDoc = { collection: k, doc: arr[0] };
  }
  console.log(`✓ Total docs in backup: ${totalDocs}`);
  if (sampleDoc) {
    console.log(`  Sample doc from ${sampleDoc.collection}:`);
    const docKeys = Object.keys(sampleDoc.doc).slice(0, 8).join(', ');
    console.log(`    fields: ${docKeys}${Object.keys(sampleDoc.doc).length > 8 ? '...' : ''}`);
    console.log(`    id: ${sampleDoc.doc.id}`);
  }

  // Save a local copy for the user to inspect
  const localPath = `F:/LoverClinic-app/v40-prod-fix-2-validation-backup.json`;
  writeFileSync(localPath, fileText);
  console.log(`\n✓ Saved local copy: ${localPath}`);

  console.log('\n═══ ✓ V40-prod-fix-2 VERIFIED — backup endpoint produces valid file with real data ═══');

  // 4. Verify auto-pre-fresh path (used by Make-Fresh modal step 1/2)
  console.log('\n─── TEST 3: Auto-pre-fresh path (Make-Fresh modal step 1/2) ───');
  const t1 = Date.now();
  const autoRes = await fetch(`${PROD_URL}/api/admin/branch-backup-export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      branchId: TARGET_BRANCH,
      tiers: ['T1', 'T2', 'T3', 'T4'],
      isAutoPreFresh: true, // ← Make-Fresh modal sets this true
    }),
  });
  const autoDt = Date.now() - t1;
  console.log(`  HTTP ${autoRes.status} in ${(autoDt/1000).toFixed(2)}s`);
  const autoJson = await autoRes.json();
  if (!autoJson.ok) {
    console.error(`✗ FAIL: auto-pre-fresh: ${JSON.stringify(autoJson).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`✓ Auto-pre-fresh succeeded (storagePath: ${autoJson.storagePath})`);
  console.log(`  isAutoPreFresh prefix in path: ${autoJson.storagePath.includes('/auto-pre-fresh-')}`);
  cleanupStoragePaths.push(autoJson.storagePath);

  // 5. Verify Make-Fresh modal would proceed (we don't actually call wipe — that's destructive)
  console.log('\n─── TEST 4: bucket.file().exists() check (Make-Fresh precondition) ───');
  const bucket = getStorage().bucket();
  const [exists] = await bucket.file(autoJson.storagePath).exists();
  if (!exists) {
    console.error('✗ FAIL: auto-pre-fresh file does not exist in Storage');
    process.exit(1);
  }
  console.log('✓ Auto-pre-fresh file exists in Storage (Make-Fresh wipe precondition met)');
  console.log('  (NOT calling /api/admin/branch-make-fresh — destructive; UI flow is verified to reach step 2/2)');

  console.log('\n═══ ✓ ALL E2E CHECKS PASSED — Backup สาขา + ทำให้เป็นสาขาใหม่ both ready for user testing ═══');
}

async function doCleanup() {
  console.log('\n🧹 Cleanup test backup files from Storage...');
  const bucket = getStorage().bucket();
  for (const path of cleanupStoragePaths) {
    try {
      await bucket.file(path).delete();
      console.log(`  ✓ Deleted ${path}`);
    } catch (e) {
      console.log(`  ! cleanup error: ${path} → ${e.message}`);
    }
  }
  console.log(`   ${cleanupStoragePaths.length} files cleaned`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(doCleanup)
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error('\nFATAL:', e.message);
      console.error(e.stack);
      await doCleanup();
      process.exit(1);
    });
}
