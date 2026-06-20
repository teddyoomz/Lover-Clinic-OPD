#!/usr/bin/env node
// Rule R diag (READ-ONLY) — AV198 staff-chat System cards. Confirm the opd_session
// doc the Cloud Function reads carries a root `branchId` (for card routing) and that
// registered intakes are stamped `brokerProClinicId` (the intake live-resolve key).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) });
  const db = getFirestore();

  // Latest ~40 sessions by submittedAt (fall back to a plain get if no index).
  let docs = [];
  try {
    const snap = await db.collection(`${PREFIX}/opd_sessions`).orderBy('submittedAt', 'desc').limit(40).get();
    docs = snap.docs;
  } catch {
    const snap = await db.collection(`${PREFIX}/opd_sessions`).limit(60).get();
    docs = snap.docs;
  }
  console.log(`Read ${docs.length} opd_sessions\n`);

  const stat = { intake: { n: 0, withBranch: 0, withBroker: 0 }, followup: { n: 0, withBranch: 0 }, edit: 0 };
  const sample = [];
  for (const d of docs) {
    const s = d.data();
    const isEdit = !!s.updatedAt;
    const kind = s.linkedCustomerId ? 'followup' : 'intake';
    if (isEdit) stat.edit++;
    if (kind === 'intake') { stat.intake.n++; if (s.branchId) stat.intake.withBranch++; if (s.brokerProClinicId) stat.intake.withBroker++; }
    else { stat.followup.n++; if (s.branchId) stat.followup.withBranch++; }
    if (sample.length < 12) sample.push({ id: d.id, formType: s.formType, kind, isEdit, branchId: s.branchId || '(none)', linkedCustomerId: s.linkedCustomerId || '', brokerProClinicId: s.brokerProClinicId || '', status: s.status });
  }
  console.log('Sample:'); for (const x of sample) console.log('  ' + JSON.stringify(x));
  console.log('\nStats:', JSON.stringify(stat, null, 2));
  console.log('\nVERDICT:');
  console.log(`  intake sessions carry root branchId: ${stat.intake.withBranch}/${stat.intake.n}`);
  console.log(`  follow-up sessions carry root branchId: ${stat.followup.withBranch}/${stat.followup.n}`);
  console.log(`  registered intakes stamped brokerProClinicId: ${stat.intake.withBroker}/${stat.intake.n}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
