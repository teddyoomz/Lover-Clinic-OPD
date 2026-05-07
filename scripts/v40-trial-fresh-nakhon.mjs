#!/usr/bin/env node
// ─── V40 trial round-trip + real fresh orchestration ──────────────────────
//
// Spec: C:\Users\oomzp\.claude\plans\backup-frolicking-swan.md
//
// Workflow (when invoked with --apply):
//   Phase A — Pre-flight (read-only): count branch-scoped docs, list backups.
//   Phase B — Manual paranoia backup → backups/{branch}/manual-paranoia-*.json
//   Phase C1 — Auto-pre-fresh-trial backup + WIPE T1+T2+T3+T4
//   Phase C2 — Verify wipe count == 0
//   Phase C3 — Restore from auto-pre-fresh-trial (overwrite, NaN-reviver-aware)
//   Phase C4 — Bit-perfect 2-way verifier: trialText === postRestoreText
//   Phase D — Decision gate: pass → continue; fail → halt with diff log
//   Phase E — Real Make-Fresh: auto-pre-fresh-final backup + WIPE
//   Phase F — Final state report (3 backups + 4 audit docs + count==0)
//
// Without --apply: Phase A runs for real (read-only); Phases B-F print
// "WOULD do X" with concrete numbers. NO writes. NO Storage uploads. NO audit
// docs. Use dry-run to sanity-check counts before committing.
//
// Authorization compliance:
//   - Rule M (data ops via local + admin SDK + pull env)
//   - AV19 (destructive-with-auto-backup-mandatory): both wipes preceded by
//     verified Storage upload (`bucket.file().exists()`)
//   - V40 schemaVersion=2 sentinel encoding for NaN/Infinity preservation
//   - feedback_no_real_action_in_preview_eval: scripts only, no UI clicks
//
// Usage:
//   node scripts/v40-trial-fresh-nakhon.mjs --branch=BR-1777873556815-26df6480
//   node scripts/v40-trial-fresh-nakhon.mjs --branch=BR-1777873556815-26df6480 --apply

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  resolveBackupScope,
  T4_SUBCOLLECTIONS,
  TIER_MAP,
  BACKUP_TIER_T1,
  BACKUP_TIER_T2,
  BACKUP_TIER_T3,
} from '../src/lib/branchBackupCore.js';
import {
  buildBackupFile,
  validateBackupFile,
  jsonReplacerForNonFinite,
  jsonReviverForNonFinite,
} from '../src/lib/branchBackupSchema.js';

// ═══ Constants ═══════════════════════════════════════════════════════════
const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const BATCH_LIMIT = 400;
const T4_BATCH_SIZE = 50;
const TIERS = ['T1', 'T2', 'T3', 'T4'];
const EXEC_BY = 'cli:v40-trial-fresh-nakhon';

// ═══ Args parsing ═════════════════════════════════════════════════════════
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const BRANCH = args.branch;
const APPLY = args.apply === true || args.apply === 'true';

if (!BRANCH) {
  console.error('Usage: node scripts/v40-trial-fresh-nakhon.mjs --branch=<branchId> [--apply]');
  console.error('  --branch  = required, e.g. BR-1777873556815-26df6480');
  console.error('  --apply   = optional, default false → dry-run mode (no writes)');
  process.exit(1);
}

// ═══ Env loading (per Rule M) ═════════════════════════════════════════════
const envFile = existsSync('.env.local.prod')
  ? '.env.local.prod'
  : (existsSync('.env.local') ? '.env.local' : null);

if (!envFile) {
  console.error('FATAL: no .env.local.prod or .env.local found in cwd.');
  console.error('Run: vercel env pull .env.local.prod --environment=production');
  process.exit(1);
}

for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

for (const k of ['FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY']) {
  if (!process.env[k]) {
    console.error(`FATAL: missing ${k} in ${envFile}`);
    process.exit(1);
  }
}

// ═══ Firebase init (V40-prod-fix-1: explicit BUCKET arg) ═══════════════════
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
    storageBucket: BUCKET,
  });
}
const db = getFirestore();
const bucket = getStorage().bucket(BUCKET);

function dataCol(name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}
function randHex(n = 8) { return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n); }
function nowISO() { return new Date().toISOString(); }
function fmtMB(bytes) { return (bytes / 1024 / 1024).toFixed(2); }
function fmtSec(t0) { return ((Date.now() - t0) / 1000).toFixed(1); }

// ═══ Phase header logging ════════════════════════════════════════════════
const HR = '═'.repeat(72);
function phaseHeader(name) {
  const mode = APPLY ? 'APPLY' : 'DRY-RUN';
  console.log(`\n${HR}\n  Phase ${name}  [${mode}]\n${HR}`);
}

// ═══ Helpers ═════════════════════════════════════════════════════════════

/**
 * Build the full backup payload for the branch (T1+T2+T3+T4).
 * Mirrors api/admin/branch-backup-export.js parallel-batched T4 traversal.
 */
async function buildBackupPayload() {
  const scope = resolveBackupScope({ tiers: TIERS });
  const out = {};
  for (const col of scope) {
    if (col === 'be_customers/__per_customer__') {
      const customersSnap = await dataCol('be_customers').get();
      const customerDocs = customersSnap.docs;
      for (let bi = 0; bi < customerDocs.length; bi += T4_BATCH_SIZE) {
        const batch = customerDocs.slice(bi, bi + T4_BATCH_SIZE);
        const batchResults = await Promise.all(batch.flatMap(cust =>
          T4_SUBCOLLECTIONS.map(async sub => {
            const subSnap = await cust.ref.collection(sub).where('branchId', '==', BRANCH).get();
            if (subSnap.empty) return null;
            return {
              key: `be_customers/${cust.id}/${sub}`,
              docs: subSnap.docs.map(d => ({ ...d.data(), id: d.id })),
            };
          })
        ));
        for (const r of batchResults) if (r) out[r.key] = r.docs;
      }
    } else {
      const snap = await dataCol(col).where('branchId', '==', BRANCH).get();
      out[col] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    }
  }
  return out;
}

/**
 * Build + upload a backup file to Storage. Returns the storage path,
 * size, perCollectionCounts, and the file object (for in-memory comparisons).
 */
async function uploadBackup(payload, prefix, isAutoPreFresh = false) {
  const file = buildBackupFile({
    sourceBranchId: BRANCH,
    exportedBy: EXEC_BY,
    scope: { tiers: TIERS, collections: null },
    collections: payload,
    isAutoPreFresh,
  });
  const json = JSON.stringify(file, jsonReplacerForNonFinite);
  const sizeBytes = Buffer.byteLength(json, 'utf8');
  if (sizeBytes > 100 * 1024 * 1024) {
    throw new Error(`FILE_TOO_LARGE: ${sizeBytes} bytes`);
  }
  const ts = Date.now();
  const storagePath = `backups/${BRANCH}/${prefix}-${ts}-${randHex()}.json`;
  await bucket.file(storagePath).save(json, {
    contentType: 'application/json',
    metadata: {
      metadata: {
        branchId: BRANCH,
        sourceBranchId: BRANCH,
        schemaVersion: '2',
        exportedBy: EXEC_BY,
      },
    },
  });
  // Verify upload (AV19 destructive-with-auto-backup gate prerequisite)
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) throw new Error(`UPLOAD_VERIFY_FAILED: ${storagePath}`);
  return { storagePath, sizeBytes, perCollectionCounts: file.meta.perCollectionCounts, file };
}

/**
 * Wipe T1+T2+T3 collections (where branchId == BRANCH) +
 * T4 customer subcollections (where branchId == BRANCH per subcoll doc).
 * Mirrors api/admin/branch-make-fresh.js wipe sequence.
 */
async function executeWipe() {
  const wipeList = [
    ...TIER_MAP[BACKUP_TIER_T1],
    ...TIER_MAP[BACKUP_TIER_T2],
    ...TIER_MAP[BACKUP_TIER_T3],
  ];
  const deletedCounts = {};
  for (const col of wipeList) {
    const snap = await dataCol(col).where('branchId', '==', BRANCH).get();
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
  // T4 — parallel-batched read, sequential delete (V40-prod-fix-2 pattern)
  const customersSnap = await dataCol('be_customers').get();
  const customerDocs = customersSnap.docs;
  let t4Deleted = 0;
  for (let bi = 0; bi < customerDocs.length; bi += T4_BATCH_SIZE) {
    const batch = customerDocs.slice(bi, bi + T4_BATCH_SIZE);
    const subSnaps = await Promise.all(batch.flatMap(cust =>
      T4_SUBCOLLECTIONS.map(sub => cust.ref.collection(sub).where('branchId', '==', BRANCH).get())
    ));
    for (const subSnap of subSnaps) {
      for (let i = 0; i < subSnap.docs.length; i += BATCH_LIMIT) {
        const slice = subSnap.docs.slice(i, i + BATCH_LIMIT);
        const wb = db.batch();
        for (const d of slice) wb.delete(d.ref);
        await wb.commit();
        t4Deleted += slice.length;
      }
    }
  }
  deletedCounts['be_customers/__per_customer__'] = t4Deleted;
  return deletedCounts;
}

/**
 * Count branch-scoped docs across all tiers (read-only).
 */
async function countBranchScoped() {
  const scope = resolveBackupScope({ tiers: TIERS });
  let total = 0;
  const counts = {};
  for (const col of scope) {
    if (col === 'be_customers/__per_customer__') {
      const customersSnap = await dataCol('be_customers').get();
      let t4Total = 0;
      for (let bi = 0; bi < customersSnap.docs.length; bi += T4_BATCH_SIZE) {
        const batch = customersSnap.docs.slice(bi, bi + T4_BATCH_SIZE);
        const subSnaps = await Promise.all(batch.flatMap(cust =>
          T4_SUBCOLLECTIONS.map(async sub => {
            const s = await cust.ref.collection(sub).where('branchId', '==', BRANCH).get();
            return s.size;
          })
        ));
        for (const n of subSnaps) t4Total += n;
      }
      counts['be_customers/__per_customer__'] = t4Total;
      total += t4Total;
    } else {
      const snap = await dataCol(col).where('branchId', '==', BRANCH).get();
      counts[col] = snap.size;
      total += snap.size;
    }
  }
  return { counts, total };
}

/**
 * Restore docs from a parsed backup file. Overwrite mode: preserves docIds
 * via setDoc({merge: false}). Mirrors api/admin/branch-restore.js overwrite branch.
 */
async function executeRestore(file) {
  const result = { perCollection: {} };
  for (const col of Object.keys(file.collections)) {
    const docs = file.collections[col] || [];
    if (col.startsWith('be_customers/')) {
      const parts = col.split('/');
      const customerId = parts[1];
      const sub = parts[2];
      let written = 0;
      for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        const slice = docs.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (const d of slice) {
          const id = String(d.id || d.docId || randHex(12));
          const { id: _omit, ...rest } = d;
          batch.set(
            dataCol('be_customers').doc(customerId).collection(sub).doc(id),
            { ...rest, branchId: BRANCH },
            { merge: false }
          );
        }
        await batch.commit();
        written += slice.length;
      }
      result.perCollection[col] = { written };
    } else {
      let written = 0;
      for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        const slice = docs.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (const d of slice) {
          const id = String(d.id || d.docId);
          const { id: _omit, ...rest } = d;
          batch.set(
            dataCol(col).doc(id),
            { ...rest, branchId: BRANCH },
            { merge: false }
          );
        }
        await batch.commit();
        written += slice.length;
      }
      result.perCollection[col] = { written };
    }
  }
  return result;
}

/**
 * Canonicalize a backup payload for byte-perfect comparison:
 *   1. Convert per-collection arrays → keyed objects (by docId) so doc order
 *      doesn't affect serialization.
 *   2. Recursively sort object keys (arrays preserve order — they're meaningful).
 *   3. JSON.stringify with jsonReplacerForNonFinite (NaN/Infinity sentinel).
 */
function arraysToKeyedObjects(payload) {
  const out = {};
  for (const [col, docs] of Object.entries(payload)) {
    out[col] = {};
    for (const d of docs) {
      const id = String(d.id || d.docId || '');
      if (!id) throw new Error(`MISSING_ID in ${col}`);
      out[col][id] = d;
    }
  }
  return out;
}

function deepSortKeys(value) {
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const k of Object.keys(value).sort()) sorted[k] = deepSortKeys(value[k]);
    return sorted;
  }
  return value;
}

function canonicalize(payload) {
  const keyed = arraysToKeyedObjects(payload);
  return JSON.stringify(deepSortKeys(keyed), jsonReplacerForNonFinite);
}

/**
 * Identify first N differing collections and doc IDs between two payloads
 * (for halt-on-mismatch diff log).
 */
function diffPayloads(a, b, maxDiffsPerCol = 5) {
  const ka = arraysToKeyedObjects(a);
  const kb = arraysToKeyedObjects(b);
  const allCols = new Set([...Object.keys(ka), ...Object.keys(kb)]);
  const diffs = [];
  for (const col of allCols) {
    const aDocs = ka[col] || {};
    const bDocs = kb[col] || {};
    const colDiffs = [];
    const allIds = new Set([...Object.keys(aDocs), ...Object.keys(bDocs)]);
    for (const id of allIds) {
      const aDoc = aDocs[id];
      const bDoc = bDocs[id];
      const aJson = aDoc ? JSON.stringify(deepSortKeys(aDoc), jsonReplacerForNonFinite) : null;
      const bJson = bDoc ? JSON.stringify(deepSortKeys(bDoc), jsonReplacerForNonFinite) : null;
      if (aJson !== bJson) {
        colDiffs.push({ id, inA: aDoc !== undefined, inB: bDoc !== undefined });
        if (colDiffs.length >= maxDiffsPerCol) break;
      }
    }
    if (colDiffs.length > 0) diffs.push({ collection: col, sampleDiffs: colDiffs, aCount: Object.keys(aDocs).length, bCount: Object.keys(bDocs).length });
  }
  return diffs;
}

// ═══ Phase A — Pre-flight ═════════════════════════════════════════════════
async function phaseA_preflight() {
  phaseHeader('A — Pre-flight (read-only)');
  const t0 = Date.now();
  const branchDoc = await dataCol('be_branches').doc(BRANCH).get();
  if (!branchDoc.exists) {
    console.error(`FATAL: branch ${BRANCH} not found in be_branches`);
    process.exit(2);
  }
  const branchName = branchDoc.data()?.name || '(no name)';
  console.log(`Branch: ${BRANCH}`);
  console.log(`Name:   "${branchName}"`);
  console.log(`Mode:   ${APPLY ? 'APPLY (will write)' : 'DRY-RUN (no writes)'}`);

  const { counts, total } = await countBranchScoped();
  console.log(`\nTotal branch-scoped docs: ${total} (counted in ${fmtSec(t0)}s)`);
  console.log('Per-collection counts (non-zero only):');
  const nonZero = Object.entries(counts).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of nonZero) console.log(`  ${String(v).padStart(6)}  ${k}`);
  if (nonZero.length === 0) console.log('  (none)');

  const [files] = await bucket.getFiles({ prefix: `backups/${BRANCH}/` });
  console.log(`\nExisting Storage backups for branch: ${files.length} files`);
  if (files.length > 0) {
    for (const f of files.slice(-5)) console.log(`  ${f.name}`);
    if (files.length > 5) console.log(`  ... + ${files.length - 5} older`);
  }

  return { branchName, counts, total, existingBackups: files.length };
}

// ═══ Phase B — Manual paranoia backup ═════════════════════════════════════
async function phaseB_paranoia(preflightTotal) {
  phaseHeader('B — Manual paranoia backup');
  if (!APPLY) {
    console.log(`WOULD: build backup payload (~${preflightTotal} docs)`);
    console.log(`WOULD: upload to backups/${BRANCH}/manual-paranoia-{ts}-{rand}.json`);
    console.log(`WOULD: emit audit doc → be_admin_audit (action=branch-backup, phase=paranoia)`);
    return null;
  }
  const t0 = Date.now();
  console.log('Building backup payload...');
  const payload = await buildBackupPayload();
  console.log(`Built in ${fmtSec(t0)}s`);
  console.log('Uploading to Storage...');
  const t1 = Date.now();
  const { storagePath, sizeBytes, perCollectionCounts, file } = await uploadBackup(payload, 'manual-paranoia', false);
  console.log(`✓ Uploaded ${storagePath} (${fmtMB(sizeBytes)} MB) in ${fmtSec(t1)}s`);

  const auditId = `branch-backup-${Date.now()}-${randHex()}`;
  await dataCol('be_admin_audit').doc(auditId).set({
    action: 'branch-backup',
    branchId: BRANCH,
    scope: { tiers: TIERS, collections: null },
    perCollectionCounts,
    sizeBytes,
    storagePath,
    isAutoPreFresh: false,
    phase: 'paranoia',
    executedBy: EXEC_BY,
    exportedAt: nowISO(),
  });
  console.log(`✓ Audit: be_admin_audit/${auditId}`);
  return { storagePath, sizeBytes, perCollectionCounts, auditId, payload };
}

// ═══ Phase C — Trial Make-Fresh + Restore + Verify ════════════════════════
async function phaseC_trial(preflightTotal) {
  phaseHeader('C — Trial Make-Fresh + Restore + Verify');
  if (!APPLY) {
    console.log(`C1 WOULD: build + upload auto-pre-fresh-trial backup (~${preflightTotal} docs)`);
    console.log(`C1 WOULD: wipe ~${preflightTotal} branch-scoped docs (T1+T2+T3+T4)`);
    console.log(`C2 WOULD: re-count → assert 0`);
    console.log(`C3 WOULD: download + JSON.parse with jsonReviverForNonFinite`);
    console.log(`C3 WOULD: writeBatch restore ~${preflightTotal} docs (overwrite mode)`);
    console.log(`C4 WOULD: bit-perfect 2-way verifier (trialText vs postRestoreText)`);
    console.log(`C4 WOULD: halt with diff log on any byte mismatch`);
    return null;
  }

  // C1a: Build + upload auto-pre-fresh-trial
  console.log('\n[C1a] Building auto-pre-fresh-trial backup...');
  const t0 = Date.now();
  const trialPayload = await buildBackupPayload();
  console.log(`     Built in ${fmtSec(t0)}s`);
  console.log('[C1a] Uploading...');
  const t1 = Date.now();
  const trialBackup = await uploadBackup(trialPayload, 'auto-pre-fresh-trial', true);
  console.log(`✓    Uploaded ${trialBackup.storagePath} (${fmtMB(trialBackup.sizeBytes)} MB) in ${fmtSec(t1)}s`);

  // C1b: Wipe
  console.log('\n[C1b] Wiping...');
  const t2 = Date.now();
  const trialDeleted = await executeWipe();
  const trialDeletedTotal = Object.values(trialDeleted).reduce((a, b) => a + b, 0);
  console.log(`✓    Wiped ${trialDeletedTotal} docs in ${fmtSec(t2)}s`);

  const trialWipeAuditId = `branch-make-fresh-${Date.now()}-${randHex()}`;
  await dataCol('be_admin_audit').doc(trialWipeAuditId).set({
    action: 'branch-make-fresh',
    branchId: BRANCH,
    autoBackupRef: trialBackup.storagePath,
    deletedCounts: trialDeleted,
    isTrial: true,
    executedBy: EXEC_BY,
    executedAt: nowISO(),
  });
  console.log(`✓    Audit (trial wipe): be_admin_audit/${trialWipeAuditId}`);

  // C2: Verify wipe
  console.log('\n[C2]  Verifying wipe...');
  const postWipe = await countBranchScoped();
  if (postWipe.total !== 0) {
    console.error(`FATAL [C2]: post-wipe count is ${postWipe.total} (expected 0)`);
    console.error('Per-collection:', postWipe.counts);
    console.error(`Recovery: paranoia backup at <Phase B output>; trial backup at ${trialBackup.storagePath}`);
    process.exit(3);
  }
  console.log(`✓    Wipe verified: 0 branch-scoped docs across T1+T2+T3+T4`);

  // C3: Restore from trial backup
  console.log('\n[C3]  Downloading trial backup...');
  const t3 = Date.now();
  const [data] = await bucket.file(trialBackup.storagePath).download();
  const trialJson = data.toString('utf8');
  const trialFile = JSON.parse(trialJson, jsonReviverForNonFinite);
  validateBackupFile(trialFile);
  if (trialFile.meta.sourceBranchId !== BRANCH) {
    throw new Error(`SOURCE_BRANCH_MISMATCH: file=${trialFile.meta.sourceBranchId} expected=${BRANCH}`);
  }
  console.log(`     Downloaded + parsed in ${fmtSec(t3)}s`);

  console.log('[C3]  Restoring (overwrite mode, NaN-reviver-aware)...');
  const t4 = Date.now();
  const trialRestore = await executeRestore(trialFile);
  const trialRestoreTotal = Object.values(trialRestore.perCollection).reduce((a, b) => a + b.written, 0);
  console.log(`✓    Restored ${trialRestoreTotal} docs in ${fmtSec(t4)}s`);

  const trialRestoreAuditId = `branch-restore-overwrite-${Date.now()}-${randHex()}`;
  await dataCol('be_admin_audit').doc(trialRestoreAuditId).set({
    action: 'branch-restore-overwrite',
    sourceStoragePath: trialBackup.storagePath,
    sourceBranchId: BRANCH,
    targetBranchId: BRANCH,
    perCollection: trialRestore.perCollection,
    isTrial: true,
    executedBy: EXEC_BY,
    executedAt: nowISO(),
  });
  console.log(`✓    Audit (trial restore): be_admin_audit/${trialRestoreAuditId}`);

  // C4: Bit-perfect 2-way verify (trialPayload vs post-restore payload)
  console.log('\n[C4]  Bit-perfect 2-way verifier...');
  const t5 = Date.now();
  console.log('      Re-exporting post-restore current state...');
  const currentPayload = await buildBackupPayload();
  console.log(`      Re-exported in ${fmtSec(t5)}s`);

  const t6 = Date.now();
  const trialText = canonicalize(trialPayload);
  const currentText = canonicalize(currentPayload);
  console.log(`      Canonicalized in ${fmtSec(t6)}s — trialText: ${(trialText.length/1024/1024).toFixed(2)} MB, currentText: ${(currentText.length/1024/1024).toFixed(2)} MB`);

  if (trialText === currentText) {
    console.log(`✓    BIT-PERFECT MATCH: trial backup == post-restore current state`);
    return { trialBackup, trialDeleted, trialRestore, verified: true };
  }

  console.error(`\n✗ [C4] BIT-PERFECT MISMATCH detected`);
  const diffs = diffPayloads(trialPayload, currentPayload);
  console.error(`      ${diffs.length} collection(s) differ:`);
  for (const d of diffs) {
    console.error(`      - ${d.collection}: trial=${d.aCount}, current=${d.bCount}`);
    for (const sd of d.sampleDiffs) {
      console.error(`          docId=${sd.id}  inTrial=${sd.inA}  inCurrent=${sd.inB}`);
    }
  }
  console.error(`\nHALTING — real wipe NOT executed.`);
  console.error(`Recovery paths:`);
  console.error(`  paranoia backup: <see Phase B output above>`);
  console.error(`  trial backup:    ${trialBackup.storagePath}`);
  console.error(`  current state:   live Firestore reflects post-restore (which is the trial backup)`);
  process.exit(4);
}

// ═══ Phase E — Real Make-Fresh ═════════════════════════════════════════════
async function phaseE_realFresh(preflightTotal) {
  phaseHeader('E — Real Make-Fresh (final wipe)');
  if (!APPLY) {
    console.log(`WOULD: build + upload auto-pre-fresh-final backup (~${preflightTotal} docs)`);
    console.log(`WOULD: wipe ~${preflightTotal} branch-scoped docs`);
    console.log(`WOULD: emit audit doc → action=branch-make-fresh, isTrial=false, isFinal=true`);
    return null;
  }

  console.log('\n[E1] Building auto-pre-fresh-final backup...');
  const t0 = Date.now();
  const finalPayload = await buildBackupPayload();
  console.log(`     Built in ${fmtSec(t0)}s`);
  console.log('[E1] Uploading...');
  const t1 = Date.now();
  const finalBackup = await uploadBackup(finalPayload, 'auto-pre-fresh-final', true);
  console.log(`✓    Uploaded ${finalBackup.storagePath} (${fmtMB(finalBackup.sizeBytes)} MB) in ${fmtSec(t1)}s`);

  console.log('\n[E2] Wiping (REAL — final state)...');
  const t2 = Date.now();
  const finalDeleted = await executeWipe();
  const finalDeletedTotal = Object.values(finalDeleted).reduce((a, b) => a + b, 0);
  console.log(`✓    Wiped ${finalDeletedTotal} docs in ${fmtSec(t2)}s`);

  const finalAuditId = `branch-make-fresh-${Date.now()}-${randHex()}`;
  await dataCol('be_admin_audit').doc(finalAuditId).set({
    action: 'branch-make-fresh',
    branchId: BRANCH,
    autoBackupRef: finalBackup.storagePath,
    deletedCounts: finalDeleted,
    isTrial: false,
    isFinal: true,
    executedBy: EXEC_BY,
    executedAt: nowISO(),
  });
  console.log(`✓    Audit (final wipe): be_admin_audit/${finalAuditId}`);

  return { finalBackup, finalDeleted, finalAuditId };
}

// ═══ Phase F — Final state report ═════════════════════════════════════════
async function phaseF_report(preflight, paranoia, trial, final) {
  phaseHeader('F — Final state report');
  if (!APPLY) {
    console.log('WOULD: re-count → assert 0');
    console.log('WOULD: list 3 backup paths + 4 audit doc IDs');
    console.log('WOULD: print recovery instructions');
    return;
  }

  console.log('\n[F1] Re-counting branch-scoped docs (sanity check)...');
  const finalCounts = await countBranchScoped();
  if (finalCounts.total !== 0) {
    console.error(`✗   FATAL: final count is ${finalCounts.total} (expected 0)`);
    console.error('Per-collection:', finalCounts.counts);
    process.exit(5);
  }
  console.log(`✓    Final count: 0 branch-scoped docs ✓ FRESH`);

  console.log('\n[F2] Backup files in Storage:');
  console.log(`     1. ${paranoia.storagePath}  (${fmtMB(paranoia.sizeBytes)} MB)  paranoia`);
  console.log(`     2. ${trial.trialBackup.storagePath}  (${fmtMB(trial.trialBackup.sizeBytes)} MB)  auto-pre-fresh-trial`);
  console.log(`     3. ${final.finalBackup.storagePath}  (${fmtMB(final.finalBackup.sizeBytes)} MB)  auto-pre-fresh-final`);

  console.log('\n[F3] Audit doc summary:');
  console.log(`     paranoia-backup audit IDs printed during phases B/C/E above`);

  console.log('\n[F4] Branch entity status:');
  const branchDoc = await dataCol('be_branches').doc(BRANCH).get();
  if (branchDoc.exists) {
    console.log(`✓    be_branches/${BRANCH} preserved (name="${branchDoc.data()?.name}")`);
  } else {
    console.error(`✗    be_branches/${BRANCH} unexpectedly missing!`);
  }

  console.log('\n[F5] Recovery instructions:');
  console.log(`     Any of the 3 backup files above can be restored via:`);
  console.log(`       /api/admin/branch-restore  body: { mode:'overwrite', sourceStoragePath:'<path>', targetBranchId:'${BRANCH}' }`);
  console.log(`     OR via the BranchBackupTab → BackupsList → Restore→ button in the UI.`);
  console.log(`     Recovery takes ~5 min for any of the 3 backups.`);

  console.log(`\n${HR}`);
  console.log('  ✓ DONE — นครราชสีมา is fresh + 3 backups in Storage as insurance');
  console.log(HR);
}

// ═══ Main ═════════════════════════════════════════════════════════════════
async function main() {
  const t0 = Date.now();
  console.log(`${HR}`);
  console.log(`  V40 Trial-Fresh Orchestration`);
  console.log(`  Branch: ${BRANCH}`);
  console.log(`  Mode:   ${APPLY ? 'APPLY (real writes)' : 'DRY-RUN (no writes)'}`);
  console.log(`  Env:    ${envFile}`);
  console.log(`  Started: ${nowISO()}`);
  console.log(HR);

  const preflight = await phaseA_preflight();
  const paranoia = await phaseB_paranoia(preflight.total);
  const trial = await phaseC_trial(preflight.total);
  const final = await phaseE_realFresh(preflight.total);
  await phaseF_report(preflight, paranoia, trial, final);

  console.log(`\nTotal elapsed: ${fmtSec(t0)}s`);
  if (!APPLY) {
    console.log(`\n${HR}`);
    console.log('  DRY-RUN COMPLETE.');
    console.log('  Re-run with --apply to execute for real.');
    console.log(HR);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('\n✗ FATAL:', e);
    console.error(e.stack);
    process.exit(99);
  });
}
