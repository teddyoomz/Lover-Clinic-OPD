#!/usr/bin/env node
/**
 * Rule M CLI mirror — chat_history retention sweep.
 * Same logic as api/cron/chat-history-retention-sweep.js (Rule of 3 via
 * src/lib/chatHistoryRetentionCore.js + shared sweepChatHistoryRetention).
 *
 * Usage:
 *   node scripts/chat-history-retention-sweep.mjs           # dry-run
 *   node scripts/chat-history-retention-sweep.mjs --apply   # commit
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sweepChatHistoryRetention } from '../api/cron/chat-history-retention-sweep.js';

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
  console.log(`\n=== ${mode} — chat_history retention sweep (1 day) ===\n`);
  const result = await sweepChatHistoryRetention({ db, now: Date.now(), apply });
  console.log(JSON.stringify(result, null, 2));
  console.log('');
  if (!apply) console.log(`Re-run with --apply to commit.\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
