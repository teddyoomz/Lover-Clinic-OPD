#!/usr/bin/env node
// READ-ONLY recon (Rule R) for the two deferred data ops:
//   (1) Neuramis MERGE — KEEP 38764  ←  DUP PRODUCTS_1778150429849_9B1DEFF7
//   (2) junk test-course "หฟแฟ" delete
// Prints branch sameness + every FK reference so the merge/delete can be
// designed safely (Rule O: movements/sales/treatments are audit-immutable).
// NO writes.  node scripts/diag-neuramis-junkcourse-recon.mjs
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { courseProductList } from '../src/lib/productDeleteCascade.js';

function loadDotEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue;
    let [, k, v] = m; if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));
if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) loadDotEnv(path.resolve(process.cwd(), '.env.local'));
const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  return getFirestore(initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) }));
}
const C = (db, name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);

const KEEP = '38764';
const DUP = 'PRODUCTS_1778150429849_9B1DEFF7';
const jstr = (o) => { try { return JSON.stringify(o); } catch { return ''; } };

async function main() {
  const db = getAdmin();
  const [prod, course, batch, mov, sales, treat, cust, promo, adj, ord, trans, wd, cord] = await Promise.all([
    C(db, 'be_products').get(), C(db, 'be_courses').get(), C(db, 'be_stock_batches').get(),
    C(db, 'be_stock_movements').get(), C(db, 'be_sales').get(), C(db, 'be_treatments').get(),
    C(db, 'be_customers').get(), C(db, 'be_promotions').get(), C(db, 'be_stock_adjustments').get(),
    C(db, 'be_stock_orders').get(), C(db, 'be_stock_transfers').get(), C(db, 'be_stock_withdrawals').get(),
    C(db, 'be_central_stock_orders').get(),
  ]);
  const products = prod.docs.map(d => ({ id: d.id, ...d.data() }));
  const courses = course.docs.map(d => ({ id: d.id, ...d.data() }));
  const batches = batch.docs.map(d => ({ id: d.id, ...d.data() }));
  const movements = mov.docs.map(d => ({ id: d.id, ...d.data() }));
  const allSales = sales.docs.map(d => ({ id: d.id, ...d.data() }));
  const treatments = treat.docs.map(d => ({ id: d.id, ...d.data() }));
  const customers = cust.docs.map(d => ({ id: d.id, ...d.data() }));
  const promotions = promo.docs.map(d => ({ id: d.id, ...d.data() }));
  const adjustments = adj.docs.map(d => ({ id: d.id, ...d.data() }));
  const ops = [ord, trans, wd, cord].flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
  console.log(`Loaded: products=${products.length} courses=${courses.length} batches=${batches.length} movements=${movements.length} sales=${allSales.length} treatments=${treatments.length} customers=${customers.length}`);

  console.log('\n═══ (1) NEURAMIS MERGE RECON ═══');
  const keepP = products.find(x => x.id === KEEP) || products.find(x => String(x.productId) === KEEP);
  const dupP = products.find(x => x.id === DUP) || products.find(x => String(x.productId) === DUP);
  for (const [label, p, pid] of [['KEEP', keepP, KEEP], ['DUP ', dupP, DUP]]) {
    if (!p) { console.log(`${label} ${pid}: NOT FOUND`); continue; }
    console.log(`${label} ${pid}: name="${p.productName || p.name || '?'}" branchId=${p.branchId} status=${p.status || '-'} cat=${p.categoryName || '-'} unit=${p.mainUnitName || p.unit || '-'} trackStock=${p.stockConfig?.trackStock} skipStockDeduction=${p.skipStockDeduction}`);
  }
  console.log(`SAME-BRANCH? ${keepP && dupP && keepP.branchId === dupP.branchId}  (keep=${keepP?.branchId} dup=${dupP?.branchId})`);

  const courseMainDup = courses.filter(c => String(c.mainProductId) === DUP);
  const courseSubDup = courses.filter(c => courseProductList(c).some(p => String(p.productId) === DUP));
  const batchesDup = batches.filter(b => String(b.productId) === DUP);
  const movDup = movements.filter(m => String(m.productId) === DUP);
  const salesDup = allSales.filter(s => jstr(s).includes(DUP));
  const treatDup = treatments.filter(t => jstr(t).includes(DUP));
  const adjDup = adjustments.filter(a => jstr(a).includes(DUP));
  const opsDup = ops.filter(o => jstr(o).includes(DUP));
  console.log(`\nDUP ${DUP} is referenced by:`);
  console.log(`  course mainProductId: ${courseMainDup.length} → ${courseMainDup.map(c => `${c.id}"${c.courseName}"`).join(', ') || '(none)'}`);
  console.log(`  course courseProducts[]: ${courseSubDup.length} → ${courseSubDup.map(c => `${c.id}"${c.courseName}"(br=${c.branchId})`).join(', ') || '(none)'}`);
  console.log(`  stock batches: ${batchesDup.length}`);
  for (const b of batchesDup) console.log(`     batch ${b.id} loc=${b.locationId || b.branchId} qty.remaining=${b.qty?.remaining} total=${b.qty?.total} status=${b.status} name="${b.productName}" expiresAt=${b.expiresAt ? 'set' : '-'}`);
  console.log(`  stock_movements (audit): ${movDup.length} (types: ${[...new Set(movDup.map(m => m.type))].join(',') || '-'})`);
  console.log(`  adjustments (audit): ${adjDup.length}`);
  console.log(`  sales (historical): ${salesDup.length} → ${salesDup.map(s => s.id).slice(0, 8).join(',') || '(none)'}`);
  console.log(`  treatments (historical): ${treatDup.length} → ${treatDup.map(t => t.id).slice(0, 8).join(',') || '(none)'}`);
  console.log(`  pending/any stock ops: ${opsDup.length} → ${opsDup.map(o => `${o.id}(st=${o.status})`).join(', ') || '(none)'}`);

  const courseMainKeep = courses.filter(c => String(c.mainProductId) === KEEP);
  const courseSubKeep = courses.filter(c => courseProductList(c).some(p => String(p.productId) === KEEP));
  const batchesKeep = batches.filter(b => String(b.productId) === KEEP);
  console.log(`\nKEEP ${KEEP} context: course-main=${courseMainKeep.length} course-sub=${courseSubKeep.length} batches=${batchesKeep.length}`);
  for (const b of batchesKeep) console.log(`     batch ${b.id} loc=${b.locationId || b.branchId} qty.remaining=${b.qty?.remaining} total=${b.qty?.total} status=${b.status}`);

  console.log('\n═══ (2) JUNK COURSE "หฟแฟ" RECON ═══');
  const junk = courses.filter(c => String(c.courseName || '').includes('หฟแฟ'));
  if (!junk.length) console.log('(no course with "หฟแฟ" in courseName found)');
  for (const j of junk) {
    const mainExists = products.some(p => p.id === String(j.mainProductId) || String(p.productId) === String(j.mainProductId));
    console.log(`course ${j.id}: name="${j.courseName}" branchId=${j.branchId} salePrice=${j.salePrice} mainProductId=${j.mainProductId} mainExists=${mainExists} courseProducts=${courseProductList(j).length}`);
    const custRef = customers.filter(c => (c.courses || []).some(cc => String(cc.courseId) === j.id || String(cc.name || '').includes('หฟแฟ')));
    const salesRef = allSales.filter(s => jstr(s).includes(j.id) || jstr(s).includes('หฟแฟ'));
    const promoRef = promotions.filter(p => jstr(p).includes(j.id) || (courseProductList(p)).some(x => String(x.courseId) === j.id));
    const treatRef = treatments.filter(t => jstr(t).includes(j.id) || jstr(t).includes('หฟแฟ'));
    console.log(`  customers.courses ref: ${custRef.length} → ${custRef.map(c => `${c.id}(${c.patientData?.firstName || c.firstname || '?'})`).slice(0, 10).join(', ') || '(none)'}`);
    console.log(`  sales ref: ${salesRef.length} → ${salesRef.map(s => s.id).slice(0, 8).join(',') || '(none)'}`);
    console.log(`  treatments ref: ${treatRef.length}`);
    console.log(`  promotions ref: ${promoRef.length} → ${promoRef.map(p => p.id).join(',') || '(none)'}`);
  }
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
