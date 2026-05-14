#!/usr/bin/env node
// CLI mirror of /api/admin/branch-make-fresh. See spec §7 + 2026-05-14 selective-make-fresh.
//
// Usage:
//   node scripts/branch-make-fresh.mjs --branch=BR-A --bucket-ids=appointments,stock [--apply]
//
// Selective scope via --bucket-ids; T1 (master) NEVER wiped (server-side assertNotT1
// defense). Auto-backups first, then wipes only the resolved scope. 2026-05-14
// uses bucketIds-based contract; legacy V40 all-T1-T2-T3-T4-wipe retired.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { BUCKETS, resolveBucketScope, assertNotT1, getFilterSpecForCollection } from '../src/lib/branchBackupBuckets.js';
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
  console.error('Usage: node scripts/branch-make-fresh.mjs --branch=<id> --bucket-ids=<ids> [--apply]');
  console.error('');
  console.error('Available bucket IDs (comma-separated, choose 1+):');
  for (const [id, b] of Object.entries(BUCKETS)) {
    console.error(`  ${id.padEnd(20)} — ${b.label} (default ${b.defaultChecked ? 'on' : 'off'})`);
  }
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/branch-make-fresh.mjs --branch=BR-A --bucket-ids=appointments,sales');
  console.error('  node scripts/branch-make-fresh.mjs --branch=BR-A --bucket-ids=stock --apply');
}

if (!args.branch || !args['bucket-ids']) {
  usage();
  process.exit(1);
}

const bucketIds = String(args['bucket-ids']).split(',').map(s => s.trim()).filter(Boolean);
if (bucketIds.length === 0) {
  console.error('--bucket-ids must list at least one bucket\n');
  usage();
  process.exit(1);
}
for (const id of bucketIds) {
  if (!BUCKETS[id]) {
    console.error(`Unknown bucket: ${id}\n`);
    usage();
    process.exit(1);
  }
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

// V66 fix 2026-05-15 — spec-aware branch-scoped doc fetch with OR-merge
async function queryBranchScopedDocs(colName, branchId) {
  const spec = getFilterSpecForCollection(colName);
  const docMap = new Map();
  const snap1 = await dataCol(colName).where(spec.filterField, '==', branchId).get();
  for (const d of snap1.docs) docMap.set(d.id, d);
  if (spec.orFilterField) {
    const snap2 = await dataCol(colName).where(spec.orFilterField, '==', branchId).get();
    for (const d of snap2.docs) {
      if (!docMap.has(d.id)) docMap.set(d.id, d);
    }
  }
  return [...docMap.values()];
}

async function main() {
  console.log(`Branch: ${args.branch}`);
  console.log(`Buckets: ${bucketIds.join(', ')}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}\n`);

  // Resolve scope + defense-in-depth T1 check
  const resolved = resolveBucketScope(bucketIds);
  assertNotT1(resolved.collections);

  // Build backup over scope
  // V66 fix 2026-05-15: spec-aware OR-merge for transfers/withdrawals
  const out = {};
  for (const col of resolved.collections) {
    const colDocs = await queryBranchScopedDocs(col, args.branch);
    out[col] = colDocs.map(d => ({ ...d.data(), id: d.id }));
  }
  if (resolved.subcollections.length > 0) {
    const customersSnap = await dataCol('be_customers').get();
    for (const cust of customersSnap.docs) {
      for (const sub of resolved.subcollections) {
        const subSnap = await cust.ref.collection(sub).where('branchId', '==', args.branch).get();
        if (subSnap.empty) continue;
        out[`be_customers/${cust.id}/${sub}`] = subSnap.docs.map(d => ({ ...d.data(), id: d.id }));
      }
    }
  }

  const file = buildBackupFile({
    sourceBranchId: args.branch,
    exportedBy: 'cli-make-fresh',
    collections: out,
    isAutoPreFresh: true,
    bucketIds,
  });
  validateBackupFile(file);
  const json = JSON.stringify(file);
  const ts = Date.now();
  const storagePath = `backups/${args.branch}/auto-pre-fresh-cli-${ts}-${randHex(4)}.json`;

  if (!apply) {
    console.log('DRY-RUN — scope resolves to:');
    console.log(`  Collections: ${resolved.collections.join(', ')}`);
    console.log(`  Subcollections (per-customer): ${resolved.subcollections.join(', ') || '(none)'}`);
    console.log('');
    console.log('Per-collection counts:');
    console.log(file.meta.perCollectionCounts);
    console.log(`Total docs in scope: ${Object.values(file.meta.perCollectionCounts).reduce((a, b) => a + b, 0)}`);
    console.log(`File size: ${(json.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`bodyHash: ${file.meta.bodyHash}`);
    console.log('(Storage upload + delete would happen with --apply)');
    return;
  }

  // APPLY: upload backup + hash verify + wipe
  await bucket.file(storagePath).save(json, { contentType: 'application/json' });
  console.log(`✓ Auto-backup uploaded: ${storagePath}`);
  console.log(`✓ bodyHash: ${file.meta.bodyHash}`);

  // Verify Storage existence + re-download + re-compute hash to confirm integrity
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) { console.error('FATAL: backup verify FAILED (Storage exists check) — refusing wipe'); process.exit(1); }
  const [downloadedBuf] = await bucket.file(storagePath).download();
  const downloaded = JSON.parse(downloadedBuf.toString('utf8'));
  const recomputed = computeBodyHash(downloaded.collections);
  if (recomputed !== file.meta.bodyHash) {
    console.error(`FATAL: BACKUP_INTEGRITY_FAIL — recomputed ${recomputed} !== file ${file.meta.bodyHash}`);
    process.exit(1);
  }
  console.log('✓ Hash verified post-upload');

  // Wipe ONLY resolved scope (not full T1+T2+T3)
  // V66 fix 2026-05-15: spec-aware OR-merge for transfers/withdrawals
  const deletedCounts = {};
  for (const col of resolved.collections) {
    const docs = await queryBranchScopedDocs(col, args.branch);
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

  if (resolved.subcollections.length > 0) {
    const customersSnap = await dataCol('be_customers').get();
    let t4Deleted = 0;
    for (const cust of customersSnap.docs) {
      for (const sub of resolved.subcollections) {
        const subSnap = await cust.ref.collection(sub).where('branchId', '==', args.branch).get();
        for (let i = 0; i < subSnap.docs.length; i += BATCH_LIMIT) {
          const slice = subSnap.docs.slice(i, i + BATCH_LIMIT);
          const batch = db.batch();
          for (const d of slice) batch.delete(d.ref);
          await batch.commit();
          t4Deleted += slice.length;
        }
      }
    }
    deletedCounts['be_customers/__per_customer__'] = t4Deleted;
  }

  // Audit doc
  const auditId = `branch-make-fresh-cli-${ts}-${randHex()}`;
  await dataCol('be_admin_audit').doc(auditId).set({
    action: 'branch-make-fresh-cli',
    branchId: args.branch,
    bucketIds: [...bucketIds].sort(),
    autoBackupRef: storagePath,
    bodyHash: file.meta.bodyHash,
    deletedCounts,
    executedAt: new Date().toISOString(),
  });

  console.log('✓ Wipe complete');
  console.log('deletedCounts:', deletedCounts);
  console.log(`Audit doc: ${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
