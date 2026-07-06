// perf-find-links.mjs — Rule R READ-ONLY: discover live link tokens/ids on prod
// so perf-baseline.mjs can measure customer-facing surfaces with REAL links.
// Writes docs/perf/links.json = { schedule, patient, session, customer }.
// NO writes to Firestore. Canonical path per Rule M/R.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}
const APP_ID = 'loverclinic-opd-4c39b';

async function main() {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  const app = initializeApp({
    credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: key }),
  });
  const db = getFirestore(app);
  const col = (name) => db.collection(`artifacts/${APP_ID}/public/data/${name}`);
  const links = {};

  // schedule link — doc id IS the token; REAL links are SCH-* (skip probe artifacts)
  const scheds = await col('clinic_schedules').limit(25).get();
  const sched = scheds.docs.find((d) => d.id.startsWith('SCH-') && d.data().enabled !== false)
    || scheds.docs.find((d) => d.id.startsWith('SCH-'));
  if (sched) links.schedule = sched.id;

  // patient link — customer carrying patientLinkToken
  const pat = await col('be_customers').where('patientLinkToken', '!=', null).limit(1).get();
  if (!pat.empty) links.patient = pat.docs[0].data().patientLinkToken;

  // opd session — any completed session id
  const sess = await col('opd_sessions').where('status', '==', 'completed').limit(1).get();
  if (!sess.empty) links.session = sess.docs[0].id;

  // heavy customer — newest treatment's customer (CDV with real history = good probe)
  const t = await col('be_treatments').orderBy('createdAt', 'desc').limit(1).get()
    .catch(() => col('be_treatments').limit(1).get());
  if (!t.empty) links.customer = t.docs[0].data().customerId || '';
  if (!links.customer) {
    const c = await col('be_customers').limit(1).get();
    if (!c.empty) links.customer = c.docs[0].id;
  }

  mkdirSync('docs/perf', { recursive: true });
  writeFileSync('docs/perf/links.json', JSON.stringify(links, null, 2));
  console.log('docs/perf/links.json:', JSON.stringify(links));
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
