// Phase 29.23-bis4 / Rule R — diagnostic for "sync ล้มเหลวทุกครั้ง" on
// no-deposit booking creation.
//
// Read-only. Pulls recent opd_sessions where appointmentSyncStatus='failed'
// and dumps the actual error fields so we can root-cause the failure.
//
// Run: node scripts/diag-no-deposit-sync-failures.mjs

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  const raw = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!clientEmail || !privateKey) {
    console.error('Missing FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY in .env.local.prod');
    process.exit(1);
  }

  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  const db = getFirestore();

  console.log('=== DIAG: no-deposit appointment sync failures ===\n');

  // 1. Recent failed sync sessions
  const sessionsRef = db.collection(`artifacts/${APP_ID}/public/data/opd_sessions`);
  const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;

  const failedSnap = await sessionsRef
    .where('appointmentSyncStatus', '==', 'failed')
    .limit(20)
    .get();

  console.log(`Found ${failedSnap.size} sessions with appointmentSyncStatus='failed' (limit 20):\n`);

  for (const docSnap of failedSnap.docs) {
    const d = docSnap.data();
    const createdAt = d.createdAt?.toDate ? d.createdAt.toDate() : null;
    const isRecent = createdAt && createdAt.getTime() > oneDayAgoMs - 7 * 24 * 60 * 60 * 1000;
    console.log(`--- ${docSnap.id} ${isRecent ? '(recent)' : ''} ---`);
    console.log(`  formType: ${d.formType}`);
    console.log(`  isPermanent: ${d.isPermanent}`);
    console.log(`  serviceCompleted: ${d.serviceCompleted}`);
    console.log(`  branchId: ${d.branchId || '(empty)'}`);
    console.log(`  createdAt: ${createdAt?.toISOString() || '(no timestamp)'}`);
    console.log(`  appointmentSyncStatus: ${d.appointmentSyncStatus}`);
    console.log(`  appointmentSyncError: ${d.appointmentSyncError || '(empty)'}`);
    console.log(`  appointmentSyncErrorCode: ${d.appointmentSyncErrorCode || '(empty)'}`);
    console.log(`  appointmentProClinicId: ${d.appointmentProClinicId || '(empty)'}`);
    console.log(`  linkedAppointmentId: ${d.linkedAppointmentId || '(empty)'}`);
    if (d.appointmentData) {
      console.log(`  appointmentData:`);
      console.log(`    date: ${d.appointmentData.appointmentDate || '(empty)'}`);
      console.log(`    startTime: ${d.appointmentData.appointmentStartTime || '(empty)'}`);
      console.log(`    endTime: ${d.appointmentData.appointmentEndTime || '(empty)'}`);
      console.log(`    doctor: ${d.appointmentData.doctor || '(empty)'}`);
      console.log(`    advisor: ${d.appointmentData.advisor || '(empty)'}`);
      console.log(`    assistant: ${d.appointmentData.assistant || '(empty)'}`);
      console.log(`    room: ${d.appointmentData.room || '(empty)'}`);
      console.log(`    source: ${d.appointmentData.source || '(empty)'}`);
    }
    if (d.appointmentSyncErrorStack) {
      console.log(`  appointmentSyncErrorStack (first 500 chars):`);
      console.log(`    ${String(d.appointmentSyncErrorStack).slice(0, 500)}`);
    }
    console.log();
  }

  // 2. Existing appointments + slots for the same dates+doctors
  const apptDates = new Set();
  const apptDoctors = new Set();
  for (const docSnap of failedSnap.docs) {
    const d = docSnap.data();
    if (d.appointmentData?.appointmentDate) apptDates.add(d.appointmentData.appointmentDate);
    if (d.appointmentData?.doctor) apptDoctors.add(String(d.appointmentData.doctor));
  }

  if (apptDates.size > 0 && apptDoctors.size > 0) {
    console.log(`\n=== Checking existing appointments + slots for failed bookings' (date × doctor) combos ===\n`);
    const apptsRef = db.collection(`artifacts/${APP_ID}/public/data/be_appointments`);
    const slotsRef = db.collection(`artifacts/${APP_ID}/public/data/be_appointment_slots`);

    for (const date of apptDates) {
      const apptsSnap = await apptsRef.where('date', '==', date).limit(50).get();
      console.log(`Date ${date}: ${apptsSnap.size} existing be_appointments`);
      for (const a of apptsSnap.docs) {
        const ad = a.data();
        const docIdMatch = apptDoctors.has(String(ad.doctorId || ad.doctor?.id || ''));
        console.log(`  [${docIdMatch ? '⚠ DOCTOR-MATCH' : '  '}] ${a.id} doctorId=${ad.doctorId || ad.doctor?.id || '(no doctor)'} time=${ad.startTime || '?'}-${ad.endTime || '?'} type=${ad.appointmentType || '?'} status=${ad.status || '?'} branchId=${ad.branchId || '(empty)'}`);
      }

      for (const doctorId of apptDoctors) {
        if (!doctorId) continue;
        const safeDoc = String(doctorId).replace(/[\/.]/g, '-');
        const prefix = `${date}_${safeDoc}_`;
        // No prefix query in admin SDK without orderBy — fetch a batch + filter
        const slotsSnap = await slotsRef
          .where('date', '==', date)
          .where('doctorId', '==', String(doctorId))
          .limit(30)
          .get();
        console.log(`Date ${date} × doctor ${doctorId}: ${slotsSnap.size} existing be_appointment_slots`);
        for (const s of slotsSnap.docs) {
          const sd = s.data();
          console.log(`  ${s.id} appointmentId=${sd.appointmentId || '(no id)'} time=${sd.startTime}-${sd.endTime} cancelled=${sd.cancelled === true ? 'TRUE' : sd.cancelled === false ? 'FALSE' : '(undefined)'}`);
        }
      }
    }
  }

  console.log('\n=== DIAG COMPLETE ===');
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('DIAG SCRIPT ERROR:', e);
    process.exit(1);
  });
}
