// V125 Rule R diag — check current state of BA-1779590375471 + ND-68FA49
// after user clicked ยกเลิก in the นัดหมาย tab.
//
// Hypothesis options:
//   H-A: appt status='cancelled' (per V64-fix5 onCancelAppt) but the session stays
//   H-B: appt was deleted by a different handler (deleteBackendAppointment / cascade)
//   H-C: session was archived independently
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function loadEnv() {
  const text = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const key = env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: key,
    }),
  });
  const db = getFirestore();
  const APP_ID = 'loverclinic-opd-4c39b';

  // 1) Appt
  const apptRef = db.doc(`artifacts/${APP_ID}/public/data/be_appointments/BA-1779590375471`);
  const apptSnap = await apptRef.get();
  console.log('Appointment BA-1779590375471:', apptSnap.exists ? 'EXISTS' : 'DELETED');
  if (apptSnap.exists) {
    const a = apptSnap.data();
    console.log('   status         =', a.status);
    console.log('   linkedOpdSessionId =', a.linkedOpdSessionId);
    console.log('   updatedAt      =', a.updatedAt);
  }

  // 2) Session
  const sessRef = db.doc(`artifacts/${APP_ID}/public/data/opd_sessions/ND-68FA49`);
  const sessSnap = await sessRef.get();
  console.log('\nOPD Session ND-68FA49:', sessSnap.exists ? 'EXISTS' : 'DELETED');
  if (sessSnap.exists) {
    const s = sessSnap.data();
    console.log('   isArchived          =', s.isArchived);
    console.log('   isPermanent         =', s.isPermanent);
    console.log('   isHiddenFromQueue   =', s.isHiddenFromQueue);
    console.log('   isUnread            =', s.isUnread);
    console.log('   opdRecordedAt       =', s.opdRecordedAt);
    console.log('   patientData keys    =', Object.keys(s.patientData || {}).length);
    console.log('   formType            =', s.formType);
    console.log('   linkedAppointmentId =', s.linkedAppointmentId);
    console.log('   linkedDepositId     =', s.linkedDepositId);
  }

  // 3) Look for ANY appointment that still references ND-68FA49
  const apptsCol = db.collection(`artifacts/${APP_ID}/public/data/be_appointments`);
  const linkedSnap = await apptsCol.where('linkedOpdSessionId', '==', 'ND-68FA49').get();
  console.log('\nAppointments linking ND-68FA49:', linkedSnap.size);
  linkedSnap.forEach(d => {
    const a = d.data();
    console.log('   ', d.id, '| status:', a.status, '| date:', a.date, '| updatedAt:', a.updatedAt);
  });

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
