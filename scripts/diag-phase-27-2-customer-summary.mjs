// Read-only diagnostic: inspect customer.treatmentSummary for customers with
// treatments. Shows whether new lifecycle fields are present + their values.
// Used to verify Phase 27.2-quater migration result + Phase 27.2-quinquies fix.

import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

async function main() {
  const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!key) { console.error('env not loaded'); process.exit(1); }
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: key,
    }),
  });
  const db = getFirestore();

  // Find customers that have treatments
  const treatmentSnap = await db.collection(`${PREFIX}/be_treatments`).get();
  const customerIds = new Set();
  treatmentSnap.forEach((d) => { const cid = d.data().customerId; if (cid) customerIds.add(cid); });
  console.log(`Customers with treatments: ${customerIds.size}`);

  for (const cid of customerIds) {
    const doc = await db.doc(`${PREFIX}/be_customers/${cid}`).get();
    if (!doc.exists) { console.log(`  ${cid}: doc not found`); continue; }
    const data = doc.data();
    const summary = data.treatmentSummary || [];
    console.log(`\n=== ${cid} ${data.patientData?.firstName || '?'} ===`);
    console.log(`  treatmentSummary.length = ${summary.length}`);
    if (summary.length > 0) {
      const s0 = summary[0];
      const keys = Object.keys(s0).sort();
      console.log(`  keys on summary[0]: ${keys.join(', ')}`);
      const lifecycleFields = ['vitalsignsRecordedAt', 'doctorRecordedAt', 'completedAt', 'editedAt', 'recordedAt', 'createdAt'];
      for (const f of lifecycleFields) {
        const v = s0[f];
        const t = v == null ? 'null'
          : (typeof v === 'object' && v._seconds) ? `Timestamp(${v._seconds})`
          : (v.toDate ? `Timestamp(${v.toDate().toISOString()})` : typeof v);
        console.log(`    ${f}: ${t}`);
      }
      console.log(`    status: ${s0.status}`);
      console.log(`    editedByName: ${s0.editedByName || '(empty)'}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
