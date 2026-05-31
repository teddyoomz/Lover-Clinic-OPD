#!/usr/bin/env node
// ═══ TFP FULL-FLOW MATRIX — final exhaustive verification (Rule Q V66 L2) ═══
//
// User: "ทดสอบมาทุก flow ที่นายรู้ หรือไม่รู้ก็มั่วให้สุด ที่ TFP เราทำได้ และ
// ตรวจสอบความถูกต้องขั้นสุดมาทุกการเปลี่ยนแปลงของข้อมูล … 100% Perfectly" +
// "จะทำข้ามขั้นตอนไปมายังไงหรือทำไม่ครบขั้นตอน ถ้ามีการบันทึกการตัดคอร์สในกรณีใดๆ
// ทั้งสิ้น ข้อมูลก็ต้องถูกต้องทุกครั้ง" + "ปุ่มบันทึกสำหรับแพทย์ ไม่ต้องบันทึกพวก
// ข้อมูลการตัดคอร์ส … บันทึกตัดคอร์สจะเป็นบันทึกด้านล่างของ TFP".
//
// FAITHFUL mirror of TreatmentFormPage.handleSubmit() course/stock decision tree
// driving the SHIPPED mutation functions against REAL prod Firestore (TEST-
// fixtures, zero-orphan cleanup). Every phase asserts EVERY data change:
// customer.courses balance + be_stock_batches.remaining + be_course_changes audit.
//
// V142-quinquies (2026-05-31) — the mirror now models the PERSISTED `_courseDeducted`
// flag (Part B) + course-NEUTRAL doctor/vitals saves (Part A), exactly matching
// the fixed TFP. applyTfpSave returns { courseItems, courseDeducted } so multi-step
// flows thread the flag (= the persisted state machine). Locked vs TFP by
// tests/tfp-flow-matrix-mirror-fidelity.test.js.
//
// 17 phases:
//   GROUP 1 single-save create  P1 std P2 buy P3 buffet P4 fill-later P5 meds-only
//   GROUP 2 step-skip multistage P6 vitals→fin P7 doctor→fin P8 vitals→doctor→fin P9 +edit-refinalize
//   GROUP 3 edit-resave (V142)  P10 image-only P11 un-check P12 stock-change
//   GROUP 4 adversarial/wild    P13 dup-course P14 multi-edit P15 shortfall
//   GROUP 5 go-backward (V142-quinquies) P16 finalize→DOCTOR→finalize P17 finalize→VITALS→finalize
//
// Run: node scripts/e2e-tfp-full-flow-matrix.mjs

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
  reverseCourseDeduction, deductCourseItems, assignCourseToCustomer,
  deductStockForTreatment, reverseStockForTreatment,
} from '../src/lib/backendClient.js';
import {
  buildCourseItemsForSave, buildReDeductListWithCarryForward,
  buildPurchasedCourseEntry, isPurchasedSessionRowId,
} from '../src/lib/treatmentBuyHelpers.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-TFPMATRIX-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
const ccFor = async (db, tid) => { const s = await base(db).collection('be_course_changes').where('linkedTreatmentId', '==', tid).get(); return s.docs.map(d => d.data()); };

// ─── FAITHFUL mirror of TFP.handleSubmit() course + stock flow (V142-quinquies) ───
// Returns { courseItems, courseDeducted }: the courseItems the doc persists + the
// `_courseDeducted` flag it persists. Multi-step flows feed courseDeducted forward
// as the next save's loadedCourseDeducted (= the persisted state machine).
// Source-grep-locked vs TFP (tfp-flow-matrix-mirror-fidelity.test.js).
async function applyTfpSave(p) {
  const {
    saveMode = 'staff', isEdit = false, customerId, treatmentId,
    selectedCourseItems, customerCourses, treatmentItems = [], savedCourseItems = [],
    loadedCourseDeducted = false, // V142-quinquies: the persisted flag (drives the reverse)
    stockTreatmentItems = [], stockConsumables = [], stockMeds = [],
    hasSale = false, hasStockChanged = true, branchId, buyAssignSpecs = [],
  } = p;
  const isCourseNeutral = saveMode === 'doctor' || saveMode === 'vitals'; // doctor/vitals SKIP deduct+reverse AND don't write course data
  const deductGate = !isCourseNeutral;
  // Part A — doctor/vitals PRESERVE existing courseItems (do NOT re-serialize/write course data)
  const courseItems = isCourseNeutral ? (savedCourseItems || []) : buildCourseItemsForSave(selectedCourseItems, customerCourses, treatmentItems);
  const freshExisting = courseItems.filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const freshPurchased = courseItems.filter(ci => isPurchasedSessionRowId(ci.rowId));
  const oldExisting = (savedCourseItems || []).filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const oldPurchased = (savedCourseItems || []).filter(ci => isPurchasedSessionRowId(ci.rowId));
  const priorSaveDeducted = loadedCourseDeducted; // Part B — flag, NOT status heuristic
  const existingDeductions = isEdit ? buildReDeductListWithCarryForward(freshExisting, oldExisting, selectedCourseItems) : freshExisting;
  const purchasedDeductions = isEdit ? buildReDeductListWithCarryForward(freshPurchased, oldPurchased, selectedCourseItems) : freshPurchased;
  // reverse (edit + deductGate + flag)
  if (deductGate && isEdit && priorSaveDeducted) {
    if (oldExisting.length) await reverseCourseDeduction(customerId, oldExisting);
    if (oldPurchased.length) await reverseCourseDeduction(customerId, oldPurchased, { preferNewest: true });
  }
  const stockChanged = !isEdit || hasStockChanged;
  if (isEdit && stockChanged) await reverseStockForTreatment(treatmentId);
  if (deductGate && existingDeductions.length) await deductCourseItems(customerId, existingDeductions, { treatmentId, staffName: 'แอดมิน' });
  if (deductGate && stockChanged && (stockConsumables.length || stockTreatmentItems.length))
    await deductStockForTreatment(treatmentId, { consumables: stockConsumables, treatmentItems: stockTreatmentItems }, { customerId, branchId, movementType: MOVEMENT_TYPES.TREATMENT });
  if (stockChanged && !hasSale && stockMeds.length)
    await deductStockForTreatment(treatmentId, { medications: stockMeds }, { customerId, branchId, movementType: MOVEMENT_TYPES.TREATMENT_MED });
  if (deductGate && saveMode !== 'course' && hasSale && !isEdit) {
    for (const spec of buyAssignSpecs) await assignCourseToCustomer(customerId, spec);
  }
  if (deductGate && purchasedDeductions.length) await deductCourseItems(customerId, purchasedDeductions, { preferNewest: true, treatmentId, staffName: 'แอดมิน' });
  // Part B — flag persisted by this save: deducting saves OWN it; neutral saves PRESERVE
  const willDeductCourses = existingDeductions.length > 0 || purchasedDeductions.length > 0;
  const courseDeducted = isCourseNeutral ? loadedCourseDeducted : willDeductCourses;
  return { courseItems, courseDeducted };
}

// form-shape course group (what buildCourseItemsForSave reads)
const grp = (courseIndex, productId, name, remaining, total, unit = 'ครั้ง', extra = {}) =>
  ({ courseId: `be-course-${courseIndex}`, courseName: `${name} ${total} ครั้ง`, products: [{ rowId: `be-row-${courseIndex}`, courseIndex, productId, name, remaining: String(remaining), total: String(total), unit, ...extra }] });
// doc-shape course entry (what deductCourseItems reads)
const docCourse = (name, product, remaining, total, courseType, productId, branchId, unit = 'ครั้ง') =>
  ({ name: `${name} ${total} ครั้ง`, product, qty: `${remaining} / ${total} ${unit}`, courseType, productId, branchId });

async function main() {
  const adb = initAdmin(); const data = base(adb);
  const BR = `${NS}-BR`, MED = `${NS}-MED`, BATCH = `${NS}-BATCH`;
  const ids = [];
  const mkCust = async (suffix, courses) => { const id = `${NS}-${suffix}`; ids.push(id); await data.collection('be_customers').doc(id).set({ customerId: id, patientData: { firstName: NS, lastName: suffix, hn: id }, courses, createdAt: new Date().toISOString() }); return id; };
  const resetBatch = async (remaining = 50) => await data.collection('be_stock_batches').doc(BATCH).set({ batchId: BATCH, productId: MED, productName: 'Talafil 10 mg', branchId: BR, locationId: BR, locationType: 'branch', status: BATCH_STATUS.ACTIVE, qty: { total: 50, remaining }, receivedAt: new Date().toISOString() });
  const medItem = { id: `med-${MED}`, name: 'Talafil 10 mg', qty: 1, unit: 'กล่อง', productId: MED };
  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID}\n`);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'TFPMatrix', isDefault: false });
    await data.collection('be_products').doc(MED).set({ productId: MED, productName: 'Talafil 10 mg', productType: 'ยา', branchId: BR, stockConfig: { trackStock: true, minAlert: 0, unit: 'กล่อง' }, status: 'ใช้งาน', createdAt: new Date().toISOString() });
    await resetBatch(50);

    // ═════ GROUP 1 — single-save create (every course type) ═════
    console.log('═══ GROUP 1 — single-save create (saveMode=staff, !isEdit) ═══');

    // P1 — standard existing course + meds → 5/5→4/5 + stock + audit
    console.log('P1 create staff: ตัดคอร์สมาตรฐาน 5/5 + ยา');
    const c1 = await mkCust('P1', [docCourse('PhysioA', 'PhysioA', 5, 5, 'ระบุสินค้าและจำนวนสินค้า', 'PHYSA', BR)]);
    const t1 = `${NS}-T1`;
    await applyTfpSave({ customerId: c1, treatmentId: t1, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: [grp(0, 'PHYSA', 'PhysioA', 5, 5)], treatmentItems: [{ id: 'be-row-0', name: 'PhysioA', qty: 1, productId: 'PHYSA' }], stockMeds: [medItem] });
    check('P1.1 course 5/5 → 4/5', (await cQty(adb, c1, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, c1, 0)}`);
    check('P1.2 stock 50 → 49', (await bRem(adb, BATCH)) === 49, `got ${await bRem(adb, BATCH)}`);
    { const cc = await ccFor(adb, t1); check('P1.3 audit kind=use ×1, 5/5→4/5', cc.length === 1 && cc[0].kind === 'use' && String(cc[0].qtyBefore).startsWith('5') && String(cc[0].qtyAfter).startsWith('4'), `got ${cc.length} ${JSON.stringify(cc.map(x => [x.kind, x.qtyBefore, x.qtyAfter]))}`); }

    // P2 — buy-this-visit course → assign + deduct → 0/1
    console.log('P2 create staff: ซื้อคอร์สแล้วตัดเลย 1/1 → 0/1');
    const c2 = await mkCust('P2', []);
    const t2 = `${NS}-T2`;
    const buy2 = buildPurchasedCourseEntry({ id: '70001', name: 'Testo 1 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า', products: [{ id: '70001', name: 'Testo', qty: 1, unit: 'ครั้ง' }] });
    await applyTfpSave({ customerId: c2, treatmentId: t2, branchId: BR, hasSale: true, selectedCourseItems: new Set([buy2.products[0].rowId]), customerCourses: [buy2], treatmentItems: [{ id: buy2.products[0].rowId, name: 'Testo', qty: 1, productId: '70001' }], buyAssignSpecs: [{ name: 'Testo 1 ครั้ง', products: [{ name: 'Testo', qty: 1, unit: 'ครั้ง' }], price: 1500, source: 'treatment', linkedTreatmentId: t2, courseType: 'ระบุสินค้าและจำนวนสินค้า' }] });
    check('P2.1 ★ buy+deduct 1/1 → 0/1', (await cQty(adb, c2, 0)) === '0 / 1 ครั้ง', `got ${await cQty(adb, c2, 0)}`);
    { const cc = await ccFor(adb, t2); check('P2.2 audit kind=use ×1', cc.filter(x => x.kind === 'use').length === 1, `got ${cc.length}`); }

    // P3 — buffet course → qty UNCHANGED
    console.log('P3 create staff: คอร์สบุฟเฟต์ → ไม่ลดจำนวน (3/10 คงเดิม)');
    const c3 = await mkCust('P3', [docCourse('BuffetX', 'BuffetX', 3, 10, 'บุฟเฟต์', 'BUFX', BR)]);
    const t3 = `${NS}-T3`;
    await applyTfpSave({ customerId: c3, treatmentId: t3, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: [grp(0, 'BUFX', 'BuffetX', 3, 10, 'ครั้ง', { isBuffet: true })], treatmentItems: [{ id: 'be-row-0', name: 'BuffetX', qty: 1, productId: 'BUFX' }] });
    check('P3.1 ★ buffet qty UNCHANGED 3/10', (await cQty(adb, c3, 0)) === '3 / 10 ครั้ง', `got ${await cQty(adb, c3, 0)}`);

    // P4 — fill-later → consumed to 0/total
    console.log('P4 create staff: คอร์สเหมาตามจริง → ตัดหมดเป็น 0/1');
    const c4 = await mkCust('P4', [docCourse('FillY', 'FillY', 1, 1, 'เหมาตามจริง', 'FILY', BR)]);
    const t4 = `${NS}-T4`;
    await applyTfpSave({ customerId: c4, treatmentId: t4, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: [grp(0, 'FILY', 'FillY', 1, 1, 'ครั้ง', { fillLater: true })], treatmentItems: [{ id: 'be-row-0', name: 'FillY', qty: 100, productId: 'FILY' }] });
    check('P4.1 ★ fill-later consumed 1/1 → 0/1', (await cQty(adb, c4, 0)) === '0 / 1 ครั้ง', `got ${await cQty(adb, c4, 0)}`);

    // P5 — meds only → stock deduct, no course audit
    console.log('P5 create staff: ยากลับบ้านอย่างเดียว (ไม่มีคอร์ส) → ตัดสต็อก');
    const c5 = await mkCust('P5', []);
    const t5 = `${NS}-T5`;
    const before5 = await bRem(adb, BATCH);
    await applyTfpSave({ customerId: c5, treatmentId: t5, branchId: BR, selectedCourseItems: new Set(), customerCourses: [], treatmentItems: [], stockMeds: [{ ...medItem, qty: 2 }] });
    check('P5.1 ★ stock −2 (ยา 2 กล่อง)', (await bRem(adb, BATCH)) === before5 - 2, `got ${await bRem(adb, BATCH)} (was ${before5})`);
    check('P5.2 no course audit', (await ccFor(adb, t5)).length === 0);

    // ═════ GROUP 2 — step-skip multistage ═════
    console.log('\n═══ GROUP 2 — step-skip multistage ═══');

    // P6 — vitals(neutral) → finalize: deduct ONCE
    console.log('P6 vitals(neutral,ไม่ตัด) → finalize: ตัด 1 ครั้งเดียว 5/5→4/5');
    const c6 = await mkCust('P6', [docCourse('PhysioB', 'PhysioB', 5, 5, 'ระบุสินค้าและจำนวนสินค้า', 'PHYB', BR)]);
    const t6 = `${NS}-T6`;
    const cc6 = [grp(0, 'PHYB', 'PhysioB', 5, 5)]; const ti6 = [{ id: 'be-row-0', name: 'PhysioB', qty: 1, productId: 'PHYB' }];
    const v6 = await applyTfpSave({ saveMode: 'vitals', customerId: c6, treatmentId: t6, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc6, treatmentItems: ti6 });
    check('P6.0 after vitals: course UNCHANGED 5/5', (await cQty(adb, c6, 0)) === '5 / 5 ครั้ง', `got ${await cQty(adb, c6, 0)}`);
    check('P6.0b ★ vitals course-NEUTRAL: courseItems NOT written + flag false', v6.courseItems.length === 0 && v6.courseDeducted === false, `items=${v6.courseItems.length} flag=${v6.courseDeducted}`);
    await applyTfpSave({ saveMode: 'staff', isEdit: true, loadedCourseDeducted: v6.courseDeducted, customerId: c6, treatmentId: t6, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc6, treatmentItems: ti6, savedCourseItems: v6.courseItems });
    check('P6.1 ★ finalize after vitals: 5/5 → 4/5 (ตัด 1, ไม่ over-credit)', (await cQty(adb, c6, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, c6, 0)}`);

    // P7 — doctor(neutral) → finalize
    console.log('P7 doctor(neutral) → finalize: 5/5→4/5');
    const c7 = await mkCust('P7', [docCourse('PhysioC', 'PhysioC', 5, 5, 'ระบุสินค้าและจำนวนสินค้า', 'PHYC', BR)]);
    const t7 = `${NS}-T7`;
    const cc7 = [grp(0, 'PHYC', 'PhysioC', 5, 5)]; const ti7 = [{ id: 'be-row-0', name: 'PhysioC', qty: 1, productId: 'PHYC' }];
    const d7 = await applyTfpSave({ saveMode: 'doctor', customerId: c7, treatmentId: t7, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc7, treatmentItems: ti7 });
    check('P7.0 after doctor: course UNCHANGED 5/5 + flag false', (await cQty(adb, c7, 0)) === '5 / 5 ครั้ง' && d7.courseDeducted === false, `got ${await cQty(adb, c7, 0)}`);
    await applyTfpSave({ saveMode: 'staff', isEdit: true, loadedCourseDeducted: d7.courseDeducted, customerId: c7, treatmentId: t7, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc7, treatmentItems: ti7, savedCourseItems: d7.courseItems });
    check('P7.1 ★ finalize after doctor: 5/5 → 4/5 (ไม่ over-credit)', (await cQty(adb, c7, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, c7, 0)}`);

    // P8 — vitals → doctor → finalize: deduct ONCE
    console.log('P8 vitals → doctor → finalize: ตัด 1 ครั้งเดียว 5/5→4/5');
    const c8 = await mkCust('P8', [docCourse('PhysioD', 'PhysioD', 5, 5, 'ระบุสินค้าและจำนวนสินค้า', 'PHYD', BR)]);
    const t8 = `${NS}-T8`;
    const cc8 = [grp(0, 'PHYD', 'PhysioD', 5, 5)]; const ti8 = [{ id: 'be-row-0', name: 'PhysioD', qty: 1, productId: 'PHYD' }];
    const v8 = await applyTfpSave({ saveMode: 'vitals', customerId: c8, treatmentId: t8, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc8, treatmentItems: ti8 });
    const d8 = await applyTfpSave({ saveMode: 'doctor', isEdit: true, loadedCourseDeducted: v8.courseDeducted, customerId: c8, treatmentId: t8, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc8, treatmentItems: ti8, savedCourseItems: v8.courseItems });
    check('P8.0 after vitals+doctor: course UNCHANGED 5/5', (await cQty(adb, c8, 0)) === '5 / 5 ครั้ง', `got ${await cQty(adb, c8, 0)}`);
    const f8 = await applyTfpSave({ saveMode: 'staff', isEdit: true, loadedCourseDeducted: d8.courseDeducted, customerId: c8, treatmentId: t8, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc8, treatmentItems: ti8, savedCourseItems: d8.courseItems });
    check('P8.1 ★ finalize after vitals+doctor: 5/5 → 4/5 (ตัดครั้งเดียว)', (await cQty(adb, c8, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, c8, 0)}`);

    // P9 — …→ finalize → edit-refinalize (completed re-save)
    console.log('P9 …→ finalize → edit-refinalize (ใบเสร็จแล้ว): คงที่ 4/5 (V142)');
    await applyTfpSave({ saveMode: 'staff', isEdit: true, loadedCourseDeducted: f8.courseDeducted, customerId: c8, treatmentId: t8, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc8, treatmentItems: ti8, savedCourseItems: f8.courseItems, hasStockChanged: false });
    check('P9.1 ★ completed re-save: STILL 4/5 (reverse + re-deduct, no revert/double)', (await cQty(adb, c8, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, c8, 0)}`);

    // ═════ GROUP 3 — edit-resave (V142) ═════
    console.log('\n═══ GROUP 3 — edit-resave (V142) ═══');

    // P10 — image-only edit (no stock change): course holds, stock NOT reversed
    console.log('P10 finalize(0/1) → edit รูปอย่างเดียว: คอร์สคงที่ 0/1, สต็อกไม่คืน');
    const c10 = await mkCust('P10', [docCourse('Testo', 'Testo', 0, 1, 'ระบุสินค้าและจำนวนสินค้า', '70001', BR)]);
    const t10 = `${NS}-T10`;
    const stockBeforeP10 = await bRem(adb, BATCH);
    await applyTfpSave({ saveMode: 'staff', isEdit: true, loadedCourseDeducted: true, customerId: c10, treatmentId: t10, branchId: BR, selectedCourseItems: new Set(['purchased-70001-row-self']), customerCourses: [], treatmentItems: [{ id: 'purchased-70001-row-self', name: 'Testo', qty: 1 }], savedCourseItems: [{ courseName: 'Testo 1 ครั้ง', productName: 'Testo', rowId: 'purchased-70001-row-self', courseIndex: 0, deductQty: 1, unit: 'ครั้ง' }], hasStockChanged: false });
    check('P10.1 ★ image-only edit: course STILL 0/1 (V142 carry-forward holds)', (await cQty(adb, c10, 0)) === '0 / 1 ครั้ง', `got ${await cQty(adb, c10, 0)}`);
    check('P10.2 ★ stock NOT reversed (hasStockChange=false)', (await bRem(adb, BATCH)) === stockBeforeP10, `got ${await bRem(adb, BATCH)} (was ${stockBeforeP10})`);

    // P11 — edit UN-CHECK → REFUND
    console.log('P11 finalize(4/5) → edit UN-CHECK คอร์ส → คืนเป็น 5/5');
    const c11 = await mkCust('P11', [docCourse('PhysioE', 'PhysioE', 4, 5, 'ระบุสินค้าและจำนวนสินค้า', 'PHYE', BR)]);
    const t11 = `${NS}-T11`;
    await applyTfpSave({ saveMode: 'staff', isEdit: true, loadedCourseDeducted: true, customerId: c11, treatmentId: t11, branchId: BR, selectedCourseItems: new Set(), customerCourses: [grp(0, 'PHYE', 'PhysioE', 4, 5)], treatmentItems: [], savedCourseItems: [{ courseName: 'PhysioE 5 ครั้ง', productName: 'PhysioE', rowId: 'be-row-0', courseIndex: 0, deductQty: 1, unit: 'ครั้ง' }], hasStockChanged: true });
    check('P11.1 ★ un-check course: 4/5 → 5/5 (refund, no re-deduct)', (await cQty(adb, c11, 0)) === '5 / 5 ครั้ง', `got ${await cQty(adb, c11, 0)}`);

    // P12 — create → edit stock-change
    console.log('P12 finalize(ยา1) → edit เปลี่ยนยาเป็น 3 → คืน1+ตัด3 net สต็อก −3');
    await resetBatch(50);
    const c12 = await mkCust('P12', []);
    const t12 = `${NS}-T12`;
    const cr12 = await applyTfpSave({ customerId: c12, treatmentId: t12, branchId: BR, selectedCourseItems: new Set(), customerCourses: [], treatmentItems: [], stockMeds: [{ ...medItem, qty: 1 }] });
    check('P12.0 create: stock 50 → 49', (await bRem(adb, BATCH)) === 49, `got ${await bRem(adb, BATCH)}`);
    await applyTfpSave({ saveMode: 'staff', isEdit: true, loadedCourseDeducted: cr12.courseDeducted, customerId: c12, treatmentId: t12, branchId: BR, selectedCourseItems: new Set(), customerCourses: [], treatmentItems: [], stockMeds: [{ ...medItem, qty: 3 }], hasStockChanged: true });
    check('P12.1 ★ edit qty 1→3: stock reverse(+1)+re-deduct(−3) → 47 (net −3)', (await bRem(adb, BATCH)) === 47, `got ${await bRem(adb, BATCH)}`);

    // ═════ GROUP 4 — adversarial / wild ═════
    console.log('\n═══ GROUP 4 — adversarial / wild ═══');

    // P13 — duplicate course, use 1 → only newest deducts
    console.log('P13 คอร์สซ้ำ 2 ใบ ใช้ 1 → ตัดใบใหม่สุดเท่านั้น');
    const c13 = await mkCust('P13', [docCourse('ShockW', 'ShockW', 5, 5, 'ระบุสินค้าและจำนวนสินค้า', 'SHKW', BR), docCourse('ShockW', 'ShockW', 5, 5, 'ระบุสินค้าและจำนวนสินค้า', 'SHKW', BR)]);
    const t13 = `${NS}-T13`;
    const buy13 = buildPurchasedCourseEntry({ id: 'SHKW', name: 'ShockW 5 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า', products: [{ id: 'SHKW', name: 'ShockW', qty: 1, unit: 'ครั้ง' }] });
    await applyTfpSave({ customerId: c13, treatmentId: t13, branchId: BR, hasSale: true, selectedCourseItems: new Set([buy13.products[0].rowId]), customerCourses: [buy13], treatmentItems: [{ id: buy13.products[0].rowId, name: 'ShockW', qty: 1, productId: 'SHKW' }], buyAssignSpecs: [] });
    { const c = (await data.collection('be_customers').doc(c13).get()).data().courses; const total = c.reduce((s, x) => { const m = String(x.qty).match(/^([\d.]+)\s*\//); return s + (m ? parseFloat(m[1]) : 0); }, 0); check('P13.1 ★ exactly 1 deducted across dup (total remaining 9)', total === 9, `got total=${total} ${JSON.stringify(c.map(x => x.qty))}`); }

    // P14 — multi-edit churn ×3 → no drift
    console.log('P14 finalize → edit → edit → edit (3 รอบ): คงที่ 4/5 ไม่ drift');
    const c14 = await mkCust('P14', [docCourse('PhysioF', 'PhysioF', 4, 5, 'ระบุสินค้าและจำนวนสินค้า', 'PHYF', BR)]);
    const t14 = `${NS}-T14`;
    const cc14 = [grp(0, 'PHYF', 'PhysioF', 4, 5)];
    let saved14 = [{ courseName: 'PhysioF 5 ครั้ง', productName: 'PhysioF', rowId: 'be-row-0', courseIndex: 0, deductQty: 1, unit: 'ครั้ง' }]; let flag14 = true;
    for (let r = 0; r < 3; r++) { const s = await applyTfpSave({ saveMode: 'staff', isEdit: true, loadedCourseDeducted: flag14, customerId: c14, treatmentId: t14, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc14, treatmentItems: [{ id: 'be-row-0', name: 'PhysioF', qty: 1, productId: 'PHYF' }], savedCourseItems: saved14, hasStockChanged: false }); saved14 = s.courseItems; flag14 = s.courseDeducted; }
    check('P14.1 ★ 3× edit-resave: STILL 4/5 (no drift)', (await cQty(adb, c14, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, c14, 0)}`);

    // P15 — shortfall: atomic throw
    console.log('P15 คอร์สหมด 0/5 → finalize ตัด → throw "คอร์สคงเหลือไม่พอ" (atomic)');
    const c15 = await mkCust('P15', [docCourse('PhysioG', 'PhysioG', 0, 5, 'ระบุสินค้าและจำนวนสินค้า', 'PHYG', BR)]);
    const t15 = `${NS}-T15`;
    let threw = false;
    try { await applyTfpSave({ customerId: c15, treatmentId: t15, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: [grp(0, 'PHYG', 'PhysioG', 0, 5)], treatmentItems: [{ id: 'be-row-0', name: 'PhysioG', qty: 1, productId: 'PHYG' }] }); }
    catch (e) { threw = /คอร์สคงเหลือไม่พอ/.test(e.message); }
    check('P15.1 ★ shortfall throws "คอร์สคงเหลือไม่พอ"', threw);
    check('P15.2 ★ balance unchanged 0/5 (atomic)', (await cQty(adb, c15, 0)) === '0 / 5 ครั้ง', `got ${await cQty(adb, c15, 0)}`);

    // ═════ GROUP 5 — go-backward (V142-quinquies) — the double-deduct fix ═════
    console.log('\n═══ GROUP 5 — go-backward step-swap (V142-quinquies double-deduct fix) ═══');

    // P16 — finalize → DOCTOR-save → finalize: STAYS 4/5 (was 3/5 double-deduct)
    console.log('P16 finalize(5/5→4/5) → บันทึกสำหรับแพทย์ → finalize → ต้องคงที่ 4/5 (NOT 3/5)');
    const c16 = await mkCust('P16', [docCourse('PhysioH', 'PhysioH', 5, 5, 'ระบุสินค้าและจำนวนสินค้า', 'PHYH', BR)]);
    const t16 = `${NS}-T16`;
    const cc16 = [grp(0, 'PHYH', 'PhysioH', 5, 5)]; const ti16 = [{ id: 'be-row-0', name: 'PhysioH', qty: 1, productId: 'PHYH' }];
    const f16a = await applyTfpSave({ customerId: c16, treatmentId: t16, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc16, treatmentItems: ti16 });
    check('P16.0 finalize#1: 5/5 → 4/5 + flag true', (await cQty(adb, c16, 0)) === '4 / 5 ครั้ง' && f16a.courseDeducted === true, `got ${await cQty(adb, c16, 0)}`);
    const f16b = await applyTfpSave({ saveMode: 'doctor', isEdit: true, loadedCourseDeducted: f16a.courseDeducted, customerId: c16, treatmentId: t16, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc16, treatmentItems: ti16, savedCourseItems: f16a.courseItems });
    check('P16.0b doctor-save: course UNCHANGED 4/5 + flag PRESERVED true (neutral)', (await cQty(adb, c16, 0)) === '4 / 5 ครั้ง' && f16b.courseDeducted === true, `got ${await cQty(adb, c16, 0)} flag=${f16b.courseDeducted}`);
    await applyTfpSave({ saveMode: 'staff', isEdit: true, loadedCourseDeducted: f16b.courseDeducted, customerId: c16, treatmentId: t16, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc16, treatmentItems: ti16, savedCourseItems: f16b.courseItems, hasStockChanged: false });
    check('P16.1 ★★★ finalize→DOCTOR→finalize STAYS 4/5 (NOT 3/5 double-deduct)', (await cQty(adb, c16, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, c16, 0)}  ← 3/5 = REGRESSION`);

    // P17 — finalize → VITALS-save → finalize: STAYS 4/5
    console.log('P17 finalize → บันทึกข้อมูลซักประวัติ → finalize → ต้องคงที่ 4/5');
    const c17 = await mkCust('P17', [docCourse('PhysioI', 'PhysioI', 5, 5, 'ระบุสินค้าและจำนวนสินค้า', 'PHYI', BR)]);
    const t17 = `${NS}-T17`;
    const cc17 = [grp(0, 'PHYI', 'PhysioI', 5, 5)]; const ti17 = [{ id: 'be-row-0', name: 'PhysioI', qty: 1, productId: 'PHYI' }];
    const f17a = await applyTfpSave({ customerId: c17, treatmentId: t17, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc17, treatmentItems: ti17 });
    const f17b = await applyTfpSave({ saveMode: 'vitals', isEdit: true, loadedCourseDeducted: f17a.courseDeducted, customerId: c17, treatmentId: t17, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc17, treatmentItems: ti17, savedCourseItems: f17a.courseItems });
    await applyTfpSave({ saveMode: 'staff', isEdit: true, loadedCourseDeducted: f17b.courseDeducted, customerId: c17, treatmentId: t17, branchId: BR, selectedCourseItems: new Set(['be-row-0']), customerCourses: cc17, treatmentItems: ti17, savedCourseItems: f17b.courseItems, hasStockChanged: false });
    check('P17.1 ★★★ finalize→VITALS→finalize STAYS 4/5 (NOT 3/5)', (await cQty(adb, c17, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, c17, 0)}`);

    console.log('\n  ═══ สรุปจำนวนคงเหลือทุก flow ═══');
    console.log(`     P1 ${await cQty(adb, c1, 0)} · P2 ${await cQty(adb, c2, 0)} · P3 ${await cQty(adb, c3, 0)} · P4 ${await cQty(adb, c4, 0)}`);
    console.log(`     P6 ${await cQty(adb, c6, 0)} · P7 ${await cQty(adb, c7, 0)} · P8/9 ${await cQty(adb, c8, 0)} · P11 ${await cQty(adb, c11, 0)} · P14 ${await cQty(adb, c14, 0)}`);
    console.log(`     P16 ${await cQty(adb, c16, 0)} · P17 ${await cQty(adb, c17, 0)}  (go-backward: ต้อง 4/5, ไม่ใช่ 3/5)`);
  } finally {
    console.log('\ncleanup...');
    try {
      for (const id of ids) await data.collection('be_customers').doc(id).delete().catch(() => {});
      for (const [c, id] of [['be_branches', BR], ['be_products', MED], ['be_stock_batches', BATCH]]) await data.collection(c).doc(id).delete().catch(() => {});
      for (const c of ['be_stock_movements', 'be_course_changes', 'be_sales']) {
        const snap = await data.collection(c).get();
        for (const d of snap.docs) { const v = d.data(); if ([v.customerId, v.linkedTreatmentId, v.saleId, v.linkedSaleId, d.id].some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {}); }
      }
      let orphans = 0;
      for (const id of ids) if ((await data.collection('be_customers').doc(id).get()).exists) orphans++;
      for (const [c, id] of [['be_products', MED], ['be_stock_batches', BATCH], ['be_branches', BR]]) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ TFP full-flow matrix: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
