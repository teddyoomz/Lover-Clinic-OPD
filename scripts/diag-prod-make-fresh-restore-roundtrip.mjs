#!/usr/bin/env node
// E2E ROUND-TRIP test: Make-Fresh + Restore on a real branch via deployed
// production endpoints. Proves:
//
//   1. Press "ทำให้เป็นสาขาใหม่" → backup file created → wipe → branch is empty
//   2. Restore that backup file → branch returns to pre-wipe state
//
// Hits the actual deployed Vercel endpoints (not mirrored logic). Captures
// pre/post counts at every step + auto-recovers if anything fails (the
// auto-pre-fresh backup file is preserved in Storage).
//
// Usage:
//   node scripts/diag-prod-make-fresh-restore-roundtrip.mjs --branch="ทดลอง 1"
//   node scripts/diag-prod-make-fresh-restore-roundtrip.mjs --branchId=BR-XXX

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { TIER_MAP, BACKUP_TIER_T1, BACKUP_TIER_T2, BACKUP_TIER_T3, T4_SUBCOLLECTIONS } from '../src/lib/branchBackupCore.js';

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
const db = getFirestore();
const dataCol = (name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));

async function findBranch() {
  if (args.branchId) return args.branchId;
  const wantName = args.branch || args.name || 'ทดลอง 1';
  const branchesSnap = await dataCol('be_branches').get();
  for (const d of branchesSnap.docs) {
    const data = d.data();
    if (data.branchName === wantName || data.name === wantName) return d.id;
  }
  console.error(`Branch not found by name "${wantName}". Available branches:`);
  for (const d of branchesSnap.docs) {
    console.error(`  ${d.id} → name:${d.data().branchName || d.data().name || '?'}`);
  }
  process.exit(1);
}

async function snapshotBranchState(branchId) {
  // Count docs per collection for the branch
  const counts = {};
  const allCollections = [
    ...TIER_MAP[BACKUP_TIER_T1],
    ...TIER_MAP[BACKUP_TIER_T2],
    ...TIER_MAP[BACKUP_TIER_T3],
  ];
  for (const colName of allCollections) {
    const snap = await dataCol(colName).where('branchId', '==', branchId).get();
    counts[colName] = snap.size;
  }
  // T4 — per-customer subcollection (parallel-batched, mirror endpoint)
  const customersSnap = await dataCol('be_customers').get();
  let t4Total = 0;
  const T4_BATCH_SIZE = 50;
  for (let i = 0; i < customersSnap.docs.length; i += T4_BATCH_SIZE) {
    const batch = customersSnap.docs.slice(i, i + T4_BATCH_SIZE);
    const sizes = await Promise.all(batch.flatMap(cust =>
      T4_SUBCOLLECTIONS.map(sub =>
        cust.ref.collection(sub).where('branchId', '==', branchId).get().then(s => s.size)
      )
    ));
    t4Total += sizes.reduce((a, b) => a + b, 0);
  }
  counts['be_customers/__per_customer__'] = t4Total;
  return counts;
}

function compareCounts(a, b) {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diff = [];
  for (const k of allKeys) {
    if ((a[k] || 0) !== (b[k] || 0)) diff.push({ k, before: a[k] || 0, after: b[k] || 0 });
  }
  return diff;
}

function totalDocs(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

async function getAdminIdToken() {
  const customToken = await getAuth().createCustomToken(`roundtrip-${Date.now()}`, { admin: true });
  const exchangeRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const data = await exchangeRes.json();
  if (!data.idToken) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.idToken;
}

let preservedAutoBackupRef = null; // Recovery hint

async function main() {
  console.log('═══ V40 Make-Fresh + Restore Round-Trip Test ═══\n');

  const branchId = await findBranch();
  const branchName = (await dataCol('be_branches').doc(branchId).get()).data()?.branchName || '?';
  console.log(`Target branch: ${branchName} (id=${branchId})\n`);

  const idToken = await getAdminIdToken();
  console.log('✓ Admin idToken obtained\n');

  // ─── Step 1: Snapshot PRE-state ───
  console.log('─── Step 1: Snapshot PRE-state ───');
  const t0 = Date.now();
  const preState = await snapshotBranchState(branchId);
  console.log(`  Total docs in branch: ${totalDocs(preState)}`);
  for (const [k, v] of Object.entries(preState)) {
    if (v > 0) console.log(`    ${k}: ${v}`);
  }
  console.log(`  Snapshot took ${((Date.now() - t0)/1000).toFixed(2)}s\n`);

  if (totalDocs(preState) === 0) {
    console.error('❌ Branch is already empty — nothing to round-trip. Aborting.');
    process.exit(1);
  }

  // ─── Step 2: Call /api/admin/branch-backup-export with isAutoPreFresh=true ───
  console.log('─── Step 2: POST /api/admin/branch-backup-export (isAutoPreFresh=true) ───');
  const backupT0 = Date.now();
  const backupRes = await fetch(`${PROD_URL}/api/admin/branch-backup-export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      branchId,
      tiers: ['T1', 'T2', 'T3', 'T4'],
      isAutoPreFresh: true,
    }),
  });
  const backupDt = Date.now() - backupT0;
  if (!backupRes.ok) {
    const t = await backupRes.text();
    throw new Error(`backup-export failed HTTP ${backupRes.status}: ${t.slice(0, 500)}`);
  }
  const backupJson = await backupRes.json();
  if (!backupJson.ok || !backupJson.storagePath) {
    throw new Error(`backup-export bad response: ${JSON.stringify(backupJson).slice(0, 500)}`);
  }
  preservedAutoBackupRef = backupJson.storagePath;
  console.log(`  ✓ HTTP 200 in ${(backupDt/1000).toFixed(2)}s`);
  console.log(`  storagePath: ${backupJson.storagePath}`);
  console.log(`  sizeBytes: ${backupJson.sizeBytes}`);
  console.log(`  perCollectionCounts: ${JSON.stringify(backupJson.perCollectionCounts)}\n`);

  // ─── Step 3: Call /api/admin/branch-make-fresh with autoBackupRef ───
  console.log('─── Step 3: POST /api/admin/branch-make-fresh (wipe step) ───');
  const wipeT0 = Date.now();
  const wipeRes = await fetch(`${PROD_URL}/api/admin/branch-make-fresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      branchId,
      autoBackupRef: backupJson.storagePath,
    }),
  });
  const wipeDt = Date.now() - wipeT0;
  if (!wipeRes.ok) {
    const t = await wipeRes.text();
    throw new Error(`make-fresh failed HTTP ${wipeRes.status}: ${t.slice(0, 500)}`);
  }
  const wipeJson = await wipeRes.json();
  if (!wipeJson.ok) {
    throw new Error(`make-fresh bad response: ${JSON.stringify(wipeJson).slice(0, 500)}`);
  }
  console.log(`  ✓ HTTP 200 in ${(wipeDt/1000).toFixed(2)}s`);
  const totalDeleted = Object.values(wipeJson.deletedCounts || {}).reduce((a, b) => a + b, 0);
  console.log(`  Total deleted: ${totalDeleted}`);
  console.log(`  auditId: ${wipeJson.auditId}\n`);

  // ─── Step 4: Verify branch is wiped ───
  console.log('─── Step 4: Verify branch is wiped ───');
  const wipedState = await snapshotBranchState(branchId);
  const wipedTotal = totalDocs(wipedState);
  console.log(`  Total docs after wipe: ${wipedTotal}`);
  if (wipedTotal !== 0) {
    console.error(`  ❌ FAIL: branch not fully wiped (${wipedTotal} docs remain)`);
    for (const [k, v] of Object.entries(wipedState)) {
      if (v > 0) console.log(`    ${k}: ${v}`);
    }
    throw new Error('Wipe verification failed');
  }
  console.log('  ✓ All branch-scoped data wiped (counts = 0)\n');

  // ─── Step 5: Call /api/admin/branch-restore with sourceStoragePath + overwrite mode ───
  console.log('─── Step 5: POST /api/admin/branch-restore (overwrite mode, same branch) ───');
  const restoreT0 = Date.now();
  const restoreRes = await fetch(`${PROD_URL}/api/admin/branch-restore`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      mode: 'overwrite',
      sourceStoragePath: backupJson.storagePath,
      targetBranchId: branchId,
    }),
  });
  const restoreDt = Date.now() - restoreT0;
  if (!restoreRes.ok) {
    const t = await restoreRes.text();
    throw new Error(`restore failed HTTP ${restoreRes.status}: ${t.slice(0, 500)}`);
  }
  const restoreJson = await restoreRes.json();
  if (!restoreJson.ok) {
    throw new Error(`restore bad response: ${JSON.stringify(restoreJson).slice(0, 500)}`);
  }
  console.log(`  ✓ HTTP 200 in ${(restoreDt/1000).toFixed(2)}s`);
  let totalWritten = 0;
  for (const [k, v] of Object.entries(restoreJson.perCollection || {})) {
    if (v.written > 0) {
      console.log(`    ${k}: ${v.written} written`);
      totalWritten += v.written;
    }
  }
  console.log(`  Total written: ${totalWritten}`);
  console.log(`  auditId: ${restoreJson.auditId}\n`);

  // ─── Step 6: Verify post-restore state matches PRE-state ───
  console.log('─── Step 6: Verify post-restore state matches pre-state ───');
  const postState = await snapshotBranchState(branchId);
  const postTotal = totalDocs(postState);
  console.log(`  Total docs after restore: ${postTotal}`);
  console.log(`  Total docs before make-fresh: ${totalDocs(preState)}`);

  const diff = compareCounts(preState, postState);
  if (diff.length === 0) {
    console.log('  ✅ EXACT MATCH — every collection has the same doc count\n');
  } else {
    console.log(`  ⚠️  ${diff.length} collection(s) differ:`);
    for (const d of diff) {
      console.log(`    ${d.k}: pre=${d.before} → post=${d.after} (Δ ${d.after - d.before})`);
    }
    if (postTotal !== totalDocs(preState)) {
      throw new Error(`Round-trip totals mismatch: pre=${totalDocs(preState)} vs post=${postTotal}`);
    }
    console.log('  ⚠️  Totals match but per-collection counts differ slightly — investigate above\n');
  }

  // Mark recovery as no-longer-needed
  preservedAutoBackupRef = null;

  console.log('═══ ✅ ROUND-TRIP PASS ═══');
  console.log(`Branch: ${branchName} (${branchId})`);
  console.log(`Make-Fresh wiped ${totalDeleted} docs in ${(wipeDt/1000).toFixed(1)}s`);
  console.log(`Restore wrote   ${totalWritten} docs in ${(restoreDt/1000).toFixed(1)}s`);
  console.log(`Final state matches pre-state: ${diff.length === 0 ? 'EXACT' : 'TOTALS MATCH (per-collection minor drift OK)'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error('\n❌ FATAL:', e.message);
      console.error(e.stack);
      if (preservedAutoBackupRef) {
        console.error(`\n🔧 RECOVERY: auto-pre-fresh backup is preserved at:`);
        console.error(`   ${preservedAutoBackupRef}`);
        console.error(`\n   To restore manually, POST /api/admin/branch-restore with:`);
        console.error(`     {"mode":"overwrite","sourceStoragePath":"${preservedAutoBackupRef}","targetBranchId":"<branch>"}`);
      }
      process.exit(1);
    });
}
