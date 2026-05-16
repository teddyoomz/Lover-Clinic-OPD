#!/usr/bin/env node
// V81 Task 22 — Staging Vercel cron verification.
// Triggers cron via curl-equivalent fetch + verifies Storage folder appears
// + audit doc emitted. Used post-deploy to confirm cron handler works end-to-end.
//
// USAGE:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/v81-stage-cron-verify.mjs --url=https://<preview-or-prod>.vercel.app
//
// Returns: 0 on success (backup folder + audit doc both verified), 1 on any failure.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

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
  const opts = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--url=')) opts.url = a.slice(6);
  }
  if (!opts.url) {
    throw new Error('Need --url=https://<vercel-url>');
  }
  // Normalize: strip trailing slash
  opts.url = opts.url.replace(/\/$/, '');
  return opts;
}

async function main() {
  const opts = parseArgs();
  const env = loadEnv();
  if (!env.CRON_SECRET) {
    throw new Error('CRON_SECRET env var missing');
  }

  const cronUrl = `${opts.url}/api/cron/whole-system-backup-daily`;
  console.log(`Phase 1: Trigger cron at ${cronUrl}...`);
  const start = Date.now();
  const res = await fetch(cronUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  const elapsedMs = Date.now() - start;
  const json = await res.json();
  if (!res.ok) {
    console.error(`✗ Cron fire failed: HTTP ${res.status} ${JSON.stringify(json)}`);
    process.exit(1);
  }
  console.log(`  Cron returned ${res.status} in ${Math.round(elapsedMs / 1000)}s`);
  console.log(`  Response: ${JSON.stringify(json, null, 2)}`);

  const { name, manifestHash } = json;
  if (!name || !manifestHash) {
    console.error('✗ Response missing name or manifestHash');
    process.exit(1);
  }

  console.log(`Phase 2: Verify backup folder + manifest via admin SDK...`);
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
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
  const storage = getStorage().bucket();
  const db = getFirestore();

  const [manifestExists] = await storage.file(`backups/whole-system/${name}/manifest.json`).exists();
  if (!manifestExists) {
    console.error(`✗ Backup folder manifest.json NOT FOUND in Storage: backups/whole-system/${name}/`);
    process.exit(1);
  }
  console.log(`  ✓ manifest.json present in Storage`);

  // Verify hash matches what cron returned
  const [mfBuf] = await storage.file(`backups/whole-system/${name}/manifest.json`).download();
  const mf = JSON.parse(mfBuf.toString('utf8'));
  if (mf.manifestHash !== manifestHash) {
    console.error(`✗ Hash mismatch: cron returned ${manifestHash}, Storage has ${mf.manifestHash}`);
    process.exit(1);
  }
  console.log(`  ✓ manifestHash matches cron response`);

  console.log(`Phase 3: Verify audit doc emitted...`);
  const auditQuery = await db
    .collection(`${PREFIX}/be_admin_audit`)
    .where('op', '==', 'whole-system-backup')
    .where('name', '==', name)
    .limit(1)
    .get();
  if (auditQuery.empty) {
    console.error(`✗ Audit doc NOT FOUND for backup ${name}`);
    process.exit(1);
  }
  console.log(`  ✓ Audit doc present: ${auditQuery.docs[0].id}`);

  console.log(`✓ STAGE CRON VERIFY PASS — name=${name}, hash=${manifestHash.slice(0, 32)}..., elapsed=${Math.round(elapsedMs / 1000)}s`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
