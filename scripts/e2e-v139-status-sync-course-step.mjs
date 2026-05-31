#!/usr/bin/env node
// ─── V139 TRUE-L2 e2e — status↔tab coupling + course-deducted predicate ──────
//
// Rule Q V66 / Rule I item (b): calls the SHIPPED client functions
// (updateBackendAppointment / markAppointmentServiceCompleted /
// unmarkAppointmentServiceCompleted) against REAL prod Firestore, authed as
// admin via custom token, then READS the appointment doc back + asserts the
// status ↔ serviceCompletedAt coupling. Plus runs the SHIPPED resolveCourseDeducted
// predicate against (a) seeded TEST treatments AND (b) a sample of REAL prod
// be_treatments docs — proving the detail.* field path on real data.
//
// Compliance: Rule R (env-pull) + Rule M (TEST- prefixed fixtures, try/finally
// cleanup + zero-orphan + custom-token user deleted). V33.13 appt prefixes.
//
// Run: node scripts/e2e-v139-status-sync-course-step.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import {
  updateBackendAppointment,
  markAppointmentServiceCompleted,
  unmarkAppointmentServiceCompleted,
} from '../src/lib/backendClient.js';
import { resolveCourseDeducted } from '../src/lib/treatmentDisplayResolvers.js';
import { decideApptStatusServiceSync } from '../src/lib/appointmentDisplay.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-APPT-V139-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); }
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
const readAppt = async (db, id) => (await base(db).collection('be_appointments').doc(id).get()).data();

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const APPT = `${NS}-A`;
  const T_COURSE = `${NS}-T-COURSE`, T_PURCHASE = `${NS}-T-PURCHASE`;
  const cleanupIds = [
    ['be_appointments', APPT],
    ['be_treatments', T_COURSE], ['be_treatments', T_PURCHASE],
  ];

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in as ${STAFF_UID} (admin) — calling SHIPPED client fns\n`);

    // ── Phase A — seed fixtures ───────────────────────────────────────────────
    await data.collection('be_appointments').doc(APPT).set({
      customerName: 'V139 Test', customerNameTemp: 'V139 Test', customerHN: '', customerId: '',
      date: '2026-01-04', startTime: '10:00', endTime: '10:30', // far-future-safe + no real customer
      doctorId: `${NS}-DOC`, doctorName: 'หมอเทส', appointmentType: 'treatment-in',
      status: 'confirmed', branchId: `${NS}-BR`, createdAt: new Date().toISOString(),
    });
    await data.collection('be_treatments').doc(T_COURSE).set({
      customerId: `${NS}-C`, branchId: `${NS}-BR`, completedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      detail: { treatmentDate: '2026-01-04', courseItems: [{ rowId: 'r1', deductQty: '1' }], treatmentItems: [{ id: 'r1', name: 'X', qty: 1 }] },
    });
    await data.collection('be_treatments').doc(T_PURCHASE).set({
      customerId: `${NS}-C`, branchId: `${NS}-BR`, completedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      detail: { treatmentDate: '2026-01-04', purchasedItems: [{ id: 'p1', name: 'Y' }], courseItems: [], treatmentItems: [] },
    });
    console.log('fixtures created.\n');

    // ── Phase B — status ↔ serviceCompletedAt coupling (SHIPPED fns) ──────────
    console.log('B — coupling via SHIPPED updateBackendAppointment + mark/unmark');

    // B1: modal sets status='done' (from confirmed, no stamp) → serviceCompletedAt stamped
    await updateBackendAppointment(APPT, { status: 'done' });
    let a = await readAppt(adb, APPT);
    check('B1.1 status→done stamps serviceCompletedAt (→ "เสร็จแล้ว" tab)', !!a.serviceCompletedAt && a.status === 'done', `status=${a.status} stamp=${!!a.serviceCompletedAt}`);
    check('B1.2 wasServiceCompleted flag set', a.wasServiceCompleted === true);

    // B2: no-status edit while stamped → NO clobber (stays in done tab)
    await updateBackendAppointment(APPT, { customerNote: 'V139 edit room/time, no status' });
    a = await readAppt(adb, APPT);
    check('B2.1 no-status edit does NOT clobber serviceCompletedAt', !!a.serviceCompletedAt && a.status === 'done');

    // B3: modal sets status='confirmed' (from done) → serviceCompletedAt cleared (symmetric)
    await updateBackendAppointment(APPT, { status: 'confirmed' });
    a = await readAppt(adb, APPT);
    check('B3.1 status→confirmed clears serviceCompletedAt (→ "กำลังรอ" tab)', !a.serviceCompletedAt && a.status === 'confirmed', `status=${a.status} stamp=${a.serviceCompletedAt}`);

    // B4: mark-complete button path couples status='done'
    await markAppointmentServiceCompleted(APPT, STAFF_UID);
    a = await readAppt(adb, APPT);
    check('B4.1 markAppointmentServiceCompleted sets status=done + stamp + flag', a.status === 'done' && !!a.serviceCompletedAt && a.wasServiceCompleted === true, `status=${a.status}`);

    // B5: back-to-queue button path couples status='confirmed' + clears stamp
    await unmarkAppointmentServiceCompleted(APPT);
    a = await readAppt(adb, APPT);
    check('B5.1 unmarkAppointmentServiceCompleted sets status=confirmed + clears stamp', a.status === 'confirmed' && !a.serviceCompletedAt, `status=${a.status} stamp=${a.serviceCompletedAt}`);

    // B6: pure decision matches the real write outcomes
    check('B6.1 decide(done,null)=stamp matches B1/B4', decideApptStatusServiceSync('done', null) === 'stamp');
    check('B6.2 decide(confirmed,<stamp>)=clear matches B3/B5', decideApptStatusServiceSync('confirmed', new Date()) === 'clear');
    check('B6.3 decide(undefined,<stamp>)=none matches B2 no-clobber', decideApptStatusServiceSync(undefined, new Date()) === 'none');

    // ── Phase C — resolveCourseDeducted on seeded + REAL prod data ────────────
    console.log('\nC — resolveCourseDeducted (SHIPPED) on seeded + REAL prod docs');
    const tCourse = (await base(adb).collection('be_treatments').doc(T_COURSE).get()).data();
    const tPurchase = (await base(adb).collection('be_treatments').doc(T_PURCHASE).get()).data();
    check('C1.1 seeded course-deduct treatment → true', resolveCourseDeducted(tCourse) === true);
    check('C1.2 seeded purchase-only treatment → false (ซื้อ≠ตัด)', resolveCourseDeducted(tPurchase) === false);

    // REAL prod sample — find one real deducted + one real completed-no-deduct
    const real = await base(adb).collection('be_treatments').orderBy('createdAt', 'desc').limit(60).get();
    let realDeduct = null, realWarn = null;
    for (const d of real.docs) {
      const t = d.data(); const det = t.detail || {};
      const cd = (Array.isArray(det.courseItems) && det.courseItems.length) || (Array.isArray(det.treatmentItems) && det.treatmentItems.length);
      if (cd && !realDeduct) realDeduct = t;
      if (!cd && t.completedAt && !realWarn) realWarn = t;
    }
    check('C2.1 a REAL prod deducted treatment → resolveCourseDeducted true', realDeduct ? resolveCourseDeducted(realDeduct) === true : false, realDeduct ? '' : '(none found in last 60 — unexpected)');
    check('C2.2 a REAL prod completed-no-deduct treatment → resolveCourseDeducted false (warn case)', realWarn ? resolveCourseDeducted(realWarn) === false : false, realWarn ? '' : '(none found in last 60)');
  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanupIds) await data.collection(c).doc(id).delete().catch(() => {});
      let orphans = 0;
      for (const [c, id] of cleanupIds) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }

  console.log(`\n━━━ V139 e2e: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
