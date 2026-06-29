#!/usr/bin/env node
// V164 diag (READ-ONLY, Rule R): why does the นัดหมาย header show "ไม่มีแพทย์เข้า"
// when a doctor IS working today? Compare the AppointmentHubView inline filter
// (V64) against the canonical mergeSchedulesForDate logic, on REAL prod data,
// for TODAY (Bangkok). Dumps entries that are "working today" per canonical but
// MISSED by the inline filter — and their shapes (type, dayOfWeek+typeof, date).
//
// Run: node --env-file=.env.local.prod scripts/diag-v164-doctor-shifts-today.mjs

import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const pad = (n) => String(n).padStart(2, '0');

// Replicate AppointmentHubView's Bangkok-today computation EXACTLY (activeTab='today')
function bangkokToday() {
  const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const bd = new Date(Date.now() + BANGKOK_OFFSET_MS);
  const targetISO = `${bd.getUTCFullYear()}-${pad(bd.getUTCMonth() + 1)}-${pad(bd.getUTCDate())}`;
  const [yy, mm, dd] = targetISO.split('-').map(Number);
  const dow = new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0)).getUTCDay();
  return { targetISO, dow };
}

// V64 inline filter (AppointmentHubView) — the SUSPECT
function matchesInline(e, dow, targetISO) {
  if (e.type === 'recurring' && e.dayOfWeek === dow) return true;       // strict ===
  if (e.type === 'override' && e.date === targetISO) return true;       // literal 'override'
  return false;
}
// Canonical mergeSchedulesForDate logic — the REFERENCE
function matchesCanonical(e, dow, targetISO) {
  const isOverride = e.date === targetISO && e.type !== 'recurring';
  const isRecurringMatch = e.type === 'recurring' && Number(e.dayOfWeek) === dow;
  return isOverride || isRecurringMatch;
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
  const branchName = (id) => branches.find(b => b.id === id)?.name || id;
  const doctorIdSet = new Set(doctors.map(d => String(d.id)));
  const doctorName = (sid) => doctors.find(d => String(d.id) === String(sid))?.name || '(not-a-doctor)';

  const { targetISO, dow } = bangkokToday();
  console.log(`\n=== TODAY (Bangkok) = ${targetISO}  dow=${dow}  | schedules=${schedules.length} doctors=${doctors.length} ===\n`);

  // overall type distribution + dayOfWeek typeof distribution
  const typeDist = {};
  const dowTypeDist = {};
  for (const e of schedules) {
    typeDist[e.type] = (typeDist[e.type] || 0) + 1;
    if (e.type === 'recurring') dowTypeDist[typeof e.dayOfWeek] = (dowTypeDist[typeof e.dayOfWeek] || 0) + 1;
  }
  console.log('type distribution:', JSON.stringify(typeDist));
  console.log('recurring.dayOfWeek typeof distribution:', JSON.stringify(dowTypeDist), '\n');

  const byBranch = {};
  for (const e of schedules) { (byBranch[e.branchId || '(none)'] ||= []).push(e); }

  for (const [bid, entries] of Object.entries(byBranch)) {
    const inlineDoctorEntries = entries.filter(e => doctorIdSet.has(String(e.staffId)) && matchesInline(e, dow, targetISO));
    const canonDoctorEntries  = entries.filter(e => doctorIdSet.has(String(e.staffId)) && matchesCanonical(e, dow, targetISO));
    const inlineDocs = new Set(inlineDoctorEntries.map(e => String(e.staffId)));
    const canonDocs  = new Set(canonDoctorEntries.map(e => String(e.staffId)));
    const missed = canonDoctorEntries.filter(e => !inlineDoctorEntries.includes(e));

    console.log(`── ${branchName(bid)} [${bid}] — inline doctors today=${inlineDocs.size} | canonical=${canonDocs.size}`);
    if (missed.length) {
      console.log(`   ⚠ MISSED BY INLINE (${missed.length} doctor entries working today that the header DROPS):`);
      for (const e of missed) {
        console.log(`     • ${doctorName(e.staffId)} (staffId=${e.staffId}) type=${JSON.stringify(e.type)} dayOfWeek=${JSON.stringify(e.dayOfWeek)}(typeof ${typeof e.dayOfWeek}) date=${JSON.stringify(e.date)} ${e.startTime}-${e.endTime}`);
        const recReason = e.type === 'recurring' ? `recurring: inline(===)=${e.dayOfWeek === dow} canon(Number)=${Number(e.dayOfWeek) === dow}` : '';
        const ovrReason = e.type !== 'recurring' && e.date === targetISO ? `per-date: type!=='recurring'=true but inline wants type==='override' (actual='${e.type}')` : '';
        console.log(`        → ${recReason}${ovrReason}`);
      }
    } else if (canonDocs.size > 0) {
      console.log(`   ✓ inline matches canonical (no drift today in this branch)`);
    }
  }
  console.log('\n=== done (read-only) ===');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('Diag failed:', e.message); process.exit(1); });
}
