#!/usr/bin/env node
// ═══ V159 — order line-item search + per-batch expiry edit · Rule Q L2 e2e (REAL prod) ═══
// Drives the SHIPPED client-SDK functions (the exact code path the UI calls) on
// REAL prod, authed as staff (admin claim → isClinicStaff()), with TEST- fixtures.
// Admin SDK seeds the starting state + reads back + cleans up; the EXPIRY EDIT
// itself goes through the real client fn updateStockBatchExpiry → exercises the
// real firestore.rules (be_stock_batches/be_stock_orders update for staff).
//
// No firestore.rules change in V159 → this runs against the current deployed rules.
//
// Phases:
//   P1  search: formatOrderItemsSummary surfaces the matched line item first
//   P2  expiry edit: batch.expiresAt updated + forensic trail + status UNCHANGED
//   P3  audit doc: be_stock_adjustments type='expiry' (old→new, movementId null)
//   P4  NO movement created by the expiry edit (conservation untouched)
//   P5  order-line sync (Q4=B): the source order line's expiresAt syncs; siblings untouched
//   P6  mistyped→past makes hasExpired true; fixing→future makes it false, status still active
//   P7  clear expiry → null
//   P8  concurrency: 2 concurrent edits → both settle (last-write-wins), 2 audit docs, qty intact
//   P9  idempotency: same-value edit twice → batch stable
//   P10 no-order batch (empty sourceOrderId) → succeeds, orderSynced=false, no throw
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
  createStockOrder,
  updateStockBatchExpiry,
  listStockBatches,
  listStockMovements,
} from '../src/lib/backendClient.js';
import { formatOrderItemsSummary } from '../src/lib/orderItemsSummary.js';
import { BATCH_STATUS, hasExpired } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-V159-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
const BR = `${NS}-BR`;
const USER = { userId: STAFF_UID, userName: 'e2e-v159' };
let pass = 0, fail = 0; const fails = [];
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; fails.push(n); console.log(`  ✗ ${n} ${e}`); } };

function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function seedProduct(data, pid, name) {
  await data.collection('be_products').doc(pid).set({ productId: pid, productName: name, name, unit: 'ชิ้น', stockConfig: { trackStock: true }, createdAt: new Date().toISOString() });
}
const getBatch = async (data, id) => (await data.collection('be_stock_batches').doc(id).get()).data();
const getOrder = async (data, id) => (await data.collection('be_stock_orders').doc(id).get()).data();
const expiryAdjusts = async (data, batchId) => (await data.collection('be_stock_adjustments').where('batchId', '==', batchId).get()).docs.map(d => d.data()).filter(a => a.type === 'expiry');
const mvtsFor = async (batchId) => (await listStockMovements({ branchId: BR, includeReversed: true })).filter(m => m.batchId === batchId);

async function main() {
  const adb = initAdmin(); const data = base(adb);
  const ELZ = `${NS}-ELZ`, SAL = `${NS}-SAL`, GZE = `${NS}-GZE`, BTD = `${NS}-BTD`, NOORD = `${NS}-NOORD`;
  let cpoId = null; // V159-fix B2 — central order id (deleted in cleanup)
  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} · branch ${BR}\n`);

    await Promise.all([
      seedProduct(data, ELZ, 'Elonza'), seedProduct(data, SAL, 'Saline'),
      seedProduct(data, GZE, 'Gauze'), seedProduct(data, BTD, 'Betadine'),
      seedProduct(data, NOORD, 'NoOrder Product'),
    ]);

    // Create a real import order (client fn) — 4 lines, Elonza LAST (index 3) so
    // it would be truncated from the default 2-item summary unless surfaced.
    const ord = await createStockOrder({
      branchId: BR, vendorName: 'V159 TEST',
      items: [
        { productId: SAL, productName: 'Saline', qty: 1, cost: 5, unit: 'ชิ้น', expiresAt: '2026-09-30' },
        { productId: GZE, productName: 'Gauze', qty: 2, cost: 3, unit: 'ชิ้น', expiresAt: '2026-10-31' },
        { productId: BTD, productName: 'Betadine', qty: 1, cost: 8, unit: 'ชิ้น', expiresAt: '2026-11-30' },
        { productId: ELZ, productName: 'Elonza', qty: 10, cost: 150, unit: 'ชิ้น', expiresAt: '2026-09-30' },
      ],
    }, { user: USER });
    const orderId = ord.orderId;
    const elzBatch = (await listStockBatches({ productId: ELZ, branchId: BR }))[0];
    const elzId = elzBatch.batchId;
    console.log(`order ${orderId} · Elonza batch ${elzId} (orderProductId ${elzBatch.orderProductId})\n`);

    // ─── P1 — search surfaces the matched line item first ─────────────────────
    console.log('P1 — formatOrderItemsSummary surfaces the matched item first');
    const order0 = await getOrder(data, orderId);
    const summ = formatOrderItemsSummary(order0.items, { matchQuery: 'elonza' });
    check('P1.1 ★ summary surfaces "Elonza" first (not truncated away)', summ.startsWith('Elonza'), `summ="${summ}"`);
    const plain = formatOrderItemsSummary(order0.items);
    check('P1.2 backward-compat: no matchQuery → Elonza NOT shown (index 3 truncated)', !plain.includes('Elonza'), `plain="${plain}"`);

    // ─── P2 — expiry edit updates batch + forensic, status unchanged ──────────
    console.log('\nP2 — updateStockBatchExpiry updates the batch + forensic trail, status unchanged');
    const mvtsBefore = (await mvtsFor(elzId)).length;
    const r2 = await updateStockBatchExpiry({ batchId: elzId, newExpiresAt: '2027-12-31', note: 'คีย์ผิดตอนนำเข้า', branchId: BR }, { user: USER });
    const b2 = await getBatch(data, elzId);
    check('P2.1 ★ batch.expiresAt updated to the new date', b2.expiresAt === '2027-12-31', `expiresAt=${b2.expiresAt}`);
    check('P2.2 forensic expiresAtLegacyValue = old date', b2.expiresAtLegacyValue === '2026-09-30', `legacy=${b2.expiresAtLegacyValue}`);
    check('P2.3 forensic expiresAtEditedBy = actor', b2.expiresAtEditedBy === STAFF_UID, `by=${b2.expiresAtEditedBy}`);
    check('P2.4 batch.status UNCHANGED (still active — EXPIRED is derived)', b2.status === BATCH_STATUS.ACTIVE, `status=${b2.status}`);
    check('P2.5 qty untouched by the expiry edit', Number(b2.qty?.remaining) === 10 && Number(b2.qty?.total) === 10, `qty=${JSON.stringify(b2.qty)}`);

    // ─── P3 — audit doc type=expiry ──────────────────────────────────────────
    console.log('\nP3 — be_stock_adjustments type=expiry audit doc');
    const adj1 = await expiryAdjusts(data, elzId);
    check('P3.1 ★ exactly 1 expiry audit doc', adj1.length === 1, `count=${adj1.length}`);
    check('P3.2 old→new recorded', adj1[0]?.oldExpiresAt === '2026-09-30' && adj1[0]?.newExpiresAt === '2027-12-31');
    check('P3.3 movementId null (no movement linked)', adj1[0]?.movementId === null, `movementId=${adj1[0]?.movementId}`);
    check('P3.4 productName present (Rule O live-resolve)', typeof adj1[0]?.productName === 'string' && adj1[0].productName.length > 0, `name=${adj1[0]?.productName}`);
    check('P3.5 note carried', adj1[0]?.note === 'คีย์ผิดตอนนำเข้า');

    // ─── P4 — NO movement created by the expiry edit ─────────────────────────
    console.log('\nP4 — the expiry edit creates NO stock movement (conservation untouched)');
    const mvtsAfter = (await mvtsFor(elzId)).length;
    check('P4.1 ★ movement count unchanged by the expiry edit', mvtsAfter === mvtsBefore, `before=${mvtsBefore} after=${mvtsAfter}`);

    // ─── P5 — order-line sync (Q4=B) ─────────────────────────────────────────
    console.log('\nP5 — the source order line syncs; sibling lines untouched');
    check('P5.0 fn reported orderSynced=true', r2.orderSynced === true, `orderSynced=${r2.orderSynced}`);
    const order1 = await getOrder(data, orderId);
    const elzLine = order1.items.find(it => it.orderProductId === elzBatch.orderProductId);
    const salLine = order1.items.find(it => it.productId === SAL);
    check('P5.1 ★ Elonza order line expiresAt synced', elzLine?.expiresAt === '2027-12-31', `line=${elzLine?.expiresAt}`);
    check('P5.2 sibling (Saline) order line untouched', salLine?.expiresAt === '2026-09-30', `sal=${salLine?.expiresAt}`);

    // ─── P6 — mistyped-past → hasExpired true; fix-future → false ────────────
    console.log('\nP6 — a mistyped PAST date makes hasExpired true; fixing to FUTURE clears it');
    await updateStockBatchExpiry({ batchId: elzId, newExpiresAt: '2020-01-01', note: 'mistype', branchId: BR }, { user: USER });
    const bPast = await getBatch(data, elzId);
    check('P6.1 ★ past date → hasExpired(batch) true (FEFO would skip)', hasExpired(bPast) === true, `expiresAt=${bPast.expiresAt}`);
    check('P6.2 status still active despite past date (EXPIRED never persisted)', bPast.status === BATCH_STATUS.ACTIVE, `status=${bPast.status}`);
    await updateStockBatchExpiry({ batchId: elzId, newExpiresAt: '2028-06-30', note: 'fix', branchId: BR }, { user: USER });
    const bFut = await getBatch(data, elzId);
    check('P6.3 ★ fixed to future → hasExpired false (FEFO would include again)', hasExpired(bFut) === false, `expiresAt=${bFut.expiresAt}`);

    // ─── P7 — clear expiry → null ────────────────────────────────────────────
    console.log('\nP7 — clearing the expiry sets it to null');
    await updateStockBatchExpiry({ batchId: elzId, newExpiresAt: '', note: 'clear', branchId: BR }, { user: USER });
    const bClear = await getBatch(data, elzId);
    check('P7.1 ★ expiresAt cleared to null', bClear.expiresAt === null, `expiresAt=${bClear.expiresAt}`);
    check('P7.2 hasExpired(null) → false', hasExpired(bClear) === false);

    // ─── P8 — concurrency ────────────────────────────────────────────────────
    console.log('\nP8 — two concurrent expiry edits → both settle (last-write-wins), qty intact');
    const adjN0 = (await expiryAdjusts(data, elzId)).length;
    const results = await Promise.allSettled([
      updateStockBatchExpiry({ batchId: elzId, newExpiresAt: '2029-01-01', note: 'concA', branchId: BR }, { user: USER }),
      updateStockBatchExpiry({ batchId: elzId, newExpiresAt: '2029-02-02', note: 'concB', branchId: BR }, { user: USER }),
    ]);
    check('P8.1 ★ both concurrent edits resolved (no throw)', results.every(r => r.status === 'fulfilled'), JSON.stringify(results.map(r => r.status)));
    const bConc = await getBatch(data, elzId);
    check('P8.2 batch.expiresAt is one of the two (last-write-wins)', ['2029-01-01', '2029-02-02'].includes(bConc.expiresAt), `expiresAt=${bConc.expiresAt}`);
    const adjN1 = (await expiryAdjusts(data, elzId)).length;
    check('P8.3 exactly 2 new audit docs from the 2 concurrent calls', adjN1 - adjN0 === 2, `delta=${adjN1 - adjN0}`);
    check('P8.4 qty intact after concurrent expiry edits', Number(bConc.qty?.remaining) === 10, `qty=${JSON.stringify(bConc.qty)}`);

    // ─── P9 — idempotency (same value twice) — V159-fix B1 in-tx guard ────────
    console.log('\nP9 — same value twice → batch stable + 2nd is a guarded no-op (B1)');
    await updateStockBatchExpiry({ batchId: elzId, newExpiresAt: '2030-03-03', branchId: BR }, { user: USER });
    const adjN9 = (await expiryAdjusts(data, elzId)).length;
    const r9b = await updateStockBatchExpiry({ batchId: elzId, newExpiresAt: '2030-03-03', branchId: BR }, { user: USER });
    const bIdem = await getBatch(data, elzId);
    check('P9.1 expiresAt stable at the repeated value', bIdem.expiresAt === '2030-03-03', `expiresAt=${bIdem.expiresAt}`);
    check('P9.2 ★ 2nd identical edit is a no-op (noChange flag, B1 guard)', r9b.noChange === true, `r9b=${JSON.stringify(r9b)}`);
    check('P9.3 ★ no NEW adjustment doc from the no-op repeat', (await expiryAdjusts(data, elzId)).length === adjN9, `delta=${(await expiryAdjusts(data, elzId)).length - adjN9}`);

    // ─── P10 — no-order batch (empty sourceOrderId) ──────────────────────────
    console.log('\nP10 — a batch with no source order edits fine (orderSynced=false, no throw)');
    const noOrdBatchId = `${NS}-noorder-batch`;
    await data.collection('be_stock_batches').doc(noOrdBatchId).set({
      batchId: noOrdBatchId, productId: NOORD, productName: 'NoOrder Product', branchId: BR, locationId: BR, locationType: 'branch',
      sourceOrderId: '', orderProductId: '', status: BATCH_STATUS.ACTIVE, qty: { total: 5, remaining: 5 },
      expiresAt: '2026-12-31', receivedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    const r10 = await updateStockBatchExpiry({ batchId: noOrdBatchId, newExpiresAt: '2027-01-01', branchId: BR }, { user: USER });
    const b10 = await getBatch(data, noOrdBatchId);
    check('P10.1 ★ no-order batch expiry updated', b10.expiresAt === '2027-01-01', `expiresAt=${b10.expiresAt}`);
    check('P10.2 orderSynced=false (no order line to sync)', r10.orderSynced === false, `orderSynced=${r10.orderSynced}`);

    // ─── P11 — CENTRAL tier order-line sync (V159-fix B2) ─────────────────────
    // Central order items key on `centralOrderProductId` (not `orderProductId`);
    // the central batch.orderProductId === that value. Faithful to real
    // createCentralStockOrder + receiveCentralStockOrder shapes. Pre-fix the sync
    // matched only `it.orderProductId` → the central order-line sync was a SILENT
    // no-op (this block would FAIL pre-fix: orderSynced=false, line not synced).
    console.log('\nP11 — central-tier batch expiry edit syncs the central order line (B2)');
    cpoId = `${NS}-CPO`;
    const cLine0 = `${cpoId}-0`, cLine1 = `${cpoId}-1`;
    const cBatchId = `${NS}-CBATCH`;
    await data.collection('be_central_stock_orders').doc(cpoId).set({
      orderId: cpoId, vendorName: 'V159 CENTRAL TEST', branchId: BR, centralWarehouseId: BR,
      status: 'received', createdAt: new Date().toISOString(),
      items: [
        { centralOrderProductId: cLine0, productId: ELZ, productName: 'Elonza', qty: 4, cost: 150, expiresAt: '2026-05-05', receivedBatchId: cBatchId },
        { centralOrderProductId: cLine1, productId: SAL, productName: 'Saline', qty: 2, cost: 5, expiresAt: '2026-06-06' },
      ],
    });
    await data.collection('be_stock_batches').doc(cBatchId).set({
      batchId: cBatchId, productId: ELZ, productName: 'Elonza', branchId: BR,
      locationType: 'central', locationId: BR, orderProductId: cLine0, sourceOrderId: cpoId,
      expiresAt: '2026-05-05', unit: 'ชิ้น', qty: { total: 4, remaining: 4 },
      status: BATCH_STATUS.ACTIVE, receivedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    const r11 = await updateStockBatchExpiry({ batchId: cBatchId, newExpiresAt: '2028-08-08', branchId: BR }, { user: USER });
    const cOrder = (await data.collection('be_central_stock_orders').doc(cpoId).get()).data();
    const cSynced = (cOrder.items || []).find(it => it.centralOrderProductId === cLine0);
    const cSibling = (cOrder.items || []).find(it => it.centralOrderProductId === cLine1);
    check('P11.1 ★ central batch expiry updated', (await getBatch(data, cBatchId)).expiresAt === '2028-08-08', '');
    check('P11.2 ★ central ORDER LINE synced (silent no-op pre-fix)', cSynced?.expiresAt === '2028-08-08', `line=${cSynced?.expiresAt}`);
    check('P11.3 ★ result.orderSynced=true for central tier', r11.orderSynced === true, `orderSynced=${r11.orderSynced}`);
    check('P11.4 central sibling line untouched', cSibling?.expiresAt === '2026-06-06', `sib=${cSibling?.expiresAt}`);

  } finally {
    console.log('\ncleanup (delete every TEST doc on the TEST branch)...');
    try {
      for (const col of ['be_stock_batches', 'be_stock_movements', 'be_stock_orders', 'be_stock_adjustments']) {
        const snap = await data.collection(col).where('branchId', '==', BR).get();
        for (const d of snap.docs) await d.ref.delete();
        console.log(`  ${col}: deleted ${snap.size}`);
      }
      for (const pid of [ELZ, SAL, GZE, BTD, NOORD]) await data.collection('be_products').doc(pid).delete();
      if (cpoId) await data.collection('be_central_stock_orders').doc(cpoId).delete().catch(() => {});
      const orphan = (await data.collection('be_stock_batches').where('branchId', '==', BR).get()).size;
      console.log(orphan === 0 ? '  zero orphan ✓' : `  ⚠ ${orphan} orphan batches`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ V159 search + expiry-edit e2e: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error('FATAL', e); process.exit(1); });
