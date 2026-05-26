#!/usr/bin/env node
// Rule R (READ-ONLY) diagnostic — root-cause the Whole-System V81 NO_MANIFEST failures.
//
// Symptom (user screenshot): auto-20260521 = healthy (5604 docs / 379 users / manifest).
// auto-20260522..26 + manual-20260524 = NO_MANIFEST (0 docs/users, ~7-8MB partial files).
// Executor code unchanged since 2026-05-17 → data/scale threshold suspected.
//
// This script does NOT write anything (no real backup, no copy). It only READS:
//   A. Inspect each backups/whole-system/<folder>/ — manifest present? where did it die?
//   B. Whole-bucket scale + step-7 INPUT (customers/ + staff-chat-attachments/) + getFiles() time
//   C. Measured step-7 per-file cost (getMetadata + sha256(full download)) extrapolated vs 300s cap
//   D. Firestore collection completeness — prod collections vs V81 scope lists
//
// Usage: node scripts/diag-whole-system-backup-failure.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  UNIVERSAL_COLLECTIONS,
  BRANCH_SCOPED_COLLECTIONS,
  STORAGE_INCLUDE_PREFIXES,
  resolveStorageScopeForBackup,
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
const BUCKET = `${APP_ID}.firebasestorage.app`;

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
    storageBucket: BUCKET,
  });
}

function sha256Stream(readable) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    readable.on('data', (c) => h.update(c));
    readable.on('end', () => resolve(h.digest('hex')));
    readable.on('error', reject);
  });
}

const fmtMB = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;

async function main() {
  const db = getFirestore();
  const bucket = getStorage().bucket();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' DIAG — Whole-System V81 backup failure (READ-ONLY, Rule R)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── SECTION A: inspect each backups/whole-system/<folder>/ ──────────────
  console.log('─── A. backups/whole-system/ folder forensics (where did it die?) ───');
  const [wsFiles] = await bucket.getFiles({ prefix: 'backups/whole-system/' });
  const folders = new Map(); // folder -> { hasManifest, buckets: {universal, branchScoped, subcoll, auth, storage, other}, totalBytes }
  for (const f of wsFiles) {
    const m = f.name.match(/^backups\/whole-system\/([^/]+)\/(.+)$/);
    if (!m) continue;
    const [, folder, rest] = m;
    if (!folders.has(folder)) {
      folders.set(folder, {
        hasManifest: false,
        b: { universal: [0, 0], branchScoped: [0, 0], subcoll: [0, 0], auth: [0, 0], storage: [0, 0], other: [0, 0] },
        totalBytes: 0,
      });
    }
    const e = folders.get(folder);
    const sz = parseInt(f.metadata?.size || '0', 10);
    e.totalBytes += sz;
    if (rest === 'manifest.json') { e.hasManifest = true; e.b.other[0]++; e.b.other[1] += sz; }
    else if (rest.startsWith('collections/universal/')) { e.b.universal[0]++; e.b.universal[1] += sz; }
    else if (rest.startsWith('collections/branch-scoped/')) { e.b.branchScoped[0]++; e.b.branchScoped[1] += sz; }
    else if (rest.startsWith('collections/subcollections/')) { e.b.subcoll[0]++; e.b.subcoll[1] += sz; }
    else if (rest.startsWith('auth/')) { e.b.auth[0]++; e.b.auth[1] += sz; }
    else if (rest.startsWith('storage/')) { e.b.storage[0]++; e.b.storage[1] += sz; }
    else { e.b.other[0]++; e.b.other[1] += sz; }
  }
  const sortedFolders = [...folders.keys()].sort();
  for (const folder of sortedFolders) {
    const e = folders.get(folder);
    const b = e.b;
    console.log(`\n  ${folder}  ${e.hasManifest ? '✅ MANIFEST' : '⚠ NO_MANIFEST'}  total=${fmtMB(e.totalBytes)}`);
    console.log(`    universal      : ${b.universal[0]}/${UNIVERSAL_COLLECTIONS.length} files, ${fmtMB(b.universal[1])}`);
    console.log(`    branch-scoped  : ${b.branchScoped[0]}/${BRANCH_SCOPED_COLLECTIONS.length} files, ${fmtMB(b.branchScoped[1])}`);
    console.log(`    subcollections : ${b.subcoll[0]} files, ${fmtMB(b.subcoll[1])}`);
    console.log(`    auth/users.json: ${b.auth[0]} files, ${fmtMB(b.auth[1])}`);
    console.log(`    storage/       : ${b.storage[0]} files, ${fmtMB(b.storage[1])}  ← step-7 progress`);
  }

  // ── SECTION B: whole-bucket scale + step-7 input ────────────────────────
  console.log('\n\n─── B. Whole-bucket scale + step-7 INPUT (getFiles() cost) ───');
  const tGet = Date.now();
  const [allFiles] = await bucket.getFiles();
  const getFilesSec = (Date.now() - tGet) / 1000;
  let totalBytes = 0, includeCount = 0, includeBytes = 0, backupsCount = 0, backupsBytes = 0;
  const includeFiles = [];
  const prefixCounts = {};
  for (const f of allFiles) {
    const sz = parseInt(f.metadata?.size || '0', 10);
    totalBytes += sz;
    const top = f.name.split('/')[0] + '/';
    prefixCounts[top] = prefixCounts[top] || [0, 0];
    prefixCounts[top][0]++; prefixCounts[top][1] += sz;
    if (f.name.startsWith('backups/')) { backupsCount++; backupsBytes += sz; }
    if (resolveStorageScopeForBackup(f.name, { scope: 'full' })) {
      includeCount++; includeBytes += sz; includeFiles.push(f);
    }
  }
  console.log(`  getFiles() returned ${allFiles.length} objects in ${getFilesSec.toFixed(2)}s, total ${fmtMB(totalBytes)}`);
  console.log(`  backups/ accumulation: ${backupsCount} files, ${fmtMB(backupsBytes)}  ← compounding duplication`);
  console.log(`  step-7 INCLUDE (customers/ + staff-chat-attachments/): ${includeCount} files, ${fmtMB(includeBytes)}`);
  console.log(`  top-level prefix breakdown:`);
  for (const [p, [c, by]] of Object.entries(prefixCounts).sort((a, b) => b[1][1] - a[1][1])) {
    console.log(`    ${p.padEnd(28)} ${String(c).padStart(6)} files  ${fmtMB(by)}`);
  }

  // ── SECTION C: measured step-7 per-file cost (getMetadata + sha256 full download) ──
  console.log('\n\n─── C. Step-7 per-file cost (getMetadata + sha256 FULL download) ───');
  const sample = includeFiles.slice(0, 15);
  let sampleBytes = 0, sampleSec = 0;
  for (const f of sample) {
    const t0 = Date.now();
    const [meta] = await f.getMetadata();
    await sha256Stream(f.createReadStream());
    const dt = (Date.now() - t0) / 1000;
    sampleBytes += parseInt(meta.size || '0', 10);
    sampleSec += dt;
  }
  if (sample.length > 0) {
    const perFileSec = sampleSec / sample.length;
    const perMBSec = sampleSec / (sampleBytes / 1024 / 1024 || 1);
    // Extrapolate: full step-7 ≈ (per-file fixed cost × count) + (per-MB cost × total MB)
    // Use both estimators and report the larger (conservative).
    const estByFile = perFileSec * includeCount;
    const estByMB = perMBSec * (includeBytes / 1024 / 1024);
    console.log(`  sampled ${sample.length} files: ${fmtMB(sampleBytes)} in ${sampleSec.toFixed(2)}s`);
    console.log(`  per-file avg: ${perFileSec.toFixed(3)}s   per-MB avg: ${perMBSec.toFixed(3)}s`);
    console.log(`  EXTRAPOLATED step-7 (download+hash all ${includeCount} included files):`);
    console.log(`     by-file estimate: ${estByFile.toFixed(0)}s   by-MB estimate: ${estByMB.toFixed(0)}s`);
    console.log(`     (NOTE: executor ALSO does f.copy() per file — adds more. Vercel cap = 300s)`);
    const worst = Math.max(estByFile, estByMB);
    console.log(`  >>> VERDICT: step-7 alone ≈ ${worst.toFixed(0)}s vs 300s cap → ${worst > 300 ? '❌ EXCEEDS (timeout)' : worst > 200 ? '⚠ NEAR CAP' : '✓ under cap (look elsewhere)'}`);
  }

  // ── SECTION D: collection completeness ──────────────────────────────────
  console.log('\n\n─── D. Firestore collection completeness (prod vs V81 scope) ───');
  const dataDoc = db.doc(PREFIX);
  const cols = await dataDoc.listCollections();
  const prodColIds = cols.map(c => c.id).sort();
  const scopeSet = new Set([...UNIVERSAL_COLLECTIONS, ...BRANCH_SCOPED_COLLECTIONS]);
  const missing = prodColIds.filter(id => !scopeSet.has(id));
  const inScopeNotInProd = [...scopeSet].filter(id => !prodColIds.includes(id)).sort();
  console.log(`  prod has ${prodColIds.length} top-level data collections; V81 scope lists ${scopeSet.size}`);
  console.log(`\n  ⚠ IN PROD but NOT in V81 backup scope (SILENTLY OMITTED from backups):`);
  if (missing.length === 0) console.log('     (none)');
  for (const id of missing) {
    let cnt = '?';
    try { const agg = await db.collection(`${PREFIX}/${id}`).count().get(); cnt = agg.data().count; } catch { /* ignore */ }
    console.log(`     ${id.padEnd(34)} ${cnt} docs`);
  }
  console.log(`\n  in V81 scope but EMPTY/absent in prod (harmless): ${inScopeNotInProd.join(', ') || '(none)'}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' DIAG COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error('\nFATAL:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
