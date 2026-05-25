#!/usr/bin/env node
// ─── E2E — Deposit-aware cancel dialog (Rule Q L2 + Q-honest, 2026-05-26) ──
//
// What this verifies on REAL prod Firestore (admin SDK doc-level — NO new
// compound index + NO firestore.rules change, so admin-SDK is an acceptable L2;
// the dialog UI + choice→helper wiring are additionally covered by unit + RTL +
// flow-simulate + source-grep; real UI L1 = user post-deploy):
//
//   A  REAL-SHAPE decision check  → run the REAL resolveDepositCancelState on
//                                   REAL prod be_deposits docs (V66 mirror-risk:
//                                   does the helper handle real doc shapes, not
//                                   just hand-made fixtures?).  [READ-ONLY, Rule R]
//   B  pair setup                 → TEST- deposit+appt cross-linked + active
//   C  'both' outcome             → both docs hard-deleted (mirror deleteDepositBookingPair)
//   D  'appt-keep' outcome        → appt cancelled, deposit STILL active (deposit preserved)
//   E  'used-block' guard         → usedAmount>0 → resolveDepositCancelState(real doc).blocked
//   F  cleanup + audit doc        → 0 orphans
//
// HONEST SCOPE: the real client helpers (deleteDepositBookingPair / deleteDeposit
// / cancelDepositBookingPair) are client-SDK + pre-existing (proven by months of
// kiosk + AppointmentCalendarView + DepositPanel use); C/D mirror their documented
// doc-effect via admin SDK. The genuinely-new logic is the DECISION (A/E, run via
// the REAL helper) + the dialog (RTL) + the wiring (source-grep).
//
// USAGE:
//   node scripts/e2e-deposit-cancel-dialog.mjs            # dry-run (A read-only; B-F simulated)
//   node scripts/e2e-deposit-cancel-dialog.mjs --apply    # write TEST- fixtures + verify + cleanup

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveDepositCancelState } from '../src/lib/depositCancelDecision.js';

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
const NS = `${Date.now()}-${RUN_ID}`;
const DEP_ID = `TEST-DEPOSIT-${NS}`;
const APPT_ID = `TEST-APPT-${NS}`;

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
const header = (s) => console.log(`\n═══ ${s} ═══`);
const now = () => new Date().toISOString();
const depRef = (id) => db.doc(`${BASE}/be_deposits/${id}`);
const apptRef = (id) => db.doc(`${BASE}/be_appointments/${id}`);

async function main() {
  console.log(`\nDeposit-aware cancel dialog e2e — ${APPLY ? 'APPLY' : 'DRY-RUN'} — run ${RUN_ID}\n`);

  // ── A — REAL-SHAPE decision check (READ-ONLY, Rule R) ──
  header('A — resolveDepositCancelState vs REAL prod be_deposits shapes (V66 mirror-risk)');
  const snap = await db.collection(`${BASE}/be_deposits`).limit(25).get();
  console.log(`  (read ${snap.size} real deposits)`);
  let checked = 0, usedSeen = 0, cancelledSeen = 0;
  snap.forEach((d) => {
    const data = { id: d.id, ...d.data() };
    const st = resolveDepositCancelState(data);
    checked += 1;
    // contract: shape is always well-formed booleans/numbers (no throw on real data)
    assert(typeof st.hasDeposit === 'boolean' && typeof st.blocked === 'boolean'
      && typeof st.amount === 'number' && typeof st.usedAmount === 'number',
      `decision shape well-formed for real deposit ${d.id}`);
    // blocked iff usedAmount>0
    assert(st.blocked === ((Number(data.usedAmount) || 0) > 0), `blocked matches usedAmount>0 for ${d.id}`);
    // cancelled → not hasDeposit
    if (data.status === 'cancelled') { cancelledSeen += 1; assert(st.hasDeposit === false, `cancelled deposit ${d.id} → hasDeposit:false`); }
    if ((Number(data.usedAmount) || 0) > 0) usedSeen += 1;
  });
  console.log(`  (checked=${checked}, used=${usedSeen}, cancelled=${cancelledSeen})`);
  if (checked === 0) console.log('  (no real deposits to sample — A is a no-op this run)');

  if (!APPLY) {
    header('DRY-RUN — B-F skipped (pass --apply to write TEST- fixtures + verify + cleanup)');
    return report();
  }

  const created = [];
  try {
    // ── B — pair setup ──
    header('B — create TEST- deposit+appt pair (cross-linked, active)');
    await depRef(DEP_ID).set({
      depositId: DEP_ID, customerId: '', customerName: 'TEST cancel-dialog', customerHN: '',
      amount: 2000, usedAmount: 0, remainingAmount: 2000, status: 'active',
      hasAppointment: true, linkedAppointmentId: APPT_ID, branchId: null,
      createdAt: now(), updatedAt: now(),
    });
    created.push(['be_deposits', DEP_ID]);
    await apptRef(APPT_ID).set({
      appointmentId: APPT_ID, appointmentType: 'deposit-booking', status: 'confirmed',
      customerName: 'TEST cancel-dialog', date: now().slice(0, 10), startTime: '10:00', endTime: '10:30',
      linkedDepositId: DEP_ID, branchId: null, createdAt: now(), updatedAt: now(),
    });
    created.push(['be_appointments', APPT_ID]);
    const d0 = (await depRef(DEP_ID).get()).data();
    const a0 = (await apptRef(APPT_ID).get()).data();
    assert(d0.linkedAppointmentId === APPT_ID && a0.linkedDepositId === DEP_ID, 'pair cross-linked');
    assert(resolveDepositCancelState({ id: DEP_ID, ...d0 }).hasDeposit === true, 'fresh pair → hasDeposit:true');

    // ── C — 'both' outcome (mirror deleteDepositBookingPair) ──
    header("C — choice 'both' → both docs hard-deleted");
    await Promise.all([depRef(DEP_ID).delete(), apptRef(APPT_ID).delete()]);
    assert(!(await depRef(DEP_ID).get()).exists, "'both' → deposit gone");
    assert(!(await apptRef(APPT_ID).get()).exists, "'both' → linked appt gone");

    // ── D — 'appt-keep' outcome (cancel appt only; deposit preserved) ──
    header("D — choice 'appt-keep' → appt cancelled, deposit STILL active");
    await depRef(DEP_ID).set({
      depositId: DEP_ID, amount: 2000, usedAmount: 0, remainingAmount: 2000, status: 'active',
      linkedAppointmentId: APPT_ID, customerName: 'TEST cancel-dialog', createdAt: now(), updatedAt: now(),
    });
    await apptRef(APPT_ID).set({
      appointmentId: APPT_ID, appointmentType: 'deposit-booking', status: 'confirmed',
      linkedDepositId: DEP_ID, customerName: 'TEST cancel-dialog', createdAt: now(), updatedAt: now(),
    });
    await apptRef(APPT_ID).update({ status: 'cancelled', updatedAt: now() }); // keep path = cancel appt only
    const dKeep = (await depRef(DEP_ID).get()).data();
    const aKeep = (await apptRef(APPT_ID).get()).data();
    assert(aKeep.status === 'cancelled', "'appt-keep' → appt cancelled");
    assert(dKeep && dKeep.status === 'active', "'appt-keep' → deposit STILL active (preserved)");
    assert(resolveDepositCancelState({ id: DEP_ID, ...dKeep }).hasDeposit === true, "'appt-keep' → deposit still usable");

    // ── E — 'used-block' guard ──
    header('E — usedAmount>0 → decision blocks the hard-delete choice');
    await depRef(DEP_ID).update({ usedAmount: 500, remainingAmount: 1500, updatedAt: now() });
    const dUsed = (await depRef(DEP_ID).get()).data();
    assert(resolveDepositCancelState({ id: DEP_ID, ...dUsed }).blocked === true, 'used deposit → blocked:true (real prod doc)');
  } finally {
    // ── F — cleanup + audit ──
    header('F — cleanup + audit doc');
    for (const [col, id] of created) {
      try { await db.doc(`${BASE}/${col}/${id}`).delete(); } catch { /* already gone */ }
    }
    const dGone = !(await depRef(DEP_ID).get()).exists;
    const aGone = !(await apptRef(APPT_ID).get()).exists;
    assert(dGone && aGone, 'cleanup → 0 orphans');
    if (APPLY) {
      const auditId = `e2e-deposit-cancel-dialog-${Date.now()}-${randomBytes(4).toString('hex')}`;
      await db.doc(`${BASE}/be_admin_audit/${auditId}`).set({
        op: 'e2e-deposit-cancel-dialog', runId: RUN_ID, pass, fail, fails, appliedAt: now(),
      });
      console.log(`  audit → be_admin_audit/${auditId}`);
    }
  }
  report();
}

function report() {
  console.log(`\n═══ RESULT — PASS ${pass} · FAIL ${fail} ═══`);
  if (fail) { console.log('FAILS:'); fails.forEach((f) => console.log('  - ' + f)); process.exitCode = 1; }
}

main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
