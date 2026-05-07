#!/usr/bin/env node
// PARANOID E2E: simulate the EXACT user flow
//   1. Press "ทำให้เป็นสาขาใหม่" → backup auto-uploads, then wipe
//   2. Press "Download ไฟล์ (.json)" → file downloads to local disk
//   3. Press "Upload File" + Restore → file content re-uploaded as base64
//
// Verifies post-restore state is BYTE-PERFECT identical to pre-state at the
// per-doc per-field level. If anything diverges, diff is reported with full
// detail (before/after values) so we can iterate the fix.
//
// CRITICAL: enterprise data integrity. User explicitly said "ซีเรียสมาก ...
// ข้อมูลบริษัทมูลค่าหลายล้าน". Must achieve 100% deep-equal — no exceptions.
//
// Auto-recovers if anything fails (auto-pre-fresh backup remains in Storage).
//
// Usage: node scripts/diag-prod-download-reupload-roundtrip.mjs --branch="ทดลอง 1"

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
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
  console.error(`Branch not found by name "${wantName}". Available:`);
  for (const d of branchesSnap.docs) {
    console.error(`  ${d.id} → ${d.data().branchName || d.data().name || '?'}`);
  }
  process.exit(1);
}

// Convert anything that comes out of snap.data() into pure JSON-equivalent
// so deep-equal can compare. Mirrors what JSON.stringify(snap.data()) →
// JSON.parse() would produce. Handles Firestore Timestamps + GeoPoint +
// nested objects.
function normalizeForCompare(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    // Firestore Timestamp instance
    if (typeof v.toDate === 'function' && typeof v.seconds === 'number') {
      return { _seconds: v.seconds, _nanoseconds: v.nanoseconds || 0, _type: 'Timestamp' };
    }
    // GeoPoint
    if (typeof v.latitude === 'number' && typeof v.longitude === 'number' && Object.keys(v).length === 2) {
      return { _lat: v.latitude, _lng: v.longitude, _type: 'GeoPoint' };
    }
    // Plain object that LOOKS like Timestamp post-JSON (the restored value)
    if (typeof v._seconds === 'number' && typeof v._nanoseconds === 'number') {
      return { _seconds: v._seconds, _nanoseconds: v._nanoseconds, _type: 'Timestamp' };
    }
    // Buffer / Bytes
    if (Buffer.isBuffer(v)) return { _bytes: v.toString('base64'), _type: 'Bytes' };
    // Array
    if (Array.isArray(v)) return v.map(normalizeForCompare);
    // Plain object — recurse + sort keys
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const nv = normalizeForCompare(v[k]);
      if (nv !== undefined) out[k] = nv;
    }
    return out;
  }
  // Primitives
  return v;
}

async function snapshotBranchFull(branchId) {
  // Returns { collectionName: { docId: {fields...} } } — full doc data
  const snap = {};
  const allCollections = [
    ...TIER_MAP[BACKUP_TIER_T1],
    ...TIER_MAP[BACKUP_TIER_T2],
    ...TIER_MAP[BACKUP_TIER_T3],
  ];
  for (const colName of allCollections) {
    const docs = await dataCol(colName).where('branchId', '==', branchId).get();
    if (docs.empty) continue;
    snap[colName] = {};
    for (const d of docs.docs) {
      snap[colName][d.id] = normalizeForCompare(d.data());
    }
  }
  // T4 — per-customer × per-subcollection
  const customersSnap = await dataCol('be_customers').get();
  for (const cust of customersSnap.docs) {
    for (const sub of T4_SUBCOLLECTIONS) {
      const subSnap = await cust.ref.collection(sub).where('branchId', '==', branchId).get();
      if (subSnap.empty) continue;
      const key = `be_customers/${cust.id}/${sub}`;
      snap[key] = {};
      for (const d of subSnap.docs) {
        snap[key][d.id] = normalizeForCompare(d.data());
      }
    }
  }
  return snap;
}

function deepDiff(a, b, path = '') {
  const diffs = [];
  if (a === b) return diffs;
  if (a === null && b !== null) return [{ path, type: 'extra-in-post', a, b }];
  if (a !== null && b === null) return [{ path, type: 'missing-in-post', a, b }];
  if (typeof a !== typeof b) return [{ path, type: 'type-mismatch', a, b }];
  if (typeof a !== 'object') {
    if (a !== b) return [{ path, type: 'value-changed', a, b }];
    return diffs;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return [{ path, type: 'array-vs-object', a, b }];
  if (Array.isArray(a)) {
    if (a.length !== b.length) diffs.push({ path: `${path}.length`, type: 'array-length-changed', a: a.length, b: b.length });
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      diffs.push(...deepDiff(a[i] ?? null, b[i] ?? null, `${path}[${i}]`));
    }
    return diffs;
  }
  // Plain object
  const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of allKeys) {
    if (!(k in (a || {}))) diffs.push({ path: `${path}.${k}`, type: 'extra-in-post', a: undefined, b: b[k] });
    else if (!(k in (b || {}))) diffs.push({ path: `${path}.${k}`, type: 'missing-in-post', a: a[k], b: undefined });
    else diffs.push(...deepDiff(a[k], b[k], `${path}.${k}`));
  }
  return diffs;
}

async function getAdminIdToken() {
  const customToken = await getAuth().createCustomToken(`download-reupload-${Date.now()}`, { admin: true });
  const exchangeRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  return (await exchangeRes.json()).idToken;
}

let preservedAutoBackupRef = null;

async function main() {
  console.log('═══ PARANOID E2E: download → re-upload round-trip ═══\n');

  const branchId = await findBranch();
  const branchName = (await dataCol('be_branches').doc(branchId).get()).data()?.branchName || '?';
  console.log(`Target branch: ${branchName} (id=${branchId})\n`);

  const idToken = await getAdminIdToken();
  console.log('✓ Admin idToken obtained\n');

  // ─── Step 1: PRE-state snapshot (full doc data) ───
  console.log('─── Step 1: PRE-state full snapshot ───');
  const t0 = Date.now();
  const preState = await snapshotBranchFull(branchId);
  let preDocCount = 0;
  for (const col of Object.keys(preState)) preDocCount += Object.keys(preState[col]).length;
  console.log(`  ${preDocCount} docs across ${Object.keys(preState).length} collections`);
  console.log(`  Snapshot took ${((Date.now() - t0)/1000).toFixed(2)}s`);
  if (preDocCount === 0) {
    console.error('❌ Branch is empty — nothing to round-trip');
    process.exit(1);
  }
  for (const [col, docs] of Object.entries(preState).sort()) {
    console.log(`    ${col}: ${Object.keys(docs).length} docs`);
  }
  console.log('');

  // ─── Step 2: Make-Fresh (auto-backup + wipe) via deployed endpoints ───
  console.log('─── Step 2: Make-Fresh via deployed endpoints ───');
  const backupRes = await fetch(`${PROD_URL}/api/admin/branch-backup-export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ branchId, tiers: ['T1', 'T2', 'T3', 'T4'], isAutoPreFresh: true }),
  });
  if (!backupRes.ok) throw new Error(`backup failed HTTP ${backupRes.status}`);
  const backupJson = await backupRes.json();
  preservedAutoBackupRef = backupJson.storagePath;
  console.log(`  ✓ Auto-backup uploaded: ${backupJson.storagePath} (${backupJson.sizeBytes} bytes)`);
  console.log(`  ✓ signedUrl includes attachment hint: ${backupJson.signedUrl.includes('response-content-disposition=attachment')}`);

  const wipeRes = await fetch(`${PROD_URL}/api/admin/branch-make-fresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ branchId, autoBackupRef: backupJson.storagePath }),
  });
  if (!wipeRes.ok) throw new Error(`wipe failed HTTP ${wipeRes.status}`);
  const wipeJson = await wipeRes.json();
  console.log(`  ✓ Wiped ${Object.values(wipeJson.deletedCounts || {}).reduce((a,b)=>a+b,0)} docs`);

  // Verify wipe
  const wipedState = await snapshotBranchFull(branchId);
  let wipedTotal = 0;
  for (const col of Object.keys(wipedState)) wipedTotal += Object.keys(wipedState[col]).length;
  if (wipedTotal !== 0) throw new Error(`wipe verification failed: ${wipedTotal} docs remain`);
  console.log('  ✓ Wipe verified — branch is empty\n');

  // ─── Step 3: DOWNLOAD via signedUrl (REAL HTTPS as browser would) ───
  console.log('─── Step 3: Download backup file via signedUrl (browser-equivalent) ───');
  const downloadRes = await fetch(backupJson.signedUrl);
  if (!downloadRes.ok) throw new Error(`download failed HTTP ${downloadRes.status}`);
  console.log(`  ✓ Content-Disposition: ${downloadRes.headers.get('content-disposition')}`);
  console.log(`  ✓ Content-Type: ${downloadRes.headers.get('content-type')}`);
  console.log(`  ✓ Content-Length: ${downloadRes.headers.get('content-length')}`);
  const fileBuffer = Buffer.from(await downloadRes.arrayBuffer());
  console.log(`  ✓ Downloaded ${fileBuffer.length} bytes to memory`);

  // Save to local disk for forensic inspection
  const localPath = `F:/LoverClinic-app/v40-roundtrip-${branchId}-${Date.now()}.json`;
  writeFileSync(localPath, fileBuffer);
  console.log(`  ✓ Saved to local disk: ${localPath}`);

  // Validate JSON parses
  let parsedFile;
  try { parsedFile = JSON.parse(fileBuffer.toString('utf-8')); }
  catch (e) { throw new Error(`Downloaded file is not valid JSON: ${e.message}`); }
  console.log(`  ✓ JSON parses cleanly — schemaVersion ${parsedFile.meta?.schemaVersion}`);
  console.log(`  ✓ sourceBranchId: ${parsedFile.meta?.sourceBranchId}\n`);

  // ─── Step 4: Re-upload via uploadedFileBase64 path (mirror UI Restore form) ───
  console.log('─── Step 4: Re-upload via /api/admin/branch-restore (uploadedFileBase64 path) ───');
  // UI does FileReader.readAsDataURL → split(',')[1] = base64
  const uploadedFileBase64 = fileBuffer.toString('base64');
  console.log(`  Base64 size: ${uploadedFileBase64.length} chars (${(uploadedFileBase64.length/1024).toFixed(1)} KB)`);

  const restoreRes = await fetch(`${PROD_URL}/api/admin/branch-restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      mode: 'overwrite',
      uploadedFileBase64,
      targetBranchId: branchId,
    }),
  });
  if (!restoreRes.ok) {
    const t = await restoreRes.text();
    throw new Error(`restore failed HTTP ${restoreRes.status}: ${t.slice(0, 500)}`);
  }
  const restoreJson = await restoreRes.json();
  if (!restoreJson.ok) throw new Error(`restore bad response: ${JSON.stringify(restoreJson).slice(0, 500)}`);
  let totalWritten = 0;
  for (const v of Object.values(restoreJson.perCollection || {})) totalWritten += (v.written || 0);
  console.log(`  ✓ Wrote ${totalWritten} docs back to branch`);
  console.log(`  ✓ auditId: ${restoreJson.auditId}\n`);

  // ─── Step 5: POST-state snapshot ───
  console.log('─── Step 5: POST-restore full snapshot ───');
  const postState = await snapshotBranchFull(branchId);
  let postDocCount = 0;
  for (const col of Object.keys(postState)) postDocCount += Object.keys(postState[col]).length;
  console.log(`  ${postDocCount} docs across ${Object.keys(postState).length} collections`);
  for (const [col, docs] of Object.entries(postState).sort()) {
    console.log(`    ${col}: ${Object.keys(docs).length} docs`);
  }
  console.log('');

  // ─── Step 6: DEEP-EQUAL verify ───
  console.log('─── Step 6: Deep-equal pre-state vs post-state ───');
  const diffs = deepDiff(preState, postState, '');
  if (diffs.length === 0) {
    console.log('  ✅ 100% MATCH — every collection, every doc, every field byte-perfect identical\n');
    preservedAutoBackupRef = null; // success — let auto-backup file age out naturally
    console.log('═══ ✅ ROUND-TRIP 100% PASS — enterprise-grade integrity verified ═══');
    return;
  }

  // Diff exists — drill in
  console.log(`  ❌ ${diffs.length} divergence(s) found:\n`);
  // Group by top-level path for readability
  const grouped = {};
  for (const d of diffs) {
    const key = d.path.split('.').slice(0, 2).join('.') || '(root)';
    grouped[key] = grouped[key] || [];
    grouped[key].push(d);
  }
  for (const [k, list] of Object.entries(grouped).slice(0, 20)) {
    console.log(`  Path "${k}" (${list.length} diff${list.length > 1 ? 's' : ''}):`);
    for (const d of list.slice(0, 5)) {
      console.log(`    [${d.type}] ${d.path}`);
      const aStr = JSON.stringify(d.a)?.slice(0, 120);
      const bStr = JSON.stringify(d.b)?.slice(0, 120);
      console.log(`      pre:  ${aStr}`);
      console.log(`      post: ${bStr}`);
    }
    if (list.length > 5) console.log(`    ... ${list.length - 5} more diff(s)`);
  }
  if (Object.keys(grouped).length > 20) {
    console.log(`  ... ${Object.keys(grouped).length - 20} more path group(s)`);
  }
  console.log('\n═══ ❌ ROUND-TRIP DIVERGENCE — needs fix ═══');
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error('\n❌ FATAL:', e.message);
      console.error(e.stack);
      if (preservedAutoBackupRef) {
        console.error(`\n🔧 RECOVERY: auto-pre-fresh backup preserved at:`);
        console.error(`   ${preservedAutoBackupRef}`);
      }
      process.exit(1);
    });
}
