#!/usr/bin/env node
// scripts/v82-followup-restore-3-collections.mjs
// V82-followup ROLLBACK — restore 3 collections wrongly wiped:
//   opd_sessions (82) + chat_history (3,324) + chat_conversations (1)
//
// User clarified: backend customer wipe was correct; chat + opd_sessions
// were OUTSIDE scope. This script restores those 3 collections ONLY from
// the V81 backup at backups/whole-system/pre-restore-20260517-1331/.
//
// be_customers + be_treatments + be_sales + be_appointments + be_recalls
// remain WIPED per user's actual intent.
// HN counter remains DELETED per user's actual intent.
//
// USAGE:
//   node scripts/v82-followup-restore-3-collections.mjs            # dry-run
//   node scripts/v82-followup-restore-3-collections.mjs --apply    # restore

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { decodeFirestoreData } from '../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const BASE = ['artifacts', APP_ID, 'public', 'data'];
const BACKUP_FOLDER = 'backups/whole-system/pre-restore-20260517-1331';

const RESTORE_COLLECTIONS = ['opd_sessions', 'chat_history', 'chat_conversations'];

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function parseArgs() {
  return { apply: process.argv.includes('--apply') };
}

function dataCol(db, name) {
  let ref = db;
  for (const seg of BASE) ref = ref.collection ? ref.collection(seg) : ref.doc(seg);
  return ref.collection(name);
}

async function downloadJson(bucket, gsPath) {
  const [buf] = await bucket.file(gsPath).download();
  return JSON.parse(buf.toString('utf8'));
}

async function restoreCollection(db, colName, docs) {
  let written = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const chunk = docs.slice(i, i + 400);
    const batch = db.batch();
    for (const docEntry of chunk) {
      const { id, ...rest } = docEntry;
      const decoded = decodeFirestoreData(rest, { Timestamp, GeoPoint });
      batch.set(dataCol(db, colName).doc(id), decoded);
    }
    await batch.commit();
    written += chunk.length;
  }
  return written;
}

async function main() {
  const opts = parseArgs();
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket: BUCKET,
    });
  }
  const db = getFirestore();
  const bucket = getStorage().bucket(BUCKET);

  console.log('=== V82-followup ROLLBACK: restore 3 collections ===');
  console.log('Mode:', opts.apply ? 'APPLY' : 'DRY-RUN');
  console.log('Backup:', BACKUP_FOLDER);
  console.log();

  const plan = {};
  for (const colName of RESTORE_COLLECTIONS) {
    // V81 backup layout: collections/universal/{name}.json for universal collections
    const gsPath = `${BACKUP_FOLDER}/collections/universal/${colName}.json`;
    console.log(`[load] ${gsPath}`);
    const raw = await downloadJson(bucket, gsPath);
    // Backup format: { name, docCount, fileHash, docs: [{id, ...fields}] } OR a flat array.
    const docs = Array.isArray(raw) ? raw : Array.isArray(raw.docs) ? raw.docs : [];
    plan[colName] = docs;
    console.log(`  docs: ${docs.length.toLocaleString()}`);
  }

  if (!opts.apply) {
    console.log('\n[DRY-RUN] No writes. Pass --apply to execute restore.');
    return;
  }

  console.log('\n=== APPLY ===');
  const results = {};
  for (const colName of RESTORE_COLLECTIONS) {
    console.log(`[restore] ${colName}`);
    const docs = plan[colName];
    const n = await restoreCollection(db, colName, docs);
    results[colName] = n;
    console.log(`  ✓ ${n.toLocaleString()} docs restored`);
  }

  // Audit
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const auditId = `v82-followup-rollback-restore-${ts}-${rand}`;
  await dataCol(db, 'be_admin_audit').doc(auditId).set({
    type: 'v82-followup-rollback-restore',
    performedAt: new Date().toISOString(),
    reason: 'Restore opd_sessions + chat_history + chat_conversations wrongly wiped (outside user scope). be_customers/be_treatments/be_sales/be_appointments/be_recalls + HN counter remain wiped per user intent.',
    backupRef: BACKUP_FOLDER,
    restoredCollections: results,
  });
  console.log(`\n✓ Audit: be_admin_audit/${auditId}`);

  console.log('\n=== RESTORE COMPLETE ===');
  for (const [k, v] of Object.entries(results)) console.log(`  ${k}: ${v.toLocaleString()}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => { console.error('FATAL:', err.message || err); process.exit(1); });
}
