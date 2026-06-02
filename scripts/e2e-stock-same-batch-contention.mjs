#!/usr/bin/env node
// ─── HUNT R17 — SINGLE-batch contention (V147 retry + negative-allowance +
//                cross-operation tx serialization)
//   R17.1 two concurrent SALES each deduct 7 from ONE 10-lot (demand 14 > 10) →
//         conservation: net 14 removed (lot drained to 0 + a -4 negative carrier);
//         NO lost-update (sum across all lots = -4), both sales succeed
//   R17.2 concurrent deduct(5) + ADJUST_ADD(+5) on the same 10-lot →
//         final remaining = 10 (no lost-update); both a SALE -5 and ADJUST_ADD +5
//   R17.3 concurrent deduct(5) + ADJUST_REDUCE(3) on the same 10-lot →
//         final remaining = 2 (both serialized, no lost-update)
//   R17.4 two concurrent ADJUST_ADD (+5, +5) on one 10-lot → 20 (not 15)
// Rule Q L2 (real prod). Run: node scripts/e2e-stock-same-batch-contention.mjs
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken } from 'firebase/auth';
import { auth as clientAuth } from '../src/firebase.js';
import { createStockOrder, deductStockForSale, createStockAdjustment, listStockMovements } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-CONT17-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; fails.push(n); console.log(`  ✗ ${n} ${e}`); } };
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
  const BR = `${NS}-BR`;
  const cleanup = [['be_branches', BR]];
  const lots = async (pid) => (await data.collection('be_stock_batches').where('productId', '==', pid).get()).docs.map(d => d.data());
  const sumRemaining = (arr) => arr.reduce((s, b) => s + (Number(b.qty?.remaining) || 0), 0);
  const mkProduct = (pid) => { cleanup.push(['be_products', pid]); return data.collection('be_products').doc(pid).set({ productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR, stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString() }); };
  const importLot = async (pid, qty) => { const o = await createStockOrder({ branchId: BR, items: [{ productId: pid, productName: `${pid}-name`, qty, cost: 5, unit: 'cc' }] }); cleanup.push(['be_stock_orders', o.orderId]); return (await lots(pid))[0].batchId; };
  const mvtsFor = async (pid) => (await listStockMovements({ includeReversed: true })).filter(m => String(m.productId) === pid);

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'CONT17', isDefault: false });
    console.log(`signed in ${STAFF_UID} — single-batch contention\n`);

    // R17.1 — two concurrent sales each deduct 7 from one 10-lot (demand 14 > 10)
    console.log('R17.1 — two SALES × deduct 7 CONCURRENT on one 10-lot (demand 14 > 10)');
    { const P = `${NS}-A-P`; await mkProduct(P); await importLot(P, 10);
      const [a, b] = await Promise.allSettled([
        deductStockForSale(`TEST-SALE-${NS}-A1`, [{ productId: P, productName: `${P}-name`, qty: 7, unit: 'cc' }], { branchId: BR }),
        deductStockForSale(`TEST-SALE-${NS}-A2`, [{ productId: P, productName: `${P}-name`, qty: 7, unit: 'cc' }], { branchId: BR }),
      ]);
      check('R17.1.1 both sales succeeded (negative-allowance, no insufficient throw)', a.status === 'fulfilled' && b.status === 'fulfilled', `${a.status}/${b.status}`);
      const net = sumRemaining(await lots(P));
      // conservation: started 10, removed 7+7=14 → net remaining MUST be -4 (no lost-update)
      check('R17.1.2 conservation: sum(remaining) = -4 (10 - 14), NO lost-update', net === -4, `sum=${net}`);
      // sum of all SALE movement qty for P = -14 (each deduct logged exactly its qty)
      const saleQty = (await mvtsFor(P)).filter(m => m.type === 2).reduce((s, m) => s + (Number(m.qty) || 0), 0);
      check('R17.1.3 ledger: SALE movements sum to -14 (both 7-deducts fully recorded)', saleQty === -14, `saleQty=${saleQty}`);
    }

    // R17.2 — concurrent deduct(5) + ADJUST_ADD(+5) on one 10-lot
    console.log('\nR17.2 — deduct 5 + ADJUST_ADD +5 CONCURRENT on one 10-lot → final 10');
    { const P = `${NS}-B-P`; await mkProduct(P); const bid = await importLot(P, 10);
      const [a, b] = await Promise.allSettled([
        deductStockForSale(`TEST-SALE-${NS}-B`, [{ productId: P, productName: `${P}-name`, qty: 5, unit: 'cc' }], { branchId: BR }),
        createStockAdjustment({ batchId: bid, type: 'add', qty: 5, branchId: BR, note: 'R17.2' }, { user: { userId: STAFF_UID, userName: 'adj' } }),
      ]);
      check('R17.2.1 both ops succeeded', a.status === 'fulfilled' && b.status === 'fulfilled', `${a.status}/${b.status}`);
      const net = sumRemaining(await lots(P));
      check('R17.2.2 final remaining = 10 (10 -5 +5, no lost-update either way)', net === 10, `sum=${net}`);
    }

    // R17.3 — concurrent deduct(5) + ADJUST_REDUCE(3) on one 10-lot
    console.log('\nR17.3 — deduct 5 + ADJUST_REDUCE 3 CONCURRENT on one 10-lot → final 2');
    { const P = `${NS}-C-P`; await mkProduct(P); const bid = await importLot(P, 10);
      const [a, b] = await Promise.allSettled([
        deductStockForSale(`TEST-SALE-${NS}-C`, [{ productId: P, productName: `${P}-name`, qty: 5, unit: 'cc' }], { branchId: BR }),
        createStockAdjustment({ batchId: bid, type: 'reduce', qty: 3, branchId: BR, note: 'R17.3' }, { user: { userId: STAFF_UID, userName: 'adj' } }),
      ]);
      check('R17.3.1 both ops succeeded (5+3=8 ≤ 10)', a.status === 'fulfilled' && b.status === 'fulfilled', `${a.status}/${b.status}`);
      const net = sumRemaining(await lots(P));
      check('R17.3.2 final remaining = 2 (10 -5 -3, both serialized, no lost-update)', net === 2, `sum=${net}`);
    }

    // R17.4 — two concurrent ADJUST_ADD (+5 +5) on one 10-lot → 20 (V34 regression)
    console.log('\nR17.4 — ADJUST_ADD +5 + ADJUST_ADD +5 CONCURRENT on one 10-lot → 20 (not 15)');
    { const P = `${NS}-D-P`; await mkProduct(P); const bid = await importLot(P, 10);
      const [a, b] = await Promise.allSettled([
        createStockAdjustment({ batchId: bid, type: 'add', qty: 5, branchId: BR, note: 'R17.4a' }, { user: { userId: STAFF_UID, userName: 'a' } }),
        createStockAdjustment({ batchId: bid, type: 'add', qty: 5, branchId: BR, note: 'R17.4b' }, { user: { userId: STAFF_UID, userName: 'b' } }),
      ]);
      check('R17.4.1 both adjusts succeeded', a.status === 'fulfilled' && b.status === 'fulfilled', `${a.status}/${b.status}`);
      const net = sumRemaining(await lots(P));
      check('R17.4.2 final remaining = 20 (10 +5 +5, no lost-update — V34 soft-cap atomic)', net === 20, `sum=${net}`);
    }

    console.log('\n──────── cleanup ────────');
    for (const sfx of ['A-P', 'B-P', 'C-P', 'D-P']) { const pid = `${NS}-${sfx}`; for (const b of await lots(pid)) await data.collection('be_stock_batches').doc(b.batchId).delete().catch(() => {}); }
    const allMvts = await data.collection('be_stock_movements').get();
    let mdel = 0; for (const d of allMvts.docs) { const m = d.data(); if (String(m.productId || '').includes(NS) || String(m.linkedSaleId || '').includes(NS) || String(m.linkedAdjustId || '').includes(NS)) { await d.ref.delete().catch(() => {}); mdel++; } }
    const allAdj = await data.collection('be_stock_adjustments').get();
    for (const d of allAdj.docs) { if (String(d.data().batchId || '').includes(NS) || String(d.id).includes(NS)) await d.ref.delete().catch(() => {}); }
    for (const [coll, id] of cleanup) await data.collection(coll).doc(id).delete().catch(() => {});
    let orphan = 0; for (const sfx of ['A-P', 'B-P', 'C-P', 'D-P']) orphan += (await lots(`${NS}-${sfx}`)).length;
    check('CLEANUP zero orphan batches', orphan === 0, `orphan=${orphan}`);
    console.log(`  (deleted ${mdel} movements)`);
  } finally {
    console.log(`\n════════ ${pass} passed / ${fail} failed ════════`);
    if (fails.length) console.log('FAILED:', fails.join(', '));
    process.exit(fail ? 1 : 0);
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
