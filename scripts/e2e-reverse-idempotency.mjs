#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R22 — reverse/refund idempotency (money-leak class) ──────
//
// systematic-debugging 4-system loop. Root cause (code-read, backendClient.js):
//   refundToWallet (5096)        — credited wallet with NO net-outstanding guard.
//   reversePointsEarned (5638)   — summed type==='earn' only (ignored 'reverse').
// Both re-applied on every call. Contrast: applyDepositToSale HAS M1 idempotency;
// reverseStockForSale HAS S5 CAS; applySaleCancelToCourses skips terminal status.
//
// Fix (V153): each is NET-based — reverse/refund only up to the NET still-
// outstanding for the saleId (Σdeduct−Σrefund for wallet; Σearn−Σreverse for
// points). This makes a DUPLICATE cancel→delete a NO-OP, WITHOUT breaking the
// EDIT path (which legitimately refunds→re-deducts the SAME saleId per edit).
//
// Scenarios (real prod, shipped client-SDK fns):
//   W  — sale uses wallet → cancel refunds once → delete is a NO-OP (idempotent)
//   WE — sale-EDIT refund→deduct ×2 → wallet ends correct (fix must NOT block this)
//   P  — points reverse twice on one sale → 2nd is a NO-OP
//   PE — points edit(reverse→re-earn) ×2 → cancel → delete → net stays correct
// Rule Q L2 (real prod). Rule M/R: TEST- namespace + full cleanup.
// Run: node scripts/e2e-reverse-idempotency.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { refundToWallet, deductWallet, reversePointsEarned, earnPoints } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-REVIDEM-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const cleanup = [];
  const readWalletBal = async (cid, wt) => {
    const s = await data.collection('be_customer_wallets').doc(`${cid}__${wt}`).get();
    return s.exists ? (Number(s.data().balance) || 0) : 0;
  };
  const readPoints = async (cid) => {
    const s = await data.collection('be_customers').doc(cid).get();
    return s.exists ? (Number(s.data()?.finance?.loyaltyPoints) || 0) : 0;
  };
  const setPoints = async (cid, p) => { await data.collection('be_customers').doc(cid).update({ 'finance.loyaltyPoints': p }); };
  const addEarnTx = async (cid, ref, amt, tag) => {
    const id = `${NS}-${tag}`;
    await data.collection('be_point_transactions').doc(id).set({
      ptxId: id, customerId: cid, type: 'earn', amount: amt,
      referenceType: 'sale', referenceId: ref, note: 'seed earn', createdAt: new Date().toISOString(),
    });
  };
  const countTxns = async (col, ref, type) =>
    (await data.collection(col).where('referenceId', '==', ref).where('type', '==', type).get()).size;

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — reverse/refund idempotency (money-leak class)\n`);

    // ── W — wallet cancel→delete idempotency (with a real prior deduct) ───────
    console.log('W — sale uses 100 wallet → cancel refunds once → delete is NO-OP');
    const CW = `${NS}-W`, WT = `${NS}-wt`, SIDW = `${NS}-W-sale`;
    cleanup.push(['be_customers', CW], ['be_customer_wallets', `${CW}__${WT}`]);
    await data.collection('be_customers').doc(CW).set({ customerId: CW, fullName: 'RevIdem W', branchId: `${NS}-BR`, finance: {}, createdAt: new Date().toISOString() });
    await data.collection('be_customer_wallets').doc(`${CW}__${WT}`).set({ customerId: CW, walletTypeId: WT, walletTypeName: 'Test Wallet', balance: 500, totalUsed: 0, createdAt: new Date().toISOString() });
    await deductWallet(CW, WT, { amount: 100, walletTypeName: 'Test Wallet', referenceType: 'sale', referenceId: SIDW, note: 'sale uses wallet' });
    const wAfterDeduct = await readWalletBal(CW, WT);
    await refundToWallet(CW, WT, { amount: 100, walletTypeName: 'Test Wallet', referenceType: 'sale', referenceId: SIDW, note: 'cancel' });
    const wAfterCancel = await readWalletBal(CW, WT);
    await refundToWallet(CW, WT, { amount: 100, walletTypeName: 'Test Wallet', referenceType: 'sale', referenceId: SIDW, note: 'delete cancelled sale' });
    const wAfterDelete = await readWalletBal(CW, WT);
    const wRefunds = await countTxns('be_wallet_transactions', SIDW, 'refund');
    console.log(`  balance: deduct=${wAfterDeduct} cancel=${wAfterCancel} delete=${wAfterDelete}; refund txns=${wRefunds}`);
    check('W1 — deduct 100 applied (500→400)', wAfterDeduct === 400, `got ${wAfterDeduct}`);
    check('W2 — cancel refunds once (400→500)', wAfterCancel === 500, `got ${wAfterCancel}`);
    check('W3 — delete is NO-OP (stays 500, not 600)', wAfterDelete === 500, `got ${wAfterDelete} (LEAK +${wAfterDelete - 500})`);
    check('W4 — exactly ONE refund txn', wRefunds === 1, `got ${wRefunds}`);

    // ── WE — sale EDIT refund→deduct ×2 must NOT be blocked (regression guard) ─
    console.log('\nWE — sale-edit refund→deduct ×2 (same wallet, new saleId) → ends at 400');
    const SIDE = `${NS}-WE-sale`;
    await deductWallet(CW, WT, { amount: 100, walletTypeName: 'Test Wallet', referenceType: 'sale', referenceId: SIDE, note: 'original sale' }); // 500→400
    // edit #1
    await refundToWallet(CW, WT, { amount: 100, walletTypeName: 'Test Wallet', referenceType: 'sale', referenceId: SIDE, note: 'edit1 reverse' }); // 400→500
    await deductWallet(CW, WT, { amount: 100, walletTypeName: 'Test Wallet', referenceType: 'sale', referenceId: SIDE, note: 'edit1 reapply' }); // 500→400
    // edit #2
    await refundToWallet(CW, WT, { amount: 100, walletTypeName: 'Test Wallet', referenceType: 'sale', referenceId: SIDE, note: 'edit2 reverse' }); // 400→500 (must NOT skip)
    await deductWallet(CW, WT, { amount: 100, walletTypeName: 'Test Wallet', referenceType: 'sale', referenceId: SIDE, note: 'edit2 reapply' }); // 500→400
    const weFinal = await readWalletBal(CW, WT);
    console.log(`  balance after original + 2 edits = ${weFinal} (want 400; pre-fix bug would skip edit2 refund → 300)`);
    check('WE1 — edit refund→deduct works repeatedly (balance 400, not 300)', weFinal === 400, `got ${weFinal}`);

    // ── P — points cancel→delete idempotency (single earn) ────────────────────
    console.log('\nP — sale earned 50 pts → reverse(cancel) → reverse(delete) NO-OP');
    const CP = `${NS}-P`, SIDP = `${NS}-P-sale`;
    cleanup.push(['be_customers', CP], ['be_point_transactions', `${NS}-Pearn`]);
    await data.collection('be_customers').doc(CP).set({ customerId: CP, fullName: 'RevIdem P', branchId: `${NS}-BR`, finance: { loyaltyPoints: 100 }, createdAt: new Date().toISOString() });
    await addEarnTx(CP, SIDP, 50, 'Pearn');
    await reversePointsEarned(CP, SIDP);
    const pCancel = await readPoints(CP);
    await reversePointsEarned(CP, SIDP);
    const pDelete = await readPoints(CP);
    const pRev = await countTxns('be_point_transactions', SIDP, 'reverse');
    console.log(`  points: cancel=${pCancel} delete=${pDelete}; reverse txns=${pRev}`);
    check('P1 — cancel reverses 50 (100→50)', pCancel === 50, `got ${pCancel}`);
    check('P2 — delete is NO-OP (stays 50, not 0)', pDelete === 50, `got ${pDelete} (over-reversed ${50 - pDelete})`);
    check('P3 — exactly ONE reverse txn', pRev === 1, `got ${pRev}`);

    // ── PE — points edit(reverse→re-earn) ×2 → cancel → delete: net stays right ─
    console.log('\nPE — edit reverse→re-earn ×2 → cancel → delete (net-reverse correctness)');
    const CP2 = `${NS}-PE`, SIDP2 = `${NS}-PE-sale`;
    cleanup.push(['be_customers', CP2], ['be_point_transactions', `${NS}-PEe1`]);
    await data.collection('be_customers').doc(CP2).set({ customerId: CP2, fullName: 'RevIdem PE', branchId: `${NS}-BR`, finance: { loyaltyPoints: 50 }, createdAt: new Date().toISOString() });
    // V158: PEe1 = legacy original earn via raw addEarnTx (NO pointsSaleNet marker)
    // → exercises the legacy-SEED reverse path; the re-earns go through the REAL
    // earnPoints (which maintains the marker in-tx) → faithfully mirrors a legacy
    // sale (earned pre-V158) edited post-V158. R14 covers the all-real edit flow.
    await addEarnTx(CP2, SIDP2, 50, 'PEe1');                 // legacy original earned 50 (no marker), points=50
    await reversePointsEarned(CP2, SIDP2);                    // edit1 reverse → seed 50 → points 0, marker→0
    await earnPoints(CP2, { purchaseAmount: 500, bahtPerPoint: 10, referenceType: 'sale', referenceId: SIDP2 });  // edit1 re-earn 50 → points 50, marker 50
    await reversePointsEarned(CP2, SIDP2);                    // edit2 reverse → marker 50 → points 0, marker→0
    await earnPoints(CP2, { purchaseAmount: 500, bahtPerPoint: 10, referenceType: 'sale', referenceId: SIDP2 });  // edit2 re-earn 50 → points 50, marker 50
    await reversePointsEarned(CP2, SIDP2);                    // cancel → net (150-100)=50 → points 0
    const peCancel = await readPoints(CP2);
    await reversePointsEarned(CP2, SIDP2);                    // delete → net (150-150)=0 → NO-OP
    const peDelete = await readPoints(CP2);
    const peRev = await countTxns('be_point_transactions', SIDP2, 'reverse');
    console.log(`  points: cancel=${peCancel} delete=${peDelete}; reverse txns=${peRev}`);
    check('PE1 — after cancel, the live 50 is reversed (points 0)', peCancel === 0, `got ${peCancel}`);
    check('PE2 — delete is NO-OP (points stay 0)', peDelete === 0, `got ${peDelete}`);
    check('PE3 — exactly 3 reverse txns (edit1, edit2, cancel; delete no-op)', peRev === 3, `got ${peRev}`);

  } finally {
    try {
      for (const sid of [`${NS}-W-sale`, `${NS}-WE-sale`, `${NS}-P-sale`, `${NS}-PE-sale`]) {
        for (const col of ['be_wallet_transactions', 'be_point_transactions']) {
          const snap = await data.collection(col).where('referenceId', '==', sid).get();
          for (const d of snap.docs) await d.ref.delete();
        }
      }
      for (const [col, id] of cleanup) { try { await data.collection(col).doc(id).delete(); } catch {} }
    } catch (e) { console.warn('cleanup warning:', e.message); }
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — wallet refund + points reverse idempotent on cancel→delete; edit refund→deduct intact');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
