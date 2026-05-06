#!/usr/bin/env node
// CLI mirror of /api/admin/branch-make-fresh. See spec §10.
// Run: node scripts/branch-make-fresh.mjs --branch=BR-... [--apply]
// Auto-backups first, then wipes T1+T2+T3+T4 (per branch).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { TIER_MAP, BACKUP_TIER_T1, BACKUP_TIER_T2, BACKUP_TIER_T3, T4_SUBCOLLECTIONS, resolveBackupScope } from '../src/lib/branchBackupCore.js';
import { buildBackupFile } from '../src/lib/branchBackupSchema.js';

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
if (!args.branch) { console.error('Usage: --branch=<id> [--apply]'); process.exit(1); }
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
  console.log(`Branch: ${args.branch} (mode: ${apply ? 'APPLY' : 'DRY-RUN'})\n`);

  // Step 1: auto-pre-fresh backup (always runs, even on dry-run, to verify scope)
  const scope = resolveBackupScope({ tiers: ['T1', 'T2', 'T3', 'T4'] });
  const out = {};
  for (const colName of scope) {
    if (colName === 'be_customers/__per_customer__') {
      const customersSnap = await dataCol('be_customers').get();
      for (const cust of customersSnap.docs) {
        for (const sub of T4_SUBCOLLECTIONS) {
          const subSnap = await cust.ref.collection(sub).where('branchId', '==', args.branch).get();
          if (subSnap.empty) continue;
          out[`be_customers/${cust.id}/${sub}`] = subSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        }
      }
    } else {
      const snap = await dataCol(colName).where('branchId', '==', args.branch).get();
      out[colName] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    }
  }
  const file = buildBackupFile({ sourceBranchId: args.branch, exportedBy: 'cli-make-fresh', scope: { tiers: ['T1', 'T2', 'T3', 'T4'] }, collections: out, isAutoPreFresh: true });
  const json = JSON.stringify(file);
  const ts = Date.now();
  const storagePath = `backups/${args.branch}/auto-pre-fresh-cli-${ts}-${randHex(4)}.json`;

  if (!apply) {
    console.log('DRY-RUN — would back up + wipe these counts:');
    console.log(file.meta.perCollectionCounts);
    console.log(`Total docs in scope: ${Object.values(file.meta.perCollectionCounts).reduce((a,b) => a+b, 0)}`);
    console.log(`File size: ${(json.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`(Storage upload + delete would happen with --apply)`);
    return;
  }

  // APPLY: upload backup + verify exists + wipe
  await bucket.file(storagePath).save(json, { contentType: 'application/json' });
  console.log(`✓ Auto-backup uploaded: ${storagePath}`);

  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) { console.error('FATAL: backup verify FAILED — refusing wipe'); process.exit(1); }

  const wipeList = [...TIER_MAP[BACKUP_TIER_T1], ...TIER_MAP[BACKUP_TIER_T2], ...TIER_MAP[BACKUP_TIER_T3]];
  const deletedCounts = {};
  for (const col of wipeList) {
    const snap = await dataCol(col).where('branchId', '==', args.branch).get();
    let deleted = 0;
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const slice = snap.docs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const d of slice) batch.delete(d.ref);
      await batch.commit();
      deleted += slice.length;
    }
    deletedCounts[col] = deleted;
  }

  const customersSnap = await dataCol('be_customers').get();
  let t4Deleted = 0;
  for (const cust of customersSnap.docs) {
    for (const sub of T4_SUBCOLLECTIONS) {
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

  console.log('✓ Wipe complete');
  console.log('deletedCounts:', deletedCounts);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
