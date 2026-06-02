#!/usr/bin/env node
// ─── HUNT R10 — reverse a sale/treatment AFTER V144 auto-deleted the 0-lot ────
//
// Real feature-interaction never tested: V144 (_clearRedundantZeroLotsForProducts)
// DELETES a redundant 0-lot post-commit (keeps it only if it's the LAST lot). If
// a sale drains lot A to 0 while lot B stays live, V144 DELETES A. Later the user
// CANCELS that sale → reverseStockForSale → _reverseOneMovement → tx.get(A) →
// !exists → `throw "Batch A vanished before reverse"`. reverseStockForSale's loop
// has NO try/catch → the throw propagates → the WHOLE cancel FAILS and stock is
// NOT returned. That violates the purpose ("a sale cancel must restore stock").
//
// Rule Q L2 (real prod, shipped fns). Rule M/R cleanup.
// Run: node scripts/e2e-stock-reverse-after-lotclear.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { deductStockForSale, reverseStockForSale } from '../src/lib/backendClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-RAL-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const exists = async (bid) => (await data.collection('be_stock_batches').doc(bid).get()).exists;
  const sumRemaining = async (pid) => {
    const s = await data.collection('be_stock_batches').where('productId', '==', pid).get();
    let sum = 0, n = 0; s.docs.forEach(d => { sum += Number(d.data().qty?.remaining) || 0; n++; });
    return { sum, n };
  };
  const deltaSum = async (pid) => {
    const s = await data.collection('be_stock_movements').where('productId', '==', pid).where('reverseOf', '==', null).get().catch(() => null);
    // fallback: sum ALL movement qty (reverse entries are positive, so Σ over all = net)
    const all = await data.collection('be_stock_movements').where('productId', '==', pid).get();
    let d = 0; all.docs.forEach(x => { const q = x.data().qty; if (typeof q === 'number') d += q; });
    return d;
  };
  const mkProduct = (pid) => { cleanup.push(['be_products', pid]); return data.collection('be_products').doc(pid).set({
    productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR,
    stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString(),
  }); };
  const mkBatch = (bid, pid, remaining, total, ageMs) => { cleanup.push(['be_stock_batches', bid]); return data.collection('be_stock_batches').doc(bid).set({
    batchId: bid, productId: pid, productName: `${pid}-name`, branchId: BR, locationId: BR, locationType: 'branch',
    status: BATCH_STATUS.ACTIVE, qty: { total, remaining }, originalCost: 0,
    receivedAt: new Date(Date.now() - ageMs).toISOString(), createdAt: new Date(Date.now() - ageMs).toISOString(),
  }); };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'RAL', isDefault: false });
    console.log(`signed in ${STAFF_UID} — reverse after V144 0-lot delete\n`);

    // R10.1 — 2 lots A(5,old) + B(5,new); sale deducts 5 → FIFO drains A → 0 →
    // V144 deletes A (B live). Cancel sale → reverse must restore 5 (not fail).
    console.log('R10.1 — A(5,old)+B(5,new); sale deduct 5 → A→0 deleted by V144; cancel sale');
    { const P = `${NS}-P`, A = `${NS}-A`, B = `${NS}-B`, S = `${NS}-S`;
      await mkProduct(P);
      await mkBatch(A, P, 5, 5, 300000); // older → FIFO first
      await mkBatch(B, P, 5, 5, 100000); // newer
      await deductStockForSale(S, [{ productId: P, name: `${P}-name`, qty: 5, unit: 'cc' }], { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.SALE });
      const aGone = !(await exists(A));
      const afterDeduct = await sumRemaining(P);
      console.log(`  after deduct: A deleted=${aGone}, Σremaining=${afterDeduct.sum}, lots=${afterDeduct.n}`);
      check('R10.1a deduct drained a lot to 0 (Σ=5 across remaining lots)', afterDeduct.sum === 5, `Σ=${afterDeduct.sum}`);
      // The decisive test: cancel the sale. Must NOT throw; stock must restore to 10.
      let cancelOk = true, cancelErr = '';
      try { await reverseStockForSale(S); } catch (e) { cancelOk = false; cancelErr = e?.message || String(e); }
      check('R10.1b cancel sale did NOT throw (even though V144 may have deleted the drained lot)', cancelOk, `err=${cancelErr}`);
      const afterCancel = await sumRemaining(P);
      check('R10.1c stock RESTORED to 10 after cancel (no stock lost to a vanished lot)', afterCancel.sum === 10, `Σ=${afterCancel.sum} (want 10)`);
      const d = await deltaSum(P);
      check('R10.1d conservation: Σall movements == 0 (deduct + reverse net zero)', d === 0, `Σdelta=${d}`);
    }
  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanup) await data.collection(c).doc(id).delete().catch(() => {});
      for (const coll of ['be_stock_movements', 'be_stock_batches']) {
        const snap = await data.collection(coll).get();
        for (const d of snap.docs) { const v = d.data();
          if ([v.branchId, v.productId, v.batchId, v.linkedSaleId, v.customerId].some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {}); }
      }
      let orphans = 0;
      for (const [c, id] of cleanup) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ HUNT R10 reverse-after-lotclear: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
