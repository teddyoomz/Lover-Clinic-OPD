#!/usr/bin/env node
// ─── V142-bis TRUE-L2 e2e — SINGLE-SAVE: buy course + deduct + charge + meds ───
//
// User (verbatim): "ทดสอบแบบซื้อคอร์สใน TFP ที่เพิ่งสร้างแล้วตัดคอร์สเลย คิดเงิน
// เอายากลับบ้าน ภายในการกดบันทึกครั้งเดียวด้วย ... ให้เทสในกรณีที่กูบอกแบบเหมือน
// จริงที่สุด แล้วดูจำนวนที่เหลือของทุกอย่างด้วย".
//
// Rule Q V66 — TRUE L2: drives the EXACT create-mode handleSubmit sequence using
// the SHIPPED client functions (createBackendSale / deductStockForSale /
// assignCourseToCustomer / deductCourseItems) + the SHIPPED, EXTRACTED course
// serialization (buildCourseItemsForSave — the real Pass-1/Pass-2 logic that
// decides what gets deducted) against REAL prod Firestore. Mirrors the screenshot
// scenario: buy "Testoviron 1 ครั้ง" + use it + charge a bill + take home
// "Talafil 10 mg" — all in one save — then prints EVERY remaining quantity.
//
// Compliance: Rule R (env-pull) + Rule M (TEST- fixtures only, cleanup, zero-orphan).
//
// Run: node scripts/e2e-v142bis-single-save-buy-deduct-charge-meds.mjs

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
  createBackendSale, deductStockForSale, assignCourseToCustomer, deductCourseItems, getBackendSale,
} from '../src/lib/backendClient.js';
import { buildCourseItemsForSave, buildPurchasedCourseEntry, isPurchasedSessionRowId } from '../src/lib/treatmentBuyHelpers.js';
import { BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-V142BIS-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
const courseQty = async (db, cid, i) => ((await base(db).collection('be_customers').doc(cid).get()).data().courses[i].qty);
const batchRem = async (db, bid) => ((await base(db).collection('be_stock_batches').doc(bid).get()).data()?.qty?.remaining);

async function main() {
  const adb = initAdmin(); const data = base(adb);
  const BR = `${NS}-BR`, CUST = `${NS}-CUST`, TID = `${NS}-T`;
  const P_MED = `${NS}-P-TALAFIL`, BATCH_MED = `${NS}-BATCH-TALAFIL`;
  let createdSaleId = null;
  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in as ${STAFF_UID} (admin) — SINGLE-SAVE: buy course + ตัด + คิดเงิน + เอายากลับบ้าน\n`);

    // ── Fixtures: branch + customer (NO courses) + take-home med w/ stock 10 ──
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'V142bis', isDefault: false });
    await data.collection('be_customers').doc(CUST).set({ customerId: CUST, patientData: { firstName: NS, lastName: 'OneSave', hn: CUST }, courses: [], createdAt: new Date().toISOString() });
    await data.collection('be_products').doc(P_MED).set({ productId: P_MED, productName: 'Talafil 10 mg', productType: 'ยา', branchId: BR, stockConfig: { trackStock: true, minAlert: 0, unit: 'กล่อง' }, status: 'ใช้งาน', createdAt: new Date().toISOString() });
    await data.collection('be_stock_batches').doc(BATCH_MED).set({ batchId: BATCH_MED, productId: P_MED, productName: 'Talafil 10 mg', branchId: BR, locationId: BR, locationType: 'branch', status: BATCH_STATUS.ACTIVE, qty: { total: 10, remaining: 10 }, receivedAt: new Date().toISOString() });
    console.log('เริ่มต้น: คอร์สลูกค้า = 0 รายการ · สต็อก Talafil 10 mg = 10 กล่อง\n');

    // ════ ONE SAVE — the exact create-mode handleSubmit order ════
    // 1) คิดเงิน — createBackendSale (course line + take-home med line)
    const grouped = {
      promotions: [], products: [],
      courses: [{ name: 'Testoviron 1 ครั้ง', qty: 1, unitPrice: 1890, products: [{ name: 'Testoviron', qty: 1, unit: 'ครั้ง' }] }],
      medications: [{ name: 'Talafil 10 mg', productId: P_MED, qty: 1, unit: 'กล่อง', unitPrice: 250 }],
    };
    const billing = { subtotal: 2140, billDiscount: 0, membershipDiscount: 0, depositApplied: 0, walletApplied: 0, netTotal: 2140 };
    const saleRes = await createBackendSale({ customerId: CUST, customerName: NS, saleDate: '2026-05-31', items: grouped, billing, payment: { status: 'paid', channels: [{ method: 'เงินสด', amount: 2140, enabled: true }] }, source: 'treatment', linkedTreatmentId: TID, branchId: BR });
    createdSaleId = saleRes.saleId;
    check('1) คิดเงิน — สร้างใบขาย (INV)', !!createdSaleId);

    // 2) เอายากลับบ้าน — deductStockForSale (Talafil 1 กล่อง)
    await deductStockForSale(createdSaleId, grouped, { customerId: CUST, branchId: BR, user: { userId: '', userName: '' } });
    check('2) เอายากลับบ้าน — สต็อก Talafil 10 → 9', (await batchRem(adb, BATCH_MED)) === 9, `got ${await batchRem(adb, BATCH_MED)}`);

    // 3) ซื้อคอร์ส — assignCourseToCustomer (full "1 / 1 ครั้ง")
    await assignCourseToCustomer(CUST, { name: 'Testoviron 1 ครั้ง', products: [{ name: 'Testoviron', qty: 1, unit: 'ครั้ง' }], price: 1890, source: 'treatment', linkedSaleId: createdSaleId, linkedTreatmentId: TID, courseType: 'ระบุสินค้าและจำนวนสินค้า' });
    check('3) ซื้อคอร์ส — คอร์ส Testoviron = 1 / 1 ครั้ง (เต็ม)', (await courseQty(adb, CUST, 0)) === '1 / 1 ครั้ง', `got ${await courseQty(adb, CUST, 0)}`);

    // 4) ตัดคอร์สเลย — REAL serialization (buildCourseItemsForSave) → deductCourseItems
    const buyItem = { id: '38699', name: 'Testoviron 1 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า', products: [{ id: '38699', name: 'Testoviron', qty: 1, unit: 'ครั้ง' }] };
    const entry = buildPurchasedCourseEntry(buyItem);     // what confirmBuyModal appends to options.customerCourses
    const rowId = entry.products[0].rowId;
    const selectedCourseItems = new Set([rowId]);          // user marks it used
    const treatmentItems = [{ id: rowId, name: 'Testoviron', qty: 1, unit: 'ครั้ง', productId: '38699' }];
    const courseItems = buildCourseItemsForSave(selectedCourseItems, [entry], treatmentItems); // ← REAL Pass-1/Pass-2
    check('4a) serialization (buildCourseItemsForSave) → deduct list NOT empty', courseItems.length === 1, `got ${courseItems.length}`);
    const purchasedDeductions = courseItems.filter(ci => isPurchasedSessionRowId(ci.rowId));
    await deductCourseItems(CUST, purchasedDeductions, { treatmentId: TID, preferNewest: true, staffName: 'หมอมายด์' });
    check('4b) ★ ตัดคอร์ส — Testoviron 1 / 1 → 0 / 1 ครั้ง (ลดจริง)', (await courseQty(adb, CUST, 0)) === '0 / 1 ครั้ง', `got ${await courseQty(adb, CUST, 0)}`);

    // ── audit + sale totals ──
    const sale = await getBackendSale(createdSaleId);
    check('5) ใบขาย netTotal = 2,140 บาท (คอร์ส 1890 + ยา 250)', Number(sale?.billing?.netTotal) === 2140, `got ${sale?.billing?.netTotal}`);
    const cc = await data.collection('be_course_changes').where('customerId', '==', CUST).get();
    check('6) ประวัติการใช้คอร์ส — มี audit kind="use"', cc.docs.some(d => d.data().kind === 'use'));

    // ── จำนวนที่เหลือของทุกอย่าง (the user asked to SEE these) ──
    console.log('\n  ═══ จำนวนที่เหลือหลังกดบันทึกครั้งเดียว ═══');
    console.log(`     คอร์ส Testoviron        : ${await courseQty(adb, CUST, 0)}   (ตัดแล้ว ✓)`);
    console.log(`     สต็อก Talafil 10 mg     : ${await batchRem(adb, BATCH_MED)} / 10 กล่อง   (จ่ายออก 1 ✓)`);
    console.log(`     ใบขาย ${createdSaleId} netTotal : ${sale?.billing?.netTotal} บาท`);
    console.log(`     ประวัติใช้คอร์ส (kind=use): ${cc.docs.filter(d => d.data().kind === 'use').length} รายการ`);
  } finally {
    console.log('\ncleanup...');
    try {
      for (const id of [BR]) await data.collection('be_branches').doc(id).delete().catch(() => {});
      await data.collection('be_customers').doc(CUST).delete().catch(() => {});
      await data.collection('be_products').doc(P_MED).delete().catch(() => {});
      await data.collection('be_stock_batches').doc(BATCH_MED).delete().catch(() => {});
      if (createdSaleId) await data.collection('be_sales').doc(createdSaleId).delete().catch(() => {});
      for (const c of ['be_stock_movements', 'be_course_changes']) {
        const snap = await data.collection(c).get();
        for (const d of snap.docs) { const v = d.data(); if (String(v.customerId || '').startsWith(NS) || String(v.linkedTreatmentId || '').startsWith(NS) || String(v.saleId || '').startsWith(NS) || String(v.linkedSaleId || '').startsWith(NS) || String(d.id).startsWith(NS)) await d.ref.delete(); }
      }
      let orphans = 0;
      for (const [c, id] of [['be_customers', CUST], ['be_products', P_MED], ['be_stock_batches', BATCH_MED], ['be_branches', BR]]) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ V142-bis e2e: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
