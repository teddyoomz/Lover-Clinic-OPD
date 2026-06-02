#!/usr/bin/env node
// ─── HUNT R11 — negative-stock repay via real IMPORT (createStockOrder) ──────
//
// Untested real flow: when stock is IMPORTED for a product that's gone NEGATIVE,
// the incoming qty must settle the negative FIRST (_repayNegativeBalances in
// _buildBatchFromOrderItem), only the leftover becomes a new lot. Only the
// ADJUST_ADD repay was tested (V138 D1); the import/order path is untested on
// real prod. Conservation: final Σremaining == prior Σ + imported qty.
//   I1 over-import (−5, import 10 → repay 5 → 0, new +5; Σ=5)
//   I2 partial-import (−5, import 3 → −2, no new lot; Σ=−2)
//   I3 exact-import (−5, import 5 → 0; Σ=0)
//   I4 cross-product isolation (P −5, Q −3; import P only → Q untouched)
//
// Rule Q L2 (real prod, shipped createStockOrder). Rule M/R cleanup.
// Run: node scripts/e2e-stock-repay-via-import.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { createStockOrder } from '../src/lib/backendClient.js';
import { BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-RPY-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); }
}
function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}
function initAdmin() {
  if (adminApps().length) return adminFirestore();
  const env = loadEnvLocal();
  adminInit({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
  }) });
  return adminFirestore();
}
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const BR = `${NS}-BR`;
  const cleanup = [['be_branches', BR]];
  const sumRemaining = async (pid) => {
    const s = await data.collection('be_stock_batches').where('productId', '==', pid).get();
    let sum = 0, n = 0; s.docs.forEach(d => { sum += Number(d.data().qty?.remaining) || 0; n++; });
    return { sum, n };
  };
  const mkProduct = (pid) => { cleanup.push(['be_products', pid]); return data.collection('be_products').doc(pid).set({
    productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR,
    stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString(),
  }); };
  const mkNegBatch = (bid, pid, remaining) => { cleanup.push(['be_stock_batches', bid]); return data.collection('be_stock_batches').doc(bid).set({
    batchId: bid, productId: pid, productName: `${pid}-name`, branchId: BR, locationId: BR, locationType: 'branch',
    status: BATCH_STATUS.ACTIVE, qty: { total: 0, remaining }, originalCost: 0, autoNegative: true,
    receivedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  }); };
  const importQty = (pid, qty) => createStockOrder({
    branchId: BR,
    items: [{ productId: pid, productName: `${pid}-name`, qty, unit: 'cc', cost: 0 }],
  });

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'RPY', isDefault: false });
    console.log(`signed in ${STAFF_UID} — negative repay via import\n`);

    // I1 — over-import: -5, import 10 → repay 5 (→0) + new +5 → Σ=5
    console.log('I1 — negative -5, import 10 → Σ should be 5 (repay 5 + new 5)');
    { const P = `${NS}-I1-P`; await mkProduct(P); await mkNegBatch(`${NS}-I1-B`, P, -5);
      await importQty(P, 10);
      const r = await sumRemaining(P);
      check('I1 over-import: Σremaining = 5 (−5 + 10; negative settled)', r.sum === 5, `Σ=${r.sum} lots=${r.n}`);
    }

    // I2 — partial import: -5, import 3 → -2 (no new positive lot) → Σ=-2
    console.log('\nI2 — negative -5, import 3 → Σ should be -2 (partial repay, still in debt)');
    { const P = `${NS}-I2-P`; await mkProduct(P); await mkNegBatch(`${NS}-I2-B`, P, -5);
      await importQty(P, 3);
      const r = await sumRemaining(P);
      check('I2 partial-import: Σremaining = -2 (−5 + 3)', r.sum === -2, `Σ=${r.sum} lots=${r.n}`);
    }

    // I3 — exact import: -5, import 5 → 0 → Σ=0
    console.log('\nI3 — negative -5, import 5 → Σ should be 0 (exact repay)');
    { const P = `${NS}-I3-P`; await mkProduct(P); await mkNegBatch(`${NS}-I3-B`, P, -5);
      await importQty(P, 5);
      const r = await sumRemaining(P);
      check('I3 exact-import: Σremaining = 0 (−5 + 5)', r.sum === 0, `Σ=${r.sum} lots=${r.n}`);
    }

    // I4 — cross-product isolation: P -5, Q -3; import P 10 → P=5, Q stays -3
    console.log('\nI4 — P(-5) + Q(-3); import P 10 → P Σ=5, Q Σ=-3 (no cross-product repay)');
    { const P = `${NS}-I4-P`, Q = `${NS}-I4-Q`;
      await mkProduct(P); await mkNegBatch(`${NS}-I4-BP`, P, -5);
      await mkProduct(Q); await mkNegBatch(`${NS}-I4-BQ`, Q, -3);
      await importQty(P, 10);
      const rp = await sumRemaining(P), rq = await sumRemaining(Q);
      check('I4a imported product P repaid → Σ=5', rp.sum === 5, `P Σ=${rp.sum}`);
      check('I4b other product Q UNTOUCHED → Σ=-3 (cross-product isolation)', rq.sum === -3, `Q Σ=${rq.sum}`);
    }
  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanup) await data.collection(c).doc(id).delete().catch(() => {});
      for (const coll of ['be_stock_movements', 'be_stock_batches', 'be_stock_orders']) {
        const snap = await data.collection(coll).get();
        for (const d of snap.docs) { const v = d.data();
          if ([v.branchId, v.productId, v.batchId, v.orderId, v.linkedOrderId].some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {}); }
      }
      let orphans = 0;
      for (const [c, id] of cleanup) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ HUNT R11 repay-via-import: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
