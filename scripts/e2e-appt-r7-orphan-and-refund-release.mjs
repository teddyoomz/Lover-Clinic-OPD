#!/usr/bin/env node
// ─── appointment loop R7 — doctor-clear orphan release + refund→slot release
//     (Rule Q V66 L2 on REAL prod) ─────────────────────────────────────────────
//
//   A (P1, ghost-collision): updateBackendAppointment released old slots only when
//      the NEW key-set was non-empty → clearing the doctor (→ ไม่ระบุ) on a
//      roomless appt ORPHANED the old doctor slots → that doctor's time was
//      falsely blocked forever. FIX releases on ANY key-set change (even to empty).
//   C1 (P1, slot leak): refundDeposit touched ONLY the deposit → a fully-refunded
//      UNUSED deposit-booking left a 'pending' slot-holding PHANTOM appointment.
//      FIX cancels the linked appt (releasing slots) on a full refund of an
//      unused deposit-booking.
//   C2 (control): a USED deposit (customer came) fully-refunded must NOT cancel
//      the visit.
//
// Rule Q V66 L2: admin custom token → CLIENT SDK signIn → SHIPPED client fns on
//   REAL prod. Rule M/R: TEST- namespace + far-future date + zero-orphan cleanup.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import {
  createBackendAppointment, updateBackendAppointment, applyDepositToSale, refundDeposit,
  buildAppointmentSlotKeys,
} from '../src/lib/backendClient.js';
import { createDepositBookingPair } from '../src/lib/appointmentDepositBatch.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-APPTR7-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`, BR = `${NS}-BR`, DOC = `${NS}-DOC`, CUST = `${NS}-CUST`;
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
const depositData = (start, end) => ({
  customerId: CUST, customerName: 'TEST R7', customerHN: '', amount: 100, paymentChannel: 'cash', paymentDate: DATE,
  sellers: [], note: 'e2e r7', hasAppointment: true,
  appointment: { date: DATE, startTime: start, endTime: end, doctorId: DOC, doctorName: 'TEST DOC', purpose: 'test', notifyChannel: [] },
  branchId: BR,
});

async function main() {
  const adb = initAdmin(); const data = base(adb);
  const getAppt = async (id) => { const s = await data.collection('be_appointments').doc(id).get(); return s.exists ? s.data() : null; };
  const getDep = async (id) => { const s = await data.collection('be_deposits').doc(id).get(); return s.exists ? s.data() : null; };
  const slotExists = async (start, end) => {
    const keys = buildAppointmentSlotKeys({ date: DATE, doctorId: DOC, startTime: start, endTime: end });
    for (const k of keys) if ((await data.collection('be_appointment_slots').doc(k).get()).exists) return true;
    return false;
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — SHIPPED client fns on REAL prod\nNS=${NS} date=${DATE}\n`);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'APPTR7', isDefault: false });
    await data.collection('be_customers').doc(CUST).set({ id: CUST, name: 'TEST R7', branchId: BR, finance: {} });

    // ── A — clear the doctor on a roomless appt → old doctor slots RELEASED ───
    console.log('A — appt @10:00 with doctor + no room; clear doctor → old doctor slots must NOT orphan');
    const a = await createBackendAppointment({ date: DATE, startTime: '10:00', endTime: '11:00', doctorId: DOC, doctorName: 'TEST DOC', customerId: CUST, customerName: 'TEST R7', customerHN: '', roomId: '', branchId: BR, status: 'confirmed' });
    check('A.0 doctor slots reserved after create', await slotExists('10:00', '11:00'), 'no slot after create');
    await updateBackendAppointment(a.appointmentId, { doctorId: '', doctorName: '' });   // clear doctor (newKeys empty)
    check('A.1 old doctor slots RELEASED after clearing the doctor (no ghost-collision orphan)',
      !(await slotExists('10:00', '11:00')), 'slots ORPHANED → that doctor time falsely blocked forever');

    // ── C1 — full refund of an UNUSED deposit-booking releases the slot ───────
    console.log('\nC1 — full refund of an UNUSED deposit-booking → appt cancelled + slot released');
    const c1 = await createDepositBookingPair({ depositData: depositData('13:00', '14:00'), branchId: BR });
    check('C1.0 deposit-booking slot reserved', await slotExists('13:00', '14:00'), 'no slot');
    await refundDeposit(c1.depositId, { refundAmount: 100, refundChannel: 'cash', refundDate: DATE });   // FULL refund
    check('C1.1 the linked appt is now cancelled (no phantom booking)', (await getAppt(c1.appointmentId))?.status === 'cancelled',
      `status=${(await getAppt(c1.appointmentId))?.status}`);
    check('C1.2 the slot is RELEASED (time re-bookable)', !(await slotExists('13:00', '14:00')), 'slot still held → phantom blocks the time');
    check('C1.3 the deposit is refunded (money record intact)', (await getDep(c1.depositId))?.status === 'refunded',
      `status=${(await getDep(c1.depositId))?.status}`);

    // ── C2 — full refund of a USED deposit (customer came) keeps the appt ─────
    console.log('\nC2 — full refund of a USED deposit (customer came) → appt must NOT be cancelled');
    const c2 = await createDepositBookingPair({ depositData: depositData('15:00', '16:00'), branchId: BR });
    await applyDepositToSale(c2.depositId, `TEST-SALE-${NS}-c2`, 100);   // fully used → customer came
    await refundDeposit(c2.depositId, { refundAmount: 100, refundChannel: 'cash', refundDate: DATE }).catch(() => {});
    check('C2.1 the visit appt is NOT cancelled by a used-deposit refund',
      (await getAppt(c2.appointmentId))?.status !== 'cancelled', `status=${(await getAppt(c2.appointmentId))?.status}`);

  } finally {
    console.log('\nCleanup'); let deleted = 0;
    const sweep = async (c, f, v) => { const s = await data.collection(c).where(f, '==', v).get(); for (const d of s.docs) { await d.ref.delete(); deleted++; } };
    await sweep('be_appointments', 'branchId', BR);
    await sweep('be_deposits', 'branchId', BR);
    await data.collection('be_customers').doc(CUST).delete().then(() => deleted++).catch(() => {});
    await data.collection('be_branches').doc(BR).delete().then(() => deleted++).catch(() => {});
    const allSlots = await data.collection('be_appointment_slots').get();
    for (const d of allSlots.docs) if (d.id.includes(DOC)) { await d.ref.delete(); deleted++; }
    check('CLEANUP swept TEST namespace', true, `${deleted} docs`);
    const left = (await data.collection('be_appointments').where('branchId', '==', BR).get()).size
      + (await data.collection('be_deposits').where('branchId', '==', BR).get()).size;
    check('CLEANUP zero orphans', left === 0, `${left} left`);
    await signOut(clientAuth).catch(() => {});
  }
  console.log(`\n${'═'.repeat(50)}\nRESULT: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log('FAILED:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
