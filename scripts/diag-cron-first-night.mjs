#!/usr/bin/env node
// ─── Rule R diag (READ-ONLY) — first-night check for the 2 new crons ─────────
// 1) opd-session-archive-retention: list be_admin_audit docs with that id prefix
// 2) patient-view-warmup: no audit doc (HTTP ping only) — timed separately via curl
// Run: node scripts/diag-cron-first-night.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = v;
  }
}

async function main() {
  loadEnvLocal();
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldPath } = await import('firebase-admin/firestore');
  const APP_ID = 'loverclinic-opd-4c39b';
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();
  const audit = db.collection(`artifacts/${APP_ID}/public/data/be_admin_audit`);

  const prefix = 'opd-session-archive-retention';
  const snap = await audit
    .orderBy(FieldPath.documentId())
    .startAt(prefix)
    .endBefore(prefix + '~')
    .get();
  console.log(`retention audit docs: ${snap.size}`);
  for (const d of snap.docs) {
    const x = d.data();
    console.log(`  ${d.id} · source=${x.source || 'cron'} · scanned=${x.scanned} deleted=${x.deleted} skipped=${x.skipped} · reasons=${JSON.stringify(x.reasons || {})}`);
  }
  if (snap.size === 0) console.log('  (none yet — cron 03:20 BKK; first run is the night AFTER deploy)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
