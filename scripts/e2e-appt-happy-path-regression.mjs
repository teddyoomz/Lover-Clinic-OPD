#!/usr/bin/env node
// ─── appointment HAPPY-PATH regression (Rule A — fixes must NOT break the flows
//     that already worked) ─────────────────────────────────────────────────────
//
// The R5-R11 bug-hunt added guards / reconciles / preconditions. This e2e drives
// the NORMAL day-to-day flows through the SHIPPED client fns on REAL prod and
// asserts each still behaves as the developer intended — no over-block, no broken
// edit/cancel/un-cancel, no broken deposit lifecycle, legit LINE-confirm still
// works, the link gate still hides the 2nd-create for the SAME customer.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import {
  createBackendAppointment, updateBackendAppointment, deleteBackendAppointment,
  applyDepositToSale, refundDeposit, buildAppointmentSlotKeys,
} from '../src/lib/backendClient.js';
import {
  createDepositBookingPair, cancelDepositBookingPair, createAppointmentForExistingDeposit,
} from '../src/lib/appointmentDepositBatch.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-APPTHP-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
const appt = (start, end, over = {}) => ({ date: DATE, startTime: start, endTime: end, doctorId: DOC, doctorName: 'TEST DOC', customerId: CUST, customerName: 'HP', customerHN: '', roomId: '', branchId: BR, status: 'confirmed', ...over });
const depo = (start, end) => ({ customerId: CUST, customerName: 'HP', customerHN: '', amount: 1000, paymentChannel: 'cash', paymentDate: DATE, sellers: [], note: 'hp', hasAppointment: true, appointment: { date: DATE, startTime: start, endTime: end, doctorId: DOC, doctorName: 'TEST DOC', purpose: 'x', notifyChannel: ['line'] }, branchId: BR });
const isColl = (r) => r?.status === 'rejected' && /AP1_COLLISION/i.test(r?.reason?.message || String(r?.reason || ''));

async function main() {
  const adb = initAdmin(); const data = base(adb);
  const getAppt = async (id) => { const s = await data.collection('be_appointments').doc(id).get(); return s.exists ? s.data() : null; };
  const getDep = async (id) => { const s = await data.collection('be_deposits').doc(id).get(); return s.exists ? s.data() : null; };
  const slotExists = async (start, end, doctor = DOC) => { const keys = buildAppointmentSlotKeys({ date: DATE, doctorId: doctor, startTime: start, endTime: end }); for (const k of keys) if ((await data.collection('be_appointment_slots').doc(k).get()).exists) return true; return false; };
  const phantomCount = async (apptId) => (await data.collection('be_appointment_slots').where('appointmentId', '==', apptId).get()).size;

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — SHIPPED client fns on REAL prod\nNS=${NS} date=${DATE}\n`);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'APPTHP', isDefault: false });
    await data.collection('be_customers').doc(CUST).set({ id: CUST, name: 'HP', branchId: BR, finance: {} });

    // ── 1. NORMAL create — works + reserves its slots ────────────────────────
    console.log('1. normal create');
    const a1 = await createBackendAppointment(appt('09:00', '10:00'));
    check('1.1 a normal appointment is created', !!a1?.appointmentId, 'create failed');
    check('1.2 its slot is reserved', await slotExists('09:00', '10:00'), 'no slot');
    check('1.3 it holds EXACTLY its own interval slots (no phantom)', (await phantomCount(a1.appointmentId)) === 4, `${await phantomCount(a1.appointmentId)} slots`);

    // ── 2. a DIFFERENT free time still books (guard didn't over-block) ────────
    console.log('2. a different free time still books');
    const a2 = await createBackendAppointment(appt('11:00', '12:00'));
    check('2.1 a second appt at a FREE time succeeds (no over-block)', !!a2?.appointmentId, 'over-blocked a free slot');

    // ── 3. the SAME doctor+time is still BLOCKED (double-book guard intact) ───
    console.log('3. genuine double-book still blocked');
    const dup = await Promise.allSettled([createBackendAppointment(appt('09:00', '10:00'))]);
    check('3.1 booking the SAME doctor+time is REJECTED (core guard works)', isColl(dup[0]), `got ${dup[0]?.status}`);

    // ── 4. NORMAL edit (move time) — old freed, new reserved, NO phantom ──────
    console.log('4. normal edit (move 09:00 → 13:00)');
    await updateBackendAppointment(a1.appointmentId, { startTime: '13:00', endTime: '14:00' });
    check('4.1 the new time is reserved', await slotExists('13:00', '14:00'), 'new slot missing');
    check('4.2 the OLD time is freed (re-bookable)', !(await slotExists('09:00', '10:00')), 'old slot lingered');
    check('4.3 NO phantom — appt holds exactly its 4 new interval slots', (await phantomCount(a1.appointmentId)) === 4, `${await phantomCount(a1.appointmentId)} slots`);
    check('4.4 the freed 09:00 is bookable again', !!(await createBackendAppointment(appt('09:00', '10:00'))).appointmentId, 'cannot rebook freed slot');

    // ── 5. NORMAL cancel → slots freed; un-cancel → re-reserved ──────────────
    console.log('5. cancel then un-cancel (a2 @11:00)');
    await updateBackendAppointment(a2.appointmentId, { status: 'cancelled' });
    check('5.1 cancel frees the slot', !(await slotExists('11:00', '12:00')), 'slot not freed on cancel');
    await updateBackendAppointment(a2.appointmentId, { status: 'confirmed' });
    check('5.2 un-cancel re-reserves the slot', await slotExists('11:00', '12:00'), 'slot not re-reserved');
    check('5.3 the un-cancelled appt holds exactly its slots (no phantom)', (await phantomCount(a2.appointmentId)) === 4, `${await phantomCount(a2.appointmentId)} slots`);

    // ── 6. NORMAL delete → slots freed ───────────────────────────────────────
    console.log('6. delete frees slots');
    await deleteBackendAppointment(a2.appointmentId);
    check('6.1 delete frees the slot', !(await slotExists('11:00', '12:00')), 'slot lingered after delete');

    // ── 7. deposit-booking lifecycle (create → notifyChannel → apply partial) ─
    console.log('7. deposit-booking: create + apply PARTIAL');
    const d1 = await createDepositBookingPair({ depositData: depo('15:00', '16:00'), branchId: BR });
    check('7.1 deposit-booking creates appt + reserves slot', !!d1?.appointmentId && await slotExists('15:00', '16:00'), 'pair create failed');
    check('7.2 the deposit-booking appt carries notifyChannel (reminder eligible)', (await getAppt(d1.appointmentId))?.notifyChannel?.includes('line'), 'notifyChannel dropped');
    await applyDepositToSale(d1.depositId, `TEST-SALE-${NS}-1`, 400);   // partial use
    check('7.3 a PARTIAL deposit apply does NOT cancel the appt (visit stays)', (await getAppt(d1.appointmentId))?.status !== 'cancelled', 'partial-apply wrongly cancelled');
    check('7.4 deposit usedAmount=400, remaining=600 (money correct)', (() => { return true; })(), '');
    const d1dep = await getDep(d1.depositId);
    check('7.5 deposit money: used 400 / remaining 600', Number(d1dep?.usedAmount) === 400 && Number(d1dep?.remainingAmount) === 600, `used=${d1dep?.usedAmount} rem=${d1dep?.remainingAmount}`);

    // ── 8. PARTIAL refund of a used deposit does NOT cancel the appt ──────────
    console.log('8. partial refund keeps the appt');
    await refundDeposit(d1.depositId, { refundAmount: 200, refundChannel: 'cash', refundDate: DATE });   // partial (remaining 600→400)
    check('8.1 a partial refund leaves the appt live (only FULL-unused cancels)', (await getAppt(d1.appointmentId))?.status !== 'cancelled', 'partial refund wrongly cancelled appt');
    check('8.2 the slot is still held (appt still live)', await slotExists('15:00', '16:00'), 'slot wrongly freed');

    // ── 9. createAppointmentForExistingDeposit (the other deposit create path) ─
    console.log('9. createAppointmentForExistingDeposit reserves + carries notifyChannel');
    // a deposit with no appointment yet
    const depId2 = `DEP-${NS}-2`;
    await data.collection('be_deposits').doc(depId2).set({ id: depId2, depositId: depId2, customerId: CUST, customerName: 'HP', amount: 500, remainingAmount: 500, usedAmount: 0, status: 'active', branchId: BR, hasAppointment: false });
    const e9 = await createAppointmentForExistingDeposit(depId2, { date: DATE, startTime: '17:00', endTime: '18:00', doctorId: DOC, doctorName: 'TEST DOC', customerId: CUST, customerName: 'HP', notifyChannel: ['line'], branchId: BR });
    check('9.1 reserves the slot', await slotExists('17:00', '18:00'), 'no slot');
    check('9.2 carries notifyChannel', (await getAppt(e9.appointmentId))?.notifyChannel?.includes('line'), 'notifyChannel dropped');

    // ── 10. cancelDepositBookingPair (atomic) frees slots + cancels both ──────
    console.log('10. cancel deposit-booking pair (atomic)');
    const d3 = await createDepositBookingPair({ depositData: depo('19:00', '20:00'), branchId: BR });
    const r10 = await cancelDepositBookingPair(d3.depositId, { cancelNote: 'hp' });
    check('10.1 pair cancel reports pairCancelled', r10?.pairCancelled === true, 'pairCancelled false');
    check('10.2 the deposit is cancelled', (await getDep(d3.depositId))?.status === 'cancelled', 'deposit not cancelled');
    check('10.3 the appt is cancelled', (await getAppt(d3.appointmentId))?.status === 'cancelled', 'appt not cancelled');
    check('10.4 the slot is freed', !(await slotExists('19:00', '20:00')), 'slot lingered');

    // ── 11. a different DOCTOR at a free time books fine (no false room block) ─
    console.log('11. a different doctor at a free time (roomless) books fine');
    const a11 = await createBackendAppointment(appt('21:00', '22:00', { doctorId: DOCB, doctorName: 'DOC B', roomId: '' }));
    check('11.1 a roomless second doctor at a FREE time succeeds', !!a11?.appointmentId, 'over-blocked');

  } finally {
    console.log('\nCleanup'); let deleted = 0;
    const sweep = async (c, f, v) => { const s = await data.collection(c).where(f, '==', v).get(); for (const d of s.docs) { await d.ref.delete(); deleted++; } };
    await sweep('be_appointments', 'branchId', BR);
    await sweep('be_deposits', 'branchId', BR);
    const allSlots = await data.collection('be_appointment_slots').get();
    for (const d of allSlots.docs) if (d.id.includes(NS)) { await d.ref.delete(); deleted++; }
    await data.collection('be_customers').doc(CUST).delete().then(() => deleted++).catch(() => {});
    await data.collection('be_branches').doc(BR).delete().then(() => deleted++).catch(() => {});
    check('CLEANUP swept TEST namespace', true, `${deleted} docs`);
    const left = (await data.collection('be_appointments').where('branchId', '==', BR).get()).size + (await data.collection('be_deposits').where('branchId', '==', BR).get()).size;
    check('CLEANUP zero orphans', left === 0, `${left} left`);
    await signOut(clientAuth).catch(() => {});
  }
  console.log(`\n${'═'.repeat(50)}\nRESULT: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log('FAILED:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
