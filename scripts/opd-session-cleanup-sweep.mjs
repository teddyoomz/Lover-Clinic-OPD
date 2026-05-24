#!/usr/bin/env node
/**
 * Rule M CLI mirror — opd_sessions auto-cleanup sweep.
 * Shares sweepOpdSessionCleanup with api/cron/opd-session-cleanup-sweep.js.
 *
 * Usage:
 *   node scripts/opd-session-cleanup-sweep.mjs           # dry-run
 *   node scripts/opd-session-cleanup-sweep.mjs --apply   # commit
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sweepOpdSessionCleanup } from '../api/cron/opd-session-cleanup-sweep.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local.prod');
  const content = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = loadEnv();
  if (!getApps().length) {
    const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  const db = getFirestore();
  const mode = apply ? '🔥 APPLY' : '🔍 DRY-RUN';
  console.log(`\n=== ${mode} — opd_sessions cleanup sweep (timeout=2h) ===\n`);
  const result = await sweepOpdSessionCleanup({ db, now: Date.now(), apply });
  console.log(JSON.stringify(result, null, 2));
  console.log('');
  if (!apply) console.log(`Re-run with --apply to commit.\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
