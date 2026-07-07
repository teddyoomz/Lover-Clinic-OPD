// READ-ONLY (Rule R) — count be_treatments still carrying LEGACY inline base64
// chart dataUrls (pre-2026-05-22 Storage-ref). Determines whether the Rule M
// chart backfill is still needed at all.
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
for (const line of readFileSync('.env.local.prod', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!getApps().length) initializeApp({ credential: cert({
  projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
})});
const db = getFirestore();
const snap = await db.collection(`artifacts/${APP_ID}/public/data/be_treatments`).get();
let treatments = 0, withCharts = 0, legacyInline = 0, storageRef = 0, legacyDocs = [];
for (const d of snap.docs) {
  treatments++;
  const charts = d.data()?.detail?.charts || [];
  if (!charts.length) continue;
  withCharts++;
  let hasLegacy = false;
  for (const c of charts) {
    const u = String(c?.dataUrl || '');
    if (u.startsWith('data:')) { legacyInline++; hasLegacy = true; }
    else if (u.startsWith('http')) storageRef++;
  }
  if (hasLegacy) legacyDocs.push(d.id);
}
console.log({ treatments, withCharts, chartEntries: { legacyInline, storageRef } });
console.log('docs with legacy inline charts:', legacyDocs.length, legacyDocs.slice(0, 10));
