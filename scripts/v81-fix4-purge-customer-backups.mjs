#!/usr/bin/env node
// scripts/v81-fix4-purge-customer-backups.mjs
//
// V81-fix4 Feature D (2026-05-17 EOD+2) — Mass-purge deprecated per-customer
// backup files from Firebase Storage.
//
// Per user directive: "ลบข้อมูล backup ลูกค้าทั้งหมดที่เป็นแบบแยกคนที่มีตอนนี้
// ทิ้งไปให้หมด รก". V81 whole-system backup is the canonical replacement
// (includes ALL be_customers + subcollections + Storage in ONE single file).
//
// Scope (DELETE — all under these prefixes):
//   backups/customers/                  (V74 per-customer backup files)
//   backups/whole-fleet-customers/      (V77b/c whole-fleet customer files)
//
// Preserves (NOT touched):
//   backups/whole-system/              (V81 — current canonical)
//   backups/central-stock/             (V15)
//   backups/BR-<id>/                   (V40 branch backups)
//
// Rule M discipline: two-phase (dry-run default; --apply commits writes) +
// audit doc + crypto-secure random id + canonical artifacts path.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomBytes } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const APP_ID = 'loverclinic-opd-4c39b';

const PURGE_PREFIXES = [
  'backups/customers/',
  'backups/whole-fleet-customers/',
];

function loadEnv() {
  // Prefer .env.local.prod (Vercel-pulled prod env per Rule M)
  for (const name of ['.env.local.prod', '.env.local', '.env']) {
    try {
      const path = resolve(REPO_ROOT, name);
      const txt = readFileSync(path, 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (!m) continue;
        const [, k, v] = m;
        if (!process.env[k]) process.env[k] = v.replace(/^"|"$/g, '');
      }
      console.log(`[env] loaded ${name}`);
      return;
    } catch { /* try next */ }
  }
  console.warn('[env] no .env.local.prod / .env.local / .env — will rely on process env');
}

function initAdmin() {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error('FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY required');
  }
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail,
      privateKey: rawKey.split('\\n').join('\n'),
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

async function listMatchingFiles(bucket) {
  const all = [];
  for (const prefix of PURGE_PREFIXES) {
    const [files] = await bucket.getFiles({ prefix });
    for (const f of files) {
      all.push({
        path: f.name,
        sizeBytes: parseInt(f.metadata?.size || '0', 10),
        timeCreated: f.metadata?.timeCreated || '',
        ref: f,
      });
    }
  }
  return all;
}

function summarize(files) {
  const byPrefix = new Map();
  let totalBytes = 0;
  for (const f of files) {
    const prefix = PURGE_PREFIXES.find(p => f.path.startsWith(p)) || '(other)';
    const entry = byPrefix.get(prefix) || { count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes += f.sizeBytes;
    byPrefix.set(prefix, entry);
    totalBytes += f.sizeBytes;
  }
  return { byPrefix, totalBytes };
}

async function main() {
  const args = process.argv.slice(2);
  const APPLY = args.includes('--apply');
  loadEnv();
  initAdmin();
  const bucket = getStorage().bucket();
  const db = getFirestore();

  console.log('\n=== V81-fix4 Feature D — Purge per-customer backups ===');
  console.log(`Mode: ${APPLY ? '🔥 APPLY (writes will commit)' : '🔍 DRY-RUN (no writes — pass --apply to commit)'}`);
  console.log(`Scope: ${PURGE_PREFIXES.join(', ')}\n`);

  console.log('Listing files...');
  const files = await listMatchingFiles(bucket);
  const { byPrefix, totalBytes } = summarize(files);

  console.log(`\nFound ${files.length} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB total):`);
  for (const [prefix, entry] of byPrefix.entries()) {
    console.log(`  ${prefix}  →  ${entry.count} files (${(entry.bytes / 1024 / 1024).toFixed(1)} MB)`);
  }

  if (files.length === 0) {
    console.log('\n✓ Nothing to purge. Exiting clean.');
    return;
  }

  if (!APPLY) {
    console.log('\nDRY-RUN complete. Re-run with --apply to delete.');
    return;
  }

  console.log('\n🔥 APPLY mode — deleting...');
  let deleted = 0;
  const failed = [];
  for (const f of files) {
    try {
      await f.ref.delete();
      deleted += 1;
      if (deleted % 50 === 0) console.log(`  ${deleted}/${files.length} deleted...`);
    } catch (e) {
      failed.push({ path: f.path, error: e.message });
    }
  }
  console.log(`\n✓ Deleted ${deleted}/${files.length} files`);
  if (failed.length) {
    console.log(`⚠ Failed: ${failed.length}`);
    for (const f of failed.slice(0, 10)) console.log(`  ${f.path} — ${f.error}`);
  }

  // Audit doc
  const auditId = `v81-fix4-purge-customer-backups-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`artifacts/${APP_ID}/public/data/be_admin_audit/${auditId}`).set({
    op: 'v81-fix4-purge-customer-backups',
    scope: PURGE_PREFIXES,
    scannedCount: files.length,
    totalBytesScanned: totalBytes,
    deletedCount: deleted,
    failedCount: failed.length,
    failedSample: failed.slice(0, 20),
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`\n📝 Audit doc: be_admin_audit/${auditId}`);
}

// Invocation guard per Rule M — only run main() when invoked directly,
// not when imported by a test file.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('\n❌ FATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

export { listMatchingFiles, summarize, PURGE_PREFIXES };
