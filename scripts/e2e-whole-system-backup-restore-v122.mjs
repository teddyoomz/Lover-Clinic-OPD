#!/usr/bin/env node
// Rule Q L2 e2e — V122 whole-system backup/restore on REAL prod data.
//   Phase 1: run the FIXED backup executor (admin SDK, local, no 300s cap) →
//            assert COMPLETE manifest (every live collection captured incl. the
//            28 previously-omitted) + Timestamp markers + hash validates.
//   Phase 2: restore round-trip into an ISOLATED namespace
//            (artifacts/{APP_ID}/public/data-V122-VERIFY-{ts}/) using the REAL
//            decode + Firestore writes on the REAL backup files → assert each
//            restored doc is byte-identical to the live source (incl. Timestamp
//            instanceof + .toMillis()). NEVER touches the real `data` tree.
//   Phase 3: cleanup (isolated namespace + the test backup folder).
//
// Usage: node scripts/e2e-whole-system-backup-restore-v122.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { runWholeSystemBackup } from '../api/admin/_lib/wholeSystemBackupExecutor.js';
import {
  validateWholeSystemManifest,
  decodeFirestoreData,
  encodeFirestoreData,
} from '../src/lib/wholeSystemBackupCore.js';

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
const PREFIX = `artifacts/${APP_ID}/public/data`;

// Firestore does NOT guarantee field ORDER on read, so doc equality must be
// order-insensitive. stableStringify recursively sorts keys → canonical form.
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}
const VERIFY_DOC = `data-V122-VERIFY-${Date.now()}`;
const VERIFY_PREFIX = `artifacts/${APP_ID}/public/${VERIFY_DOC}`;
const FB = { Timestamp, GeoPoint };

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

// Collections to deep-verify in the restore round-trip: newly-covered money/counter
// collections (proves Bug-2 fix) + a Timestamp-heavy one + a universal one.
const RESTORE_SAMPLE = ['be_customers', 'be_deposits', 'be_wallet_transactions', 'be_recalls', 'chat_history'];
const MUST_BE_PRESENT = ['be_deposits', 'be_wallet_transactions', 'be_point_transactions', 'be_customer_counter', 'be_sales_counter', 'be_master_products'];

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail++; console.log(`  ✗ ${m}`); };

let createdBackupName = null;

async function main() {
  const db = getFirestore();
  const storage = getStorage().bucket();
  const auth = getAuth();

  // ── PHASE 1 — real-prod DUMP via fixed executor ──────────────────────────
  console.log('═══ PHASE 1 — DUMP (fixed executor, real prod) ═══');
  const t0 = Date.now();
  const result = await runWholeSystemBackup({
    db, storage, auth, type: 'manual', createdBy: 'e2e-v122', runCleanup: false, scope: 'full',
  });
  createdBackupName = result.name;
  console.log(`  backup '${result.name}' in ${((Date.now() - t0) / 1000).toFixed(1)}s (local); failedCollections=${result.failedCollections.length} failedStorage=${result.failedStorageObjects.length}`);
  if (result.failedCollections.length === 0) ok('zero failed collections'); else bad(`failedCollections: ${JSON.stringify(result.failedCollections).slice(0, 300)}`);

  const [mBuf] = await storage.file(`backups/whole-system/${result.name}/manifest.json`).download();
  const manifest = JSON.parse(mBuf.toString('utf8'));
  const v = validateWholeSystemManifest(manifest);
  if (v.valid) ok('manifest.json present + hash validates'); else bad(`manifest invalid: ${v.reason}`);

  // Completeness: every LIVE collection must be in the backup
  const liveCols = (await db.doc(PREFIX).listCollections()).map(c => c.id).sort();
  const backedUpTopLevel = new Set(
    manifest.collections.filter(c => !c.name.includes('/')).map(c => c.name)
  );
  const missing = liveCols.filter(c => !backedUpTopLevel.has(c));
  console.log(`  live top-level collections: ${liveCols.length}; backed up: ${backedUpTopLevel.size}`);
  if (missing.length === 0) ok(`ALL ${liveCols.length} live collections captured (Bug-2 completeness)`); else bad(`MISSING from backup: ${missing.join(', ')}`);

  // Explicit money/counter presence (the previously-omitted critical ones)
  const presentMust = MUST_BE_PRESENT.filter(c => backedUpTopLevel.has(c) && liveCols.includes(c));
  const liveMust = MUST_BE_PRESENT.filter(c => liveCols.includes(c));
  if (presentMust.length === liveMust.length) ok(`money/counter collections captured: ${presentMust.join(', ')}`);
  else bad(`money/counter MISSING: ${liveMust.filter(c => !backedUpTopLevel.has(c)).join(', ')}`);

  // Timestamp markers present in at least one collection file
  const tsCol = manifest.collections.find(c => c.name === 'be_recalls' || c.name === 'chat_history' || c.name === 'be_customers');
  if (tsCol) {
    const [tBuf] = await storage.file(`backups/whole-system/${result.name}/${tsCol.path}`).download();
    const hasMarker = tBuf.toString('utf8').includes('"__type": "timestamp"') || tBuf.toString('utf8').includes('"__type":"timestamp"');
    if (hasMarker) ok(`Timestamp encode markers present in ${tsCol.name}`); else console.log(`  (i) no Timestamp marker in ${tsCol.name} sample — may legitimately have none`);
  }

  // ── PHASE 2 — restore round-trip into ISOLATED namespace ─────────────────
  console.log(`\n═══ PHASE 2 — RESTORE round-trip → ${VERIFY_DOC} (isolated) ═══`);
  for (const colName of RESTORE_SAMPLE) {
    const entry = manifest.collections.find(c => c.name === colName);
    if (!entry) { console.log(`  (skip ${colName} — not in backup/empty)`); continue; }

    // Restore: download backup → decode (REAL) → write to isolated namespace
    const [buf] = await storage.file(`backups/whole-system/${result.name}/${entry.path}`).download();
    const docs = JSON.parse(buf.toString('utf8')).map(d => decodeFirestoreData(d, FB));
    let batch = db.batch(); let n = 0;
    for (const doc of docs) {
      const { id, ...data } = doc;
      batch.set(db.collection(`${VERIFY_PREFIX}/${colName}`).doc(String(id)), data);
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (n % 400 !== 0) await batch.commit();

    // Verify: every restored doc identical to the LIVE source (order-insensitive,
    // re-encode → canonical compare). Capture the FIRST real diff for inspection.
    let mismatch = 0, tsVerified = 0, firstDiff = null;
    for (const doc of docs) {
      const id = String(doc.id);
      const [liveSnap, restoredSnap] = await Promise.all([
        db.collection(`${PREFIX}/${colName}`).doc(id).get(),
        db.collection(`${VERIFY_PREFIX}/${colName}`).doc(id).get(),
      ]);
      if (!liveSnap.exists) continue; // doc deleted live since backup — skip
      const liveEnc = stableStringify(encodeFirestoreData({ ...liveSnap.data(), id }));
      const restEnc = stableStringify(encodeFirestoreData({ ...restoredSnap.data(), id }));
      if (liveEnc !== restEnc) {
        mismatch++;
        if (!firstDiff) {
          // find first divergent char window
          let p = 0; while (p < liveEnc.length && liveEnc[p] === restEnc[p]) p++;
          firstDiff = { id, live: liveEnc.slice(Math.max(0, p - 60), p + 60), rest: restEnc.slice(Math.max(0, p - 60), p + 60) };
        }
      }
      for (const [k, val] of Object.entries(restoredSnap.data() || {})) {
        if (val instanceof Timestamp && liveSnap.data()[k] instanceof Timestamp) {
          if (val.toMillis() === liveSnap.data()[k].toMillis()) tsVerified++;
        }
      }
    }
    if (mismatch === 0) ok(`${colName}: ${docs.length} docs round-tripped IDENTICAL (Timestamp fields verified: ${tsVerified})`);
    else {
      bad(`${colName}: ${mismatch}/${docs.length} docs DIFFER after round-trip`);
      if (firstDiff) {
        console.log(`     first diff @ doc ${firstDiff.id}:`);
        console.log(`       live: …${firstDiff.live}…`);
        console.log(`       rest: …${firstDiff.rest}…`);
      }
    }
  }

  console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
}

async function cleanup() {
  console.log('\n🧹 Cleanup...');
  const db = getFirestore();
  const storage = getStorage().bucket();
  // isolated namespace
  for (const colName of RESTORE_SAMPLE) {
    try {
      const snap = await db.collection(`${VERIFY_PREFIX}/${colName}`).get();
      let batch = db.batch(); let n = 0;
      for (const d of snap.docs) { batch.delete(d.ref); if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); } }
      if (n % 400 !== 0) await batch.commit();
      if (snap.size) console.log(`  ✓ wiped ${snap.size} verify docs in ${colName}`);
    } catch (e) { console.log(`  ! verify cleanup ${colName}: ${e.message}`); }
  }
  // test backup folder
  if (createdBackupName) {
    try {
      await storage.deleteFiles({ prefix: `backups/whole-system/${createdBackupName}/` });
      console.log(`  ✓ deleted test backup folder ${createdBackupName}`);
    } catch (e) { console.log(`  ! backup folder cleanup: ${e.message}`); }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(cleanup)
    .then(() => process.exit(fail > 0 ? 1 : 0))
    .catch(async (e) => { console.error('\nFATAL:', e.message); console.error(e.stack); await cleanup(); process.exit(1); });
}
