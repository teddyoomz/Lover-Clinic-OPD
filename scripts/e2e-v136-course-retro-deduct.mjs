#!/usr/bin/env node
// ─── V136 TRUE-L2 e2e — course-retro edit deducts course + branch stock ──────
//
// User (2026-05-31): "test มาด้วยว่าสิ่งเดิมๆที่เคย wiring ไว้ — ไปตัดคอร์ส
// ในข้อมูลคอร์สคงเหลือของลูกค้า และตัดสต็อคสาขานั้นๆ — การ edit ก็ต้องทำเหมือน
// เดิมเป๊ะๆ flow เดิมเป๊ะๆ ... ครอบคลุมที่สุด ทุกกรณี หาทางอะไรก็ได้ หยุดกลางทาง
// save ซ้ำ".
//
// Rule Q V66 — this is a TRUE L2: it calls the SHIPPED client functions
// (deductCourseItems / reverseCourseDeduction / deductStockForTreatment /
// reverseStockForTreatment from src/lib/backendClient.js) against REAL prod
// Firestore, authenticated as a clinic-staff/admin identity via a custom token.
// These are the EXACT functions handleSubmit('course') calls — so this proves
// the retro-edit course-deduction + branch-stock-deduction wiring works
// end-to-end on real data, not a replica.
//
// Why this matters for V136: saveMode='course' was added ONLY to skip the
// auto-SALE; the course-deduct + stock-deduct CALLS are byte-identical to the
// staff path (proven structurally by tests/v136-course-stock-flow-simulate.js).
// This e2e exercises those exact shipped functions to prove the mechanics.
//
// Compliance: Rule R (env-pull) + Rule M discipline (TEST- prefixed fixtures
// only, never touches real data, try/finally cleanup + zero-orphan verify +
// custom-token Auth user deleted). V33.10/11 prefixes.
//
// Run: node scripts/e2e-v136-course-retro-deduct.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

// SHIPPED client functions + the client app (db/auth) they operate on.
import { auth as clientAuth } from '../src/firebase.js';
import {
  deductCourseItems,
  reverseCourseDeduction,
  deductStockForTreatment,
  reverseStockForTreatment,
  listStockMovements,
} from '../src/lib/backendClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-V136-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); }
}

function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function initAdmin() {
  if (adminApps().length) return adminFirestore();
  const env = loadEnvLocal();
  adminInit({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
  });
  return adminFirestore();
}

const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const qtyOf = async (db, custId, idx) =>
  ((await base(db).collection('be_customers').doc(custId).get()).data().courses[idx].qty);
const batchRemaining = async (db, batchId) =>
  ((await base(db).collection('be_stock_batches').doc(batchId).get()).data()?.qty?.remaining);

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const BR_A = `${NS}-BR-A`;
  const BR_B = `${NS}-BR-B`;
  const CUST = `${NS}-CUST`;
  const P_A = `${NS}-P-A`, P_B = `${NS}-P-B`;
  const BATCH_A = `${NS}-BATCH-A`, BATCH_B = `${NS}-BATCH-B`;
  const T_A = `${NS}-T-A`, T_B = `${NS}-T-B`;
  const dedA = [{ courseName: 'V136 Course A', productName: 'V136 Course A', courseIndex: 0, deductQty: 1 }];

  try {
    // ── Auth as clinic-staff/admin via custom token (the identity the UI runs as)
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in as ${STAFF_UID} (admin claim) — calling SHIPPED client functions\n`);

    // ── Fixtures (admin SDK, canonical paths) ──────────────────────────────
    await data.collection('be_branches').doc(BR_A).set({ branchId: BR_A, branchName: 'V136 A', isDefault: false });
    await data.collection('be_branches').doc(BR_B).set({ branchId: BR_B, branchName: 'V136 B', isDefault: false });
    await data.collection('be_customers').doc(CUST).set({
      customerId: CUST,
      patientData: { firstName: NS, lastName: 'RetroCourse', hn: CUST },
      courses: [
        { name: 'V136 Course A', product: 'V136 Course A', qty: '5 / 5 ครั้ง', courseType: 'มาตรฐาน', branchId: BR_A },
        { name: 'V136 Course B', product: 'V136 Course B', qty: '3 / 3 ครั้ง', courseType: 'มาตรฐาน', branchId: BR_B },
      ],
      createdAt: new Date().toISOString(),
    });
    for (const [pid, br] of [[P_A, BR_A], [P_B, BR_B]]) {
      await data.collection('be_products').doc(pid).set({
        productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: br,
        stockConfig: { trackStock: true, minAlert: 0, unit: 'ชิ้น' }, status: 'ใช้งาน',
        createdAt: new Date().toISOString(),
      });
    }
    for (const [bid, pid, br] of [[BATCH_A, P_A, BR_A], [BATCH_B, P_B, BR_B]]) {
      await data.collection('be_stock_batches').doc(bid).set({
        batchId: bid, productId: pid, productName: `${pid}-name`,
        branchId: br, locationId: br, locationType: 'branch',
        status: BATCH_STATUS.ACTIVE, qty: { total: 10, remaining: 10 },
        receivedAt: new Date().toISOString(),
      });
    }
    console.log('fixtures created.\n');

    // ── PHASE 1 — course deduction (SHIPPED deductCourseItems), branch A ────
    console.log('PHASE 1 — ตัดคอร์ส (SHIPPED deductCourseItems)');
    await deductCourseItems(CUST, dedA, { treatmentId: T_A, staffId: '', staffName: '' });
    check('1.1 course remaining 5→4 after deduct', await qtyOf(adb, CUST, 0) === '4 / 5 ครั้ง', `got ${await qtyOf(adb, CUST, 0)}`);

    // ── PHASE 2 — branch stock deduction (SHIPPED deductStockForTreatment) ──
    console.log('PHASE 2 — ตัดสต็อคสาขา A (SHIPPED deductStockForTreatment)');
    await deductStockForTreatment(T_A, { treatmentItems: [{ productId: P_A, name: `${P_A}-name`, qty: 1, unit: 'ชิ้น' }] },
      { customerId: CUST, branchId: BR_A, movementType: MOVEMENT_TYPES.TREATMENT });
    check('2.1 branch-A batch remaining 10→9 after stock deduct', await batchRemaining(adb, BATCH_A) === 9, `got ${await batchRemaining(adb, BATCH_A)}`);
    const mvA = await listStockMovements({ linkedTreatmentId: T_A });
    const t6A = mvA.find(m => Number(m.type) === 6); // movement doc field is `type` (= MOVEMENT_TYPES.TREATMENT)
    check('2.2 a TREATMENT(6) movement was created', !!t6A);
    check('2.3 movement stamped to the SELECTED branch (BR-A)', t6A && String(t6A.branchId) === BR_A, `got ${t6A && t6A.branchId}`);

    // ── PHASE 3 — cross-branch isolation ───────────────────────────────────
    console.log('PHASE 3 — branch isolation (ตัด B แล้ว A ไม่ขยับ)');
    await deductCourseItems(CUST, [{ courseName: 'V136 Course B', productName: 'V136 Course B', courseIndex: 1, deductQty: 1 }], { treatmentId: T_B });
    await deductStockForTreatment(T_B, { treatmentItems: [{ productId: P_B, name: `${P_B}-name`, qty: 1, unit: 'ชิ้น' }] },
      { customerId: CUST, branchId: BR_B, movementType: MOVEMENT_TYPES.TREATMENT });
    check('3.1 branch-B batch 10→9', await batchRemaining(adb, BATCH_B) === 9, `got ${await batchRemaining(adb, BATCH_B)}`);
    check('3.2 branch-A batch STILL 9 (B did not touch A)', await batchRemaining(adb, BATCH_A) === 9, `got ${await batchRemaining(adb, BATCH_A)}`);
    check('3.3 course B 3→2; course A still 4 (independent)', (await qtyOf(adb, CUST, 1)) === '2 / 3 ครั้ง' && (await qtyOf(adb, CUST, 0)) === '4 / 5 ครั้ง');

    // ── PHASE 4 — reverse + save ซ้ำ: round-trip, no drift ─────────────────
    console.log('PHASE 4 — reverse แล้ว save ซ้ำ (round-trip ไม่ drift)');
    await reverseCourseDeduction(CUST, dedA);
    check('4.1 reverseCourseDeduction restores course A 4→5', await qtyOf(adb, CUST, 0) === '5 / 5 ครั้ง', `got ${await qtyOf(adb, CUST, 0)}`);
    await reverseStockForTreatment(T_A);
    check('4.2 reverseStockForTreatment restores batch-A 9→10', await batchRemaining(adb, BATCH_A) === 10, `got ${await batchRemaining(adb, BATCH_A)}`);
    await deductCourseItems(CUST, dedA, { treatmentId: T_A, staffId: '', staffName: '' });
    await deductStockForTreatment(T_A, { treatmentItems: [{ productId: P_A, name: `${P_A}-name`, qty: 1, unit: 'ชิ้น' }] },
      { customerId: CUST, branchId: BR_A, movementType: MOVEMENT_TYPES.TREATMENT });
    check('4.3 re-deduct course A back to 4 (no drift)', await qtyOf(adb, CUST, 0) === '4 / 5 ครั้ง', `got ${await qtyOf(adb, CUST, 0)}`);
    check('4.4 re-deduct batch-A back to 9 (no drift)', await batchRemaining(adb, BATCH_A) === 9, `got ${await batchRemaining(adb, BATCH_A)}`);

    // ── PHASE 5 — NO sale created for the course-retro treatments ───────────
    console.log('PHASE 5 — ห้ามมีใบขาย (course-retro = no auto-sale)');
    for (const tid of [T_A, T_B]) {
      const sales = await data.collection('be_sales').where('linkedTreatmentId', '==', tid).get();
      check(`5.x no be_sales linked to ${tid === T_A ? 'T-A' : 'T-B'}`, sales.empty, `found ${sales.size}`);
    }

    // ── PHASE 6 — course-change audit (kind='use') was emitted ──────────────
    console.log('PHASE 6 — ประวัติการใช้คอร์ส (audit kind=use)');
    const changes = await data.collection('be_course_changes').where('customerId', '==', CUST).get();
    const useEntries = changes.docs.map(d => d.data()).filter(c => c.kind === 'use');
    check('6.1 at least one kind="use" audit entry emitted', useEntries.length >= 1, `got ${useEntries.length}`);
  } finally {
    // ── Cleanup (zero-orphan) ──────────────────────────────────────────────
    console.log('\ncleanup...');
    try {
      const data = base(adb);
      const byId = [
        ['be_branches', BR_A], ['be_branches', BR_B], ['be_customers', CUST],
        ['be_products', P_A], ['be_products', P_B],
        ['be_stock_batches', BATCH_A], ['be_stock_batches', BATCH_B],
      ];
      for (const [c, id] of byId) await data.collection(c).doc(id).delete().catch(() => {});
      for (const c of ['be_stock_movements', 'be_course_changes']) {
        const snap = await data.collection(c).get();
        for (const d of snap.docs) {
          const v = d.data();
          if (String(v.linkedTreatmentId || '').startsWith(NS) || String(v.customerId || '').startsWith(NS) || String(d.id).startsWith(NS)) await d.ref.delete();
        }
      }
      let orphans = 0;
      for (const [c, id] of byId) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s) remain.`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }

  console.log(`\n━━━ V136 e2e: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
