#!/usr/bin/env node
// E2E: live admin-SDK round-trip on real prod with TEST-prefixed branch fixtures.
// Pattern mirrors scripts/e2e-migrate-all-buttons.mjs.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  const envText = readFileSync(envFile, 'utf-8');
  for (const line of envText.split('\n')) {
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
const TEST_BRANCH = `TEST-BR-V40-${Date.now()}`;

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
const db = getFirestore();
const bucket = getStorage().bucket();

const cleanup = [];

async function main() {
  console.log('═══ E2E: branch backup-restore-make-fresh ═══');
  console.log(`Test branch: ${TEST_BRANCH}\n`);

  // 1. Create TEST product in source branch
  const productRef = db.collection(`${BASE_PATH}/be_products`).doc(`TEST-V40-PROD-${Date.now()}`);
  await productRef.set({
    productId: productRef.id,
    productName: 'V40 E2E Product',
    branchId: TEST_BRANCH,
    productType: 'ยา',
    price: 100,
    status: 'ใช้งาน',
  });
  cleanup.push({ ref: productRef });
  console.log(`✓ Created TEST product ${productRef.id}`);

  // 2. Backup via direct admin SDK (mirrors export endpoint)
  const snap = await db.collection(`${BASE_PATH}/be_products`).where('branchId', '==', TEST_BRANCH).get();
  const exported = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  const backupFile = {
    meta: { schemaVersion: 1, sourceBranchId: TEST_BRANCH, exportedBy: 'e2e', exportedAt: new Date().toISOString(),
            scope: { tiers: ['T1'] }, perCollectionCounts: { be_products: exported.length }, isAutoPreFresh: false },
    collections: { be_products: exported },
  };
  const json = JSON.stringify(backupFile);
  const storagePath = `backups/${TEST_BRANCH}/test-${Date.now()}.json`;
  await bucket.file(storagePath).save(json, { contentType: 'application/json' });
  cleanup.push({ storagePath });
  console.log(`✓ Backup uploaded to ${storagePath} (${json.length} bytes)`);

  // 3. Wipe + restore (overwrite mode)
  await productRef.delete();
  console.log(`✓ Deleted TEST product (simulating data loss)`);

  const [data] = await bucket.file(storagePath).download();
  const restored = JSON.parse(data.toString('utf8'));
  const docs = restored.collections.be_products;
  for (const d of docs) {
    const { id, ...rest } = d;
    await db.collection(`${BASE_PATH}/be_products`).doc(id).set({ ...rest, branchId: TEST_BRANCH }, { merge: false });
  }
  console.log(`✓ Restored ${docs.length} doc(s) from backup`);

  // 4. Verify
  const verifySnap = await productRef.get();
  if (!verifySnap.exists) throw new Error('VERIFY_FAILED: doc missing after restore');
  const verifyData = verifySnap.data();
  if (verifyData.branchId !== TEST_BRANCH) throw new Error('VERIFY_FAILED: branchId mismatch');
  if (verifyData.productName !== 'V40 E2E Product') throw new Error('VERIFY_FAILED: productName mismatch');
  console.log(`✓ Verify: doc restored with correct fields`);

  console.log('\n═══ ✓ E2E PASS — backup-restore round-trip on real Firestore + Storage ═══');
}

async function doCleanup() {
  console.log('\n🧹 Cleanup...');
  for (const item of cleanup) {
    try {
      if (item.ref) await item.ref.delete();
      if (item.storagePath) await bucket.file(item.storagePath).delete();
    } catch (e) {
      console.log(`  ! cleanup error: ${e.message}`);
    }
  }
  console.log(`   ✓ ${cleanup.length} cleaned`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(doCleanup)
    .then(() => process.exit(0))
    .catch(async (e) => { console.error('FATAL:', e); await doCleanup(); process.exit(1); });
}
