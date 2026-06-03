#!/usr/bin/env node
// ─── appointment loop R9 — restore-time slot-guard REBUILD (Rule Q V66 L2) ─────
//
//   be_appointment_slots are keyed date_doctor_time (+ ROOM__), NOT by branch or
//   customer, so they're absent from the branch + customer-only backup scopes →
//   a restore brought back LIVE appointments with NO atomic double-booking guard
//   → those times were silently bookable (the guard degraded to a dismissible
//   soft scan). FIX: the restore executors map computeAppointmentSlotDocs over
//   the restored live appts to re-create the slot docs.
//
// Deterministic L2: admin-SDK seeds a restored appt WITHOUT slots (the gap), then
// proves (GAP) a booking at that time SUCCEEDS unguarded, and (FIX) after the
// SAME rebuild the executors run, a booking at that time COLLIDES.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { createBackendAppointment } from '../src/lib/backendClient.js';
import { computeAppointmentSlotDocs } from '../src/lib/appointmentSlotKeys.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-APPTR9-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`, BR = `${NS}-BR`, DOC = `${NS}-DOC`, DOCB = `${NS}-DOCB`, ROOM = `${NS}-ROOM`, CUST = `${NS}-CUST`;
const DATE = new Date(Date.now() + 7 * 3600 * 1000 + 400 * 86400 * 1000).toISOString().slice(0, 10);

let pass = 0, fail = 0; const fails = [];
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; fails.push(n); console.log(`  ✗ ${n}  ${x}`); } };
function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {};
  for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[line.slice(0, eq).trim()] = v; }
  return out;
}
function initAdmin() {
  if (adminApps().length) return adminFirestore();
  const env = loadEnvLocal();
  adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) });
  return adminFirestore();
}
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
// book via a DIFFERENT doctor in the SAME room (the soft doctor-scan can't see a
// room conflict — only the atomic room slot guard can).
const apptOtherDocSameRoom = (start, end) => ({ date: DATE, startTime: start, endTime: end, doctorId: DOCB, doctorName: 'TEST DOC B', customerId: CUST, customerName: 'TEST R9', customerHN: '', roomId: ROOM, roomName: 'TEST ROOM', branchId: BR, status: 'confirmed' });
const isCollision = (r) => r?.status === 'rejected' && /AP1_COLLISION/i.test(r?.reason?.message || String(r?.reason || ''));

async function main() {
  const adb = initAdmin(); const data = base(adb);
  // simulate a restore: write a be_appointments doc directly (DOC_A in ROOM), NO slots.
  const restoreApptNoSlots = async (id, start, end) =>
    data.collection('be_appointments').doc(id).set({ appointmentId: id, doctorId: DOC, doctorName: 'TEST DOC', roomId: ROOM, roomName: 'TEST ROOM', date: DATE, startTime: start, endTime: end, status: 'confirmed', branchId: BR, customerId: CUST });
  // the executors' rebuild = map computeAppointmentSlotDocs over restored appts.
  const runRebuild = async (apptDoc) => {
    const takenAt = new Date().toISOString();
    for (const { key, doc } of computeAppointmentSlotDocs(apptDoc, { takenAt })) {
      await data.collection('be_appointment_slots').doc(key).set(doc);
    }
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — SHIPPED client fns on REAL prod\nNS=${NS} date=${DATE}\n`);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'APPTR9', isDefault: false });

    // ── GAP — a restored appt WITHOUT slots loses the atomic ROOM guard ──────
    // (same-doctor IS still soft-scanned, but the soft scan is doctor-only — a
    // DIFFERENT doctor booking the SAME ROOM is caught ONLY by the atomic room
    // slot, which the restore dropped → a room double-book slips through.)
    console.log('GAP — restored DOC_A@ROOM@10:00 with NO slots → DOC_B can double-book the same ROOM');
    const gapId = `BA-${NS}-gap`;
    await restoreApptNoSlots(gapId, '10:00', '11:00');   // restored, no slots
    let gapOk = false;
    try { const r = await createBackendAppointment(apptOtherDocSameRoom('10:00', '11:00')); gapOk = !!r?.appointmentId; } catch { gapOk = false; }
    check('G.1 [proves the gap] DOC_B booked the restored appt’s ROOM (atomic room guard was lost on restore)', gapOk,
      'expected the room double-book to slip through (the bug)');

    // ── FIX — after the rebuild runs, the ROOM collides for the other doctor ──
    console.log('\nFIX — restore DOC_A@ROOM@13:00 NO slots, run the rebuild → DOC_B booking the same ROOM COLLIDES');
    const fixId = `BA-${NS}-fix`;
    const fixApptDoc = { id: fixId, appointmentId: fixId, doctorId: DOC, roomId: ROOM, date: DATE, startTime: '13:00', endTime: '14:00', status: 'confirmed' };
    await restoreApptNoSlots(fixId, '13:00', '14:00');
    await runRebuild(fixApptDoc);   // the executors' R9 rebuild (incl. ROOM slots)
    const fixRes = await Promise.allSettled([createBackendAppointment(apptOtherDocSameRoom('13:00', '14:00'))]);
    check('F.1 after rebuild: DOC_B booking the restored ROOM was REJECTED (atomic room guard restored)', isCollision(fixRes[0]),
      `result=${fixRes[0]?.status} ${fixRes[0]?.value?.appointmentId || fixRes[0]?.reason?.message || ''}`);

    // ── control — a CANCELLED restored appt is NOT rebuilt (no phantom guard) ─
    console.log('\nC — a CANCELLED restored appt produces NO slot docs (no phantom over-block)');
    const cancId = `BA-${NS}-cancelled`;
    check('C.1 computeAppointmentSlotDocs returns [] for a cancelled appt',
      computeAppointmentSlotDocs({ id: cancId, doctorId: DOC, date: DATE, startTime: '15:00', endTime: '16:00', status: 'cancelled' }).length === 0, 'expected 0');

  } finally {
    console.log('\nCleanup'); let deleted = 0;
    const sweep = async (c, f, v) => { const s = await data.collection(c).where(f, '==', v).get(); for (const d of s.docs) { await d.ref.delete(); deleted++; } };
    await sweep('be_appointments', 'branchId', BR);
    const allSlots = await data.collection('be_appointment_slots').get();
    for (const d of allSlots.docs) if (d.id.includes(NS)) { await d.ref.delete(); deleted++; }   // doctor + ROOM__ keys both embed NS
    await data.collection('be_branches').doc(BR).delete().then(() => deleted++).catch(() => {});
    check('CLEANUP swept TEST namespace', true, `${deleted} docs`);
    const left = (await data.collection('be_appointments').where('branchId', '==', BR).get()).size;
    check('CLEANUP zero orphans', left === 0, `${left} left`);
    await signOut(clientAuth).catch(() => {});
  }
  console.log(`\n${'═'.repeat(50)}\nRESULT: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log('FAILED:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
