#!/usr/bin/env node
/**
 * 2026-05-28 — V124 Bug B real-time verification (Rule Q L2 / cross-device proof).
 * Writes a TEST-APPT- appointment via the admin SDK (= "another device") so we can
 * watch the backend date-strip's month-count update LIVE (no refresh) in the browser,
 * proving listenToAppointmentsByMonth (onSnapshot, per-branch) fires cross-device.
 *
 * Modes: --probe (read a sample + branchId) | --write | --clean
 * TEST-APPT- prefix per V33.13. Canonical path per Rule M.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const COL = `artifacts/${APP_ID}/public/data/be_appointments`;
const TEST_DATE = '2026-05-29';
const NAKHON = 'BR-1777873556815-26df6480'; // นครราชสีมา (verified via --probe)

function loadEnv() {
  const txt = readFileSync(fileURLToPath(new URL('../.env.local.prod', import.meta.url)), 'utf8');
  const get = (k) => { const m = txt.match(new RegExp(`^${k}="?([^"\\n]*)"?`, 'm')); return m ? m[1] : ''; };
  return { email: get('FIREBASE_ADMIN_CLIENT_EMAIL'), key: get('FIREBASE_ADMIN_PRIVATE_KEY').split('\\n').join('\n') };
}

async function main() {
  const { email, key } = loadEnv();
  initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: email, privateKey: key }) });
  const db = getFirestore();
  const mode = process.argv.find((a) => a.startsWith('--')) || '--probe';

  if (mode === '--probe') {
    const snap = await db.collection(COL).where('branchId', '==', NAKHON).limit(3).get();
    console.log(`[probe] นครราชสีมา appts found: ${snap.size}`);
    snap.forEach((d) => {
      const a = d.data();
      console.log(`  ${d.id} | branchId=${a.branchId} | date=${JSON.stringify(a.date)} | type=${a.appointmentType} | start=${a.startTime}`);
    });
    // count on TEST_DATE before
    const day = await db.collection(COL).where('branchId', '==', NAKHON).where('date', '==', TEST_DATE).get();
    console.log(`[probe] current count on ${TEST_DATE} (date==): ${day.size}`);
  }

  if (mode === '--write') {
    const id = `TEST-APPT-${Date.now()}`;
    await db.doc(`${COL}/${id}`).set({
      branchId: NAKHON,
      date: TEST_DATE,
      startTime: '10:00',
      endTime: '10:15',
      appointmentType: 'no-deposit-booking',
      customerName: 'TEST V124 realtime',
      customerNameTemp: 'TEST V124 realtime',
      status: 'pending',
      _v124RealtimeTest: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log(`[write] CREATED ${id} on ${TEST_DATE} branch=${NAKHON}`);
  }

  if (mode === '--clean') {
    const snap = await db.collection(COL).where('_v124RealtimeTest', '==', true).get();
    let n = 0;
    for (const d of snap.docs) { await d.ref.delete(); n++; }
    console.log(`[clean] deleted ${n} TEST-APPT v124 docs`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
