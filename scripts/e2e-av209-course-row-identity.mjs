#!/usr/bin/env node
// ─── AV209 — positional-rowId TOCTOU: identity-first row targeting (Rule Q L2) ─
//
// Drives the REAL shipped client-SDK mutators (adjustCourseRemainingQty /
// exchangeCourseProduct / refundCustomerCourse / removeCustomerCourseRowAtomic)
// against REAL prod Firestore, reproducing the exact TOCTOU the fix closes:
// the UI freezes an array index at render; ANOTHER machine inserts/removes a
// row before the commit; the stale index must NOT hit the wrong row.
//
// Rule M/R: TEST- customers only + full cleanup (chanel-2853 lock). Admin SDK
// = setup/seed/verify/cleanup ONLY; the mutations under test go through the
// CLIENT SDK exactly as the UI issues them.
// Run: node scripts/e2e-av209-course-row-identity.mjs
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
  adjustCourseRemainingQty, exchangeCourseProduct, refundCustomerCourse,
  removeCustomerCourseRowAtomic,
} from '../src/lib/backendClient.js';
import { COURSE_ROW_STALE_MSG } from '../src/lib/courseExchange.js';
import { parseQtyString } from '../src/lib/courseUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-AV209-${Date.now()}-${randomBytes(3).toString('hex')}`;
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

const rowA = () => ({ name: 'AV209 Course A', product: 'AV209 Prod A', qty: '5 / 10 ครั้ง', status: 'กำลังใช้งาน' });
const rowB = (qty = '6 / 12 ครั้ง') => ({ name: 'AV209 Course B', product: 'AV209 Prod B', qty, status: 'กำลังใช้งาน' });
const identB = { expectedName: 'AV209 Course B', expectedProduct: 'AV209 Prod B' };

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const custIds = [];
  const seed = async (suffix, courses) => {
    const id = `${NS}-${suffix}`;
    custIds.push(id);
    await data.collection('be_customers').doc(id).set({
      customerId: id, firstname: 'AV209', lastname: suffix, courses,
      branchId: '', createdAt: new Date().toISOString(),
    });
    return id;
  };
  const readCourses = async (id) => (await data.collection('be_customers').doc(id).get()).data()?.courses || [];

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — AV209 identity-first row targeting on REAL prod\n`);

    // ── S1 — adjust TOCTOU shift-LEFT (concurrent removal before commit) ────
    console.log('S1 — UI froze index 1 (B); row A removed concurrently → adjust must still hit B');
    {
      const cid = await seed('S1', [rowA(), rowB()]);
      // "another machine" removes A between render and commit:
      await data.collection('be_customers').doc(cid).update({ courses: [rowB()] });
      const res = await adjustCourseRemainingQty(cid, 1, -1, { ...identB, staffName: 'AV209' });
      const after = await readCourses(cid);
      check('S1.1 adjusted the identity row (B)', res.courseName === 'AV209 Course B');
      check('S1.2 stored qty 5 / 12', parseQtyString(after[0]?.qty || '').remaining === 5, JSON.stringify(after));
      check('S1.3 single row remains', after.length === 1);
    }

    // ── S2 — adjust TOCTOU shift-RIGHT (concurrent insert at head) ──────────
    console.log('S2 — UI froze index 0 (B); row A inserted at head → the OTHER row untouched');
    {
      const cid = await seed('S2', [rowB()]);
      await data.collection('be_customers').doc(cid).update({ courses: [rowA(), rowB()] });
      await adjustCourseRemainingQty(cid, 0, 2, { ...identB, staffName: 'AV209' });
      const after = await readCourses(cid);
      check('S2.1 row A untouched (pre-fix bug hit THIS row)', parseQtyString(after[0]?.qty || '').remaining === 5, JSON.stringify(after[0]));
      check('S2.2 row B got +2 → 8 / 12', parseQtyString(after[1]?.qty || '').remaining === 8, JSON.stringify(after[1]));
    }

    // ── S3 — ambiguous duplicates + stale index → Thai stale error, NO write ─
    console.log('S3 — duplicates + stale index → COURSE_ROW_STALE_MSG + doc unchanged');
    {
      const cid = await seed('S3', [rowB(), rowB()]);
      let threw = '';
      try { await adjustCourseRemainingQty(cid, 7, -1, identB); } catch (e) { threw = e.message; }
      const after = await readCourses(cid);
      check('S3.1 threw the stale-row Thai error', threw === COURSE_ROW_STALE_MSG, threw);
      check('S3.2 no write happened', after.every(c => parseQtyString(c.qty).remaining === 6), JSON.stringify(after));
    }

    // ── S4 — exchangeCourseProduct TOCTOU ───────────────────────────────────
    console.log('S4 — exchange with stale index re-targets by identity');
    {
      const cid = await seed('S4', [rowA(), rowB()]);
      await data.collection('be_customers').doc(cid).update({ courses: [rowB()] });
      const res = await exchangeCourseProduct(cid, 1, { name: 'AV209 NEW', qty: 3, unit: 'ครั้ง' }, 'e2e', identB);
      const after = await readCourses(cid);
      check('S4.1 exchange log records the RIGHT old product', res.exchangeLog.oldProduct === 'AV209 Prod B');
      check('S4.2 row product swapped', after[0]?.product === 'AV209 NEW', JSON.stringify(after));
    }

    // ── S5 — refund legacy row (no courseId) with stale index ───────────────
    console.log('S5 — legacy refund: stale index + identity refunds the RIGHT row');
    {
      const cid = await seed('S5', [rowA(), rowB()]);
      await data.collection('be_customers').doc(cid).update({ courses: [rowB()] });
      const res = await refundCustomerCourse(cid, '', 100, { courseIndex: 1, ...identB, reason: 'e2e' });
      const after = await readCourses(cid);
      check('S5.1 refunded the identity row (B)', res.fromCourse.name === 'AV209 Course B');
      check('S5.2 stored status คืนเงิน', after[0]?.status === 'คืนเงิน', JSON.stringify(after));
    }

    // ── S6 — removeCustomerCourseRowAtomic (full-exchange cleanup) ──────────
    console.log('S6 — atomic single-row removal by identity + zero-remaining guard');
    {
      const cid = await seed('S6', [rowA(), rowB('0 / 12 ครั้ง')]);
      const res = await removeCustomerCourseRowAtomic(cid, { courseIndex: 0, ...identB });
      const after = await readCourses(cid);
      check('S6.1 removed the zeroed B row', res.removed === true && after.length === 1);
      check('S6.2 row A intact', after[0]?.name === 'AV209 Course A', JSON.stringify(after));
      const res2 = await removeCustomerCourseRowAtomic(cid, { courseIndex: 0, expectedName: 'AV209 Course A', expectedProduct: 'AV209 Prod A' });
      check('S6.3 remaining>0 row NOT removed (racing top-up guard)', res2.removed === false && res2.reason === 'remaining>0');
    }

    // ── S7 — live concurrency: adjust ∥ concurrent head-removal (OCC) ───────
    console.log('S7 — adjust racing a concurrent removal → OCC serializes, B still correct');
    {
      const cid = await seed('S7', [rowA(), rowB()]);
      const [adj] = await Promise.allSettled([
        adjustCourseRemainingQty(cid, 1, -2, identB),
        data.collection('be_customers').doc(cid).update({ courses: [rowB()] }),
      ]);
      const after = await readCourses(cid);
      const b = after.find(c => c.name === 'AV209 Course B');
      // Either order is legal; the invariant: B ends at 4 (6-2) OR the adjust
      // lost to the racing whole-array admin overwrite that reset B — in the
      // OCC-retry path the adjust re-applies on the post-removal array.
      check('S7.1 adjust settled without wrong-row damage', adj.status === 'fulfilled', JSON.stringify(adj));
      check('S7.2 B remaining is 4 (identity row adjusted, never A)', parseQtyString(b?.qty || '').remaining === 4, JSON.stringify(after));
    }

    // ── cleanup ─────────────────────────────────────────────────────────────
    console.log('\ncleanup —');
    for (const id of custIds) await data.collection('be_customers').doc(id).delete();
    const auditSnap = await data.collection('be_course_changes').where('customerId', 'in', custIds.slice(0, 10)).get();
    for (const d of auditSnap.docs) await d.ref.delete();
    const orphans = await data.collection('be_customers').where('customerId', '>=', NS).where('customerId', '<', NS + '').get();
    check('CLEANUP zero orphans', orphans.empty, `${orphans.size} left`);
    console.log(`  (audit docs removed: ${auditSnap.size})`);
  } finally {
    try { await signOut(clientAuth); } catch { /* noop */ }
  }

  console.log(`\n══ AV209 L2 RESULT: PASS ${pass} / FAIL ${fail} ══`);
  if (fails.length) { console.log('failed:', fails.join(' | ')); process.exitCode = 1; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => setTimeout(() => process.exit(process.exitCode || 0), 1500))
    .catch((e) => { console.error('FATAL', e); process.exit(1); });
}
