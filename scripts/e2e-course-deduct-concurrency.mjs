#!/usr/bin/env node
// ─── HUNT R4 — concurrent course deduction lost-update (customer-doc race) ────
//
// User loop: hunt the stock system (incl. course deduction from TFP) until dry.
// HYPOTHESIS (code read backendClient.js:1308-1419): deductCourseItems is a
// read-modify-write WITHOUT a transaction — getDoc(customerDoc) @1310 → mutate
// courses[] in memory → updateCustomer(customerId,{courses}) (plain updateDoc)
// @1419. Two concurrent course deductions for the SAME customer both read the
// same courses[], both updateDoc → LAST WRITE WINS → one use LOST → the course
// is OVER-CREDITED (customer keeps a session they actually used). Course balance
// is money-adjacent (the customer paid for N sessions). This is the COURSE
// analog of the V147 stock race, with NO guard at all.
//
// Rule Q L2 (real prod, shipped deductCourseItems). Rule M/R: TEST- customer +
// cleanup. NO real customer touched (per the chanel-2853 lock).
// Run: node scripts/e2e-course-deduct-concurrency.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { deductCourseItems } from '../src/lib/backendClient.js';
import { parseQtyString } from '../src/lib/courseUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-CC4-${Date.now()}-${randomBytes(3).toString('hex')}`;
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

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — concurrent course-deduct (customer-doc race)\n`);

    const ROUNDS = 6;
    const ded = (cust) => deductCourseItems(cust, [{ courseIndex: 0, courseName: 'CC4Course', productName: 'CC4Product', deductQty: 1, unit: 'ครั้ง' }]);

    // ── R4.1 — TWO concurrent deductions of 1 each, course starts at 5/5 ─────
    // PURPOSE: remaining must end at 3 (two uses). Lost-update → 4.
    console.log('R4.1 — 2 concurrent deductCourseItems (1 each) on a 5/5 course → expect 3');
    let lost = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const CUST = `${NS}-CUST-A-${r}`;
      cleanupIds.push(CUST);
      await data.collection('be_customers').doc(CUST).set({
        customerId: CUST, fullName: 'CC4 Test', branchId: `${NS}-BR`,
        courses: [{ name: 'CC4Course', product: 'CC4Product', qty: '5 / 5 ครั้ง', courseType: 'ปกติ' }],
        createdAt: new Date().toISOString(),
      });
      await Promise.allSettled([ded(CUST), ded(CUST)]);
      const after = (await data.collection('be_customers').doc(CUST).get()).data();
      const rem = parseQtyString(after?.courses?.[0]?.qty || '').remaining;
      if (rem !== 3) lost++;
      console.log(`  round ${r}: remaining=${rem} (want 3 — both uses applied)`);
    }
    check('R4.1 — concurrent course deduction applies BOTH uses (no lost update / over-credit)',
      lost === 0, `→ ${lost}/${ROUNDS} rounds lost a use (over-credited)`);

    // ── R4.2 — 5 concurrent deductions of 1 each on a 5/5 course → expect 0 ──
    console.log('\nR4.2 — 5 concurrent deductCourseItems (1 each) on a 5/5 course → expect 0');
    let lost2 = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const CUST = `${NS}-CUST-B-${r}`;
      cleanupIds.push(CUST);
      await data.collection('be_customers').doc(CUST).set({
        customerId: CUST, fullName: 'CC4 Test', branchId: `${NS}-BR`,
        courses: [{ name: 'CC4Course', product: 'CC4Product', qty: '5 / 5 ครั้ง', courseType: 'ปกติ' }],
        createdAt: new Date().toISOString(),
      });
      const res = await Promise.allSettled(Array.from({ length: 5 }, () => ded(CUST)));
      const rejected = res.filter(x => x.status === 'rejected').length;
      const after = (await data.collection('be_customers').doc(CUST).get()).data();
      const rem = parseQtyString(after?.courses?.[0]?.qty || '').remaining;
      if (rem !== 0) lost2++;
      console.log(`  round ${r}: remaining=${rem} (want 0) rejected=${rejected}/5`);
    }
    check('R4.2 — 5-way concurrent course deduction applies ALL 5 uses (remaining 0)',
      lost2 === 0, `→ ${lost2}/${ROUNDS} rounds over-credited`);
  } finally {
    console.log('\ncleanup...');
    try {
      for (const id of cleanupIds) await data.collection('be_customers').doc(id).delete().catch(() => {});
      // course-change audit docs (none expected — no treatmentId passed — but sweep NS just in case)
      const cc = await data.collection('be_course_changes').get();
      for (const d of cc.docs) { if (String(d.data().customerId || '').startsWith(NS)) await d.ref.delete().catch(() => {}); }
      let orphans = 0;
      for (const id of cleanupIds) if ((await data.collection('be_customers').doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }

  console.log(`\n━━━ HUNT R4 course-deduct concurrency: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
