// diag-doctor-positions.mjs (2026-07-24) — Rule R READ-ONLY.
// Lists distinct be_doctors.position values (+ counts, + per-branch) so the
// doctor/assistant schedule split classifies against REAL data, not a guess.
//   node scripts/diag-doctor-positions.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

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
  if (!getApps().length) initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
  }) });
  const db = getFirestore();
  const snap = await db.collection(`${PREFIX}/be_doctors`).get();
  const byPos = new Map();
  const sample = new Map();
  for (const d of snap.docs) {
    const x = d.data() || {};
    const pos = x.position == null ? '(missing)' : (String(x.position).trim() || '(empty)');
    byPos.set(pos, (byPos.get(pos) || 0) + 1);
    if (!sample.has(pos)) sample.set(pos, `${x.name || '?'} (branch=${x.branchId || '-'})`);
  }
  console.log(`\nbe_doctors total: ${snap.size}\n─ distinct position values ─`);
  for (const [pos, n] of [...byPos.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  "${pos}"   e.g. ${sample.get(pos)}`);
  }
  console.log('');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
