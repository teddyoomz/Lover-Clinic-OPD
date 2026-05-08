#!/usr/bin/env node
// V60 / AV32 (2026-05-08) — Rule M one-shot data fix for the
// "ลิ้งตารางที่ลูกค้าได้ไป กดดูอะไรไม่ได้เลย" report.
//
// Symptom: clinic_schedules/{token} doc has noDoctorRequired=false +
// non-empty months[] but doctorDays[] has zero entries inside those
// months. ClinicSchedule.jsx disables every cell → customer can't click.
//
// Root cause: pre-V60 handleGenScheduleLink dumped admin's manual paint
// Set verbatim into doctorDays without intersecting with months. Admin
// who painted prior months but generated a future-month link produced a
// broken doc.
//
// This script:
//   1. Loads target schedule-link doc
//   2. Loads be_staff_schedules for doc.selectedDoctorId in doc.branchId
//   3. Derives doctor working days from canonical source for doc.months
//   4. Filters existing doctorDays to months window + UNIONs with derived
//   5. (--apply) writes back doctorDays, stamps forensic-trail fields,
//      emits audit doc to be_admin_audit
//
// Two-phase: dry-run by default; commits only on `--apply`.
//
// Run dry-run:
//   node --env-file=.env.local.prod scripts/v60-fix-schedule-link-doctor-days.mjs SCH-2f69d853fb
// Commit:
//   node --env-file=.env.local.prod scripts/v60-fix-schedule-link-doctor-days.mjs SCH-2f69d853fb --apply

import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { derivedDoctorDaysFromSchedules } from '../src/lib/staffScheduleValidation.js';

const APP_ID = 'loverclinic-opd-4c39b';

function buildDatesInMonths(months) {
  const out = [];
  for (const mo of months) {
    if (typeof mo !== 'string' || !/^\d{4}-\d{2}$/.test(mo)) continue;
    const [y, m] = mo.split('-').map(Number);
    const daysInMo = new Date(y, m, 0).getDate();
    for (let d = 1; d <= daysInMo; d++) {
      out.push(`${mo}-${String(d).padStart(2, '0')}`);
    }
  }
  return out;
}

async function main() {
  const TOKEN = process.argv[2] || 'SCH-2f69d853fb';
  const APPLY = process.argv.includes('--apply');

  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
  const db = getFirestore();

  const schedRef = db.doc(`artifacts/${APP_ID}/public/data/clinic_schedules/${TOKEN}`);
  const schedSnap = await schedRef.get();
  if (!schedSnap.exists) {
    console.error(`✗ Schedule link not found: ${TOKEN}`);
    process.exit(1);
  }
  const sched = schedSnap.data();

  const months = Array.isArray(sched.months) ? sched.months : [];
  const branchId = sched.branchId || '';
  const doctorId = sched.selectedDoctorId || null;
  const noDoctorRequired = sched.noDoctorRequired === true;
  const priorDoctorDays = Array.isArray(sched.doctorDays) ? sched.doctorDays : [];

  console.log('─'.repeat(60));
  console.log(`V60 data fix — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Token:          ${TOKEN}`);
  console.log(`branchId:       ${branchId}`);
  console.log(`selectedDoctor: ${doctorId} (${sched.selectedDoctorName || ''})`);
  console.log(`months:         ${JSON.stringify(months)}`);
  console.log(`noDoctorRequired: ${noDoctorRequired}`);
  console.log(`prior doctorDays count: ${priorDoctorDays.length}`);
  console.log('─'.repeat(60));

  if (noDoctorRequired) {
    console.log('Skip — noDoctorRequired=true (doctorDays is irrelevant).');
    return;
  }
  if (!doctorId) {
    console.log('Skip — no selectedDoctorId (cannot derive without a specific doctor).');
    return;
  }
  if (months.length === 0) {
    console.log('Skip — no months[] on doc.');
    return;
  }

  // Pull be_staff_schedules for the doctor in this branch.
  const schedulesSnap = await db
    .collection(`artifacts/${APP_ID}/public/data/be_staff_schedules`)
    .where('branchId', '==', branchId)
    .where('staffId', '==', doctorId)
    .get();
  const allEntries = schedulesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`be_staff_schedules entries for doctor: ${allEntries.length}`);

  // Derive working dates from canonical source.
  const datesInRange = buildDatesInMonths(months);
  const derived = derivedDoctorDaysFromSchedules({
    doctorId,
    allEntries,
    datesISO: datesInRange,
  });
  console.log(`Derived doctorDays count: ${derived.length}`);
  if (derived.length > 0 && derived.length <= 30) {
    console.log(`Derived sample: ${JSON.stringify(derived.slice(0, 30))}`);
  }

  // Filter prior to months window + union with derived.
  const monthSet = new Set(months);
  const inMonthsManual = priorDoctorDays.filter(
    (d) => typeof d === 'string' && monthSet.has(d.slice(0, 7)),
  );
  const finalDoctorDays = [...new Set([...derived, ...inMonthsManual])].sort();
  console.log(`Manual paint scoped to months: ${inMonthsManual.length} (dropped ${priorDoctorDays.length - inMonthsManual.length} legacy out-of-range entries)`);
  console.log(`Final doctorDays count (union): ${finalDoctorDays.length}`);

  // Per-month coverage check.
  const monthsWithDays = new Set(finalDoctorDays.map((d) => d.slice(0, 7)));
  const stillMissing = months.filter((m) => !monthsWithDays.has(m));
  if (stillMissing.length > 0) {
    console.warn(`⚠ STILL MISSING coverage for: ${JSON.stringify(stillMissing)}`);
    console.warn('  Doctor has no be_staff_schedules entries that resolve to working days in those months.');
    console.warn('  Admin must add entries before this fix can resolve those months.');
  } else {
    console.log(`✓ All ${months.length} month(s) covered.`);
  }

  // Idempotency check — if final equals prior, nothing to do.
  const priorSorted = [...priorDoctorDays].sort();
  const finalEqualsPrior =
    priorSorted.length === finalDoctorDays.length &&
    priorSorted.every((v, i) => v === finalDoctorDays[i]);
  if (finalEqualsPrior) {
    console.log('Idempotent — final matches prior. No write needed.');
    return;
  }

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to commit.');
    return;
  }

  // Apply: update schedule doc with forensic stamps + audit emit.
  const auditId = `v60-fix-schedule-link-doctor-days-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const auditRef = db.doc(`artifacts/${APP_ID}/public/data/be_admin_audit/${auditId}`);

  const batch = db.batch();
  batch.update(schedRef, {
    doctorDays: finalDoctorDays,
    _v60BackfilledAt: FieldValue.serverTimestamp(),
    _v60LegacyDoctorDays: priorDoctorDays,
  });
  batch.set(auditRef, {
    type: 'v60-fix-schedule-link-doctor-days',
    appliedAt: FieldValue.serverTimestamp(),
    token: TOKEN,
    branchId,
    selectedDoctorId: doctorId,
    months,
    priorDoctorDaysCount: priorDoctorDays.length,
    finalDoctorDaysCount: finalDoctorDays.length,
    derivedFromSchedulesCount: derived.length,
    inMonthsManualCount: inMonthsManual.length,
    stillMissingMonths: stillMissing,
    finalDoctorDays,  // small list — fine to store
  });
  await batch.commit();

  console.log(`\n✓ Applied. Audit doc: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('V60 fix failed:', e.message); process.exit(1); });
}
