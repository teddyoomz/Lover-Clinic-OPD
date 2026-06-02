#!/usr/bin/env node
// ─── V147 regression — negative-stock from TFP + from SALE intact + comprehensive ──
//
// User (2026-06-02 EOD+3): "ฟังก์ชั่นที่สต็อคติดลบจาก OPD (TFP) ได้ และ ติดลบ
// จากการขายได้ ยังอยู่ครบใช่มั๊ย? เทสมาแบบให้ครอบคลุมแน่ใจนะ ฟังก์ชั่นนี้สำคัญนะ".
//
// V147 changed the shared engine _deductOneItem (TFP + sale negative both flow
// through it). This proves the negative-stock allowance is FULLY intact + correct
// across the matrix, for BOTH paths, post-V147:
//   N1 single batch over-deduct → negative
//   N2 MULTI-batch: FIFO drains all positives → FIFO-last goes negative
//   N3 ZERO batches → synthetic AUTO-NEG batch created (Fallback C)
//   N4 EXACT-zero: deduct == remaining → 0/depleted, NO false negative/synthetic
//   N5 deduct on an ALREADY-negative batch → goes more negative
// × { TFP (treatment), SALE } = 10 scenarios + conservation + active-visibility.
//
// Rule Q L2 (real client SDK, shipped deductStockForTreatment/Sale, real prod).
// Rule M/R: TEST- fixtures, try/finally cleanup, zero-orphan.
// Run: node scripts/e2e-negative-stock-tfp-sale-comprehensive.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { deductStockForTreatment, deductStockForSale, listStockBatches } from '../src/lib/backendClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-NEG-${Date.now()}-${randomBytes(3).toString('hex')}`;
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

  // deduct dispatcher per path
  const deduct = (pathKind, ref, pid, qty) => {
    const items = [{ productId: pid, name: `${pid}-name`, qty, unit: 'cc' }];
    if (pathKind === 'TFP') return deductStockForTreatment(`${NS}-T-${ref}`, items, { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
    return deductStockForSale(`${NS}-S-${ref}`, items, { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.SALE });
  };
  const mkProduct = (pid) => data.collection('be_products').doc(pid).set({
    productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR,
    stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString(),
  });
  const mkBatch = (bid, pid, remaining, total, ageMs = 0) => data.collection('be_stock_batches').doc(bid).set({
    batchId: bid, productId: pid, productName: `${pid}-name`, branchId: BR, locationId: BR, locationType: 'branch',
    status: BATCH_STATUS.ACTIVE, qty: { total, remaining }, originalCost: 0,
    receivedAt: new Date(Date.now() - ageMs).toISOString(), createdAt: new Date(Date.now() - ageMs).toISOString(),
  });
  const sumRemaining = async (pid) => {
    const snap = await data.collection('be_stock_batches').where('productId', '==', pid).get();
    let s = 0, n = 0; snap.docs.forEach(d => { s += Number(d.data().qty?.remaining) || 0; n++; });
    return { sum: s, count: n };
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'NEG', isDefault: false });
    console.log(`signed in ${STAFF_UID} — negative-stock matrix × {TFP, SALE}\n`);

    for (const KIND of ['TFP', 'SALE']) {
      console.log(`━━━ ${KIND} path ━━━`);

      // N1 — single batch over-deduct → negative
      { const P = `${NS}-${KIND}-N1-P`, B = `${NS}-${KIND}-N1-B`;
        await mkProduct(P); await mkBatch(B, P, 2, 5);
        await deduct(KIND, 'N1', P, 5);
        const b = (await data.collection('be_stock_batches').doc(B).get()).data();
        check(`N1 ${KIND}: single over-deduct 5 from 2 → -3, active`, Number(b.qty.remaining) === -3 && b.status === BATCH_STATUS.ACTIVE, `got ${b.qty.remaining}/${b.status}`);
        const active = await listStockBatches({ branchId: BR, status: BATCH_STATUS.ACTIVE });
        check(`N1 ${KIND}: negative batch VISIBLE in active query`, active.some(x => x.batchId === B && Number(x.qty.remaining) === -3));
      }

      // N2 — MULTI-batch: FIFO drains both positives, FIFO-last goes negative
      { const P = `${NS}-${KIND}-N2-P`, B1 = `${NS}-${KIND}-N2-B1`, B2 = `${NS}-${KIND}-N2-B2`;
        await mkProduct(P);
        await mkBatch(B1, P, 3, 3, 100000); // older
        await mkBatch(B2, P, 4, 4, 0);      // newer
        await deduct(KIND, 'N2', P, 10);    // need 10, have 7 → -3 overage
        const r = await sumRemaining(P);
        check(`N2 ${KIND}: multi-batch total 7 - deduct 10 → Σremaining = -3 (conservation)`, r.sum === -3, `got Σ${r.sum} across ${r.count} batches`);
        // After the drain, V144 auto-clears redundant 0-lots (keeps the
        // negative-carrying lot). Σremaining is the conservation invariant;
        // assert a -3 lot survives + is visible in the active query.
        const activeN2 = await listStockBatches({ branchId: BR, status: BATCH_STATUS.ACTIVE });
        check(`N2 ${KIND}: a -3 lot survives + visible in active (V144 cleared redundant 0-lots; debt intact)`,
          activeN2.some(x => x.productId === P && Number(x.qty.remaining) === -3), `active lots: ${activeN2.filter(x => x.productId === P).map(x => x.qty.remaining)}`);
      }

      // N3 — ZERO batches → synthetic AUTO-NEG batch created (Fallback C)
      { const P = `${NS}-${KIND}-N3-P`;
        await mkProduct(P); // NO batch
        await deduct(KIND, 'N3', P, 4);
        const r = await sumRemaining(P);
        check(`N3 ${KIND}: zero-batch deduct 4 → synthetic AUTO-NEG batch created, Σremaining = -4`, r.sum === -4 && r.count >= 1, `Σ${r.sum} count=${r.count}`);
        const snap = await data.collection('be_stock_batches').where('productId', '==', P).get();
        check(`N3 ${KIND}: synthetic batch flagged autoNegative + active`, snap.docs.some(d => d.data().autoNegative === true && d.data().status === BATCH_STATUS.ACTIVE));
      }

      // N4 — EXACT-zero: deduct == remaining → 0/depleted, NO false negative/synthetic
      { const P = `${NS}-${KIND}-N4-P`, B = `${NS}-${KIND}-N4-B`;
        await mkProduct(P); await mkBatch(B, P, 5, 5);
        await deduct(KIND, 'N4', P, 5);
        const b = (await data.collection('be_stock_batches').doc(B).get()).data();
        const r = await sumRemaining(P);
        check(`N4 ${KIND}: exact deduct 5 from 5 → 0, depleted (no false negative)`, Number(b.qty.remaining) === 0 && b.status === BATCH_STATUS.DEPLETED, `got ${b.qty.remaining}/${b.status}`);
        check(`N4 ${KIND}: NO extra synthetic batch created (exactly 1 batch, Σ=0)`, r.count === 1 && r.sum === 0, `count=${r.count} Σ=${r.sum}`);
      }

      // N5 — deduct on an ALREADY-negative batch → goes more negative
      { const P = `${NS}-${KIND}-N5-P`, B = `${NS}-${KIND}-N5-B`;
        await mkProduct(P); await mkBatch(B, P, -2, 5); // already negative
        await deduct(KIND, 'N5', P, 3);
        const r = await sumRemaining(P);
        check(`N5 ${KIND}: deduct 3 on already -2 → Σremaining = -5 (debt accumulates, never lost)`, r.sum === -5, `Σ${r.sum} count=${r.count}`);
      }
      console.log('');
    }
  } finally {
    console.log('cleanup...');
    try {
      await data.collection('be_branches').doc(BR).delete().catch(() => {});
      for (const coll of ['be_products', 'be_stock_batches', 'be_stock_movements']) {
        const snap = await data.collection(coll).get();
        for (const d of snap.docs) {
          const v = d.data();
          if ([v.branchId, v.productId, v.batchId, v.linkedTreatmentId, v.linkedSaleId, v.customerId]
            .some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {});
        }
      }
      // residual orphan check: any batch/product still NS-prefixed
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

  console.log(`\n━━━ V147 negative-stock comprehensive: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
