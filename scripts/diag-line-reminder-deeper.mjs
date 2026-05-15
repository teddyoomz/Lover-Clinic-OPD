// Deeper Rule R diag — find customer 000004 + tomorrow appts + branch field shape

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
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
  console.log('PHASE A — be_branches FULL DATA dump');
  console.log('================================================');
  const branchesSnap = await db.collection(`${BASE}/be_branches`).get();
  for (const b of branchesSnap.docs) {
    console.log(`\n  doc.id=${b.id}`);
    console.log(`  data=`, JSON.stringify(b.data(), null, 2));
  }

  console.log('\n================================================');
  console.log('PHASE B — find customer 000004 (try multiple ID shapes)');
  console.log('================================================');
  const tries = ['000004', '4', 'LC-26000004', 'LC26000004'];
  for (const id of tries) {
    const s = await db.doc(`${BASE}/be_customers/${id}`).get();
    console.log(`  be_customers/${id} → exists=${s.exists}`);
  }
  // Also search by patientData fields
  const byHn = await db.collection(`${BASE}/be_customers`).where('hn', '==', '000004').limit(5).get();
  console.log(`\n  query be_customers where hn='000004' → ${byHn.size} docs`);
  for (const d of byHn.docs) console.log(`    [${d.id}] hn="${d.data().hn}" name="${d.data().name || d.data().patientData?.firstNameTh || '?'}"`);

  const byHnNum = await db.collection(`${BASE}/be_customers`).where('hn', '==', 4).limit(5).get();
  console.log(`\n  query be_customers where hn=4 (number) → ${byHnNum.size} docs`);
  for (const d of byHnNum.docs) console.log(`    [${d.id}] hn=${d.data().hn} name="${d.data().name || d.data().patientData?.firstNameTh || '?'}"`);

  // Try 'patientData.idNumber' or 'patientData.phone' from customer card
  const byPhone = await db.collection(`${BASE}/be_customers`).where('phoneNumber', '==', '0812345678').limit(5).get();
  console.log(`\n  query be_customers where phoneNumber='0812345678' → ${byPhone.size} docs`);
  for (const d of byPhone.docs) {
    const data = d.data();
    console.log(`    [${d.id}] phoneNumber="${data.phoneNumber}" hn="${data.hn}" branchId="${data.branchId}"`);
    console.log(`      lineUserId="${data.lineUserId || ''}"  lineUserId_byBranch=${JSON.stringify(data.lineUserId_byBranch || null)}`);
  }

  // List first 5 be_customers to understand ID/hn format
  console.log('\n  --- first 5 be_customers (any) ---');
  const sample = await db.collection(`${BASE}/be_customers`).limit(5).get();
  console.log(`  total sampled: ${sample.size}`);
  for (const d of sample.docs) {
    const data = d.data();
    console.log(`    [${d.id}] hn="${data.hn}" branchId="${data.branchId}"`);
  }

  console.log('\n================================================');
  console.log('PHASE C — be_appointments for 2026-05-16 (tomorrow)');
  console.log('================================================');
  const target = '2026-05-16';
  const apptsTomorrow = await db.collection(`${BASE}/be_appointments`)
    .where('appointmentDate', '==', target)
    .get();
  console.log(`  Total appts on ${target}: ${apptsTomorrow.size}`);
  for (const a of apptsTomorrow.docs) {
    const d = a.data();
    console.log(`    [${a.id}] customerId="${d.customerId}" branchId="${d.branchId}" startTime="${d.startTime}" status="${d.status}" notifyChannel=${JSON.stringify(d.notifyChannel)}`);
  }

  // Also try date format variation
  console.log(`\n  query date='${target.replace(/-/g, '/')}'  (slash format)`);
  const apptsSlash = await db.collection(`${BASE}/be_appointments`)
    .where('appointmentDate', '==', target.replace(/-/g, '/'))
    .get();
  console.log(`  → ${apptsSlash.size} docs`);

  // Try different field name
  console.log(`\n  query field='date' value='${target}'`);
  const apptsByDate = await db.collection(`${BASE}/be_appointments`)
    .where('date', '==', target)
    .get();
  console.log(`  → ${apptsByDate.size} docs`);

  console.log('\n================================================');
  console.log('PHASE D — sample 5 recent be_appointments to learn shape');
  console.log('================================================');
  const sampleAppts = await db.collection(`${BASE}/be_appointments`).limit(5).get();
  for (const d of sampleAppts.docs) {
    const data = d.data();
    console.log(`\n  [${d.id}] keys=${Object.keys(data).join(', ')}`);
    console.log(`    customerId="${data.customerId}" branchId="${data.branchId}"`);
    console.log(`    appointmentDate="${data.appointmentDate}" date="${data.date}"`);
    console.log(`    startTime="${data.startTime}" endTime="${data.endTime}"`);
    console.log(`    status="${data.status}" notifyChannel=${JSON.stringify(data.notifyChannel)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
