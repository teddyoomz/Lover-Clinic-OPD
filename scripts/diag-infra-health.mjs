// ─── diag-infra-health.mjs (2026-07-19) — Rule R READ-ONLY ─────────────────
// Runs the REAL infra-health evaluation against REAL prod data (the exact
// reads + pure evaluator the cron uses, via sweepInfraHealth readOnly:true)
// and prints the checks. Zero writes. Rule Q L2 for the health monitor.
//
//   node scripts/diag-infra-health.mjs
//
// Env: .env.local.prod (vercel env pull) — FIREBASE_ADMIN_* keys.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sweepInfraHealth } from '../api/cron/infra-health-sweep.js';

const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) return;
  const raw = readFileSync(new URL('../.env.local.prod', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnv();
  if (!getApps().length) {
    const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  const db = getFirestore();
  const { result, errorCount24h, dateKey } = await sweepInfraHealth({ db, readOnly: true });
  console.log(`\n🩺 Infra health @ ${dateKey} (READ-ONLY — no docs written, no alerts sent)`);
  console.log(`overall: ${result.overall} · errors24h: ${errorCount24h}\n`);
  for (const c of result.checks) {
    const icon = { ok: '✅', warn: '🟡', red: '🔴', info: 'ℹ️', skip: '⏭️' }[c.status] || '•';
    console.log(`${icon} ${c.label.padEnd(28)} ${c.detail}`);
  }
  console.log('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e); process.exit(1); });
}
