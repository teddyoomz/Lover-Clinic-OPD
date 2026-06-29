#!/usr/bin/env node
// V164-fix VERIFY (READ-ONLY, Rule Q L2): import the REAL helper
// deriveWorkingDoctorShiftsForDate from src + run it against REAL prod
// be_staff_schedules for TODAY (Bangkok). Asserts the doctor the OLD inline
// filter dropped (per-date type='work') is now returned.
//
// Run: node --env-file=.env.local.prod scripts/diag-v164-verify-fix.mjs

import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { deriveWorkingDoctorShiftsForDate } from '../src/lib/staffScheduleValidation.js';

const APP_ID = 'loverclinic-opd-4c39b';
const pad = (n) => String(n).padStart(2, '0');

function bangkokToday() {
  const bd = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${bd.getUTCFullYear()}-${pad(bd.getUTCMonth() + 1)}-${pad(bd.getUTCDate())}`;
}

async function main() {
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) });
  const db = getFirestore();
  const base = `artifacts/${APP_ID}/public/data`;
  const [schedSnap, docSnap, brSnap] = await Promise.all([
    db.collection(`${base}/be_staff_schedules`).get(),
    db.collection(`${base}/be_doctors`).get(),
    db.collection(`${base}/be_branches`).get(),
  ]);
  const schedules = schedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const doctors = docSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const branches = brSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const targetISO = bangkokToday();
  const dname = (sid) => doctors.find(d => String(d.id) === String(sid))?.name || sid;

  console.log(`\n=== V164-fix verify — TODAY ${targetISO} (real helper + real prod data) ===\n`);
  let totalShifts = 0;
  for (const b of branches) {
    const branchSched = schedules.filter(e => e.branchId === b.id);
    const doctorIds = doctors.map(d => String(d.id)); // membership = role; helper filters by id
    const shifts = deriveWorkingDoctorShiftsForDate({ scheduleEntries: branchSched, doctorIds, targetISO });
    console.log(`── ${b.name}: ${shifts.length} doctor(s) working today`);
    for (const s of shifts) { console.log(`     • ${dname(s.staffId)}  ${s.startTime}-${s.endTime}`); totalShifts++; }
  }
  console.log(`\nTOTAL doctor-shifts today (across branches): ${totalShifts}`);
  console.log(totalShifts > 0
    ? '✓ helper returns working doctors (the OLD inline filter returned 0 for these per-date \"work\" shifts)'
    : 'ℹ no doctor working today in any branch (check the date)');
  console.log('\n=== done (read-only) ===');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('Verify failed:', e.message); process.exit(1); });
}
