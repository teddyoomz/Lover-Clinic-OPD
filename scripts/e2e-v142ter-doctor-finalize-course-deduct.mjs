#!/usr/bin/env node
// ─── V142-ter — multi-stage: admin vitals → doctor record → admin finalize+deduct ─
//
// User: "admin ลงซักประวัติ แล้วแพทย์ลงบันทึก แล้ว admin ค่อยมากดแก้ไขแล้วตัดคอร์ส
// ที่มี / หรือ ซื้อคอร์สแล้วตัดเลย … เทสหรือยังว่ามันตัดจริงลดจริง".
//
// Distinct from V142 (edit-resave revert) + V142-bis (single-save create). A
// treatment goes vitals-save (skip deduct) → doctor-save (skip deduct, but the
// V101 serialization may PERSIST courseItems) → admin finalize (saveMode='staff'
// → reverse(old) + deduct(fresh, V142 carry-forward) + stock).
//
// Rule Q V66 — TRUE L2: the FINALIZE math is driven by the SHIPPED functions
// (reverseCourseDeduction / deductCourseItems / assignCourseToCustomer /
// deductStockForTreatment) + the SHIPPED helpers (buildCourseItemsForSave /
// buildReDeductListWithCarryForward) against REAL prod Firestore. The pre-finalize
// state (customer.courses balance + the doctor-save's persisted courseItems) is set
// directly — that state is EXACTLY what the vitals/doctor saveMode gates produce
// (course NOT deducted; courseItems serialized + saved).
//
// PHASE A — typical: course selected ONLY at finalize (doctor didn't touch it).
// PHASE B — buy a course at finalize + deduct immediately.
// PHASE C — EDGE: doctor SELECTED a below-full course (courseItems persisted, NOT
//           deducted) → does the finalize reverse OVER-CREDIT?
//
// Run: node scripts/e2e-v142ter-doctor-finalize-course-deduct.mjs

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
  reverseCourseDeduction, deductCourseItems, assignCourseToCustomer, deductStockForTreatment,
} from '../src/lib/backendClient.js';
import {
  buildCourseItemsForSave, buildReDeductListWithCarryForward,
  buildPurchasedCourseEntry, isPurchasedSessionRowId,
} from '../src/lib/treatmentBuyHelpers.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-V142TER-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); } }
function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {};
  for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; }
  return out;
}
function initAdmin() {
  if (adminApps().length) return adminFirestore();
  const env = loadEnvLocal();
  adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) });
  return adminFirestore();
}
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const cQty = async (db, cid, i) => ((await base(db).collection('be_customers').doc(cid).get()).data().courses[i].qty);
const bRem = async (db, bid) => ((await base(db).collection('be_stock_batches').doc(bid).get()).data()?.qty?.remaining);

// Faithful replica of the handleSubmit FINALIZE (saveMode='staff', isEdit) course path:
// reverse(oldExisting/oldPurchased) then deduct(carry-forward(fresh, old, selected)).
async function finalizeCourseDeduct({ customerId, treatmentId, selectedCourseItems, customerCourses, treatmentItems, savedCourseItems, loadedStatus }) {
  const oldExisting = (savedCourseItems || []).filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const oldPurchased = (savedCourseItems || []).filter(ci => isPurchasedSessionRowId(ci.rowId));
  const fresh = buildCourseItemsForSave(selectedCourseItems, customerCourses, treatmentItems);
  const freshExisting = fresh.filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const freshPurchased = fresh.filter(ci => isPurchasedSessionRowId(ci.rowId));
  // V142-quater gate (mirror TFP): only reverse if the prior save actually deducted
  const priorSaveDeducted = loadedStatus !== 'doctor-recorded' && loadedStatus !== 'vitalsigns-recorded';
  if (priorSaveDeducted && oldExisting.length) await reverseCourseDeduction(customerId, oldExisting);
  if (priorSaveDeducted && oldPurchased.length) await reverseCourseDeduction(customerId, oldPurchased, { preferNewest: true });
  const existingDeductions = buildReDeductListWithCarryForward(freshExisting, oldExisting, selectedCourseItems);
  const purchasedDeductions = buildReDeductListWithCarryForward(freshPurchased, oldPurchased, selectedCourseItems);
  if (existingDeductions.length) await deductCourseItems(customerId, existingDeductions, { treatmentId, staffName: 'แอดมิน' });
  if (purchasedDeductions.length) await deductCourseItems(customerId, purchasedDeductions, { treatmentId, preferNewest: true, staffName: 'แอดมิน' });
}

async function main() {
  const adb = initAdmin(); const data = base(adb);
  const BR = `${NS}-BR`, MED = `${NS}-MED`, BATCH = `${NS}-BATCH`;
  const CA = `${NS}-CUST-A`, CB = `${NS}-CUST-B`, CC = `${NS}-CUST-C`;
  const TA = `${NS}-T-A`, TB = `${NS}-T-B`, TC = `${NS}-T-C`;
  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — multi-stage vitals→doctor→finalize\n`);

    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'V142ter', isDefault: false });
    await data.collection('be_products').doc(MED).set({ productId: MED, productName: 'Talafil 10 mg', productType: 'ยา', branchId: BR, stockConfig: { trackStock: true, minAlert: 0, unit: 'กล่อง' }, status: 'ใช้งาน', createdAt: new Date().toISOString() });
    await data.collection('be_stock_batches').doc(BATCH).set({ batchId: BATCH, productId: MED, productName: 'Talafil 10 mg', branchId: BR, locationId: BR, locationType: 'branch', status: BATCH_STATUS.ACTIVE, qty: { total: 10, remaining: 10 }, receivedAt: new Date().toISOString() });
    const medTreatItem = { id: `med-${MED}`, name: 'Talafil 10 mg', qty: 1, unit: 'กล่อง', productId: MED };

    // ════ PHASE A — typical: existing course selected ONLY at finalize ════
    console.log('PHASE A — vitals(skip) → doctor(skip, no course) → finalize ตัดคอร์สที่มี 5/5 → 4/5 + ยา');
    await data.collection('be_customers').doc(CA).set({ customerId: CA, patientData: { firstName: NS, lastName: 'A', hn: CA }, courses: [{ name: 'PhysioX 5 ครั้ง', product: 'PhysioX', qty: '5 / 5 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า', productId: 'PHYSIO', branchId: BR }], createdAt: new Date().toISOString() });
    check('A.0 course 5/5 entering finalize (vitals+doctor did NOT deduct)', (await cQty(adb, CA, 0)) === '5 / 5 ครั้ง', `got ${await cQty(adb, CA, 0)}`);
    const custA = [{ courseId: 'be-course-0', courseName: 'PhysioX 5 ครั้ง', products: [{ rowId: 'be-row-0', courseIndex: 0, productId: 'PHYSIO', name: 'PhysioX', remaining: '5', total: '5', unit: 'ครั้ง' }] }];
    await finalizeCourseDeduct({ customerId: CA, treatmentId: TA, selectedCourseItems: new Set(['be-row-0']), customerCourses: custA, treatmentItems: [{ id: 'be-row-0', name: 'PhysioX', qty: 1, productId: 'PHYSIO' }, medTreatItem], savedCourseItems: [], loadedStatus: 'doctor-recorded' });
    await deductStockForTreatment(TA, { treatmentItems: [medTreatItem], consumables: [] }, { customerId: CA, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
    check('A.1 ★ finalize ตัดคอร์ส 5/5 → 4/5 (ลดจริง)', (await cQty(adb, CA, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, CA, 0)}`);
    check('A.2 ★ สต็อก Talafil 10 → 9 (ลดจริง)', (await bRem(adb, BATCH)) === 9, `got ${await bRem(adb, BATCH)}`);

    // ════ PHASE B — buy course at finalize + deduct immediately ════
    console.log('\nPHASE B — vitals → doctor → finalize ซื้อคอร์สแล้วตัดเลย 1/1 → 0/1');
    await data.collection('be_customers').doc(CB).set({ customerId: CB, patientData: { firstName: NS, lastName: 'B', hn: CB }, courses: [], createdAt: new Date().toISOString() });
    await assignCourseToCustomer(CB, { name: 'Testoviron 1 ครั้ง', products: [{ name: 'Testoviron', qty: 1, unit: 'ครั้ง' }], price: 1890, source: 'treatment', linkedTreatmentId: TB, courseType: 'ระบุสินค้าและจำนวนสินค้า' });
    const buyEntry = buildPurchasedCourseEntry({ id: '38699', name: 'Testoviron 1 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า', products: [{ id: '38699', name: 'Testoviron', qty: 1, unit: 'ครั้ง' }] });
    const bRow = buyEntry.products[0].rowId;
    await finalizeCourseDeduct({ customerId: CB, treatmentId: TB, selectedCourseItems: new Set([bRow]), customerCourses: [buyEntry], treatmentItems: [{ id: bRow, name: 'Testoviron', qty: 1, productId: '38699' }], savedCourseItems: [], loadedStatus: 'doctor-recorded' });
    check('B.1 ★ finalize ซื้อ+ตัด 1/1 → 0/1', (await cQty(adb, CB, 0)) === '0 / 1 ครั้ง', `got ${await cQty(adb, CB, 0)}`);

    // ════ PHASE C — EDGE: doctor SELECTED a below-full course (persists courseItems, NOT deducted) ════
    console.log('\nPHASE C — EDGE: doctor เลือกคอร์ส 4/5 (เซฟ courseItems แต่ไม่ตัด) → finalize over-credit?');
    await data.collection('be_customers').doc(CC).set({ customerId: CC, patientData: { firstName: NS, lastName: 'C', hn: CC }, courses: [{ name: 'PhysioY 5 ครั้ง', product: 'PhysioY', qty: '4 / 5 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า', productId: 'PHYSIOY', branchId: BR }], createdAt: new Date().toISOString() });
    check('C.0 course 4/5 after doctor-save (selected, NOT deducted by doctor gate)', (await cQty(adb, CC, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, CC, 0)}`);
    // doctor-save persisted this courseItem (buildCourseItemsForSave output) WITHOUT deducting
    const savedCI_C = [{ courseName: 'PhysioY 5 ครั้ง', productName: 'PhysioY', rowId: 'be-row-0', courseIndex: 0, deductQty: 1, unit: 'ครั้ง' }];
    const custC = [{ courseId: 'be-course-0', courseName: 'PhysioY 5 ครั้ง', products: [{ rowId: 'be-row-0', courseIndex: 0, productId: 'PHYSIOY', name: 'PhysioY', remaining: '4', total: '5', unit: 'ครั้ง' }] }];
    await finalizeCourseDeduct({ customerId: CC, treatmentId: TC, selectedCourseItems: new Set(['be-row-0']), customerCourses: custC, treatmentItems: [{ id: 'be-row-0', name: 'PhysioY', qty: 1, productId: 'PHYSIOY' }], savedCourseItems: savedCI_C, loadedStatus: 'doctor-recorded' });
    const finalC = await cQty(adb, CC, 0);
    check('C.1 ★ course 4/5 → 3/5 (ตัด 1 ถูกต้อง, ไม่ over-credit)', finalC === '3 / 5 ครั้ง', `got ${finalC}  ← ถ้าได้ "4 / 5" = OVER-CREDIT BUG (reverse คืนคอร์สที่ doctor-save ไม่เคยตัด)`);

    // ════ PHASE D — V142 edit-resave PRESERVED: a COMPLETED treatment (status cleared) re-saved → reverse RUNS + carry-forward holds ════
    console.log('\nPHASE D — กันพลาด: edit ใบที่ "เสร็จ" แล้ว (เคยตัดคอร์ส) → reverse ต้องยังทำงาน (V142)');
    const CD = `${NS}-CUST-D`, TD = `${NS}-T-D`;
    await data.collection('be_customers').doc(CD).set({ customerId: CD, patientData: { firstName: NS, lastName: 'D', hn: CD }, courses: [{ name: 'Testoviron 1 ครั้ง', product: 'Testoviron', qty: '0 / 1 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า', productId: '38699', branchId: BR }], createdAt: new Date().toISOString() });
    // finalized treatment: deducted to 0/1; on edit-reload freshPurchased=[] (rowId regenerated) → V142 carry-forward must re-apply after the reverse
    const savedCI_D = [{ courseName: 'Testoviron 1 ครั้ง', productName: 'Testoviron', rowId: 'purchased-38699-row-self', courseIndex: 0, deductQty: 1, unit: 'ครั้ง' }];
    await finalizeCourseDeduct({ customerId: CD, treatmentId: TD, selectedCourseItems: new Set(['purchased-38699-row-self']), customerCourses: [], treatmentItems: [{ id: 'purchased-38699-row-self', name: 'Testoviron', qty: 1 }], savedCourseItems: savedCI_D, loadedStatus: undefined });
    check('D.1 ★ V142 preserved: completed re-save keeps course 0/1 (reverse ran + carry-forward re-deducted)', (await cQty(adb, CD, 0)) === '0 / 1 ครั้ง', `got ${await cQty(adb, CD, 0)}`);

    console.log('\n  ═══ สรุปจำนวนที่เหลือ ═══');
    console.log(`     A: คอร์ส PhysioX ${await cQty(adb, CA, 0)} · สต็อก Talafil ${await bRem(adb, BATCH)}/10`);
    console.log(`     B: คอร์ส Testoviron ${await cQty(adb, CB, 0)}`);
    console.log(`     C: คอร์ส PhysioY ${finalC}  (เริ่ม 4/5, ตัด 1 → ควรเป็น 3/5)`);
  } finally {
    console.log('\ncleanup...');
    try {
      for (const id of [CA, CB, CC, `${NS}-CUST-D`]) await data.collection('be_customers').doc(id).delete().catch(() => {});
      for (const [c, id] of [['be_branches', BR], ['be_products', MED], ['be_stock_batches', BATCH]]) await data.collection(c).doc(id).delete().catch(() => {});
      for (const c of ['be_stock_movements', 'be_course_changes']) {
        const snap = await data.collection(c).get();
        for (const d of snap.docs) { const v = d.data(); if ([v.customerId, v.linkedTreatmentId, v.saleId, v.linkedSaleId, d.id].some(x => String(x || '').startsWith(NS))) await d.ref.delete(); }
      }
      let orphans = 0;
      for (const [c, id] of [['be_customers', CA], ['be_customers', CB], ['be_customers', CC], ['be_customers', `${NS}-CUST-D`], ['be_products', MED], ['be_stock_batches', BATCH], ['be_branches', BR]]) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ V142-ter e2e: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
