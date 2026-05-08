#!/usr/bin/env node
// V62 / AV34 (2026-05-08) — Rule M one-shot data fix for
// SCH-9c201860e1 (and any other in-the-wild link with empty doctorDays
// despite showDoctorStatus=true OR clinic-hours-as-doctor-hours fallback).
//
// Bug: pre-V62 handleGenScheduleLink only derived doctorDays when admin
// picked a SPECIFIC doctor. For ไม่พบแพทย์ links + showDoctorStatus=true
// (the user's case — shockwave-room link with doctor-availability
// overlay), doctorDays was saved as empty → 🔥 emoji never rendered +
// isSlotWithinDoctorHours always returned false → customer never saw
// "หมอว่าง / หมอไม่ว่าง" overlay.
//
// Fix data shape:
// 1. Recompute doctorDays from be_staff_schedules for the link's
//    branchId + months window (multi-doctor for noDoctor mode; specific
//    doctor for พบแพทย์ specific). Mirrors V62 handleGenScheduleLink fix.
// 2. Recompute customDoctorHours map per-date (replaces clinic-hours
//    fallback with actual doctor hours).
// 3. Forensic-trail: _v62BackfilledAt + _v62LegacyDoctorDays + _v62LegacyCustomDoctorHours.
//
// Two-phase: dry-run by default; commits only on `--apply`.
//
// Run dry-run:
//   node --env-file=.env.local.prod scripts/v62-fix-schedule-link-doctor-data.mjs SCH-9c201860e1
// Commit:
//   node --env-file=.env.local.prod scripts/v62-fix-schedule-link-doctor-data.mjs SCH-9c201860e1 --apply

import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import {
  derivedDoctorDaysAcrossWindow,
  derivedDoctorWorkingHoursPerDate,
} from '../src/lib/staffScheduleValidation.js';

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
  const TOKEN = process.argv[2] || 'SCH-9c201860e1';
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
  const priorCustomDoctorHours = sched.customDoctorHours || {};

  console.log('─'.repeat(60));
  console.log(`V62 data fix — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Token:               ${TOKEN}`);
  console.log(`branchId:            ${branchId}`);
  console.log(`selectedDoctor:      ${doctorId || '(all doctors)'} (${sched.selectedDoctorName || ''})`);
  console.log(`months:              ${JSON.stringify(months)}`);
  console.log(`noDoctorRequired:    ${noDoctorRequired}`);
  console.log(`showDoctorStatus:    ${sched.showDoctorStatus === true}`);
  console.log(`prior doctorDays:    ${priorDoctorDays.length}`);
  console.log(`prior customDoctorHours keys: ${Object.keys(priorCustomDoctorHours).length}`);
  console.log('─'.repeat(60));

  if (months.length === 0) {
    console.log('Skip — no months[] on doc.');
    return;
  }
  if (!branchId) {
    console.log('Skip — no branchId on doc (legacy pre-Phase-22.0c).');
    return;
  }

  // For noDoctor mode: aggregate ALL branch doctors' entries.
  // For specific-doctor mode: just that doctor's entries.
  const queryConstraints = [['branchId', '==', branchId]];
  if (doctorId) queryConstraints.push(['staffId', '==', doctorId]);

  let q = db.collection(`artifacts/${APP_ID}/public/data/be_staff_schedules`);
  for (const [field, op, val] of queryConstraints) {
    q = q.where(field, op, val);
  }
  const schedulesSnap = await q.get();
  const allEntries = schedulesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`be_staff_schedules entries: ${allEntries.length}`);
  console.log(`Distinct doctors in entries: ${[...new Set(allEntries.map(e => e.staffId))].length}`);

  // Derive V62 data
  const datesInRange = buildDatesInMonths(months);
  const doctorIdsForDerivation = doctorId ? [doctorId] : null;
  const v62DoctorDays = derivedDoctorDaysAcrossWindow({
    doctorIds: doctorIdsForDerivation,
    allEntries,
    datesISO: datesInRange,
  });
  const v62Hours = derivedDoctorWorkingHoursPerDate({
    doctorIds: doctorIdsForDerivation,
    allEntries,
    datesISO: datesInRange,
  });
  console.log(`V62 derived doctorDays: ${v62DoctorDays.length}`);
  if (v62DoctorDays.length > 0 && v62DoctorDays.length <= 30) {
    console.log(`  sample: ${JSON.stringify(v62DoctorDays.slice(0, 18))}`);
  }
  console.log(`V62 derived customDoctorHours keys: ${Object.keys(v62Hours).length}`);
  if (Object.keys(v62Hours).length > 0) {
    const firstKey = Object.keys(v62Hours).sort()[0];
    console.log(`  sample: ${firstKey} → ${JSON.stringify(v62Hours[firstKey])}`);
  }

  // Final: union with prior doctorDays (preserve admin's manual paint
  // scoped to months); merge customDoctorHours with admin overrides
  // winning (mirrors V62 handleGenScheduleLink behavior).
  const monthSet = new Set(months);
  const inMonthsPrior = priorDoctorDays.filter(d => typeof d === 'string' && monthSet.has(d.slice(0, 7)));
  const finalDoctorDays = [...new Set([...v62DoctorDays, ...inMonthsPrior])].sort();
  const finalCustomDoctorHours = { ...v62Hours, ...priorCustomDoctorHours };

  console.log(`Final doctorDays: ${finalDoctorDays.length} (${finalDoctorDays.length - v62DoctorDays.length} from prior manual paint scoped to months)`);
  console.log(`Final customDoctorHours keys: ${Object.keys(finalCustomDoctorHours).length}`);

  // Idempotency check
  const priorSorted = [...priorDoctorDays].sort();
  const hoursDiff = JSON.stringify(finalCustomDoctorHours) !== JSON.stringify(priorCustomDoctorHours);
  const daysDiff = priorSorted.length !== finalDoctorDays.length || priorSorted.some((v, i) => v !== finalDoctorDays[i]);
  if (!daysDiff && !hoursDiff) {
    console.log('Idempotent — final matches prior. No write needed.');
    return;
  }

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to commit.');
    return;
  }

  // Apply: update schedule doc with forensic stamps + audit emit.
  const auditId = `v62-fix-schedule-link-doctor-data-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const auditRef = db.doc(`artifacts/${APP_ID}/public/data/be_admin_audit/${auditId}`);

  const batch = db.batch();
  batch.update(schedRef, {
    doctorDays: finalDoctorDays,
    customDoctorHours: finalCustomDoctorHours,
    _v62BackfilledAt: FieldValue.serverTimestamp(),
    _v62LegacyDoctorDays: priorDoctorDays,
    _v62LegacyCustomDoctorHours: priorCustomDoctorHours,
  });
  batch.set(auditRef, {
    type: 'v62-fix-schedule-link-doctor-data',
    appliedAt: FieldValue.serverTimestamp(),
    token: TOKEN,
    branchId,
    selectedDoctorId: doctorId,
    noDoctorRequired,
    months,
    priorDoctorDaysCount: priorDoctorDays.length,
    finalDoctorDaysCount: finalDoctorDays.length,
    priorCustomDoctorHoursKeys: Object.keys(priorCustomDoctorHours),
    finalCustomDoctorHoursKeys: Object.keys(finalCustomDoctorHours),
    derivedFromSchedulesCount: v62DoctorDays.length,
    finalDoctorDays,
  });
  await batch.commit();

  console.log(`\n✓ Applied. Audit doc: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('V62 fix failed:', e.message); process.exit(1); });
}
