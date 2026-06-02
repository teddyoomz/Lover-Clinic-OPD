#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R13 — full cancel-cascade conservation + double-cascade ──
//
// Integration angle not yet e2e'd TOGETHER: apply ALL finance+course channels to
// one sale (deposit + wallet + points + course) via the REAL shipped fns, then
// run the FULL cancel cascade in SaleTab order, asserting EVERY channel conserves
// back to baseline. Then a cancel→DELETE double-cascade → assert NO channel
// double-applies (V153/V154 idempotency holding across the whole cascade, not
// just per-fn). Stock is covered by R16-R21 separately; this round = finance+course.
// Rule Q L2 (real prod). Rule M/R: TEST- namespace + cleanup.
// Run: node scripts/e2e-r13-cancel-cascade-conservation.mjs
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
  applyDepositToSale, deductWallet, earnPoints,
  reverseDepositUsage, refundToWallet, reversePointsEarned, applySaleCancelToCourses,
} from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-R13-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const C = `${NS}-cust`, W = `${NS}-wt`, D = `${NS}-dep`, SID = `${NS}-sale`;
  const readDep = async () => (await data.collection('be_deposits').doc(D).get()).data();
  const readWallet = async () => (await data.collection('be_customer_wallets').doc(`${C}__${W}`).get()).data();
  const readCust = async () => (await data.collection('be_customers').doc(C).get()).data();
  const courseStatus = async () => {
    const c = (await readCust()).courses || [];
    const m = c.find(x => String(x.linkedSaleId) === SID);
    return m ? m.status : '(missing)';
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — full cancel-cascade conservation\n`);

    // ── seed: customer (200 pts + 1 active course linked to SID), wallet 1000, deposit 1000, sale doc
    await data.collection('be_customers').doc(C).set({
      customerId: C, fullName: 'R13 Test', branchId: `${NS}-BR`,
      finance: { loyaltyPoints: 200 },
      courses: [{ name: 'R13 Course', status: 'active', linkedSaleId: SID, products: [{ name: 'R13 Course', qty: '5', remaining: '5' }] }],
      createdAt: new Date().toISOString(),
    });
    await data.collection('be_customer_wallets').doc(`${C}__${W}`).set({ customerId: C, walletTypeId: W, walletTypeName: 'R13', balance: 1000, totalUsed: 0, createdAt: new Date().toISOString() });
    await data.collection('be_deposits').doc(D).set({ depositId: D, customerId: C, branchId: `${NS}-BR`, amount: 1000, usedAmount: 0, remainingAmount: 1000, refundAmount: 0, status: 'active', usageHistory: [], createdAt: new Date().toISOString() });
    await data.collection('be_sales').doc(SID).set({ saleId: SID, customerId: C, branchId: `${NS}-BR`, billing: { depositApplied: 300, walletApplied: 200, netTotal: 500 }, status: 'active', createdAt: new Date().toISOString() });

    // ── APPLY (a sale's effects) via the REAL fns
    console.log('APPLY — deposit 300 + wallet 200 + earn 50 pts (500/10) + course active');
    await applyDepositToSale(D, SID, 300);
    await deductWallet(C, W, { amount: 200, walletTypeName: 'R13', referenceType: 'sale', referenceId: SID });
    await earnPoints(C, { purchaseAmount: 500, bahtPerPoint: 10, referenceType: 'sale', referenceId: SID });
    const depA = await readDep(), walA = await readWallet(), cusA = await readCust();
    check('A1 deposit used 300 / remaining 700', depA.usedAmount === 300 && depA.remainingAmount === 700, `used=${depA.usedAmount} rem=${depA.remainingAmount}`);
    check('A2 wallet 1000→800', (Number(walA.balance) || 0) === 800, `bal=${walA.balance}`);
    check('A3 points 200→250 (earned 50)', (Number(cusA.finance?.loyaltyPoints) || 0) === 250, `pts=${cusA.finance?.loyaltyPoints}`);

    // ── CANCEL cascade (SaleTab order: deposit → wallet → points → course)
    console.log('\nCANCEL — reverse all channels → must conserve to baseline');
    await reverseDepositUsage(D, SID);
    await refundToWallet(C, W, { amount: 200, walletTypeName: 'R13', referenceType: 'sale', referenceId: SID });
    await reversePointsEarned(C, SID);
    await applySaleCancelToCourses(SID, 'refund', { reason: 'R13 test' });
    const depC = await readDep(), walC = await readWallet(), cusC = await readCust();
    check('C1 deposit restored (used 0 / remaining 1000)', depC.usedAmount === 0 && depC.remainingAmount === 1000, `used=${depC.usedAmount} rem=${depC.remainingAmount}`);
    check('C2 wallet restored 800→1000', (Number(walC.balance) || 0) === 1000, `bal=${walC.balance}`);
    check('C3 points restored 250→200', (Number(cusC.finance?.loyaltyPoints) || 0) === 200, `pts=${cusC.finance?.loyaltyPoints}`);
    check('C4 course flipped to คืนเงิน', (await courseStatus()) === 'คืนเงิน', `status=${await courseStatus()}`);

    // ── DELETE (double-cascade on the cancelled sale) — must be NO-OP everywhere
    console.log('\nDELETE — re-run the whole cascade → must NOT double-apply (idempotent)');
    await reverseDepositUsage(D, SID);
    await refundToWallet(C, W, { amount: 200, walletTypeName: 'R13', referenceType: 'sale', referenceId: SID });
    await reversePointsEarned(C, SID);
    await applySaleCancelToCourses(SID, 'refund', { reason: 'R13 delete' });
    const depD = await readDep(), walD = await readWallet(), cusD = await readCust();
    check('D1 deposit unchanged (still 1000, no over-restore)', depD.remainingAmount === 1000, `rem=${depD.remainingAmount}`);
    check('D2 wallet unchanged (still 1000, NOT 1200 — no double refund)', (Number(walD.balance) || 0) === 1000, `bal=${walD.balance} (LEAK +${(Number(walD.balance) || 0) - 1000})`);
    check('D3 points unchanged (still 200, no over-reverse)', (Number(cusD.finance?.loyaltyPoints) || 0) === 200, `pts=${cusD.finance?.loyaltyPoints}`);
    check('D4 course still คืนเงิน (idempotent skip)', (await courseStatus()) === 'คืนเงิน', `status=${await courseStatus()}`);

  } finally {
    try {
      for (const col of ['be_wallet_transactions', 'be_point_transactions']) {
        const snap = await data.collection(col).where('referenceId', '==', SID).get();
        for (const d of snap.docs) await d.ref.delete();
      }
      const cc = await data.collection('be_course_changes').where('customerId', '==', C).get();
      for (const d of cc.docs) await d.ref.delete();
      for (const [col, id] of [['be_customers', C], ['be_customer_wallets', `${C}__${W}`], ['be_deposits', D], ['be_sales', SID]]) {
        try { await data.collection(col).doc(id).delete(); } catch {}
      }
    } catch (e) { console.warn('cleanup warning:', e.message); }
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — full cancel cascade conserves all channels + cancel→delete is idempotent');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
