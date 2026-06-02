#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R19 — the CAPSTONE: stock+deposit+wallet+points+course in ONE
// sale, the full cancel cascade, delete-idempotent, AND a CONCURRENT double-cancel.
//
// Nothing has e2e'd all 4 systems (TFP/Stock/Sales/Finance) TOGETHER through a
// real cancel. One sale moves: stock (deductStockForSale) + deposit
// (applyDepositToSale) + wallet (deductWallet) + points (earnPoints) + course
// (active). Then:
//   APPLY    → every channel reflects the sale
//   CANCEL   → the full cascade (reverseStock + reverseDeposit + refundWallet +
//              reversePoints + applySaleCancelToCourses) conserves ALL FIVE to baseline
//   DELETE   → re-run the whole cascade → NO channel double-applies (idempotent)
//   CONCURRENT double-cancel → 2 full cascades at once → each channel reverses ONCE
//              (stock S5 CAS · deposit M1 usageHistory · wallet+points V158 marker ·
//               course terminal-skip — the WHOLE integration is concurrency-safe).
// Rule Q L2 (real prod). Rule M/R: TEST- namespace + cleanup.
// Run: node scripts/e2e-r19-four-system-cancel-cascade.mjs
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
  deductStockForSale, reverseStockForSale,
  applyDepositToSale, reverseDepositUsage,
  deductWallet, refundToWallet,
  earnPoints, reversePointsEarned,
  applySaleCancelToCourses,
} from '../src/lib/backendClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';
import { parseQtyString } from '../src/lib/courseUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-R19-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
const BR = `${NS}-BR`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); } }
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[line.slice(0, eq).trim()] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const C = `${NS}-cust`, W = `${NS}-wt`, D = `${NS}-dep`, SID = `${NS}-sale`, P = `${NS}-prod`, B = `${NS}-batch`;
  const dep = async () => (await data.collection('be_deposits').doc(D).get()).data();
  const wal = async () => Number((await data.collection('be_customer_wallets').doc(`${C}__${W}`).get()).data().balance) || 0;
  const cust = async () => (await data.collection('be_customers').doc(C).get()).data();
  const pts = async () => Number((await cust()).finance?.loyaltyPoints) || 0;
  const courseStatus = async () => { const c = (await cust()).courses || []; const m = c.find(x => String(x.linkedSaleId) === SID); return m ? m.status : '(missing)'; };
  const stockRemaining = async () => {
    const snap = await data.collection('be_stock_batches').where('productId', '==', P).get();
    let r = 0; for (const d of snap.docs) r += Number(d.data().qty?.remaining) || 0; return r;
  };
  const cnt = async (col, type) => (await data.collection(col).where('referenceId', '==', SID).where('type', '==', type).get()).size;

  const seedAll = async () => {
    await data.collection('be_customers').doc(C).set({ customerId: C, fullName: 'R19', branchId: BR, finance: { loyaltyPoints: 200 }, courses: [{ name: 'R19Course', product: 'R19Product', qty: '5 / 5 ครั้ง', courseType: 'ปกติ', status: 'active', linkedSaleId: SID, products: [{ name: 'R19Product', qty: '5', remaining: '5' }] }], createdAt: new Date().toISOString() });
    await data.collection('be_customer_wallets').doc(`${C}__${W}`).set({ customerId: C, walletTypeId: W, walletTypeName: 'R19', balance: 1000, totalUsed: 0, createdAt: new Date().toISOString() });
    await data.collection('be_deposits').doc(D).set({ depositId: D, customerId: C, branchId: BR, amount: 1000, usedAmount: 0, remainingAmount: 1000, refundAmount: 0, status: 'active', usageHistory: [], createdAt: new Date().toISOString() });
    await data.collection('be_sales').doc(SID).set({ saleId: SID, customerId: C, branchId: BR, status: 'active', createdAt: new Date().toISOString() });
    await data.collection('be_products').doc(P).set({ productId: P, productName: 'R19Product', productType: 'สินค้าหน้าร้าน', branchId: BR, stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString() });
    await data.collection('be_stock_batches').doc(B).set({ batchId: B, productId: P, productName: 'R19Product', branchId: BR, locationId: BR, locationType: 'branch', status: BATCH_STATUS.ACTIVE, qty: { total: 10, remaining: 10 }, originalCost: 0, createdAt: new Date().toISOString() });
  };
  const applySale = async () => {
    await deductStockForSale(SID, [{ productId: P, name: 'R19Product', qty: 3, unit: 'cc' }], { customerId: C, branchId: BR, movementType: MOVEMENT_TYPES.SALE });
    await applyDepositToSale(D, SID, 300);
    await deductWallet(C, W, { amount: 200, walletTypeName: 'R19', referenceType: 'sale', referenceId: SID });
    await earnPoints(C, { purchaseAmount: 500, bahtPerPoint: 10, referenceType: 'sale', referenceId: SID });
  };
  const cancelCascade = () => Promise.allSettled([
    reverseStockForSale(SID, { user: { uid: STAFF_UID } }),
    reverseDepositUsage(D, SID),
    refundToWallet(C, W, { amount: 200, walletTypeName: 'R19', referenceType: 'sale', referenceId: SID }),
    reversePointsEarned(C, SID),
    applySaleCancelToCourses(SID, 'refund', { reason: 'R19' }),
  ]);

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — 4-system cancel cascade\n`);
    await seedAll();

    // ── APPLY ────────────────────────────────────────────────────────────────
    console.log('APPLY — stock −3 / deposit 300 / wallet 200 / +50 pts / course active');
    await applySale();
    check('A1 stock 10→7', (await stockRemaining()) === 7, `stock=${await stockRemaining()}`);
    check('A2 deposit rem 700', (await dep()).remainingAmount === 700, `rem=${(await dep()).remainingAmount}`);
    check('A3 wallet 800', (await wal()) === 800, `bal=${await wal()}`);
    check('A4 points 250', (await pts()) === 250, `pts=${await pts()}`);

    // ── CANCEL cascade → conserve ALL FIVE ────────────────────────────────────
    console.log('\nCANCEL — full cascade → all 5 channels conserve to baseline');
    await cancelCascade();
    check('C1 stock restored 10', (await stockRemaining()) === 10, `stock=${await stockRemaining()}`);
    check('C2 deposit restored 1000 (used 0)', (await dep()).remainingAmount === 1000 && (await dep()).usedAmount === 0, `rem=${(await dep()).remainingAmount}`);
    check('C3 wallet restored 1000', (await wal()) === 1000, `bal=${await wal()}`);
    check('C4 points restored 200', (await pts()) === 200, `pts=${await pts()}`);
    check('C5 course flipped คืนเงิน', (await courseStatus()) === 'คืนเงิน', `status=${await courseStatus()}`);

    // ── DELETE (re-run cascade) → idempotent NO-OP everywhere ─────────────────
    console.log('\nDELETE — re-run the whole cascade → must NOT double-apply');
    await cancelCascade();
    check('D1 stock still 10 (no over-restore)', (await stockRemaining()) === 10, `stock=${await stockRemaining()}`);
    check('D2 deposit still 1000', (await dep()).remainingAmount === 1000, `rem=${(await dep()).remainingAmount}`);
    check('D3 wallet still 1000 (NOT 1200)', (await wal()) === 1000, `bal=${await wal()}`);
    check('D4 points still 200', (await pts()) === 200, `pts=${await pts()}`);
    check('D5 course still คืนเงิน', (await courseStatus()) === 'คืนเงิน', `status=${await courseStatus()}`);

    // ── CONCURRENT double-cancel — fresh sale, 2 full cascades at once ────────
    console.log('\nCONCURRENT — fresh sale, fire 2 FULL cancel cascades simultaneously');
    // clean the prior sale's movements/txns, re-seed fresh
    for (const col of ['be_wallet_transactions', 'be_point_transactions', 'be_stock_movements']) { const s = await data.collection(col).where('referenceId', '==', SID).get(); for (const d of s.docs) await d.ref.delete(); }
    { const s = await data.collection('be_stock_movements').where('linkedSaleId', '==', SID).get(); for (const d of s.docs) await d.ref.delete(); }
    { const s = await data.collection('be_course_changes').where('customerId', '==', C).get(); for (const d of s.docs) await d.ref.delete(); }
    await seedAll();
    await applySale();
    console.log(`  applied fresh → stock ${await stockRemaining()} / wallet ${await wal()} / pts ${await pts()}`);
    await Promise.allSettled([cancelCascade(), cancelCascade()]);
    const refundTx = await cnt('be_wallet_transactions', 'refund');
    const revTx = await cnt('be_point_transactions', 'reverse');
    console.log(`  after 2 concurrent cascades: stock ${await stockRemaining()} / deposit ${(await dep()).remainingAmount} / wallet ${await wal()} / pts ${await pts()}; refundTx=${refundTx} revTx=${revTx}`);
    check('X1 stock restored ONCE (10, not 13)', (await stockRemaining()) === 10, `stock=${await stockRemaining()}`);
    check('X2 deposit restored ONCE (1000)', (await dep()).remainingAmount === 1000, `rem=${(await dep()).remainingAmount}`);
    check('X3 wallet refunded ONCE (1000, not 1200)', (await wal()) === 1000, `bal=${await wal()}`);
    check('X4 points reversed ONCE (200, not 150)', (await pts()) === 200, `pts=${await pts()}`);
    check('X5 exactly ONE wallet refund txn', refundTx === 1, `got ${refundTx}`);
    check('X6 exactly ONE points reverse txn', revTx === 1, `got ${revTx}`);
    check('X7 course terminal (คืนเงิน)', (await courseStatus()) === 'คืนเงิน', `status=${await courseStatus()}`);

  } finally {
    try {
      for (const col of ['be_wallet_transactions', 'be_point_transactions', 'be_stock_movements']) { const s = await data.collection(col).where('referenceId', '==', SID).get(); for (const d of s.docs) await d.ref.delete(); }
      { const s = await data.collection('be_stock_movements').where('linkedSaleId', '==', SID).get(); for (const d of s.docs) await d.ref.delete(); }
      { const s = await data.collection('be_stock_batches').where('productId', '==', P).get(); for (const d of s.docs) await d.ref.delete(); }
      { const s = await data.collection('be_course_changes').where('customerId', '==', C).get(); for (const d of s.docs) await d.ref.delete(); }
      for (const [col, id] of [['be_customers', C], ['be_customer_wallets', `${C}__${W}`], ['be_deposits', D], ['be_sales', SID], ['be_products', P]]) { try { await data.collection(col).doc(id).delete(); } catch {} }
    } catch (e) { console.warn('cleanup warning:', e.message); }
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — 4-system cancel cascade conserves all 5 channels; idempotent on delete; concurrent double-cancel reverses each ONCE');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
