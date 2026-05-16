#!/usr/bin/env node
// scripts/whole-system-backup-export.mjs
// V81 Task 16 — Rule M canonical CLI: local + admin SDK + pull env.
// Reuses api/admin/_lib/wholeSystemBackupExecutor.js for parity with Vercel endpoints.
//
// USAGE:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/whole-system-backup-export.mjs                     # default type=manual
//   node scripts/whole-system-backup-export.mjs --type=auto         # mimic cron (incl. cleanup)
//   node scripts/whole-system-backup-export.mjs --type=pre-restore  # explicit pre-restore name
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
  const opts = { type: 'manual' };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--type=')) opts.type = a.slice(7);
  }
  if (!['auto', 'manual', 'pre-restore'].includes(opts.type)) {
    throw new Error(`Invalid --type: ${opts.type}. Must be auto|manual|pre-restore.`);
  }
  return opts;
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
  const { runWholeSystemBackup } = await import('../api/admin/_lib/wholeSystemBackupExecutor.js');
  console.log(`Starting whole-system backup (type=${opts.type})...`);
  const result = await runWholeSystemBackup({
    db: getFirestore(),
    storage: getStorage().bucket(),
    auth: getAuth(),
    type: opts.type,
    createdBy: `cli-${process.env.USER || process.env.USERNAME || 'unknown'}`,
    runCleanup: opts.type === 'auto', // only auto-type triggers cleanup (per spec §5.1)
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
