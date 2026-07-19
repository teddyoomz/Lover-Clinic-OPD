#!/usr/bin/env node
// ─── Rule R diag (READ-ONLY) — post-backfill byId resolution on REAL prod rows ──
// Uses the PRODUCTION resolver (src/lib/courseExchange.js) against a real
// customer's backfilled courses[]: every row must resolve to ITS OWN index
// via courseId (twins included). Run: node scripts/diag-av209-backfill-verify.mjs [customerId]
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
  const { getFirestore } = await import('firebase-admin/firestore');
  const APP_ID = 'loverclinic-opd-4c39b';
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();
  const { resolveCourseRowIndex } = await import('../src/lib/courseExchange.js');

  const custId = process.argv[2] || 'LC-26000034';
  const d = await db.doc(`artifacts/${APP_ID}/public/data/be_customers/${custId}`).get();
  if (!d.exists) { console.log('customer not found:', custId); return; }
  const courses = Array.isArray(d.data().courses) ? d.data().courses : [];
  const stamped = courses.filter(c => String(c?.courseId || '').startsWith('crsbf-')).length;
  console.log(`${custId}: rows ${courses.length} · crsbf-stamped ${stamped}`);

  const byName = {};
  courses.forEach((c, i) => { const k = `${c?.name}|${c?.product || ''}`; (byName[k] ||= []).push(i); });
  const twins = Object.entries(byName).filter(([, v]) => v.length > 1);
  console.log(`twin groups (same name+product): ${twins.length}`);

  let pass = 0; let fail = 0;
  courses.forEach((c, i) => {
    const r = resolveCourseRowIndex(courses, { courseId: c?.courseId });
    if (r === i) pass += 1;
    else { fail += 1; console.log(`  MISMATCH row ${i} -> ${r} (${c?.name})`); }
  });
  console.log(`byId exact-resolution: ${pass}/${courses.length} · fail ${fail}`);
  for (const [k, idxs] of twins.slice(0, 3)) {
    const ok = idxs.every(i => resolveCourseRowIndex(courses, { courseId: courses[i].courseId }) === i);
    console.log(`  twin [${k}] rows ${idxs.join(',')} -> each resolves to itself: ${ok}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
