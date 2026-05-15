// Verify Bug B — appointment.customerId vs be_customers doc.id mismatch.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;

function getDb() {
  if (getApps().length === 0) {
    const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: key,
      }),
    });
  }
  return getFirestore();
}

async function main() {
  const db = getDb();

  console.log('================================================');
  console.log('LC-26000004 customer doc');
  console.log('================================================');
  const lc = await db.doc(`${BASE}/be_customers/LC-26000004`).get();
  if (lc.exists) {
    const d = lc.data();
    console.log(`  doc.id="${lc.id}"`);
    console.log(`  branchId="${d.branchId}"`);
    console.log(`  hn="${d.hn || '(unset)'}"`);
    console.log(`  customerCode="${d.customerCode || '(unset)'}"`);
    console.log(`  pcCustomerId="${d.pcCustomerId || '(unset)'}"`);
    console.log(`  legacyId="${d.legacyId || '(unset)'}"`);
    console.log(`  patientData.firstNameTh="${d.patientData?.firstNameTh || '?'}"`);
    console.log(`  patientData.lastNameTh="${d.patientData?.lastNameTh || '?'}"`);
    console.log(`  patientData.phone="${d.patientData?.phone || '?'}"`);
    console.log(`  lineUserId="${d.lineUserId || '(unset)'}"  type=${typeof d.lineUserId}`);
    console.log(`  lineLinkedAt="${d.lineLinkedAt || '(unset)'}"`);
    console.log(`  notifyOptOut=${d.notifyOptOut}`);
    console.log(`  lineUserId_byBranch=${JSON.stringify(d.lineUserId_byBranch || null)}`);
    console.log(`  ALL KEYS: ${Object.keys(d).join(', ')}`);
  }

  console.log('\n================================================');
  console.log('be_customers/2853 — does this doc exist?');
  console.log('================================================');
  const c2853 = await db.doc(`${BASE}/be_customers/2853`).get();
  console.log(`  exists=${c2853.exists}`);
  if (c2853.exists) {
    const d = c2853.data();
    console.log(`  ALL KEYS: ${Object.keys(d).join(', ')}`);
    console.log(`  branchId="${d.branchId}"  hn="${d.hn}"  patientData.firstNameTh="${d.patientData?.firstNameTh}"`);
  }

  console.log('\n================================================');
  console.log('be_appointments/BA-1778823940645 — full doc');
  console.log('================================================');
  const appt = await db.doc(`${BASE}/be_appointments/BA-1778823940645`).get();
  if (appt.exists) {
    const d = appt.data();
    console.log(`  doc.id="${appt.id}"`);
    console.log(`  customerId="${d.customerId}"  customerHN="${d.customerHN}"  customerName="${d.customerName}"`);
    console.log(`  branchId="${d.branchId}"`);
    console.log(`  date="${d.date}"  appointmentDate="${d.appointmentDate}"`);
    console.log(`  startTime="${d.startTime}"  endTime="${d.endTime}"`);
    console.log(`  status="${d.status}"`);
    console.log(`  notifyChannel=${JSON.stringify(d.notifyChannel)}`);
    console.log(`  doctorId="${d.doctorId}"  doctorName="${d.doctorName}"`);
    console.log(`  ALL KEYS: ${Object.keys(d).join(', ')}`);
  } else {
    console.log(`  appointment NOT FOUND`);
  }

  console.log('\n================================================');
  console.log('Search be_customers where customer_code="2853" or hn="2853"');
  console.log('================================================');
  const byHn = await db.collection(`${BASE}/be_customers`).where('hn', '==', '2853').limit(3).get();
  console.log(`  hn='2853' → ${byHn.size} docs`);
  for (const d of byHn.docs) console.log(`    [${d.id}] hn="${d.data().hn}"  branchId="${d.data().branchId}"`);

  const byCode = await db.collection(`${BASE}/be_customers`).where('customerCode', '==', '2853').limit(3).get();
  console.log(`  customerCode='2853' → ${byCode.size} docs`);
  for (const d of byCode.docs) console.log(`    [${d.id}] customerCode="${d.data().customerCode}"  branchId="${d.data().branchId}"`);

  const byCust = await db.collection(`${BASE}/be_customers`).where('customer_code', '==', '2853').limit(3).get();
  console.log(`  customer_code='2853' → ${byCust.size} docs`);
  for (const d of byCust.docs) console.log(`    [${d.id}] customer_code="${d.data().customer_code}"  branchId="${d.data().branchId}"`);

  console.log('\n================================================');
  console.log('VERIFY: For each be_appointment customerId, check be_customers/{customerId} exists?');
  console.log('================================================');
  const sampleAppts = await db.collection(`${BASE}/be_appointments`).limit(20).get();
  let exists = 0, missing = 0;
  for (const a of sampleAppts.docs) {
    const ad = a.data();
    const cid = ad.customerId;
    if (!cid) { missing++; continue; }
    const c = await db.doc(`${BASE}/be_customers/${cid}`).get();
    if (c.exists) exists++;
    else {
      missing++;
      if (missing <= 5) console.log(`    [appt=${a.id}]  customerId="${cid}" → be_customers/${cid} MISSING`);
    }
  }
  console.log(`\n  ${exists}/${sampleAppts.size} appts have valid be_customers/{customerId}; ${missing} MISSING`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
