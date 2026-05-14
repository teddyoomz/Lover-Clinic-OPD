#!/usr/bin/env node
// CLI mirror of /api/admin/branch-backup-export. See spec §10.
// Run: node scripts/branch-backup-export.mjs --branch=BR-... [--tiers=T1,T2]

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { resolveBackupScope, T4_SUBCOLLECTIONS } from '../src/lib/branchBackupCore.js';
import { buildBackupFile } from '../src/lib/branchBackupSchema.js';
import { getFilterSpecForCollection } from '../src/lib/branchBackupBuckets.js';

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
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
if (!args.branch) { console.error('Usage: --branch=<id> [--tiers=T1,T2,T3,T4] [--collections=...]'); process.exit(1); }

const tiers = args.tiers ? String(args.tiers).split(',') : ['T1', 'T2', 'T3', 'T4'];
const collections = args.collections ? String(args.collections).split(',') : null;

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

async function main() {
  const scope = resolveBackupScope({ tiers, collections });
  console.log(`Branch: ${args.branch}\nScope: ${scope.length} collections`);

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
      // V66 fix 2026-05-15: spec-aware OR-merge for be_stock_transfers +
      // be_stock_withdrawals (their canonical fields are sourceLocationId +
      // destinationLocationId, not branchId).
      const spec = getFilterSpecForCollection(colName);
      const docMap = new Map();
      const snap1 = await dataCol(colName).where(spec.filterField, '==', args.branch).get();
      for (const d of snap1.docs) docMap.set(d.id, d);
      if (spec.orFilterField) {
        const snap2 = await dataCol(colName).where(spec.orFilterField, '==', args.branch).get();
        for (const d of snap2.docs) {
          if (!docMap.has(d.id)) docMap.set(d.id, d);
        }
      }
      out[colName] = [...docMap.values()].map(d => ({ ...d.data(), id: d.id }));
    }
  }

  const file = buildBackupFile({ sourceBranchId: args.branch, exportedBy: 'cli', scope: { tiers, collections }, collections: out });
  const json = JSON.stringify(file);
  const ts = Date.now();
  const storagePath = `backups/${args.branch}/manual-cli-${ts}-${randomBytes(4).toString('hex')}.json`;
  await bucket.file(storagePath).save(json, { contentType: 'application/json' });
  console.log(`✓ Uploaded: ${storagePath} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log('Counts:', file.meta.perCollectionCounts);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
