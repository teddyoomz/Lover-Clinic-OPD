#!/usr/bin/env node
// CLI restore from a central-stock backup file — 2026-05-15 Task 11.
//
// Usage:
//   node scripts/central-stock-restore.mjs --source=backups/central/<path>.json [--apply]
//
// Reads v2 backup file from Storage, validates schema + recomputes hash,
// writes back per `{collection}/{warehouseId}` keys. Counter doc value
// restored verbatim. No-op if --apply not passed.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { computeBodyHash, validateBackupFile, jsonReviverForNonFinite } from '../src/lib/branchBackupSchema.js';

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

if (!args.source) {
  console.error('Usage: node scripts/central-stock-restore.mjs --source=<storage-path> [--apply]');
  process.exit(1);
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

async function main() {
  console.log(`Source: ${args.source}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}\n`);

  const [exists] = await bucket.file(args.source).exists();
  if (!exists) { console.error(`File not found: ${args.source}`); process.exit(1); }

  const [data] = await bucket.file(args.source).download();
  const file = JSON.parse(data.toString('utf8'), jsonReviverForNonFinite);
  validateBackupFile(file);

  if (file.meta.scopeKind !== 'central') {
    console.error(`Expected scopeKind=central, got ${file.meta.scopeKind}`);
    process.exit(1);
  }

  const recomputed = computeBodyHash(file.collections);
  if (recomputed !== file.meta.bodyHash) {
    console.error(`BACKUP_INTEGRITY_FAIL: recomputed ${recomputed} !== file ${file.meta.bodyHash}`);
    process.exit(1);
  }
  console.log('✓ Hash verified');
  console.log(`  bodyHash: ${file.meta.bodyHash}`);
  console.log(`  scopeKind: ${file.meta.scopeKind}`);
  console.log(`  warehouseIds: ${file.meta.warehouseIds?.join(', ')}`);
  console.log(`  bucketIds: ${file.meta.bucketIds?.join(', ')}`);

  let totalDocs = 0;
  for (const docs of Object.values(file.collections)) totalDocs += docs.length;
  console.log(`  totalDocs: ${totalDocs}\n`);

  if (!apply) {
    console.log('DRY-RUN — pass --apply to commit restore writes.');
    return;
  }

  let written = 0;
  for (const [key, docs] of Object.entries(file.collections)) {
    if (docs.length === 0) continue;
    const parts = key.split('/');
    const colName = parts[0];
    if (key.endsWith('/counter')) {
      // Counter doc restore (single doc at /counter sub-path)
      for (const d of docs) {
        const { id, ...rest } = d;
        await dataCol(colName).doc('counter').set(rest);
        written++;
      }
    } else {
      for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        const slice = docs.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (const d of slice) {
          const { id, ...rest } = d;
          batch.set(dataCol(colName).doc(id), rest);
        }
        await batch.commit();
        written += slice.length;
      }
    }
  }

  console.log(`✓ Restored ${written} docs`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
