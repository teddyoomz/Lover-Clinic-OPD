// READ-ONLY (Rule R). node scripts/diag-ed-intake-date-source.mjs [LC-id]
// Q: where is the REAL intake date for the ED round-1 record? Dumps every
// date-ish field on the customer + searches for the originating intake
// opd_session (which DID capture assessmentDate at submit), + samples how
// common patientData.assessmentDate is across customers.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = ['artifacts', APP_ID, 'public', 'data'];
const isDateKey = (k) => /date|At$|At_|created|updated|register|intake|visit|submit|admit/i.test(k);
const show = (v) => v && v.toDate ? v.toDate().toISOString() : JSON.stringify(v);

async function main(cid) {
  const env = Object.fromEntries(readFileSync('.env.local.prod', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
  initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
  const db = getFirestore();

  const cust = await db.doc([...BASE, 'be_customers', cid].join('/')).get();
  if (!cust.exists) { console.log('NOT FOUND', cid); return; }
  const d = cust.data(); const pd = d.patientData || {};
  console.log('=== be_customers/' + cid + ' — date-ish TOP-LEVEL fields ===');
  for (const k of Object.keys(d)) if (isDateKey(k)) console.log('  ', k, '=', show(d[k]));
  console.log('=== patientData — date-ish fields ===');
  for (const k of Object.keys(pd)) if (isDateKey(k)) console.log('  ', k, '=', show(pd[k]));
  console.log('=== possible intake-session references on customer ===');
  for (const k of Object.keys(d)) if (/session|opd|source|origin|fromSession/i.test(k)) console.log('  ', k, '=', show(d[k]));

  // try to find the originating intake opd_session: many flows stamp the session
  // id == nothing on the customer, but the session.patientData may carry the HN
  // or the customer may carry sessionId/sourceSessionId.
  const sref = d.sessionId || d.sourceSessionId || d.opdSessionId || d.fromSessionId || d._perfBackfilledFromSession || (pd && (pd.sessionId || pd.sourceSessionId));
  if (sref) { const mm = /^[A-Z]+-(\d{13})-/.exec(String(sref)); if (mm) console.log('   (session-id timestamp', sref, '→', new Date(Number(mm[1])).toISOString(), ')'); }
  if (sref) {
    const s = await db.doc([...BASE, 'opd_sessions', String(sref)].join('/')).get();
    console.log('=== linked intake opd_session', sref, s.exists ? '(found)' : '(MISSING)', '===');
    if (s.exists) { const sp = s.data().patientData || {}; console.log('   session.patientData.assessmentDate =', JSON.stringify(sp.assessmentDate), '| session.createdAt =', show(s.data().createdAt), '| session.submittedAt =', show(s.data().submittedAt)); }
  } else {
    console.log('=== no session reference field on customer doc ===');
  }

  // how common is patientData.assessmentDate across customers?
  console.log('=== sample 40 customers: patientData.assessmentDate presence ===');
  const samp = await db.collection([...BASE, 'be_customers'].join('/')).limit(40).get();
  let withAD = 0, withCreated = 0;
  for (const c of samp.docs) { const p = c.data().patientData || {}; if (p.assessmentDate) withAD++; if (c.data().createdAt) withCreated++; }
  console.log(`   of ${samp.size}: have patientData.assessmentDate = ${withAD}; have createdAt = ${withCreated}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2] || 'LC-26000082').then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
