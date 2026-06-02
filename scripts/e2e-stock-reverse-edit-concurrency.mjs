#!/usr/bin/env node
// ─── HUNT R2 — reverse/cancel concurrency + edit-resave stock symmetry ───────
//
// User (2026-06-02): loop the stock hunt; "รวมเทสการตัดสต็อคมาจาก TFP หรือ การขาย
// ว่ายังทำได้สมบูรณ์แบบ 100% ตามจุดประสงค์".
//
// Targets two NOT-COVERED gaps (Agent coverage map):
//   RV — CONCURRENT double-cancel (double-click "ยกเลิก" / two staff) must
//        return stock EXACTLY ONCE (no double-credit). Verifies the S5 in-tx
//        re-check holds under REAL concurrency — sale AND treatment.
//   ED — EDIT-RESAVE stock symmetry: reverse old deduction + re-deduct new qty
//        = correct NET stock (the TFP edit-qty lifecycle), incl. edit that
//        pushes negative + re-cancel after edit (reverses only current).
//
// Rule Q L2 (real prod, shipped fns). Rule M/R cleanup. Also a post-V147
// regression: reverse + re-deduct exercise the changed _deductOneItem.
// Run: node scripts/e2e-stock-reverse-edit-concurrency.mjs
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
  reverseStockForTreatment, reverseStockForSale,
} from '../src/lib/backendClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-REV-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const readBatch = async (id) => (await data.collection('be_stock_batches').doc(id).get()).data();
  const mvForProduct = async (pid) => {
    const snap = await data.collection('be_stock_movements').where('productId', '==', pid).get();
    return snap.docs.map(d => d.data());
  };
  const mkProduct = (pid) => data.collection('be_products').doc(pid).set({
    productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR,
    stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString(),
  });
  const mkBatch = (bid, pid, remaining, total) => data.collection('be_stock_batches').doc(bid).set({
    batchId: bid, productId: pid, productName: `${pid}-name`, branchId: BR, locationId: BR, locationType: 'branch',
    status: BATCH_STATUS.ACTIVE, qty: { total, remaining }, originalCost: 0,
    receivedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  });

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'REV', isDefault: false });
    console.log(`signed in ${STAFF_UID}\n`);

    const ROUNDS = 4;

    // ── RV1 — concurrent double-cancel of a SALE → return stock ONCE ─────────
    console.log('RV1 — CONCURRENT double-reverseStockForSale (double-click ยกเลิก)');
    let rv1DoubleCredit = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const P = `${NS}-RV1-P-${r}`, B = `${NS}-RV1-B-${r}`, S = `${NS}-RV1-S-${r}`;
      await mkProduct(P); await mkBatch(B, P, 10, 10);
      await deductStockForSale(S, [{ productId: P, name: `${P}-name`, qty: 7, unit: 'cc' }],
        { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.SALE });
      await Promise.allSettled([reverseStockForSale(S), reverseStockForSale(S)]);
      const b = await readBatch(B);
      const mv = await mvForProduct(P);
      const reverseMovements = mv.filter(m => m.reverseOf || (m.qty > 0 && /reversal/.test(m.note || ''))).length;
      const rem = Number(b?.qty?.remaining);
      const ok = rem === 10 && reverseMovements === 1;
      if (!ok) rv1DoubleCredit++;
      console.log(`  round ${r}: remaining=${rem} (want 10) reverseMovements=${reverseMovements} (want 1)`);
    }
    check('RV1 — concurrent double-cancel SALE returns stock EXACTLY once (no double-credit)', rv1DoubleCredit === 0, `${rv1DoubleCredit}/${ROUNDS} rounds double-credited`);

    // ── RV2 — concurrent double-cancel of a TREATMENT → return stock ONCE ────
    console.log('\nRV2 — CONCURRENT double-reverseStockForTreatment');
    let rv2DoubleCredit = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const P = `${NS}-RV2-P-${r}`, B = `${NS}-RV2-B-${r}`, T = `${NS}-RV2-T-${r}`;
      await mkProduct(P); await mkBatch(B, P, 10, 10);
      await deductStockForTreatment(T, [{ productId: P, name: `${P}-name`, qty: 7, unit: 'cc' }],
        { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      await Promise.allSettled([reverseStockForTreatment(T), reverseStockForTreatment(T)]);
      const b = await readBatch(B);
      const mv = await mvForProduct(P);
      const reverseMovements = mv.filter(m => m.reverseOf || (m.qty > 0 && /reversal/.test(m.note || ''))).length;
      const rem = Number(b?.qty?.remaining);
      const ok = rem === 10 && reverseMovements === 1;
      if (!ok) rv2DoubleCredit++;
      console.log(`  round ${r}: remaining=${rem} (want 10) reverseMovements=${reverseMovements} (want 1)`);
    }
    check('RV2 — concurrent double-cancel TREATMENT returns stock EXACTLY once (no double-credit)', rv2DoubleCredit === 0, `${rv2DoubleCredit}/${ROUNDS} rounds double-credited`);

    // ── ED1 — edit-resave stock symmetry: reverse old + re-deduct new = NET ──
    console.log('\nED1 — TFP edit-qty: deduct 10 → reverse → re-deduct 3 (same treatmentId)');
    { const P = `${NS}-ED1-P`, B = `${NS}-ED1-B`, T = `${NS}-ED1-T`;
      await mkProduct(P); await mkBatch(B, P, 20, 20);
      await deductStockForTreatment(T, [{ productId: P, name: `${P}-name`, qty: 10, unit: 'cc' }],
        { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      check('ED1.1 after deduct 10 → remaining 10', Number((await readBatch(B)).qty.remaining) === 10, `got ${(await readBatch(B)).qty.remaining}`);
      await reverseStockForTreatment(T); // edit: reverse old
      check('ED1.2 after reverse → remaining 20 (fully restored)', Number((await readBatch(B)).qty.remaining) === 20, `got ${(await readBatch(B)).qty.remaining}`);
      await deductStockForTreatment(T, [{ productId: P, name: `${P}-name`, qty: 3, unit: 'cc' }],
        { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      check('ED1.3 after re-deduct 3 → remaining 17 (NET edit 10→3 correct, no double-count)', Number((await readBatch(B)).qty.remaining) === 17, `got ${(await readBatch(B)).qty.remaining}`);
      // ED1b — re-cancel after edit reverses ONLY the current (3), not the already-reversed 10
      await reverseStockForTreatment(T);
      check('ED1b re-cancel after edit → remaining 20 (reverses only the live -3, old -10 already reversed)', Number((await readBatch(B)).qty.remaining) === 20, `got ${(await readBatch(B)).qty.remaining}`);
    }

    // ── ED2 — edit INCREASES qty beyond stock → negative (purpose preserved) ─
    console.log('\nED2 — TFP edit-qty increases beyond stock: deduct 5 → reverse → re-deduct 8 → -3');
    { const P = `${NS}-ED2-P`, B = `${NS}-ED2-B`, T = `${NS}-ED2-T`;
      await mkProduct(P); await mkBatch(B, P, 5, 5);
      await deductStockForTreatment(T, [{ productId: P, name: `${P}-name`, qty: 5, unit: 'cc' }],
        { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      await reverseStockForTreatment(T); // → back to 5
      await deductStockForTreatment(T, [{ productId: P, name: `${P}-name`, qty: 8, unit: 'cc' }],
        { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      const b = await readBatch(B);
      check('ED2.1 edit 5→8 (beyond stock 5) → remaining -3, active (negative purpose preserved)', Number(b.qty.remaining) === -3 && b.status === BATCH_STATUS.ACTIVE, `got ${b.qty.remaining}/${b.status}`);
    }
  } finally {
    console.log('\ncleanup...');
    try {
      await data.collection('be_branches').doc(BR).delete().catch(() => {});
      for (const coll of ['be_products', 'be_stock_batches', 'be_stock_movements']) {
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

  console.log(`\n━━━ HUNT R2 reverse/edit: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
