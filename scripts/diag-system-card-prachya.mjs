#!/usr/bin/env node
// Rule R diag (READ-ONLY) — trace why the AV198 "ระบบ" intake card for
// นาย ปรัชญา มนเทียรอาสน์ (LC-26000176) still shows "รอลงทะเบียน" although the
// walk-in is registered. Confirms: (a) the card's system.{sessionId,customerId,kind};
// (b) the linked opd_session's REAL fields (brokerProClinicId is the resolve key);
// (c) the appointment's linkedOpdSessionId vs the card's sessionId.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const NEEDLE = 'ปรัชญา';
const CUST_ID = 'LC-26000176';

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const F = (s, keys) => {
  const o = {};
  for (const k of keys) o[k] = s[k] === undefined ? '(undef)' : s[k];
  return o;
};

async function main() {
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) });
  const db = getFirestore();

  // 1) the system card
  console.log('=== 1) SYSTEM CARDS matching needle ===');
  const cardSnap = await db.collection(`${PREFIX}/be_staff_chat_messages`)
    .where('displayName', '==', 'ระบบ').limit(400).get();
  const cards = cardSnap.docs.filter(d => JSON.stringify(d.data().system || {}).includes(NEEDLE) || (d.data().system?.nameSnapshot || '').includes(NEEDLE));
  console.log(`  ระบบ cards total=${cardSnap.size}, matching "${NEEDLE}"=${cards.length}`);
  const sessionIds = new Set();
  for (const d of cards) {
    const s = d.data();
    console.log('  CARD', d.id, JSON.stringify({ branchId: s.branchId, text: s.text, system: s.system, createdAt: s.createdAt && s.createdAt.toDate && s.createdAt.toDate().toISOString() }));
    if (s.system?.sessionId) sessionIds.add(String(s.system.sessionId));
  }

  // 2) each card's opd_session — the REAL fields
  console.log('\n=== 2) opd_session(s) referenced by the card(s) ===');
  for (const sid of sessionIds) {
    const sd = await db.doc(`${PREFIX}/opd_sessions/${sid}`).get();
    if (!sd.exists) { console.log('  SESSION', sid, 'DOES NOT EXIST'); continue; }
    const s = sd.data();
    console.log('  SESSION', sid, JSON.stringify(F(s, [
      'brokerProClinicId', 'brokerProClinicHN', 'brokerStatus', 'opdRecordedAt',
      'linkedCustomerId', 'branchId', 'status', 'customerId', 'isUnread',
      'createdFromBackendBooking', 'isHiddenFromQueue', 'formType', 'updatedAt',
    ])));
    console.log('    patientData name:', (s.patientData?.firstNameTh || s.patientData?.firstName || '') + ' ' + (s.patientData?.lastNameTh || s.patientData?.lastName || ''));
  }

  // 3) the be_customers doc
  console.log('\n=== 3) be_customers/' + CUST_ID + ' ===');
  const cd = await db.doc(`${PREFIX}/be_customers/${CUST_ID}`).get();
  if (cd.exists) {
    const c = cd.data();
    console.log('  EXISTS', JSON.stringify(F(c, ['proClinicId', 'proClinicHN', 'HN', 'hn_no', 'branchId', 'id'])));
    console.log('    name:', (c.patientData?.firstNameTh || c.patientData?.firstName || c.firstname || '') + ' ' + (c.patientData?.lastNameTh || c.patientData?.lastName || c.lastname || ''));
  } else console.log('  MISSING');

  // 4) appointments for this customer — linkedOpdSessionId vs the card's sessionId
  console.log('\n=== 4) be_appointments for customerId=' + CUST_ID + ' ===');
  const apSnap = await db.collection(`${PREFIX}/be_appointments`).where('customerId', '==', CUST_ID).limit(20).get();
  console.log('  count=', apSnap.size);
  for (const d of apSnap.docs) {
    const a = d.data();
    console.log('  APPT', d.id, JSON.stringify(F(a, ['customerId', 'linkedOpdSessionId', 'status', 'branchId', 'date', 'startTime'])));
  }

  // 5) reverse: any opd_session whose brokerProClinicId === CUST_ID (the REAL registered session)
  console.log('\n=== 5) opd_sessions where brokerProClinicId == ' + CUST_ID + ' (the truly-registered session) ===');
  const regSnap = await db.collection(`${PREFIX}/opd_sessions`).where('brokerProClinicId', '==', CUST_ID).limit(10).get();
  console.log('  count=', regSnap.size);
  for (const d of regSnap.docs) {
    const s = d.data();
    console.log('  REG-SESSION', d.id, JSON.stringify(F(s, ['brokerProClinicId', 'brokerStatus', 'opdRecordedAt', 'branchId', 'status', 'linkedCustomerId'])));
    console.log('    → is this the card sessionId?', sessionIds.has(d.id) ? 'YES (match)' : 'NO (MISMATCH — card points elsewhere)');
  }

  console.log('\nVERDICT: compare §2 brokerProClinicId (card session) vs §5 (real registered session). If §2 is (undef)/empty but §5 has a different doc id → sessionId mismatch is the root cause.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
