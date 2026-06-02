// scripts/e2e-tfp-mega-test.mjs
// ─── THE TFP MEGA-TEST · Rule Q L2 (real CLIENT SDK against REAL prod) ──────────
//
// TFP (TreatmentFormPage) is the app's core. Its save chain has the longest bug
// history (V104 course-deduct shadow, V36 audit, V108 sale-name, V44/V45 buy-name,
// Rule O/V46 stock live-name, V142 carry-forward). Every prior test of these was
// L0 (mock) — code-shape only. This drives the REAL backend functions TFP calls,
// via the REAL Firebase CLIENT SDK authed as real staff, against REAL prod
// Firestore (real rules + real indexes + real data shapes). Admin SDK is used
// ONLY for fixture setup / read-back / cleanup. TEST- prefixed fixtures; full
// cleanup in finally. Adversarial: each scenario reproduces a historical bug's
// exact trigger condition and asserts the FIX holds on real prod.
//
//   node scripts/e2e-tfp-mega-test.mjs
//
// Needs .env.local.prod (FIREBASE_ADMIN_* for setup/cleanup). Client auth =
// loverclinic@loverclinic.com (real staff, satisfies isClinicStaff rules).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// localStorage shim so backendClient's resolveSelectedBranchId() never throws in node
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };

import { initializeApp as adminInit, getApps as adminApps, cert } from 'firebase-admin/app';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../src/firebase.js';
import * as BC from '../src/lib/backendClient.js';

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const mm = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!mm) continue;
      let v = mm[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(mm[1] in process.env)) process.env[mm[1]] = v;
    }
  } catch { /* optional */ }
}
loadEnvFile('.env.local.prod');

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const BR = 'TEST-BR-MEGA'; // test branch for stamping (keeps stock/sale data isolated)

function initAdmin() {
  if (adminApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  adminInit({ credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) });
}

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { c ? pass++ : (fail++, fails.push(m)); console.log(`${c ? 'PASS' : 'FAIL'} · ${m}`); };
const section = (t) => console.log(`\n── ${t} ──`);
const nq = (s) => String(s).replace(/\s+/g, ''); // qty format is "4 / 5 ครั้ง" (spaces) — normalize for compare

async function main() {
  initAdmin();
  const db = adminFs();
  const cref = (col, id) => db.doc(`${PREFIX}/${col}/${id}`);
  const cread = async (col, id) => { const s = await cref(col, id).get(); return s.exists ? s.data() : null; };

  // Real client auth (Rule Q L2 — exact rules + indexes the UI hits)
  const cred = await signInWithEmailAndPassword(auth, 'loverclinic@loverclinic.com', 'Lover2024');
  console.log(`client authed as ${cred.user.email} (uid ${cred.user.uid.slice(0, 8)}…)`);

  const ts = Date.now();
  const C1 = `TEST-${ts}-tfp1`;      // course-deduction customer
  const C2 = `TEST-${ts}-tfp2`;      // patientData-only customer (V108)
  const P = `TEST-PROD-${ts}-mega`;  // Rule O product
  const createdTreatments = [];
  const createdSales = [];

  try {
    // ── SETUP (admin SDK) ──────────────────────────────────────────────────
    section('SETUP (admin)');
    await cref('be_customers', C1).set({
      customerName: 'เทสต์ คอร์ส', hn_no: `TEST-HN-${ts}-1`, branchId: BR,
      patientData: { firstName: 'เทสต์', lastName: 'คอร์ส', firstNameTh: 'เทสต์', lastNameTh: 'คอร์ส' },
      courses: [
        { name: 'CourseX', product: 'ProductA', qty: '5/5 ครั้ง', courseType: '', status: 'กำลังใช้งาน', expiry: '' },
      ],
      createdAt: new Date().toISOString(),
    });
    await cref('be_customers', C2).set({
      // V108 trigger: top-level name EMPTY; only patientData carries the name
      customerName: '', firstname: '', lastname: '', hn_no: `TEST-HN-${ts}-2`, branchId: BR,
      patientData: { firstName: 'สมหญิงเทสต์', lastName: 'ใจดีเทสต์', firstNameTh: 'สมหญิงเทสต์', lastNameTh: 'ใจดีเทสต์' },
      courses: [], createdAt: new Date().toISOString(),
    });
    await cref('be_products', P).set({
      productId: P, productName: 'CorrectLiveName', name: 'CorrectLiveName',
      stockConfig: { trackStock: true, unit: 'ชิ้น' }, branchId: BR,
      createdAt: new Date().toISOString(),
    });
    ok(!!(await cread('be_customers', C1)), `fixture C1 created`);
    ok(!!(await cread('be_customers', C2)), `fixture C2 (patientData-only) created`);
    ok(!!(await cread('be_products', P)), `fixture product P created`);

    // ── S1 · V104 + V36 — existing course deduction + audit ─────────────────
    section('S1 · existing course deduct (V104) + audit (V36)');
    const t1 = await BC.createBackendTreatment(C1, {
      treatmentDate: new Date().toISOString().slice(0, 10), doctorId: '', assistants: [],
      treatmentItems: [], consumables: [], medications: [], courseItems: [], opd: {}, vitals: {},
      billing: {}, payment: {}, sellers: [], hasSale: false, branchId: BR,
    });
    createdTreatments.push(t1.treatmentId);
    ok(!!t1.treatmentId, `createBackendTreatment → ${t1.treatmentId}`);

    await BC.deductCourseItems(C1, [{ courseIndex: 0, courseName: 'CourseX', productName: 'ProductA', deductQty: 1 }],
      { treatmentId: t1.treatmentId, staffId: 'TEST-STAFF', staffName: 'Mega Tester' });
    const c1a = await cread('be_customers', C1);
    ok(nq(c1a.courses[0].qty) === nq('4/5 ครั้ง'), `V104: course decremented 5/5 → ${c1a.courses[0].qty} (expect 4/5)`);

    // V36: audit doc emitted — field is linkedTreatmentId (not treatmentId)
    const auditSnap = await db.collection(`${PREFIX}/be_course_changes`).where('linkedTreatmentId', '==', t1.treatmentId).get();
    ok(auditSnap.size >= 1, `V36: be_course_changes emitted for treatment (${auditSnap.size} entries)`);
    ok(auditSnap.docs.some(d => (d.data().kind || '') === 'use'), `V36: audit kind='use' present`);

    // S1 adversarial — over-deduct must THROW (no silent corruption)
    let threw = false;
    try {
      await BC.deductCourseItems(C1, [{ courseIndex: 0, courseName: 'CourseX', productName: 'ProductA', deductQty: 999 }], { treatmentId: t1.treatmentId });
    } catch { threw = true; }
    ok(threw, `adversarial: over-deduct (999) throws "คอร์สคงเหลือไม่พอ"`);
    const c1b = await cread('be_customers', C1);
    ok(nq(c1b.courses[0].qty) === nq('4/5 ครั้ง'), `adversarial: balance unchanged after throw (${c1b.courses[0].qty})`);

    // ── S5 · V142 — edit re-save carry-forward (no double-deduct, no stuck) ──
    section('S5 · edit carry-forward (V142)');
    await BC.reverseCourseDeduction(C1, [{ courseIndex: 0, courseName: 'CourseX', productName: 'ProductA', deductQty: 1 }],
      { treatmentId: t1.treatmentId });
    const c1r = await cread('be_customers', C1);
    ok(nq(c1r.courses[0].qty) === nq('5/5 ครั้ง'), `reverse restored 4/5 → ${c1r.courses[0].qty} (expect 5/5)`);
    await BC.deductCourseItems(C1, [{ courseIndex: 0, courseName: 'CourseX', productName: 'ProductA', deductQty: 1 }],
      { treatmentId: t1.treatmentId, staffId: 'TEST-STAFF', staffName: 'Mega Tester' });
    const c1c = await cread('be_customers', C1);
    ok(nq(c1c.courses[0].qty) === nq('4/5 ครั้ง'), `V142: net after reverse+re-deduct = ${c1c.courses[0].qty} (expect 4/5, NOT 3/5 double / 5/5 stuck)`);

    // ── S3 · V44/V45 — buy-this-visit assign + deduct the NEW entry ──────────
    section('S3 · buy-this-visit assign (V44/V45) + deduct (V104 purchased path)');
    await BC.assignCourseToCustomer(C1, {
      name: 'BuyCourseY', products: [{ id: 'prodB', name: 'RealProductB', qty: 3, unit: 'ครั้ง' }],
      price: 1000, source: 'treatment', linkedTreatmentId: t1.treatmentId, daysBeforeExpire: 30, courseType: '',
    });
    const c1d = await cread('be_customers', C1);
    const bought = c1d.courses.find(c => c.name === 'BuyCourseY');
    ok(!!bought, `assignCourseToCustomer pushed new entry`);
    ok(bought && bought.product === 'RealProductB',
      `V44: new entry product = "${bought?.product}" (expect "RealProductB", NOT course-name "BuyCourseY")`);
    // deduct the just-bought course via preferNewest (the V104 buy-this-visit path)
    await BC.deductCourseItems(C1, [{ courseName: 'BuyCourseY', productName: 'RealProductB', deductQty: 1 }],
      { treatmentId: t1.treatmentId, preferNewest: true, staffId: 'TEST-STAFF', staffName: 'Mega Tester' });
    const c1e = await cread('be_customers', C1);
    const boughtAfter = c1e.courses.find(c => c.name === 'BuyCourseY');
    ok(boughtAfter && nq(boughtAfter.qty) === nq('2/3 ครั้ง'),
      `V104 purchased path: bought course decremented 3/3 → ${boughtAfter?.qty} (expect 2/3)`);

    // ── S2 · V108 — auto-sale resolves customer name from patientData ────────
    section('S2 · auto-sale customer name (V108)');
    const sale = await BC.createBackendSale({
      customerId: C2, customerName: '', customerHN: '', saleDate: new Date().toISOString().slice(0, 10),
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { subtotal: 0, netTotal: 0, billDiscount: 0 }, payment: { status: 'unpaid', channels: [] },
      sellers: [], source: 'treatment', linkedTreatmentId: t1.treatmentId, branchId: BR,
    });
    createdSales.push(sale.saleId);
    const saleDoc = await cread('be_sales', sale.saleId);
    ok(!!saleDoc, `createBackendSale → ${sale.saleId}`);
    ok(saleDoc && saleDoc.customerName && saleDoc.customerName.trim() !== '' && saleDoc.customerName !== '-',
      `V108: sale.customerName = "${saleDoc?.customerName}" (resolved, NOT empty/"-")`);
    ok(saleDoc && saleDoc.customerName.includes('สมหญิง'),
      `V108: resolved from patientData ("${saleDoc?.customerName}" contains "สมหญิง")`);

    // ── S4 · Rule O / V46 — stock movement uses LIVE be_products name ────────
    section('S4 · stock live productName (Rule O / V46)');
    const t2 = await BC.createBackendTreatment(C1, {
      treatmentDate: new Date().toISOString().slice(0, 10), doctorId: '', assistants: [],
      treatmentItems: [{ productId: P, productName: 'WRONG-passed-name', qty: 1, unit: 'ชิ้น' }],
      consumables: [], medications: [], courseItems: [], opd: {}, vitals: {}, billing: {}, payment: {},
      sellers: [], hasSale: false, branchId: BR,
    });
    createdTreatments.push(t2.treatmentId);
    await BC.deductStockForTreatment(t2.treatmentId,
      { treatmentItems: [{ productId: P, productName: 'WRONG-passed-name', qty: 1, unit: 'ชิ้น' }], consumables: [] },
      { customerId: C1, branchId: BR, user: { uid: 'TEST-STAFF', name: 'Mega Tester' } });
    const movSnap = await db.collection(`${PREFIX}/be_stock_movements`).where('linkedTreatmentId', '==', t2.treatmentId).get();
    ok(movSnap.size >= 1, `Rule O: stock movement emitted (${movSnap.size})`);
    const mov = movSnap.docs.map(d => d.data()).find(m => String(m.productId) === P);
    ok(mov && mov.productName === 'CorrectLiveName',
      `Rule O: movement.productName = "${mov?.productName}" (LIVE from be_products, NOT passed "WRONG-passed-name")`);

    console.log(`\n=== TFP MEGA-TEST ${fail === 0 ? 'GREEN' : 'RED'} · ${pass} pass / ${fail} fail ===`);
    if (fail) console.log('FAILURES:\n - ' + fails.join('\n - '));
  } finally {
    // ── CLEANUP (admin SDK) ─────────────────────────────────────────────────
    section('CLEANUP');
    const del = async (col, id) => { try { await cref(col, id).delete(); } catch {} };
    await del('be_customers', C1); await del('be_customers', C2); await del('be_products', P);
    for (const tid of createdTreatments) await del('be_treatments', tid);
    for (const sid of createdSales) await del('be_sales', sid);
    // delete audit + movements + auto-neg batches created for the test treatments
    for (const tid of createdTreatments) {
      for (const colName of ['be_course_changes', 'be_stock_movements']) {
        const s = await db.collection(`${PREFIX}/${colName}`).where('linkedTreatmentId', '==', tid).get();
        for (const d of s.docs) await d.ref.delete().catch(() => {});
      }
      const cc = await db.collection(`${PREFIX}/be_course_changes`).where('treatmentId', '==', tid).get();
      for (const d of cc.docs) await d.ref.delete().catch(() => {});
    }
    // test-branch batches (AUTO-NEG created by stock deduct)
    const batches = await db.collection(`${PREFIX}/be_stock_batches`).where('branchId', '==', BR).get();
    for (const d of batches.docs) await d.ref.delete().catch(() => {});
    const movs = await db.collection(`${PREFIX}/be_stock_movements`).where('productId', '==', P).get();
    for (const d of movs.docs) await d.ref.delete().catch(() => {});
    console.log(`cleanup done (customers + product + ${createdTreatments.length} treatments + ${createdSales.length} sales + audit/movements/batches)`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('MEGA-TEST ERROR:', e); process.exit(1); });
}
