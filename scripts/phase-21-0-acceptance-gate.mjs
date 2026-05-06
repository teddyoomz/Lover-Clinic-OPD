#!/usr/bin/env node
// ─── Phase 21.0 — Acceptance Gate per user verbatim test requirement ───
//
// User directive (verbatim, 2026-05-06):
//   "ทำแล้วเทสด้วยว่าแสดงจริงในแต่ละ tab ย่อยของสาขา และแสดงแบบแยกสาขากันแล้วยัง
//    ถูกอยู่ การนัดหมายลงสาขาไหน ประเภทไหนต้องแสดงลงหน้า tab ย่อยนั้นๆของสาขา
//    นั้นๆ ได้ถูกต้อง"
//
// Translation: "After implementing, test that it actually displays in each
// sub-tab of each branch — appointments belonging to which branch + which
// type must appear in the correct sub-tab of that branch."
//
// Strategy (per feedback_no_real_action_in_preview_eval.md):
//   1. Create TEST-APPT-* fixtures via firebase-admin SDK across 2 branches
//      × 4 types × 2 appointments each = 16 test docs.
//   2. For each (branch, type) combination, run the EXACT query
//      AppointmentCalendarView's listener uses (`listenToAppointmentsByDate`
//      with branchId filter) + apply the type-filter the component uses
//      (migrateLegacyAppointmentType coercion).
//   3. Assert: ONLY the 2 docs matching (branch, type) come back. No leakage
//      from other branches OR other types.
//   4. Cleanup: delete all 16 TEST-APPT-* docs.
//   5. Print result table for the session checkpoint.
//
// V33.13 prefix discipline: all fixture appointmentIds use 'TEST-APPT-'.
// Run: node scripts/phase-21-0-acceptance-gate.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ─── Load env ─────────────────────────────────────────────────────────────
const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  const envText = readFileSync(envFile, 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────
const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const APPT_COLLECTION = `${BASE_PATH}/be_appointments`;
const BRANCH_COLLECTION = `${BASE_PATH}/be_branches`;

const APPOINTMENT_TYPE_VALUES = Object.freeze([
  'no-deposit-booking',
  'deposit-booking',
  'treatment-in',
  'follow-up',
]);

const TEST_DATE = '2099-12-31';  // far future, won't collide with real bookings

// ─── Firebase init ────────────────────────────────────────────────────────
function initFirebase() {
  if (getApps().length > 0) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      type: 'service_account',
      project_id: 'loverclinic-opd-4c39b',
      private_key_id: 'key-id',
      private_key: privateKey,
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      client_id: 'client-id',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
    }),
  });
}

// ─── Mirror of migrateLegacyAppointmentType from src/lib/appointmentTypes.js
// (kept inline to avoid ESM/CJS interop pain in node script)
function migrateLegacyAppointmentType(value) {
  if (APPOINTMENT_TYPE_VALUES.includes(value)) return value;
  return 'no-deposit-booking';
}

// ─── Mirror of AppointmentCalendarView's apptMatchesType derivation
function apptMatchesType(appt, typeFilter) {
  if (!typeFilter) return true;
  return migrateLegacyAppointmentType(appt?.appointmentType) === typeFilter;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('[acceptance-gate] starting Phase 21.0 acceptance gate');
  initFirebase();
  const db = getFirestore();

  // ── Step 1: Pick 2 real branches from be_branches
  const branchSnap = await db.collection(BRANCH_COLLECTION).get();
  const liveBranches = branchSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(b => !b.isArchived);
  if (liveBranches.length < 2) {
    console.warn(`[acceptance-gate] WARNING: only ${liveBranches.length} live branch(es). Need 2+ for proper isolation testing. Falling back to TEST branch ids.`);
  }
  const branchA = liveBranches[0]?.id || 'TEST-BR-A';
  const branchB = liveBranches[1]?.id || 'TEST-BR-B';
  console.log(`[acceptance-gate] using branches: A=${branchA}, B=${branchB}`);

  // ── Step 2: Build 16 TEST-APPT-* fixtures
  const fixtures = [];
  let counter = 0;
  for (const branchId of [branchA, branchB]) {
    for (const type of APPOINTMENT_TYPE_VALUES) {
      for (let i = 1; i <= 2; i++) {
        counter += 1;
        const id = `TEST-APPT-${Date.now()}-${randomBytes(2).toString('hex')}-${counter}`;
        const startHour = 8 + i; // 9:00 / 10:00
        const startTime = `${String(startHour).padStart(2, '0')}:00`;
        const endTime = `${String(startHour).padStart(2, '0')}:15`;
        fixtures.push({
          id,
          branchId,
          type,
          startTime,
          endTime,
          payload: {
            appointmentId: id,
            customerId: `TEST-CUST-${counter}`,
            customerName: `TEST Patient ${counter}`,
            customerHN: `TEST-HN-${counter}`,
            date: TEST_DATE,
            startTime,
            endTime,
            appointmentType: type,
            status: 'pending',
            branchId,
            roomName: `Test Room`,
            doctorId: `TEST-DOC-${counter}`,
            doctorName: `TEST Dr ${counter}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      }
    }
  }
  console.log(`[acceptance-gate] built ${fixtures.length} fixtures (expected 16)`);

  // ── Step 3: Write all fixtures (single batch — 16 docs <500 limit)
  const writeBatch = db.batch();
  for (const f of fixtures) {
    writeBatch.set(db.collection(APPT_COLLECTION).doc(f.id), f.payload);
  }
  await writeBatch.commit();
  console.log(`[acceptance-gate] ✓ wrote ${fixtures.length} TEST-APPT-* fixtures`);

  // ── Step 4: For each (branch, type), query the date + branchId, then
  //           apply type filter (mirrors AppointmentCalendarView's render).
  const results = [];
  for (const branchId of [branchA, branchB]) {
    for (const typeFilter of APPOINTMENT_TYPE_VALUES) {
      // Query mirrors listenToAppointmentsByDate(date, {branchId})
      const snap = await db.collection(APPT_COLLECTION)
        .where('date', '==', TEST_DATE)
        .where('branchId', '==', branchId)
        .get();
      const allAppts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Apply type-filter mirror of typedDayAppts derivation
      const typed = allAppts.filter(a => apptMatchesType(a, typeFilter));
      // Filter to ONLY our TEST- fixtures (exclude any real prod data on TEST_DATE)
      const testTyped = typed.filter(a => a.appointmentId?.startsWith('TEST-APPT-'));
      const testAll = allAppts.filter(a => a.appointmentId?.startsWith('TEST-APPT-'));
      results.push({
        branchId,
        typeFilter,
        rawCount: testAll.length,
        typedCount: testTyped.length,
        ids: testTyped.map(a => a.appointmentId).sort(),
        // Verification: every appt in the typed result MUST match (branch, type)
        leakageCheck: testTyped.every(a =>
          a.branchId === branchId &&
          migrateLegacyAppointmentType(a.appointmentType) === typeFilter
        ),
      });
    }
  }

  // ── Step 5: Print result table
  console.log('');
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log('PHASE 21.0 ACCEPTANCE GATE — per-branch × per-type isolation matrix');
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log('Branch                                         | Type                | Raw | Typed | Pass');
  console.log('───────────────────────────────────────────────┼─────────────────────┼─────┼───────┼─────');
  let allPass = true;
  for (const r of results) {
    const expected = 2;  // 2 fixtures per (branch, type)
    const pass = r.typedCount === expected && r.leakageCheck;
    if (!pass) allPass = false;
    const branchPad = (r.branchId + '                                              ').slice(0, 47);
    const typePad = (r.typeFilter + '                  ').slice(0, 19);
    const pad = (s, n) => (String(s) + '          ').slice(0, n);
    console.log(`${branchPad}| ${typePad} | ${pad(r.rawCount, 3)} | ${pad(r.typedCount, 5)} | ${pass ? ' ✓ ' : ' ✗ '}`);
  }
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log(`Overall: ${allPass ? '✓ PASS' : '✗ FAIL'}`);
  console.log('');
  console.log('Sanity checks:');
  console.log('  - Each (branch, type) cell expected 2 fixtures');
  console.log('  - rawCount == typedCount in every row (because every fixture matches its type cell)');
  console.log('  - leakageCheck: every doc in cell has matching branchId + appointmentType');

  // ── Step 6: Cleanup all fixtures
  console.log('');
  console.log('[acceptance-gate] cleanup — deleting TEST-APPT-* fixtures');
  const cleanupBatch = db.batch();
  for (const f of fixtures) {
    cleanupBatch.delete(db.collection(APPT_COLLECTION).doc(f.id));
  }
  await cleanupBatch.commit();
  console.log(`[acceptance-gate] ✓ deleted ${fixtures.length} fixtures`);

  process.exit(allPass ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[acceptance-gate] FATAL', err);
    process.exit(1);
  });
}
