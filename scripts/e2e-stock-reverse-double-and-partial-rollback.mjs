#!/usr/bin/env node
// ─── HUNT R16 — reverse conservation: concurrent double-reverse (S5) +
//                multi-item partial-rollback (AUDIT-V34) + negative-debt reverse
//   R16.1 sale: deduct 3 from a 10-lot → concurrent reverseStockForSale ×2 →
//         batch credited EXACTLY once (back to 10, NOT 13); exactly 1 reverse mvt
//   R16.2 treatment: same via reverseStockForTreatment
//   R16.3 partial-rollback: 2-item deduct where item 2 (nonexistent product,
//         treatment fail-loud) THROWS → item 1 must be rolled back (batch restored)
//   R16.4 negative-debt reverse: deduct 5 from an EMPTY product (→ negative
//         carrier -5) → reverse → debt cleared to 0 (NOT over-credited to +5)
// Rule Q L2 (real prod). Rule M/R cleanup. Run: node scripts/e2e-stock-reverse-double-and-partial-rollback.mjs
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken } from 'firebase/auth';
import { auth as clientAuth } from '../src/firebase.js';
import { createStockOrder, deductStockForSale, deductStockForTreatment, reverseStockForSale, reverseStockForTreatment, listStockMovements } from '../src/lib/backendClient.js';
import { BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-REV16-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const reverseMvtsFor = async (key, val) => (await listStockMovements({ [key]: val, includeReversed: true })).filter(m => m.reverseOf);

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'REV16', isDefault: false });
    console.log(`signed in ${STAFF_UID} — reverse double + partial-rollback + neg-debt\n`);

    // R16.1 — concurrent double-reverse of a SALE → credited exactly once
    console.log('R16.1 — deduct 3 from a 10-lot, then reverseStockForSale ×2 CONCURRENT');
    { const P = `${NS}-S-P`; await mkProduct(P);
      const ord = await createStockOrder({ branchId: BR, items: [{ productId: P, productName: `${P}-name`, qty: 10, cost: 5, unit: 'cc' }] });
      cleanup.push(['be_stock_orders', ord.orderId]);
      const saleId = `TEST-SALE-${NS}-1`;
      await deductStockForSale(saleId, [{ productId: P, productName: `${P}-name`, qty: 3, unit: 'cc' }], { branchId: BR });
      const afterDeduct = sumRemaining(await lots(P));
      check('R16.1.0 deduct 3 → remaining 7', afterDeduct === 7, `rem=${afterDeduct}`);
      // fire two reverses for the SAME sale concurrently
      const [a, b] = await Promise.allSettled([
        reverseStockForSale(saleId, { user: { userId: STAFF_UID, userName: 'A' } }),
        reverseStockForSale(saleId, { user: { userId: STAFF_UID, userName: 'B' } }),
      ]);
      check('R16.1.1 both reverse calls resolved (no throw)', a.status === 'fulfilled' && b.status === 'fulfilled', `${a.status}/${b.status}`);
      const afterRev = sumRemaining(await lots(P));
      check('R16.1.2 batch credited EXACTLY once (remaining 10, NOT 13)', afterRev === 10, `rem=${afterRev}`);
      const revs = await reverseMvtsFor('linkedSaleId', saleId);
      check('R16.1.3 exactly ONE reverse movement written (no double-credit ledger)', revs.length === 1, `reverseMvts=${revs.length}`);
    }

    // R16.2 — concurrent double-reverse of a TREATMENT
    console.log('\nR16.2 — deduct 4 from a 10-lot, then reverseStockForTreatment ×2 CONCURRENT');
    { const P = `${NS}-T-P`; await mkProduct(P);
      const ord = await createStockOrder({ branchId: BR, items: [{ productId: P, productName: `${P}-name`, qty: 10, cost: 5, unit: 'cc' }] });
      cleanup.push(['be_stock_orders', ord.orderId]);
      const tId = `TEST-APPT-${NS}-T`;
      await deductStockForTreatment(tId, [{ productId: P, productName: `${P}-name`, qty: 4, unit: 'cc' }], { branchId: BR });
      check('R16.2.0 deduct 4 → remaining 6', sumRemaining(await lots(P)) === 6);
      const [a, b] = await Promise.allSettled([
        reverseStockForTreatment(tId, { user: { userId: STAFF_UID, userName: 'A' } }),
        reverseStockForTreatment(tId, { user: { userId: STAFF_UID, userName: 'B' } }),
      ]);
      check('R16.2.1 both resolved', a.status === 'fulfilled' && b.status === 'fulfilled', `${a.status}/${b.status}`);
      const afterRev = sumRemaining(await lots(P));
      check('R16.2.2 credited exactly once (remaining 10, NOT 14)', afterRev === 10, `rem=${afterRev}`);
      const revs = await reverseMvtsFor('linkedTreatmentId', tId);
      check('R16.2.3 exactly ONE reverse movement', revs.length === 1, `reverseMvts=${revs.length}`);
    }

    // R16.3 — V36-bis intent: a genuinely-nonexistent product is SILENTLY
    // SKIPPED (NOT fail-loud — V36 throw was reverted per user directive
    // "ห้ามพลาดแบบนี้อีก"), the real item still deducts, no orphan be_products
    // doc / no phantom batch is created, and a diagnostic SKIP movement records it.
    console.log('\nR16.3 — 2-item treatment deduct, item 2 = NONEXISTENT product → silent-skip (V36-bis), item 1 still deducts');
    { const P1 = `${NS}-PR-P1`; await mkProduct(P1);
      const ord = await createStockOrder({ branchId: BR, items: [{ productId: P1, productName: `${P1}-name`, qty: 10, cost: 5, unit: 'cc' }] });
      cleanup.push(['be_stock_orders', ord.orderId]);
      const GHOST = `${NS}-PR-GHOST`; // never created in be_products
      const tId = `TEST-APPT-${NS}-PR`;
      let threw = false; let res = null;
      try {
        res = await deductStockForTreatment(tId, [
          { productId: P1, productName: `${P1}-name`, qty: 3, unit: 'cc' },
          { productId: GHOST, productName: `${GHOST}-name`, qty: 2, unit: 'cc' },
        ], { branchId: BR });
      } catch { threw = true; }
      check('R16.3.1 deduct did NOT throw — nonexistent product silently skipped (V36-bis)', !threw, 'V36-bis reverted fail-loud');
      const rem1 = sumRemaining(await lots(P1));
      check('R16.3.2 real item P1 still deducted (remaining 7) — skip of ghost did NOT corrupt the real deduction', rem1 === 7, `rem=${rem1}`);
      check('R16.3.3 ghost product created NO batch (no phantom stock)', (await lots(GHOST)).length === 0);
      const ghostDoc = await data.collection('be_products').doc(GHOST).get();
      check('R16.3.4 NO orphan be_products doc created for ghost (_ensureProductTracked returns null before setDoc)', !ghostDoc.exists, 'orphan be_products doc');
      check('R16.3.5 ghost recorded as a skipped item (diagnostic, not silent loss)', Array.isArray(res?.skippedItems) && res.skippedItems.some(s => String(s.productId) === GHOST), `skipped=${JSON.stringify(res?.skippedItems?.map(s => s.productId))}`);
    }

    // R16.4 — negative-debt reverse (deduct into negative → reverse → back to 0)
    console.log('\nR16.4 — deduct 5 from an EMPTY product (→ negative -5) → reverse → debt cleared to 0');
    { const P = `${NS}-NEG-P`; await mkProduct(P); // tracked, but NO stock imported
      const saleId = `TEST-SALE-${NS}-NEG`;
      await deductStockForSale(saleId, [{ productId: P, productName: `${P}-name`, qty: 5, unit: 'cc' }], { branchId: BR });
      const negRem = sumRemaining(await lots(P));
      check('R16.4.0 deduct-into-empty created negative carrier (remaining -5)', negRem === -5, `rem=${negRem}`);
      await reverseStockForSale(saleId, { user: { userId: STAFF_UID, userName: 'A' } });
      const afterRev = sumRemaining(await lots(P));
      check('R16.4.1 reverse cleared the debt to 0 (NOT over-credited to +5)', afterRev === 0, `rem=${afterRev}`);
      // re-reverse is idempotent — no further change
      await reverseStockForSale(saleId, { user: { userId: STAFF_UID, userName: 'A2' } });
      check('R16.4.2 second reverse idempotent (still 0)', sumRemaining(await lots(P)) === 0, `rem=${sumRemaining(await lots(P))}`);
    }

    console.log('\n──────── cleanup ────────');
    // delete every batch + movement created under NS, then fixtures
    for (const pidSuffix of ['S-P', 'T-P', 'PR-P1', 'PR-GHOST', 'NEG-P']) {
      const pid = `${NS}-${pidSuffix}`;
      for (const b of await lots(pid)) { await data.collection('be_stock_batches').doc(b.batchId).delete().catch(() => {}); }
    }
    const allMvts = await data.collection('be_stock_movements').get();
    let mvtDel = 0;
    for (const d of allMvts.docs) { const m = d.data(); if (String(m.batchId || '').includes(NS) || String(m.productId || '').includes(NS) || String(m.linkedSaleId || '').includes(NS) || String(m.linkedTreatmentId || '').includes(NS)) { await d.ref.delete().catch(() => {}); mvtDel++; } }
    for (const [coll, id] of cleanup) { await data.collection(coll).doc(id).delete().catch(() => {}); }
    // verify zero orphans
    let orphan = 0;
    for (const pidSuffix of ['S-P', 'T-P', 'PR-P1', 'PR-GHOST', 'NEG-P']) orphan += (await lots(`${NS}-${pidSuffix}`)).length;
    check('CLEANUP zero orphan batches', orphan === 0, `orphan=${orphan}`);
    console.log(`  (deleted ${mvtDel} movements)`);
  } finally {
    console.log(`\n════════ ${pass} passed / ${fail} failed ════════`);
    if (fails.length) console.log('FAILED:', fails.join(', '));
    process.exit(fail ? 1 : 0);
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
