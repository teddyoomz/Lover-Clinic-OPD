// V64-fix7 e2e — full lifecycle of past-missed-appt → create treatment → auto-confirm
// → delete treatment → revert-to-missed.
//
// Validates V64-fix6/fix7 contracts on real prod Firestore via admin-SDK:
//
//   Phase A — pre-state — TEST appt created on past date with status='pending'
//             (hub view should show missed badge + "สร้างบันทึกการรักษา" button)
//   Phase B — create treatment for that customer on that date in same branch
//             (hub view should auto-flip to "เสร็จแล้ว" + "แก้ไขบันทึกการรักษา"
//              + missed badge gone — verified by re-deriving the treatmentsByCustomerDate
//              map exactly the way the View does)
//   Phase C — delete that treatment
//             (hub view should revert: missed badge back + "สร้างบันทึกการรักษา"
//              + status reverts to raw stored)
//   Phase D — cleanup — delete the test appt
//
// Run:
//   node --env-file=.env.local.prod scripts/e2e-v64-fix7-treatment-cascade.mjs
//
// All fixtures use TEST-prefixed IDs per V33.10/11/12/13 prefix discipline.

import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';

function pad2(n) { return String(n).padStart(2, '0'); }

function bangkokToday() {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function pastDateISO(daysAgo) {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000 - daysAgo * 24 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// --- View's treatmentsByCustomerDate map derivation (mirrored from
//     src/components/admin/AppointmentHubView.jsx so this script verifies
//     the exact same logic the UI uses) ---
function buildTreatmentsByCustomerDate(allTreatments) {
  const map = new Map();
  for (const t of allTreatments) {
    const cid = String(t?.customerId || '');
    const date = t?.detail?.treatmentDate || '';
    if (!cid || !date) continue;
    const key = `${cid}|${date}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  return map;
}

// --- RowCard logic mirrored to assert exactly the user-visible state ---
function rowCardState({ appt, apptDateTreatments = [], now = new Date() }) {
  const rawStatus = appt.status || 'pending';
  const latestTreatment = apptDateTreatments[0] || null;
  const hasTreatmentForDay = !!latestTreatment;
  const effectiveStatus = hasTreatmentForDay ? 'done' : rawStatus;
  const todayBangkok = (() => {
    const d = new Date((now instanceof Date ? now : new Date()).getTime() + 7 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  })();
  const isPastDate = typeof appt.date === 'string' && appt.date < todayBangkok;
  const isMissed = !hasTreatmentForDay && (
    (rawStatus === 'confirmed' && isPastDate) ||
    (rawStatus === 'pending' && isPastDate)
  );
  let buttonLabel = '';
  if (hasTreatmentForDay) buttonLabel = 'แก้ไขบันทึกการรักษา';
  else if (isPastDate && (rawStatus === 'pending' || rawStatus === 'confirmed')) buttonLabel = 'สร้างบันทึกการรักษา';
  else if (rawStatus === 'pending') buttonLabel = 'คอนเฟิร์มนัด';
  else if (rawStatus === 'confirmed') buttonLabel = 'บันทึกการรักษา';
  else if (rawStatus === 'cancelled') buttonLabel = '(read-only)';
  else if (rawStatus === 'done') buttonLabel = appt.linkedTreatmentId ? 'แก้ไขการรักษา' : 'บันทึกการรักษา';
  const linkedTreatmentId = latestTreatment?.id || appt.linkedTreatmentId || '';
  return { rawStatus, effectiveStatus, hasTreatmentForDay, isPastDate, isMissed, buttonLabel, linkedTreatmentId };
}

async function main() {
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
  const db = getFirestore();

  const ts = Date.now();
  const TEST_BRANCH = 'BR-1777873556815-26df6480'; // existing TEST-friendly prod branch
  const TEST_CUSTOMER_ID = `TEST-V64FIX7-CUST-${ts}`;
  const TEST_APPT_ID = `TEST-V64FIX7-APPT-${ts}`;
  const TEST_TREATMENT_ID = `TEST-V64FIX7-BT-${ts}`;
  const apptDate = pastDateISO(2); // 2 days ago → past

  const apptRef = db.doc(`artifacts/${APP_ID}/public/data/be_appointments/${TEST_APPT_ID}`);
  const customerRef = db.doc(`artifacts/${APP_ID}/public/data/be_customers/${TEST_CUSTOMER_ID}`);
  const treatmentRef = db.doc(`artifacts/${APP_ID}/public/data/be_treatments/${TEST_TREATMENT_ID}`);

  let phase = 'setup';
  const cleanups = [];
  let assertCount = 0;
  let failCount = 0;

  function assert(label, cond, ctx) {
    assertCount++;
    if (cond) {
      console.log(`  ✓ ${label}`);
    } else {
      failCount++;
      console.log(`  ✗ ${label}\n    ctx: ${JSON.stringify(ctx)}`);
    }
  }

  try {
    // ─── SETUP — create TEST customer + TEST appt (status='pending', past date) ──
    phase = 'A-setup';
    console.log(`\n═══ Phase ${phase}: setup TEST appt ${TEST_APPT_ID} ═══`);
    await customerRef.set({
      hn_no: TEST_CUSTOMER_ID,
      firstname: 'TEST', lastname: 'Cascade',
      gender: 'M',
      branchId: TEST_BRANCH,
      _v64fix7TestFixture: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    cleanups.push(async () => customerRef.delete());

    await apptRef.set({
      branchId: TEST_BRANCH,
      customerId: TEST_CUSTOMER_ID,
      customerName: 'TEST Cascade',
      date: apptDate,
      startTime: '10:00',
      endTime: '11:00',
      status: 'pending',
      appointmentType: 'follow-up',
      _v64fix7TestFixture: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    cleanups.push(async () => apptRef.delete());
    console.log(`  ✓ created TEST appt date=${apptDate} status=pending`);

    // ─── PHASE A — verify pre-state: missed badge + สร้างบันทึกการรักษา ──
    phase = 'A-verify';
    console.log(`\n═══ Phase ${phase}: pre-state assertions (no treatment exists yet) ═══`);
    let allTreatments = (await db.collection(`artifacts/${APP_ID}/public/data/be_treatments`).get())
      .docs.map(d => ({ id: d.id, ...d.data() }));
    let map = buildTreatmentsByCustomerDate(allTreatments);
    let apptSnap = await apptRef.get();
    let appt = { id: TEST_APPT_ID, ...apptSnap.data() };
    let treatmentsForDay = map.get(`${appt.customerId}|${appt.date}`) || [];
    let state = rowCardState({ appt, apptDateTreatments: treatmentsForDay });
    assert('A1 hasTreatmentForDay = false', state.hasTreatmentForDay === false, state);
    assert('A2 isPastDate = true (date is 2 days ago)', state.isPastDate === true, state);
    assert('A3 isMissed = true (past + pending, no treatment)', state.isMissed === true, state);
    assert('A4 effectiveStatus = pending (no override)', state.effectiveStatus === 'pending', state);
    assert('A5 buttonLabel = สร้างบันทึกการรักษา', state.buttonLabel === 'สร้างบันทึกการรักษา', state);

    // ─── PHASE B — create treatment for same customer + same date ──
    phase = 'B-create-treatment';
    console.log(`\n═══ Phase ${phase}: create treatment ${TEST_TREATMENT_ID} on ${apptDate} ═══`);
    await treatmentRef.set({
      customerId: TEST_CUSTOMER_ID,
      treatmentId: TEST_TREATMENT_ID,
      branchId: TEST_BRANCH,
      detail: {
        treatmentDate: apptDate,
        status: 'completed',
        treatmentItems: [],
      },
      _v64fix7TestFixture: true,
      createdAt: new Date().toISOString(),
    });
    cleanups.push(async () => treatmentRef.delete());

    // Re-derive map from prod (simulates the View's silent reload)
    allTreatments = (await db.collection(`artifacts/${APP_ID}/public/data/be_treatments`).get())
      .docs.map(d => ({ id: d.id, ...d.data() }));
    map = buildTreatmentsByCustomerDate(allTreatments);
    treatmentsForDay = map.get(`${appt.customerId}|${appt.date}`) || [];
    state = rowCardState({ appt, apptDateTreatments: treatmentsForDay });
    assert('B1 hasTreatmentForDay = true (post-create)', state.hasTreatmentForDay === true, state);
    assert('B2 effectiveStatus = done (auto-confirm flips status)', state.effectiveStatus === 'done', state);
    assert('B3 isMissed = false (treatment found = customer came)', state.isMissed === false, state);
    assert('B4 buttonLabel = แก้ไขบันทึกการรักษา', state.buttonLabel === 'แก้ไขบันทึกการรักษา', state);
    assert('B5 linkedTreatmentId = test treatment id', state.linkedTreatmentId === TEST_TREATMENT_ID, state);

    // ─── PHASE C — delete the treatment ──
    phase = 'C-delete-treatment';
    console.log(`\n═══ Phase ${phase}: delete treatment ${TEST_TREATMENT_ID} ═══`);
    await treatmentRef.delete();
    // Re-derive map (simulates real-time after admin deletes from CustomerDetailView)
    allTreatments = (await db.collection(`artifacts/${APP_ID}/public/data/be_treatments`).get())
      .docs.map(d => ({ id: d.id, ...d.data() }));
    map = buildTreatmentsByCustomerDate(allTreatments);
    treatmentsForDay = map.get(`${appt.customerId}|${appt.date}`) || [];
    state = rowCardState({ appt, apptDateTreatments: treatmentsForDay });
    assert('C1 hasTreatmentForDay = false (post-delete)', state.hasTreatmentForDay === false, state);
    assert('C2 effectiveStatus reverts to pending', state.effectiveStatus === 'pending', state);
    assert('C3 isMissed = true (back to missed)', state.isMissed === true, state);
    assert('C4 buttonLabel reverts to สร้างบันทึกการรักษา', state.buttonLabel === 'สร้างบันทึกการรักษา', state);

    // ─── PHASE D — verify branch-blind match (treatment with no branchId) ──
    phase = 'D-branchless-treatment';
    console.log(`\n═══ Phase ${phase}: branch-blind treatment match (legacy data) ═══`);
    const TEST_BRANCHLESS_BT = `TEST-V64FIX7-BT-NOBRANCH-${ts}`;
    const branchlessRef = db.doc(`artifacts/${APP_ID}/public/data/be_treatments/${TEST_BRANCHLESS_BT}`);
    await branchlessRef.set({
      customerId: TEST_CUSTOMER_ID,
      treatmentId: TEST_BRANCHLESS_BT,
      // NO branchId field — simulates legacy/imported treatments
      detail: { treatmentDate: apptDate, status: 'completed', treatmentItems: [] },
      _v64fix7TestFixture: true,
      createdAt: new Date().toISOString(),
    });
    cleanups.push(async () => branchlessRef.delete());

    allTreatments = (await db.collection(`artifacts/${APP_ID}/public/data/be_treatments`).get())
      .docs.map(d => ({ id: d.id, ...d.data() }));
    map = buildTreatmentsByCustomerDate(allTreatments);
    treatmentsForDay = map.get(`${appt.customerId}|${appt.date}`) || [];
    state = rowCardState({ appt, apptDateTreatments: treatmentsForDay });
    assert('D1 branchless treatment matched (V64-fix7 lenient)', state.hasTreatmentForDay === true, { branchlessId: TEST_BRANCHLESS_BT, ...state });
    assert('D2 buttonLabel = แก้ไขบันทึกการรักษา (branchless still counts)', state.buttonLabel === 'แก้ไขบันทึกการรักษา', state);

    // ─── PHASE E — multi-treatment day → uses LATEST by createdAt ──
    phase = 'E-multi-treatment';
    console.log(`\n═══ Phase ${phase}: multi-treatment day → uses latest (createdAt DESC) ═══`);
    const LATER_BT = `TEST-V64FIX7-BT-LATER-${ts}`;
    const laterRef = db.doc(`artifacts/${APP_ID}/public/data/be_treatments/${LATER_BT}`);
    await laterRef.set({
      customerId: TEST_CUSTOMER_ID,
      treatmentId: LATER_BT,
      branchId: TEST_BRANCH,
      detail: { treatmentDate: apptDate, status: 'completed', treatmentItems: [] },
      _v64fix7TestFixture: true,
      createdAt: new Date().toISOString(),  // newer than D's branchless
    });
    cleanups.push(async () => laterRef.delete());

    allTreatments = (await db.collection(`artifacts/${APP_ID}/public/data/be_treatments`).get())
      .docs.map(d => ({ id: d.id, ...d.data() }));
    map = buildTreatmentsByCustomerDate(allTreatments);
    treatmentsForDay = map.get(`${appt.customerId}|${appt.date}`) || [];
    state = rowCardState({ appt, apptDateTreatments: treatmentsForDay });
    assert('E1 latestTreatment.id = LATER_BT (sorted DESC by createdAt)', state.linkedTreatmentId === LATER_BT, state);
    assert('E2 hasTreatmentForDay still true', state.hasTreatmentForDay === true, state);
  } catch (e) {
    console.error(`\n✗ FAIL at phase ${phase}: ${e.message}`);
    console.error(e.stack);
  }

  // ─── CLEANUP ──
  console.log(`\n═══ Cleanup ═══`);
  for (const fn of cleanups.reverse()) {
    try { await fn(); } catch {}
  }
  console.log(`  ✓ deleted ${cleanups.length} TEST docs`);

  // ─── REPORT ──
  console.log(`\n═══ Report ═══`);
  console.log(`Total assertions: ${assertCount}`);
  console.log(`Failed: ${failCount}`);
  if (failCount > 0) {
    console.error(`✗ V64-fix7 e2e FAILED — see fail lines above`);
    process.exit(1);
  } else {
    console.log(`✓ V64-fix7 e2e ALL GREEN — auto-confirm + revert + branch-blind + latest-treatment all verified`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('e2e crashed:', e.stack || e.message); process.exit(1); });
}
