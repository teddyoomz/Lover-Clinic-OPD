// Rule R read-only diagnostic for "ยิงไม่ได้ซักอัน" bug.
// Investigates: customer 000004 + tomorrow's appt + branches + line_configs.
//
// Run: node scripts/diag-line-reminder-customer-000004.mjs

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

// Manual .env.local.prod parser (project doesn't have dotenv as direct dep)
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
  console.log('PHASE 1 — be_branches collection (all docs)');
  console.log('================================================');
  const branchesSnap = await db.collection(`${BASE}/be_branches`).get();
  console.log(`Total branches: ${branchesSnap.size}`);
  for (const b of branchesSnap.docs) {
    const data = b.data();
    console.log(`  doc.id="${b.id}"  data.branchName="${data.branchName || '(unset)'}"  data.branchId="${data.branchId || '(unset)'}"  hasLineRem=${typeof data.lineReminder !== 'undefined'}`);
  }

  console.log('\n================================================');
  console.log('PHASE 2 — be_line_configs collection (all docs)');
  console.log('================================================');
  const cfgsSnap = await db.collection(`${BASE}/be_line_configs`).get();
  console.log(`Total line_configs: ${cfgsSnap.size}`);
  for (const c of cfgsSnap.docs) {
    const data = c.data();
    console.log(`  doc.id="${c.id}"`);
    console.log(`    enabled=${data.enabled}  hasToken=${!!data.channelAccessToken}  botBasicId="${data.botBasicId || ''}"`);
    if (data.lineReminder) {
      console.log(`    lineReminder.enabled=${data.lineReminder.enabled}`);
      console.log(`    lineReminder.dayBeforeHour=${data.lineReminder.dayBeforeHour}`);
      console.log(`    lineReminder.dayOfHour=${data.lineReminder.dayOfHour}`);
      console.log(`    lineReminder.quietHourStart=${data.lineReminder.quietHourStart}, end=${data.lineReminder.quietHourEnd}`);
    } else {
      console.log(`    lineReminder=<UNSET>`);
    }
  }

  console.log('\n================================================');
  console.log('PHASE 3 — be_customers/000004 full doc');
  console.log('================================================');
  const custSnap = await db.doc(`${BASE}/be_customers/000004`).get();
  if (!custSnap.exists) {
    console.log('CUSTOMER 000004 NOT FOUND in be_customers — aborting');
    return;
  }
  const cust = custSnap.data();
  console.log(`  doc.id="${custSnap.id}"`);
  console.log(`  cust.branchId="${cust.branchId || '(unset)'}"`);
  console.log(`  cust.lineUserId="${cust.lineUserId || '(unset)'}" type=${typeof cust.lineUserId}`);
  console.log(`  cust._lineStale=${cust._lineStale}`);
  console.log(`  cust.lineLinkedAt=${cust.lineLinkedAt || '(unset)'}`);
  console.log(`  cust.notifyOptOut=${cust.notifyOptOut}`);
  if (cust.lineUserId_byBranch) {
    console.log(`  cust.lineUserId_byBranch:`);
    for (const [k, v] of Object.entries(cust.lineUserId_byBranch)) {
      console.log(`    [${k}] = ${JSON.stringify(v)}`);
    }
  } else {
    console.log(`  cust.lineUserId_byBranch=<UNSET — backward-compat path required>`);
  }

  console.log('\n================================================');
  console.log('PHASE 4 — be_appointments for customer 000004 (recent)');
  console.log('================================================');
  // Two queries (don't know exact field shape):
  const apptsByCustomer = await db.collection(`${BASE}/be_appointments`)
    .where('customerId', '==', '000004').get();
  console.log(`Total appointments for customer 000004: ${apptsByCustomer.size}`);
  // sort by appointmentDate desc, take 10
  const sorted = apptsByCustomer.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.appointmentDate || '').localeCompare(String(a.appointmentDate || '')))
    .slice(0, 10);
  for (const a of sorted) {
    console.log(`  doc.id="${a.id}"  appointmentDate="${a.appointmentDate}"  startTime="${a.startTime}"  branchId="${a.branchId}"  status="${a.status}"  notifyChannel=${JSON.stringify(a.notifyChannel)}`);
  }

  console.log('\n================================================');
  console.log('PHASE 5 — Tomorrow target date computation');
  console.log('================================================');
  const now = new Date();
  const bkkMs = now.getTime() + 7 * 60 * 60 * 1000;
  const dayBefore = new Date(bkkMs + 24 * 60 * 60 * 1000);
  const dayOf = new Date(bkkMs);
  const fmt = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  console.log(`  Now (UTC): ${now.toISOString()}`);
  console.log(`  dayBefore target = ${fmt(dayBefore)}  (debug-fire/cron query value)`);
  console.log(`  dayOf target = ${fmt(dayOf)}  (debug-fire/cron query value)`);

  console.log('\n================================================');
  console.log('PHASE 6 — Cross-check: dayBefore appts at branch from customer.branchId');
  console.log('================================================');
  if (!cust.branchId) {
    console.log('  customer has no branchId field — cannot cross-check');
  } else {
    const target = fmt(dayBefore);
    const appts = await db.collection(`${BASE}/be_appointments`)
      .where('branchId', '==', cust.branchId)
      .where('appointmentDate', '==', target)
      .get();
    console.log(`  Query: branchId="${cust.branchId}" AND appointmentDate="${target}"`);
    console.log(`  Result: ${appts.size} appointments`);
    for (const a of appts.docs) {
      const d = a.data();
      console.log(`    [${a.id}] customerId="${d.customerId}" status="${d.status}" startTime="${d.startTime}" notifyChannel=${JSON.stringify(d.notifyChannel)}`);
    }
  }

  console.log('\n================================================');
  console.log('PHASE 7 — getCustomerLineUserIdAtBranch simulation');
  console.log('================================================');
  function getCustomerLineUserIdAtBranch(customer, branchId) {
    if (!customer || !branchId) return null;
    const branchLink = customer.lineUserId_byBranch?.[branchId];
    if (branchLink && branchLink.lineUserId && branchLink._lineStale !== true) {
      return branchLink.lineUserId;
    }
    if (customer.branchId === branchId && customer.lineUserId && customer._lineStale !== true) {
      return customer.lineUserId;
    }
    return null;
  }
  // Try resolving against EVERY branch in be_branches
  for (const b of branchesSnap.docs) {
    const resolved = getCustomerLineUserIdAtBranch(cust, b.id);
    console.log(`  branchId="${b.id}" → lineUserId=${resolved || 'NULL'}  (cust.branchId match? ${cust.branchId === b.id})`);
  }

  console.log('\n================================================');
  console.log('SUMMARY');
  console.log('================================================');
  console.log('Look for these patterns:');
  console.log('1. customer.branchId === be_branches doc.id of admin-selected branch?');
  console.log('2. appointment.branchId === be_branches doc.id?');
  console.log('3. be_line_configs has doc with same id as be_branches doc.id?');
  console.log('4. lineUserId resolves at admin-selected branch?');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
