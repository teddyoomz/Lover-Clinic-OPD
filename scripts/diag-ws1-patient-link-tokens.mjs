// scripts/diag-ws1-patient-link-tokens.mjs — Rule R (READ-ONLY) diagnostic.
// WS1 / C1: understand the `?patient=<patientLinkToken>` legacy population so we can
// safely remove the client-side opd_sessions fallback query (the anon-list vector)
// from PatientDashboard without breaking any real patient.
//
// Counts:
//   - opd_sessions docs that carry a patientLinkToken
//   - of those, how many are patientLinkEnabled === true
//   - of the enabled ones, how many have brokerProClinicId (endpoint /api/patient-view
//     resolves these to be_customers) vs NOT (endpoint returns 404 TODAY → notfound,
//     so the client fallback never served them either — it only fires on 5xx).
//   - be_customers docs with patientLinkToken (the primary, secure endpoint path).
//
// Read-only. No writes. Prints aggregate counts only — NO PII values.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  const raw = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function getDb() {
  if (getApps().length) return getFirestore();
  const env = loadEnv();
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('missing FIREBASE_ADMIN_* in .env.local.prod');
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail,
      privateKey: rawKey.split('\\n').join('\n'),
    }),
  });
  return getFirestore();
}

const col = (db, c) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(c);

async function main() {
  const db = getDb();

  // opd_sessions carrying a patientLinkToken
  const sessSnap = await col(db, 'opd_sessions').where('patientLinkToken', '>', '').get();
  let sessWithToken = 0, sessEnabled = 0, sessEnabledWithBroker = 0, sessEnabledNoBroker = 0;
  for (const d of sessSnap.docs) {
    const s = d.data();
    if (!s.patientLinkToken) continue;
    sessWithToken += 1;
    if (s.patientLinkEnabled === true) {
      sessEnabled += 1;
      if (s.brokerProClinicId) sessEnabledWithBroker += 1;
      else sessEnabledNoBroker += 1;
    }
  }

  // be_customers carrying a patientLinkToken (primary secure endpoint path)
  const custSnap = await col(db, 'be_customers').where('patientLinkToken', '>', '').get();
  let custWithToken = 0, custEnabled = 0;
  for (const d of custSnap.docs) {
    const c = d.data();
    if (!c.patientLinkToken) continue;
    custWithToken += 1;
    if (c.patientLinkEnabled === true) custEnabled += 1;
  }

  console.log('=== WS1 / C1 — ?patient= link population (READ-ONLY) ===');
  console.log('opd_sessions with patientLinkToken            :', sessWithToken);
  console.log('  ↳ patientLinkEnabled=true                   :', sessEnabled);
  console.log('     ↳ has brokerProClinicId (endpoint resolves):', sessEnabledWithBroker);
  console.log('     ↳ NO brokerProClinicId (endpoint 404 today):', sessEnabledNoBroker);
  console.log('be_customers with patientLinkToken (primary)  :', custWithToken);
  console.log('  ↳ patientLinkEnabled=true                   :', custEnabled);
  console.log('');
  console.log('INTERPRETATION:');
  console.log('  - Enabled opd_session tokens are served by the endpoint IFF they have a');
  console.log('    brokerProClinicId. Those WITHOUT one already 404 today (client fallback');
  console.log('    only fires on 5xx, not 404) → removing the client opd_sessions query');
  console.log('    breaks NO patient the endpoint does not already 404.');
  console.log('  - If sessEnabledNoBroker > 0 we should EXTEND /api/patient-view to render a');
  console.log('    standalone opd_session (field-minimized) so those patients keep working.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
