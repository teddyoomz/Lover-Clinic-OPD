#!/usr/bin/env node
// ─── V138 TRUE-L2 e2e — negative-batch status invariant, every direction ─────
//
// User (2026-05-31): "สต็อคติดลบได้แค่จาก TFP + การขาย; ที่เหลือกันติดลบ; บวก
// สต็อคติดลบทีละนิดได้โดยไม่หาย; เขียนเทสให้ครอบคลุมและครบทุกประเภท เพราะเป็น
// ระบบที่แบกรับข้อมูลสินค้าที่มีมูลค่าสูงมากๆ".
//
// Rule Q V66 / Rule I item (b) [NON-NEGOTIABLE for stock]: calls the SHIPPED
// client functions (createStockAdjustment / deductStockForTreatment /
// deductStockForSale from src/lib/backendClient.js) against REAL prod Firestore,
// authed as admin via custom token, then READS the batch doc back + asserts
// qty.remaining + status + visibility through the EXACT StockBalancePanel query
// (listStockBatches({branchId, status:'active'})). Proves the fix on real data.
//
// DIRECTIONS covered (the paths the fix touches):
//   D1  ADJUST_ADD on a NEGATIVE batch → stays status='active' + VISIBLE (THE bug);
//       partial increments (-13→-12→…); to-exactly-0 → depleted; over → positive.
//   D2  ADJUST_REDUCE cannot drive negative → throws (anti-negative).
//   D3  TFP treatment deduct may push negative → batch stays active.
//   D4  sale deduct may push negative → batch stays active.
// (transfer/withdrawal export-block + import/transfer-in/withdrawal-in repay are
//  covered by pure tests N6-N8 + scripts/e2e (phase15.7-bis) — same deductQtyNumeric
//  guard primitive exercised here by D2.)
//
// Compliance: Rule R (env-pull) + Rule M (TEST- prefixed fixtures only, try/finally
// cleanup + zero-orphan + custom-token user deleted). V33.11 stock prefixes.
//
// Run: node scripts/e2e-negative-batch-directions.mjs
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
  createStockAdjustment,
  deductStockForTreatment,
  deductStockForSale,
  listStockBatches,
} from '../src/lib/backendClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-V138-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); }
}
async function throws(fn) { try { await fn(); return false; } catch { return true; } }

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
  const P_NEG = `${NS}-P-NEG`, P_RED = `${NS}-P-RED`, P_TFP = `${NS}-P-TFP`, P_SALE = `${NS}-P-SALE`;
  const B_NEG = `${NS}-B-NEG`, B_RED = `${NS}-B-RED`, B_TFP = `${NS}-B-TFP`, B_SALE = `${NS}-B-SALE`;
  const cleanupIds = [
    ['be_branches', BR],
    ['be_products', P_NEG], ['be_products', P_RED], ['be_products', P_TFP], ['be_products', P_SALE],
    ['be_stock_batches', B_NEG], ['be_stock_batches', B_RED], ['be_stock_batches', B_TFP], ['be_stock_batches', B_SALE],
  ];

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in as ${STAFF_UID} (admin) — calling SHIPPED client fns\n`);

    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'V138', isDefault: false });
    const mkProduct = (pid) => data.collection('be_products').doc(pid).set({
      productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR,
      stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString(),
    });
    await Promise.all([P_NEG, P_RED, P_TFP, P_SALE].map(mkProduct));
    const mkBatch = (bid, pid, remaining, total) => data.collection('be_stock_batches').doc(bid).set({
      batchId: bid, productId: pid, productName: `${pid}-name`, branchId: BR, locationId: BR, locationType: 'branch',
      status: BATCH_STATUS.ACTIVE, qty: { total, remaining }, originalCost: 0,
      receivedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    });
    await mkBatch(B_NEG, P_NEG, -13, 0);  // the user's E.P.T.Q S500 shape: active debt -13
    await mkBatch(B_RED, P_RED, 3, 10);   // positive — for reduce-block test
    await mkBatch(B_TFP, P_TFP, 2, 5);    // positive 2 — TFP will deduct 5 (push -3)
    await mkBatch(B_SALE, P_SALE, 2, 5);  // positive 2 — sale will deduct 5 (push -3)
    console.log('fixtures created.\n');

    // ── D1 — ADJUST_ADD on the NEGATIVE batch (the bug + บวกทีละนิด) ─────────
    console.log("D1 — ปรับเพิ่ม (ADJUST_ADD) on a -13 batch");
    await createStockAdjustment({ batchId: B_NEG, type: 'add', qty: 1, branchId: BR, note: 'V138 partial repay +1' });
    let neg = await readBatch(adb, B_NEG);
    check('D1.1 remaining -13 → -12 (partial add)', Number(neg.qty.remaining) === -12, `got ${neg.qty.remaining}`);
    check('D1.2 status STAYS active (was wrongly depleted → vanished)', neg.status === BATCH_STATUS.ACTIVE, `got ${neg.status}`);
    // The decisive proof: the EXACT query StockBalancePanel uses still returns it.
    let active = await listStockBatches({ branchId: BR, status: BATCH_STATUS.ACTIVE });
    check('D1.3 VISIBLE in listStockBatches({status:active}) — no longer vanishes from ยอดคงเหลือ',
      active.some(b => b.batchId === B_NEG && Number(b.qty.remaining) === -12));
    // partial chain to exactly 0 → depleted
    await createStockAdjustment({ batchId: B_NEG, type: 'add', qty: 12, branchId: BR, note: 'V138 clear to 0' });
    neg = await readBatch(adb, B_NEG);
    check('D1.4 -12 + 12 = 0 → status depleted (exactly zero)', Number(neg.qty.remaining) === 0 && neg.status === BATCH_STATUS.DEPLETED, `got ${neg.qty.remaining}/${neg.status}`);
    // over-add from 0 → positive active
    await createStockAdjustment({ batchId: B_NEG, type: 'add', qty: 5, branchId: BR, note: 'V138 new positive' });
    neg = await readBatch(adb, B_NEG);
    check('D1.5 0 + 5 = +5 → active', Number(neg.qty.remaining) === 5 && neg.status === BATCH_STATUS.ACTIVE, `got ${neg.qty.remaining}/${neg.status}`);

    // ── D2 — ADJUST_REDUCE cannot drive negative (anti-negative) ────────────
    console.log('D2 — ปรับลด (ADJUST_REDUCE) more than remaining must THROW');
    check('D2.1 reduce 5 from a 3-remaining batch THROWS (cannot go negative)',
      await throws(() => createStockAdjustment({ batchId: B_RED, type: 'reduce', qty: 5, branchId: BR })));
    const red = await readBatch(adb, B_RED);
    check('D2.2 reduce-block left the batch UNCHANGED (3, active)', Number(red.qty.remaining) === 3 && red.status === BATCH_STATUS.ACTIVE, `got ${red.qty.remaining}/${red.status}`);

    // ── D3 — TFP treatment deduct MAY push negative (allowed) ───────────────
    console.log('D3 — ตัดจาก TFP (treatment) เกินคงเหลือ → ติดลบได้ (active)');
    await deductStockForTreatment(`${NS}-T`, [{ productId: P_TFP, name: `${P_TFP}-name`, qty: 5, unit: 'cc' }],
      { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });
    const tfp = await readBatch(adb, B_TFP);
    check('D3.1 deduct 5 from remaining 2 → -3 (negative push allowed for TFP)', Number(tfp.qty.remaining) === -3, `got ${tfp.qty.remaining}`);
    check('D3.2 negative TFP batch stays active (visible debt)', tfp.status === BATCH_STATUS.ACTIVE, `got ${tfp.status}`);
    active = await listStockBatches({ branchId: BR, status: BATCH_STATUS.ACTIVE });
    check('D3.3 TFP negative batch VISIBLE in active query', active.some(b => b.batchId === B_TFP && Number(b.qty.remaining) === -3));

    // ── D4 — sale deduct MAY push negative (allowed — การขาย) ───────────────
    console.log('D4 — ตัดจากการขาย (sale) เกินคงเหลือ → ติดลบได้ (active)');
    await deductStockForSale(`${NS}-S`, [{ productId: P_SALE, name: `${P_SALE}-name`, qty: 5, unit: 'cc' }],
      { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.SALE });
    const sale = await readBatch(adb, B_SALE);
    check('D4.1 sale deduct 5 from remaining 2 → -3 (negative push allowed for sale)', Number(sale.qty.remaining) === -3, `got ${sale.qty.remaining}`);
    check('D4.2 negative sale batch stays active (visible debt)', sale.status === BATCH_STATUS.ACTIVE, `got ${sale.status}`);
  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanupIds) await data.collection(c).doc(id).delete().catch(() => {});
      // movements created by deduct/adjust carry NS in linkedTreatmentId/linkedSaleId/branchId
      const mv = await data.collection('be_stock_movements').get();
      for (const d of mv.docs) {
        const v = d.data();
        if (String(v.branchId || '').startsWith(NS) || String(v.linkedTreatmentId || '').startsWith(NS) ||
            String(v.linkedSaleId || '').startsWith(NS) || String(v.linkedAdjustId || '').startsWith(NS) ||
            String(v.batchId || '').startsWith(NS)) await d.ref.delete().catch(() => {});
      }
      // adjustment docs
      const adj = await data.collection('be_stock_adjustments').get();
      for (const d of adj.docs) { if (String(d.data().batchId || '').startsWith(NS)) await d.ref.delete().catch(() => {}); }
      let orphans = 0;
      for (const [c, id] of cleanupIds) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }

  console.log(`\n━━━ V138 e2e: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
