#!/usr/bin/env node
/**
 * Rule R diag (READ-ONLY) — resolve a patient-link token and report what the
 * customer-mode page receives + what the cleanup cron would decide, computed via
 * the REAL src/lib/customerLinkPayloadCore.js (AV135). Confirms the UI hide-empty
 * + cron isEmpty against real prod data.
 *
 * Usage: node scripts/diag-patient-link-empty-state.mjs <token>
 *        node scripts/diag-patient-link-empty-state.mjs            # scans all enabled links
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computeUsableCourses, isCustomerLinkEmpty } from '../src/lib/customerLinkPayloadCore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const content = readFileSync(resolve(__dirname, '..', '.env.local.prod'), 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
function todayBKK() {
  const u = new Date(Date.now() + 7 * 3600000);
  return `${u.getUTCFullYear()}-${String(u.getUTCMonth() + 1).padStart(2, '0')}-${String(u.getUTCDate()).padStart(2, '0')}`;
}

async function report(db, doc, today) {
  const data = doc.data();
  const { remaining, expired } = computeUsableCourses(data.courses, today);
  const apptSnap = await db.collection(`${PREFIX}/be_appointments`).where('customerId', '==', String(doc.id)).get();
  const appts = apptSnap.docs.map(a => a.data());
  const empty = isCustomerLinkEmpty({ courses: data.courses, appointments: appts, todayISO: today });
  const pd = data.patientData || {};
  const name = `${pd.prefix || ''} ${pd.firstName || pd.firstNameTh || ''} ${pd.lastName || pd.lastNameTh || ''}`.trim();
  const upcoming = appts.filter(a => (!a.date || String(a.date) >= today) && a.status !== 'cancelled' && !a.serviceCompletedAt && !a.wasServiceCompleted && !['done','completed','มาตามนัด','ชำระเงิน'].includes(String(a.status||'').trim()));
  console.log(`\n${doc.id} · ${name || '(no name)'} · token=${(data.patientLinkToken||'').slice(0,12)}… enabled=${data.patientLinkEnabled}`);
  console.log(`  remaining courses (shown): ${remaining.length}   expired: ${expired.length}   raw courses: ${(data.courses||[]).length}`);
  console.log(`  upcoming appts (shown): ${upcoming.length}   total appts: ${appts.length}`);
  console.log(`  → UI: coursesBox=${remaining.length>0?'SHOW':'HIDDEN'}  apptBox=${upcoming.length>0?'SHOW':'HIDDEN'}  subtleLine=${(upcoming.length===0&&remaining.length===0&&expired.length===0)?'YES':'no'}`);
  console.log(`  → cron isEmpty=${empty}  patientLinkEmptySince=${data.patientLinkEmptySince ?? '(unset)'}`);
}

async function main() {
  const token = process.argv[2];
  const env = loadEnv();
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();
  const today = todayBKK();
  console.log(`today (BKK) = ${today}`);
  if (token) {
    const snap = await db.collection(`${PREFIX}/be_customers`).where('patientLinkToken', '==', token).limit(1).get();
    if (snap.empty) { console.log('NOT FOUND for token'); return; }
    await report(db, snap.docs[0], today);
  } else {
    const snap = await db.collection(`${PREFIX}/be_customers`).where('patientLinkEnabled', '==', true).get();
    console.log(`enabled links: ${snap.size}`);
    for (const d of snap.docs) await report(db, d, today);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
