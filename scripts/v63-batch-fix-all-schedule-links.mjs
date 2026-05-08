#!/usr/bin/env node
// V63 batch fix — apply V62 doctorDays + customDoctorHours derivation
// to ALL in-the-wild clinic_schedules docs. Idempotent (same canonical
// derive-and-merge logic as scripts/v62-fix-schedule-link-doctor-data.mjs;
// only writes when final != prior).
//
// Two-phase: dry-run by default; --apply commits batch + audit doc.
//
// Run dry-run:
//   node --env-file=.env.local.prod scripts/v63-batch-fix-all-schedule-links.mjs
// Commit:
//   node --env-file=.env.local.prod scripts/v63-batch-fix-all-schedule-links.mjs --apply

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

async function deriveForLink(db, sched) {
  const months = Array.isArray(sched.months) ? sched.months : [];
  const branchId = sched.branchId || '';
  const doctorId = sched.selectedDoctorId || null;
  const priorDoctorDays = Array.isArray(sched.doctorDays) ? sched.doctorDays : [];
  const priorCustomDoctorHours = sched.customDoctorHours || {};

  if (months.length === 0 || !branchId) {
    return { skip: true, reason: months.length === 0 ? 'no-months' : 'no-branchId' };
  }

  // Fetch be_staff_schedules — multi-doctor for noDoctor; specific for พบแพทย์
  let q = db.collection(`artifacts/${APP_ID}/public/data/be_staff_schedules`)
    .where('branchId', '==', branchId);
  if (doctorId) q = q.where('staffId', '==', doctorId);
  const snap = await q.get();
  const allEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));

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

  // Union with prior manual paint scoped to months; admin overrides win on hours collision.
  const monthSet = new Set(months);
  const inMonthsPrior = priorDoctorDays.filter(d => typeof d === 'string' && monthSet.has(d.slice(0, 7)));
  const finalDoctorDays = [...new Set([...v62DoctorDays, ...inMonthsPrior])].sort();
  const finalCustomDoctorHours = { ...v62Hours, ...priorCustomDoctorHours };

  const priorSorted = [...priorDoctorDays].sort();
  const daysDiff = priorSorted.length !== finalDoctorDays.length
    || priorSorted.some((v, i) => v !== finalDoctorDays[i]);
  const hoursDiff = JSON.stringify(finalCustomDoctorHours) !== JSON.stringify(priorCustomDoctorHours);

  return {
    skip: false,
    branchId,
    months,
    doctorId,
    priorDoctorDaysCount: priorDoctorDays.length,
    finalDoctorDaysCount: finalDoctorDays.length,
    priorHoursKeysCount: Object.keys(priorCustomDoctorHours).length,
    finalHoursKeysCount: Object.keys(finalCustomDoctorHours).length,
    derivedDoctorDaysCount: v62DoctorDays.length,
    needsWrite: daysDiff || hoursDiff,
    finalDoctorDays,
    finalCustomDoctorHours,
    priorDoctorDays,
    priorCustomDoctorHours,
  };
}

async function main() {
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

  console.log('═'.repeat(72));
  console.log(`V63 batch fix — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('═'.repeat(72));

  const allSnap = await db.collection(`artifacts/${APP_ID}/public/data/clinic_schedules`).get();
  console.log(`Total clinic_schedules docs: ${allSnap.size}`);
  console.log('─'.repeat(72));

  const results = [];
  let skipped = 0;
  let idempotent = 0;
  let needsWrite = 0;

  for (const doc of allSnap.docs) {
    const data = doc.data();
    if (data.isActive === false) {
      // skip inactive admin-archived links
      skipped++;
      results.push({ token: doc.id, status: 'inactive', skip: true });
      continue;
    }
    const r = await deriveForLink(db, data);
    if (r.skip) {
      skipped++;
      results.push({ token: doc.id, status: r.reason, skip: true });
      continue;
    }
    if (r.needsWrite) needsWrite++;
    else idempotent++;
    results.push({ token: doc.id, ...r });
  }

  console.log('Per-link status:');
  for (const r of results) {
    if (r.skip) {
      console.log(`  · ${r.token.padEnd(20)} SKIP (${r.status})`);
      continue;
    }
    const tag = r.needsWrite ? 'WRITE' : 'OK   ';
    const mode = r.doctorId ? `doc=${r.doctorId.slice(0, 14)}…` : 'noDoctor/all';
    console.log(`  · ${r.token.padEnd(20)} ${tag}  days ${String(r.priorDoctorDaysCount).padStart(3)}→${String(r.finalDoctorDaysCount).padStart(3)} · hours ${String(r.priorHoursKeysCount).padStart(3)}→${String(r.finalHoursKeysCount).padStart(3)} · ${mode}  months=${JSON.stringify(r.months)}`);
  }

  console.log('─'.repeat(72));
  console.log(`Summary:  needsWrite=${needsWrite}  idempotent=${idempotent}  skipped=${skipped}  total=${allSnap.size}`);
  console.log('─'.repeat(72));

  if (needsWrite === 0) {
    console.log('Nothing to fix — all active links already canonical.');
    return;
  }

  if (!APPLY) {
    console.log(`\nDry-run complete. Re-run with --apply to commit ${needsWrite} write(s).`);
    return;
  }

  // Apply: batch write all needed updates + single audit doc
  const auditId = `v63-batch-fix-schedule-links-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const auditRef = db.doc(`artifacts/${APP_ID}/public/data/be_admin_audit/${auditId}`);

  const writes = [];
  for (const r of results) {
    if (r.skip || !r.needsWrite) continue;
    const ref = db.doc(`artifacts/${APP_ID}/public/data/clinic_schedules/${r.token}`);
    writes.push({
      ref,
      patch: {
        doctorDays: r.finalDoctorDays,
        customDoctorHours: r.finalCustomDoctorHours,
        _v62BackfilledAt: FieldValue.serverTimestamp(),
        _v62LegacyDoctorDays: r.priorDoctorDays,
        _v62LegacyCustomDoctorHours: r.priorCustomDoctorHours,
      },
      summary: {
        token: r.token,
        branchId: r.branchId,
        months: r.months,
        priorDoctorDaysCount: r.priorDoctorDaysCount,
        finalDoctorDaysCount: r.finalDoctorDaysCount,
        priorHoursKeysCount: r.priorHoursKeysCount,
        finalHoursKeysCount: r.finalHoursKeysCount,
        derivedDoctorDaysCount: r.derivedDoctorDaysCount,
      },
    });
  }

  // Firestore batch caps at 500 ops; chunk if larger.
  const CHUNK = 200;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const slice = writes.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const w of slice) batch.update(w.ref, w.patch);
    if (i === 0) {
      batch.set(auditRef, {
        type: 'v63-batch-fix-schedule-links',
        appliedAt: FieldValue.serverTimestamp(),
        totalDocsScanned: allSnap.size,
        skipped,
        idempotent,
        written: writes.length,
        writes: writes.map(w => w.summary),
      });
    }
    await batch.commit();
    console.log(`✓ committed chunk ${Math.floor(i / CHUNK) + 1} (${slice.length} updates)`);
  }

  console.log(`\n✓ Applied. ${writes.length} schedule link(s) updated.`);
  console.log(`  Audit doc: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('V63 batch fix failed:', e.stack || e.message); process.exit(1); });
}
