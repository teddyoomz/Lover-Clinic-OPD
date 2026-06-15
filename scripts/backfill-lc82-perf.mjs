// ─── backfill-lc82-perf.mjs — Rule M two-phase, manual-resolution heal ──────
// LC-26000082 (ณรงศักดิ์ เอี่ยมรอด) was SKIPPED by backfill-perf-assessment.mjs
// because 2 INTAKE sessions strong-matched (national-id) with DIFFERENT ADAM
// answers (ambiguity guard — never guess). User reviewed both + picked the
// later 12:07 session. This heals just that one customer from the chosen
// session, mirroring the canonical backfill's surgical dotted-path + forensic
// + audit shape. Idempotent. Dry-run by default; --apply commits.
//
// Usage: node scripts/backfill-lc82-perf.mjs [--apply]

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
const CUST_ID = 'LC-26000082';
const FROM_SESSION = 'BL-1779253531712-65203b17'; // user-picked: later intake, ADAM 4/10
const REJECTED_SESSION = 'BL-1779251942561-d529788b'; // recorded for audit forensics

function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^"|"$/g, ''); } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const importLib = (rel) => import(pathToFileURL(path.resolve(process.cwd(), rel)).href);
const digits = (v) => String(v ?? '').replace(/\D/g, '');

async function main() {
  const db = initAdmin();
  const data = base(db);
  const { pickKioskAssessmentFields } = await importLib('src/lib/kioskAssessmentFields.js');
  console.log(`═══ backfill-lc82-perf — ${APPLY ? 'APPLY (will write)' : 'DRY-RUN (no writes)'} ═══\n`);

  const custDoc = await data.collection('be_customers').doc(CUST_ID).get();
  const sessDoc = await data.collection('opd_sessions').doc(FROM_SESSION).get();
  if (!custDoc.exists) { console.log(`✗ be_customers/${CUST_ID} not found — abort`); return; }
  if (!sessDoc.exists) { console.log(`✗ opd_sessions/${FROM_SESSION} not found — abort`); return; }

  const cust = custDoc.data(); const cpd = cust.patientData || {};
  const sess = sessDoc.data(); const spd = sess.patientData || {};

  // Idempotent guard.
  if (Object.keys(pickKioskAssessmentFields(cpd)).length > 0 || cust._perfBackfilledAt) {
    console.log(`✓ ${CUST_ID} already carries perf or is stamped — nothing to do (idempotent).`); return;
  }
  // Safety: re-verify national-id match (the basis the user resolved on).
  const cNid = digits(cust.citizen_id || cpd.nationalId || cpd.passport);
  const sNid = digits(spd.idCard || spd.nationalId || spd.passport);
  if (!cNid || cNid !== sNid) { console.log(`✗ national-id mismatch (cust=${cNid || '-'} sess=${sNid || '-'}) — abort, will NOT mis-attribute`); return; }

  const perf = pickKioskAssessmentFields(spd);
  if (Object.keys(perf).length === 0) { console.log(`✗ chosen session has no meaningful perf — abort`); return; }

  console.log(`customer : ${CUST_ID} "${cpd.firstName || ''} ${cpd.lastName || ''}".trim  nid=${cNid}`);
  console.log(`from     : opd_sessions/${FROM_SESSION} (national-id match)`);
  console.log(`perf     : ${JSON.stringify(perf)}`);
  console.log(`patch    : ${Object.keys(perf).map((k) => `patientData.${k}`).join(', ')} + _perfBackfilled* forensic\n`);

  if (!APPLY) { console.log(`═══ DRY-RUN — would write 1 customer + 1 audit doc ═══`); return; }

  const patch = {};
  for (const [k, v] of Object.entries(perf)) patch[`patientData.${k}`] = v;
  patch._perfBackfilledAt = FieldValue.serverTimestamp();
  patch._perfBackfilledFromSession = FROM_SESSION;
  patch._perfBackfilledFields = Object.keys(perf);
  patch._perfBackfilledManualResolution = true; // ambiguity resolved by user pick
  await data.collection('be_customers').doc(CUST_ID).update(patch);

  const auditId = `backfill-lc82-perf-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    op: 'backfill-lc82-perf-manual-resolution',
    customer: CUST_ID,
    fromSession: FROM_SESSION,
    rejectedSession: REJECTED_SESSION,
    basis: 'national-id',
    fields: Object.keys(perf),
    perf,
    resolvedBy: 'user-pick (2 ambiguous intake sessions)',
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`✓ APPLIED — ${CUST_ID} backfilled from ${FROM_SESSION}. audit: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
