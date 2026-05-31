#!/usr/bin/env node
// V141 Rule R diag (READ-ONLY) — is "สาเหตุที่มาพบแพทย์" (visitReasons) empty because
// customers skip it (validation gap) or because of a display/persist bug?
// Scans recent opd_sessions + be_customers: sessionType vs visitReasons presence.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a;
}, {});
if (getApps().length === 0) initializeApp({ credential: cert({
  projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
  clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
}), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';

const vrLen = (pd) => Array.isArray(pd?.visitReasons) ? pd.visitReasons.length : (pd?.visitReason ? 1 : 0);

async function main() {
  // ── opd_sessions (the public-form submissions) ──
  const sess = await db.collection(`${BASE}/opd_sessions`).orderBy('submittedAt', 'desc').limit(120).get().catch(async () => {
    return db.collection(`${BASE}/opd_sessions`).limit(120).get();
  });
  const byType = {}; // sessionType → {total, emptyVR}
  let foundScreenshot = null;
  for (const doc of sess.docs) {
    const d = doc.data();
    if (d.status !== 'completed') continue;
    const pd = d.patientData || {};
    const st = d.sessionType || d.type || '(none)';
    byType[st] ||= { total: 0, emptyVR: 0 };
    byType[st].total++;
    if (vrLen(pd) === 0) byType[st].emptyVR++;
    const phone = String(pd.phone || '');
    const name = `${pd.prefix || ''}${pd.firstName || ''} ${pd.lastName || ''}`;
    if (phone === '0874247375' || /เกรียงไกร/.test(name)) {
      foundScreenshot = { id: doc.id, sessionType: st, vrLen: vrLen(pd), visitReasons: pd.visitReasons, visitReasonOther: pd.visitReasonOther, name, phone, status: d.status };
    }
  }
  console.log('=== opd_sessions (completed, latest 120) — empty visitReasons by sessionType ===');
  for (const [st, c] of Object.entries(byType).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${st.padEnd(16)} total=${String(c.total).padStart(3)}  empty-visitReasons=${String(c.emptyVR).padStart(3)}  (${Math.round(100 * c.emptyVR / c.total)}%)`);
  }
  console.log('\n=== screenshot customer (phone 0874247375 / เกรียงไกร) ===');
  console.log(foundScreenshot ? JSON.stringify(foundScreenshot, null, 2) : '  (not found in latest 120 opd_sessions — may be older or a be_customers record)');

  // ── be_customers (after intake → customer conversion) ──
  const cust = await db.collection(`${BASE}/be_customers`).limit(200).get();
  let custTotal = 0, custEmptyVR = 0, custHasVR = 0, screenshotCust = null;
  for (const doc of cust.docs) {
    const pd = doc.data().patientData || {};
    if (!pd || Object.keys(pd).length === 0) continue;
    custTotal++;
    if (vrLen(pd) === 0) custEmptyVR++; else custHasVR++;
    const phone = String(pd.phone || doc.data().phone || '');
    const name = `${pd.firstName || ''} ${pd.lastName || ''}`;
    if (phone === '0874247375' || /เกรียงไกร/.test(name)) {
      screenshotCust = { id: doc.id, vrLen: vrLen(pd), visitReasons: pd.visitReasons, name, phone };
    }
  }
  console.log(`\n=== be_customers (200 sampled) — visitReasons presence ===`);
  console.log(`  with patientData=${custTotal}  has-visitReasons=${custHasVR}  empty-visitReasons=${custEmptyVR}`);
  if (screenshotCust) console.log('  screenshot customer in be_customers:', JSON.stringify(screenshotCust, null, 2));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
