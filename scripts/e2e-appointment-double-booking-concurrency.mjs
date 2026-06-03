#!/usr/bin/env node
// ─── HUNT (appointment loop R1) — deposit-booking BYPASSES the AP1-bis atomic
//     double-booking slot guard (NOVEL; Rule Q L2 on REAL prod) ───────────────
//
// User (2026-06-03 EOD+5): "ทำ looping bug hunt ... audit ทุกอย่างว่าความสัมพันธ์
//   ระหว่างระบบ appointment กับระบบอื่นๆ ... ไร้บั๊ค ไร้ Edge Case ... พร้อมรับมือ
//   ความเสียหายระดับหลายล้าน".
//
// CLASS (from code read appointmentDepositBatch.js:30-33,293-296,584-587):
//   createBackendAppointment (AppointmentFormModal non-deposit path) reserves
//   one be_appointment_slots doc per 15-min interval INSIDE a runTransaction →
//   concurrent same-doctor bookings collide atomically (AP1-bis, proven).
//   BUT the DEPOSIT-booking writers — createDepositBookingPair /
//   createAppointmentForExistingDeposit — do a plain writeBatch.set(appt) with
//   NO slot reservation (the file header literally says "AP1-bis slot
//   reservation: NOT exercised here ... Tracked as Phase 21.0-bis-future").
//   So the PRIMARY money-backed booking flow has ZERO atomic double-booking
//   protection, and the two flows are MUTUALLY BLIND (deposit path doesn't see
//   a regular booking's slot, and a regular booking doesn't see a deposit
//   booking — which reserved nothing). Two admins / a double-click both book
//   Dr.X 10:00 via deposit → double-booked doctor, both customers paid deposits.
//
// Rule Q V66 L2: mints a custom token (admin) → signs the CLIENT SDK in →
//   calls the SHIPPED client fns (createBackendAppointment / createDepositBookingPair
//   / createAppointmentForExistingDeposit / cancelDepositBookingPair /
//   deleteDepositBookingPair) against REAL prod Firestore. NO mock-shadow.
// Rule M/R: TEST- namespace (TEST doctor + TEST branch + far-FUTURE date so it
//   can NEVER collide with real appts/slots or trigger the reminder cron),
//   try/finally cleanup, zero-orphan verify.
//
// Assertions encode the FIXED invariant → this is RED before the fix (= the bug
// is proven on prod) and GREEN after. Run: node scripts/e2e-appointment-double-booking-concurrency.mjs
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
  buildAppointmentSlotKeys,
} from '../src/lib/backendClient.js';
import {
  createDepositBookingPair,
  createAppointmentForExistingDeposit,
  cancelDepositBookingPair,
  deleteDepositBookingPair,
} from '../src/lib/appointmentDepositBatch.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-APPTRACE-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
const BR = `${NS}-BR`;
const DOC = `${NS}-DOC`;          // TEST doctor — isolates slot keys + soft scan
const CUST = `${NS}-CUST`;
// Far-future Bangkok date (today + 400d) → no real appt/slot collision, no cron.
const DATE = new Date(Date.now() + 7 * 3600 * 1000 + 400 * 86400 * 1000).toISOString().slice(0, 10);

let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}  ${extra}`); }
}
function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}
function initAdmin() {
  if (adminApps().length) return adminFirestore();
  const env = loadEnvLocal();
  adminInit({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
  }) });
  return adminFirestore();
}
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const depositData = (start, end) => ({
  customerId: CUST, customerName: 'TEST RACE', customerHN: '',
  amount: 100, paymentChannel: 'cash', paymentDate: DATE,
  sellers: [], note: 'e2e double-booking repro',
  hasAppointment: true,
  appointment: { date: DATE, startTime: start, endTime: end, doctorId: DOC, doctorName: 'TEST DOC', purpose: 'test' },
  branchId: BR,
});
const apptPayload = (start, end) => ({
  date: DATE, startTime: start, endTime: end,
  doctorId: DOC, doctorName: 'TEST DOC',
  customerId: CUST, customerName: 'TEST RACE', customerHN: '',
  branchId: BR, status: 'confirmed',
});
const reason = (r) => (r?.reason?.message || String(r?.reason || ''));
const isCollision = (r) => r?.status === 'rejected' && /AP1_COLLISION/i.test(reason(r));

async function main() {
  const adb = initAdmin();
  const data = base(adb);

  // Count non-cancelled TEST appts for a given slot start (admin read-back).
  const apptCountForSlot = async (start) => {
    const snap = await data.collection('be_appointments').where('branchId', '==', BR).get();
    return snap.docs
      .map(d => d.data())
      .filter(a => a.doctorId === DOC && a.date === DATE && a.startTime === start && a.status !== 'cancelled')
      .length;
  };
  const depCount = async () => (await data.collection('be_deposits').where('branchId', '==', BR).get()).size;
  const slotExists = async (start, end) => {
    const keys = buildAppointmentSlotKeys({ date: DATE, doctorId: DOC, startTime: start, endTime: end });
    for (const k of keys) { if ((await data.collection('be_appointment_slots').doc(k).get()).exists) return true; }
    return false;
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in as ${STAFF_UID} (admin) — driving SHIPPED client fns on REAL prod`);
    console.log(`NS=${NS}  doctor=${DOC}  date=${DATE}\n`);

    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'APPTRACE', isDefault: false });

    // ── CONTROL — the PROVEN createBackendAppointment AP1-bis guard ──────────
    // Two concurrent regular bookings, same doctor+slot → exactly 1 must win.
    // PASSES pre+post fix (proves the guard works + my harness measures right).
    console.log('CONTROL — 2 concurrent createBackendAppointment same slot 09:00-10:00 (proven AP1-bis guard)');
    const ctrl = await Promise.allSettled([
      createBackendAppointment(apptPayload('09:00', '10:00')),
      createBackendAppointment(apptPayload('09:00', '10:00')),
    ]);
    const ctrlCollisions = ctrl.filter(isCollision).length;
    check('CTRL.1 exactly 1 regular booking survived for the slot', (await apptCountForSlot('09:00')) === 1,
      `got ${await apptCountForSlot('09:00')}; rejected=${ctrl.filter(r=>r.status==='rejected').map(reason).join(' | ')}`);
    check('CTRL.2 the loser threw AP1_COLLISION (atomic guard fired)', ctrlCollisions === 1, `collisions=${ctrlCollisions}`);

    // ── D1 — two concurrent DEPOSIT bookings, same doctor+slot (THE BUG) ──────
    console.log('\nD1 — 2 concurrent createDepositBookingPair same slot 11:00-12:00 (deposit path)');
    const d1Before = await depCount();
    const d1 = await Promise.allSettled([
      createDepositBookingPair({ depositData: depositData('11:00', '12:00'), branchId: BR }),
      createDepositBookingPair({ depositData: depositData('11:00', '12:00'), branchId: BR }),
    ]);
    const d1Appts = await apptCountForSlot('11:00');
    const d1Deposits = (await depCount()) - d1Before;
    const d1Collisions = d1.filter(isCollision).length;
    console.log(`  → appts=${d1Appts}  deposits=${d1Deposits}  collisions=${d1Collisions}  rejected=[${d1.filter(r=>r.status==='rejected').map(reason).join(' | ')}]`);
    check('D1.1 exactly 1 deposit-booking appt survived for the slot (NO double-book)', d1Appts === 1, `got ${d1Appts} appts for the same doctor+slot`);
    check('D1.2 exactly 1 deposit doc created (no double money record)', d1Deposits === 1, `got ${d1Deposits} deposits`);
    check('D1.3 the loser threw AP1_COLLISION (deposit path is now atomically guarded)', d1Collisions === 1, `collisions=${d1Collisions}`);

    // ── D2 — regular booking reserves slot, THEN deposit booking same slot ────
    console.log('\nD2 — createBackendAppointment 13:00-14:00 (reserves), then createDepositBookingPair same slot');
    await createBackendAppointment(apptPayload('13:00', '14:00'));
    let d2Rejected = false, d2Err = '';
    try { await createDepositBookingPair({ depositData: depositData('13:00', '14:00'), branchId: BR }); }
    catch (e) { d2Rejected = true; d2Err = e?.message || String(e); }
    check('D2.1 deposit booking REJECTED a slot already held by a regular booking', d2Rejected && /AP1_COLLISION/i.test(d2Err), `rejected=${d2Rejected} err=${d2Err}`);
    check('D2.2 still exactly 1 appt on the slot (cross-path guard held)', (await apptCountForSlot('13:00')) === 1, `got ${await apptCountForSlot('13:00')}`);

    // ── D3 — deposit booking reserves slot, THEN regular booking same slot ────
    console.log('\nD3 — createDepositBookingPair 15:00-16:00 (reserves), then createBackendAppointment same slot');
    await createDepositBookingPair({ depositData: depositData('15:00', '16:00'), branchId: BR });
    let d3Rejected = false, d3Err = '';
    try { await createBackendAppointment(apptPayload('15:00', '16:00')); }
    catch (e) { d3Rejected = true; d3Err = e?.message || String(e); }
    check('D3.1 regular booking REJECTED a slot already held by a deposit booking', d3Rejected && /AP1_COLLISION/i.test(d3Err), `rejected=${d3Rejected} err=${d3Err}`);
    check('D3.2 still exactly 1 appt on the slot (deposit reserved a real slot)', (await apptCountForSlot('15:00')) === 1, `got ${await apptCountForSlot('15:00')}`);

    // ── D4 — createAppointmentForExistingDeposit collides with a held slot ────
    console.log('\nD4 — createBackendAppointment 17:00-18:00 (reserves), then createAppointmentForExistingDeposit same slot');
    await createBackendAppointment(apptPayload('17:00', '18:00'));
    const depForD4 = `DEP-${Date.now()}-d4`;
    await data.collection('be_deposits').doc(depForD4).set({
      depositId: depForD4, customerId: CUST, customerName: 'TEST RACE', amount: 100, usedAmount: 0,
      remainingAmount: 100, status: 'active', hasAppointment: false, branchId: BR, usageHistory: [],
      createdAt: new Date().toISOString(),
    });
    let d4Rejected = false, d4Err = '';
    try {
      await createAppointmentForExistingDeposit(depForD4, {
        date: DATE, startTime: '17:00', endTime: '18:00', doctorId: DOC, doctorName: 'TEST DOC',
        customerId: CUST, customerName: 'TEST RACE', branchId: BR,
      });
    } catch (e) { d4Rejected = true; d4Err = e?.message || String(e); }
    check('D4.1 createAppointmentForExistingDeposit REJECTED a held slot', d4Rejected && /AP1_COLLISION/i.test(d4Err), `rejected=${d4Rejected} err=${d4Err}`);
    check('D4.2 still exactly 1 appt on the slot', (await apptCountForSlot('17:00')) === 1, `got ${await apptCountForSlot('17:00')}`);

    // ── D5 — slot RELEASE on cancel/delete of a deposit pair (no orphan slots) ─
    console.log('\nD5 — deposit booking reserves a slot; cancel/delete must release it so the time is bookable again');
    const d5a = await createDepositBookingPair({ depositData: depositData('19:00', '20:00'), branchId: BR });
    check('D5.1 deposit booking reserved its slot doc', await slotExists('19:00', '20:00'), 'no slot doc found after deposit create');
    await cancelDepositBookingPair(d5a.depositId, { cancelNote: 'e2e' });
    check('D5.2 cancelDepositBookingPair RELEASED the slot (now free)', !(await slotExists('19:00', '20:00')), 'slot still reserved after cancel — ORPHAN');
    // after release, a regular booking on the same slot must succeed
    let d5Rebook = true; try { await createBackendAppointment(apptPayload('19:00', '20:00')); } catch { d5Rebook = false; }
    check('D5.3 the freed slot is re-bookable', d5Rebook && (await apptCountForSlot('19:00')) === 1, `rebook=${d5Rebook} count=${await apptCountForSlot('19:00')}`);

    const d5b = await createDepositBookingPair({ depositData: depositData('20:30', '21:00'), branchId: BR });
    await deleteDepositBookingPair(d5b.depositId);
    check('D5.4 deleteDepositBookingPair RELEASED the slot (no orphan)', !(await slotExists('20:30', '21:00')), 'slot still reserved after delete — ORPHAN');

  } finally {
    // ── Cleanup — sweep everything under the TEST branch/doctor ──────────────
    console.log('\nCleanup');
    let deleted = 0;
    const sweep = async (colName, field, val) => {
      const snap = await data.collection(colName).where(field, '==', val).get();
      for (const d of snap.docs) { await d.ref.delete(); deleted++; }
    };
    try { await sweep('be_appointments', 'branchId', BR); } catch (e) { console.warn('appt sweep', e.message); }
    try { await sweep('be_deposits', 'branchId', BR); } catch (e) { console.warn('dep sweep', e.message); }
    try { await sweep('be_appointment_slots', 'doctorId', DOC); } catch (e) { console.warn('slot sweep', e.message); }
    try { await sweep('opd_sessions', 'branchId', BR); } catch { /* may not exist */ }
    try { await data.collection('be_branches').doc(BR).delete(); deleted++; } catch { /* noop */ }
    // verify zero orphans
    const orphanAppts = (await data.collection('be_appointments').where('branchId', '==', BR).get()).size;
    const orphanDeps = (await data.collection('be_deposits').where('branchId', '==', BR).get()).size;
    const orphanSlots = (await data.collection('be_appointment_slots').where('doctorId', '==', DOC).get()).size;
    check('CLEANUP zero orphans', orphanAppts + orphanDeps + orphanSlots === 0,
      `appts=${orphanAppts} deps=${orphanDeps} slots=${orphanSlots} (deleted ${deleted})`);
    try { await signOut(clientAuth); } catch { /* noop */ }
  }

  console.log(`\n${'═'.repeat(54)}`);
  console.log(`RESULT: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) console.log(`FAILS:\n - ${fails.join('\n - ')}`);
  console.log('(pre-fix: D1-D4 are EXPECTED RED — that red IS the bug proof on real prod)');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
