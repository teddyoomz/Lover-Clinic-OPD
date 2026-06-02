#!/usr/bin/env node
// ─── HUNT R1 — concurrent stock-deduction race (NOVEL, zero prior coverage) ──
//
// User (2026-06-02 EOD+3): "หาเทสอะไรก็ได้ที่ไม่เคยมีมาก่อน ... ระบบ Stock
// มันต้องมีบั๊คที่ไม่เป็นไปตามจุดประสงค์ของโปรแกรมอยู่อีกแน่นอน ... รวมเทสการตัด
// สต็อคมาจาก TFP หรือ การขายด้วย ว่ายังทำได้สมบูรณ์แบบ 100% ตามจุดประสงค์".
//
// HYPOTHESIS (from code read backendClient.js:7656-7951):
//   _deductOneItem reads candidate batches OUTSIDE runTransaction
//   (listStockBatches getDocs @7656), plans FIFO allocation from that STALE
//   snapshot, THEN per-batch runTransaction re-reads + `if (beforeRemaining <
//   takeQty) throw "raced"` @7800. The Phase 15.7 negative-stock fallback only
//   fires when PLAN-TIME `plan.shortfall > 0` (@7690/7861). A RACE-TIME
//   shortfall (stale plan saw enough; a concurrent deduction drained it first)
//   has shortfall===0 → bypasses negative-stock → the raw "raced" throw
//   propagates (@7950 re-throw) → the whole treatment/sale SAVE FAILS.
//   That violates the app PURPOSE ("ตัดได้เสมอ ติดลบได้" — deduction must never
//   block on insufficient stock).
//
// Rule Q V66 L2: calls the SHIPPED client fns (deductStockForTreatment /
// deductStockForSale) against REAL prod Firestore, authed via custom token,
// reads batch + movements back, asserts conservation.
// Rule M/R: TEST- prefixed fixtures, try/finally cleanup, zero-orphan.
//
// Run: node scripts/e2e-stock-concurrency-race.mjs
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
  deductStockForTreatment,
  deductStockForSale,
  listStockBatches,
} from '../src/lib/backendClient.js';
import { getSystemConfig } from '../src/lib/systemConfigClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-RACE-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
const readBatch = async (db, id) => (await base(db).collection('be_stock_batches').doc(id).get()).data();

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const BR = `${NS}-BR`;
  const cleanupIds = [['be_branches', BR]];
  const trackCleanup = (c, id) => cleanupIds.push([c, id]);

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in as ${STAFF_UID} (admin) — calling SHIPPED client fns\n`);

    // Confirm negative-stock is enabled (else the "race vs negative" semantics differ).
    let allowNeg = true;
    try { const sc = await getSystemConfig(); allowNeg = sc?.featureFlags?.allowNegativeStock !== false; } catch {}
    console.log(`system_config.featureFlags.allowNegativeStock = ${allowNeg}\n`);

    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'RACE', isDefault: false });
    const mkProduct = (pid, tracked = true) => data.collection('be_products').doc(pid).set({
      productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR,
      stockConfig: tracked ? { trackStock: true, minAlert: 0, unit: 'cc' } : { trackStock: false },
      status: 'ใช้งาน', createdAt: new Date().toISOString(),
    });
    const mkBatch = (bid, pid, remaining, total) => data.collection('be_stock_batches').doc(bid).set({
      batchId: bid, productId: pid, productName: `${pid}-name`, branchId: BR, locationId: BR, locationType: 'branch',
      status: BATCH_STATUS.ACTIVE, qty: { total, remaining }, originalCost: 0,
      receivedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    });

    // ── C2 (CONTROL) — single over-deduct goes negative (non-concurrent) ─────
    // Proves the negative-stock allowance works when NOT racing. If this passes
    // but C1 fails, the bug is specifically concurrency.
    console.log('C2 (control) — single deduct 12 from a 5-batch → should go -7 (negative push, NO throw)');
    const P_CTRL = `${NS}-P-CTRL`, B_CTRL = `${NS}-B-CTRL`;
    trackCleanup('be_products', P_CTRL); trackCleanup('be_stock_batches', B_CTRL);
    await mkProduct(P_CTRL); await mkBatch(B_CTRL, P_CTRL, 5, 10);
    let ctrlOk = true, ctrlErr = '';
    try {
      await deductStockForTreatment(`${NS}-T-CTRL`, [{ productId: P_CTRL, name: `${P_CTRL}-name`, qty: 12, unit: 'cc' }],
        { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
    } catch (e) { ctrlOk = false; ctrlErr = e?.message || String(e); }
    const ctrl = await readBatch(adb, B_CTRL);
    check('C2.1 single over-deduct did NOT throw (negative-stock purpose)', ctrlOk, `err=${ctrlErr}`);
    check('C2.2 batch went to -7 (5 - 12)', ctrl && Number(ctrl.qty.remaining) === -7, `got ${ctrl?.qty?.remaining}`);

    // ── C1 — CONCURRENT treatment deductions on the SAME batch ───────────────
    // Two simultaneous treatments each need 7 from a 10-batch (combined 14 > 10).
    // PURPOSE: BOTH must succeed (one drains 10, other pushes negative). Run
    // several rounds — contention is timing-dependent, so sample.
    console.log('\nC1 — CONCURRENT: two treatments each deduct 7 from a single 10-batch (Promise.allSettled)');
    const ROUNDS = 6;
    let c1RacedRounds = 0, c1ConservationOk = true, c1AnyRejected = 0;
    const c1Messages = [];
    for (let r = 0; r < ROUNDS; r++) {
      const P = `${NS}-P-C1-${r}`, B = `${NS}-B-C1-${r}`;
      trackCleanup('be_products', P); trackCleanup('be_stock_batches', B);
      await mkProduct(P); await mkBatch(B, P, 10, 10);
      const results = await Promise.allSettled([
        deductStockForTreatment(`${NS}-T-C1a-${r}`, [{ productId: P, name: `${P}-name`, qty: 7, unit: 'cc' }],
          { customerId: `${NS}-Ca`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT }),
        deductStockForTreatment(`${NS}-T-C1b-${r}`, [{ productId: P, name: `${P}-name`, qty: 7, unit: 'cc' }],
          { customerId: `${NS}-Cb`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT }),
      ]);
      const rejected = results.filter(x => x.status === 'rejected');
      c1AnyRejected += rejected.length;
      const racedHere = rejected.some(x => /raced/i.test(x.reason?.message || String(x.reason)));
      if (racedHere) c1RacedRounds++;
      rejected.forEach(x => c1Messages.push(x.reason?.message || String(x.reason)));
      // Conservation: sum of THIS branch+product movement deltas must equal batch delta from 10.
      const b = await readBatch(adb, B);
      const remaining = Number(b?.qty?.remaining);
      const mvSnap = await data.collection('be_stock_movements').where('branchId', '==', BR).get();
      let deltaSum = 0;
      for (const d of mvSnap.docs) {
        const v = d.data();
        if (v.productId === P && typeof v.qty === 'number') deltaSum += v.qty;
      }
      // batch started at 10; remaining should == 10 + deltaSum (deltas are negative)
      const conserves = remaining === 10 + deltaSum;
      if (!conserves) c1ConservationOk = false;
      console.log(`  round ${r}: rejected=${rejected.length} raced=${racedHere} remaining=${remaining} Σdelta=${deltaSum} conserves=${conserves}`);
    }
    // THE BUG: if both deductions should always succeed (purpose), zero rounds
    // should reject. A "raced" rejection = the purpose-violating bug.
    check('C1.1 NO concurrent treatment deduction was rejected with a "raced" error (purpose: ตัดได้เสมอ)',
      c1RacedRounds === 0, `→ ${c1RacedRounds}/${ROUNDS} rounds raced; msgs: ${[...new Set(c1Messages)].join(' | ')}`);
    check('C1.2 conservation held every round (Σmovements == batch delta, no over/under-deduct)',
      c1ConservationOk, c1ConservationOk ? '' : 'MISMATCH — data corruption');

    // ── C4 — CONCURRENT SALE deductions on the SAME batch (mirror of C1) ──────
    console.log('\nC4 — CONCURRENT: two sales each deduct 7 from a single 10-batch');
    let c4RacedRounds = 0; const c4Messages = [];
    for (let r = 0; r < ROUNDS; r++) {
      const P = `${NS}-P-C4-${r}`, B = `${NS}-B-C4-${r}`;
      trackCleanup('be_products', P); trackCleanup('be_stock_batches', B);
      await mkProduct(P); await mkBatch(B, P, 10, 10);
      const results = await Promise.allSettled([
        deductStockForSale(`${NS}-S-C4a-${r}`, [{ productId: P, name: `${P}-name`, qty: 7, unit: 'cc' }],
          { customerId: `${NS}-Ca`, branchId: BR, movementType: MOVEMENT_TYPES.SALE }),
        deductStockForSale(`${NS}-S-C4b-${r}`, [{ productId: P, name: `${P}-name`, qty: 7, unit: 'cc' }],
          { customerId: `${NS}-Cb`, branchId: BR, movementType: MOVEMENT_TYPES.SALE }),
      ]);
      const rejected = results.filter(x => x.status === 'rejected');
      const racedHere = rejected.some(x => /raced/i.test(x.reason?.message || String(x.reason)));
      if (racedHere) c4RacedRounds++;
      rejected.forEach(x => c4Messages.push(x.reason?.message || String(x.reason)));
      console.log(`  round ${r}: rejected=${rejected.length} raced=${racedHere}`);
    }
    check('C4.1 NO concurrent SALE deduction was rejected with a "raced" error',
      c4RacedRounds === 0, `→ ${c4RacedRounds}/${ROUNDS} rounds raced; msgs: ${[...new Set(c4Messages)].join(' | ')}`);

    // ── C3 — sale of an UNTRACKED product (resolve the agent conflict) ───────
    // Does a sale of a product with stockConfig.trackStock=false silently skip,
    // or auto-init+deduct? Just OBSERVE; report the actual behavior.
    console.log('\nC3 — sale of an UNTRACKED product (observe auto-init vs silent-skip)');
    const P_UNTR = `${NS}-P-UNTR`;
    trackCleanup('be_products', P_UNTR);
    await mkProduct(P_UNTR, false); // trackStock:false, no batch
    let untrRes = null, untrErr = '';
    try {
      untrRes = await deductStockForSale(`${NS}-S-UNTR`, [{ productId: P_UNTR, name: `${P_UNTR}-name`, qty: 3, unit: 'cc' }],
        { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.SALE });
    } catch (e) { untrErr = e?.message || String(e); }
    // Did it create a batch? (auto-init) Did the movement say skipped?
    const untrBatches = await data.collection('be_stock_batches').where('productId', '==', P_UNTR).get();
    const untrMv = await data.collection('be_stock_movements').where('productId', '==', P_UNTR).get();
    const skippedMv = untrMv.docs.filter(d => d.data().skipped === true).length;
    const realMv = untrMv.docs.filter(d => d.data().skipped !== true).length;
    console.log(`  untracked sale → err=${untrErr || 'none'} batchesCreated=${untrBatches.size} skippedMovements=${skippedMv} realMovements=${realMv}`);
    console.log(`  → observed behavior: ${untrBatches.size > 0 ? 'AUTO-INIT (created batch + deducted)' : skippedMv > 0 ? 'SILENT-SKIP (skipped movement, no batch)' : 'no movement at all'}`);
    check('C3.1 untracked sale produced a deterministic audit trail (batch+deduct OR skip-movement; not a silent void)',
      untrBatches.size > 0 || skippedMv > 0, `batches=${untrBatches.size} skipped=${skippedMv}`);

  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanupIds) await data.collection(c).doc(id).delete().catch(() => {});
      // movements + auto-neg batches carry NS in branchId/productId/linked*
      const mv = await data.collection('be_stock_movements').get();
      for (const d of mv.docs) {
        const v = d.data();
        if ([v.branchId, v.productId, v.linkedTreatmentId, v.linkedSaleId, v.batchId, v.customerId]
          .some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {});
      }
      const bz = await data.collection('be_stock_batches').get();
      for (const d of bz.docs) {
        const v = d.data();
        if ([v.branchId, v.productId, v.batchId].some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {});
      }
      let orphans = 0;
      for (const [c, id] of cleanupIds) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }

  console.log(`\n━━━ HUNT R1 concurrency: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
