#!/usr/bin/env node
// ─── HUNT R3 — mixed/multi-batch concurrency (deepest stress of the V147 fix) ──
//
// User loop: keep hunting the stock system until a fresh round finds nothing.
// R1 fixed single-batch deduction race; R2 proved reverse/edit safe. R3 stresses
// the HARDER interleavings against real prod:
//   M1 — MULTI-batch concurrent deduction (FIFO across 3 lots). Tests the V147
//        re-plan converges + conserves when allocation spans multiple batches.
//   M2 — deduct ↔ reverse interleave on the same batch (cancel while selling).
//   M3 — deduct ↔ adjustment interleave on the same batch (admin adjusts while
//        a treatment deducts).
//   M4 — N-way concurrent deduction (5 simultaneous) on one batch — pile-up.
// INVARIANT for all: CONSERVATION — Σ(signed movement deltas) == (final Σremaining
// across the product's batches) - (initial total). Nothing created/lost.
//
// Rule Q L2 (real prod, shipped fns). Rule M/R cleanup.
// Run: node scripts/e2e-stock-mixed-concurrency.mjs
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
  deductStockForTreatment, deductStockForSale,
  reverseStockForSale, createStockAdjustment,
} from '../src/lib/backendClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-MIX-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const mkProduct = (pid) => data.collection('be_products').doc(pid).set({
    productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR,
    stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString(),
  });
  const mkBatch = (bid, pid, remaining, total, ageMs = 0) => data.collection('be_stock_batches').doc(bid).set({
    batchId: bid, productId: pid, productName: `${pid}-name`, branchId: BR, locationId: BR, locationType: 'branch',
    status: BATCH_STATUS.ACTIVE, qty: { total, remaining }, originalCost: 0,
    receivedAt: new Date(Date.now() - ageMs).toISOString(), createdAt: new Date(Date.now() - ageMs).toISOString(),
  });
  // Conservation: final Σremaining across all batches of pid == initialTotal + Σ(movement deltas)
  const conservationOk = async (pid, initialTotal) => {
    const bSnap = await data.collection('be_stock_batches').where('productId', '==', pid).get();
    let remSum = 0; bSnap.docs.forEach(d => { remSum += Number(d.data().qty?.remaining) || 0; });
    const mSnap = await data.collection('be_stock_movements').where('productId', '==', pid).get();
    let deltaSum = 0; mSnap.docs.forEach(d => { const q = d.data().qty; if (typeof q === 'number') deltaSum += q; });
    return { ok: remSum === initialTotal + deltaSum, remSum, deltaSum, expected: initialTotal + deltaSum };
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'MIX', isDefault: false });
    console.log(`signed in ${STAFF_UID}\n`);
    const ROUNDS = 4;

    // ── M1 — MULTI-batch concurrent deduction (FIFO across 3 lots) ───────────
    console.log('M1 — 2 concurrent treatments deduct 8 each from a product w/ 3 lots (4+4+4=12)');
    let m1Bad = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const P = `${NS}-M1-P-${r}`;
      await mkProduct(P);
      await mkBatch(`${NS}-M1-${r}-a`, P, 4, 4, 300000);
      await mkBatch(`${NS}-M1-${r}-b`, P, 4, 4, 200000);
      await mkBatch(`${NS}-M1-${r}-c`, P, 4, 4, 100000);
      const items = (q) => [{ productId: P, name: `${P}-name`, qty: q, unit: 'cc' }];
      const res = await Promise.allSettled([
        deductStockForTreatment(`${NS}-M1-Ta-${r}`, items(8), { customerId: `${NS}-Ca`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT }),
        deductStockForTreatment(`${NS}-M1-Tb-${r}`, items(8), { customerId: `${NS}-Cb`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT }),
      ]);
      const rejected = res.filter(x => x.status === 'rejected').length;
      const cons = await conservationOk(P, 12);
      // purpose: both deductions succeed (combined 16 > 12 → final Σ = -4); none rejected
      const ok = rejected === 0 && cons.ok && cons.remSum === -4;
      if (!ok) m1Bad++;
      console.log(`  round ${r}: rejected=${rejected} Σremaining=${cons.remSum} (want -4) conserves=${cons.ok}`);
    }
    check('M1 — multi-batch concurrent deduction: both succeed, Σ=-4, conservation holds every round', m1Bad === 0, `${m1Bad}/${ROUNDS} bad`);

    // ── M2 — deduct ↔ reverse interleave on the same batch ───────────────────
    console.log('\nM2 — concurrent [sell 5 (S2)] + [cancel the prior sale S1] on the same 10-batch');
    let m2Bad = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const P = `${NS}-M2-P-${r}`, B = `${NS}-M2-B-${r}`, S1 = `${NS}-M2-S1-${r}`, S2 = `${NS}-M2-S2-${r}`;
      await mkProduct(P); await mkBatch(B, P, 10, 10);
      await deductStockForSale(S1, [{ productId: P, name: `${P}-name`, qty: 5, unit: 'cc' }], { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.SALE }); // 10→5
      await Promise.allSettled([
        deductStockForSale(S2, [{ productId: P, name: `${P}-name`, qty: 5, unit: 'cc' }], { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.SALE }),
        reverseStockForSale(S1),
      ]);
      // Sequence: 10 -5(S1) = 5; then concurrently -5(S2) and +5(reverse S1).
      // Correct net = 5. The invariant that matters is CONSERVATION (Σmovements
      // == batch delta) holding regardless of interleave order.
      const cons = await conservationOk(P, 10);
      const ok = cons.ok && cons.remSum === 5;
      if (!ok) m2Bad++;
      console.log(`  round ${r}: Σremaining=${cons.remSum} (want 5) conserves=${cons.ok}`);
    }
    check('M2 — deduct↔reverse interleave: conservation holds, net = 10 (no stock lost/created)', m2Bad === 0, `${m2Bad}/${ROUNDS} bad`);

    // ── M3 — deduct ↔ adjustment interleave on the same batch ────────────────
    console.log('\nM3 — concurrent [treatment deduct 6] + [admin adjust-reduce 3] on the same 10-batch');
    let m3Bad = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const P = `${NS}-M3-P-${r}`, B = `${NS}-M3-B-${r}`;
      await mkProduct(P); await mkBatch(B, P, 10, 10);
      await Promise.allSettled([
        deductStockForTreatment(`${NS}-M3-T-${r}`, [{ productId: P, name: `${P}-name`, qty: 6, unit: 'cc' }], { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT }),
        createStockAdjustment({ batchId: B, type: 'reduce', qty: 3, branchId: BR, note: 'M3 concurrent adjust' }),
      ]);
      // deduct 6 always succeeds (negative allowed); adjust-reduce 3 succeeds unless it
      // raced to insufficient (cannot go negative → throws). Either way conservation holds.
      const cons = await conservationOk(P, 10);
      if (!cons.ok) m3Bad++;
      console.log(`  round ${r}: Σremaining=${cons.remSum} expected=${cons.expected} conserves=${cons.ok}`);
    }
    check('M3 — deduct↔adjustment interleave: conservation holds every round (no drift)', m3Bad === 0, `${m3Bad}/${ROUNDS} bad`);

    // ── M4 — N-way pile-up: 5 concurrent deductions on one 10-batch ──────────
    console.log('\nM4 — 5 concurrent treatments deduct 4 each from one 10-batch (combined 20)');
    let m4Bad = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const P = `${NS}-M4-P-${r}`, B = `${NS}-M4-B-${r}`;
      await mkProduct(P); await mkBatch(B, P, 10, 10);
      const res = await Promise.allSettled(Array.from({ length: 5 }, (_, i) =>
        deductStockForTreatment(`${NS}-M4-T${i}-${r}`, [{ productId: P, name: `${P}-name`, qty: 4, unit: 'cc' }], { customerId: `${NS}-C${i}`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT })));
      const rejected = res.filter(x => x.status === 'rejected').length;
      const cons = await conservationOk(P, 10);
      // purpose: all 5 succeed (combined 20 → final Σ = 10 - 20 = -10); none rejected
      const ok = rejected === 0 && cons.ok && cons.remSum === -10;
      if (!ok) m4Bad++;
      console.log(`  round ${r}: rejected=${rejected}/5 Σremaining=${cons.remSum} (want -10) conserves=${cons.ok}`);
    }
    check('M4 — 5-way pile-up: ALL 5 succeed (none lost to race), Σ=-10, conservation holds', m4Bad === 0, `${m4Bad}/${ROUNDS} bad`);

  } finally {
    console.log('\ncleanup...');
    try {
      await data.collection('be_branches').doc(BR).delete().catch(() => {});
      for (const coll of ['be_products', 'be_stock_batches', 'be_stock_movements', 'be_stock_adjustments']) {
        const snap = await data.collection(coll).get();
        for (const d of snap.docs) {
          const v = d.data();
          if ([v.branchId, v.productId, v.batchId, v.linkedTreatmentId, v.linkedSaleId, v.customerId, v.reverseOf]
            .some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {});
        }
      }
      let orphans = 0;
      for (const coll of ['be_products', 'be_stock_batches']) {
        const snap = await data.collection(coll).get();
        orphans += snap.docs.filter(d => String(d.data().productId || d.data().batchId || '').startsWith(NS)).length;
      }
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }

  console.log(`\n━━━ HUNT R3 mixed-concurrency: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
