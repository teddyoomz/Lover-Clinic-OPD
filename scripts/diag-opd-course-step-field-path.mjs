#!/usr/bin/env node
// V139 Rule R diag (READ-ONLY) — confirm the OPD "course deducted" field path on
// real prod BEFORE wiring the course-step (V104/V136-class correctness guard).
//
// Expectation:
//   • courseItems / treatmentItems live UNDER `detail` on be_treatments docs
//     → TOP-LEVEL courseItems count must be 0.
//   • ≥1 doc with a real deduction (detail.courseItems|treatmentItems non-empty).
//   • ≥1 completed-but-not-deducted doc (the amber "ยังไม่ตัด" warn case).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';

// mirror of the SSOT predicate we're about to ship (reads detail.*)
function resolveCourseDeducted(t) {
  if (!t || typeof t !== 'object') return false;
  const d = (t.detail && typeof t.detail === 'object') ? t.detail : {};
  const ci = Array.isArray(d.courseItems) ? d.courseItems.length : 0;
  const ti = Array.isArray(d.treatmentItems) ? d.treatmentItems.length : 0;
  return ci > 0 || ti > 0;
}

async function main() {
  const snap = await db.collection(`${BASE}/be_treatments`).orderBy('createdAt', 'desc').limit(120).get();
  let deducted = 0, purchaseOnly = 0, none = 0, topLevelCI = 0, completedNoDeduct = 0;
  const samples = [];
  for (const doc of snap.docs) {
    const t = doc.data();
    const d = t.detail || {};
    const ci = Array.isArray(d.courseItems) ? d.courseItems.length : 0;
    const ti = Array.isArray(d.treatmentItems) ? d.treatmentItems.length : 0;
    const pi = Array.isArray(d.purchasedItems) ? d.purchasedItems.length : 0;
    const cd = resolveCourseDeducted(t);
    const completed = !!t.completedAt;
    if (Array.isArray(t.courseItems)) topLevelCI++; // MUST be 0
    if (cd) deducted++; else if (pi) purchaseOnly++; else none++;
    if (completed && !cd) completedNoDeduct++;
    if (samples.length < 12) samples.push({ id: String(doc.id).slice(-8), status: t.status || '(none)', completed, ci, ti, pi, courseDeducted: cd });
  }
  console.log(`scanned ${snap.size} be_treatments (latest 120)\n`);
  console.log(`✅ courseDeducted (detail.courseItems|treatmentItems non-empty): ${deducted}`);
  console.log(`🟡 purchase-only (detail.purchasedItems, no deduct):            ${purchaseOnly}`);
  console.log(`⚪ no course at all:                                            ${none}`);
  console.log(`🔥 completed BUT not deducted (the warn case):                 ${completedNoDeduct}`);
  console.log(`🚨 TOP-LEVEL courseItems present (MUST be 0):                   ${topLevelCI}\n`);
  console.table(samples);
  if (topLevelCI > 0) console.log('\n❌ STOP — top-level courseItems found; resolver must also read top-level. Adjust design.');
  else console.log('\n✓ Field path confirmed: read detail.courseItems / detail.treatmentItems.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
