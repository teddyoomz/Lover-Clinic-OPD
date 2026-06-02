#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R14 — sale-EDIT reconciliation (reverse-old → apply-new) ──
//
// Fresh angle: editing a sale's finance channels must reverse the OLD amounts
// then apply the NEW, netting correctly (no double-count, no stale residue). This
// is the SaleTab/TFP edit path (reverse old deposit/wallet/points → updateSale →
// apply new). Exercises the V153 net-outstanding wallet guard + V154 deposit +
// M1 deposit-apply-after-reverse + V149 points net under a real edit.
// Rule Q L2 (real prod). Rule M/R: TEST- namespace + cleanup.
// Run: node scripts/e2e-r14-edit-reconciliation.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { applyDepositToSale, deductWallet, earnPoints, reverseDepositUsage, refundToWallet, reversePointsEarned } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-R14-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) });
  return adminFirestore();
}
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const C = `${NS}-cust`, W = `${NS}-wt`, D = `${NS}-dep`, SID = `${NS}-sale`;
  const dep = async () => (await data.collection('be_deposits').doc(D).get()).data();
  const wal = async () => Number((await data.collection('be_customer_wallets').doc(`${C}__${W}`).get()).data().balance) || 0;
  const pts = async () => Number((await data.collection('be_customers').doc(C).get()).data().finance?.loyaltyPoints) || 0;

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — sale-edit reconciliation\n`);
    await data.collection('be_customers').doc(C).set({ customerId: C, fullName: 'R14', branchId: `${NS}-BR`, finance: { loyaltyPoints: 200 }, createdAt: new Date().toISOString() });
    await data.collection('be_customer_wallets').doc(`${C}__${W}`).set({ customerId: C, walletTypeId: W, walletTypeName: 'R14', balance: 1000, totalUsed: 0, createdAt: new Date().toISOString() });
    await data.collection('be_deposits').doc(D).set({ depositId: D, customerId: C, branchId: `${NS}-BR`, amount: 1000, usedAmount: 0, remainingAmount: 1000, refundAmount: 0, status: 'active', usageHistory: [], createdAt: new Date().toISOString() });

    // ORIGINAL sale: deposit 300, wallet 200, earn 50 (500/10)
    console.log('ORIGINAL — deposit 300 / wallet 200 / +50 pts');
    await applyDepositToSale(D, SID, 300);
    await deductWallet(C, W, { amount: 200, walletTypeName: 'R14', referenceType: 'sale', referenceId: SID });
    await earnPoints(C, { purchaseAmount: 500, bahtPerPoint: 10, referenceType: 'sale', referenceId: SID });
    check('O1 deposit rem 700 / wallet 800 / pts 250', (await dep()).remainingAmount === 700 && (await wal()) === 800 && (await pts()) === 250, `rem=${(await dep()).remainingAmount} wal=${await wal()} pts=${await pts()}`);

    // EDIT (reverse old → apply new): deposit 500, wallet 100, earn 30 (300/10)
    console.log('\nEDIT — reverse old, apply new: deposit 500 / wallet 100 / +30 pts');
    await reverseDepositUsage(D, SID); await applyDepositToSale(D, SID, 500);
    await refundToWallet(C, W, { amount: 200, walletTypeName: 'R14', referenceType: 'sale', referenceId: SID }); await deductWallet(C, W, { amount: 100, walletTypeName: 'R14', referenceType: 'sale', referenceId: SID });
    await reversePointsEarned(C, SID); await earnPoints(C, { purchaseAmount: 300, bahtPerPoint: 10, referenceType: 'sale', referenceId: SID });
    const dE = await dep(), wE = await wal(), pE = await pts();
    console.log(`  deposit used=${dE.usedAmount} rem=${dE.remainingAmount}; wallet=${wE}; pts=${pE}`);
    check('E1 deposit reflects NEW 500 only (used 500 / rem 500, not 800-used)', dE.usedAmount === 500 && dE.remainingAmount === 500, `used=${dE.usedAmount} rem=${dE.remainingAmount}`);
    check('E2 wallet reflects NEW 100 net (1000−100=900, not 700)', wE === 900, `wal=${wE}`);
    check('E3 points reflect NEW 30 earned (200+30=230, not 280)', pE === 230, `pts=${pE}`);

    // CANCEL the edited sale → conserve to baseline
    console.log('\nCANCEL edited sale → baseline');
    await reverseDepositUsage(D, SID);
    await refundToWallet(C, W, { amount: 100, walletTypeName: 'R14', referenceType: 'sale', referenceId: SID });
    await reversePointsEarned(C, SID);
    const dF = await dep(), wF = await wal(), pF = await pts();
    check('X1 deposit back to 1000', dF.remainingAmount === 1000 && dF.usedAmount === 0, `used=${dF.usedAmount} rem=${dF.remainingAmount}`);
    check('X2 wallet back to 1000', wF === 1000, `wal=${wF}`);
    check('X3 points back to 200', pF === 200, `pts=${pF}`);

  } finally {
    try {
      for (const col of ['be_wallet_transactions', 'be_point_transactions']) {
        const snap = await data.collection(col).where('referenceId', '==', SID).get();
        for (const d of snap.docs) await d.ref.delete();
      }
      for (const [col, id] of [['be_customers', C], ['be_customer_wallets', `${C}__${W}`], ['be_deposits', D]]) { try { await data.collection(col).doc(id).delete(); } catch {} }
    } catch (e) { console.warn('cleanup warning:', e.message); }
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — sale edit reverses-old + applies-new with correct net (no double-count); cancel conserves');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
