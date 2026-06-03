#!/usr/bin/env node
// ─── appointment loop R6 — deposit↔reminder + deposit cancel/delete atomicity +
//     appt↔treatment link-clear (Rule Q V66 L2 on REAL prod) ──────────────────
//
// User (2026-06-03): "ทำ looping bug hunt ... audit ทุกอย่างว่าความสัมพันธ์ระหว่าง
//   ระบบ appointment กับระบบอื่นๆ ... ไร้บั๊ค ไร้ Edge Case ... รับมือความเสียหาย
//   ระดับหลายล้าน". Round 6 convergence-hunt findings, each verified on prod:
//
//   A (P1, V67-class): buildAppointmentPairPayload DROPPED notifyChannel → every
//      deposit-booking got NO LINE reminder, silently (cron filters
//      notifyChannel.includes('line')). FIX carries it through.
//   B (P2): a keep-deposit appointment delete left deposit.linkedAppointmentId
//      dangling → cancelDepositBookingPair's blind batch.update(deleted appt)
//      threw NOT_FOUND → the deposit became permanently un-cancellable. FIX reads
//      the appt in-tx, updates only if it exists.
//   C+D (P1, Rule T): cancel/delete pair were getDoc→writeBatch (non-atomic) → a
//      concurrent applyDepositToSale (usedAmount 0→amt) lost-updated → a cancelled
//      deposit with positive used funds (re-spendable / stranded money). FIX
//      re-guards usedAmount IN a runTransaction (OCC serializes).
//   E (P1): a treatment created FROM an appointment stamps appt.linkedTreatmentId
//      (R4, double-charge guard) but NOTHING cleared it on treatment delete → the
//      appointment was bricked ("treated" forever, can't re-record). FIX clears it
//      at the shared deleteBackendTreatment chokepoint.
//
// Rule Q V66 L2: admin custom token → CLIENT SDK signIn → SHIPPED client fns on
//   REAL prod Firestore. Rule M/R: TEST- namespace + far-future date (no real
//   collision, no cron) + try/finally zero-orphan cleanup.
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
  deleteBackendAppointment,
  deleteBackendTreatment,
  applyDepositToSale,
} from '../src/lib/backendClient.js';
import {
  createDepositBookingPair,
  cancelDepositBookingPair,
} from '../src/lib/appointmentDepositBatch.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-APPTR6-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
const BR = `${NS}-BR`;
const DOC = `${NS}-DOC`;
const CUST = `${NS}-CUST`;
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

const depositData = (start, end, notifyChannel = ['line']) => ({
  customerId: CUST, customerName: 'TEST R6', customerHN: '',
  amount: 100, paymentChannel: 'cash', paymentDate: DATE,
  sellers: [], note: 'e2e r6',
  hasAppointment: true,
  appointment: { date: DATE, startTime: start, endTime: end, doctorId: DOC, doctorName: 'TEST DOC', purpose: 'test', notifyChannel },
  branchId: BR,
});

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const getAppt = async (id) => { const s = await data.collection('be_appointments').doc(id).get(); return s.exists ? s.data() : null; };
  const getDep = async (id) => { const s = await data.collection('be_deposits').doc(id).get(); return s.exists ? s.data() : null; };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} (admin) — SHIPPED client fns on REAL prod`);
    console.log(`NS=${NS}  date=${DATE}\n`);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'APPTR6', isDefault: false });
    // minimal customer doc so applyDepositToSale's balance-recalc doesn't NOT_FOUND
    await data.collection('be_customers').doc(CUST).set({ id: CUST, name: 'TEST R6', branchId: BR, finance: {} });

    // ── A — deposit-booking carries notifyChannel → cron-eligible ────────────
    console.log('A — createDepositBookingPair(appointment.notifyChannel=[line]) → appt doc has notifyChannel');
    const a = await createDepositBookingPair({ depositData: depositData('09:00', '10:00', ['line']), branchId: BR });
    const aAppt = await getAppt(a.appointmentId);
    check('A.1 deposit-booking appt persists notifyChannel=[line] (reminder fires)',
      Array.isArray(aAppt?.notifyChannel) && aAppt.notifyChannel.includes('line'),
      `notifyChannel=${JSON.stringify(aAppt?.notifyChannel)} (pre-fix: undefined → cron SKIPS → no reminder)`);
    const a2 = await createDepositBookingPair({ depositData: depositData('08:00', '09:00', []), branchId: BR });
    const a2Appt = await getAppt(a2.appointmentId);
    check('A.2 a no-LINE deposit-booking carries [] (field mirrors the UI choice, no false opt-in)',
      Array.isArray(a2Appt?.notifyChannel) && a2Appt.notifyChannel.length === 0,
      `notifyChannel=${JSON.stringify(a2Appt?.notifyChannel)}`);

    // ── B — un-cancellable deposit after keep-deposit appt delete ────────────
    console.log('\nB — keep-deposit appt delete leaves dangling FK; cancelDepositBookingPair must NOT throw NOT_FOUND');
    const b = await createDepositBookingPair({ depositData: depositData('11:00', '12:00'), branchId: BR });
    await deleteBackendAppointment(b.appointmentId);   // appt gone; deposit.linkedAppointmentId still = b.appointmentId
    check('B.0 appt deleted (the keep-deposit path)', (await getAppt(b.appointmentId)) === null, 'appt still present');
    let bThrew = false, bErr = '';
    try { await cancelDepositBookingPair(b.depositId); } catch (e) { bThrew = true; bErr = e?.message || String(e); }
    check('B.1 cancel did NOT throw on the deleted appt (deposit is cancellable)', !bThrew, `threw: ${bErr}`);
    check('B.2 the deposit is now cancelled', (await getDep(b.depositId))?.status === 'cancelled', 'not cancelled');

    // ── C — atomic guard: cancel REFUSES a used deposit (in-tx re-read) ──────
    console.log('\nC — applyDepositToSale (usedAmount>0) then cancel → cancel must REFUSE (in-tx guard)');
    const c = await createDepositBookingPair({ depositData: depositData('13:00', '14:00'), branchId: BR });
    await applyDepositToSale(c.depositId, `TEST-SALE-${NS}-c`, 50);   // usedAmount=50
    let cThrew = false;
    try { await cancelDepositBookingPair(c.depositId); } catch { cThrew = true; }
    check('C.1 cancel THREW (refused to cancel a partly-used deposit)', cThrew, 'cancel did not refuse');
    const cDep = await getDep(c.depositId);
    check('C.2 deposit stays NOT cancelled + funds intact (no lost-update)',
      cDep?.status !== 'cancelled' && Number(cDep?.usedAmount) === 50,
      `status=${cDep?.status} used=${cDep?.usedAmount} remaining=${cDep?.remainingAmount}`);

    // ── D — CONCURRENCY consistency: cancel ‖ apply never strands money ──────
    console.log('\nD — cancel ‖ applyDepositToSale (concurrent) → never (cancelled AND usedAmount>0)');
    let dViolations = 0;
    const dStarts = ['15:00', '18:00', '19:00', '20:00'];   // distinct non-overlapping slots
    const dEnds = ['16:00', '19:00', '20:00', '21:00'];
    for (let i = 0; i < 4; i++) {
      const d = await createDepositBookingPair({ depositData: depositData(dStarts[i], dEnds[i]), branchId: BR });
      await Promise.allSettled([
        cancelDepositBookingPair(d.depositId),
        applyDepositToSale(d.depositId, `TEST-SALE-${NS}-d${i}`, 50),
      ]);
      const dDep = await getDep(d.depositId);
      // The lost-update bug: cancel's blind batch zeroes remaining while apply's
      // usedAmount survives → a cancelled deposit holding 50 used = stranded money.
      const corrupt = dDep?.status === 'cancelled' && Number(dDep?.usedAmount) > 0;
      if (corrupt) dViolations++;
    }
    check('D.1 across 4 concurrent rounds: ZERO cancelled-with-used-funds (atomic, no lost-update)',
      dViolations === 0, `${dViolations}/4 corrupt (cancelled while usedAmount>0)`);

    // ── E — treatment delete CLEARS the appointment's dangling linkedTreatmentId ─
    console.log('\nE — appt.linkedTreatmentId stamped, then treatment deleted → link must CLEAR (un-brick the appt)');
    const e = await createBackendAppointment({
      date: DATE, startTime: '17:00', endTime: '18:00', doctorId: DOC, doctorName: 'TEST DOC',
      customerId: CUST, customerName: 'TEST R6', customerHN: '', branchId: BR, status: 'confirmed',
    });
    const btId = `TEST-BT-${NS}-e`;
    await updateBackendAppointment(e.appointmentId, { linkedTreatmentId: btId });   // R4 stamp
    check('E.0 appt.linkedTreatmentId stamped', (await getAppt(e.appointmentId))?.linkedTreatmentId === btId, 'not stamped');
    // minimal treatment doc so deleteBackendTreatment's read path is exercised
    await data.collection('be_treatments').doc(btId).set({ treatmentId: btId, customerId: CUST, branchId: BR, detail: {} });
    await deleteBackendTreatment(btId);
    check('E.1 deleting the treatment CLEARED appt.linkedTreatmentId (appt re-recordable, not bricked)',
      (await getAppt(e.appointmentId))?.linkedTreatmentId === '',
      `still=${JSON.stringify((await getAppt(e.appointmentId))?.linkedTreatmentId)} (pre-fix: dangling dead id forever)`);

  } finally {
    console.log('\nCleanup');
    let deleted = 0;
    const sweep = async (c, f, v) => {
      const s = await data.collection(c).where(f, '==', v).get();
      for (const d of s.docs) { await d.ref.delete(); deleted++; }
    };
    await sweep('be_appointments', 'branchId', BR);
    await sweep('be_deposits', 'branchId', BR);
    await sweep('be_appointment_slots', 'doctorId', DOC);    // doctor slot keys
    // room slot keys carry ROOM__ prefix + the (empty) roomId; appts had no room → none
    await sweep('be_treatments', 'branchId', BR);
    await data.collection('be_customers').doc(CUST).delete().then(() => deleted++).catch(() => {});
    await data.collection('be_branches').doc(BR).delete().then(() => deleted++).catch(() => {});
    // orphan-slot belt: any slot doc whose key embeds our date+doctor
    const allSlots = await data.collection('be_appointment_slots').get();
    for (const d of allSlots.docs) { if (d.id.includes(DOC)) { await d.ref.delete(); deleted++; } }
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
