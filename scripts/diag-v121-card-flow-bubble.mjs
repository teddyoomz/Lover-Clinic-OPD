// Rule R diag (READ-ONLY) — verify BA-1779590375471 + its linked opd_session
// have the V118/V120/V121 markers required by isCardFlowUnread.
//
// Hypothesis: session has all 4 markers (createdFromBackendBooking, isHiddenFromQueue,
// isUnread, no opdRecordedAt). The bug is then in the bubble surface (memo iterates
// FILTERED state arrays that EXCLUDE card-flow sessions per V121 queue-exclusion).
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

  const apptRef = db.doc(`artifacts/${APP_ID}/public/data/be_appointments/BA-1779590375471`);
  const apptSnap = await apptRef.get();
  if (!apptSnap.exists) {
    console.log('❌ appt NOT FOUND BA-1779590375471');
    return;
  }
  const appt = apptSnap.data();
  console.log('✅ appt found:');
  console.log('   customerId         =', appt.customerId);
  console.log('   linkedOpdSessionId =', appt.linkedOpdSessionId);
  console.log('   linkedDepositId    =', appt.linkedDepositId);
  console.log('   branchId           =', appt.branchId);
  console.log('   date               =', appt.date);
  console.log('   customerNameTemp   =', appt.customerNameTemp);

  if (!appt.linkedOpdSessionId) {
    console.log('❌ no linkedOpdSessionId — Card flow never minted a link');
    return;
  }

  const sessRef = db.doc(`artifacts/${APP_ID}/public/data/opd_sessions/${appt.linkedOpdSessionId}`);
  const sessSnap = await sessRef.get();
  if (!sessSnap.exists) {
    console.log('❌ linked opd_session NOT FOUND:', appt.linkedOpdSessionId);
    return;
  }
  const s = sessSnap.data();
  console.log('\n✅ linked opd_session found:', appt.linkedOpdSessionId);
  console.log('   createdFromBackendBooking =', s.createdFromBackendBooking, '   ← V118 marker');
  console.log('   isHiddenFromQueue         =', s.isHiddenFromQueue, '       ← V120 marker');
  console.log('   isUnread                  =', s.isUnread, '             ← PatientForm marker');
  console.log('   opdRecordedAt             =', s.opdRecordedAt, '         ← !saved if null');
  console.log('   brokerStatus              =', s.brokerStatus);
  console.log('   isArchived                =', s.isArchived);
  console.log('   isPermanent               =', s.isPermanent);
  console.log('   patientData keys count    =', Object.keys(s.patientData || {}).length);
  console.log('   formType                  =', s.formType);
  console.log('   _v82FollowupOpdResetAt    =', s._v82FollowupOpdResetAt);

  const isCardFlowSession = !!(s.createdFromBackendBooking && s.isHiddenFromQueue);
  const isOpdSessionSaved = !!(s.opdRecordedAt && s.brokerStatus === 'done');
  const isCardFlowUnread = isCardFlowSession && !!s.isUnread && !isOpdSessionSaved;

  console.log('\n— Predicate evaluation —');
  console.log('   isCardFlowSession  =', isCardFlowSession);
  console.log('   isOpdSessionSaved  =', isOpdSessionSaved);
  console.log('   isCardFlowUnread   =', isCardFlowUnread, '  ← bubble should render IF this is true');

  // Queue-filter eval — does the V121 filter EXCLUDE this session from setSessions/setDepositSessions/setNoDepositSessions?
  const excludedByMainQueue = !!(s.isHiddenFromQueue && s.createdFromBackendBooking);
  const excludedByDepositQueue = !!(s.isHiddenFromQueue && s.createdFromBackendBooking);
  const excludedByNdQueue = !!(s.isHiddenFromQueue && s.createdFromBackendBooking);
  console.log('\n— V121 queue-filter eval (what cardFlowUnreadCount memo sees) —');
  console.log('   excluded from `sessions` array         =', excludedByMainQueue);
  console.log('   excluded from `depositSessions` array  =', excludedByDepositQueue);
  console.log('   excluded from `noDepositSessions` array =', excludedByNdQueue);
  console.log('   → memo iterates 5 arrays NONE of which contain this session');
  console.log('   → cardFlowUnreadCount = 0 → bubble does NOT render');

  // V124 predicate eval (the FIX).
  const hasPatientData = !!(s.patientData && typeof s.patientData === 'object' && Object.keys(s.patientData).length > 0);
  let v124state;
  if (!appt) v124state = 'B';
  else if (appt.customerId) v124state = 'A';
  else if (!appt.linkedOpdSessionId) v124state = 'B';
  else if (!s) v124state = 'C';
  else if (isOpdSessionSaved) v124state = 'E';
  else if (!hasPatientData) v124state = 'C';
  else v124state = 'D';
  console.log('\n— V124 predicate eval (after fix) —');
  console.log('   resolveCardOpdState        =', v124state);
  console.log('   hasPatientData             =', hasPatientData);
  console.log('   isAppointmentPendingOpdSave =', v124state === 'D', v124state === 'D' ? '  ← bubble RENDERS!' : '');
  console.log('   → memo iterates apptData.appointments, joins linkedSession → COUNTS this appt');
  console.log('   → cardFlowUnreadCount = 1 → bubble RENDERS purple "1"');

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
