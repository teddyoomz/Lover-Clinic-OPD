#!/usr/bin/env node
// ─── E2E — no-appointment deposit (V-deposit-noappt, Rule Q L2, 2026-05-27) ──
//
// Verifies on REAL prod Firestore the be_deposits DATA CONTRACT that the new
// ไม่นัดหมาย (deposit-only) flow relies on. The doc shape is hand-built to match
// createDeposit's REAL payload (backendClient.js :4391 + the V-deposit-noappt
// purpose/customerNameTemp/customerPhoneTemp additions). There are NO new
// compound-index queries + NO new firestore.rules, so admin-SDK doc-level
// set/get is an acceptable L2 (the helper JS + UI gate are covered by unit +
// flow-simulate + RTL; the real UI L1 = user hands-on).
//
//   A  setup TEST branch
//   B  pickLater no-appt deposit  → customerId '', temp name+phone, purpose top-level,
//                                   advisor→100% seller, hasAppointment:false, no appointment doc
//   C  table column resolver       → resolvePurpose(dep) === dep.purpose when no appointment
//   D  existing-HN no-appt deposit → customerId set, purpose shows, hasAppointment:false
//   E  cleanup + audit             → 0 orphans
//
// USAGE:
//   node scripts/e2e-deposit-no-appointment.mjs            # dry-run (no writes)
//   node scripts/e2e-deposit-no-appointment.mjs --apply    # write + verify + cleanup

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
const NS = `TEST-DEPOSIT-NOAPPT-${Date.now()}-${RUN_ID}`;

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

const cleanup = { be_branches: [], be_deposits: [] };
const track = (col, id) => cleanup[col].push(id);

// Mirror of createDeposit's payload (backendClient.js :4391) for a deposit-only
// (no-appointment) write — hasAppointment:false → appointment:null, plus the
// V-deposit-noappt purpose/customerNameTemp/customerPhoneTemp fields.
function noApptDepositShape({ depositId, branchId, pickLater, customerId, customerName, customerHN, customerNameTemp, customerPhoneTemp, amount, paymentChannel, paymentDate, purpose, advisorId, advisorName }) {
  const sellers = advisorId ? [{ sellerId: advisorId, sellerName: advisorName || '', percent: 100, total: amount }] : [];
  return {
    depositId,
    customerId: pickLater ? '' : (customerId || ''),
    customerName: pickLater ? (customerNameTemp || '') : (customerName || ''),
    customerHN: pickLater ? '' : (customerHN || ''),
    customerNameTemp: customerNameTemp || '',
    customerPhoneTemp: customerPhoneTemp || '',
    purpose: purpose || '',
    amount, usedAmount: 0, remainingAmount: amount,
    paymentChannel: paymentChannel || '', paymentDate: paymentDate || now().slice(0, 10), paymentTime: '', refNo: '',
    sellers, customerSource: '', sourceDetail: '',
    hasAppointment: false, appointment: null,
    note: '', status: 'active', cancelNote: '', cancelEvidenceUrl: '', cancelledAt: null,
    refundAmount: 0, refundChannel: '', refundDate: null,
    paymentEvidenceUrl: '', paymentEvidencePath: '', proClinicDepositId: null,
    usageHistory: [], branchId: branchId || null,
    createdAt: now(), updatedAt: now(),
  };
}

// Mirror of the deposit-table มัดจำสำหรับ column resolver (DepositPanel cell).
const resolvePurpose = (dep) =>
  dep.appointment?.purpose || dep.appointment?.appointmentTo || dep.purpose || '';

async function getDoc(col, id) {
  const snap = await db.doc(`${BASE}/${col}/${id}`).get();
  return snap.exists ? snap.data() : null;
}

async function run() {
  console.log(`\n🔬 no-appointment deposit E2E — ${APPLY ? 'APPLY (real writes)' : 'DRY-RUN'}  ns=${NS}`);

  header('A — Setup TEST branch');
  const branchId = `${NS}-BR`;
  if (APPLY) {
    await db.doc(`${BASE}/be_branches/${branchId}`).set({ branchId, name: `${NS}-Branch`, status: 'active', createdAt: now() });
    track('be_branches', branchId);
  }
  assert(true, 'A.0 fixtures provisioned');
  if (!APPLY) { console.log('\n(DRY-RUN — pass --apply to write + verify on real prod)\n'); return; }

  // ── B — pickLater no-appointment deposit ──
  header('B — pickLater no-appt deposit (deposit-only, advisor→seller, purpose top-level)');
  const dep1 = `${NS}-DEP1`;
  const purpose1 = 'สมรรถภาพ, อื่นๆ: ผ่ามุก';
  await db.doc(`${BASE}/be_deposits/${dep1}`).set(noApptDepositShape({
    depositId: dep1, branchId, pickLater: true,
    customerNameTemp: 'อี-ทู-อี สมหญิง', customerPhoneTemp: '081-234-5678',
    amount: 2000, paymentChannel: 'เงินสด', paymentDate: '2026-05-27',
    purpose: purpose1, advisorId: `${NS}-ADV`, advisorName: 'พญ. กานต์',
  }));
  track('be_deposits', dep1);
  let d = await getDoc('be_deposits', dep1);
  assertEq(d.hasAppointment, 'false', 'B.1 hasAppointment = false (deposit-only)');
  assert(d.appointment === null, 'B.2 appointment = null (no be_appointments doc)');
  assertEq(d.purpose, purpose1, 'B.3 purpose stored top-level');
  assertEq(d.customerId, '', 'B.4 customerId empty (pickLater)');
  assertEq(d.customerNameTemp, 'อี-ทู-อี สมหญิง', 'B.5 customerNameTemp stored');
  assertEq(d.customerPhoneTemp, '081-234-5678', 'B.6 customerPhoneTemp stored');
  assertEq(d.remainingAmount, 2000, 'B.7 remainingAmount = amount');
  assertEq(d.status, 'active', 'B.8 status = active');
  assertEq(d.branchId, branchId, 'B.9 branchId stamped');
  assertEq(d.sellers?.length, 1, 'B.10 advisor → 1 seller');
  assertEq(d.sellers?.[0]?.percent, 100, 'B.11 seller = 100%');
  assertEq(d.sellers?.[0]?.total, 2000, 'B.12 seller total = amount');

  // ── C — table column resolver ──
  header('C — Finance.มัดจำ "มัดจำสำหรับ" column resolves from dep.purpose');
  assertEq(resolvePurpose(d), purpose1, 'C.1 resolvePurpose(no-appt dep) === dep.purpose');
  assertEq(resolvePurpose({ appointment: { purpose: 'X' }, purpose: 'Y' }), 'X', 'C.2 appointment.purpose still wins (regression)');
  assertEq(resolvePurpose({ purpose: '' , appointment: null }), '', 'C.3 empty → "" (dash rendered)');

  // ── D — existing-HN no-appt deposit ──
  header('D — existing-HN no-appt deposit (customerId set)');
  const dep2 = `${NS}-DEP2`;
  await db.doc(`${BASE}/be_deposits/${dep2}`).set(noApptDepositShape({
    depositId: dep2, branchId, pickLater: false,
    customerId: `${NS}-CUST`, customerName: 'คุณสมชาย', customerHN: `${NS}-HN`,
    amount: 1500, paymentChannel: 'โอน', paymentDate: '2026-05-27', purpose: 'ปรึกษา',
  }));
  track('be_deposits', dep2);
  const d2 = await getDoc('be_deposits', dep2);
  assertEq(d2.customerId, `${NS}-CUST`, 'D.1 customerId set (existing HN)');
  assertEq(d2.customerNameTemp, '', 'D.2 no temp name for HN customer');
  assertEq(d2.hasAppointment, 'false', 'D.3 hasAppointment = false');
  assertEq(resolvePurpose(d2), 'ปรึกษา', 'D.4 column shows purpose');

  // ── E — cleanup + audit ──
  header('E — cleanup + audit');
  let deleted = 0;
  for (const col of Object.keys(cleanup)) {
    for (const id of cleanup[col]) { await db.doc(`${BASE}/${col}/${id}`).delete(); deleted += 1; }
  }
  let orphans = 0;
  for (const col of Object.keys(cleanup)) {
    for (const id of cleanup[col]) { if (await getDoc(col, id)) orphans += 1; }
  }
  assertEq(orphans, 0, `E.1 zero orphans (deleted ${deleted})`);
  const auditId = `deposit-no-appointment-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${BASE}/be_admin_audit/${auditId}`).set({
    op: 'e2e-deposit-no-appointment', ns: NS, pass, fail, deleted, appliedAt: now(),
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
