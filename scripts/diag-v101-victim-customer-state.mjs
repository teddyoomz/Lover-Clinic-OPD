#!/usr/bin/env node
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

for (const cid of ['LC-26000078', 'LC-26000079']) {
  const c = (await db.doc(`${BASE}/be_customers/${cid}`).get()).data();
  if (!c) { console.log(`${cid}: NOT FOUND`); continue; }
  console.log(`\n━━━ ${cid} (${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}) ━━━`);
  console.log(`Courses (${(c.courses || []).length}):`);
  (c.courses || []).forEach((cc, i) => {
    const qmatch = (cc.qty || '').match(/^(\d+)\s*\/\s*(\d+)/);
    const flag = qmatch && Number(qmatch[1]) < Number(qmatch[2]) ? '⬇' : qmatch && Number(qmatch[1]) === Number(qmatch[2]) ? '◯' : '';
    console.log(`  [${i}] ${flag} name="${cc.name}" product="${cc.product}" qty="${cc.qty}" productId=${cc.productId} status=${cc.status} linkedTreatmentId=${cc.linkedTreatmentId || ''}`);
  });
}
process.exit(0);
