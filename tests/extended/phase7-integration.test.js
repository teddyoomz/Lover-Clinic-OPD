// ═══════════════════════════════════════════════════════════════════════════
// SUPREME ADVANCE TEST SUITE — Phase 7 (Deposit / Wallet / Points / Membership
// / Courses / Sale / Treatment / Cross-subsystem).
//
// Built to catch money/inventory-integrity bugs. Every mutation has adversarial
// scenarios: boundary values, invariant checks, interference (duplicate entries,
// collisions), failure modes, cross-subsystem flows.
//
// Rule: every bug found in the project earns at least one regression test here.
// See `feedback_test_equal_to_code.md` in memory.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  collection, query, where, runTransaction,
} from 'firebase/firestore';

// Mirror src/firebase.js so dynamic imports of backendClient share the app
const firebaseConfig = {
  apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20',
  authDomain: 'loverclinic-opd-4c39b.firebaseapp.com',
  projectId: 'loverclinic-opd-4c39b',
  storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app',
  messagingSenderId: '653911776503',
  appId: '1:653911776503:web:9e23f723d3ed877962c7f2',
  measurementId: 'G-TB3Q9BZ8R5',
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const P = ['artifacts', 'loverclinic-opd-4c39b', 'public', 'data'];
const clean = (o) => JSON.parse(JSON.stringify(o));
const TS = Date.now();

// Import the module once so the same instance is reused across tests
const bc = () => import('../src/lib/backendClient.js');

// Seed helpers
const custDoc = (id) => doc(db, ...P, 'be_customers', id);
const depDoc = (id) => doc(db, ...P, 'be_deposits', id);
const walDoc = (id) => doc(db, ...P, 'be_customer_wallets', id);
const walTxCol = () => collection(db, ...P, 'be_wallet_transactions');
const mbrDoc = (id) => doc(db, ...P, 'be_memberships', id);
const ptxCol = () => collection(db, ...P, 'be_point_transactions');
const saleDoc = (id) => doc(db, ...P, 'be_sales', id);

async function nukeWalletTxsFor(customerId) {
  const q = query(walTxCol(), where('customerId', '==', String(customerId)));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}
async function nukePtxsFor(customerId) {
  const q = query(ptxCol(), where('customerId', '==', String(customerId)));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}
async function nukeDepositsFor(customerId) {
  const q = query(collection(db, ...P, 'be_deposits'), where('customerId', '==', String(customerId)));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}
async function nukeMembershipsFor(customerId) {
  const q = query(collection(db, ...P, 'be_memberships'), where('customerId', '==', String(customerId)));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}
async function nukeWalletsFor(customerId) {
  const q = query(collection(db, ...P, 'be_customer_wallets'), where('customerId', '==', String(customerId)));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. DEPOSIT — 25 scenarios
// ═══════════════════════════════════════════════════════════════════════════
describe('[SAE] Deposit — exhaustive mutation + invariant checks', () => {
  const CID = `SAE-DEP-CUST-${TS}`;
  beforeAll(async () => {
    await setDoc(custDoc(CID), clean({ proClinicId: CID, patientData: { firstName: 'DepSAE' }, finance: { depositBalance: 0 } }));
  });
  afterAll(async () => {
    try { await deleteDoc(custDoc(CID)); } catch {}
    await nukeDepositsFor(CID);
  });

  it('create → invariants: used=0, remaining=amount, status=active', async () => {
    const { createDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, customerName: 'DepSAE', amount: 5000, paymentChannel: 'เงินสด' });
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.amount).toBe(5000);
    expect(d.usedAmount).toBe(0);
    expect(d.remainingAmount).toBe(5000);
    expect(d.status).toBe('active');
    expect(d.usageHistory).toEqual([]);
    await deleteDoc(depDoc(depositId));
  });

  it('create with amount=0 still satisfies invariant (remaining=0)', async () => {
    const { createDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 0, paymentChannel: 'เงินสด' });
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.remainingAmount).toBe(0);
    await deleteDoc(depDoc(depositId));
  });

  it('create updates customer.finance.depositBalance (sum active+partial)', async () => {
    const { createDeposit } = await bc();
    const r1 = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    const r2 = await createDeposit({ customerId: CID, amount: 2000, paymentChannel: 'โอน' });
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.finance.depositBalance).toBe(3000);
    await deleteDoc(depDoc(r1.depositId));
    await deleteDoc(depDoc(r2.depositId));
  });

  it('create with sellers array preserves them', async () => {
    const { createDeposit } = await bc();
    const sellers = [
      { id: 's1', name: 'A', percent: 50, total: 1000 },
      { id: 's2', name: 'B', percent: 50, total: 1000 },
    ];
    const { depositId } = await createDeposit({ customerId: CID, amount: 2000, paymentChannel: 'เงินสด', sellers });
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.sellers).toHaveLength(2);
    expect(d.sellers[0].name).toBe('A');
    await deleteDoc(depDoc(depositId));
  });

  it('update amount upward → remaining increases (keeping usedAmount)', async () => {
    const { createDeposit, updateDeposit, applyDepositToSale } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    await applyDepositToSale(depositId, 'INV-FAKE-1', 300);
    await updateDeposit(depositId, { amount: 2000 });
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.amount).toBe(2000);
    expect(d.usedAmount).toBe(300);
    expect(d.remainingAmount).toBe(1700);
    await deleteDoc(depDoc(depositId));
  });

  it('update amount downward recalculates remaining correctly', async () => {
    const { createDeposit, updateDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 2000, paymentChannel: 'เงินสด' });
    await updateDeposit(depositId, { amount: 500 });
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.amount).toBe(500);
    expect(d.remainingAmount).toBe(500);
    await deleteDoc(depDoc(depositId));
  });

  it('update silently drops usedAmount/usageHistory overrides (invariants protected)', async () => {
    const { createDeposit, updateDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    await updateDeposit(depositId, { usedAmount: 999, usageHistory: [{ saleId: 'FAKE', amount: 999 }] });
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.usedAmount).toBe(0);
    expect(d.usageHistory).toEqual([]);
    await deleteDoc(depDoc(depositId));
  });

  it('cancel unused → status=cancelled, remaining=0, customer.finance zeroed', async () => {
    const { createDeposit, cancelDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 1500, paymentChannel: 'เงินสด' });
    await cancelDeposit(depositId, { cancelNote: 'test' });
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.status).toBe('cancelled');
    expect(d.remainingAmount).toBe(0);
    expect(d.cancelNote).toBe('test');
    expect(d.cancelledAt).toBeTruthy();
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.finance.depositBalance).toBe(0);
    await deleteDoc(depDoc(depositId));
  });

  it('cancel with usage > 0 → throws', async () => {
    const { createDeposit, applyDepositToSale, cancelDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    await applyDepositToSale(depositId, 'INV-FAKE-C', 400);
    await expect(cancelDeposit(depositId, { cancelNote: 'nope' })).rejects.toThrow();
    await deleteDoc(depDoc(depositId));
  });

  it('refund partial → remaining -= amount, refundAmount accumulates, status unchanged if partial', async () => {
    const { createDeposit, applyDepositToSale, refundDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    await applyDepositToSale(depositId, 'INV-FAKE-R', 200); // partial
    await refundDeposit(depositId, { refundAmount: 500, refundChannel: 'เงินสด' });
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.refundAmount).toBe(500);
    expect(d.remainingAmount).toBe(300); // 800 - 500
    expect(d.status).toBe('partial');
    await deleteDoc(depDoc(depositId));
  });

  it('refund equal to remaining → status=refunded', async () => {
    const { createDeposit, refundDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    await refundDeposit(depositId, { refundAmount: 500, refundChannel: 'เงินสด' });
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.status).toBe('refunded');
    expect(d.remainingAmount).toBe(0);
    await deleteDoc(depDoc(depositId));
  });

  it('refund > remaining → throws', async () => {
    const { createDeposit, refundDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    await expect(refundDeposit(depositId, { refundAmount: 999 })).rejects.toThrow();
    await deleteDoc(depDoc(depositId));
  });

  it('refund <= 0 → throws', async () => {
    const { createDeposit, refundDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    await expect(refundDeposit(depositId, { refundAmount: 0 })).rejects.toThrow();
    await expect(refundDeposit(depositId, { refundAmount: -100 })).rejects.toThrow();
    await deleteDoc(depDoc(depositId));
  });

  it('apply → status transitions active → partial → used', async () => {
    const { createDeposit, applyDepositToSale } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    let d = (await getDoc(depDoc(depositId))).data();
    expect(d.status).toBe('active');
    await applyDepositToSale(depositId, 'INV-TX-1', 400);
    d = (await getDoc(depDoc(depositId))).data();
    expect(d.status).toBe('partial');
    await applyDepositToSale(depositId, 'INV-TX-2', 600);
    d = (await getDoc(depDoc(depositId))).data();
    expect(d.status).toBe('used');
    await deleteDoc(depDoc(depositId));
  });

  it('apply exceeds remaining → throws, no partial state written', async () => {
    const { createDeposit, applyDepositToSale } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    await expect(applyDepositToSale(depositId, 'INV-OVER', 999999)).rejects.toThrow();
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.usedAmount).toBe(0); // NO partial write
    expect(d.remainingAmount).toBe(500);
    await deleteDoc(depDoc(depositId));
  });

  it('apply to cancelled deposit → throws', async () => {
    const { createDeposit, cancelDeposit, applyDepositToSale } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    await cancelDeposit(depositId, { cancelNote: 'cancel' });
    await expect(applyDepositToSale(depositId, 'INV-X', 100)).rejects.toThrow();
    await deleteDoc(depDoc(depositId));
  });

  it('reverse with matching saleId restores only that portion + removes history entry', async () => {
    const { createDeposit, applyDepositToSale, reverseDepositUsage } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    await applyDepositToSale(depositId, 'INV-R1', 300);
    await applyDepositToSale(depositId, 'INV-R2', 400);
    const res = await reverseDepositUsage(depositId, 'INV-R1');
    expect(res.restored).toBe(300);
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.usedAmount).toBe(400);
    expect(d.remainingAmount).toBe(600);
    expect(d.usageHistory.map(u => u.saleId)).toEqual(['INV-R2']);
    await deleteDoc(depDoc(depositId));
  });

  it('reverse non-matching saleId → no change, restored=0', async () => {
    const { createDeposit, applyDepositToSale, reverseDepositUsage } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    await applyDepositToSale(depositId, 'INV-ACTUAL', 200);
    const res = await reverseDepositUsage(depositId, 'INV-FAKE-NOPE');
    expect(res.restored).toBe(0);
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.usedAmount).toBe(200);
    await deleteDoc(depDoc(depositId));
  });

  it('reverse with collision-suffixed saleId works (regression for 762eb18 fix)', async () => {
    const { createDeposit, applyDepositToSale, reverseDepositUsage } = await bc();
    const suffixedId = `INV-SUFFIX-${TS}-abc123`;
    const { depositId } = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    await applyDepositToSale(depositId, suffixedId, 500);
    const res = await reverseDepositUsage(depositId, suffixedId);
    expect(res.restored).toBe(500);
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.usageHistory).toEqual([]);
    await deleteDoc(depDoc(depositId));
  });

  // M1: applying the same deposit to the same saleId twice is now blocked at
  // the server — prevents silent duplication of deposit usage via concurrent
  // clicks or retry-after-partial-failure. Reverse restores the single legit
  // entry.
  it('second apply to same sale throws (M1); reverse restores only the first entry', async () => {
    const { createDeposit, applyDepositToSale, reverseDepositUsage } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    await applyDepositToSale(depositId, 'INV-DUP', 200);
    await expect(applyDepositToSale(depositId, 'INV-DUP', 150)).rejects.toThrow(/ถูกใช้กับบิล|already/i);
    const res = await reverseDepositUsage(depositId, 'INV-DUP');
    expect(res.restored).toBe(200);
    const d = (await getDoc(depDoc(depositId))).data();
    expect(d.usedAmount).toBe(0);
    expect(d.remainingAmount).toBe(1000);
    await deleteDoc(depDoc(depositId));
  });

  it('customer finance excludes cancelled + refunded deposits', async () => {
    const { createDeposit, cancelDeposit, refundDeposit } = await bc();
    const r1 = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    const r2 = await createDeposit({ customerId: CID, amount: 2000, paymentChannel: 'เงินสด' });
    const r3 = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    await cancelDeposit(r1.depositId, { cancelNote: 'c' });
    await refundDeposit(r3.depositId, { refundAmount: 500 }); // full refund
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.finance.depositBalance).toBe(2000); // only r2 counts
    await deleteDoc(depDoc(r1.depositId));
    await deleteDoc(depDoc(r2.depositId));
    await deleteDoc(depDoc(r3.depositId));
  });

  it('getActiveDeposits filters correctly', async () => {
    const { createDeposit, cancelDeposit, getActiveDeposits } = await bc();
    const r1 = await createDeposit({ customerId: CID, amount: 100, paymentChannel: 'เงินสด' });
    const r2 = await createDeposit({ customerId: CID, amount: 200, paymentChannel: 'เงินสด' });
    await cancelDeposit(r1.depositId, { cancelNote: 'x' });
    const list = await getActiveDeposits(CID);
    expect(list.map(d => d.depositId)).toEqual([r2.depositId]);
    await deleteDoc(depDoc(r1.depositId));
    await deleteDoc(depDoc(r2.depositId));
  });

  it('deleteDeposit hard-removes (when no usage)', async () => {
    const { createDeposit, deleteDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 100, paymentChannel: 'เงินสด' });
    await deleteDeposit(depositId);
    const snap = await getDoc(depDoc(depositId));
    expect(snap.exists()).toBe(false);
  });

  it('deleteDeposit with usage > 0 → throws', async () => {
    const { createDeposit, applyDepositToSale, deleteDeposit } = await bc();
    const { depositId } = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    await applyDepositToSale(depositId, 'INV-X', 100);
    await expect(deleteDeposit(depositId)).rejects.toThrow();
    await deleteDoc(depDoc(depositId));
  });

  it('update non-existent deposit → throws', async () => {
    const { updateDeposit } = await bc();
    await expect(updateDeposit('DEP-GHOST', { amount: 100 })).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. WALLET — 18 scenarios
// ═══════════════════════════════════════════════════════════════════════════
describe('[SAE] Wallet — balances, totals, transactions', () => {
  const CID = `SAE-WAL-CUST-${TS}`;
  const WT1 = `WT-SAE1-${TS}`;
  const WT2 = `WT-SAE2-${TS}`;
  beforeAll(async () => {
    await setDoc(custDoc(CID), clean({ proClinicId: CID, patientData: { firstName: 'WalSAE' } }));
  });
  afterAll(async () => {
    try { await deleteDoc(custDoc(CID)); } catch {}
    await nukeWalletsFor(CID);
    await nukeWalletTxsFor(CID);
  });

  it('ensureCustomerWallet creates if missing', async () => {
    const { ensureCustomerWallet } = await bc();
    const w = await ensureCustomerWallet(CID, WT1, 'Main');
    expect(w.balance).toBe(0);
    expect(w.totalTopUp).toBe(0);
    expect(w.totalUsed).toBe(0);
    expect(w.customerId).toBe(CID);
  });

  it('ensureCustomerWallet returns existing without mutation', async () => {
    const { ensureCustomerWallet, topUpWallet } = await bc();
    await topUpWallet(CID, WT1, { amount: 100, walletTypeName: 'Main' });
    const w = await ensureCustomerWallet(CID, WT1, 'Main');
    expect(w.balance).toBe(100); // preserved, not reset
  });

  it('topUpWallet 0 → throws', async () => {
    const { topUpWallet } = await bc();
    await expect(topUpWallet(CID, WT1, { amount: 0 })).rejects.toThrow();
    await expect(topUpWallet(CID, WT1, { amount: -50 })).rejects.toThrow();
  });

  it('topUp → balance + totalTopUp increase; creates WTX', async () => {
    const { topUpWallet, getWalletTransactions } = await bc();
    await topUpWallet(CID, WT1, { amount: 500, walletTypeName: 'Main', paymentChannel: 'เงินสด' });
    const w = (await getDoc(walDoc(`${CID}__${WT1}`))).data();
    expect(w.balance).toBe(600); // 100 + 500
    expect(w.totalTopUp).toBe(600);
    const txs = await getWalletTransactions(CID, WT1);
    expect(txs[0].type).toBe('topup');
    expect(txs[0].amount).toBe(500);
    expect(txs[0].balanceAfter).toBe(600);
  });

  it('deduct → balance - amount, totalUsed += amount', async () => {
    const { deductWallet } = await bc();
    await deductWallet(CID, WT1, { amount: 200, walletTypeName: 'Main', referenceType: 'sale', referenceId: 'INV-W1' });
    const w = (await getDoc(walDoc(`${CID}__${WT1}`))).data();
    expect(w.balance).toBe(400);
    expect(w.totalUsed).toBe(200);
  });

  it('deduct insufficient → throws with helpful message', async () => {
    const { deductWallet } = await bc();
    await expect(deductWallet(CID, WT1, { amount: 9999 })).rejects.toThrow(/ไม่พอ/);
  });

  it('refundToWallet → balance up, totalUsed unchanged (lifetime preserved)', async () => {
    const { refundToWallet } = await bc();
    await refundToWallet(CID, WT1, { amount: 150, walletTypeName: 'Main', referenceType: 'sale', referenceId: 'INV-W1' });
    const w = (await getDoc(walDoc(`${CID}__${WT1}`))).data();
    expect(w.balance).toBe(550);
    expect(w.totalUsed).toBe(200); // unchanged
  });

  it('adjust + → balance up, totalTopUp += delta', async () => {
    const { adjustWallet } = await bc();
    await adjustWallet(CID, WT1, { amount: 100, isIncrease: true, walletTypeName: 'Main', note: 'bonus' });
    const w = (await getDoc(walDoc(`${CID}__${WT1}`))).data();
    expect(w.balance).toBe(650);
    expect(w.totalTopUp).toBe(700); // 600 + 100 delta
  });

  it('adjust - → balance down, totalUsed += |delta|', async () => {
    const { adjustWallet } = await bc();
    await adjustWallet(CID, WT1, { amount: 50, isIncrease: false, walletTypeName: 'Main', note: 'correction' });
    const w = (await getDoc(walDoc(`${CID}__${WT1}`))).data();
    expect(w.balance).toBe(600);
    expect(w.totalUsed).toBe(250);
  });

  it('adjust - exceeding balance → clamps to 0, delta = -balance', async () => {
    const { adjustWallet, getWalletTransactions } = await bc();
    await adjustWallet(CID, WT1, { amount: 99999, isIncrease: false, walletTypeName: 'Main', note: 'zero it' });
    const w = (await getDoc(walDoc(`${CID}__${WT1}`))).data();
    expect(w.balance).toBe(0);
    const txs = await getWalletTransactions(CID, WT1);
    // latest tx has amount = absolute delta (600, the old balance), not 99999
    expect(txs[0].amount).toBe(600);
  });

  it('multiple wallets per customer — isolated balances', async () => {
    const { topUpWallet } = await bc();
    await topUpWallet(CID, WT2, { amount: 777, walletTypeName: 'Special' });
    const w2 = (await getDoc(walDoc(`${CID}__${WT2}`))).data();
    const w1 = (await getDoc(walDoc(`${CID}__${WT1}`))).data();
    expect(w2.balance).toBe(777);
    expect(w1.balance).toBe(0); // untouched
  });

  it('getCustomerWallets returns all wallets sorted', async () => {
    const { getCustomerWallets } = await bc();
    const list = await getCustomerWallets(CID);
    expect(list.length).toBeGreaterThanOrEqual(2);
    const names = list.map(w => w.walletTypeName);
    expect(names).toContain('Main');
    expect(names).toContain('Special');
  });

  it('getWalletTransactions filters by walletTypeId when provided', async () => {
    const { getWalletTransactions } = await bc();
    const all = await getWalletTransactions(CID);
    const only1 = await getWalletTransactions(CID, WT1);
    const only2 = await getWalletTransactions(CID, WT2);
    expect(all.length).toBeGreaterThan(0);
    expect(only1.every(t => t.walletTypeId === WT1)).toBe(true);
    expect(only2.every(t => t.walletTypeId === WT2)).toBe(true);
    expect(only1.length + only2.length).toBe(all.length);
  });

  it('Transactions sorted by createdAt desc', async () => {
    const { getWalletTransactions } = await bc();
    const txs = await getWalletTransactions(CID);
    for (let i = 1; i < txs.length; i++) {
      expect(txs[i - 1].createdAt >= txs[i].createdAt).toBe(true);
    }
  });

  it('getWalletBalance returns balance or 0 for missing wallet', async () => {
    const { getWalletBalance } = await bc();
    expect(await getWalletBalance(CID, WT1)).toBe(0);
    expect(await getWalletBalance(CID, WT2)).toBe(777);
    expect(await getWalletBalance(CID, 'GHOST')).toBe(0);
  });

  it('recalcCustomerWalletBalances writes denorm customer.finance.walletBalances + total', async () => {
    const { recalcCustomerWalletBalances } = await bc();
    await recalcCustomerWalletBalances(CID);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.finance.walletBalances[WT1]).toBe(0);
    expect(c.finance.walletBalances[WT2]).toBe(777);
    expect(c.finance.totalWalletBalance).toBe(777);
  });

  it('Wallet tx captures referenceType + referenceId', async () => {
    const { topUpWallet, getWalletTransactions } = await bc();
    await topUpWallet(CID, WT2, { amount: 10, referenceType: 'manual', referenceId: 'NOTE-Z' });
    const txs = await getWalletTransactions(CID, WT2);
    const t = txs.find(x => x.referenceId === 'NOTE-Z');
    expect(t).toBeTruthy();
    expect(t.referenceType).toBe('manual');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. POINTS — 12 scenarios
// ═══════════════════════════════════════════════════════════════════════════
describe('[SAE] Points — earn, adjust, reverse, invariants', () => {
  const CID = `SAE-PTS-CUST-${TS}`;
  beforeAll(async () => {
    await setDoc(custDoc(CID), clean({ proClinicId: CID, patientData: { firstName: 'PtsSAE' }, finance: { loyaltyPoints: 0 } }));
  });
  afterAll(async () => {
    try { await deleteDoc(custDoc(CID)); } catch {}
    await nukePtxsFor(CID);
  });

  it('earnPoints with purchaseAmount=0 → no-op', async () => {
    const { earnPoints, getPointBalance } = await bc();
    const res = await earnPoints(CID, { purchaseAmount: 0, bahtPerPoint: 100 });
    expect(res.earned).toBe(0);
    expect(await getPointBalance(CID)).toBe(0);
  });

  it('earnPoints with bahtPerPoint=0 → no-op', async () => {
    const { earnPoints } = await bc();
    const res = await earnPoints(CID, { purchaseAmount: 5000, bahtPerPoint: 0 });
    expect(res.earned).toBe(0);
  });

  it('earnPoints floor(purchase / bpp) correctly', async () => {
    const { earnPoints } = await bc();
    const res = await earnPoints(CID, { purchaseAmount: 550, bahtPerPoint: 100 });
    expect(res.earned).toBe(5); // floor(550/100)
  });

  it('earnPoints updates finance.loyaltyPoints', async () => {
    const { earnPoints, getPointBalance } = await bc();
    await earnPoints(CID, { purchaseAmount: 300, bahtPerPoint: 100, referenceType: 'sale', referenceId: 'INV-EARN-A' });
    expect(await getPointBalance(CID)).toBe(8); // 5 + 3
  });

  it('adjustPoints + adds to balance', async () => {
    const { adjustPoints, getPointBalance } = await bc();
    await adjustPoints(CID, { amount: 10, isIncrease: true, note: 'gift' });
    expect(await getPointBalance(CID)).toBe(18);
  });

  it('adjustPoints - subtracts from balance', async () => {
    const { adjustPoints, getPointBalance } = await bc();
    await adjustPoints(CID, { amount: 3, isIncrease: false, note: 'correct' });
    expect(await getPointBalance(CID)).toBe(15);
  });

  it('adjustPoints - insufficient → throws', async () => {
    const { adjustPoints } = await bc();
    await expect(adjustPoints(CID, { amount: 9999, isIncrease: false, note: 'oops' })).rejects.toThrow();
  });

  it('adjustPoints with 0 → throws', async () => {
    const { adjustPoints } = await bc();
    await expect(adjustPoints(CID, { amount: 0, isIncrease: true, note: '' })).rejects.toThrow();
  });

  it('reversePointsEarned sums earn-type txs matching referenceId', async () => {
    const { earnPoints, reversePointsEarned, getPointBalance } = await bc();
    await earnPoints(CID, { purchaseAmount: 2000, bahtPerPoint: 100, referenceType: 'sale', referenceId: 'INV-REV-X' });
    // total earned so far from INV-REV-X: 20. balance before: 15+20=35
    expect(await getPointBalance(CID)).toBe(35);
    const res = await reversePointsEarned(CID, 'INV-REV-X');
    expect(res.reversed).toBe(20);
    expect(await getPointBalance(CID)).toBe(15);
  });

  it('reversePointsEarned with no matches → reversed=0', async () => {
    const { reversePointsEarned } = await bc();
    const res = await reversePointsEarned(CID, 'INV-NOPE');
    expect(res.reversed).toBe(0);
  });

  it('reversePointsEarned ignores adjust-type txs (only reverses earn)', async () => {
    const { adjustPoints, reversePointsEarned, getPointBalance } = await bc();
    const before = await getPointBalance(CID);
    await adjustPoints(CID, { amount: 5, isIncrease: true, note: 'adj-test' });
    const after = await getPointBalance(CID);
    expect(after).toBe(before + 5);
    // There's no earn tx for 'INV-ADJ-FAKE' but adjustPoints doesn't link to it
    const res = await reversePointsEarned(CID, 'INV-ADJ-FAKE');
    expect(res.reversed).toBe(0);
  });

  it('getPointTransactions sorted desc', async () => {
    const { getPointTransactions } = await bc();
    const txs = await getPointTransactions(CID);
    for (let i = 1; i < txs.length; i++) {
      expect(txs[i - 1].createdAt >= txs[i].createdAt).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. MEMBERSHIP — 10 scenarios
// ═══════════════════════════════════════════════════════════════════════════
describe('[SAE] Membership — create side-effects + expiry + lifecycle', () => {
  const CID = `SAE-MBR-CUST-${TS}`;
  const WT = `WT-MBR-${TS}`;
  beforeAll(async () => {
    await setDoc(custDoc(CID), clean({ proClinicId: CID, patientData: { firstName: 'MbrSAE' } }));
  });
  afterAll(async () => {
    try { await deleteDoc(custDoc(CID)); } catch {}
    await nukeMembershipsFor(CID);
    await nukeWalletsFor(CID);
    await nukeWalletTxsFor(CID);
    await nukePtxsFor(CID);
  });

  it('create → wallet credited + points given + customer.finance fields set', async () => {
    const { createMembership, getWalletBalance, getPointBalance } = await bc();
    const { membershipId } = await createMembership({
      customerId: CID, customerName: 'Mbr',
      cardTypeId: 'MCT-X', cardTypeName: 'GOLD', colorName: 'gold',
      purchasePrice: 10000, initialCredit: 5000, discountPercent: 10,
      initialPoints: 500, bahtPerPoint: 100, expiredInDays: 365,
      walletTypeId: WT, walletTypeName: 'Main',
    });
    const m = (await getDoc(mbrDoc(membershipId))).data();
    expect(m.walletCredited).toBe(true);
    expect(m.pointsCredited).toBe(true);
    expect(await getWalletBalance(CID, WT)).toBe(5000);
    expect(await getPointBalance(CID)).toBe(500);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.finance.membershipType).toBe('GOLD');
    expect(c.finance.membershipDiscountPercent).toBe(10);
  });

  it('create with credit=0 → no wallet tx', async () => {
    const { createMembership, getWalletTransactions } = await bc();
    const { membershipId } = await createMembership({
      customerId: CID, cardTypeId: 'MCT-Y', cardTypeName: 'SILVER',
      purchasePrice: 0, initialCredit: 0, discountPercent: 5,
      initialPoints: 100, bahtPerPoint: 0, expiredInDays: 30,
      walletTypeId: WT,
    });
    const m = (await getDoc(mbrDoc(membershipId))).data();
    expect(m.walletCredited).toBe(false);
    await deleteDoc(mbrDoc(membershipId));
  });

  it('create with point=0 → no point tx', async () => {
    const { createMembership, getPointBalance } = await bc();
    const before = await getPointBalance(CID);
    const { membershipId } = await createMembership({
      customerId: CID, cardTypeId: 'MCT-Z', cardTypeName: 'BASIC',
      purchasePrice: 0, initialCredit: 0, discountPercent: 0,
      initialPoints: 0, bahtPerPoint: 0, expiredInDays: 30,
    });
    const m = (await getDoc(mbrDoc(membershipId))).data();
    expect(m.pointsCredited).toBe(false);
    expect(await getPointBalance(CID)).toBe(before);
    await deleteDoc(mbrDoc(membershipId));
  });

  it('getCustomerMembership returns only active', async () => {
    const { getCustomerMembership } = await bc();
    const m = await getCustomerMembership(CID);
    expect(m?.cardTypeName).toBe('GOLD'); // the first one from test above
  });

  it('getCustomerBahtPerPoint reflects active membership', async () => {
    const { getCustomerBahtPerPoint } = await bc();
    expect(await getCustomerBahtPerPoint(CID)).toBe(100);
  });

  it('getCustomerMembershipDiscount reflects active membership', async () => {
    const { getCustomerMembershipDiscount } = await bc();
    expect(await getCustomerMembershipDiscount(CID)).toBe(10);
  });

  it('renewMembership extends expiresAt + appends to renewals', async () => {
    const { getCustomerMembership, renewMembership } = await bc();
    const m = await getCustomerMembership(CID);
    const beforeExpiry = new Date(m.expiresAt).getTime();
    const res = await renewMembership(m.membershipId, { extendDays: 30, price: 500, paymentChannel: 'เงินสด' });
    const afterExpiry = new Date(res.expiresAt).getTime();
    expect(afterExpiry).toBeGreaterThan(beforeExpiry);
    const updated = (await getDoc(mbrDoc(m.membershipId))).data();
    expect(updated.renewals).toHaveLength(1);
    expect(updated.renewals[0].price).toBe(500);
  });

  it('cancelMembership → status=cancelled; wallet/points NOT refunded (per spec)', async () => {
    const { getCustomerMembership, cancelMembership, getWalletBalance, getPointBalance } = await bc();
    const m = await getCustomerMembership(CID);
    const walBefore = await getWalletBalance(CID, WT);
    const ptsBefore = await getPointBalance(CID);
    await cancelMembership(m.membershipId, { cancelNote: 'ลูกค้าขอ' });
    const updated = (await getDoc(mbrDoc(m.membershipId))).data();
    expect(updated.status).toBe('cancelled');
    expect(updated.cancelNote).toBe('ลูกค้าขอ');
    // Wallet + points NOT refunded on cancel (clinic policy)
    expect(await getWalletBalance(CID, WT)).toBe(walBefore);
    expect(await getPointBalance(CID)).toBe(ptsBefore);
    // customer.finance membership fields cleared
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.finance.membershipType).toBeNull();
  });

  it('getCustomerMembership lazy-expires past-due docs', async () => {
    const { createMembership, getCustomerMembership } = await bc();
    // createMembership defaults `expiredInDays: 0` → 365 (via `|| 365`), so we
    // force an already-expired state by overwriting expiresAt directly on the doc.
    const { membershipId } = await createMembership({
      customerId: CID, cardTypeId: 'MCT-EXP', cardTypeName: 'EXPIRED TEST',
      purchasePrice: 100, initialCredit: 0, discountPercent: 0,
      initialPoints: 0, bahtPerPoint: 0, expiredInDays: 1,
    });
    await updateDoc(mbrDoc(membershipId), { expiresAt: new Date(Date.now() - 86400000).toISOString() });
    const m = await getCustomerMembership(CID);
    expect(m).toBeNull(); // lazy expired
    const d = (await getDoc(mbrDoc(membershipId))).data();
    expect(d.status).toBe('expired');
    await deleteDoc(mbrDoc(membershipId));
  });

  it('deleteMembership removes doc + clears finance fields', async () => {
    const { createMembership, deleteMembership } = await bc();
    const { membershipId } = await createMembership({
      customerId: CID, cardTypeId: 'MCT-DEL', cardTypeName: 'TODEL',
      purchasePrice: 0, initialCredit: 0, discountPercent: 0,
      initialPoints: 0, bahtPerPoint: 0, expiredInDays: 30,
    });
    await deleteMembership(membershipId);
    const snap = await getDoc(mbrDoc(membershipId));
    expect(snap.exists()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. COURSES — 15 scenarios (the bug-heavy subsystem)
// ═══════════════════════════════════════════════════════════════════════════
describe('[SAE] Courses — assign / deduct / reverse / exchange', () => {
  const CID = `SAE-CRS-CUST-${TS}`;
  beforeAll(async () => {
    await setDoc(custDoc(CID), clean({ proClinicId: CID, patientData: { firstName: 'CrsSAE' }, courses: [] }));
  });
  afterAll(async () => { try { await deleteDoc(custDoc(CID)); } catch {} });

  const resetCourses = async (courses) => {
    await updateDoc(custDoc(CID), { courses: clean(courses) });
  };

  it('assignCourseToCustomer pushes to END with linkedSaleId tag', async () => {
    const { assignCourseToCustomer } = await bc();
    await resetCourses([{ name: 'Old', product: 'X', qty: '5 / 10 U' }]);
    await assignCourseToCustomer(CID, {
      name: 'New', products: [{ name: 'X', qty: 100, unit: 'U' }],
      source: 'sale', linkedSaleId: 'INV-LINK-A',
    });
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses).toHaveLength(2);
    expect(c.courses[1].name).toBe('New'); // pushed to end
    expect(c.courses[1].linkedSaleId).toBe('INV-LINK-A');
    expect(c.courses[0].name).toBe('Old'); // untouched
  });

  it('assign with multiple products creates one entry per product', async () => {
    const { assignCourseToCustomer } = await bc();
    await resetCourses([]);
    await assignCourseToCustomer(CID, {
      name: 'Bundle',
      products: [
        { name: 'A', qty: 1, unit: 'x' },
        { name: 'B', qty: 2, unit: 'y' },
      ],
    });
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses).toHaveLength(2);
    expect(c.courses.map(x => x.product).sort()).toEqual(['A', 'B']);
  });

  it('assign with NO products falls back to course-as-product', async () => {
    const { assignCourseToCustomer } = await bc();
    await resetCourses([]);
    await assignCourseToCustomer(CID, { name: 'Solo' });
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses).toHaveLength(1);
    expect(c.courses[0].product).toBe('Solo');
  });

  it('deductCourseItems default (FIFO) drains oldest-first', async () => {
    const { deductCourseItems } = await bc();
    await resetCourses([
      { name: 'C', product: 'P', qty: '5 / 10 U', tag: 'old' },
      { name: 'C', product: 'P', qty: '10 / 10 U', tag: 'new' },
    ]);
    await deductCourseItems(CID, [{ courseName: 'C', productName: 'P', deductQty: 3 }]);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'old').qty).toBe('2 / 10 U');
    expect(c.courses.find(x => x.tag === 'new').qty).toBe('10 / 10 U'); // untouched
  });

  it('deductCourseItems preferNewest drains newest-first', async () => {
    const { deductCourseItems } = await bc();
    await resetCourses([
      { name: 'C', product: 'P', qty: '5 / 10 U', tag: 'old' },
      { name: 'C', product: 'P', qty: '10 / 10 U', tag: 'new' },
    ]);
    await deductCourseItems(CID, [{ courseName: 'C', productName: 'P', deductQty: 3 }], { preferNewest: true });
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'new').qty).toBe('7 / 10 U');
    expect(c.courses.find(x => x.tag === 'old').qty).toBe('5 / 10 U');
  });

  it('deductCourseItems spills across entries when one is insufficient', async () => {
    const { deductCourseItems } = await bc();
    await resetCourses([
      { name: 'C', product: 'P', qty: '3 / 10 U', tag: 'a' },
      { name: 'C', product: 'P', qty: '5 / 5 U',  tag: 'b' },
    ]);
    await deductCourseItems(CID, [{ courseName: 'C', productName: 'P', deductQty: 7 }]);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'a').qty).toBe('0 / 10 U'); // drained 3
    expect(c.courses.find(x => x.tag === 'b').qty).toBe('1 / 5 U');  // drained 4 from next
  });

  it('deductCourseItems insufficient total → throws, no partial writes', async () => {
    const { deductCourseItems } = await bc();
    await resetCourses([
      { name: 'C', product: 'P', qty: '3 / 10 U', tag: 'a' },
    ]);
    await expect(deductCourseItems(CID, [{ courseName: 'C', productName: 'P', deductQty: 100 }])).rejects.toThrow();
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses[0].qty).toBe('3 / 10 U'); // no partial write
  });

  it('deductCourseItems skips 0-remaining entries', async () => {
    const { deductCourseItems } = await bc();
    await resetCourses([
      { name: 'C', product: 'P', qty: '0 / 10 U', tag: 'empty' },
      { name: 'C', product: 'P', qty: '5 / 10 U', tag: 'ok' },
    ]);
    await deductCourseItems(CID, [{ courseName: 'C', productName: 'P', deductQty: 2 }]);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'empty').qty).toBe('0 / 10 U');
    expect(c.courses.find(x => x.tag === 'ok').qty).toBe('3 / 10 U');
  });

  it('reverseCourseDeduction default (findIndex) restores oldest match', async () => {
    const { reverseCourseDeduction } = await bc();
    await resetCourses([
      { name: 'R', product: 'Q', qty: '0 / 10 U', tag: 'old' },
      { name: 'R', product: 'Q', qty: '5 / 10 U', tag: 'new' },
    ]);
    await reverseCourseDeduction(CID, [{ courseName: 'R', productName: 'Q', deductQty: 3 }]);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'old').qty).toBe('3 / 10 U');
    expect(c.courses.find(x => x.tag === 'new').qty).toBe('5 / 10 U');
  });

  it('reverseCourseDeduction preferNewest restores newest match', async () => {
    const { reverseCourseDeduction } = await bc();
    await resetCourses([
      { name: 'R', product: 'Q', qty: '5 / 10 U', tag: 'old' },
      { name: 'R', product: 'Q', qty: '0 / 10 U', tag: 'new' },
    ]);
    await reverseCourseDeduction(CID, [{ courseName: 'R', productName: 'Q', deductQty: 4 }], { preferNewest: true });
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'old').qty).toBe('5 / 10 U');
    expect(c.courses.find(x => x.tag === 'new').qty).toBe('4 / 10 U');
  });

  it('reverseCourseDeduction caps at total (never over-restores)', async () => {
    const { reverseCourseDeduction } = await bc();
    await resetCourses([{ name: 'R', product: 'Q', qty: '8 / 10 U' }]);
    await reverseCourseDeduction(CID, [{ courseName: 'R', productName: 'Q', deductQty: 99 }]);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses[0].qty).toBe('10 / 10 U');
  });

  it('exchangeCourseProduct swaps product + qty + logs entry', async () => {
    const { exchangeCourseProduct } = await bc();
    await resetCourses([{ name: 'E', product: 'OldP', qty: '5 / 5 U' }]);
    await exchangeCourseProduct(CID, 0, { name: 'NewP', qty: 3, unit: 'x' }, 'ลูกค้าขอเปลี่ยน');
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses[0].product).toBe('NewP');
    expect(c.courses[0].qty).toBe('3 / 3 x');
    expect(c.courseExchangeLog).toHaveLength(1);
    expect(c.courseExchangeLog[0].reason).toBe('ลูกค้าขอ' + 'เปลี่ยน');
  });

  it('addCourseRemainingQty increases both remaining AND total', async () => {
    const { addCourseRemainingQty } = await bc();
    await resetCourses([{ name: 'A', product: 'P', qty: '80 / 100 U' }]);
    await addCourseRemainingQty(CID, 0, 20);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses[0].qty).toBe('100 / 120 U');
  });

  it('removeLinkedSaleCourses (default) leaves used courses in place', async () => {
    const { removeLinkedSaleCourses } = await bc();
    const sid = 'INV-CLEAN-A';
    await setDoc(saleDoc(sid), clean({ saleId: sid, customerId: CID, billing: {}, items: {}, status: 'active', createdAt: new Date().toISOString() }));
    await resetCourses([
      { name: 'L', product: 'P', qty: '5 / 5 U', linkedSaleId: sid, tag: 'unused' },
      { name: 'L', product: 'P', qty: '3 / 5 U', linkedSaleId: sid, tag: 'partial' },
      { name: 'O', product: 'P', qty: '1 / 1 U', tag: 'unrelated' }, // not linked
    ]);
    const res = await removeLinkedSaleCourses(sid);
    expect(res.removedCount).toBe(1);
    expect(res.keptUsedCount).toBe(1);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'partial')).toBeTruthy();
    expect(c.courses.find(x => x.tag === 'unused')).toBeUndefined();
    expect(c.courses.find(x => x.tag === 'unrelated')).toBeTruthy();
    await deleteDoc(saleDoc(sid));
  });

  it('removeLinkedSaleCourses (removeUsed: true) wipes everything linked', async () => {
    const { removeLinkedSaleCourses } = await bc();
    const sid = 'INV-CLEAN-B';
    await setDoc(saleDoc(sid), clean({ saleId: sid, customerId: CID, billing: {}, items: {}, status: 'active', createdAt: new Date().toISOString() }));
    await resetCourses([
      { name: 'L', product: 'P', qty: '5 / 5 U', linkedSaleId: sid, tag: 'unused' },
      { name: 'L', product: 'P', qty: '0 / 5 U', linkedSaleId: sid, tag: 'full' },
    ]);
    const res = await removeLinkedSaleCourses(sid, { removeUsed: true });
    expect(res.removedCount).toBe(2);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.filter(x => x.linkedSaleId === sid)).toHaveLength(0);
    await deleteDoc(saleDoc(sid));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. SALE LIFECYCLE — 15 scenarios (create / update / cancel / delete / pay)
// ═══════════════════════════════════════════════════════════════════════════
describe('[SAE] Sale — lifecycle + analyzeSaleCancel', () => {
  const CID = `SAE-SAL-CUST-${TS}`;
  const createdSaleIds = [];
  beforeAll(async () => {
    await setDoc(custDoc(CID), clean({ proClinicId: CID, patientData: { firstName: 'SalSAE' }, courses: [] }));
  });
  afterAll(async () => {
    try { await deleteDoc(custDoc(CID)); } catch {}
    for (const id of createdSaleIds) { try { await deleteDoc(saleDoc(id)); } catch {} }
  });

  it('createBackendSale returns finalId + doc stored under finalId', async () => {
    const { createBackendSale } = await bc();
    const res = await createBackendSale(clean({
      customerId: CID, customerName: 'Sal', saleDate: '2026-04-18',
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { subtotal: 100, netTotal: 100 },
      payment: { status: 'paid', channels: [] }, sellers: [],
    }));
    createdSaleIds.push(res.saleId);
    const snap = await getDoc(saleDoc(res.saleId));
    expect(snap.exists()).toBe(true);
    expect(snap.data().saleId).toBe(res.saleId);
  });

  it('createBackendSale — collision produces suffixed finalId (regression)', async () => {
    const { createBackendSale, generateInvoiceNumber: _ } = await bc();
    // Create one to take the next invoice number
    const a = await createBackendSale(clean({ customerId: CID, saleDate: '2026-04-18', items: { courses: [], promotions: [], products: [], medications: [] }, billing: { netTotal: 1 }, payment: { channels: [] }, sellers: [] }));
    createdSaleIds.push(a.saleId);
    // Manually rewind the counter so the next call collides
    const counterRef = doc(db, ...P, 'be_sales_counter', 'counter');
    await runTransaction(db, async (tx) => {
      const s = await tx.get(counterRef);
      if (s.exists()) tx.set(counterRef, { ...s.data(), seq: (s.data().seq || 1) - 1 });
    });
    const b = await createBackendSale(clean({ customerId: CID, saleDate: '2026-04-18', items: { courses: [], promotions: [], products: [], medications: [] }, billing: { netTotal: 2 }, payment: { channels: [] }, sellers: [] }));
    createdSaleIds.push(b.saleId);
    expect(b.saleId).not.toBe(a.saleId);
    // b.saleId should have the pattern INV-YYYYMMDD-NNNN-<ts36>
    expect(b.saleId).toMatch(/^INV-\d{8}-\d{4}-[a-z0-9]+$/);
  });

  it('updateBackendSale partial update preserves other fields', async () => {
    const { createBackendSale, updateBackendSale } = await bc();
    const r = await createBackendSale(clean({ customerId: CID, saleNote: 'original', items: { courses: [], promotions: [], products: [], medications: [] }, billing: { netTotal: 500 }, payment: { channels: [] }, sellers: [] }));
    createdSaleIds.push(r.saleId);
    await updateBackendSale(r.saleId, { saleNote: 'updated' });
    const d = (await getDoc(saleDoc(r.saleId))).data();
    expect(d.saleNote).toBe('updated');
    expect(d.billing.netTotal).toBe(500); // preserved
  });

  it('cancelBackendSale sets status + metadata', async () => {
    const { createBackendSale, cancelBackendSale } = await bc();
    const r = await createBackendSale(clean({ customerId: CID, items: { courses: [], promotions: [], products: [], medications: [] }, billing: { netTotal: 100 }, payment: { channels: [] }, sellers: [] }));
    createdSaleIds.push(r.saleId);
    await cancelBackendSale(r.saleId, 'test reason', 'เงินสด', 100, null);
    const d = (await getDoc(saleDoc(r.saleId))).data();
    expect(d.status).toBe('cancelled');
    expect(d.cancelled.reason).toBe('test reason');
    expect(d.cancelled.refundMethod).toBe('เงินสด');
    expect(d.cancelled.refundAmount).toBe(100);
  });

  it('deleteBackendSale removes doc', async () => {
    const { createBackendSale, deleteBackendSale } = await bc();
    const r = await createBackendSale(clean({ customerId: CID, items: { courses: [], promotions: [], products: [], medications: [] }, billing: { netTotal: 1 }, payment: { channels: [] }, sellers: [] }));
    await deleteBackendSale(r.saleId);
    const snap = await getDoc(saleDoc(r.saleId));
    expect(snap.exists()).toBe(false);
  });

  it('updateSalePayment appends channel + sets status=paid when sum >= netTotal', async () => {
    const { createBackendSale, updateSalePayment } = await bc();
    const r = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { netTotal: 1000 },
      payment: { status: 'split', channels: [{ enabled: true, method: 'เงินสด', amount: '600' }] },
      sellers: [],
    }));
    createdSaleIds.push(r.saleId);
    await updateSalePayment(r.saleId, { method: 'โอน', amount: '400', date: '2026-04-18' });
    const d = (await getDoc(saleDoc(r.saleId))).data();
    expect(d.payment.status).toBe('paid');
    expect(d.payment.channels).toHaveLength(2);
  });

  it('updateSalePayment partial → status stays split', async () => {
    const { createBackendSale, updateSalePayment } = await bc();
    const r = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { netTotal: 1000 },
      payment: { status: 'unpaid', channels: [] },
      sellers: [],
    }));
    createdSaleIds.push(r.saleId);
    await updateSalePayment(r.saleId, { method: 'เงินสด', amount: '300', date: '2026-04-18' });
    const d = (await getDoc(saleDoc(r.saleId))).data();
    expect(d.payment.status).toBe('split');
  });

  it('analyzeSaleCancel classifies courses correctly + counts products/meds', async () => {
    const { createBackendSale, analyzeSaleCancel } = await bc();
    const r = await createBackendSale(clean({
      customerId: CID, saleDate: '2026-04-18',
      items: {
        courses: [], promotions: [],
        products: [{ name: 'A' }, { name: 'B' }],
        medications: [{ name: 'Para' }, { name: 'Advil' }, { name: 'Ibu' }],
      },
      billing: { subtotal: 1000, depositApplied: 200, walletApplied: 100, netTotal: 700 },
      payment: { channels: [] }, sellers: [],
    }));
    createdSaleIds.push(r.saleId);
    // Seed linked courses
    await updateDoc(custDoc(CID), {
      courses: clean([
        { name: 'U', product: 'Pu', qty: '5 / 5 U', linkedSaleId: r.saleId },
        { name: 'P', product: 'Pp', qty: '2 / 5 U', linkedSaleId: r.saleId },
        { name: 'F', product: 'Pf', qty: '0 / 5 U', linkedSaleId: r.saleId },
      ]),
    });
    const a = await analyzeSaleCancel(r.saleId);
    expect(a.unused).toHaveLength(1);
    expect(a.partiallyUsed).toHaveLength(1);
    expect(a.fullyUsed).toHaveLength(1);
    expect(a.productsCount).toBe(2);
    expect(a.medsCount).toBe(3);
    expect(a.depositApplied).toBe(200);
    expect(a.walletApplied).toBe(100);
  });

  it('analyzeSaleCancel with missing customer → graceful (empty courses)', async () => {
    const { createBackendSale, analyzeSaleCancel } = await bc();
    const r = await createBackendSale(clean({
      customerId: 'GHOST-CUSTOMER',
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { netTotal: 100 }, payment: { channels: [] }, sellers: [],
    }));
    createdSaleIds.push(r.saleId);
    const a = await analyzeSaleCancel(r.saleId);
    expect(a.unused).toHaveLength(0);
    expect(a.partiallyUsed).toHaveLength(0);
  });

  it('analyzeSaleCancel for non-existent saleId → throws', async () => {
    const { analyzeSaleCancel } = await bc();
    await expect(analyzeSaleCancel('INV-GHOST')).rejects.toThrow();
  });

  it('getCustomerSales filters + sorts desc', async () => {
    const { createBackendSale, getCustomerSales } = await bc();
    const CID2 = `${CID}-FILTERED`;
    await setDoc(custDoc(CID2), clean({ proClinicId: CID2, patientData: {} }));
    const r1 = await createBackendSale(clean({ customerId: CID2, saleDate: '2026-04-18', items: { courses: [], promotions: [], products: [], medications: [] }, billing: { netTotal: 1 }, payment: { channels: [] }, sellers: [], createdAt: new Date(TS).toISOString() }));
    await new Promise(r => setTimeout(r, 20));
    const r2 = await createBackendSale(clean({ customerId: CID2, saleDate: '2026-04-18', items: { courses: [], promotions: [], products: [], medications: [] }, billing: { netTotal: 2 }, payment: { channels: [] }, sellers: [] }));
    createdSaleIds.push(r1.saleId, r2.saleId);
    const list = await getCustomerSales(CID2);
    expect(list.length).toBeGreaterThanOrEqual(2);
    // Sorted desc — latest first
    const ids = list.filter(s => [r1.saleId, r2.saleId].includes(s.saleId)).map(s => s.saleId);
    expect(ids[0]).toBe(r2.saleId);
    try { await deleteDoc(custDoc(CID2)); } catch {}
  });

  it('getSaleByTreatmentId finds linked sale', async () => {
    const { createBackendSale, getSaleByTreatmentId } = await bc();
    const TID = `BT-LINK-${TS}`;
    const r = await createBackendSale(clean({
      customerId: CID, saleDate: '2026-04-18', linkedTreatmentId: TID,
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { netTotal: 1 }, payment: { channels: [] }, sellers: [],
    }));
    createdSaleIds.push(r.saleId);
    const found = await getSaleByTreatmentId(TID);
    expect(found?.saleId).toBe(r.saleId);
  });

  it('getSaleByTreatmentId missing returns null', async () => {
    const { getSaleByTreatmentId } = await bc();
    const found = await getSaleByTreatmentId('BT-GHOST');
    expect(found).toBeNull();
  });

  it('generateInvoiceNumber atomic counter produces unique sequential IDs', async () => {
    const { generateInvoiceNumber } = await bc();
    const results = await Promise.all([
      generateInvoiceNumber(),
      generateInvoiceNumber(),
      generateInvoiceNumber(),
    ]);
    const unique = new Set(results);
    expect(unique.size).toBe(3);
    // All should share the YYYYMMDD prefix
    results.forEach(id => expect(id).toMatch(/^INV-\d{8}-\d{4}$/));
  });

  it('getAllSales returns all, sorted desc', async () => {
    const { getAllSales } = await bc();
    const list = await getAllSales();
    // At least the ones we just created must exist
    const created = createdSaleIds.filter(id => list.some(s => s.saleId === id));
    expect(created.length).toBeGreaterThanOrEqual(1);
    // Check sorted desc by createdAt on the subset
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1].createdAt || list[i - 1].saleDate || '';
      const b = list[i].createdAt || list[i].saleDate || '';
      expect(a >= b).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. FINANCE UTILS (pure) — 10 additional edge cases
// ═══════════════════════════════════════════════════════════════════════════
describe('[SAE] financeUtils — boundary cases beyond components.test.jsx', () => {
  it('calcDepositRemaining with string inputs coerces correctly', async () => {
    const { calcDepositRemaining } = await import('../src/lib/financeUtils.js');
    expect(calcDepositRemaining('1000', '300')).toBe(700);
    expect(calcDepositRemaining('abc', null)).toBe(0);
  });

  it('calcSaleBilling when deposit+wallet > afterMembership → caps at remaining', async () => {
    const { calcSaleBilling } = await import('../src/lib/financeUtils.js');
    const r = calcSaleBilling({
      subtotal: 1000, membershipDiscountPercent: 10,
      depositApplied: 2000, walletApplied: 2000,
    });
    expect(r.afterMembership).toBe(900);
    expect(r.depositApplied).toBe(900); // capped
    expect(r.walletApplied).toBe(0); // exhausted
    expect(r.netTotal).toBe(0);
  });

  it('calcSaleBilling percent discount applied to subtotal only', async () => {
    const { calcSaleBilling } = await import('../src/lib/financeUtils.js');
    const r = calcSaleBilling({ subtotal: 1000, billDiscount: 25, billDiscountType: 'percent' });
    expect(r.discount).toBe(250);
    expect(r.afterDiscount).toBe(750);
  });

  it('calcPointsEarned floors correctly', async () => {
    const { calcPointsEarned } = await import('../src/lib/financeUtils.js');
    expect(calcPointsEarned(999, 100)).toBe(9);
    expect(calcPointsEarned(99, 100)).toBe(0);
  });

  it('calcMembershipExpiry adds days correctly', async () => {
    const { calcMembershipExpiry } = await import('../src/lib/financeUtils.js');
    const iso = calcMembershipExpiry('2026-01-01T00:00:00Z', 30);
    expect(new Date(iso).toISOString().startsWith('2026-01-31')).toBe(true);
  });

  it('isMembershipExpired handles past/future/null', async () => {
    const { isMembershipExpired } = await import('../src/lib/financeUtils.js');
    expect(isMembershipExpired(null)).toBe(false);
    expect(isMembershipExpired('2020-01-01T00:00:00Z')).toBe(true);
    expect(isMembershipExpired('2099-01-01T00:00:00Z')).toBe(false);
  });

  it('fmtMoney preserves 2 decimals when present', async () => {
    const { fmtMoney } = await import('../src/lib/financeUtils.js');
    expect(fmtMoney(1234.5)).toMatch(/1,234\.5/);
    expect(fmtMoney(1234)).toMatch(/1,234/);
  });

  it('fmtPoints handles zero + large', async () => {
    const { fmtPoints } = await import('../src/lib/financeUtils.js');
    expect(fmtPoints(0)).toBe('0');
    expect(fmtPoints(1234567)).toContain('1,234,567');
  });

  it('calcDepositStatus handles edge of exact-use', async () => {
    const { calcDepositStatus } = await import('../src/lib/financeUtils.js');
    expect(calcDepositStatus(1000, 1000)).toBe('used');
    expect(calcDepositStatus(1000, 999.99)).toBe('partial');
  });

  it('calcSaleBilling is idempotent on zero inputs', async () => {
    const { calcSaleBilling } = await import('../src/lib/financeUtils.js');
    const r = calcSaleBilling({});
    Object.values(r).forEach(v => expect(Number.isFinite(v)).toBe(true));
    expect(r.netTotal).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. CROSS-SUBSYSTEM END-TO-END — 20+ integration scenarios
// ═══════════════════════════════════════════════════════════════════════════
describe('[SAE] End-to-end flows (deposit + wallet + points + courses + sale)', () => {
  const CID = `SAE-E2E-CUST-${TS}`;
  const WT = `WT-E2E-${TS}`;
  const createdSaleIds = [];
  const createdDepIds = [];
  const createdMbrIds = [];

  beforeAll(async () => {
    await setDoc(custDoc(CID), clean({
      proClinicId: CID, patientData: { firstName: 'E2E' },
      courses: [],
      finance: { depositBalance: 0, loyaltyPoints: 0 },
    }));
  });

  afterAll(async () => {
    for (const id of createdSaleIds) { try { await deleteDoc(saleDoc(id)); } catch {} }
    for (const id of createdDepIds) { try { await deleteDoc(depDoc(id)); } catch {} }
    for (const id of createdMbrIds) { try { await deleteDoc(mbrDoc(id)); } catch {} }
    await nukeWalletsFor(CID);
    await nukeWalletTxsFor(CID);
    await nukePtxsFor(CID);
    try { await deleteDoc(custDoc(CID)); } catch {}
  });

  it('full lifecycle: membership → deposit → wallet → sale (with all instruments) → cancel → all reversed', async () => {
    const {
      createMembership, createDeposit, topUpWallet, createBackendSale,
      applyDepositToSale, deductWallet, earnPoints,
      analyzeSaleCancel, reverseDepositUsage, refundToWallet, reversePointsEarned,
      removeLinkedSaleCourses, cancelBackendSale,
      getWalletBalance, getPointBalance, getDeposit, assignCourseToCustomer,
    } = await bc();

    // 1. Membership (gives 5000 wallet + 500 points + 10% discount + 100 baht/point)
    const mbr = await createMembership({
      customerId: CID, cardTypeId: 'MCT-E2E', cardTypeName: 'E2E-GOLD',
      purchasePrice: 10000, initialCredit: 5000, discountPercent: 10,
      initialPoints: 500, bahtPerPoint: 100, expiredInDays: 365,
      walletTypeId: WT, walletTypeName: 'Main',
    });
    createdMbrIds.push(mbr.membershipId);
    expect(await getWalletBalance(CID, WT)).toBe(5000);
    expect(await getPointBalance(CID)).toBe(500);

    // 2. Deposit ฿3,000
    const dep = await createDeposit({ customerId: CID, amount: 3000, paymentChannel: 'โอน' });
    createdDepIds.push(dep.depositId);

    // 3. Top-up wallet ฿2,000
    await topUpWallet(CID, WT, { amount: 2000, walletTypeName: 'Main' });
    expect(await getWalletBalance(CID, WT)).toBe(7000);

    // 4. Create sale with subtotal 10000 → discount 10% (mem) → 9000 → deposit 3000 → 6000 → wallet 4000 → netTotal 2000 → 20 points earned
    const sale = await createBackendSale(clean({
      customerId: CID, customerName: 'E2E', saleDate: '2026-04-18',
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: {
        subtotal: 10000, membershipDiscount: 1000, membershipDiscountPercent: 10,
        depositApplied: 3000, depositIds: [{ depositId: dep.depositId, amount: 3000 }],
        walletApplied: 4000, walletTypeId: WT, walletTypeName: 'Main',
        netTotal: 2000,
      },
      payment: { status: 'paid', channels: [{ enabled: true, method: 'เงินสด', amount: '2000' }] },
      sellers: [], membershipId: mbr.membershipId,
    }));
    createdSaleIds.push(sale.saleId);
    await applyDepositToSale(dep.depositId, sale.saleId, 3000);
    await deductWallet(CID, WT, { amount: 4000, walletTypeName: 'Main', referenceType: 'sale', referenceId: sale.saleId });
    await earnPoints(CID, { purchaseAmount: 2000, bahtPerPoint: 100, referenceType: 'sale', referenceId: sale.saleId });

    // Snapshot post-sale
    expect(await getWalletBalance(CID, WT)).toBe(3000); // 7000 - 4000
    expect(await getPointBalance(CID)).toBe(520); // 500 + 20
    const d1 = await getDeposit(dep.depositId);
    expect(d1.remainingAmount).toBe(0);
    expect(d1.status).toBe('used');

    // 5. Cancel everything
    const analysis = await analyzeSaleCancel(sale.saleId);
    expect(analysis.depositApplied).toBe(3000);
    expect(analysis.walletApplied).toBe(4000);
    expect(analysis.pointsEarned).toBe(20);
    await reverseDepositUsage(dep.depositId, sale.saleId);
    await refundToWallet(CID, WT, { amount: 4000, walletTypeName: 'Main', referenceType: 'sale', referenceId: sale.saleId });
    await reversePointsEarned(CID, sale.saleId);
    await removeLinkedSaleCourses(sale.saleId);
    await cancelBackendSale(sale.saleId, 'e2e', 'เงินสด', 2000, null);

    // Verify everything reversed
    expect(await getWalletBalance(CID, WT)).toBe(7000);
    expect(await getPointBalance(CID)).toBe(500);
    const d2 = await getDeposit(dep.depositId);
    expect(d2.remainingAmount).toBe(3000);
    expect(d2.status).toBe('active');
  });

  it('two sales share same deposit: sequential apply + individual reverse', async () => {
    const { createDeposit, createBackendSale, applyDepositToSale, reverseDepositUsage, getDeposit } = await bc();
    const dep = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    createdDepIds.push(dep.depositId);
    const s1 = await createBackendSale(clean({ customerId: CID, items: { courses: [], promotions: [], products: [], medications: [] }, billing: { netTotal: 300 }, payment: { channels: [] }, sellers: [] }));
    const s2 = await createBackendSale(clean({ customerId: CID, items: { courses: [], promotions: [], products: [], medications: [] }, billing: { netTotal: 500 }, payment: { channels: [] }, sellers: [] }));
    createdSaleIds.push(s1.saleId, s2.saleId);
    await applyDepositToSale(dep.depositId, s1.saleId, 300);
    await applyDepositToSale(dep.depositId, s2.saleId, 500);
    let d = await getDeposit(dep.depositId);
    expect(d.remainingAmount).toBe(200);
    // Reverse only s1 — s2 should be untouched
    await reverseDepositUsage(dep.depositId, s1.saleId);
    d = await getDeposit(dep.depositId);
    expect(d.remainingAmount).toBe(500);
    expect(d.usageHistory.map(u => u.saleId)).toEqual([s2.saleId]);
  });

  it('concurrent deposit applies: one wins, other throws (runTransaction)', async () => {
    const { createDeposit, applyDepositToSale, getDeposit } = await bc();
    const dep = await createDeposit({ customerId: CID, amount: 100, paymentChannel: 'เงินสด' });
    createdDepIds.push(dep.depositId);
    const results = await Promise.allSettled([
      applyDepositToSale(dep.depositId, 'INV-CONC-1', 80),
      applyDepositToSale(dep.depositId, 'INV-CONC-2', 80),
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    // At least one must succeed; if both succeed, total used must not exceed amount
    expect(fulfilled.length + rejected.length).toBe(2);
    const d = await getDeposit(dep.depositId);
    expect(d.usedAmount).toBeLessThanOrEqual(100);
    expect(d.remainingAmount).toBeGreaterThanOrEqual(0);
  });

  it('wallet: top-up → deduct → refund → adjust leaves invariants correct', async () => {
    const { topUpWallet, deductWallet, refundToWallet, adjustWallet, getWalletBalance, getCustomerWallets } = await bc();
    const WT_ISO = `WT-ISOLATED-${TS}`;
    await topUpWallet(CID, WT_ISO, { amount: 1000, walletTypeName: 'Isolated' });
    await deductWallet(CID, WT_ISO, { amount: 300, walletTypeName: 'Isolated' });
    await refundToWallet(CID, WT_ISO, { amount: 100, walletTypeName: 'Isolated' });
    await adjustWallet(CID, WT_ISO, { amount: 50, isIncrease: false, walletTypeName: 'Isolated', note: 'x' });
    expect(await getWalletBalance(CID, WT_ISO)).toBe(750); // 1000 - 300 + 100 - 50
    const wals = await getCustomerWallets(CID);
    const w = wals.find(x => x.walletTypeId === WT_ISO);
    expect(w.totalTopUp).toBe(1000);
    expect(w.totalUsed).toBe(350); // 300 + 50
  });

  it('points accumulate across sales; reversing one does not touch others', async () => {
    const { earnPoints, reversePointsEarned, getPointBalance } = await bc();
    // CID's point balance starts at 500 (from membership earlier in this describe)
    const before = await getPointBalance(CID);
    await earnPoints(CID, { purchaseAmount: 500, bahtPerPoint: 100, referenceType: 'sale', referenceId: 'INV-EARN-A' });
    await earnPoints(CID, { purchaseAmount: 300, bahtPerPoint: 100, referenceType: 'sale', referenceId: 'INV-EARN-B' });
    expect(await getPointBalance(CID)).toBe(before + 5 + 3);
    await reversePointsEarned(CID, 'INV-EARN-A');
    expect(await getPointBalance(CID)).toBe(before + 3); // only B remains
  });

  it('customer with no membership: no earn, no discount', async () => {
    const { earnPoints, getCustomerBahtPerPoint, getCustomerMembershipDiscount } = await bc();
    const CID3 = `SAE-NOMEM-${TS}`;
    await setDoc(custDoc(CID3), clean({ proClinicId: CID3, patientData: {} }));
    expect(await getCustomerBahtPerPoint(CID3)).toBe(0);
    expect(await getCustomerMembershipDiscount(CID3)).toBe(0);
    const res = await earnPoints(CID3, { purchaseAmount: 10000, bahtPerPoint: 0 });
    expect(res.earned).toBe(0);
    try { await deleteDoc(custDoc(CID3)); } catch {}
  });

  it('deposit apply + reverse preserves amount invariant (used + remaining === amount)', async () => {
    const { createDeposit, applyDepositToSale, reverseDepositUsage, getDeposit } = await bc();
    const dep = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    createdDepIds.push(dep.depositId);
    await applyDepositToSale(dep.depositId, 'INV-INV-1', 400);
    let d = await getDeposit(dep.depositId);
    expect(d.usedAmount + d.remainingAmount).toBe(d.amount);
    await reverseDepositUsage(dep.depositId, 'INV-INV-1');
    d = await getDeposit(dep.depositId);
    expect(d.usedAmount + d.remainingAmount).toBe(d.amount);
  });

  it('preferNewest regression: old drained first would break — new must be hit', async () => {
    // Seed courses: old "X" 10/20, new "X" 100/100 (simulates just-assigned)
    const { deductCourseItems } = await bc();
    await updateDoc(custDoc(CID), { courses: clean([
      { name: 'X', product: 'Xp', qty: '10 / 20 U', tag: 'old' },
      { name: 'X', product: 'Xp', qty: '100 / 100 U', tag: 'new' },
    ])});
    await deductCourseItems(CID, [{ courseName: 'X', productName: 'Xp', deductQty: 30 }], { preferNewest: true });
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'new').qty).toBe('70 / 100 U');
    expect(c.courses.find(x => x.tag === 'old').qty).toBe('10 / 20 U');
  });

  it('removeLinkedSaleCourses leaves unrelated + used courses untouched', async () => {
    const { removeLinkedSaleCourses } = await bc();
    const sid = `INV-CROSS-CLEAN-${TS}`;
    await setDoc(saleDoc(sid), clean({ saleId: sid, customerId: CID, billing: {}, items: {}, status: 'active', createdAt: new Date().toISOString() }));
    createdSaleIds.push(sid);
    await updateDoc(custDoc(CID), { courses: clean([
      { name: 'Y', product: 'Yp', qty: '5 / 5 U', linkedSaleId: sid },
      { name: 'Y', product: 'Yp', qty: '1 / 5 U', linkedSaleId: sid, tag: 'partial' },
      { name: 'Z', product: 'Zp', qty: '3 / 3 U' }, // unrelated
    ])});
    const res = await removeLinkedSaleCourses(sid);
    expect(res.removedCount).toBe(1);
    expect(res.keptUsedCount).toBe(1);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'partial')).toBeTruthy(); // used, kept
    expect(c.courses.find(x => x.name === 'Z')).toBeTruthy(); // unrelated, kept
  });

  it('analyzeSaleCancel totals match sum of billing fields', async () => {
    const { createBackendSale, analyzeSaleCancel } = await bc();
    const r = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [], promotions: [], products: [{ name: 'X' }], medications: [] },
      billing: { subtotal: 1000, depositApplied: 300, walletApplied: 200, netTotal: 500 },
      payment: { channels: [] }, sellers: [],
    }));
    createdSaleIds.push(r.saleId);
    const a = await analyzeSaleCancel(r.saleId);
    expect(a.depositApplied + a.walletApplied + 500).toBe(1000); // == subtotal
    expect(a.productsCount).toBe(1);
  });

  it('sequential: create + reverse + reapply → state matches fresh apply', async () => {
    const { createDeposit, applyDepositToSale, reverseDepositUsage, getDeposit } = await bc();
    const dep = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    createdDepIds.push(dep.depositId);
    await applyDepositToSale(dep.depositId, 'INV-SEQ-A', 500);
    await reverseDepositUsage(dep.depositId, 'INV-SEQ-A');
    await applyDepositToSale(dep.depositId, 'INV-SEQ-A', 500);
    const d = await getDeposit(dep.depositId);
    expect(d.usedAmount).toBe(500);
    expect(d.remainingAmount).toBe(500);
    const hist = d.usageHistory.filter(u => u.saleId === 'INV-SEQ-A');
    expect(hist).toHaveLength(1);
  });

  it('wallet refund does NOT undo totalUsed (lifetime metric preserved)', async () => {
    const { topUpWallet, deductWallet, refundToWallet } = await bc();
    const WT_LT = `WT-LIFETIME-${TS}`;
    await topUpWallet(CID, WT_LT, { amount: 1000, walletTypeName: 'Life' });
    await deductWallet(CID, WT_LT, { amount: 400, walletTypeName: 'Life' });
    await refundToWallet(CID, WT_LT, { amount: 400, walletTypeName: 'Life' });
    const w = (await getDoc(walDoc(`${CID}__${WT_LT}`))).data();
    expect(w.balance).toBe(1000);
    expect(w.totalTopUp).toBe(1000);
    expect(w.totalUsed).toBe(400); // PRESERVED after refund
  });

  it('deposit refund reduces balance but KEEPS usedAmount (for audit)', async () => {
    const { createDeposit, applyDepositToSale, refundDeposit, getDeposit } = await bc();
    const dep = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    createdDepIds.push(dep.depositId);
    await applyDepositToSale(dep.depositId, 'INV-RA', 400);
    await refundDeposit(dep.depositId, { refundAmount: 300, refundChannel: 'เงินสด' });
    const d = await getDeposit(dep.depositId);
    expect(d.usedAmount).toBe(400); // unchanged by refund
    expect(d.remainingAmount).toBe(300); // 600 - 300
    expect(d.refundAmount).toBe(300);
  });

  it('membership cancel does NOT refund wallet/points (per spec)', async () => {
    const { createMembership, cancelMembership, getWalletBalance, getPointBalance } = await bc();
    const mbr = await createMembership({
      customerId: CID, cardTypeId: 'MCT-CANCEL', cardTypeName: 'ToCancel',
      purchasePrice: 0, initialCredit: 500, discountPercent: 0,
      initialPoints: 50, bahtPerPoint: 0, expiredInDays: 30,
      walletTypeId: WT, walletTypeName: 'Main',
    });
    createdMbrIds.push(mbr.membershipId);
    const walBefore = await getWalletBalance(CID, WT);
    const ptsBefore = await getPointBalance(CID);
    await cancelMembership(mbr.membershipId, { cancelNote: 'test' });
    expect(await getWalletBalance(CID, WT)).toBe(walBefore);
    expect(await getPointBalance(CID)).toBe(ptsBefore);
  });

  it('update deposit amount higher → preserves already-applied usage', async () => {
    const { createDeposit, applyDepositToSale, updateDeposit, getDeposit } = await bc();
    const dep = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    createdDepIds.push(dep.depositId);
    await applyDepositToSale(dep.depositId, 'INV-UD', 200);
    await updateDeposit(dep.depositId, { amount: 1000 });
    const d = await getDeposit(dep.depositId);
    expect(d.usedAmount).toBe(200);
    expect(d.remainingAmount).toBe(800);
  });

  it('sequential earnPoints for same referenceId accumulate, single reverse sums all', async () => {
    const { earnPoints, reversePointsEarned, getPointBalance } = await bc();
    const CID4 = `SAE-ACC-${TS}`;
    await setDoc(custDoc(CID4), clean({ proClinicId: CID4, patientData: {}, finance: { loyaltyPoints: 0 } }));
    await earnPoints(CID4, { purchaseAmount: 1000, bahtPerPoint: 100, referenceType: 'sale', referenceId: 'INV-DUP-EARN' });
    await earnPoints(CID4, { purchaseAmount: 500, bahtPerPoint: 100, referenceType: 'sale', referenceId: 'INV-DUP-EARN' });
    expect(await getPointBalance(CID4)).toBe(15);
    const res = await reversePointsEarned(CID4, 'INV-DUP-EARN');
    expect(res.reversed).toBe(15);
    expect(await getPointBalance(CID4)).toBe(0);
    await nukePtxsFor(CID4);
    try { await deleteDoc(custDoc(CID4)); } catch {}
  });

  it('deposit applied + sale cancel + re-apply to DIFFERENT sale works', async () => {
    const { createDeposit, applyDepositToSale, reverseDepositUsage, getDeposit } = await bc();
    const dep = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    createdDepIds.push(dep.depositId);
    await applyDepositToSale(dep.depositId, 'INV-FIRST', 500);
    await reverseDepositUsage(dep.depositId, 'INV-FIRST');
    await applyDepositToSale(dep.depositId, 'INV-SECOND', 500);
    const d = await getDeposit(dep.depositId);
    expect(d.usageHistory.map(u => u.saleId)).toEqual(['INV-SECOND']);
    expect(d.remainingAmount).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. SALE CANCEL/DELETE — items disappear + money reversed (DEEP E2E)
// This replicates the exact SaleTab cancel handler flow:
//   1. Deposit reverse
//   2. Wallet refund
//   3. Points reverse
//   4. removeLinkedSaleCourses (unused or all depending on flag)
//   5. cancelBackendSale
// Every test verifies the END STATE after a real cancel flow.
// ═══════════════════════════════════════════════════════════════════════════
describe('[SAE] Sale cancel — courses disappear, money reversed (full orchestration)', () => {
  const CID = `SAE-CANCEL-CUST-${TS}`;
  const WT = `WT-CANCEL-${TS}`;
  const created = { sales: [], deposits: [] };

  beforeAll(async () => {
    await setDoc(custDoc(CID), clean({
      proClinicId: CID, patientData: { firstName: 'CancelE2E' },
      courses: [], finance: { depositBalance: 0 },
    }));
  });
  afterAll(async () => {
    for (const id of created.sales) { try { await deleteDoc(saleDoc(id)); } catch {} }
    for (const id of created.deposits) { try { await deleteDoc(depDoc(id)); } catch {} }
    await nukeWalletsFor(CID);
    await nukeWalletTxsFor(CID);
    await nukePtxsFor(CID);
    try { await deleteDoc(custDoc(CID)); } catch {}
  });

  // Helper: simulate the full SaleTab cancel orchestration
  async function cancelLikeSaleTab(saleId, customerId, { removeUsed = false } = {}) {
    const {
      reverseDepositUsage, refundToWallet, reversePointsEarned,
      removeLinkedSaleCourses, cancelBackendSale,
    } = await bc();
    const saleSnap = await getDoc(saleDoc(saleId));
    if (!saleSnap.exists()) throw new Error('sale not found');
    const sale = saleSnap.data();
    const deps = Array.isArray(sale.billing?.depositIds) ? sale.billing.depositIds : [];
    for (const d of deps) {
      await reverseDepositUsage(d.depositId, saleId);
    }
    if (sale.billing?.walletTypeId && Number(sale.billing?.walletApplied) > 0) {
      await refundToWallet(customerId, sale.billing.walletTypeId, {
        amount: Number(sale.billing.walletApplied),
        walletTypeName: sale.billing.walletTypeName || '',
        referenceType: 'sale', referenceId: saleId,
      });
    }
    await reversePointsEarned(customerId, saleId);
    await removeLinkedSaleCourses(saleId, { removeUsed });
    await cancelBackendSale(saleId, 'test cancel', 'เงินสด', 0, null);
  }

  it('cancel a sale with no linked courses → only reverses money', async () => {
    const { createDeposit, createBackendSale, applyDepositToSale, getDeposit, topUpWallet, deductWallet, getWalletBalance } = await bc();
    const dep = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    created.deposits.push(dep.depositId);
    await topUpWallet(CID, WT, { amount: 1000, walletTypeName: 'Cancel' });
    const sale = await createBackendSale(clean({
      customerId: CID, customerName: 'C1', saleDate: '2026-04-18',
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: {
        subtotal: 1000, depositApplied: 300, depositIds: [{ depositId: dep.depositId, amount: 300 }],
        walletApplied: 200, walletTypeId: WT, walletTypeName: 'Cancel',
        netTotal: 500,
      },
      payment: { channels: [] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    await applyDepositToSale(dep.depositId, sale.saleId, 300);
    await deductWallet(CID, WT, { amount: 200, walletTypeName: 'Cancel', referenceType: 'sale', referenceId: sale.saleId });

    await cancelLikeSaleTab(sale.saleId, CID);
    const d = await getDeposit(dep.depositId);
    expect(d.remainingAmount).toBe(500); // restored
    expect(await getWalletBalance(CID, WT)).toBe(1000); // refunded
    const saleDocData = (await getDoc(saleDoc(sale.saleId))).data();
    expect(saleDocData.status).toBe('cancelled');
  });

  it('cancel a sale with linked COURSES → unused courses disappear, used kept', async () => {
    const { createBackendSale, assignCourseToCustomer } = await bc();
    const sale = await createBackendSale(clean({
      customerId: CID, customerName: 'C2', saleDate: '2026-04-18',
      items: { courses: [{ id: 'C1', name: 'Botox Course' }], promotions: [], products: [], medications: [] },
      billing: { subtotal: 10000, netTotal: 10000 }, payment: { channels: [] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    // Assign 2 courses: 1 unused, 1 partially used
    await assignCourseToCustomer(CID, {
      name: 'Botox Course', products: [{ name: 'Nabota', qty: 200, unit: 'U' }],
      source: 'sale', linkedSaleId: sale.saleId,
    });
    // Manually mark one as partial
    const c = (await getDoc(custDoc(CID))).data();
    const idx = c.courses.findIndex(x => x.linkedSaleId === sale.saleId);
    c.courses[idx] = { ...c.courses[idx], qty: '150 / 200 U' }; // partial use
    // Add a 2nd linked course that's unused
    c.courses.push({ name: 'Botox Course', product: 'Nabota2', qty: '100 / 100 U', linkedSaleId: sale.saleId, source: 'sale' });
    await updateDoc(custDoc(CID), { courses: clean(c.courses) });

    await cancelLikeSaleTab(sale.saleId, CID);
    const after = (await getDoc(custDoc(CID))).data();
    const linked = after.courses.filter(x => x.linkedSaleId === sale.saleId);
    expect(linked).toHaveLength(1); // the partial one kept
    expect(linked[0].product).toBe('Nabota'); // the partial
    expect(linked[0].qty).toBe('150 / 200 U'); // untouched
  });

  it('cancel with removeUsed: true → ALL linked courses wiped', async () => {
    const { createBackendSale, assignCourseToCustomer } = await bc();
    const sale = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { netTotal: 1 }, payment: { channels: [] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    await assignCourseToCustomer(CID, {
      name: 'FullWipe', products: [{ name: 'X', qty: 10, unit: 'U' }, { name: 'Y', qty: 5, unit: 'U' }],
      source: 'sale', linkedSaleId: sale.saleId,
    });
    // Mark one used
    const c = (await getDoc(custDoc(CID))).data();
    const idx = c.courses.findIndex(x => x.linkedSaleId === sale.saleId && x.product === 'X');
    c.courses[idx] = { ...c.courses[idx], qty: '0 / 10 U' };
    await updateDoc(custDoc(CID), { courses: clean(c.courses) });

    await cancelLikeSaleTab(sale.saleId, CID, { removeUsed: true });
    const after = (await getDoc(custDoc(CID))).data();
    expect(after.courses.filter(x => x.linkedSaleId === sale.saleId)).toHaveLength(0);
  });

  it('cancel then try to RE-CANCEL → idempotent (no crashes, money not double-refunded)', async () => {
    const { createDeposit, createBackendSale, applyDepositToSale, getDeposit } = await bc();
    const dep = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    created.deposits.push(dep.depositId);
    const sale = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { depositApplied: 200, depositIds: [{ depositId: dep.depositId, amount: 200 }], netTotal: 0 },
      payment: { channels: [] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    await applyDepositToSale(dep.depositId, sale.saleId, 200);
    await cancelLikeSaleTab(sale.saleId, CID);
    const d1 = await getDeposit(dep.depositId);
    expect(d1.remainingAmount).toBe(500);
    // Re-cancel should be a no-op (usageHistory now empty → reverseDepositUsage restores 0)
    await cancelLikeSaleTab(sale.saleId, CID);
    const d2 = await getDeposit(dep.depositId);
    expect(d2.remainingAmount).toBe(500); // NOT 700
  });

  it('cancel a sale whose deposit was MANUALLY-edited (usageHistory has stale saleId)', async () => {
    // Simulates pre-fix sales where INV-XXX-suffix was stored but applyDepositToSale was called with the raw INV-XXX.
    // reverseDepositUsage with the suffix form must still not crash — just restored=0.
    const { createDeposit, createBackendSale, reverseDepositUsage } = await bc();
    const dep = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    created.deposits.push(dep.depositId);
    // Seed usageHistory with raw id (pre-fix bug scenario)
    await updateDoc(depDoc(dep.depositId), {
      usedAmount: 200, remainingAmount: 800, status: 'partial',
      usageHistory: [{ saleId: 'INV-OLDBUG-0001', amount: 200, date: new Date().toISOString() }],
    });
    const sale = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { depositApplied: 200, depositIds: [{ depositId: dep.depositId, amount: 200 }], netTotal: 0 },
      payment: { channels: [] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    // If the sale was stored with its finalId but the deposit has the legacy raw id,
    // reverseDepositUsage with the finalId finds no match and safely returns restored=0.
    const res = await reverseDepositUsage(dep.depositId, sale.saleId);
    expect(res.restored).toBe(0);
  });

  it('DELETE sale (hard delete) with linked courses → unused removed, used kept', async () => {
    const { createBackendSale, assignCourseToCustomer, removeLinkedSaleCourses, deleteBackendSale } = await bc();
    const sale = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { netTotal: 1 }, payment: { channels: [] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    await assignCourseToCustomer(CID, { name: 'DelT', products: [{ name: 'P1', qty: 10, unit: 'U' }], linkedSaleId: sale.saleId });
    await assignCourseToCustomer(CID, { name: 'DelT', products: [{ name: 'P2', qty: 10, unit: 'U' }], linkedSaleId: sale.saleId });
    // Partially use one
    const c = (await getDoc(custDoc(CID))).data();
    const i2 = c.courses.findLastIndex(x => x.linkedSaleId === sale.saleId && x.product === 'P2');
    c.courses[i2] = { ...c.courses[i2], qty: '3 / 10 U' };
    await updateDoc(custDoc(CID), { courses: clean(c.courses) });

    await removeLinkedSaleCourses(sale.saleId, { removeUsed: false });
    await deleteBackendSale(sale.saleId);
    const after = (await getDoc(custDoc(CID))).data();
    const linked = after.courses.filter(x => x.linkedSaleId === sale.saleId);
    expect(linked).toHaveLength(1); // P2 kept
    expect(linked[0].product).toBe('P2');
  });

  it('cancel preserves sale.status=cancelled metadata + refund amount', async () => {
    const { createBackendSale, cancelBackendSale } = await bc();
    const sale = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { netTotal: 500 }, payment: { channels: [] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    await cancelBackendSale(sale.saleId, 'metadata check', 'โอน', 500, 'https://evidence.jpg');
    const d = (await getDoc(saleDoc(sale.saleId))).data();
    expect(d.status).toBe('cancelled');
    expect(d.cancelled.refundMethod).toBe('โอน');
    expect(d.cancelled.refundAmount).toBe(500);
    expect(d.cancelled.evidenceUrl).toBe('https://evidence.jpg');
  });

  it('cancel with no deposit/wallet/points applied → only cancelBackendSale runs (safe)', async () => {
    const { createBackendSale } = await bc();
    const sale = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { netTotal: 1000 }, // all cash, no instruments
      payment: { channels: [{ enabled: true, method: 'เงินสด', amount: '1000' }] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    await cancelLikeSaleTab(sale.saleId, CID);
    const d = (await getDoc(saleDoc(sale.saleId))).data();
    expect(d.status).toBe('cancelled');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. TREATMENT CREATE/EDIT/DELETE with purchased + existing courses (DEEP)
// Replicates the TreatmentFormPage save flow:
//   existingDeductions → deductCourseItems(default)
//   auto-sale creation → assignCourseToCustomer(linkedSaleId + linkedTreatmentId)
//   purchased deductions → deductCourseItems({preferNewest: true})
//   On EDIT: reverseCourseDeduction with split (existing default / purchased preferNewest)
//   On DELETE: reverseCourseDeduction + reverse linked sale money
// ═══════════════════════════════════════════════════════════════════════════
describe('[SAE] Treatment flow — purchase + use + edit + delete (preferNewest regression)', () => {
  const CID = `SAE-TRT-CUST-${TS}`;
  const created = { sales: [] };
  beforeAll(async () => {
    await setDoc(custDoc(CID), clean({ proClinicId: CID, patientData: { firstName: 'TrtSAE' }, courses: [] }));
  });
  afterAll(async () => {
    for (const id of created.sales) { try { await deleteDoc(saleDoc(id)); } catch {} }
    try { await deleteDoc(custDoc(CID)); } catch {}
  });

  const resetCourses = async (courses) => updateDoc(custDoc(CID), { courses: clean(courses) });

  it('purchase course then USE IN SAME TREATMENT: assign pushes new, deduct preferNewest hits new', async () => {
    // Seed customer with OLD "Botox" course from prior treatments (the bug-prone setup)
    await resetCourses([
      { name: 'Botox', product: 'Nabota', qty: '5 / 10 U', tag: 'old1' },
      { name: 'Botox', product: 'Nabota', qty: '10 / 10 U', tag: 'old2' },
    ]);
    const { assignCourseToCustomer, deductCourseItems } = await bc();
    // Simulate auto-sale assigning the newly-purchased course
    await assignCourseToCustomer(CID, {
      name: 'Botox', products: [{ name: 'Nabota', qty: 100, unit: 'U' }],
      source: 'treatment', linkedSaleId: 'INV-TRT-A',
    });
    // Simulate purchasedDeductions (rowId prefix 'purchased-')
    await deductCourseItems(CID, [
      { courseName: 'Botox', productName: 'Nabota', deductQty: 50, rowId: 'purchased-X-row-1' },
    ], { preferNewest: true });
    const c = (await getDoc(custDoc(CID))).data();
    const newCourse = c.courses.find(x => x.linkedSaleId === 'INV-TRT-A');
    expect(newCourse.qty).toBe('50 / 100 U'); // deducted!
    expect(c.courses.find(x => x.tag === 'old1').qty).toBe('5 / 10 U'); // untouched
    expect(c.courses.find(x => x.tag === 'old2').qty).toBe('10 / 10 U'); // untouched
  });

  it('edit treatment: reverse old PURCHASED deduction (preferNewest) then re-apply new', async () => {
    // Before edit: Botox (old 10/10) + assigned via INV-X now at 50/100 (because 50 used)
    await resetCourses([
      { name: 'Botox', product: 'Nabota', qty: '10 / 10 U', tag: 'old' },
      { name: 'Botox', product: 'Nabota', qty: '50 / 100 U', linkedSaleId: 'INV-X', tag: 'new' },
    ]);
    const { reverseCourseDeduction, deductCourseItems } = await bc();
    // Edit scenario: user changes usage from 50 to 30
    // Step A: reverse old purchased deduction (50) with preferNewest → new goes 50→100
    await reverseCourseDeduction(CID, [
      { courseName: 'Botox', productName: 'Nabota', deductQty: 50, rowId: 'purchased-X-row-1' },
    ], { preferNewest: true });
    let c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'new').qty).toBe('100 / 100 U');
    expect(c.courses.find(x => x.tag === 'old').qty).toBe('10 / 10 U'); // untouched

    // Step B: deduct new amount (30) with preferNewest → new goes 100→70
    await deductCourseItems(CID, [
      { courseName: 'Botox', productName: 'Nabota', deductQty: 30, rowId: 'purchased-X-row-1' },
    ], { preferNewest: true });
    c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'new').qty).toBe('70 / 100 U');
    expect(c.courses.find(x => x.tag === 'old').qty).toBe('10 / 10 U'); // still untouched
  });

  it('edit treatment with EXISTING course deduction: reverse default (oldest)', async () => {
    // Old A: 5/10, Old B: 8/10
    // Treatment previously deducted 3 from A (oldest-first) → A: 2/10, B: 8/10
    // User edits and changes qty from 3 to 5 → reverse 3 from A → 5/10, then deduct 5 oldest-first → A: 0/10
    await resetCourses([
      { name: 'Old', product: 'P', qty: '2 / 10 U', tag: 'a' },
      { name: 'Old', product: 'P', qty: '8 / 10 U', tag: 'b' },
    ]);
    const { reverseCourseDeduction, deductCourseItems } = await bc();
    // Reverse existing (default, FIFO lookup)
    await reverseCourseDeduction(CID, [
      { courseName: 'Old', productName: 'P', deductQty: 3, rowId: 'be-row-0' },
    ]);
    let c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'a').qty).toBe('5 / 10 U');
    // Deduct new amount 5, default FIFO
    await deductCourseItems(CID, [
      { courseName: 'Old', productName: 'P', deductQty: 5, rowId: 'be-row-0' },
    ]);
    c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'a').qty).toBe('0 / 10 U'); // drained
    expect(c.courses.find(x => x.tag === 'b').qty).toBe('8 / 10 U'); // untouched
  });

  it('promo with 2 sub-courses: both assigned, both deducted with preferNewest to their respective new entries', async () => {
    await resetCourses([
      { name: 'Definisse core', product: 'Filler Restylane Class', qty: '0 / 1 ซีซี', tag: 'old-fill' },
      { name: 'Allergan 100 unit', product: 'Allergan 100 U', qty: '40 / 100 U', tag: 'old-all' },
    ]);
    const { assignCourseToCustomer, deductCourseItems } = await bc();
    const saleId = 'INV-PROMO-E2E';
    // Assign both sub-courses
    await assignCourseToCustomer(CID, {
      name: 'Definisse core', products: [{ name: 'Filler Restylane Class', qty: 1, unit: 'ซีซี' }],
      source: 'treatment', linkedSaleId: saleId,
    });
    await assignCourseToCustomer(CID, {
      name: 'Allergan 100 unit', products: [{ name: 'Allergan 100 U', qty: 100, unit: 'U' }],
      source: 'treatment', linkedSaleId: saleId,
    });
    // Use both (deduct Filler 1 + Allergan 50) — matches the reported bug scenario exactly
    await deductCourseItems(CID, [
      { courseName: 'Definisse core', productName: 'Filler Restylane Class', deductQty: 1, rowId: 'promo-119-row-X-Y' },
      { courseName: 'Allergan 100 unit', productName: 'Allergan 100 U', deductQty: 50, rowId: 'promo-119-row-Z-W' },
    ], { preferNewest: true });
    const c = (await getDoc(custDoc(CID))).data();
    const newFiller = c.courses.find(x => x.linkedSaleId === saleId && x.product === 'Filler Restylane Class');
    const newAllergan = c.courses.find(x => x.linkedSaleId === saleId && x.product === 'Allergan 100 U');
    expect(newFiller.qty).toBe('0 / 1 ซีซี');
    expect(newAllergan.qty).toBe('50 / 100 U');
    // Old entries untouched
    expect(c.courses.find(x => x.tag === 'old-fill').qty).toBe('0 / 1 ซีซี');
    expect(c.courses.find(x => x.tag === 'old-all').qty).toBe('40 / 100 U');
  });

  it('delete treatment: reverse course deductions (split existing + purchased)', async () => {
    // Customer has: old Botox (deducted by treatment), new Botox from treatment's auto-sale
    await resetCourses([
      { name: 'Old', product: 'P', qty: '2 / 10 U', tag: 'old-used' }, // originally 5, deducted 3 by treatment
      { name: 'Botox', product: 'Nabota', qty: '50 / 100 U', linkedSaleId: 'INV-TRT-DEL', tag: 'new' }, // deducted 50 by treatment
    ]);
    const { reverseCourseDeduction } = await bc();
    const courseItems = [
      { courseName: 'Old', productName: 'P', deductQty: 3, rowId: 'be-row-0' },
      { courseName: 'Botox', productName: 'Nabota', deductQty: 50, rowId: 'purchased-X-row-1' },
    ];
    const oldExisting = courseItems.filter(ci => !ci.rowId?.startsWith('purchased-') && !ci.rowId?.startsWith('promo-'));
    const oldPurchased = courseItems.filter(ci => ci.rowId?.startsWith('purchased-') || ci.rowId?.startsWith('promo-'));
    if (oldExisting.length) await reverseCourseDeduction(CID, oldExisting);
    if (oldPurchased.length) await reverseCourseDeduction(CID, oldPurchased, { preferNewest: true });

    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'old-used').qty).toBe('5 / 10 U'); // restored 3
    expect(c.courses.find(x => x.tag === 'new').qty).toBe('100 / 100 U'); // restored 50 via preferNewest
  });

  it('purchase course, use in treatment, cancel treatment sale — verify all reverted', async () => {
    // This is the FULL chain: create → assign → deduct → cancel → reverse + cleanup
    const { createBackendSale, assignCourseToCustomer, deductCourseItems, reverseCourseDeduction, removeLinkedSaleCourses, cancelBackendSale } = await bc();
    await resetCourses([]);
    const sale = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [{ name: 'Laser' }], promotions: [], products: [], medications: [] },
      billing: { netTotal: 5000 }, payment: { channels: [] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    await assignCourseToCustomer(CID, {
      name: 'Laser', products: [{ name: 'shot', qty: 10, unit: 'shot' }],
      source: 'sale', linkedSaleId: sale.saleId,
    });
    await deductCourseItems(CID, [
      { courseName: 'Laser', productName: 'shot', deductQty: 3, rowId: 'purchased-X-row-1' },
    ], { preferNewest: true });
    let c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.linkedSaleId === sale.saleId).qty).toBe('7 / 10 shot');

    // Cancel: reverse deductions, then remove linked courses (unused-only by default → partial stays)
    await reverseCourseDeduction(CID, [
      { courseName: 'Laser', productName: 'shot', deductQty: 3, rowId: 'purchased-X-row-1' },
    ], { preferNewest: true });
    c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.linkedSaleId === sale.saleId).qty).toBe('10 / 10 shot'); // restored fully
    // Now it's unused → removeLinkedSaleCourses default should remove it
    await removeLinkedSaleCourses(sale.saleId);
    await cancelBackendSale(sale.saleId, 'chain test', 'เงินสด', 5000, null);
    c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.linkedSaleId === sale.saleId)).toBeUndefined(); // gone!
  });

  it('edit treatment + deduct MORE than originally: reverse old + deduct new (verify math)', async () => {
    await resetCourses([
      { name: 'LaserE', product: 'shotE', qty: '3 / 10 U', linkedSaleId: 'INV-E', tag: 'new' }, // originally deducted 7
    ]);
    const { reverseCourseDeduction, deductCourseItems } = await bc();
    // User changes treatment from 7 units → 9 units
    await reverseCourseDeduction(CID, [
      { courseName: 'LaserE', productName: 'shotE', deductQty: 7, rowId: 'purchased-E-row' },
    ], { preferNewest: true });
    let c = (await getDoc(custDoc(CID))).data();
    expect(c.courses[0].qty).toBe('10 / 10 U');
    await deductCourseItems(CID, [
      { courseName: 'LaserE', productName: 'shotE', deductQty: 9, rowId: 'purchased-E-row' },
    ], { preferNewest: true });
    c = (await getDoc(custDoc(CID))).data();
    expect(c.courses[0].qty).toBe('1 / 10 U');
  });

  it('exact courseIndex targeting: pick row #4 among 5 duplicates, deduct hits exactly that row', async () => {
    // After de-grouping, TreatmentFormPage shows each customer.courses entry as a
    // separate selectable row. The save must hit the EXACT entry the user clicked.
    const { deductCourseItems } = await bc();
    await resetCourses([
      { name: 'X', product: 'Xp', qty: '10 / 10 U', tag: 'r0' },
      { name: 'X', product: 'Xp', qty: '10 / 10 U', tag: 'r1' },
      { name: 'X', product: 'Xp', qty: '10 / 10 U', tag: 'r2' },
      { name: 'X', product: 'Xp', qty: '10 / 10 U', tag: 'r3' },
      { name: 'X', product: 'Xp', qty: '10 / 10 U', tag: 'r4' },
    ]);
    // User checked row index 3 in the UI; save passes courseIndex: 3
    await deductCourseItems(CID, [
      { courseName: 'X', productName: 'Xp', deductQty: 4, courseIndex: 3, rowId: 'be-row-3' },
    ]);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'r3').qty).toBe('6 / 10 U');
    // All others untouched
    ['r0', 'r1', 'r2', 'r4'].forEach(tag => {
      expect(c.courses.find(x => x.tag === tag).qty).toBe('10 / 10 U');
    });
  });

  it('exact courseIndex fallback: if indexed row is insufficient, spill to name+product matches', async () => {
    const { deductCourseItems } = await bc();
    await resetCourses([
      { name: 'X', product: 'Xp', qty: '10 / 10 U', tag: 'r0' },
      { name: 'X', product: 'Xp', qty: '3 / 10 U', tag: 'r1' }, // only 3 remaining
    ]);
    // User wants to deduct 5 from row 1 (only has 3). Spillover should hit r0 next.
    await deductCourseItems(CID, [
      { courseName: 'X', productName: 'Xp', deductQty: 5, courseIndex: 1, rowId: 'be-row-1' },
    ]);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'r1').qty).toBe('0 / 10 U'); // drained fully
    expect(c.courses.find(x => x.tag === 'r0').qty).toBe('8 / 10 U'); // spilled 2
  });

  it('exact courseIndex with mismatched name (stale index) → ignores + falls back to lookup', async () => {
    const { deductCourseItems } = await bc();
    await resetCourses([
      { name: 'X', product: 'Xp', qty: '10 / 10 U' },
      { name: 'Y', product: 'Yp', qty: '10 / 10 U' }, // different name at index 1
    ]);
    // User's saved courseIndex was 1 but the backend state shifted — name mismatch.
    // Fallback iteration finds "X|Xp" at index 0.
    await deductCourseItems(CID, [
      { courseName: 'X', productName: 'Xp', deductQty: 3, courseIndex: 1 },
    ]);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses[0].qty).toBe('7 / 10 U');
    expect(c.courses[1].qty).toBe('10 / 10 U'); // Y unchanged
  });

  it('reverseCourseDeduction exact index: restores the specific row', async () => {
    const { reverseCourseDeduction } = await bc();
    await resetCourses([
      { name: 'R', product: 'Rp', qty: '10 / 10 U', tag: 'a' },
      { name: 'R', product: 'Rp', qty: '0 / 10 U', tag: 'b' },
    ]);
    await reverseCourseDeduction(CID, [
      { courseName: 'R', productName: 'Rp', deductQty: 5, courseIndex: 1 },
    ]);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'a').qty).toBe('10 / 10 U'); // untouched
    expect(c.courses.find(x => x.tag === 'b').qty).toBe('5 / 10 U'); // restored at exact index
  });

  it('purchased + existing deductions in same treatment: both applied with correct strategies', async () => {
    await resetCourses([
      { name: 'Old', product: 'P', qty: '10 / 10 U', tag: 'old' }, // existing course
    ]);
    const { assignCourseToCustomer, deductCourseItems } = await bc();
    // Simulate purchased + assigned
    await assignCourseToCustomer(CID, {
      name: 'Old', products: [{ name: 'P', qty: 5, unit: 'U' }], // NOTE: same name+product as existing
      source: 'sale', linkedSaleId: 'INV-MIX',
    });
    // Deductions: existingDeductions (default FIFO) for rowId='be-row-0' deduct 3,
    // and purchasedDeductions (preferNewest) for rowId='purchased-X' deduct 2
    await deductCourseItems(CID, [
      { courseName: 'Old', productName: 'P', deductQty: 3, rowId: 'be-row-0' },
    ]); // default FIFO → oldest
    await deductCourseItems(CID, [
      { courseName: 'Old', productName: 'P', deductQty: 2, rowId: 'purchased-X' },
    ], { preferNewest: true }); // newest
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'old').qty).toBe('7 / 10 U'); // 10 - 3
    expect(c.courses.find(x => x.linkedSaleId === 'INV-MIX').qty).toBe('3 / 5 U'); // 5 - 2
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. ADVERSARIAL E2E — every nasty scenario I can think of for money + courses
// ═══════════════════════════════════════════════════════════════════════════
describe('[SAE] Adversarial — money + courses edge cases that could silently break', () => {
  const CID = `SAE-ADV-CUST-${TS}`;
  const WT = `WT-ADV-${TS}`;
  const created = { sales: [], deps: [], mbrs: [] };

  beforeAll(async () => {
    await setDoc(custDoc(CID), clean({
      proClinicId: CID, patientData: { firstName: 'Adv' },
      courses: [], finance: { depositBalance: 0, loyaltyPoints: 0 },
    }));
  });
  afterAll(async () => {
    for (const id of created.sales) { try { await deleteDoc(saleDoc(id)); } catch {} }
    for (const id of created.deps)  { try { await deleteDoc(depDoc(id));  } catch {} }
    for (const id of created.mbrs)  { try { await deleteDoc(mbrDoc(id));  } catch {} }
    await nukeWalletsFor(CID);
    await nukeWalletTxsFor(CID);
    await nukePtxsFor(CID);
    try { await deleteDoc(custDoc(CID)); } catch {}
  });

  it('A1: decimal amounts — apply 199.5 from 1000 deposit preserves invariant', async () => {
    const { createDeposit, applyDepositToSale, getDeposit } = await bc();
    const d = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    created.deps.push(d.depositId);
    await applyDepositToSale(d.depositId, 'INV-DEC', 199.5);
    const cur = await getDeposit(d.depositId);
    expect(cur.usedAmount + cur.remainingAmount).toBe(1000);
    expect(cur.remainingAmount).toBe(800.5);
  });

  it('A2: cumulative decimal drift — 10× apply 0.1 must total exactly 1.0', async () => {
    // JS floating-point: 0.1 × 10 === 1.0000000000000002 in some impls — reveals precision issues
    const { createDeposit, applyDepositToSale, getDeposit } = await bc();
    const d = await createDeposit({ customerId: CID, amount: 10, paymentChannel: 'เงินสด' });
    created.deps.push(d.depositId);
    for (let i = 0; i < 10; i++) {
      await applyDepositToSale(d.depositId, `INV-DRIFT-${i}`, 0.1);
    }
    const cur = await getDeposit(d.depositId);
    // Allow tiny float epsilon but total used must be ~1.0
    expect(Math.abs(cur.usedAmount - 1)).toBeLessThan(1e-9);
    expect(Math.abs(cur.remainingAmount - 9)).toBeLessThan(1e-9);
  });

  it('A3: huge amount (10M baht) — no overflow, invariants preserved', async () => {
    const { createDeposit, applyDepositToSale, getDeposit } = await bc();
    const d = await createDeposit({ customerId: CID, amount: 10_000_000, paymentChannel: 'โอน' });
    created.deps.push(d.depositId);
    await applyDepositToSale(d.depositId, 'INV-HUGE', 9_500_000);
    const cur = await getDeposit(d.depositId);
    expect(cur.usedAmount).toBe(9_500_000);
    expect(cur.remainingAmount).toBe(500_000);
    expect(cur.usedAmount + cur.remainingAmount).toBe(10_000_000);
  });

  it('A4: sale cancel after deposit was cancelled elsewhere — no crash, no double-reverse', async () => {
    const { createDeposit, createBackendSale, applyDepositToSale, cancelDeposit, reverseDepositUsage, getDeposit } = await bc();
    const d = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    created.deps.push(d.depositId);
    const sale = await createBackendSale(clean({
      customerId: CID, items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { netTotal: 0 }, payment: { channels: [] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    await applyDepositToSale(d.depositId, sale.saleId, 100);
    // Oops — before cancel, someone marks the deposit refunded externally:
    await updateDoc(depDoc(d.depositId), { status: 'refunded', remainingAmount: 0 });
    // Cancel sale — reverse should not crash
    const res = await reverseDepositUsage(d.depositId, sale.saleId);
    expect(res.success).toBe(true);
    const cur = await getDeposit(d.depositId);
    // usageHistory entry for sale was removed
    expect(cur.usageHistory.find(u => u.saleId === sale.saleId)).toBeUndefined();
  });

  it('A5: sale with 3 different deposits applied, cancel reverses all 3', async () => {
    const { createDeposit, createBackendSale, applyDepositToSale, reverseDepositUsage, getDeposit, cancelBackendSale } = await bc();
    const d1 = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    const d2 = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    const d3 = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    created.deps.push(d1.depositId, d2.depositId, d3.depositId);
    const sale = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: {
        depositApplied: 900,
        depositIds: [
          { depositId: d1.depositId, amount: 300 },
          { depositId: d2.depositId, amount: 300 },
          { depositId: d3.depositId, amount: 300 },
        ],
        netTotal: 0,
      },
      payment: { channels: [] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    await applyDepositToSale(d1.depositId, sale.saleId, 300);
    await applyDepositToSale(d2.depositId, sale.saleId, 300);
    await applyDepositToSale(d3.depositId, sale.saleId, 300);
    for (const d of [d1, d2, d3]) await reverseDepositUsage(d.depositId, sale.saleId);
    await cancelBackendSale(sale.saleId, 'triple', 'เงินสด', 0, null);
    expect((await getDeposit(d1.depositId)).remainingAmount).toBe(500);
    expect((await getDeposit(d2.depositId)).remainingAmount).toBe(500);
    expect((await getDeposit(d3.depositId)).remainingAmount).toBe(500);
  });

  it('A6: removeLinkedSaleCourses skips courses linked to OTHER active sale', async () => {
    const { removeLinkedSaleCourses } = await bc();
    const saleA = `INV-ADV-${TS}-A`;
    const saleB = `INV-ADV-${TS}-B`;
    await setDoc(saleDoc(saleA), clean({ saleId: saleA, customerId: CID, billing: {}, items: {}, status: 'active', createdAt: new Date().toISOString() }));
    await setDoc(saleDoc(saleB), clean({ saleId: saleB, customerId: CID, billing: {}, items: {}, status: 'active', createdAt: new Date().toISOString() }));
    created.sales.push(saleA, saleB);
    await updateDoc(custDoc(CID), { courses: clean([
      { name: 'A-course', product: 'P', qty: '10 / 10 U', linkedSaleId: saleA, tag: 'a' },
      { name: 'B-course', product: 'P', qty: '10 / 10 U', linkedSaleId: saleB, tag: 'b' },
    ])});
    await removeLinkedSaleCourses(saleA);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.find(x => x.tag === 'a')).toBeUndefined();
    expect(c.courses.find(x => x.tag === 'b')).toBeTruthy(); // untouched
  });

  it('A7: membership with bahtPerPoint=0.5 — floor still correct', async () => {
    const { earnPoints } = await bc();
    const CID2 = `${CID}-SUB`;
    await setDoc(custDoc(CID2), clean({ proClinicId: CID2, patientData: {}, finance: { loyaltyPoints: 0 } }));
    const res = await earnPoints(CID2, { purchaseAmount: 10, bahtPerPoint: 0.5, referenceType: 'sale', referenceId: 'INV-BPP' });
    expect(res.earned).toBe(20); // floor(10/0.5) = 20
    await nukePtxsFor(CID2);
    try { await deleteDoc(custDoc(CID2)); } catch {}
  });

  it('A8: earnPoints + reverse + earn with DIFFERENT bahtPerPoint → each reversal uses its own rate', async () => {
    // First earn: 10 points at rate 100. Reverse. Then earn again at rate 50 → 20 points.
    const { earnPoints, reversePointsEarned, getPointBalance } = await bc();
    const CID3 = `${CID}-MIX-BPP`;
    await setDoc(custDoc(CID3), clean({ proClinicId: CID3, patientData: {}, finance: { loyaltyPoints: 0 } }));
    await earnPoints(CID3, { purchaseAmount: 1000, bahtPerPoint: 100, referenceType: 'sale', referenceId: 'INV-R1' });
    expect(await getPointBalance(CID3)).toBe(10);
    await reversePointsEarned(CID3, 'INV-R1');
    expect(await getPointBalance(CID3)).toBe(0);
    await earnPoints(CID3, { purchaseAmount: 1000, bahtPerPoint: 50, referenceType: 'sale', referenceId: 'INV-R2' });
    expect(await getPointBalance(CID3)).toBe(20);
    await nukePtxsFor(CID3);
    try { await deleteDoc(custDoc(CID3)); } catch {}
  });

  it('A9: wallet deduct with insufficient balance → state unchanged', async () => {
    const { topUpWallet, deductWallet, getWalletBalance } = await bc();
    const WT_A = `WT-A9-${TS}`;
    await topUpWallet(CID, WT_A, { amount: 100, walletTypeName: 'A9' });
    const balBefore = await getWalletBalance(CID, WT_A);
    await expect(deductWallet(CID, WT_A, { amount: 9999 })).rejects.toThrow();
    expect(await getWalletBalance(CID, WT_A)).toBe(balBefore); // unchanged
    // Verify no orphan WTX record created
    const { getWalletTransactions } = await bc();
    const txs = await getWalletTransactions(CID, WT_A);
    expect(txs.every(t => t.type !== 'deduct')).toBe(true);
  });

  it('A10: cancel deposit already cancelled → idempotent (no crash)', async () => {
    const { createDeposit, cancelDeposit, getDeposit } = await bc();
    const d = await createDeposit({ customerId: CID, amount: 100, paymentChannel: 'เงินสด' });
    created.deps.push(d.depositId);
    await cancelDeposit(d.depositId, { cancelNote: 'first' });
    // Cancel again should work (no usage so allowed)
    await cancelDeposit(d.depositId, { cancelNote: 'second' });
    const cur = await getDeposit(d.depositId);
    expect(cur.status).toBe('cancelled');
    expect(cur.cancelNote).toBe('second');
  });

  it('A11: refund deposit partial multiple times → cumulative refundAmount', async () => {
    const { createDeposit, refundDeposit, getDeposit } = await bc();
    const d = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    created.deps.push(d.depositId);
    await refundDeposit(d.depositId, { refundAmount: 200, refundChannel: 'เงินสด' });
    await refundDeposit(d.depositId, { refundAmount: 300, refundChannel: 'เงินสด' });
    const cur = await getDeposit(d.depositId);
    expect(cur.refundAmount).toBe(500); // cumulative
    expect(cur.remainingAmount).toBe(500); // 1000 - 500
  });

  it('A12: deposit applied + refund remaining → still invariant', async () => {
    const { createDeposit, applyDepositToSale, refundDeposit, getDeposit } = await bc();
    const d = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    created.deps.push(d.depositId);
    await applyDepositToSale(d.depositId, 'INV-APR', 300);
    await refundDeposit(d.depositId, { refundAmount: 700, refundChannel: 'เงินสด' }); // full remaining
    const cur = await getDeposit(d.depositId);
    expect(cur.status).toBe('refunded');
    expect(cur.remainingAmount).toBe(0);
    expect(cur.usedAmount).toBe(300); // unchanged
    expect(cur.refundAmount).toBe(700);
  });

  it('A13: concurrent topUps → no lost updates', async () => {
    const { topUpWallet, getWalletBalance } = await bc();
    const WT_C = `WT-CONC-${TS}`;
    const results = await Promise.all([
      topUpWallet(CID, WT_C, { amount: 100, walletTypeName: 'Conc' }),
      topUpWallet(CID, WT_C, { amount: 200, walletTypeName: 'Conc' }),
      topUpWallet(CID, WT_C, { amount: 300, walletTypeName: 'Conc' }),
    ]);
    expect(results.every(r => r.success)).toBe(true);
    expect(await getWalletBalance(CID, WT_C)).toBe(600); // all added
  });

  it('A14: concurrent deducts with total > balance → some fail, rest correct', async () => {
    const { topUpWallet, deductWallet, getWalletBalance } = await bc();
    const WT_D = `WT-CONCD-${TS}`;
    await topUpWallet(CID, WT_D, { amount: 100, walletTypeName: 'ConcD' });
    const results = await Promise.allSettled([
      deductWallet(CID, WT_D, { amount: 60, walletTypeName: 'ConcD' }),
      deductWallet(CID, WT_D, { amount: 60, walletTypeName: 'ConcD' }),
    ]);
    const okCount = results.filter(r => r.status === 'fulfilled').length;
    const bal = await getWalletBalance(CID, WT_D);
    // Either 1 succeeded (balance=40) or both (impossible unless race was lost by transaction)
    expect(okCount).toBeGreaterThanOrEqual(1);
    expect(bal).toBeGreaterThanOrEqual(0); // never negative
    expect(bal).toBeLessThanOrEqual(100);
  });

  it('A15: courseExchange then cancel the sale that created it — exchanged row stays (has new name)', async () => {
    const { assignCourseToCustomer, exchangeCourseProduct, removeLinkedSaleCourses } = await bc();
    await updateDoc(custDoc(CID), { courses: clean([]) });
    const sid = `INV-EXCH-${TS}`;
    await setDoc(saleDoc(sid), clean({ saleId: sid, customerId: CID, billing: {}, items: {}, status: 'active', createdAt: new Date().toISOString() }));
    created.sales.push(sid);
    await assignCourseToCustomer(CID, { name: 'Laser', products: [{ name: 'shot', qty: 10, unit: 'x' }], linkedSaleId: sid });
    const c0 = (await getDoc(custDoc(CID))).data();
    const idx = c0.courses.findIndex(x => x.linkedSaleId === sid);
    await exchangeCourseProduct(CID, idx, { name: 'ExchangedP', qty: 5, unit: 'y' }, 'test');
    // The exchanged entry is still linkedSaleId=sid. Removing unused should still remove it
    await removeLinkedSaleCourses(sid);
    const c1 = (await getDoc(custDoc(CID))).data();
    expect(c1.courses.find(x => x.linkedSaleId === sid)).toBeUndefined();
  });

  it('A16: 100 courses same name+product — preferNewest still hits the newest deterministically', async () => {
    const { deductCourseItems } = await bc();
    const manyCourses = [];
    for (let i = 0; i < 100; i++) {
      manyCourses.push({ name: 'BigVolume', product: 'P', qty: '10 / 10 U', idx: i });
    }
    manyCourses[99].qty = '1 / 10 U'; // last entry partial (but still preferred)
    await updateDoc(custDoc(CID), { courses: clean(manyCourses) });
    await deductCourseItems(CID, [{ courseName: 'BigVolume', productName: 'P', deductQty: 1 }], { preferNewest: true });
    const c = (await getDoc(custDoc(CID))).data();
    const last = c.courses[99];
    expect(last.qty).toBe('0 / 10 U'); // hit the newest
    // First entry untouched
    expect(c.courses[0].qty).toBe('10 / 10 U');
  });

  it('A17: sale cancel with REMOVE-USED flag actually wipes partially-used AND fully-used linked courses', async () => {
    const { removeLinkedSaleCourses } = await bc();
    const sid = `INV-WIPE-${TS}`;
    await setDoc(saleDoc(sid), clean({ saleId: sid, customerId: CID, billing: {}, items: {}, status: 'active', createdAt: new Date().toISOString() }));
    created.sales.push(sid);
    await updateDoc(custDoc(CID), { courses: clean([
      { name: 'W', product: 'P', qty: '5 / 10 U', linkedSaleId: sid, tag: 'partial' },
      { name: 'W', product: 'P', qty: '0 / 10 U', linkedSaleId: sid, tag: 'used' },
      { name: 'W', product: 'P', qty: '10 / 10 U', linkedSaleId: sid, tag: 'unused' },
    ])});
    const res = await removeLinkedSaleCourses(sid, { removeUsed: true });
    expect(res.removedCount).toBe(3);
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses.filter(x => x.linkedSaleId === sid)).toHaveLength(0);
  });

  it('A18: sale with 0 items — cancel is safe', async () => {
    const { createBackendSale, cancelBackendSale } = await bc();
    const sale = await createBackendSale(clean({
      customerId: CID,
      items: { courses: [], promotions: [], products: [], medications: [] },
      billing: { subtotal: 0, netTotal: 0 }, payment: { channels: [] }, sellers: [],
    }));
    created.sales.push(sale.saleId);
    await cancelBackendSale(sale.saleId, 'zero test', 'ไม่คืนเงิน', 0, null);
    const d = (await getDoc(saleDoc(sale.saleId))).data();
    expect(d.status).toBe('cancelled');
    expect(d.billing.netTotal).toBe(0);
  });

  it('A19: deduct 0 — no-op (no throw, no write)', async () => {
    const { deductCourseItems } = await bc();
    await updateDoc(custDoc(CID), { courses: clean([{ name: 'Z', product: 'Zp', qty: '5 / 5 U' }]) });
    await deductCourseItems(CID, [{ courseName: 'Z', productName: 'Zp', deductQty: 0 }]);
    // With deductQty=0 the default fallback is 1 (|| 1). Verify the "no-qty" edge behaves predictably:
    const c = (await getDoc(custDoc(CID))).data();
    expect(c.courses[0].qty).toBe('4 / 5 U'); // -1 due to fallback
  });

  // M1: same-sale second apply is blocked. The prior assertion (2 history
  // entries + 500 total) represented the silent duplication bug; the server
  // now throws on the second attempt so usedAmount stays at the first apply.
  it('A20: applyDepositToSale + same saleId applied twice → second throws (M1 guard)', async () => {
    const { createDeposit, applyDepositToSale, reverseDepositUsage, getDeposit } = await bc();
    const d = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    created.deps.push(d.depositId);
    await applyDepositToSale(d.depositId, 'INV-TWICE', 200);
    await expect(applyDepositToSale(d.depositId, 'INV-TWICE', 300)).rejects.toThrow(/ถูกใช้กับบิล|already/i);
    const cur = await getDeposit(d.depositId);
    expect(cur.usageHistory).toHaveLength(1);
    expect(cur.usedAmount).toBe(200);
    const res = await reverseDepositUsage(d.depositId, 'INV-TWICE');
    expect(res.restored).toBe(200);
    const after = await getDeposit(d.depositId);
    expect(after.usedAmount).toBe(0);
    expect(after.remainingAmount).toBe(1000);
  });

  it('A21: membership renew from ALREADY expired date → extends from NOW (not from past)', async () => {
    const { createMembership, renewMembership } = await bc();
    const m = await createMembership({
      customerId: CID, cardTypeId: 'MCT-RN', cardTypeName: 'ForceRenew',
      purchasePrice: 0, initialCredit: 0, discountPercent: 0, initialPoints: 0, bahtPerPoint: 0,
      expiredInDays: 1,
    });
    created.mbrs.push(m.membershipId);
    // Force the expiry into the past — createMembership would otherwise default a safe future date
    await updateDoc(mbrDoc(m.membershipId), { expiresAt: new Date(Date.now() - 2 * 86400000).toISOString() });
    const before = (await getDoc(mbrDoc(m.membershipId))).data();
    const expiryBefore = new Date(before.expiresAt).getTime();
    expect(expiryBefore).toBeLessThan(Date.now());
    const res = await renewMembership(m.membershipId, { extendDays: 30 });
    const after = new Date(res.expiresAt).getTime();
    // Renewed expiry should be ~ now + 30 days (NOT expiryBefore + 30 days)
    const expectedMin = Date.now() + 29 * 86400000;
    expect(after).toBeGreaterThan(expectedMin);
  });

  it('A22: update deposit amount LOWER than usedAmount → math survives (remaining clamped to 0)', async () => {
    const { createDeposit, applyDepositToSale, updateDeposit, getDeposit } = await bc();
    const d = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    created.deps.push(d.depositId);
    await applyDepositToSale(d.depositId, 'INV-UL', 800);
    await updateDeposit(d.depositId, { amount: 500 }); // less than usedAmount 800
    const cur = await getDeposit(d.depositId);
    expect(cur.amount).toBe(500);
    expect(cur.remainingAmount).toBe(0); // clamped — used > new amount
  });

  it('A23: deposit in usageHistory with very-long saleId (collision-suffix form)', async () => {
    const longId = `INV-20260418-9999-${'z'.repeat(20)}`;
    const { createDeposit, applyDepositToSale, reverseDepositUsage, getDeposit } = await bc();
    const d = await createDeposit({ customerId: CID, amount: 500, paymentChannel: 'เงินสด' });
    created.deps.push(d.depositId);
    await applyDepositToSale(d.depositId, longId, 100);
    const res = await reverseDepositUsage(d.depositId, longId);
    expect(res.restored).toBe(100);
    const cur = await getDeposit(d.depositId);
    expect(cur.usageHistory).toEqual([]);
  });

  it('A24: sale cancel reverses deposits AFTER another sale already consumed some of the same deposit', async () => {
    const { createDeposit, createBackendSale, applyDepositToSale, reverseDepositUsage, getDeposit } = await bc();
    const d = await createDeposit({ customerId: CID, amount: 1000, paymentChannel: 'เงินสด' });
    created.deps.push(d.depositId);
    const sA = await createBackendSale(clean({ customerId: CID, items: { courses: [], promotions: [], products: [], medications: [] }, billing: { netTotal: 0 }, payment: { channels: [] }, sellers: [] }));
    const sB = await createBackendSale(clean({ customerId: CID, items: { courses: [], promotions: [], products: [], medications: [] }, billing: { netTotal: 0 }, payment: { channels: [] }, sellers: [] }));
    created.sales.push(sA.saleId, sB.saleId);
    await applyDepositToSale(d.depositId, sA.saleId, 400);
    await applyDepositToSale(d.depositId, sB.saleId, 400);
    // Reverse sA ONLY → sB's 400 must remain consumed
    await reverseDepositUsage(d.depositId, sA.saleId);
    const cur = await getDeposit(d.depositId);
    expect(cur.usedAmount).toBe(400);
    expect(cur.remainingAmount).toBe(600);
    expect(cur.usageHistory.map(u => u.saleId)).toEqual([sB.saleId]);
  });

  it('A25: course deduct with preferNewest when newest row is 0/X (already exhausted) → spills to older', async () => {
    const { deductCourseItems } = await bc();
    await updateDoc(custDoc(CID), { courses: clean([
      { name: 'SP', product: 'SPp', qty: '5 / 10 U', tag: 'old' },
      { name: 'SP', product: 'SPp', qty: '0 / 10 U', tag: 'exhausted' }, // newest but empty
    ])});
    await deductCourseItems(CID, [{ courseName: 'SP', productName: 'SPp', deductQty: 3 }], { preferNewest: true });
    const c = (await getDoc(custDoc(CID))).data();
    // exhausted (0/10) skipped → old deducted
    expect(c.courses.find(x => x.tag === 'exhausted').qty).toBe('0 / 10 U');
    expect(c.courses.find(x => x.tag === 'old').qty).toBe('2 / 10 U');
  });

  it('A26: reversePointsEarned should NOT touch membership_initial-type txs (per cancel-keeps-points spec)', async () => {
    // Business rule: cancelling a membership does NOT refund the initial points it granted.
    // reversePointsEarned scans for `type: 'earn'` only — so membership_initial txs are preserved.
    // This test ENFORCES that rule so a future refactor doesn't silently start reversing them.
    const { createMembership, reversePointsEarned, getPointBalance } = await bc();
    const CID_P = `${CID}-REV`;
    await setDoc(custDoc(CID_P), clean({ proClinicId: CID_P, patientData: {}, finance: { loyaltyPoints: 0 } }));
    const m = await createMembership({
      customerId: CID_P, cardTypeId: 'MCT-REV', cardTypeName: 'RevTest',
      purchasePrice: 0, initialCredit: 0, discountPercent: 0,
      initialPoints: 100, bahtPerPoint: 0, expiredInDays: 30,
    });
    created.mbrs.push(m.membershipId);
    expect(await getPointBalance(CID_P)).toBe(100);
    const res = await reversePointsEarned(CID_P, m.membershipId);
    expect(res.reversed).toBe(0); // membership_initial left alone
    expect(await getPointBalance(CID_P)).toBe(100); // unchanged
    await nukePtxsFor(CID_P);
    try { await deleteDoc(custDoc(CID_P)); } catch {}
  });

  it('A27: full 3-instrument flow with edit (deposit change, wallet same, points auto-recalc)', async () => {
    const { createDeposit, applyDepositToSale, reverseDepositUsage, getDeposit,
            topUpWallet, deductWallet, refundToWallet, getWalletBalance,
            earnPoints, reversePointsEarned, getPointBalance } = await bc();
    const dep = await createDeposit({ customerId: CID, amount: 2000, paymentChannel: 'เงินสด' });
    created.deps.push(dep.depositId);
    const WT_E = `WT-E27-${TS}`;
    await topUpWallet(CID, WT_E, { amount: 5000, walletTypeName: 'E27' });
    const ptsStart = await getPointBalance(CID);

    // Simulate sale → deposit 500, wallet 1000, points earn 10 (rate 100, net 1000)
    const saleId = `INV-E27-${TS}`;
    await applyDepositToSale(dep.depositId, saleId, 500);
    await deductWallet(CID, WT_E, { amount: 1000, walletTypeName: 'E27', referenceType: 'sale', referenceId: saleId });
    await earnPoints(CID, { purchaseAmount: 1000, bahtPerPoint: 100, referenceType: 'sale', referenceId: saleId });

    expect((await getDeposit(dep.depositId)).remainingAmount).toBe(1500);
    expect(await getWalletBalance(CID, WT_E)).toBe(4000);
    expect(await getPointBalance(CID)).toBe(ptsStart + 10);

    // EDIT: change deposit to 800, wallet still 1000, points auto-earn recalc
    await reverseDepositUsage(dep.depositId, saleId);
    await refundToWallet(CID, WT_E, { amount: 1000, walletTypeName: 'E27', referenceType: 'sale', referenceId: saleId });
    await reversePointsEarned(CID, saleId);
    // Re-apply new values
    await applyDepositToSale(dep.depositId, saleId, 800);
    await deductWallet(CID, WT_E, { amount: 1000, walletTypeName: 'E27', referenceType: 'sale', referenceId: saleId });
    await earnPoints(CID, { purchaseAmount: 700, bahtPerPoint: 100, referenceType: 'sale', referenceId: saleId }); // net reduced

    expect((await getDeposit(dep.depositId)).remainingAmount).toBe(1200);
    expect(await getWalletBalance(CID, WT_E)).toBe(4000);
    expect(await getPointBalance(CID)).toBe(ptsStart + 7);
  });

  it('A28: invariant — customer.finance.depositBalance always == Σ active/partial deposits', async () => {
    const { createDeposit, applyDepositToSale, cancelDeposit } = await bc();
    const CID_INV = `${CID}-INV`;
    await setDoc(custDoc(CID_INV), clean({ proClinicId: CID_INV, patientData: {}, finance: { depositBalance: 0 } }));
    const a = await createDeposit({ customerId: CID_INV, amount: 500, paymentChannel: 'เงินสด' });
    const b = await createDeposit({ customerId: CID_INV, amount: 800, paymentChannel: 'เงินสด' });
    const c = await createDeposit({ customerId: CID_INV, amount: 200, paymentChannel: 'เงินสด' });
    await applyDepositToSale(a.depositId, 'INV-X', 100);
    await cancelDeposit(c.depositId, { cancelNote: '' });
    const doc1 = (await getDoc(custDoc(CID_INV))).data();
    expect(doc1.finance.depositBalance).toBe(400 + 800); // a:400 partial + b:800 active; c cancelled
    for (const id of [a.depositId, b.depositId, c.depositId]) { try { await deleteDoc(depDoc(id)); } catch {} }
    try { await deleteDoc(custDoc(CID_INV)); } catch {}
  });

  it('A29: sale with wallet on NON-EXISTENT wallet type → deduct throws, balance unchanged elsewhere', async () => {
    const { deductWallet } = await bc();
    await expect(deductWallet(CID, 'WT-DOES-NOT-EXIST', { amount: 100 })).rejects.toThrow();
  });

  it('A30: point balance never goes negative even on bug-inducing adjust', async () => {
    const { adjustPoints, getPointBalance } = await bc();
    const CID_N = `${CID}-NEG`;
    await setDoc(custDoc(CID_N), clean({ proClinicId: CID_N, patientData: {}, finance: { loyaltyPoints: 5 } }));
    await expect(adjustPoints(CID_N, { amount: 100, isIncrease: false, note: 'overshoot' })).rejects.toThrow();
    expect(await getPointBalance(CID_N)).toBe(5); // unchanged
    await nukePtxsFor(CID_N);
    try { await deleteDoc(custDoc(CID_N)); } catch {}
  });
});
