#!/usr/bin/env node
// ─── HUNT R12 — multi-item completeness + duplicate-line + sale/treatment parity
//
// Novel angles never tested:
//   D1 — a product appearing in TWO item arrays (products + consumables/meds)
//        must deduct BOTH lines (no dedup-swallow in _normalizeStockItems).
//   D2 — mixed tracked + untracked + skip-flag items in ONE deduct → every line
//        processed (tracked deducts, untracked auto-inits, skip skips; none
//        silently dropped).
//   D3 — sale vs treatment PARITY on an untracked product (Agent flagged a
//        comment-vs-code mismatch: does sale auto-init like treatment?).
//
// Rule Q L2 (real prod). Rule M/R cleanup.
// Run: node scripts/e2e-stock-multiitem-parity.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { deductStockForSale, deductStockForTreatment } from '../src/lib/backendClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-MIP-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const mkProduct = (pid, tracked = true) => { cleanup.push(['be_products', pid]); return data.collection('be_products').doc(pid).set({
    productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR,
    stockConfig: tracked ? { trackStock: true, minAlert: 0, unit: 'cc' } : { trackStock: false },
    status: 'ใช้งาน', createdAt: new Date().toISOString(),
  }); };
  const mkBatch = (bid, pid, remaining) => { cleanup.push(['be_stock_batches', bid]); return data.collection('be_stock_batches').doc(bid).set({
    batchId: bid, productId: pid, productName: `${pid}-name`, branchId: BR, locationId: BR, locationType: 'branch',
    status: BATCH_STATUS.ACTIVE, qty: { total: remaining, remaining }, originalCost: 0,
    receivedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  }); };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'MIP', isDefault: false });
    console.log(`signed in ${STAFF_UID} — multi-item completeness + parity\n`);

    // D1 — duplicate line across arrays: P1 in products(2) + consumables(3) → deduct 5
    console.log('D1 — treatment: P1 in products[2] + consumables[3] → deduct 5 (both lines, no swallow)');
    { const P1 = `${NS}-D1-P1`, B = `${NS}-D1-B`;
      await mkProduct(P1); await mkBatch(B, P1, 20);
      await deductStockForTreatment(`${NS}-D1-T`, {
        products: [{ productId: P1, name: `${P1}-name`, qty: 2, unit: 'cc' }],
        consumables: [{ productId: P1, name: `${P1}-name`, qty: 3, unit: 'cc' }],
      }, { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      const r = await sumRemaining(P1);
      check('D1 treatment: P1 deducted 5 (20→15; both duplicate lines processed)', r.sum === 15, `Σ=${r.sum}`);
    }

    // D2 — mixed tracked + untracked + skip: all lines processed
    console.log('\nD2 — treatment: tracked P1(2) + untracked P2(1) + skip P3(1) → each handled');
    { const P1 = `${NS}-D2-P1`, P2 = `${NS}-D2-P2`, P3 = `${NS}-D2-P3`, B1 = `${NS}-D2-B1`, B3 = `${NS}-D2-B3`;
      await mkProduct(P1); await mkBatch(B1, P1, 10);
      await mkProduct(P2, false); // untracked
      await mkProduct(P3); await mkBatch(B3, P3, 10);
      await deductStockForTreatment(`${NS}-D2-T`, {
        treatmentItems: [
          { productId: P1, name: `${P1}-name`, qty: 2, unit: 'cc' },
          { productId: P2, name: `${P2}-name`, qty: 1, unit: 'cc' },
          { productId: P3, name: `${P3}-name`, qty: 1, unit: 'cc', skipStockDeduction: true },
        ],
      }, { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      const r1 = await sumRemaining(P1), r2 = await sumRemaining(P2), r3 = await sumRemaining(P3);
      check('D2a tracked P1 deducted (10→8)', r1.sum === 8, `P1 Σ=${r1.sum}`);
      check('D2b untracked P2 auto-init + deducted (batch created, -1)', r2.n >= 1 && r2.sum === -1, `P2 Σ=${r2.sum} lots=${r2.n}`);
      check('D2c skip-flag P3 NOT deducted (10 untouched)', r3.sum === 10, `P3 Σ=${r3.sum}`);
    }

    // D3 — sale vs treatment PARITY on an untracked product
    console.log('\nD3 — untracked product: sale deduct 3 vs treatment deduct 3 → identical (both auto-init)');
    { const PS = `${NS}-D3-PS`, PT = `${NS}-D3-PT`;
      await mkProduct(PS, false); await mkProduct(PT, false);
      await deductStockForSale(`${NS}-D3-S`, [{ productId: PS, name: `${PS}-name`, qty: 3, unit: 'cc' }], { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.SALE });
      await deductStockForTreatment(`${NS}-D3-T`, [{ productId: PT, name: `${PT}-name`, qty: 3, unit: 'cc' }], { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      const rs = await sumRemaining(PS), rt = await sumRemaining(PT);
      check('D3 sale & treatment handle untracked IDENTICALLY (both auto-init → -3)', rs.sum === rt.sum && rs.sum === -3, `sale Σ=${rs.sum} treatment Σ=${rt.sum}`);
    }
  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanup) await data.collection(c).doc(id).delete().catch(() => {});
      for (const coll of ['be_stock_movements', 'be_stock_batches']) {
        const snap = await data.collection(coll).get();
        for (const d of snap.docs) { const v = d.data();
          if ([v.branchId, v.productId, v.batchId, v.linkedTreatmentId, v.linkedSaleId, v.customerId].some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {}); }
      }
      let orphans = 0;
      for (const [c, id] of cleanup) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ HUNT R12 multi-item parity: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
