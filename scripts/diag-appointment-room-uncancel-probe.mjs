#!/usr/bin/env node
// ─── HUNT (appointment loop R2) — probe two same-class slot-guard residuals ───
//
// Reproduces on REAL prod (Rule Q L2, drives the SHIPPED client fns) two
// candidates surfaced in R1's audit (code-confirmed, now reproduced):
//
//   B (ROOM double-booking): buildAppointmentSlotKeys keys are doctor-only
//     (`${date}_${doctorId}_${HHMM}`) → two DIFFERENT doctors booked into the
//     SAME physical room + time never collide on the atomic guard; only the
//     overridable soft UI check guards rooms.
//
//   C (UN-CANCEL drops the slot): updateBackendAppointment releases slots on
//     status→cancelled (becameCancelled) but has NO cancelled→confirmed branch
//     → un-cancelling an appointment leaves its time UNGUARDED (no slot doc) →
//     a later booking (deposit path / concurrent) double-books it.
//
// Assertions encode the FIXED invariant → RED now = the bugs are real on prod.
// TEST-isolated (TEST doctors + TEST branch + far-future date) + cleanup.
// Run: node scripts/diag-appointment-room-uncancel-probe.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import {
  createBackendAppointment,
  updateBackendAppointment,
  buildAppointmentSlotKeys,
} from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-APPTR2-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
const BR = `${NS}-BR`;
const DOC_A = `${NS}-DOCA`;
const DOC_B = `${NS}-DOCB`;
const ROOM = `${NS}-ROOM`;
const DATE = new Date(Date.now() + 7 * 3600 * 1000 + 401 * 86400 * 1000).toISOString().slice(0, 10);

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
const appt = (over) => ({ date: DATE, startTime: '10:00', endTime: '11:00', customerId: `${NS}-C`, customerName: 'TEST', branchId: BR, status: 'confirmed', ...over });

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const slotExists = async (doctorId, start, end) => {
    const keys = buildAppointmentSlotKeys({ date: DATE, doctorId, startTime: start, endTime: end });
    for (const k of keys) if ((await data.collection('be_appointment_slots').doc(k).get()).exists) return true;
    return false;
  };
  const slotOwner = async (doctorId, start, end) => {
    const keys = buildAppointmentSlotKeys({ date: DATE, doctorId, startTime: start, endTime: end });
    for (const k of keys) { const s = await data.collection('be_appointment_slots').doc(k).get(); if (s.exists) return s.data()?.appointmentId || ''; }
    return '';
  };
  const activeApptsForRoomSlot = async (start) => (await data.collection('be_appointments').where('branchId', '==', BR).get())
    .docs.map(d => d.data()).filter(a => a.roomId === ROOM && a.date === DATE && a.startTime === start && a.status !== 'cancelled').length;
  const isCollision = (e) => /AP1_COLLISION/i.test(e?.message || String(e));

  try {
    await signInWithCustomToken(clientAuth, await adminAuth().createCustomToken(STAFF_UID, { admin: true }));
    console.log(`signed in ${STAFF_UID} — REAL prod  NS=${NS}  date=${DATE}\n`);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'APPTR2', isDefault: false });

    // ── B — ROOM double-booking (2 different doctors, SAME room + time) ───────
    console.log('B — DOC_A in ROOM @10:00, then DOC_B in the SAME ROOM @10:00');
    await createBackendAppointment(appt({ doctorId: DOC_A, doctorName: 'A', roomId: ROOM, roomName: 'R1' }));
    let bRejected = false, bErr = '';
    try { await createBackendAppointment(appt({ doctorId: DOC_B, doctorName: 'B', roomId: ROOM, roomName: 'R1' })); }
    catch (e) { bRejected = true; bErr = e?.message || String(e); }
    const bCount = await activeApptsForRoomSlot('10:00');
    console.log(`  → room appts @10:00 = ${bCount}  2nd rejected=${bRejected} (${bErr || 'no error'})`);
    check('B.1 second booking into the SAME room+time was REJECTED (room conflict)', bRejected && isCollision({ message: bErr }), `rejected=${bRejected}`);
    check('B.2 exactly 1 appointment holds the room at that time (no room double-book)', bCount === 1, `got ${bCount}`);

    // ── C — UN-CANCEL must re-reserve the slot ───────────────────────────────
    console.log('\nC — create @14:00, cancel (releases slot), un-cancel (status→confirmed)');
    const cRes = await createBackendAppointment(appt({ doctorId: DOC_A, doctorName: 'A', startTime: '14:00', endTime: '15:00' }));
    const cId = cRes.appointmentId;
    check('C.0 slot reserved after create', await slotExists(DOC_A, '14:00', '15:00'), 'no slot after create');
    await updateBackendAppointment(cId, { status: 'cancelled' });
    check('C.1 slot released after cancel', !(await slotExists(DOC_A, '14:00', '15:00')), 'slot lingered after cancel');
    await updateBackendAppointment(cId, { status: 'confirmed' });
    check('C.2 slot RE-RESERVED after un-cancel (cancelled→confirmed)', await slotExists(DOC_A, '14:00', '15:00'),
      'slot NOT re-reserved → the un-cancelled appt is unguarded → double-bookable');

    // ── D (R5) — un-cancel must NOT HIJACK a slot taken during the cancelled window ─
    console.log('\nD (R5) — X holds @16:00, cancel X, Y takes @16:00, un-cancel X → must NOT hijack Y');
    const dx = await createBackendAppointment(appt({ doctorId: DOC_A, doctorName: 'A', startTime: '16:00', endTime: '17:00' }));
    await updateBackendAppointment(dx.appointmentId, { status: 'cancelled' });          // releases @16:00
    const dy = await createBackendAppointment(appt({ doctorId: DOC_A, doctorName: 'A', startTime: '16:00', endTime: '17:00' })); // Y takes @16:00
    check('D.0 Y owns @16:00 after taking the released slot', (await slotOwner(DOC_A, '16:00', '17:00')) === dy.appointmentId,
      `owner mismatch expected Y=${dy.appointmentId}`);
    await updateBackendAppointment(dx.appointmentId, { status: 'confirmed' });           // un-cancel X
    const dOwner = await slotOwner(DOC_A, '16:00', '17:00');
    check('D.1 the slot is STILL owned by Y — un-cancel did NOT hijack the taken slot', dOwner === dy.appointmentId,
      `owner=${dOwner} X=${dx.appointmentId} Y=${dy.appointmentId} (blind re-reserve would show X → corruption)`);

  } finally {
    console.log('\nCleanup');
    let deleted = 0;
    const sweep = async (c, f, v) => { const s = await data.collection(c).where(f, '==', v).get(); for (const d of s.docs) { await d.ref.delete(); deleted++; } };
    try { await sweep('be_appointments', 'branchId', BR); } catch (e) { console.warn(e.message); }
    for (const doc of [DOC_A, DOC_B]) { try { await sweep('be_appointment_slots', 'doctorId', doc); } catch (e) { console.warn(e.message); } }
    try { await data.collection('be_branches').doc(BR).delete(); deleted++; } catch {}
    const orphans = (await data.collection('be_appointments').where('branchId', '==', BR).get()).size
      + (await data.collection('be_appointment_slots').where('doctorId', '==', DOC_A).get()).size
      + (await data.collection('be_appointment_slots').where('doctorId', '==', DOC_B).get()).size;
    check('CLEANUP zero orphans', orphans === 0, `orphans=${orphans} (deleted ${deleted})`);
    try { await signOut(clientAuth); } catch {}
  }
  console.log(`\n${'═'.repeat(50)}\nRESULT: ${pass} PASS / ${fail} FAIL`);
  if (fail) console.log(`FAILS:\n - ${fails.join('\n - ')}`);
  console.log('(pre-fix: B.1/B.2 + C.2 are EXPECTED RED = the bugs are real on prod)');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
