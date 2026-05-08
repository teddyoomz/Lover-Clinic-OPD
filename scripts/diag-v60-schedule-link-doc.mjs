#!/usr/bin/env node
// V60 diagnostic: read clinic_schedules/SCH-2f69d853fb shape to diagnose
// "กดดูอะไรไม่ได้เลย" (calendar cells unclickable) report.
//
// Read-only — no writes. Rule M canonical (env-load + admin-SDK + canonical
// path + invocation guard).

// Env loaded via `node --env-file=.env.local.prod` (native, Node 20+).
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const TOKEN  = process.argv[2] || 'SCH-2f69d853fb';

async function main() {
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
  const db = getFirestore();
  const ref = db.doc(`artifacts/${APP_ID}/public/data/clinic_schedules/${TOKEN}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(JSON.stringify({ token: TOKEN, exists: false }, null, 2));
    return;
  }
  const d = snap.data();
  const out = {
    token: TOKEN,
    exists: true,
    enabled: d.enabled,
    branchId: d.branchId,
    months: d.months,
    showFrom: d.showFrom,
    endDate: d.endDate,
    slotDurationMins: d.slotDurationMins,
    noDoctorRequired: d.noDoctorRequired,
    showDoctorStatus: d.showDoctorStatus,
    selectedDoctorId: d.selectedDoctorId,
    selectedDoctorName: d.selectedDoctorName,
    selectedRoomId: d.selectedRoomId,
    selectedRoomName: d.selectedRoomName,
    clinicOpenTime: d.clinicOpenTime,
    clinicCloseTime: d.clinicCloseTime,
    clinicOpenTimeWeekend: d.clinicOpenTimeWeekend,
    clinicCloseTimeWeekend: d.clinicCloseTimeWeekend,
    doctorStartTime: d.doctorStartTime,
    doctorEndTime: d.doctorEndTime,
    doctorStartTimeWeekend: d.doctorStartTimeWeekend,
    doctorEndTimeWeekend: d.doctorEndTimeWeekend,
    doctorDaysCount: (d.doctorDays || []).length,
    doctorDaysSample: (d.doctorDays || []).slice(0, 8),
    closedDaysCount: (d.closedDays || []).length,
    closedDaysSample: (d.closedDays || []).slice(0, 25),
    closedDaysAllIfShort: (d.closedDays || []).length <= 90 ? d.closedDays : '<truncated>',
    bookedSlotsCount: (d.bookedSlots || []).length,
    manualBlockedSlotsCount: (d.manualBlockedSlots || []).length,
    doctorBookedSlotsCount: (d.doctorBookedSlots || []).length,
    customDoctorHoursKeys: Object.keys(d.customDoctorHours || {}),
    createdAt_iso: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : null,
    age_hours: d.createdAt?.toMillis ? ((Date.now() - d.createdAt.toMillis()) / 3600000).toFixed(2) : null,
  };
  console.log(JSON.stringify(out, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('Diag failed:', e.message); process.exit(1); });
}
