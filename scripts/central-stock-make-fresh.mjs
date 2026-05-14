#!/usr/bin/env node
// CLI mirror of /api/admin/central-stock-make-fresh — 2026-05-15 Task 11.
//
// Usage:
//   node scripts/central-stock-make-fresh.mjs --warehouse-id=WH-A --bucket-ids=cs_po,cs_adjustments [--apply]
//   node scripts/central-stock-make-fresh.mjs --all --bucket-ids=cs_po --apply
//
// Mirror of scripts/branch-make-fresh.mjs structure. Uses assertWarehouseMasterProtected
// + hash verify before any delete.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { CENTRAL_BUCKETS, resolveCentralBucketScope, assertWarehouseMasterProtected } from '../src/lib/centralStockBuckets.js';
import { buildBackupFile, computeBodyHash, validateBackupFile } from '../src/lib/branchBackupSchema.js';

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
const BUCKET = `${APP_ID}.firebasestorage.app`;
const BATCH_LIMIT = 400;

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));

function usage() {
  console.error('Usage:');
  console.error('  node scripts/central-stock-make-fresh.mjs --warehouse-id=<id> --bucket-ids=<ids> [--apply]');
  console.error('  node scripts/central-stock-make-fresh.mjs --all --bucket-ids=<ids> [--apply]');
  console.error('');
  console.error('Available bucket IDs (comma-separated):');
  for (const [id, b] of Object.entries(CENTRAL_BUCKETS)) {
    console.error(`  ${id.padEnd(28)} — ${b.label}`);
  }
}

const allWarehouses = args.all === true || args.all === 'true';
if (!allWarehouses && !args['warehouse-id']) { usage(); process.exit(1); }
if (!args['bucket-ids']) { usage(); process.exit(1); }

const bucketIds = String(args['bucket-ids']).split(',').map(s => s.trim()).filter(Boolean);
if (bucketIds.length === 0) { console.error('--bucket-ids must list at least one bucket\n'); usage(); process.exit(1); }
for (const id of bucketIds) {
  if (!CENTRAL_BUCKETS[id]) { console.error(`Unknown bucket: ${id}\n`); usage(); process.exit(1); }
}
const apply = args.apply === true || args.apply === 'true';

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
function dataCol(name) { return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name); }
function randHex(n = 8) { return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n); }

async function main() {
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Buckets: ${bucketIds.join(', ')}\n`);

  const resolved = resolveCentralBucketScope(bucketIds);
  assertWarehouseMasterProtected(resolved.collections);

  // Resolve warehouseIds
  let warehouseIds;
  if (allWarehouses) {
    const snap = await dataCol('be_central_stock_warehouses').get();
    warehouseIds = snap.docs.map(d => d.id);
    console.log(`Scope: ALL warehouses (${warehouseIds.length})`);
  } else {
    warehouseIds = [args['warehouse-id']];
    console.log(`Scope: warehouse ${args['warehouse-id']}`);
  }
  console.log('');

  // Build backup
  const out = {};
  for (const wid of warehouseIds) {
    for (const spec of resolved.collections) {
      const seen = new Set();
      const collected = [];
      const primary = await dataCol(spec.name).where(spec.filterField, '==', wid).get();
      for (const d of primary.docs) { seen.add(d.id); collected.push({ ...d.data(), id: d.id }); }
      if (spec.orFilterField) {
        const or = await dataCol(spec.name).where(spec.orFilterField, '==', wid).get();
        for (const d of or.docs) if (!seen.has(d.id)) { seen.add(d.id); collected.push({ ...d.data(), id: d.id }); }
      }
      if (collected.length > 0) out[`${spec.name}/${wid}`] = collected;
    }
  }
  for (const cdName of resolved.counterDocs) {
    const cdSnap = await dataCol(cdName).doc('counter').get();
    if (cdSnap.exists) out[`${cdName}/counter`] = [{ id: 'counter', ...cdSnap.data() }];
  }

  const file = buildBackupFile({
    sourceBranchId: warehouseIds.join(',') || 'all',
    exportedBy: 'cli-central-make-fresh',
    scope: { scopeKind: 'central', warehouseIds, bucketIds },
    collections: out,
    isAutoPreFresh: true,
    bucketIds,
  });
  file.meta.scopeKind = 'central';
  file.meta.warehouseIds = [...warehouseIds].sort();
  validateBackupFile(file);

  const totalDocs = Object.values(out).reduce((s, a) => s + a.length, 0);
  console.log(`Total docs in scope: ${totalDocs}`);
  console.log(`bodyHash: ${file.meta.bodyHash}`);

  if (!apply) {
    console.log('\nDRY-RUN — pass --apply to commit writes.');
    return;
  }

  // Upload backup
  const ts = Date.now();
  const folder = allWarehouses ? 'all' : warehouseIds[0];
  const storagePath = `backups/central/${folder}/cli-${ts}-${randHex(4)}.json`;
  await bucket.file(storagePath).save(JSON.stringify(file), { contentType: 'application/json' });
  console.log(`✓ Backup uploaded: ${storagePath}`);

  // Verify hash post-upload
  const [downloaded] = await bucket.file(storagePath).download();
  const recomputed = computeBodyHash(JSON.parse(downloaded.toString('utf8')).collections);
  if (recomputed !== file.meta.bodyHash) {
    console.error(`FATAL: BACKUP_INTEGRITY_FAIL — recomputed ${recomputed} !== file ${file.meta.bodyHash}`);
    process.exit(1);
  }
  console.log('✓ Hash verified post-upload');

  // Wipe
  const deletedCounts = {};
  for (const wid of warehouseIds) {
    for (const spec of resolved.collections) {
      const seen = new Set();
      const allDocs = [];
      const primary = await dataCol(spec.name).where(spec.filterField, '==', wid).get();
      for (const d of primary.docs) { seen.add(d.id); allDocs.push(d); }
      if (spec.orFilterField) {
        const or = await dataCol(spec.name).where(spec.orFilterField, '==', wid).get();
        for (const d of or.docs) if (!seen.has(d.id)) { seen.add(d.id); allDocs.push(d); }
      }
      let deleted = 0;
      for (let i = 0; i < allDocs.length; i += BATCH_LIMIT) {
        const slice = allDocs.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (const d of slice) batch.delete(d.ref);
        await batch.commit();
        deleted += slice.length;
      }
      deletedCounts[`${spec.name}/${wid}`] = deleted;
    }
  }
  for (const cdName of resolved.counterDocs) {
    const ref = dataCol(cdName).doc('counter');
    if ((await ref.get()).exists) await ref.delete();
  }

  // Audit doc
  const auditId = `central-stock-make-fresh-cli-${ts}-${randHex()}`;
  await dataCol('be_admin_audit').doc(auditId).set({
    action: 'central-stock-make-fresh-cli',
    scopeKind: 'central',
    warehouseIds: [...warehouseIds].sort(),
    bucketIds: [...bucketIds].sort(),
    autoBackupRef: storagePath,
    bodyHash: file.meta.bodyHash,
    deletedCounts,
    executedAt: new Date().toISOString(),
  });

  console.log('✓ Wipe complete');
  console.log('deletedCounts:', deletedCounts);
  console.log(`Audit: ${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
