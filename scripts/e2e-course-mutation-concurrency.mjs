#!/usr/bin/env node
// ─── HUNT R4-class — concurrent course-MUTATION lost-update (V148 class-fix) ──
//
// Proves the V148 atomic helper fixed the WHOLE customer.courses[] read-modify-
// write class (not just deductCourseItems). All these mutators used to be
// getDoc→updateCustomer with no tx → concurrent pairs lost-updated.
//   CM1 — assign ‖ assign (buy same course twice concurrently → BOTH land)
//   CM2 — deduct ‖ assign (use one course while buying another → BOTH apply)
//   CM3 — deduct ‖ reverse on the same course (edit interleave → conservation)
//   CM4 — addCourseRemainingQty ‖ deduct (admin add while use → BOTH apply)
//
// Rule Q L2 (real prod, shipped fns). Rule M/R: TEST customer + cleanup.
// Run: node scripts/e2e-course-mutation-concurrency.mjs
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
  assignCourseToCustomer, deductCourseItems, reverseCourseDeduction, addCourseRemainingQty,
} from '../src/lib/backendClient.js';
import { parseQtyString } from '../src/lib/courseUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-CM-${Date.now()}-${randomBytes(3).toString('hex')}`;
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

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const cleanupIds = [];
  const seedCustomer = async (id, courses = []) => {
    cleanupIds.push(id);
    await data.collection('be_customers').doc(id).set({
      customerId: id, fullName: 'CM Test', branchId: `${NS}-BR`, courses, createdAt: new Date().toISOString(),
    });
  };
  const readCourses = async (id) => ((await data.collection('be_customers').doc(id).get()).data()?.courses) || [];
  const master = (name) => ({ name, products: [{ productId: `${NS}-P`, name: `${name}-prod`, qty: 5, unit: 'ครั้ง' }], courseType: 'ปกติ', price: 1000 });

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — concurrent course-mutation class\n`);
    const ROUNDS = 4;

    // CM1 — assign ‖ assign (buy the same course twice concurrently → BOTH land)
    console.log('CM1 — concurrent assignCourseToCustomer ×2 → expect 2 course entries');
    let cm1Bad = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const CUST = `${NS}-CM1-${r}`; await seedCustomer(CUST, []);
      await Promise.allSettled([assignCourseToCustomer(CUST, master('CM1Course')), assignCourseToCustomer(CUST, master('CM1Course'))]);
      const c = await readCourses(CUST);
      if (c.length !== 2) cm1Bad++;
      console.log(`  round ${r}: courses=${c.length} (want 2)`);
    }
    check('CM1 — concurrent buy×2 BOTH land (no lost buy)', cm1Bad === 0, `${cm1Bad}/${ROUNDS} lost a buy`);

    // CM2 — deduct ‖ assign (use existing course while buying a new one → BOTH apply)
    console.log('\nCM2 — concurrent [deduct existing] + [assign new] → existing rem 4 AND new added');
    let cm2Bad = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const CUST = `${NS}-CM2-${r}`;
      await seedCustomer(CUST, [{ name: 'ExistCourse', product: 'ExistProduct', qty: '5 / 5 ครั้ง', courseType: 'ปกติ' }]);
      await Promise.allSettled([
        deductCourseItems(CUST, [{ courseIndex: 0, courseName: 'ExistCourse', productName: 'ExistProduct', deductQty: 1 }]),
        assignCourseToCustomer(CUST, master('CM2New')),
      ]);
      const c = await readCourses(CUST);
      const exist = c.find(x => x.name === 'ExistCourse');
      const rem = parseQtyString(exist?.qty || '').remaining;
      const hasNew = c.some(x => x.name === 'CM2New');
      const ok = rem === 4 && hasNew && c.length === 2;
      if (!ok) cm2Bad++;
      console.log(`  round ${r}: existRem=${rem} (want 4) hasNew=${hasNew} courses=${c.length} (want 2)`);
    }
    check('CM2 — use‖buy BOTH apply (deduction + new course both persist)', cm2Bad === 0, `${cm2Bad}/${ROUNDS} lost an op`);

    // CM3 — deduct ‖ reverse on the same course → conservation (net 3)
    console.log('\nCM3 — concurrent [deduct 1] + [reverse 1] on a 3/5 course → net stays 3 (conservation)');
    let cm3Bad = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const CUST = `${NS}-CM3-${r}`;
      await seedCustomer(CUST, [{ name: 'C3', product: 'C3P', qty: '3 / 5 ครั้ง', courseType: 'ปกติ' }]);
      await Promise.allSettled([
        deductCourseItems(CUST, [{ courseIndex: 0, courseName: 'C3', productName: 'C3P', deductQty: 1 }]),
        reverseCourseDeduction(CUST, [{ courseIndex: 0, courseName: 'C3', productName: 'C3P', deductQty: 1 }]),
      ]);
      const c = await readCourses(CUST);
      const rem = parseQtyString(c[0]?.qty || '').remaining;
      // deduct(-1) + reverse(+1) on 3 → net 3 (order-independent; reverse caps at total 5)
      if (rem !== 3) cm3Bad++;
      console.log(`  round ${r}: remaining=${rem} (want 3 — deduct+reverse net zero)`);
    }
    check('CM3 — deduct‖reverse conservation (net 3, neither lost)', cm3Bad === 0, `${cm3Bad}/${ROUNDS} drifted`);

    // CM4 — addCourseRemainingQty ‖ deduct (admin add while use → both apply)
    console.log('\nCM4 — concurrent [admin add 1] + [deduct 1] on a 3/5 course → net stays 3');
    let cm4Bad = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const CUST = `${NS}-CM4-${r}`;
      await seedCustomer(CUST, [{ name: 'C4', product: 'C4P', qty: '3 / 5 ครั้ง', courseType: 'ปกติ' }]);
      await Promise.allSettled([
        addCourseRemainingQty(CUST, 0, 1, { reason: 'CM4' }),
        deductCourseItems(CUST, [{ courseIndex: 0, courseName: 'C4', productName: 'C4P', deductQty: 1 }]),
      ]);
      const c = await readCourses(CUST);
      const rem = parseQtyString(c[0]?.qty || '').remaining;
      if (rem !== 3) cm4Bad++; // +1 add, -1 deduct → net 3
      console.log(`  round ${r}: remaining=${rem} (want 3 — add+deduct net zero)`);
    }
    check('CM4 — admin-add‖deduct BOTH apply (net 3, neither lost)', cm4Bad === 0, `${cm4Bad}/${ROUNDS} drifted`);

  } finally {
    console.log('\ncleanup...');
    try {
      for (const id of cleanupIds) await data.collection('be_customers').doc(id).delete().catch(() => {});
      const cc = await data.collection('be_course_changes').get();
      for (const d of cc.docs) { if (String(d.data().customerId || '').startsWith(NS)) await d.ref.delete().catch(() => {}); }
      let orphans = 0;
      for (const id of cleanupIds) if ((await data.collection('be_customers').doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }

  console.log(`\n━━━ HUNT R4-class course-mutation concurrency: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
