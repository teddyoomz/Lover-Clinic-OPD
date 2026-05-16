#!/usr/bin/env node
// scripts/diag-customer-backup-integrity.mjs — Rule R diag script.
// Read-only end-to-end integrity check of a backup file (Storage or local).
// No writes; no audit doc. Useful for ad-hoc spot-checks.
//
// Usage:
//   node scripts/diag-customer-backup-integrity.mjs --backup-ref backups/customers/.../backup.json
//   node scripts/diag-customer-backup-integrity.mjs --local-file ./downloaded.json

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateCustomerBackupFile, computeStorageManifestHash } from '../src/lib/customerBackupSchema.js';
import { computeBodyHash, jsonReviverForNonFinite } from '../src/lib/branchBackupSchema.js';

function loadEnvFile(path = '.env.local.prod') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--backup-ref') out.backupRef = args[++i];
    else if (args[i] === '--local-file') out.localFile = args[++i];
  }
  return out;
}

function initApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
    storageBucket: BUCKET,
  });
}

async function main() {
  const args = parseArgs();
  if (!args.backupRef && !args.localFile) {
    console.error('Usage: --backup-ref <Storage path> OR --local-file <local path>');
    process.exit(1);
  }
  let bucket = null;
  if (args.backupRef) bucket = getStorage(initApp()).bucket(BUCKET);

  let bytes;
  let backupPrefix = null;
  if (args.localFile) {
    if (!existsSync(args.localFile)) { console.error(`Local file not found: ${args.localFile}`); process.exit(1); }
    bytes = readFileSync(args.localFile);
  } else {
    const [exists] = await bucket.file(args.backupRef).exists();
    if (!exists) { console.error(`Backup not found: ${args.backupRef}`); process.exit(1); }
    [bytes] = await bucket.file(args.backupRef).download();
    backupPrefix = args.backupRef.replace(/\/backup\.json$/, '');
  }

  let file;
  try {
    file = JSON.parse(bytes.toString('utf8'), jsonReviverForNonFinite);
  } catch (e) {
    console.error(`JSON parse failed: ${e.message}`);
    process.exit(1);
  }

  console.log('\n=== Integrity Check ===\n');

  // Schema
  try {
    validateCustomerBackupFile(file);
    console.log('✓ Schema valid');
  } catch (e) {
    console.error(`✗ Schema invalid: ${e.message}`);
    process.exit(1);
  }

  // Meta
  console.log(`  customerId: ${file.meta.customerId}`);
  console.log(`  customerHN: ${file.meta.customerHN}`);
  console.log(`  customerName: ${file.meta.customerName}`);
  console.log(`  exportedAt: ${file.meta.exportedAt}`);
  console.log(`  userNote: ${file.meta.userNote || '(empty)'}`);
  console.log(`  bodyHash:            ${file.meta.bodyHash}`);
  console.log(`  storageManifestHash: ${file.meta.storageManifestHash}`);
  console.log(`  storageObjectCount: ${file.meta.storageObjectCount}`);
  console.log(`  cascade docs: ${Object.values(file.meta.perCollectionCounts).reduce((a, b) => a + b, 0)}`);
  console.log(`  subcoll docs: ${Object.values(file.meta.subcollectionCounts).reduce((a, b) => a + b, 0)}`);
  console.log(`  chat: ${file.meta.chatConversationCount}`);

  // bodyHash recompute
  const hashedBody = { ...(file.collections || {}) };
  for (const [k, v] of Object.entries(file.subcollections || {})) hashedBody[`__sub__${k}`] = Array.isArray(v) ? v : [];
  hashedBody.__chat__ = Array.isArray(file.chatConversations) ? file.chatConversations : [];
  const recomputedBodyHash = computeBodyHash(hashedBody);
  if (recomputedBodyHash === file.meta.bodyHash) {
    console.log('\n✓ bodyHash recompute MATCHES');
  } else {
    console.error('\n✗ bodyHash MISMATCH');
    console.error(`  expected: ${file.meta.bodyHash}`);
    console.error(`  actual:   ${recomputedBodyHash}`);
    process.exit(1);
  }

  // storageManifestHash
  const manifest = file.meta.storageManifest || [];
  const recomputedManifestHash = computeStorageManifestHash(manifest);
  if (recomputedManifestHash === file.meta.storageManifestHash) {
    console.log('✓ storageManifestHash recompute MATCHES');
  } else {
    console.error('✗ storageManifestHash MISMATCH');
    process.exit(1);
  }

  // Per-Storage-object SHA-256 (only when from Storage)
  if (backupPrefix && bucket) {
    let objErrors = 0;
    for (const entry of manifest) {
      const objPath = `${backupPrefix}/storage/${entry.path}`;
      try {
        const [objExists] = await bucket.file(objPath).exists();
        if (!objExists) { console.error(`✗ Missing storage object: ${entry.path}`); objErrors++; continue; }
        const [buf] = await bucket.file(objPath).download();
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        if (sha256 !== entry.sha256) { console.error(`✗ SHA-256 mismatch: ${entry.path}`); objErrors++; }
      } catch (e) {
        console.error(`✗ ${entry.path} — ${e.message}`); objErrors++;
      }
    }
    if (objErrors === 0) console.log(`✓ All ${manifest.length} storage objects SHA-256 verified`);
    else { console.error(`✗ ${objErrors} storage object errors`); process.exit(1); }
  } else if (manifest.length > 0) {
    console.log(`(skipped per-object SHA-256 — --local-file mode; ${manifest.length} entries in manifest)`);
  }

  console.log('\n=== Integrity OK ===');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
