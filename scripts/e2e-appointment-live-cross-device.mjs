#!/usr/bin/env node
// ─── E2E — Appointment page LIVE cross-device (Rule Q L2, 2026-05-27) ────────
//
// Proves on REAL prod Firestore that the appointment-page trigger listeners
// DELIVER changes cross-process (= cross-device) in real time, for EVERY
// scenario. A SEPARATE process (this script's onSnapshot subscriptions) plays
// "device B (admin watching the page)"; the writes play "device A (doctor /
// admin acting)". If device B's subscription reflects device A's write within
// the timeout WITHOUT re-querying, the live trigger fires → in the app that
// bumps liveRefreshTick → loadAll → cards/OPD-stepper re-render.
//
// The subscriptions mirror the EXACT queries the hub's listeners issue:
//   treatments  : onSnapshot(be_treatments) whole-collection + client-filter
//                 (detail.treatmentDate in [from,to], status!=cancelled, allBranches)
//                 — mirror listenToTreatmentsByDateRange  (NO index)
//   deposits    : onSnapshot(be_deposits where branchId==BR_A)  — single-field (auto-index)
//   sales       : onSnapshot(be_sales where saleDate>=since)    — allBranches, single-field (auto-index)
//   appointments: onSnapshot(be_appointments where branchId==BR_A) — single-field
//
// V66 note: every query above is index-free OR single-field (NO composite), so
// admin-SDK onSnapshot delivery is identical to the client SDK (the admin-vs-
// client composite-index divergence does NOT apply here — verified statically:
// no be_sales composite in firestore.indexes.json; the sales listener is
// allBranches saleDate-only by design to stay index-free).
//
// HONEST SCOPE: this proves the LISTENER-DELIVERY layer for all scenarios. The
// React repaint (loadAll → stepper pixels) is wiring-verified (source-grep +
// flow-simulate + full suite) + uses the EXISTING proven loadAll path; the
// browser pixel render = user hands-on (login barrier — I cannot log in).
//
// USAGE:  node scripts/e2e-appointment-live-cross-device.mjs --apply

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
const RUN = randomBytes(3).toString('hex');

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
const col = (c) => db.collection(`${BASE}/${c}`);

let pass = 0, fail = 0; const fails = [];
const assert = (cond, label) => {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; fails.push(label); console.log(`  ✗ ${label}`); }
};
const header = (s) => console.log(`\n═══ ${s} ═══`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bangkok (UTC+7) today + windows
const todayISO = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const shift = (d, days) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const FROM = shift(todayISO, -30), TO = shift(todayISO, 30);
const SINCE = shift(todayISO, -365);
const OUT_OF_WINDOW = shift(todayISO, 60);

// Poll a live cache (updated only by onSnapshot) until predicate true or timeout.
async function waitFor(predicate, timeoutMs, stepMs = 150) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (predicate()) return true; await sleep(stepMs); }
  return predicate();
}

const cleanup = { be_treatments: [], be_deposits: [], be_sales: [], be_appointments: [] };
const track = (c, id) => cleanup[c].push(id);

async function main() {
  if (!APPLY) {
    console.log('DRY-RUN — pass --apply to write TEST fixtures + run the live delivery test (auto-cleanup).');
    console.log(`Would test 14 scenarios on REAL prod (${BASE}) with TEST-prefixed docs, today=${todayISO}.`);
    return;
  }
  console.log(`⚡ LIVE cross-device delivery test  run=${RUN}  today=${todayISO}  window=[${FROM}..${TO}]`);

  // Resolve 2 branches (BR_A real; BR_B real if available else synthetic).
  const brSnap = await col('be_branches').limit(5).get();
  const branchIds = brSnap.docs.map((d) => d.id);
  const BR_A = branchIds[0] || 'BR-FALLBACK-A';
  const BR_B = branchIds.find((b) => b !== BR_A) || `TEST-BR-OTHER-${RUN}`;
  console.log(`  BR_A=${BR_A}  BR_B=${BR_B}`);

  // ── Live caches updated ONLY by onSnapshot (the "device B" subscriptions) ──
  const txCache = new Map();    // filtered treatments (mirror listenToTreatmentsByDateRange)
  const depCache = new Map();   // be_deposits where branchId==BR_A
  const saleCache = new Map();  // be_sales where saleDate>=SINCE (allBranches)
  const apptCache = new Map();  // be_appointments where branchId==BR_A

  const firstSnap = { tx: false, dep: false, sale: false, appt: false };
  const subErrors = [];

  const unsubTx = col('be_treatments').onSnapshot((snap) => {
    txCache.clear();
    for (const d of snap.docs) {
      const t = d.data();
      const td = t?.detail?.treatmentDate || '';
      if (td < FROM || td > TO) continue;
      if (t?.detail?.status === 'cancelled') continue;
      txCache.set(d.id, t);
    }
    firstSnap.tx = true;
  }, (e) => subErrors.push(`tx: ${e.message}`));

  const unsubDep = col('be_deposits').where('branchId', '==', BR_A).onSnapshot((snap) => {
    depCache.clear(); for (const d of snap.docs) depCache.set(d.id, d.data()); firstSnap.dep = true;
  }, (e) => subErrors.push(`dep: ${e.message}`));

  const unsubSale = col('be_sales').where('saleDate', '>=', SINCE).onSnapshot((snap) => {
    saleCache.clear(); for (const d of snap.docs) saleCache.set(d.id, d.data()); firstSnap.sale = true;
  }, (e) => subErrors.push(`sale: ${e.message}`));

  const unsubAppt = col('be_appointments').where('branchId', '==', BR_A).onSnapshot((snap) => {
    apptCache.clear(); for (const d of snap.docs) apptCache.set(d.id, d.data()); firstSnap.appt = true;
  }, (e) => subErrors.push(`appt: ${e.message}`));

  // Wait for all 4 subscriptions to receive their INITIAL snapshot (so every
  // assertion below measures DELTA delivery, not the baseline).
  header('Subscriptions established (initial snapshots)');
  const ready = await waitFor(() => firstSnap.tx && firstSnap.dep && firstSnap.sale && firstSnap.appt, 15000);
  assert(ready, 'all 4 onSnapshot subscriptions received initial snapshot');
  assert(subErrors.length === 0, `no subscription errors (${subErrors.join('; ') || 'none'})`);

  const T = 10000;   // positive delivery timeout
  const N = 3500;    // negative-window (must STAY absent)
  const ID = (p) => `${p}-LIVE-${Date.now()}-${RUN}`;

  // ════ A. APPOINTMENTS — create / confirm / edit / cancel ════
  header('A. Appointments (create / confirm / edit / cancel)');
  const apptId = ID('TEST-APPT'); track('be_appointments', apptId);
  await col('be_appointments').doc(apptId).set({ branchId: BR_A, date: todayISO, startTime: '10:00', status: 'waiting', customerId: ID('TEST-CUST'), createdAt: new Date().toISOString() });
  assert(await waitFor(() => apptCache.has(apptId), T), 'S1 CREATE appt → delivered to device B');
  await col('be_appointments').doc(apptId).update({ status: 'confirmed' });
  assert(await waitFor(() => apptCache.get(apptId)?.status === 'confirmed', T), 'S2 CONFIRM appt → status update delivered');
  await col('be_appointments').doc(apptId).update({ startTime: '14:30' });
  assert(await waitFor(() => apptCache.get(apptId)?.startTime === '14:30', T), 'S3 EDIT appt (startTime) → delivered');
  await col('be_appointments').doc(apptId).update({ status: 'cancelled' });
  assert(await waitFor(() => apptCache.get(apptId)?.status === 'cancelled', T), 'S4 CANCEL appt → delivered');

  // ════ B. TREATMENTS — OPD stepper (the core doctor↔admin case) ════
  header('B. Treatments / OPD stepper (vitals → doctor, cross-branch, filters)');
  const txId = ID('TEST-TX'); track('be_treatments', txId);
  await col('be_treatments').doc(txId).set({ branchId: BR_A, customerId: ID('TEST-CUST'), createdAt: new Date().toISOString(), detail: { treatmentDate: todayISO, status: 'vitalsigns-recorded', vitalsignsRecordedAt: new Date().toISOString() } });
  assert(await waitFor(() => txCache.has(txId), T), 'S5 CREATE treatment (vitals) → OPD "ซักประวัติ" delivered');
  await col('be_treatments').doc(txId).update({ 'detail.status': 'doctor-recorded', 'detail.doctorRecordedAt': new Date().toISOString() });
  assert(await waitFor(() => txCache.get(txId)?.detail?.status === 'doctor-recorded', T), 'S6 doctor-save (status→doctor-recorded) → cross-device OPD "แพทย์" delivered  [THE core fix]');
  const txB = ID('TEST-TX'); track('be_treatments', txB);
  await col('be_treatments').doc(txB).set({ branchId: BR_B, customerId: ID('TEST-CUST'), createdAt: new Date().toISOString(), detail: { treatmentDate: todayISO, status: 'vitalsigns-recorded' } });
  assert(await waitFor(() => txCache.has(txB), T), 'S7 treatment in OTHER branch → allBranches listener still delivers (V64-fix6 cross-branch auto-confirm preserved)');
  const txCancel = ID('TEST-TX'); track('be_treatments', txCancel);
  await col('be_treatments').doc(txCancel).set({ branchId: BR_A, customerId: ID('TEST-CUST'), createdAt: new Date().toISOString(), detail: { treatmentDate: todayISO, status: 'cancelled' } });
  assert(!(await waitFor(() => txCache.has(txCancel), N)), 'S8 [neg] cancelled treatment → filtered out (NOT delivered as active)');
  const txOut = ID('TEST-TX'); track('be_treatments', txOut);
  await col('be_treatments').doc(txOut).set({ branchId: BR_A, customerId: ID('TEST-CUST'), createdAt: new Date().toISOString(), detail: { treatmentDate: OUT_OF_WINDOW, status: 'vitalsigns-recorded' } });
  assert(!(await waitFor(() => txCache.has(txOut), N)), 'S9 [neg] out-of-window treatmentDate → date-filtered out (NOT delivered)');

  // ════ C. DEPOSITS — create / cancel / branch isolation ════
  header('C. Deposits (create / cancel / branch isolation)');
  const depId = ID('TEST-DEPOSIT'); track('be_deposits', depId);
  await col('be_deposits').doc(depId).set({ branchId: BR_A, status: 'active', customerId: ID('TEST-CUST'), createdAt: new Date().toISOString() });
  assert(await waitFor(() => depCache.has(depId), T), 'S10 CREATE deposit (BR_A) → delivered');
  await col('be_deposits').doc(depId).update({ status: 'cancelled' });
  assert(await waitFor(() => depCache.get(depId)?.status === 'cancelled', T), 'S11 CANCEL deposit → delivered');
  const depB = ID('TEST-DEPOSIT'); track('be_deposits', depB);
  await col('be_deposits').doc(depB).set({ branchId: BR_B, status: 'active', customerId: ID('TEST-CUST'), createdAt: new Date().toISOString() });
  assert(!(await waitFor(() => depCache.has(depB), N)), 'S12 [neg] deposit in OTHER branch → branch-scoped listener does NOT deliver (no cross-branch leak)');

  // ════ D. SALES — create / allBranches trigger ════
  header('D. Sales (create / allBranches trigger)');
  const saleId = ID('TEST-SALE'); track('be_sales', saleId);
  await col('be_sales').doc(saleId).set({ branchId: BR_A, saleDate: todayISO, status: 'paid', createdAt: new Date().toISOString() });
  assert(await waitFor(() => saleCache.has(saleId), T), 'S13 CREATE sale (BR_A) → delivered');
  const saleB = ID('TEST-SALE'); track('be_sales', saleB);
  await col('be_sales').doc(saleB).set({ branchId: BR_B, saleDate: todayISO, status: 'paid', createdAt: new Date().toISOString() });
  assert(await waitFor(() => saleCache.has(saleB), T), 'S14 sale in any branch → allBranches sales trigger fires (loadAll then branch-filters the DISPLAY; trigger is intentionally branch-blind)');

  // ── Liveness: all subs stayed error-free across the whole run (~did not die) ──
  header('Liveness');
  assert(subErrors.length === 0, `subscriptions stayed live + error-free across all 14 scenarios (${subErrors.join('; ') || 'clean'})`);

  // ── Cleanup ──
  header('Cleanup');
  let deleted = 0;
  for (const [c, ids] of Object.entries(cleanup)) {
    for (const id of ids) { await col(c).doc(id).delete(); deleted += 1; }
  }
  // verify zero orphans
  let orphans = 0;
  for (const [c, ids] of Object.entries(cleanup)) {
    for (const id of ids) { if ((await col(c).doc(id).get()).exists) orphans += 1; }
  }
  assert(orphans === 0, `cleanup complete — ${deleted} TEST docs deleted, ${orphans} orphans`);

  unsubTx(); unsubDep(); unsubSale(); unsubAppt();

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`RESULT: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) console.log(`FAILS:\n - ${fails.join('\n - ')}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
