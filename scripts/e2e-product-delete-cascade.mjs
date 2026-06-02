#!/usr/bin/env node
// Rule Q L2 e2e — Guard+cascade product delete, MULTI-BRANCH + EVERY scenario,
// on REAL prod Firestore with TEST- fixtures (V33.x prefix discipline; cleaned
// up in finally → zero orphans). Admin SDK (no client creds wired) but drives
// the SHARED pure cascade logic (evaluateProductDeleteGuards + planProductCascade
// + batchDeleteAction — the SAME code the client runs) and applies the EXACT
// client write-shapes (delete==0 / cancel<0 / pull courseProducts[] / pull
// be_product_groups / delete product). History (movements/orders) asserted KEPT.
//
//   node scripts/e2e-product-delete-cascade.mjs

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { evaluateProductDeleteGuards, planProductCascade, batchDeleteAction } from '../src/lib/productDeleteCascade.js';

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
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  return getFirestore(initializeApp({ credential: cert({ projectId: APP_ID, clientEmail, privateKey: rawKey.split('\\n').join('\n') }) }));
}
const db = getAdmin();
const C = (name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
const TAG = `TEST-PDCASC-${Date.now()}-${randomBytes(3).toString('hex')}`;
const ids = [];                         // { col, id } — everything created, for cleanup
const created = (col, id) => { ids.push({ col, id }); return id; };

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) { pass++; } else { fail++; fails.push(msg); console.log(`  ✗ ${msg}`); } }

// ── fixture builders (all TEST-tagged) ──
async function mkProduct(branchId, name = 'CascadeTest') {
  const id = created('be_products', `${TAG}-P-${randomBytes(3).toString('hex')}`);
  await C('be_products').doc(id).set({ productId: id, productName: `${TAG} ${name}`, productType: 'ยา', categoryName: 'ยาทั่วไป', mainUnitName: 'ชิ้น', branchId, status: 'ใช้งาน' });
  return id;
}
async function mkBatch(productId, locationId, remaining) {
  const id = created('be_stock_batches', `${TAG}-B-${randomBytes(3).toString('hex')}`);
  await C('be_stock_batches').doc(id).set({ batchId: id, productId, productName: `${TAG} batch`, locationId, branchId: locationId, qty: { total: Math.max(remaining, 0), remaining }, status: 'active' });
  return id;
}
async function mkCourse(branchId, { main, sub } = {}) {
  const id = created('be_courses', `${TAG}-C-${randomBytes(3).toString('hex')}`);
  const doc = { courseId: id, courseName: `${TAG} course`, branchId, courseProducts: (sub || []).map(pid => ({ productId: pid, productName: 'x' })) };
  if (main) doc.mainProductId = main;
  await C('be_courses').doc(id).set(doc);
  return id;
}
async function mkGroup(branchId, productId) {
  const id = created('be_product_groups', `${TAG}-G-${randomBytes(3).toString('hex')}`);
  await C('be_product_groups').doc(id).set({ groupId: id, name: `${TAG} group`, branchId, productIds: [productId, 'OTHER-KEEP'], products: [{ productId, qty: 1 }, { productId: 'OTHER-KEEP', qty: 1 }] });
  return id;
}
async function mkMovement(productId, branchId) {
  const id = created('be_stock_movements', `${TAG}-M-${randomBytes(3).toString('hex')}`);
  await C('be_stock_movements').doc(id).set({ movementId: id, productId, productName: `${TAG} mov`, branchId, type: 1, qty: 1 });
  return id;
}
async function mkOrder(productId, branchId, status = 'received') {
  const id = created('be_stock_orders', `${TAG}-O-${randomBytes(3).toString('hex')}`);
  await C('be_stock_orders').doc(id).set({ orderId: id, branchId, status, items: [{ productId, productName: `${TAG} ord`, qty: 1 }] });
  return id;
}
// REAL transfer schema: NO branchId, sourceLocationId/destinationLocationId, NUMERIC status (0=pending,2=received)
async function mkTransfer(productId, srcLoc, dstLoc, status = 0) {
  const id = created('be_stock_transfers', `${TAG}-T-${randomBytes(3).toString('hex')}`);
  await C('be_stock_transfers').doc(id).set({ transferId: id, sourceLocationId: srcLoc, destinationLocationId: dstLoc, status, items: [{ productId, productName: `${TAG} xfer`, qty: 1 }] });
  return id;
}
// REAL central-order schema: NO branchId, centralWarehouseId, STRING status ('pending'/'received')
async function mkCentralOrder(productId, warehouseId, status = 'pending') {
  const id = created('be_central_stock_orders', `${TAG}-CO-${randomBytes(3).toString('hex')}`);
  await C('be_central_stock_orders').doc(id).set({ orderId: id, centralWarehouseId: warehouseId, status, items: [{ productId, productName: `${TAG} cord`, qty: 1 }] });
  return id;
}

// ── the cascade, mirroring productDeleteClient EXACTLY (shared pure helpers +
//    the same write-shapes), but committed via admin SDK ──
// mirror productDeleteClient: orders are branch-keyed; transfers/withdrawals/
// central-orders have NO branchId → load unfiltered + filter by ref+pending.
async function loadInputs(pid, branchId) {
  const [bs, cs, gs, ord, ...unf] = await Promise.all([
    C('be_stock_batches').where('productId', '==', pid).get(),
    C('be_courses').where('branchId', '==', branchId).get(),
    C('be_product_groups').where('branchId', '==', branchId).get(),
    C('be_stock_orders').where('branchId', '==', branchId).get(),
    C('be_stock_transfers').get(),
    C('be_stock_withdrawals').get(),
    C('be_central_stock_orders').get(),
  ]);
  return {
    batches: bs.docs.map(d => ({ ...d.data(), id: d.id })),
    courses: cs.docs.map(d => ({ ...d.data(), id: d.id })),
    groups: gs.docs.map(d => ({ ...d.data(), id: d.id })),
    stockOps: [ord, ...unf].flatMap(s => s.docs.map(d => ({ ...d.data(), id: d.id }))),
  };
}
async function cascadePreview(pid, branchId) {
  const { batches, courses, groups, stockOps } = await loadInputs(pid, branchId);
  const guards = evaluateProductDeleteGuards({ productId: pid, batches, courses, stockOps });
  const plan = planProductCascade({ productId: pid, batches, courses, groups });
  return { guards, plan };
}
async function cascadeDelete(pid, branchId) {
  const { guards, plan } = await cascadePreview(pid, branchId);
  if (guards.blocked) return { blocked: true, reasons: guards.reasons };
  const wb = db.batch();
  let del = 0, can = 0, cu = 0, gu = 0;
  for (const b of plan.batches) {
    if (batchDeleteAction(b.remaining) === 'delete') { wb.delete(C('be_stock_batches').doc(b.batchId)); del++; }
    else { wb.update(C('be_stock_batches').doc(b.batchId), { status: 'cancelled' }); can++; }
  }
  for (const u of plan.courseUpdates) { wb.update(C('be_courses').doc(u.courseId), { courseProducts: u.courseProducts }); cu++; }
  for (const u of plan.groupUpdates) {
    const patch = {}; if (u.productIds !== undefined) patch.productIds = u.productIds; if (u.products !== undefined) patch.products = u.products;
    wb.update(C('be_product_groups').doc(u.groupId), patch); gu++;
  }
  wb.delete(C('be_products').doc(pid));
  await wb.commit();
  return { blocked: false, batchesDeleted: del, batchesCancelled: can, coursesUpdated: cu, groupsUpdated: gu };
}

// balance-view orphan-backstop mirror (StockBalancePanel)
async function balanceShowsProduct(pid, locationId) {
  const bs = await C('be_stock_batches').where('productId', '==', pid).get();
  const prodSnap = await C('be_products').doc(pid).get();
  const productExists = prodSnap.exists;
  let remaining = 0; let anyVisible = false;
  for (const d of bs.docs) {
    const b = d.data();
    if (String(b.locationId) !== String(locationId)) continue;
    if (b.status !== 'active' && b.status !== 'depleted') continue; // V143 view filter
    anyVisible = true; remaining += Number(b.qty?.remaining || 0);
  }
  if (!anyVisible) return false;            // no visible batch → no row
  if (productExists) return true;           // normal row
  return remaining > 0;                     // orphan: backstop hides ≤0, keeps >0
}

async function runBranchScenarios(branch) {
  const { branchId, name } = branch;
  const centralWH = branch.centralWH;
  console.log(`\n── branch: ${name} (${branchId}) ──`);

  // S1 — GUARD: live stock >0 → blocked, product NOT deleted
  {
    const p = await mkProduct(branchId, 'S1-livestock'); await mkBatch(p, branchId, 5);
    const r = await cascadeDelete(p, branchId);
    ok(r.blocked && r.reasons.some(x => x.code === 'HAS_STOCK'), `${name} S1 live-stock BLOCKS (HAS_STOCK)`);
    ok((await C('be_products').doc(p).get()).exists, `${name} S1 product NOT deleted when blocked`);
  }
  // S2 — GUARD: course mainProductId → blocked
  {
    const p = await mkProduct(branchId, 'S2-coursemain'); await mkCourse(branchId, { main: p });
    const r = await cascadeDelete(p, branchId);
    ok(r.blocked && r.reasons.some(x => x.code === 'IS_COURSE_MAIN'), `${name} S2 course-main BLOCKS (IS_COURSE_MAIN)`);
  }
  // S3 — GUARD: both reasons
  {
    const p = await mkProduct(branchId, 'S3-both'); await mkBatch(p, branchId, 3); await mkCourse(branchId, { main: p });
    const r = await cascadeDelete(p, branchId);
    ok(r.blocked && r.reasons.length === 2, `${name} S3 both guards stack (2 reasons)`);
  }
  // S4 — CASCADE: ==0 branch batch + course sub-ref + group membership → all cleared
  {
    const p = await mkProduct(branchId, 'S4-clean'); const b = await mkBatch(p, branchId, 0);
    const c = await mkCourse(branchId, { main: 'OTHER', sub: [p, 'KEEP'] }); const g = await mkGroup(branchId, p);
    const r = await cascadeDelete(p, branchId);
    ok(!r.blocked && r.batchesDeleted === 1 && r.coursesUpdated === 1 && r.groupsUpdated === 1, `${name} S4 cascade counts (1 batch del, 1 course, 1 group)`);
    ok(!(await C('be_products').doc(p).get()).exists, `${name} S4 product deleted`);
    ok(!(await C('be_stock_batches').doc(b).get()).exists, `${name} S4 ==0 batch deleted`);
    const cd = (await C('be_courses').doc(c).get()).data();
    ok(!(cd.courseProducts || []).some(x => x.productId === p) && cd.courseProducts.some(x => x.productId === 'KEEP'), `${name} S4 course sub-ref pulled, sibling KEPT`);
    const gd = (await C('be_product_groups').doc(g).get()).data();
    ok(!gd.productIds.includes(p) && gd.productIds.includes('OTHER-KEEP') && !gd.products.some(x => x.productId === p), `${name} S4 group membership pulled (ids+products), OTHER-KEEP retained`);
    ok(!(await balanceShowsProduct(p, branchId)), `${name} S4 balance view no longer shows product`);
  }
  // S5 — CASCADE: negative (<0) batch → cancelled (NOT deleted), product gone, not in view
  {
    const p = await mkProduct(branchId, 'S5-neg'); const b = await mkBatch(p, branchId, -2);
    const r = await cascadeDelete(p, branchId);
    ok(!r.blocked && r.batchesCancelled === 1 && r.batchesDeleted === 0, `${name} S5 negative batch CANCELLED not deleted`);
    ok((await C('be_stock_batches').doc(b).get()).data().status === 'cancelled', `${name} S5 batch status=cancelled (V144 negative-undeletable honored)`);
    ok(!(await balanceShowsProduct(p, branchId)), `${name} S5 cancelled batch leaves the balance view`);
  }
  // S6 — CASCADE: CENTRAL warehouse batch (==0) cleared (location-agnostic)
  if (centralWH) {
    const p = await mkProduct(branchId, 'S6-central'); const b = await mkBatch(p, centralWH, 0);
    const r = await cascadeDelete(p, branchId);
    ok(!r.blocked && r.batchesDeleted === 1, `${name} S6 CENTRAL batch cleared by cascade`);
    ok(!(await C('be_stock_batches').doc(b).get()).exists, `${name} S6 central batch gone`);
    ok(!(await balanceShowsProduct(p, centralWH)), `${name} S6 central view clear`);
  } else { console.log(`  (S6 skipped — no central WH)`); }
  // S7 — CASCADE: branch + central together
  if (centralWH) {
    const p = await mkProduct(branchId, 'S7-both-loc'); const bb = await mkBatch(p, branchId, 0); const cb = await mkBatch(p, centralWH, 0);
    const r = await cascadeDelete(p, branchId);
    ok(!r.blocked && r.batchesDeleted === 2, `${name} S7 branch+central both cleared (2 batches)`);
    ok(!(await C('be_stock_batches').doc(bb).get()).exists && !(await C('be_stock_batches').doc(cb).get()).exists, `${name} S7 both batch docs gone`);
  }
  // S8 — CASCADE: multiple courses (sub) + multiple groups → all pulled
  {
    const p = await mkProduct(branchId, 'S8-multi');
    const c1 = await mkCourse(branchId, { main: 'O', sub: [p] }); const c2 = await mkCourse(branchId, { main: 'O', sub: [p, 'K'] });
    const g1 = await mkGroup(branchId, p); const g2 = await mkGroup(branchId, p);
    const r = await cascadeDelete(p, branchId);
    ok(!r.blocked && r.coursesUpdated === 2 && r.groupsUpdated === 2, `${name} S8 multi course(2)+group(2) all pulled`);
    const c1d = (await C('be_courses').doc(c1).get()).data();
    const c2d = (await C('be_courses').doc(c2).get()).data();
    ok(!c1d.courseProducts.some(x => x.productId === p) && !c2d.courseProducts.some(x => x.productId === p), `${name} S8 both courses' sub-refs pulled`);
    ok(c2d.courseProducts.some(x => x.productId === 'K'), `${name} S8 sibling sub-ref 'K' retained`);
    const g1d = (await C('be_product_groups').doc(g1).get()).data();
    ok(!g1d.productIds.includes(p), `${name} S8 group1 membership pulled`);
  }
  // S9 — CASCADE: no deps (no batches/courses/groups) → just delete
  {
    const p = await mkProduct(branchId, 'S9-bare');
    const r = await cascadeDelete(p, branchId);
    ok(!r.blocked && r.batchesDeleted === 0 && r.coursesUpdated === 0 && r.groupsUpdated === 0, `${name} S9 bare product deletes cleanly`);
    ok(!(await C('be_products').doc(p).get()).exists, `${name} S9 product gone`);
  }
  // S10 — HISTORY KEPT: movement + stock-order survive the cascade (Rule O)
  {
    const p = await mkProduct(branchId, 'S10-history'); await mkBatch(p, branchId, 0);
    const m = await mkMovement(p, branchId); const o = await mkOrder(p, branchId);
    const r = await cascadeDelete(p, branchId);
    ok(!r.blocked, `${name} S10 cascade ran`);
    ok((await C('be_stock_movements').doc(m).get()).exists, `${name} S10 movement KEPT (audit history)`);
    ok((await C('be_stock_orders').doc(o).get()).exists, `${name} S10 stock-order KEPT (op history)`);
  }
  // S11 — ADVERSARIAL: mixed ==0 + <0 batches → ==0 deleted, <0 cancelled
  {
    const p = await mkProduct(branchId, 'S11-mixed'); const z = await mkBatch(p, branchId, 0); const n = await mkBatch(p, branchId, -1);
    const r = await cascadeDelete(p, branchId);
    ok(!r.blocked && r.batchesDeleted === 1 && r.batchesCancelled === 1, `${name} S11 mixed: 1 deleted + 1 cancelled`);
    ok(!(await C('be_stock_batches').doc(z).get()).exists && (await C('be_stock_batches').doc(n).get()).data().status === 'cancelled', `${name} S11 ==0 gone, <0 cancelled`);
  }
  // S12 — GUARD: PENDING inbound order → BLOCKED (the researched bug: deleting
  //   a product in an active order makes its receive throw _assertProductExists forever)
  {
    const p = await mkProduct(branchId, 'S12-pendingop'); const o = await mkOrder(p, branchId, 'active');
    const r = await cascadeDelete(p, branchId);
    ok(r.blocked && r.reasons.some(x => x.code === 'HAS_PENDING_OP'), `${name} S12 pending order BLOCKS (HAS_PENDING_OP)`);
    ok((await C('be_products').doc(p).get()).exists, `${name} S12 product NOT deleted (order would break)`);
    ok(r.reasons.find(x => x.code === 'HAS_PENDING_OP').detail.opIds.includes(o), `${name} S12 block names the pending order`);
  }
  // S13 — a TERMINAL (received) order does NOT block the delete (op is done)
  {
    const p = await mkProduct(branchId, 'S13-receivedorder'); await mkOrder(p, branchId, 'received');
    const r = await cascadeDelete(p, branchId);
    ok(!r.blocked, `${name} S13 received(terminal) order does NOT block delete`);
    ok(!(await C('be_products').doc(p).get()).exists, `${name} S13 product deleted (received order is history)`);
  }
  // S14 — GUARD: PENDING TRANSFER (numeric status 0, NO branchId) → BLOCKED.
  //   (the V66 fixture-vs-reality gap: my guard used to `where branchId` → miss transfers)
  {
    const p = await mkProduct(branchId, 'S14-pendingxfer'); const t = await mkTransfer(p, branchId, centralWH || 'LOC-X', 0);
    const r = await cascadeDelete(p, branchId);
    ok(r.blocked && r.reasons.some(x => x.code === 'HAS_PENDING_OP'), `${name} S14 pending TRANSFER (no branchId, numeric status) BLOCKS`);
    ok(r.reasons.find(x => x.code === 'HAS_PENDING_OP').detail.opIds.includes(t), `${name} S14 block names the transfer`);
  }
  // S15 — a RECEIVED transfer (numeric status 2) does NOT block
  {
    const p = await mkProduct(branchId, 'S15-recvxfer'); await mkTransfer(p, branchId, centralWH || 'LOC-X', 2);
    const r = await cascadeDelete(p, branchId);
    ok(!r.blocked, `${name} S15 received transfer (status=2) does NOT block`);
  }
  // S16 — GUARD: PENDING CENTRAL ORDER (centralWarehouseId, string 'pending') → BLOCKED
  if (centralWH) {
    const p = await mkProduct(branchId, 'S16-pendingcord'); const co = await mkCentralOrder(p, centralWH, 'pending');
    const r = await cascadeDelete(p, branchId);
    ok(r.blocked && r.reasons.some(x => x.code === 'HAS_PENDING_OP'), `${name} S16 pending CENTRAL order (centralWarehouseId) BLOCKS`);
    ok(r.reasons.find(x => x.code === 'HAS_PENDING_OP').detail.opIds.includes(co), `${name} S16 block names the central order`);
  }
  // S17 — a RECEIVED central order (string 'received') does NOT block
  if (centralWH) {
    const p = await mkProduct(branchId, 'S17-recvcord'); await mkCentralOrder(p, centralWH, 'received');
    const r = await cascadeDelete(p, branchId);
    ok(!r.blocked, `${name} S17 received central order does NOT block`);
    ok(!(await C('be_products').doc(p).get()).exists, `${name} S17 product deleted (received central order is history)`);
  }
}

async function main() {
  console.log(`▶ Rule Q L2 e2e — product delete-cascade, MULTI-BRANCH + every scenario  [${TAG}]`);
  // real branches + a central warehouse
  const [brSnap, whSnap] = await Promise.all([C('be_branches').get(), C('be_central_stock_warehouses').get()]);
  const centralWH = whSnap.docs[0]?.id || null;
  let branches = brSnap.docs.map(d => ({ branchId: d.id, name: d.data().branchName || d.data().name || d.id, centralWH }));
  if (branches.length === 0) branches = [{ branchId: 'BR-1777873556815-26df6480', name: 'fallback', centralWH }];
  console.log(`branches: ${branches.length} (${branches.map(b => b.name).join(', ')}) · centralWH: ${centralWH || 'none'}`);

  try {
    for (const b of branches) await runBranchScenarios(b);
  } finally {
    // ── cleanup ALL fixtures (zero orphans) ──
    console.log(`\n▶ cleanup ${ids.length} fixtures…`);
    let wb = db.batch(); let n = 0;
    for (const { col, id } of ids) { wb.delete(C(col).doc(id)); if (++n >= 450) { await wb.commit(); wb = db.batch(); n = 0; } }
    if (n > 0) await wb.commit();
    // verify zero orphan fixtures remain
    const leftovers = [];
    for (const col of ['be_products', 'be_stock_batches', 'be_courses', 'be_product_groups', 'be_stock_movements', 'be_stock_orders', 'be_stock_transfers', 'be_stock_withdrawals', 'be_central_stock_orders']) {
      const snap = await C(col).get();
      for (const d of snap.docs) if (d.id.startsWith(TAG)) leftovers.push(`${col}/${d.id}`);
    }
    ok(leftovers.length === 0, `cleanup verified — zero TEST fixtures remain (found ${leftovers.length})`);
    console.log(`✓ cleanup done`);
  }

  console.log(`\n${'='.repeat(50)}\nPASS (${pass}) FAIL (${fail})`);
  if (fail) { console.log('FAILURES:\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
