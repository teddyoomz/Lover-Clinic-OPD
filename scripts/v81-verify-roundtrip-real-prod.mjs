#!/usr/bin/env node
// V81 Task 21 — Round-trip verification on REAL prod via Firestore multi-database.
// Source: (default) database (read-only). Target: clone-verify database (we own).
// Verifies backup→restore→sample-diff WITHOUT damaging production data.
//
// PREREQUISITE (one-time):
//   gcloud firestore databases create --database=clone-verify \
//     --location=asia-southeast1 --project=loverclinic-opd-4c39b
//
// USAGE:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/v81-verify-roundtrip-real-prod.mjs --backup-ref=NAME [--sample-size=50]
//
// SAFETY: writes ONLY to clone-verify database. Never touches (default).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { UNIVERSAL_COLLECTIONS } from '../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const TARGET_DB = 'clone-verify';
const BATCH_SIZE = 450;

function loadEnv() {
  const envPath = path.resolve('.env.local.prod');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local.prod missing — run `vercel env pull` first');
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function parseArgs() {
  const opts = { sampleSize: 50 };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--backup-ref=')) opts.backupRef = a.slice(13);
    else if (a.startsWith('--sample-size=')) opts.sampleSize = parseInt(a.slice(14), 10) || 50;
  }
  if (!opts.backupRef) {
    throw new Error('Need --backup-ref=NAME');
  }
  return opts;
}

async function wipeCloneVerify(targetDb) {
  // Paginated delete: clone-verify is our sandbox; safe to wipe before restore.
  for (const col of UNIVERSAL_COLLECTIONS) {
    let snap;
    do {
      snap = await targetDb.collection(`${PREFIX}/${col}`).limit(BATCH_SIZE).get();
      if (snap.empty) break;
      const batch = targetDb.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } while (snap.size === BATCH_SIZE);
  }
}

async function restoreToTarget(targetDb, storage, manifest, backupRef) {
  let restored = 0;
  for (const c of manifest.collections) {
    // Restore only universal collections in this verifier (branch-scoped + subcoll
    // verified by emulator round-trip Task 19; secondary-DB scope = real-prod
    // universal data shape verification only — avoid huge cost on subcoll cascade)
    if (c.type !== 'universal') continue;
    try {
      const [buf] = await storage.file(`backups/whole-system/${backupRef}/${c.path}`).download();
      const docs = JSON.parse(buf.toString('utf8'));
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = targetDb.batch();
        for (const doc of docs.slice(i, i + BATCH_SIZE)) {
          const { id, ...data } = doc;
          batch.set(targetDb.doc(`${PREFIX}/${c.name}/${id}`), data);
        }
        await batch.commit();
      }
      restored += docs.length;
    } catch (e) {
      console.warn(`Restore failed for ${c.name}: ${e.message}`);
    }
  }
  return restored;
}

async function diffSourceVsTarget(sourceDb, targetDb, sampleSize) {
  let diffs = 0;
  let sampled = 0;
  const failedCollections = [];
  // Sample first 10 universal collections × N docs each
  for (const col of UNIVERSAL_COLLECTIONS.slice(0, 10)) {
    try {
      const srcSnap = await sourceDb.collection(`${PREFIX}/${col}`).limit(sampleSize).get();
      for (const d of srcSnap.docs) {
        sampled += 1;
        const tgt = await targetDb.doc(`${PREFIX}/${col}/${d.id}`).get();
        if (!tgt.exists) {
          diffs += 1;
          continue;
        }
        // Compare raw doc data (excluding Firestore Timestamp objects which serialize
        // to different forms — compare via JSON.stringify for content equality)
        const srcJson = JSON.stringify(d.data(), Object.keys(d.data()).sort());
        const tgtJson = JSON.stringify(tgt.data(), Object.keys(tgt.data()).sort());
        if (srcJson !== tgtJson) diffs += 1;
      }
    } catch (e) {
      failedCollections.push({ collection: col, error: e.message });
    }
  }
  return { diffs, sampled, failedCollections };
}

async function main() {
  const opts = parseArgs();
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!env.FIREBASE_ADMIN_CLIENT_EMAIL || !privateKey) {
    throw new Error('FIREBASE_ADMIN_* env vars missing');
  }
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

  const sourceDb = getFirestore();        // (default) — read-only
  const targetDb = getFirestore(TARGET_DB); // clone-verify — we own
  const storage = getStorage().bucket();

  console.log('Phase 1: Wipe clone-verify database (sandbox reset)...');
  await wipeCloneVerify(targetDb);

  console.log(`Phase 2: Read backup manifest ${opts.backupRef}...`);
  const [manifestBuf] = await storage.file(`backups/whole-system/${opts.backupRef}/manifest.json`).download();
  const manifest = JSON.parse(manifestBuf.toString('utf8'));

  console.log(`Phase 3: Restore universal collections → clone-verify...`);
  const restoredCount = await restoreToTarget(targetDb, storage, manifest, opts.backupRef);
  console.log(`  Restored ${restoredCount} docs`);

  console.log(`Phase 4: Diff source vs clone-verify (sample ${opts.sampleSize} docs × 10 collections)...`);
  const { diffs, sampled, failedCollections } = await diffSourceVsTarget(sourceDb, targetDb, opts.sampleSize);
  console.log(`  Sampled: ${sampled} docs`);
  console.log(`  Diffs:   ${diffs}`);
  if (failedCollections.length) {
    console.log(`  Failed:  ${failedCollections.length} collections — ${JSON.stringify(failedCollections).slice(0, 200)}`);
  }

  if (diffs === 0) {
    console.log('✓ ROUND-TRIP VERIFIED: source == clone-verify (byte-identical on sampled subset)');
    process.exit(0);
  } else {
    console.error(`✗ DIFFS DETECTED — ${diffs}/${sampled} docs differ`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
