#!/usr/bin/env node
// scripts/diag-recall-list-enhancements-shape.mjs
//
// 2026-05-20 — Rule R READ-ONLY diagnostic for the Recall list enhancements.
// Confirms real be_recalls docs carry the fields the new UI reads:
//   - customerPhone  → tap-to-call phone link (RecallRow)
//   - outcomeBy.name → "บันทึกโดย" byline (RecallRow)
//   - reason / outcomeNote → prominent note (Q1=A outcomeNote || reason)
// Verifies against REAL DATA SHAPE per Rule Q V66. No writes.
//
// Usage: node scripts/diag-recall-list-enhancements-shape.mjs

import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}

async function main() {
  loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) { console.error('❌ env missing'); process.exit(1); }

  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const privateKey = rawKey.split('\\n').join('\n');
  if (getApps().length === 0) initializeApp({ credential: cert({ projectId: APP_ID, clientEmail, privateKey }) });
  const db = getFirestore();

  const snap = await db.collection(`artifacts/${APP_ID}/public/data/be_recalls`).get();
  const docs = snap.docs.map(d => d.data());
  const total = docs.length;
  const withPhone = docs.filter(r => r.customerPhone && String(r.customerPhone).trim()).length;
  const withReason = docs.filter(r => r.reason && String(r.reason).trim()).length;
  const finalized = docs.filter(r => ['done', 'no-answer', 'closed-no-answer'].includes(r.status));
  const withOutcomeByName = finalized.filter(r => r.outcomeBy && r.outcomeBy.name).length;
  const withOutcomeNote = finalized.filter(r => r.outcomeNote && String(r.outcomeNote).trim()).length;
  const statusBreakdown = docs.reduce((acc, r) => { acc[r.status || '(none)'] = (acc[r.status || '(none)'] || 0) + 1; return acc; }, {});

  console.log(`\n🔔 be_recalls real-data shape (total=${total})`);
  console.log(`   customerPhone non-empty : ${withPhone}/${total} (${total ? Math.round(withPhone / total * 100) : 0}%) → phone link renders`);
  console.log(`   reason non-empty        : ${withReason}/${total} → note fallback source`);
  console.log(`   status breakdown        : ${JSON.stringify(statusBreakdown)}`);
  console.log(`   finalized (done/no-answer/closed) : ${finalized.length}`);
  console.log(`     ├─ outcomeBy.name present : ${withOutcomeByName}/${finalized.length} → "บันทึกโดย" byline renders`);
  console.log(`     └─ outcomeNote non-empty  : ${withOutcomeNote}/${finalized.length} → prominent note = outcomeNote`);

  console.log(`\n   sample docs (first 5):`);
  for (const r of docs.slice(0, 5)) {
    console.log(`   - id=${r.id} status=${r.status} phone=${JSON.stringify(r.customerPhone || '')} outcomeBy=${JSON.stringify(r.outcomeBy || null)}`);
    console.log(`       reason=${JSON.stringify((r.reason || '').slice(0, 40))} outcomeNote=${JSON.stringify((r.outcomeNote || '').slice(0, 40))}`);
  }
  console.log('\n✅ READ-ONLY diag complete — no writes.\n');
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
