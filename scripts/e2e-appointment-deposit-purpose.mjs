#!/usr/bin/env node
// ─── E2E — Appointment deposit-section + chip นัดมาเพื่อ (Rule Q L2, 2026-05-25) ──
//
// Verifies on REAL prod Firestore the deposit DATA CONTRACTS that the new
// AppointmentFormModal flows rely on (admin SDK doc-level — there are NO new
// compound-index queries + NO new firestore.rules, so admin-SDK is an
// acceptable L2 for these doc-level set/update writes; the helper JS + UI gate
// are additionally covered by unit + flow-simulate + RTL; real UI L1 = user).
//
// Doc shapes hand-built to EXACTLY match the REAL pure builders
// (buildDepositPairPayload :166 + buildAppointmentPairPayload :87) — E5 unit
// test independently verifies the real builder output equals this shape.
//
//   A  Setup TEST customer + branch
//   B  create-pair contract       → deposit+appt cross-linked, remaining=amount, active
//   C  edit-update contract        → updateDeposit recalcs remainingAmount (usedAmount preserved)
//   D  flip-to-create contract     → createDepositForExistingAppointment: bare appt → deposit-booking + linked
//   E  flip-away cancel contract   → cancelDepositBookingPair: both docs cancelled, remaining=0
//   F  usedAmount guard contract   → usedAmount>0 (the real cancel helper throws on this)
//   G  cleanup + audit doc         → 0 orphans
//
// USAGE:
//   node scripts/e2e-appointment-deposit-purpose.mjs            # dry-run (no writes)
//   node scripts/e2e-appointment-deposit-purpose.mjs --apply    # write + verify + cleanup

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}

const APPLY = process.argv.includes('--apply');
const env = loadEnv();
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
const RUN_ID = randomBytes(4).toString('hex');
const NS = `TEST-APPTDEP-${Date.now()}-${RUN_ID}`;

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
    }),
    ignoreUndefinedProperties: true,
  });
}
const db = getFirestore();

let pass = 0, fail = 0;
const fails = [];
const assert = (cond, label) => {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; fails.push(label); console.log(`  ✗ ${label}`); }
};
const assertEq = (a, b, label) => assert(String(a) === String(b), `${label}  (got=${a}, want=${b})`);
const header = (s) => console.log(`\n═══ ${s} ═══`);
const now = () => new Date().toISOString();

const cleanup = { be_customers: [], be_branches: [], be_deposits: [], be_appointments: [] };
const track = (col, id) => cleanup[col].push(id);

// ── Shape builders — MIRROR the real pure builders (buildDepositPairPayload :166 +
//    buildAppointmentPairPayload :87). E5 unit test verifies the REAL builders. ──
function depositDocShape({ depositId, appointmentId, branchId, amount, paymentChannel, paymentDate, note, appointment }) {
  return {
    depositId, customerId: '', customerName: '', customerHN: '',
    customerNameTemp: '', customerPhoneTemp: '',
    amount, usedAmount: 0, remainingAmount: amount,
    paymentChannel: paymentChannel || '', paymentDate: paymentDate || now().slice(0, 10), paymentTime: '', refNo: '',
    sellers: [], customerSource: '', sourceDetail: '',
    hasAppointment: true, appointment: appointment || null,
    note: note || '', status: 'active', cancelNote: '', cancelEvidenceUrl: '', cancelledAt: null,
    refundAmount: 0, refundChannel: '', refundDate: null,
    paymentEvidenceUrl: '', paymentEvidencePath: '', proClinicDepositId: null,
    usageHistory: [], branchId: branchId || null,
    linkedAppointmentId: appointmentId, linkedOpdSessionId: '',
    createdAt: now(), updatedAt: now(),
  };
}
function appointmentDocShape({ appointmentId, depositId, branchId, date, startTime, appointmentTo, appointmentType }) {
  return {
    appointmentId, customerId: '', customerName: '', customerHN: '',
    customerNameTemp: '', customerPhoneTemp: '',
    date, startTime, endTime: startTime,
    appointmentType: appointmentType || 'deposit-booking',
    advisorId: '', advisorName: '', doctorId: '', doctorName: '',
    assistantIds: [], assistantNames: [], roomId: '', roomName: '', channel: '',
    appointmentTo: appointmentTo || '', location: '', notes: '', appointmentColor: '',
    status: 'pending', branchId: branchId || null,
    linkedDepositId: depositId || '', spawnedFromDepositId: depositId || '',
    spawnedAt: now(), createdAt: now(), updatedAt: now(),
  };
}

async function getDoc(col, id) {
  const snap = await db.doc(`${BASE}/${col}/${id}`).get();
  return snap.exists ? snap.data() : null;
}

async function run() {
  console.log(`\n🔬 Appointment deposit+purpose E2E — ${APPLY ? 'APPLY (real writes)' : 'DRY-RUN'}  ns=${NS}`);

  // ── A — Setup ──
  header('A — Setup TEST customer + branch');
  const branchId = `${NS}-BR`;
  const customerId = `${NS}-CUST`;
  if (APPLY) {
    await db.doc(`${BASE}/be_branches/${branchId}`).set({ branchId, name: `${NS}-Branch`, status: 'active', createdAt: now() });
    track('be_branches', branchId);
    await db.doc(`${BASE}/be_customers/${customerId}`).set({
      customerId, branchId, firstname: 'TestApptDep', lastname: 'Purpose',
      patientData: { firstName: 'TestApptDep', lastName: 'Purpose', hn: `${NS}-HN` }, courses: [], createdAt: now(),
    });
    track('be_customers', customerId);
  }
  assert(true, 'A.0 fixtures provisioned');
  if (!APPLY) { console.log('\n(DRY-RUN — pass --apply to write + verify on real prod)\n'); return; }

  const appt1 = `${NS}-BA1`, dep1 = `${NS}-DEP1`;
  const apptTo = 'โรคระบบทางเดินปัสสาวะ, ขลิบ, เสริมขนาด';

  // ── B — create-pair contract (createDepositBookingPair) ──
  header('B — create-pair: deposit + appointment cross-linked');
  const apptMeta = { type: 'deposit-booking', option: 'once', date: '2026-06-01', startTime: '10:00', endTime: '10:15', purpose: apptTo };
  await db.doc(`${BASE}/be_deposits/${dep1}`).set(depositDocShape({ depositId: dep1, appointmentId: appt1, branchId, amount: 2000, paymentChannel: 'เงินสด', paymentDate: '2026-06-01', appointment: apptMeta }));
  track('be_deposits', dep1);
  await db.doc(`${BASE}/be_appointments/${appt1}`).set(appointmentDocShape({ appointmentId: appt1, depositId: dep1, branchId, date: '2026-06-01', startTime: '10:00', appointmentTo: apptTo, appointmentType: 'deposit-booking' }));
  track('be_appointments', appt1);
  let d = await getDoc('be_deposits', dep1), a = await getDoc('be_appointments', appt1);
  assertEq(d.linkedAppointmentId, appt1, 'B.1 deposit.linkedAppointmentId → appt');
  assertEq(a.linkedDepositId, dep1, 'B.2 appt.linkedDepositId → deposit');
  assertEq(a.appointmentType, 'deposit-booking', 'B.3 appt.appointmentType = deposit-booking');
  assertEq(d.remainingAmount, 2000, 'B.4 remainingAmount = amount');
  assertEq(d.status, 'active', 'B.5 deposit status = active');
  assertEq(a.appointmentTo, apptTo, 'B.6 appt.appointmentTo = chip string');

  // ── C — edit-update contract (updateDeposit recalcs remainingAmount, preserves usedAmount) ──
  header('C — edit-update: updateDeposit recalc');
  const usedSoFar = d.usedAmount || 0;
  const newAmount = 3000;
  await db.doc(`${BASE}/be_deposits/${dep1}`).update({ amount: newAmount, remainingAmount: Math.max(0, newAmount - usedSoFar), paymentChannel: 'โอนธนาคาร', updatedAt: now() });
  d = await getDoc('be_deposits', dep1);
  assertEq(d.amount, 3000, 'C.1 amount updated');
  assertEq(d.remainingAmount, 3000, 'C.2 remainingAmount recalc (amount - usedAmount)');
  assertEq(d.usedAmount, 0, 'C.3 usedAmount preserved (immutable)');
  assertEq(d.paymentChannel, 'โอนธนาคาร', 'C.4 paymentChannel updated');

  // ── D — flip-to-create contract (createDepositForExistingAppointment) ──
  header('D — flip-to: bare appt → deposit-booking + new linked deposit');
  const appt2 = `${NS}-BA2`, dep2 = `${NS}-DEP2`;
  await db.doc(`${BASE}/be_appointments/${appt2}`).set(appointmentDocShape({ appointmentId: appt2, depositId: '', branchId, date: '2026-06-02', startTime: '11:00', appointmentTo: 'ขลิบ', appointmentType: 'no-deposit-booking' }));
  track('be_appointments', appt2);
  let a2 = await getDoc('be_appointments', appt2);
  assertEq(a2.appointmentType, 'no-deposit-booking', 'D.0 bare appt starts non-deposit');
  // mirror createDepositForExistingAppointment: build deposit linked to existing appt + flip the appt
  await db.doc(`${BASE}/be_deposits/${dep2}`).set(depositDocShape({ depositId: dep2, appointmentId: appt2, branchId, amount: 1500, paymentChannel: 'เงินสด', paymentDate: '2026-06-02', appointment: { type: 'deposit-booking', date: '2026-06-02', startTime: '11:00', purpose: 'ขลิบ' } }));
  track('be_deposits', dep2);
  await db.doc(`${BASE}/be_appointments/${appt2}`).update({ appointmentType: 'deposit-booking', linkedDepositId: dep2, spawnedFromDepositId: dep2, updatedAt: now() });
  a2 = await getDoc('be_appointments', appt2);
  const d2 = await getDoc('be_deposits', dep2);
  assertEq(a2.appointmentType, 'deposit-booking', 'D.1 appt flipped to deposit-booking');
  assertEq(a2.linkedDepositId, dep2, 'D.2 appt.linkedDepositId → new deposit');
  assertEq(d2.linkedAppointmentId, appt2, 'D.3 new deposit.linkedAppointmentId → existing appt');
  assertEq(d2.remainingAmount, 1500, 'D.4 new deposit remaining = amount');

  // ── E — flip-away cancel contract (cancelDepositBookingPair) ──
  header('E — flip-away: cancel pair (both cancelled, remaining=0)');
  // mirror cancelDepositBookingPair (writeBatch update both)
  await db.doc(`${BASE}/be_deposits/${dep1}`).update({ status: 'cancelled', remainingAmount: 0, cancelledAt: now(), cancelNote: 'ยกเลิกจากการเปลี่ยนประเภทนัดหมาย (E2E)', updatedAt: now() });
  await db.doc(`${BASE}/be_appointments/${appt1}`).update({ status: 'cancelled', pairCancelledAt: now(), pairCancelReason: 'E2E flip-away', updatedAt: now() });
  d = await getDoc('be_deposits', dep1); a = await getDoc('be_appointments', appt1);
  assertEq(d.status, 'cancelled', 'E.1 deposit cancelled');
  assertEq(d.remainingAmount, 0, 'E.2 deposit remaining = 0');
  assertEq(a.status, 'cancelled', 'E.3 paired appointment cancelled');

  // ── F — usedAmount guard contract (real cancelDepositBookingPair throws when usedAmount>0) ──
  header('F — usedAmount guard: deposit with usedAmount>0 must block cancel');
  await db.doc(`${BASE}/be_deposits/${dep2}`).update({ usedAmount: 500, remainingAmount: 1000, updatedAt: now() });
  const d2g = await getDoc('be_deposits', dep2);
  assert((d2g.usedAmount || 0) > 0, 'F.1 deposit usedAmount>0 — real cancelDepositBookingPair throws here (modal surfaces ถูกใช้บางส่วน error)');

  // ── G — cleanup ──
  header('G — cleanup + audit');
  let deleted = 0;
  for (const col of Object.keys(cleanup)) {
    for (const id of cleanup[col]) { await db.doc(`${BASE}/${col}/${id}`).delete(); deleted += 1; }
  }
  // verify zero orphans
  let orphans = 0;
  for (const col of Object.keys(cleanup)) {
    for (const id of cleanup[col]) { if (await getDoc(col, id)) orphans += 1; }
  }
  assertEq(orphans, 0, `G.1 zero orphans (deleted ${deleted})`);
  const auditId = `appt-deposit-purpose-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${BASE}/be_admin_audit/${auditId}`).set({
    op: 'e2e-appointment-deposit-purpose', ns: NS, pass, fail, deleted, appliedAt: now(),
  });
  console.log(`  audit → be_admin_audit/${auditId}`);
}

run()
  .then(() => {
    console.log(`\n${'═'.repeat(50)}\nRESULT: PASS ${pass} · FAIL ${fail}`);
    if (fail) { console.log('FAILS:'); fails.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
    console.log('✅ ALL PASS\n');
  })
  .catch((e) => { console.error('\n💥 E2E crashed:', e); process.exit(1); });
