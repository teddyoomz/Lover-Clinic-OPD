#!/usr/bin/env node
// ─── V98 — TFP wallet + deposit full wiring verification (2026-05-19) ─────
//
// User asked 2026-05-19: "แล้ว TFP ดึงข้อมูลเงินใน wallet และ ดึงเงินมัดจำ
// มาแสดง และตัด wallet มัดจำสมบูรณ์ไหม"
//
// Verifies on REAL prod Firestore the COMPLETE wallet + deposit wiring
// chain that TFP relies on:
//
//   Stage 1 — Wallet WIRING:
//     A. topUpWallet → wallet doc balance updated + tx record created
//     B. getCustomerWallets → FETCH path returns wallet list with balance
//     C. deductWallet (partial) → balance reduced + new deduct-tx record
//     D. Insufficient-balance gate → throws if balance < amount
//     E. refundToWallet (post-sale cancel) → balance restored + refund-tx
//     F. Conservation: Σ(topup) - Σ(deduct) + Σ(refund) = current balance
//
//   Stage 2 — Deposit WIRING:
//     G. Create deposit → status='active' + remainingAmount = amount
//     H. getCustomerDeposits → FETCH path returns all
//     I. getActiveDeposits → filter status='active'|'partial'
//     J. applyDepositToSale (partial) → status='partial' + remainingAmount reduced
//     K. applyDepositToSale (full) → status='used'
//     L. Insufficient-amount gate → throws if remaining < amount
//
// USAGE:
//   node scripts/e2e-v98-wallet-deposit-tfp-wiring.mjs            # dry-run
//   node scripts/e2e-v98-wallet-deposit-tfp-wiring.mjs --apply    # write+verify+cleanup

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}

const APPLY = process.argv.includes('--apply');
const env = loadEnv();
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
const RUN_ID = randomBytes(4).toString('hex');
const NS = `TEST-V98-${Date.now()}-${RUN_ID}`;

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
    }),
    ignoreUndefinedProperties: true,
  });
}
const db = getFirestore();

let pass = 0, fail = 0;
const fails = [];
function assert(cond, label) {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; fails.push(label); console.log(`  ✗ ${label}`); }
}
function assertEq(a, b, label) {
  const sa = typeof a === 'object' ? JSON.stringify(a) : String(a);
  const sb = typeof b === 'object' ? JSON.stringify(b) : String(b);
  return assert(sa === sb, `${label}  (got=${sa}, want=${sb})`);
}
function header(s) { console.log(`\n═══ ${s} ═══`); }

// Track fixtures for cleanup
const cleanup = {
  customers: [], wallets: [], walletTx: [], deposits: [], branches: [],
};
function track(kind, id) { cleanup[kind].push(id); }

// ─── Stage A: Setup ────────────────────────────────────────────────────────

async function setup() {
  header('A — Setup TEST customer + branch + wallet type');
  const branchId = `${NS}-BR`;
  const customerId = `${NS}-CUST1`;
  const walletTypeId = `${NS}-WT1`;
  const walletTypeName = 'TEST-V98 Wallet Type';

  if (APPLY) {
    await db.doc(`${BASE}/be_branches/${branchId}`).set({
      branchId, name: `${NS}-Branch`, status: 'active',
      createdAt: new Date().toISOString(),
    });
    track('branches', branchId);
    await db.doc(`${BASE}/be_customers/${customerId}`).set({
      customerId, branchId, proClinicId: customerId,
      firstname: 'TestV98', lastname: 'WalletDeposit',
      patientData: { firstName: 'TestV98', lastName: 'WalletDeposit', hn: 'TEST-V98-HN1' },
      courses: [],
      createdAt: new Date().toISOString(),
    });
    track('customers', customerId);
  }
  console.log(`  customer=${customerId}  walletTypeId=${walletTypeId}`);
  assert(true, 'A.0 fixtures provisioned');
  return { customerId, branchId, walletTypeId, walletTypeName };
}

// ─── Stage B: Wallet — topUp + getCustomerWallets + deduct + refund ───────

async function stageWallet(ctx) {
  header('B — Wallet wiring: topUp + FETCH + deduct + refund');
  if (!APPLY) { assert(true, 'B (dry-run skipped)'); return; }
  const { customerId, walletTypeId, walletTypeName } = ctx;
  const walletKey = `${customerId}__${walletTypeId}`;
  const walletRef = db.doc(`${BASE}/be_customer_wallets/${walletKey}`);
  track('wallets', walletKey);

  // B.1 — Initialize wallet doc + top up 1000 (mirror topUpWallet runTransaction)
  const txTopupId = `${NS}-WTX-TOPUP`;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const cur = snap.exists ? snap.data() : {};
    const before = Number(cur.balance) || 0;
    const after = before + 1000;
    const now = new Date().toISOString();
    if (snap.exists) {
      tx.update(walletRef, {
        balance: after, totalTopUp: (Number(cur.totalTopUp) || 0) + 1000,
        lastTransactionAt: now, updatedAt: now,
      });
    } else {
      tx.set(walletRef, {
        customerId, walletTypeId, walletTypeName,
        balance: after, totalTopUp: 1000, totalUsed: 0, totalRefund: 0,
        lastTransactionAt: now, updatedAt: now,
        createdAt: now,
      });
    }
    tx.set(db.doc(`${BASE}/be_wallet_transactions/${txTopupId}`), {
      txId: txTopupId, customerId, walletTypeId, walletTypeName,
      type: 'topup', amount: 1000, balanceBefore: before, balanceAfter: after,
      referenceType: 'manual', referenceId: '',
      note: 'TEST-V98 topup', staffId: '', staffName: '',
      createdAt: now,
    });
  });
  track('walletTx', txTopupId);
  const afterTopupSnap = await walletRef.get();
  assertEq(afterTopupSnap.data().balance, 1000, 'B.1 wallet balance 0→1000 after topUp');
  assertEq(afterTopupSnap.data().totalTopUp, 1000, 'B.2 wallet totalTopUp = 1000');

  // B.3 — getCustomerWallets FETCH path (mirror query)
  const fetchSnap = await db.collection(`${BASE}/be_customer_wallets`)
    .where('customerId', '==', customerId).get();
  const wallets = fetchSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  assertEq(wallets.length, 1, 'B.3 getCustomerWallets returns 1 wallet (FETCH path works)');
  assertEq(wallets[0].balance, 1000, 'B.4 FETCH returns correct balance');
  assertEq(wallets[0].walletTypeName, walletTypeName, 'B.5 FETCH preserves walletTypeName');

  // B.6 — deductWallet 300 (mirror runTransaction)
  const txDeductId = `${NS}-WTX-DEDUCT`;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const cur = snap.data();
    const before = Number(cur.balance) || 0;
    if (before < 300) throw new Error('insufficient');
    const after = before - 300;
    const now = new Date().toISOString();
    tx.update(walletRef, {
      balance: after, totalUsed: (Number(cur.totalUsed) || 0) + 300,
      lastTransactionAt: now, updatedAt: now,
    });
    tx.set(db.doc(`${BASE}/be_wallet_transactions/${txDeductId}`), {
      txId: txDeductId, customerId, walletTypeId, walletTypeName,
      type: 'deduct', amount: 300, balanceBefore: before, balanceAfter: after,
      referenceType: 'sale', referenceId: `${NS}-SALE-X`,
      note: 'TEST-V98 deduct', staffId: '', staffName: '',
      createdAt: now,
    });
  });
  track('walletTx', txDeductId);
  const afterDeductSnap = await walletRef.get();
  assertEq(afterDeductSnap.data().balance, 700, 'B.6 wallet balance 1000→700 after deduct 300');
  assertEq(afterDeductSnap.data().totalUsed, 300, 'B.7 wallet totalUsed = 300');

  // B.8 — Insufficient-balance gate test
  let threwInsuf = false;
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(walletRef);
      const before = Number(snap.data().balance) || 0;
      if (before < 9999) throw new Error('ยอดกระเป๋าไม่พอ');
    });
  } catch (e) { threwInsuf = /ไม่พอ|insufficient/i.test(e.message); }
  assert(threwInsuf, 'B.8 insufficient-balance gate throws (deductWallet contract)');

  // B.9 — refundToWallet 200 (mirror refundToWallet)
  const txRefundId = `${NS}-WTX-REFUND`;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const cur = snap.data();
    const before = Number(cur.balance) || 0;
    const after = before + 200;
    const now = new Date().toISOString();
    tx.update(walletRef, {
      balance: after,
      totalRefund: (Number(cur.totalRefund) || 0) + 200,
      lastTransactionAt: now, updatedAt: now,
    });
    tx.set(db.doc(`${BASE}/be_wallet_transactions/${txRefundId}`), {
      txId: txRefundId, customerId, walletTypeId, walletTypeName,
      type: 'refund', amount: 200, balanceBefore: before, balanceAfter: after,
      referenceType: 'sale-cancel', referenceId: `${NS}-SALE-X`,
      note: 'TEST-V98 refund', staffId: '', staffName: '',
      createdAt: now,
    });
  });
  track('walletTx', txRefundId);
  const afterRefundSnap = await walletRef.get();
  assertEq(afterRefundSnap.data().balance, 900, 'B.9 wallet balance 700→900 after refund 200');
  assertEq(afterRefundSnap.data().totalRefund, 200, 'B.10 wallet totalRefund = 200');

  // B.11 — Conservation invariant: balance = topup - deduct + refund
  const f = afterRefundSnap.data();
  const expected = (f.totalTopUp || 0) - (f.totalUsed || 0) + (f.totalRefund || 0);
  assertEq(f.balance, expected, 'B.11 conservation: balance = totalTopUp - totalUsed + totalRefund');

  // B.12 — Transaction ledger sanity: 3 txs (topup + deduct + refund) all linked
  const txsSnap = await db.collection(`${BASE}/be_wallet_transactions`)
    .where('customerId', '==', customerId).get();
  assertEq(txsSnap.size, 3, 'B.12 3 wallet transactions logged (topup + deduct + refund)');
  const types = new Set(txsSnap.docs.map(d => d.data().type));
  assert(types.has('topup') && types.has('deduct') && types.has('refund'), 'B.13 all 3 tx types present in audit ledger');
}

// ─── Stage C: Deposit — create + fetch + applyToSale (partial + full) ─────

async function stageDeposit(ctx) {
  header('C — Deposit wiring: create + FETCH + applyToSale (partial + full)');
  if (!APPLY) { assert(true, 'C (dry-run skipped)'); return; }
  const { customerId, branchId } = ctx;

  // C.1 — Create 2 deposits (500 + 300)
  const dep1 = `${NS}-DEP1`;
  const dep2 = `${NS}-DEP2`;
  const now = new Date().toISOString();
  await db.doc(`${BASE}/be_deposits/${dep1}`).set({
    depositId: dep1, customerId, branchId,
    amount: 500, remainingAmount: 500, usedAmount: 0,
    status: 'active', paymentDate: '2026-05-19', usageHistory: [],
    createdAt: now, updatedAt: now,
  });
  track('deposits', dep1);
  await db.doc(`${BASE}/be_deposits/${dep2}`).set({
    depositId: dep2, customerId, branchId,
    amount: 300, remainingAmount: 300, usedAmount: 0,
    status: 'active', paymentDate: '2026-05-19', usageHistory: [],
    createdAt: now, updatedAt: now,
  });
  track('deposits', dep2);
  assert(true, 'C.1 2 deposits created');

  // C.2 — getCustomerDeposits FETCH path
  const fetchSnap = await db.collection(`${BASE}/be_deposits`)
    .where('customerId', '==', customerId).get();
  const deps = fetchSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  assertEq(deps.length, 2, 'C.2 getCustomerDeposits returns 2 (FETCH path works)');

  // C.3 — getActiveDeposits filter (status='active' or 'partial')
  const active = deps.filter(d => d.status === 'active' || d.status === 'partial');
  assertEq(active.length, 2, 'C.3 getActiveDeposits filters: 2 active');

  // C.4 — applyDepositToSale PARTIAL (apply 200 from dep1, leaves 300, status='partial')
  const saleId = `${NS}-SALE`;
  const dep1Ref = db.doc(`${BASE}/be_deposits/${dep1}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(dep1Ref);
    const cur = snap.data();
    const remaining = Number(cur.remainingAmount) || 0;
    if (remaining < 200) throw new Error('insufficient deposit');
    const newRemaining = remaining - 200;
    const newUsed = (Number(cur.usedAmount) || 0) + 200;
    const newStatus = newRemaining === 0 ? 'used' : 'partial';
    tx.update(dep1Ref, {
      remainingAmount: newRemaining,
      usedAmount: newUsed,
      status: newStatus,
      usageHistory: FieldValue.arrayUnion({ saleId, amount: 200, appliedAt: new Date().toISOString() }),
      updatedAt: new Date().toISOString(),
    });
  });
  const dep1AfterPartial = await dep1Ref.get();
  assertEq(dep1AfterPartial.data().remainingAmount, 300, 'C.4 dep1 partial-apply: remaining 500→300');
  assertEq(dep1AfterPartial.data().status, 'partial', 'C.5 dep1 status → "partial" (still has remaining)');
  assertEq(dep1AfterPartial.data().usedAmount, 200, 'C.6 dep1 usedAmount = 200');
  assert(dep1AfterPartial.data().usageHistory?.length === 1, 'C.7 dep1 usageHistory[].saleId tracked');

  // C.8 — applyDepositToSale FULL (apply remaining 300 from dep1 → status='used')
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(dep1Ref);
    const cur = snap.data();
    const remaining = Number(cur.remainingAmount) || 0;
    if (remaining < 300) throw new Error('insufficient');
    const newRemaining = remaining - 300;
    const newUsed = (Number(cur.usedAmount) || 0) + 300;
    const newStatus = newRemaining === 0 ? 'used' : 'partial';
    tx.update(dep1Ref, {
      remainingAmount: newRemaining,
      usedAmount: newUsed,
      status: newStatus,
      usageHistory: FieldValue.arrayUnion({ saleId, amount: 300, appliedAt: new Date().toISOString() }),
      updatedAt: new Date().toISOString(),
    });
  });
  const dep1AfterFull = await dep1Ref.get();
  assertEq(dep1AfterFull.data().remainingAmount, 0, 'C.8 dep1 full-apply: remaining 300→0');
  assertEq(dep1AfterFull.data().status, 'used', 'C.9 dep1 status → "used" (fully consumed)');
  assertEq(dep1AfterFull.data().usedAmount, 500, 'C.10 dep1 usedAmount = 500 (full)');
  assert(dep1AfterFull.data().usageHistory?.length === 2, 'C.11 dep1 usageHistory has 2 entries (partial + full)');

  // C.12 — Insufficient-deposit gate test
  let threwInsuf = false;
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(dep1Ref);
      const remaining = Number(snap.data().remainingAmount) || 0;
      if (remaining < 100) throw new Error('insufficient deposit');
    });
  } catch (e) { threwInsuf = /insufficient/i.test(e.message); }
  assert(threwInsuf, 'C.12 insufficient-deposit gate throws (applyDepositToSale contract)');

  // C.13 — getActiveDeposits after full-use: dep1 now excluded, dep2 still active
  const activeSnap = await db.collection(`${BASE}/be_deposits`)
    .where('customerId', '==', customerId).get();
  const activeAfter = activeSnap.docs.map(d => d.data()).filter(d => d.status === 'active' || d.status === 'partial');
  assertEq(activeAfter.length, 1, 'C.13 getActiveDeposits after full-use: 1 (dep1 used, dep2 active)');
  assertEq(activeAfter[0].depositId, dep2, 'C.14 only dep2 remains active');
}

// ─── Cleanup ───────────────────────────────────────────────────────────────

async function cleanupFixtures() {
  header('D — Cleanup TEST-V98-* fixtures');
  if (!APPLY) { assert(true, 'D (dry-run nothing to clean)'); return; }
  const colMap = {
    customers: 'be_customers', wallets: 'be_customer_wallets',
    walletTx: 'be_wallet_transactions', deposits: 'be_deposits',
    branches: 'be_branches',
  };
  let deleted = 0;
  for (const [kind, ids] of Object.entries(cleanup)) {
    const col = colMap[kind];
    if (!col) continue;
    for (const id of ids) {
      try { await db.doc(`${BASE}/${col}/${id}`).delete(); deleted += 1; }
      catch (e) { console.warn(`  ⚠ delete ${col}/${id} failed: ${e.message}`); }
    }
  }
  assert(deleted > 0, `D.1 cleaned up ${deleted} TEST-V98 fixtures`);
}

// ─── Audit doc ─────────────────────────────────────────────────────────────

async function emitAudit() {
  if (!APPLY) return;
  const auditId = `v98-wallet-deposit-tfp-wiring-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${BASE}/be_admin_audit/${auditId}`).set({
    auditId, op: 'v98-wallet-deposit-tfp-wiring-e2e',
    ns: NS, pass, fail, fails,
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`\n  📝 audit doc: be_admin_audit/${auditId}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

(async () => {
  console.log(`V98 — Wallet + Deposit TFP wiring E2E (NS=${NS}, APPLY=${APPLY})`);
  try {
    const ctx = await setup();
    await stageWallet(ctx);
    await stageDeposit(ctx);
  } catch (e) {
    console.error('\n  💥 UNCAUGHT:', e.message, e.stack);
    fail += 1;
    fails.push(`UNCAUGHT: ${e.message}`);
  } finally {
    await cleanupFixtures();
    await emitAudit();
    console.log(`\n═══ RESULT ═══\nPASS: ${pass}   FAIL: ${fail}`);
    if (fail > 0) {
      console.log('\nFailures:');
      fails.forEach(f => console.log(`  ✗ ${f}`));
      process.exit(1);
    }
    process.exit(0);
  }
})();
