// V63 diag — inspect schedule-link docs to understand priorDoctorDays state.
// Read-only.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const APP_ID = 'loverclinic-opd-4c39b';
const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey,
  }),
});
const db = getFirestore();
const tokens = ['SCH-9c201860e1', 'SCH-2f69d853fb', 'SCH-cc3964c023', 'SCH-dbf38620f3', 'SCH-0b51f7c02c'];
for (const t of tokens) {
  const snap = await db.doc(`artifacts/${APP_ID}/public/data/clinic_schedules/${t}`).get();
  if (!snap.exists) { console.log(`${t}: NOT FOUND`); continue; }
  const d = snap.data();
  const days = Array.isArray(d.doctorDays) ? d.doctorDays : [];
  const hours = d.customDoctorHours || {};
  console.log(`${t}:`);
  console.log(`  months=${JSON.stringify(d.months)} branchId=${d.branchId}`);
  console.log(`  noDoctorRequired=${d.noDoctorRequired} showDoctorStatus=${d.showDoctorStatus} selectedDoctorId=${d.selectedDoctorId}`);
  console.log(`  doctorDays.length=${days.length} sample=${JSON.stringify(days.slice(0, 5))}`);
  console.log(`  doctorDays month spread: ${JSON.stringify([...new Set(days.map(x => typeof x === 'string' ? x.slice(0, 7) : 'invalid'))])}`);
  console.log(`  customDoctorHours.keys=${Object.keys(hours).length} sample=${JSON.stringify(Object.keys(hours).slice(0, 5))}`);
  console.log(`  _v62BackfilledAt=${d._v62BackfilledAt ? 'YES' : 'no'} _v62LegacyDoctorDays.length=${(d._v62LegacyDoctorDays || []).length}`);
  console.log(`  _v60BackfilledAt=${d._v60BackfilledAt ? 'YES' : 'no'} _v60LegacyDoctorDays.length=${(d._v60LegacyDoctorDays || []).length}`);
  console.log('');
}
