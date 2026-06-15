// READ-ONLY (Rule R). node scripts/diag-ed-followup-data-reality.mjs [LC-id]
// Confirms: (a) saved customer patientData.assessmentDate presence (R4 intake date),
//           (b) any stray pending follow-up sessions for the customer (R3).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = ['artifacts', APP_ID, 'public', 'data'];

async function main(cid) {
  const env = Object.fromEntries(
    readFileSync('.env.local.prod', 'utf8').split('\n').filter((l) => l.includes('='))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }),
  );
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
  const db = getFirestore();
  const cust = await db.doc([...BASE, 'be_customers', cid].join('/')).get();
  if (!cust.exists) { console.log('CUSTOMER NOT FOUND:', cid); return; }
  const d = cust.data();
  const pd = d.patientData || {};
  console.log('=== R4 intake-date source ===');
  console.log('patientData.assessmentDate =', JSON.stringify(pd.assessmentDate));
  console.log('createdAt                  =', d.createdAt?.toDate?.()?.toISOString?.() || JSON.stringify(d.createdAt));
  console.log('phone (pd/top)             =', JSON.stringify(pd.phone || d.phone));
  console.log('name parts                 =', JSON.stringify({ prefix: pd.prefix, firstName: pd.firstName, lastName: pd.lastName, age: pd.age }));
  console.log('=== R3 linked follow-up sessions ===');
  const sess = await db.collection([...BASE, 'opd_sessions'].join('/')).where('linkedCustomerId', '==', cid).get();
  if (sess.empty) console.log('(none — single-field where(linkedCustomerId) returned 0)');
  for (const s of sess.docs) {
    const sd = s.data();
    console.log(' ', s.id, '| status=' + sd.status, '| formType=' + sd.formType, '| branchId=' + sd.branchId, '| roundId=' + sd.linkedAssessmentRoundId);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2] || 'LC-26000082').then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
