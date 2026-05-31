#!/usr/bin/env node
// ─── V142 TRUE-L2 e2e — edit-resave course-deduction symmetry ─────────────────
//
// User bug (real prod LC-26000115 / BT-1780203508072): "ซื้อแล้วตัดคอร์สเลย
// แล้วคอร์สมันไม่ตัดออกจากตัว". On a 2nd+ save of a treatment that deducted
// purchased courses, handleSubmit REVERSES the deduction but the fresh re-deduct
// serialization comes up EMPTY (purchased `purchased-…` rowIds regenerate to
// `be-row-N` → Pass-1 miss; rem=0 → Pass-2 skip) → REFUND-WITHOUT-REDEDUCT →
// balance reverts to full.
//
// Rule Q V66 — TRUE L2: calls the SHIPPED client functions
// (assignCourseToCustomer / deductCourseItems / reverseCourseDeduction from
// src/lib/backendClient.js) against REAL prod Firestore, authed as clinic-staff
// via a custom token. It reproduces the EXACT edit-resave mutation sequence:
//   CUST_OLD (pre-V142): assign → deduct → reverse → deduct([])         → REVERTS to full (bug)
//   CUST_NEW (V142):     assign → deduct → reverse → deduct(carryFwd)   → stays deducted (fix)
// The carry-forward list is produced by the SHIPPED helper
// buildReDeductListWithCarryForward — so this proves the fix end-to-end on real
// data, not a replica.
//
// Compliance: Rule R (env-pull) + Rule M discipline (TEST- prefixed fixtures,
// never touches real data, try/finally cleanup + zero-orphan + Auth user delete).
//
// Run: node scripts/e2e-v142-edit-resave-course-deduct.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { assignCourseToCustomer, deductCourseItems, reverseCourseDeduction } from '../src/lib/backendClient.js';
import { buildReDeductListWithCarryForward } from '../src/lib/treatmentBuyHelpers.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-V142-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
    const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
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
const remOf = async (db, custId, idx) => {
  const c = (await base(db).collection('be_customers').doc(custId).get()).data().courses[idx].qty;
  const m = String(c).match(/^([\d.]+)\s*\//); return m ? parseFloat(m[1]) : null;
};

// the 3 purchased courses from the real-prod screenshot
const COURSE_DEFS = [
  { name: 'V142 Testoviron 1 ครั้ง', product: 'V142 Testoviron' },
  { name: 'V142 ปรึกษา 1 ครั้ง', product: 'V142 ปรึกษา' },
  { name: 'V142 เจาะเลือด', product: 'V142 ค่าบริการอ่านเลือด' },
];
const deductionsFor = () => COURSE_DEFS.map((cd, i) => ({
  courseName: cd.name, productName: cd.product, courseIndex: i, deductQty: 1, unit: 'ครั้ง',
  rowId: `purchased-${100 + i}-row-self`, // in-session rowId (the ones that DON'T survive reload)
}));

async function seedCustomer(data, custId, tid, saleId) {
  await data.collection('be_customers').doc(custId).set({
    customerId: custId, patientData: { firstName: NS, lastName: 'EditResave', hn: custId },
    courses: [], createdAt: new Date().toISOString(),
  });
  // assign 3 purchased courses via the SHIPPED function (full "1 / 1 ครั้ง")
  for (const cd of COURSE_DEFS) {
    await assignCourseToCustomer(custId, {
      name: cd.name, products: [{ name: cd.product, qty: 1, unit: 'ครั้ง' }],
      price: 1000, source: 'treatment', linkedSaleId: saleId, linkedTreatmentId: tid, courseType: 'มาตรฐาน',
    });
  }
}

async function main() {
  const adb = initAdmin(); const data = base(adb);
  const CUST_OLD = `${NS}-CUST-OLD`, CUST_NEW = `${NS}-CUST-NEW`;
  const TID = `${NS}-T`, SALE = `${NS}-INV`;
  const deductions = deductionsFor();
  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in as ${STAFF_UID} (admin) — calling SHIPPED client functions\n`);

    // ════ CUST_OLD — reproduce the bug with the PRE-V142 edit-resave sequence ════
    console.log('CUST_OLD — pre-V142 edit-resave (reverse + deduct([])) → should REVERT to full (the bug)');
    await seedCustomer(data, CUST_OLD, TID, SALE);
    check('O.0 assigned 3 courses full', (await remOf(adb, CUST_OLD, 0)) === 1 && (await remOf(adb, CUST_OLD, 2)) === 1);
    // save 1 — deduct purchased
    await deductCourseItems(CUST_OLD, deductions, { treatmentId: TID, preferNewest: true });
    check('O.1 save-1 deduct → all rem 0', (await remOf(adb, CUST_OLD, 0)) === 0 && (await remOf(adb, CUST_OLD, 1)) === 0 && (await remOf(adb, CUST_OLD, 2)) === 0);
    // edit-resave (OLD logic): reverse(oldPurchased) + deduct(freshPurchased=[])
    await reverseCourseDeduction(CUST_OLD, deductions, { preferNewest: true });
    await deductCourseItems(CUST_OLD, [], { treatmentId: TID, preferNewest: true }); // empty fresh list
    const oldR = [await remOf(adb, CUST_OLD, 0), await remOf(adb, CUST_OLD, 1), await remOf(adb, CUST_OLD, 2)];
    check('O.2 ★BUG REPRODUCED★ pre-V142 edit-resave reverted balance to FULL (rem 1,1,1)', oldR.every(r => r === 1), `got ${JSON.stringify(oldR)}`);

    // ════ CUST_NEW — V142 fix: reverse + deduct(carry-forward) → stays deducted ════
    console.log('\nCUST_NEW — V142 edit-resave (reverse + deduct(carryForward)) → should STAY deducted (the fix)');
    await seedCustomer(data, CUST_NEW, TID, SALE);
    await deductCourseItems(CUST_NEW, deductions, { treatmentId: TID, preferNewest: true });
    check('N.1 save-1 deduct → all rem 0', (await remOf(adb, CUST_NEW, 0)) === 0 && (await remOf(adb, CUST_NEW, 2)) === 0);
    // edit-resave (V142): freshPurchased=[] (real-reload fact) + carry-forward
    const freshPurchased = [];
    const selected = new Set(deductions.map(d => d.rowId)); // restored from saved courseItems (TFP line 1157)
    const reDeduct = buildReDeductListWithCarryForward(freshPurchased, deductions, selected);
    check('N.2 carry-forward re-deduct list has all 3 (SHIPPED helper)', reDeduct.length === 3, `got ${reDeduct.length}`);
    await reverseCourseDeduction(CUST_NEW, deductions, { preferNewest: true });
    await deductCourseItems(CUST_NEW, reDeduct, { treatmentId: TID, preferNewest: true });
    const newR = [await remOf(adb, CUST_NEW, 0), await remOf(adb, CUST_NEW, 1), await remOf(adb, CUST_NEW, 2)];
    check('N.3 ★FIX VERIFIED★ V142 edit-resave keeps balance DEDUCTED (rem 0,0,0)', newR.every(r => r === 0), `got ${JSON.stringify(newR)}`);

    // multi-edit (3 more resaves) — no drift
    for (let i = 0; i < 3; i++) {
      const rd = buildReDeductListWithCarryForward([], deductions, selected);
      await reverseCourseDeduction(CUST_NEW, deductions, { preferNewest: true });
      await deductCourseItems(CUST_NEW, rd, { treatmentId: TID, preferNewest: true });
    }
    const mR = [await remOf(adb, CUST_NEW, 0), await remOf(adb, CUST_NEW, 1), await remOf(adb, CUST_NEW, 2)];
    check('N.4 multi-edit (4 resaves total) — no drift, still rem 0,0,0', mR.every(r => r === 0), `got ${JSON.stringify(mR)}`);

    // ════ un-check scenario: edit + drop course 0 from selection → un-deducted ════
    const selectedMinus0 = new Set([deductions[1].rowId, deductions[2].rowId]);
    const rdMinus = buildReDeductListWithCarryForward([], deductions, selectedMinus0);
    check('U.1 un-check course 0 → carry-forward = 2', rdMinus.length === 2);
    await reverseCourseDeduction(CUST_NEW, deductions, { preferNewest: true }); // all 0→1
    await deductCourseItems(CUST_NEW, rdMinus, { treatmentId: TID, preferNewest: true }); // re-deduct 1+2 only
    check('U.2 course 0 un-deducted (rem 1), courses 1+2 stay deducted (rem 0)',
      (await remOf(adb, CUST_NEW, 0)) === 1 && (await remOf(adb, CUST_NEW, 1)) === 0 && (await remOf(adb, CUST_NEW, 2)) === 0,
      `got ${JSON.stringify([await remOf(adb, CUST_NEW, 0), await remOf(adb, CUST_NEW, 1), await remOf(adb, CUST_NEW, 2)])}`);

    // audit (kind='use') was emitted on the real prod course-changes
    const ch = await data.collection('be_course_changes').where('customerId', '==', CUST_NEW).get();
    check('A.1 kind="use" audit emitted on real prod', ch.docs.some(d => d.data().kind === 'use'));
  } finally {
    console.log('\ncleanup...');
    try {
      for (const id of [CUST_OLD, CUST_NEW]) await data.collection('be_customers').doc(id).delete().catch(() => {});
      const snap = await data.collection('be_course_changes').get();
      for (const d of snap.docs) {
        const v = d.data();
        if (String(v.customerId || '').startsWith(NS) || String(v.linkedTreatmentId || '').startsWith(NS) || String(d.id).startsWith(NS)) await d.ref.delete();
      }
      let orphans = 0;
      for (const id of [CUST_OLD, CUST_NEW]) if ((await data.collection('be_customers').doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ V142 e2e: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
