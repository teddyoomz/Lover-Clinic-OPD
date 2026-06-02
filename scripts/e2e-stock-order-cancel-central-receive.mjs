#!/usr/bin/env node
// ─── HUNT R15 — order cancel (void import) + central receive-twice idempotency ─
//   C1  import (createStockOrder) → cancel → batch voided (remaining 0, cancelled)
//   C1b double-cancel → idempotent (alreadyCancelled, no double-void)
//   C1c block-if-used: import → deduct from the batch → cancel must THROW
//   C2  central PO receive TWICE concurrently → exactly ONE batch (no double)
// Rule Q L2 (real prod). Rule M/R cleanup.
// Run: node scripts/e2e-stock-order-cancel-central-receive.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth as clientAuth } from '../src/firebase.js';
import { createStockOrder, cancelStockOrder, deductStockForTreatment, createCentralStockOrder, receiveCentralStockOrder } from '../src/lib/backendClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-ORD-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; fails.push(n); console.log(`  ✗ ${n} ${e}`); } };
async function throws(fn) { try { await fn(); return false; } catch { return true; } }
function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {};
  for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[line.slice(0, eq).trim()] = v; }
  return out;
}
function initAdmin() {
  if (adminApps().length) return adminFirestore();
  const env = loadEnvLocal();
  adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) });
  return adminFirestore();
}
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const BR = `${NS}-BR`, WH = `${NS}-WH`;
  const cleanup = [['be_branches', BR]];
  const batchesForProduct = async (pid) => (await data.collection('be_stock_batches').where('productId', '==', pid).get()).docs.map(d => d.data());
  const mkProduct = (pid) => { cleanup.push(['be_products', pid]); return data.collection('be_products').doc(pid).set({ productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR, stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString() }); };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'ORD', isDefault: false });
    console.log(`signed in ${STAFF_UID} — order cancel + central receive-twice\n`);

    // C1 — import → cancel → batch voided
    console.log('C1 — import 10 → cancel → batch voided (remaining 0, cancelled)');
    { const P = `${NS}-C1-P`; await mkProduct(P);
      const res = await createStockOrder({ branchId: BR, items: [{ productId: P, productName: `${P}-name`, qty: 10, cost: 5, unit: 'cc' }] });
      const oid = res.orderId; cleanup.push(['be_stock_orders', oid]);
      const before = await batchesForProduct(P);
      check('C1.0 import created a batch (remaining 10)', before.length === 1 && Number(before[0].qty.remaining) === 10, `lots=${before.length}`);
      await cancelStockOrder(oid, { reason: 'C1' });
      const after = await batchesForProduct(P);
      check('C1.1 cancel voided the batch (remaining 0, status cancelled)', after.length === 1 && Number(after[0].qty.remaining) === 0 && after[0].status === BATCH_STATUS.CANCELLED, `rem=${after[0]?.qty?.remaining} st=${after[0]?.status}`);
      // C1b double-cancel idempotent
      const dc = await cancelStockOrder(oid, { reason: 'C1 again' });
      check('C1b double-cancel idempotent (alreadyCancelled)', dc.alreadyCancelled === true, JSON.stringify(dc));
    }

    // C1c — block-if-used: import → deduct → cancel must throw
    console.log('\nC1c — import 10 → deduct 3 (batch used) → cancel must THROW');
    { const P = `${NS}-C1c-P`; await mkProduct(P);
      const res = await createStockOrder({ branchId: BR, items: [{ productId: P, productName: `${P}-name`, qty: 10, cost: 5, unit: 'cc' }] });
      const oid = res.orderId; cleanup.push(['be_stock_orders', oid]);
      await deductStockForTreatment(`${NS}-C1c-T`, [{ productId: P, name: `${P}-name`, qty: 3, unit: 'cc' }], { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      check('C1c cancel of a USED import THROWS (cannot void consumed stock)', await throws(() => cancelStockOrder(oid, { reason: 'C1c' })));
      const b = await batchesForProduct(P);
      check('C1c batch UNCHANGED after blocked cancel (remaining 7, active)', b[0] && Number(b[0].qty.remaining) === 7 && b[0].status === BATCH_STATUS.ACTIVE, `rem=${b[0]?.qty?.remaining} st=${b[0]?.status}`);
    }

    // C2 — central PO receive TWICE concurrently → exactly ONE batch
    console.log('\nC2 — central PO 8 units, receive ×2 concurrently → exactly ONE batch (no double)');
    { const P = `${NS}-C2-P`; await mkProduct(P);
      const co = await createCentralStockOrder({ centralWarehouseId: WH, items: [{ centralOrderProductId: `${NS}-C2-L1`, productId: P, productName: `${P}-name`, qty: 8, cost: 5, unit: 'cc' }] });
      const oid = co.orderId; cleanup.push(['be_central_stock_orders', oid]);
      const receipts = [{ centralOrderProductId: `${NS}-C2-L1` }];
      const r = await Promise.allSettled([
        receiveCentralStockOrder(oid, receipts),
        receiveCentralStockOrder(oid, receipts),
      ]);
      const fulfilled = r.filter(x => x.status === 'fulfilled').length;
      const central = (await batchesForProduct(P)).filter(b => b.locationType === 'central' || b.branchId === WH || b.locationId === WH || b.centralWarehouseId === WH);
      const total = central.reduce((s, b) => s + (Number(b.qty?.remaining) || 0), 0);
      check('C2.1 receive-twice created EXACTLY ONE central batch (no double-batch)', central.length === 1, `central lots=${central.length}`);
      check('C2.2 central batch qty = 8 (received once, not 16)', total === 8, `total=${total}`);
      console.log(`  (fulfilled receive calls=${fulfilled}/2; idempotent guard collapses the dup)`);
    }
  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanup) await data.collection(c).doc(id).delete().catch(() => {});
      for (const coll of ['be_stock_movements', 'be_stock_batches', 'be_stock_orders', 'be_central_stock_orders']) {
        const snap = await data.collection(coll).get();
        for (const d of snap.docs) { const v = d.data(); if ([v.branchId, v.productId, v.batchId, v.orderId, v.linkedOrderId, v.centralWarehouseId, v.linkedTreatmentId, v.locationId].some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {}); }
      }
      let orphans = 0; for (const [c, id] of cleanup) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {}); await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ HUNT R15 order-cancel + central-receive: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
