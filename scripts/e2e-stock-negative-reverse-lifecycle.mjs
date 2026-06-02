#!/usr/bin/env node
// ─── HUNT R9 — reversal of negative-overage + buffet stock decrement ─────────
//
// Loop continuation (post-V147..V150 deploy). Novel angles never tested:
//   N1 — cancel a SALE that pushed a batch NEGATIVE (positive + negativeOverage
//        movements) → reverseStockForSale must restore EXACTLY (reverseQtyNumeric
//        caps at total — does it mis-restore a negative-overage?).
//   N2 — cancel a TREATMENT whose deduct created a SYNTHETIC AUTO-NEG (total:0)
//        → reverse must bring the synthetic back to 0 (cap-at-0 edge).
//   N3 — full lifecycle: deduct→negative→reverse→re-deduct → conservation.
//   N4 — BUFFET course (courseType='บุฟเฟต์'): deductCourseItems must NO-OP the
//        course qty (stays active forever) WHILE stock still decrements per use
//        (the V13 buffet-class bug area).
// INVARIANT: conservation — Σ(signed movement deltas) == batch Σremaining delta.
//
// Rule Q L2 (real prod, shipped fns). Rule M/R cleanup.
// Run: node scripts/e2e-stock-negative-reverse-lifecycle.mjs
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
  deductStockForSale, deductStockForTreatment,
  reverseStockForSale, reverseStockForTreatment, deductCourseItems,
} from '../src/lib/backendClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';
import { parseQtyString } from '../src/lib/courseUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-NRV-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const deltaSum = async (pid) => {
    const s = await data.collection('be_stock_movements').where('productId', '==', pid).get();
    let d = 0; s.docs.forEach(x => { const q = x.data().qty; if (typeof q === 'number') d += q; });
    return d;
  };
  const mkProduct = (pid) => { cleanup.push(['be_products', pid]); return data.collection('be_products').doc(pid).set({
    productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR,
    stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString(),
  }); };
  const mkBatch = (bid, pid, remaining, total) => { cleanup.push(['be_stock_batches', bid]); return data.collection('be_stock_batches').doc(bid).set({
    batchId: bid, productId: pid, productName: `${pid}-name`, branchId: BR, locationId: BR, locationType: 'branch',
    status: BATCH_STATUS.ACTIVE, qty: { total, remaining }, originalCost: 0,
    receivedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  }); };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'NRV', isDefault: false });
    console.log(`signed in ${STAFF_UID} — negative-reverse lifecycle + buffet\n`);

    // N1 — cancel a SALE that pushed a real batch negative (positive + overage)
    console.log('N1 — sale deduct 5 from 2/5 batch → -3 (2 pos + 3 overage); cancel → restore to 2');
    { const P = `${NS}-N1-P`, B = `${NS}-N1-B`, S = `${NS}-N1-S`;
      await mkProduct(P); await mkBatch(B, P, 2, 5);
      await deductStockForSale(S, [{ productId: P, name: `${P}-name`, qty: 5, unit: 'cc' }], { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.SALE });
      const afterDeduct = (await sumRemaining(P)).sum;
      check('N1.1 sale pushed batch to -3', afterDeduct === -3, `got ${afterDeduct}`);
      await reverseStockForSale(S);
      const r = await sumRemaining(P); const d = await deltaSum(P);
      check('N1.2 cancel restored batch to EXACTLY 2 (negative-overage reversed correctly)', r.sum === 2, `got ${r.sum}`);
      check('N1.3 conservation: Σmovements == 0 (deduct + full reverse net zero)', d === 0, `Σdelta=${d}`);
    }

    // N2 — cancel a TREATMENT whose deduct made a SYNTHETIC AUTO-NEG (total:0)
    console.log('\nN2 — treatment deduct 4 with ZERO batches → synthetic AUTO-NEG -4; cancel → restore to 0');
    { const P = `${NS}-N2-P`, T = `${NS}-N2-T`;
      await mkProduct(P); // no batch
      await deductStockForTreatment(T, [{ productId: P, name: `${P}-name`, qty: 4, unit: 'cc' }], { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      const afterDeduct = (await sumRemaining(P)).sum;
      check('N2.1 synthetic AUTO-NEG created at -4', afterDeduct === -4, `got ${afterDeduct}`);
      await reverseStockForTreatment(T);
      const r = await sumRemaining(P); const d = await deltaSum(P);
      check('N2.2 cancel restored synthetic to 0 (cap-at-total=0 edge handled)', r.sum === 0, `got ${r.sum}`);
      check('N2.3 conservation: Σmovements == 0', d === 0, `Σdelta=${d}`);
    }

    // N3 — full lifecycle: deduct → negative → reverse → re-deduct
    console.log('\nN3 — lifecycle: 5/5 → deduct 8 (-3) → reverse (5) → re-deduct 3 (2)');
    { const P = `${NS}-N3-P`, B = `${NS}-N3-B`, T1 = `${NS}-N3-T1`, T2 = `${NS}-N3-T2`;
      await mkProduct(P); await mkBatch(B, P, 5, 5);
      await deductStockForTreatment(T1, [{ productId: P, name: `${P}-name`, qty: 8, unit: 'cc' }], { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      check('N3.1 deduct 8 from 5 → -3', (await sumRemaining(P)).sum === -3, `got ${(await sumRemaining(P)).sum}`);
      await reverseStockForTreatment(T1);
      check('N3.2 reverse → 5', (await sumRemaining(P)).sum === 5, `got ${(await sumRemaining(P)).sum}`);
      await deductStockForTreatment(T2, [{ productId: P, name: `${P}-name`, qty: 3, unit: 'cc' }], { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      check('N3.3 re-deduct 3 → 2 (lifecycle conservation)', (await sumRemaining(P)).sum === 2, `got ${(await sumRemaining(P)).sum}`);
    }

    // N4 — BUFFET course: course qty NO-OP (stays active), stock decrements per use
    console.log('\nN4 — buffet course: 3 uses → course qty UNCHANGED (active) + stock -3 (V13 area)');
    { const P = `${NS}-N4-P`, B = `${NS}-N4-B`, CUST = `${NS}-N4-CUST`;
      await mkProduct(P); await mkBatch(B, P, 10, 10);
      cleanup.push(['be_customers', CUST]);
      await data.collection('be_customers').doc(CUST).set({
        customerId: CUST, fullName: 'N4', branchId: BR,
        courses: [{ name: 'BuffetCourse', product: `${P}-name`, productId: P, qty: '1 / 1 ครั้ง', courseType: 'บุฟเฟต์' }],
        createdAt: new Date().toISOString(),
      });
      for (let i = 0; i < 3; i++) {
        await deductCourseItems(CUST, [{ courseIndex: 0, courseName: 'BuffetCourse', productName: `${P}-name`, deductQty: 1 }]);
        await deductStockForTreatment(`${NS}-N4-T${i}`, [{ productId: P, name: `${P}-name`, qty: 1, unit: 'cc' }], { customerId: CUST, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
      }
      const cust = (await data.collection('be_customers').doc(CUST).get()).data();
      const courseQty = parseQtyString(cust.courses[0].qty);
      check('N4.1 buffet course qty UNCHANGED after 3 uses (still 1/1, never decremented → stays active)', courseQty.remaining === 1 && courseQty.total === 1, `got ${cust.courses[0].qty}`);
      check('N4.2 buffet course still active (not moved to history)', cust.courses[0].courseType === 'บุฟเฟต์' && (cust.courses[0].status || 'กำลังใช้งาน') !== 'ใช้หมดแล้ว', `status=${cust.courses[0].status}`);
      check('N4.3 stock decremented 3× independently (10 → 7)', (await sumRemaining(P)).sum === 7, `got ${(await sumRemaining(P)).sum}`);
    }
  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanup) await data.collection(c).doc(id).delete().catch(() => {});
      for (const coll of ['be_stock_movements', 'be_stock_batches', 'be_course_changes']) {
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
  console.log(`\n━━━ HUNT R9 negative-reverse + buffet: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
