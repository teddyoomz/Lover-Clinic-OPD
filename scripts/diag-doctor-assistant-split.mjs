// diag-doctor-assistant-split.mjs (2026-07-24) — Rule R READ-ONLY.
// Verifies the doctor/assistant schedule split against REAL prod data using the
// REAL isDoctorAssistant predicate (not a mirror): (1) be_doctors splits into
// doctors (ตารางแพทย์) vs assistants (ตารางพนักงาน), (2) each assistant's
// normalized staffId = String(doctorId||id) matches its be_staff_schedules
// entries — proving EmployeeSchedulesTab will actually render their schedules.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { isDoctorAssistant } from '../src/lib/staffScheduleValidation.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) return;
  const raw = readFileSync(new URL('../.env.local.prod', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnv();
  if (!getApps().length) initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
  }) });
  const db = getFirestore();

  const docSnap = await db.collection(`${PREFIX}/be_doctors`).get();
  const docs = docSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const doctors = docs.filter(p => !isDoctorAssistant(p));
  const assistants = docs.filter(isDoctorAssistant);

  console.log(`\n① be_doctors (${docs.length}) split by the REAL isDoctorAssistant predicate:`);
  console.log(`   ตารางแพทย์  (doctors)   : ${doctors.length}  → ${doctors.map(d => d.name || d.id).join(', ')}`);
  console.log(`   ตารางพนักงาน (assistants): ${assistants.length}  → ${assistants.map(d => d.name || d.id).join(', ')}`);

  // schedules keyed by staffId (DoctorSchedulesTab convention: doctorId||id)
  const schSnap = await db.collection(`${PREFIX}/be_staff_schedules`).get();
  const byStaffId = new Map();
  for (const s of schSnap.docs) {
    const sid = String(s.data().staffId || '');
    byStaffId.set(sid, (byStaffId.get(sid) || 0) + 1);
  }
  console.log(`\n② be_staff_schedules total: ${schSnap.size}. Assistant normalization check (staffId = doctorId||id):`);
  let ok = true;
  for (const a of assistants) {
    const normalized = String(a.doctorId || a.id);
    const n = byStaffId.get(normalized) || 0;
    console.log(`   ${a.name || a.id}: normalized staffId="${normalized}"  → ${n} schedule entrie(s) resolve`);
    // A doctor tab schedule keyed by a DIFFERENT value (e.g. bare id when doctorId differs) would be the bug.
    const altId = String(a.id);
    if (a.doctorId && byStaffId.get(altId) && altId !== normalized) {
      console.log(`      ⚠ also ${byStaffId.get(altId)} entrie(s) under bare id="${altId}" — verify which the tab used`);
      ok = false;
    }
  }
  console.log(`\n${ok ? '✅' : '⚠'} split + normalization ${ok ? 'consistent' : 'needs a look'} against real prod.\n`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
