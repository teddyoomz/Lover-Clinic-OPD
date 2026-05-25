// Rule R diag (read-only): verify the user's patient-link customer has
// appointments + correct id matching + branch resolution + field shape.
// Confirms the api/patient-view mapping (Task 1) uses the right field names.
//   node scripts/diag-patient-link-appointments.mjs [token]
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const APP_ID = 'loverclinic-opd-4c39b';
for (const line of readFileSync('.env.local.prod', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
if (!getApps().length) initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
  }),
});
const db = getFirestore();
const dataCol = (c) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(c);

async function main() {
  const TOKEN = process.argv[2] || '1b550b9aebc845cfe4adc49cd747813e';
  console.log('=== token:', TOKEN, '===');

  // resolve via be_customers first
  let customerId = null, source = null;
  const cs = await dataCol('be_customers').where('patientLinkToken', '==', TOKEN).limit(1).get();
  if (!cs.empty) { customerId = cs.docs[0].id; source = 'be_customers'; console.log('resolved via be_customers:', customerId, 'enabled:', cs.docs[0].data().patientLinkEnabled); }
  else {
    const ss = await dataCol('opd_sessions').where('patientLinkToken', '==', TOKEN).limit(1).get();
    if (!ss.empty) {
      const s = ss.docs[0].data(); customerId = s.brokerProClinicId ? String(s.brokerProClinicId) : null; source = 'opd_session';
      console.log('resolved via opd_session:', ss.docs[0].id, '| brokerProClinicId:', s.brokerProClinicId, '| HN:', s.brokerProClinicHN, '| enabled:', s.patientLinkEnabled, '| cached latestCourses.appts:', (s.latestCourses?.appointments || []).length);
    } else { console.log('!! token not found in be_customers OR opd_sessions'); return; }
  }
  if (!customerId) { console.log('!! no customerId resolved'); return; }

  const cust = await dataCol('be_customers').doc(String(customerId)).get();
  console.log('customer exists:', cust.exists, '| courses:', (cust.data()?.courses || []).length, '| name:', cust.data()?.patientData?.firstName, cust.data()?.patientData?.lastName);

  const aps = await dataCol('be_appointments').where('customerId', '==', String(customerId)).get();
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const all = aps.docs.map(d => ({ id: d.id, ...d.data() }));
  const future = all.filter(a => (a.date || '') >= today);
  console.log('today(BKK):', today, '| appts total:', all.length, '| future:', future.length);
  console.log('appt field keys:', all[0] ? Object.keys(all[0]).join(', ') : 'NONE');
  console.log('ALL appts (raw date/startTime/type/status):', JSON.stringify(all.map(a => ({ date: a.date, startTime: a.startTime, endTime: a.endTime, appointmentType: a.appointmentType, doctorName: a.doctorName, branchId: a.branchId, roomId: a.roomId, roomName: a.roomName, status: a.status })), null, 2));
  console.log('future sample:', JSON.stringify(future.slice(0, 3).map(a => ({ date: a.date, time: a.time, doctorName: a.doctorName, branchId: a.branchId, roomName: a.roomName, status: a.status })), null, 2));

  for (const a of future.slice(0, 3)) {
    if (a.branchId) { const b = await dataCol('be_branches').doc(String(a.branchId)).get(); console.log('branch', a.branchId, '→', b.exists ? b.data().name : 'MISSING'); }
    else console.log('appt', a.id, 'has NO branchId');
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
