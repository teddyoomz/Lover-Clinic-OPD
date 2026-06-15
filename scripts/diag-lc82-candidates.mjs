// ─── diag-lc82-candidates.mjs — READ-ONLY (Rule R) ──────────────────────────
// Surface the candidate opd_sessions that STRONG-match LC-26000082 (the AV194
// ambiguous-backfill customer) + each session's perf answers + computed
// ADAM/IIEF/MRS, so the user can pick which session is the true one to backfill.
// No writes, no mutation. Reuses the REAL scoring + field-pick helpers.
//
// Usage: node scripts/diag-lc82-candidates.mjs [customerId]   (default LC-26000082)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const CUST_ID = process.argv[2] || 'LC-26000082';

function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^"|"$/g, ''); } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const importLib = (rel) => import(pathToFileURL(path.resolve(process.cwd(), rel)).href);

// ── strongMatch — copied verbatim from backfill-perf-assessment.mjs (one-shot diag) ──
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const nameKey = (f, l) => `${String(f ?? '').trim()}|${String(l ?? '').trim()}`;
const phoneKey = (v) => { const d = digits(v); return d ? d.slice(-9) : ''; };
function strongMatch(cust, sess) {
  const cpd = cust.patientData || {}; const spd = sess.patientData || {};
  const cNid = digits(cust.citizen_id || cust.passport_id || cpd.nationalId || cpd.passport);
  const sNid = digits(spd.idCard || spd.nationalId || spd.passport);
  if (cNid && sNid && cNid === sNid) return 'national-id';
  const cName = nameKey(cpd.firstName || cust.firstname, cpd.lastName || cust.lastname);
  const sName = nameKey(spd.firstName, spd.lastName);
  const cPhone = phoneKey(cust.telephone_number || cpd.phone);
  const sPhone = phoneKey(spd.phone);
  if (cName !== '|' && cName === sName && cPhone && cPhone === sPhone) return 'name+phone';
  return null;
}

async function main() {
  const db = initAdmin();
  const data = base(db);
  const { pickKioskAssessmentFields } = await importLib('src/lib/kioskAssessmentFields.js');
  const { calculateADAM, calculateIIEFScore, calculateMRS, getIIEFInterpretation } = await importLib('src/utils.js');

  const custDoc = await data.collection('be_customers').doc(CUST_ID).get();
  if (!custDoc.exists) { console.log(`✗ be_customers/${CUST_ID} NOT FOUND`); return; }
  const cust = custDoc.data(); const cpd = cust.patientData || {};
  const curPerf = pickKioskAssessmentFields(cpd);
  console.log(`═══ ${CUST_ID} — candidate sessions for perf backfill ═══`);
  console.log(`customer: "${cpd.firstName || cust.firstname || ''} ${cpd.lastName || cust.lastname || ''}".trim`);
  console.log(`  phone=${phoneKey(cust.telephone_number || cpd.phone)} nid=${digits(cust.citizen_id || cpd.nationalId) || '-'}`);
  console.log(`  customer doc CURRENTLY carries perf: ${Object.keys(curPerf).length ? JSON.stringify(curPerf) : 'NONE (skipped by backfill)'}`);
  console.log(`  _perfBackfilledAt: ${cust._perfBackfilledAt ? 'YES (already healed)' : 'no'}\n`);

  const sessSnap = await data.collection('opd_sessions').get();
  const matches = [];
  for (const d of sessSnap.docs) {
    const s = d.data();
    const basis = strongMatch(cust, s);
    if (!basis) continue;
    const perf = pickKioskAssessmentFields(s.patientData || {});
    matches.push({ id: d.id, s, perf, basis });
  }
  console.log(`opd_sessions scanned: ${sessSnap.size}; strong-matches to ${CUST_ID}: ${matches.length}\n`);

  matches.sort((a, b) => (b.s.submittedAt?.toMillis?.() || 0) - (a.s.submittedAt?.toMillis?.() || 0));
  for (const m of matches) {
    const pd = m.s.patientData || {};
    const ft = String(m.s.formType || m.s.sessionType || 'intake');
    const ts = m.s.submittedAt?.toDate?.() || m.s.updatedAt?.toDate?.();
    const meaningful = Object.keys(m.perf).length > 0;
    console.log(`── opd_sessions/${m.id}`);
    console.log(`     formType=${ft}  ${ft.startsWith('followup') ? '(followup)' : '(INTAKE)'}  submittedAt=${ts ? ts.toISOString() : '-'}  match=${m.basis}`);
    console.log(`     meaningful perf: ${meaningful ? 'YES' : 'NO (default/blank → backfill would skip)'}`);
    if (meaningful) {
      const adam = calculateADAM(pd);
      const iief = calculateIIEFScore(pd);
      const mrs = calculateMRS(pd);
      console.log(`       ADAM : ${adam.total}/10 — ${adam.positive ? 'Positive' : 'Negative'}  (adam_1=${!!pd.adam_1} adam_7=${!!pd.adam_7})`);
      console.log(`       IIEF : ${iief}/25 — ${getIIEFInterpretation(iief).text}`);
      console.log(`       MRS  : ${mrs.score}/44 — ${mrs.text}`);
      console.log(`       fields: ${JSON.stringify(m.perf)}`);
    }
    console.log('');
  }
  console.log(`To backfill from a chosen session, I'll add a --from-session <id> targeted apply (Rule M two-phase).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
