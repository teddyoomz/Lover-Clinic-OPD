#!/usr/bin/env node
// scripts/whole-system-restore.mjs
// V81 Task 17 — Rule M canonical CLI restore. Supports:
//   1. Restore from Firebase Storage path (--backup-ref=NAME)
//   2. Verify-only mode (--verify-hash-only) against local manifest file
//   3. Cross-Vercel scenario (--local-manifest=PATH) — for verifying manifest after
//      drag-drop into new Firebase Storage (full restore on new env requires
//      setting .env.local.prod to the new Firebase project credentials first).
//
// SAFETY: dry-run by default; --apply commits writes.
//
// USAGE:
//   node scripts/whole-system-restore.mjs --backup-ref=auto-20260516-0300 --mode=fresh --apply
//   node scripts/whole-system-restore.mjs --backup-ref=manual-20260516-1430 --mode=replace --apply --password-reset-emails
//   node scripts/whole-system-restore.mjs --local-manifest=./extracted-backup/manifest.json --verify-hash-only
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  const envPath = path.resolve('.env.local.prod');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local.prod missing — run `vercel env pull .env.local.prod --environment=production` first');
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function parseArgs() {
  const opts = { mode: 'fresh', apply: false, passwordResetEmails: false };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--backup-ref=')) opts.backupRef = a.slice(13);
    else if (a.startsWith('--mode=')) opts.mode = a.slice(7);
    else if (a === '--apply') opts.apply = true;
    else if (a === '--password-reset-emails') opts.passwordResetEmails = true;
    else if (a.startsWith('--local-manifest=')) opts.localManifest = a.slice(17);
    else if (a === '--verify-hash-only') opts.verifyHashOnly = true;
  }
  if (!opts.backupRef && !opts.localManifest) {
    throw new Error('Need --backup-ref=NAME or --local-manifest=PATH');
  }
  if (!['fresh', 'replace'].includes(opts.mode)) {
    throw new Error(`Invalid --mode: ${opts.mode}. Must be fresh|replace.`);
  }
  return opts;
}

async function verifyLocalManifest(localPath) {
  const { validateWholeSystemManifest, computeWholeSystemManifestHash } = await import('../src/lib/wholeSystemBackupCore.js');
  const buf = fs.readFileSync(localPath, 'utf8');
  const manifest = JSON.parse(buf);
  const v = validateWholeSystemManifest(manifest);
  console.log('Validate result:', v);
  console.log('Recomputed hash:', computeWholeSystemManifestHash(manifest));
  console.log('Stored hash:    ', manifest.manifestHash);
  if (v.valid) console.log('✓ MANIFEST HASH VALID');
  else console.error('✗ INVALID:', v.reason);
  return v;
}

async function main() {
  const opts = parseArgs();

  // Verify-only mode (no env, no admin SDK)
  if (opts.verifyHashOnly && opts.localManifest) {
    return await verifyLocalManifest(opts.localManifest);
  }

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

  if (!opts.apply) {
    console.log('DRY-RUN — no writes. Re-run with --apply to commit.');
    console.log('Would restore:', opts.backupRef || opts.localManifest);
    console.log('Mode:', opts.mode);
    console.log('Password-reset emails:', opts.passwordResetEmails);
    return;
  }

  const { runWholeSystemRestore } = await import('../api/admin/_lib/wholeSystemRestoreExecutor.js');
  const callerUid = env.CLI_ADMIN_UID || 'cli-no-uid';
  console.log(`Starting restore (mode=${opts.mode}, backup-ref=${opts.backupRef})...`);
  const result = await runWholeSystemRestore({
    db: getFirestore(),
    storage: getStorage().bucket(),
    auth: getAuth(),
    backupRef: opts.backupRef,
    mode: opts.mode,
    callerUid,
    sendPasswordResetEmails: opts.passwordResetEmails,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
