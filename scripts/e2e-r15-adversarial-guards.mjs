#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R15 — adversarial money-guard boundary testing ───────────
//
// Fresh angle: hammer the money fns with bad inputs — over-apply (> remaining),
// over-deduct (> balance), zero / negative / NaN, double-apply (M1), over-refund.
// Every guard must REJECT (throw) and leave the doc UNCORRUPTED (no partial write,
// no negative balance, no phantom usage).
// Rule Q L2 (real prod). Rule M/R: TEST- namespace + cleanup.
// Run: node scripts/e2e-r15-adversarial-guards.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { applyDepositToSale, deductWallet, refundDeposit } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-R15-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); }
}
async function rejects(fn) { try { await fn(); return false; } catch { return true; } }
function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  const out = {};
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
  const C = `${NS}-cust`, W = `${NS}-wt`, D = `${NS}-dep`;
  const dep = async () => (await data.collection('be_deposits').doc(D).get()).data();
  const wal = async () => Number((await data.collection('be_customer_wallets').doc(`${C}__${W}`).get()).data().balance) || 0;

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — adversarial money-guard boundary\n`);
    await data.collection('be_customers').doc(C).set({ customerId: C, fullName: 'R15', branchId: `${NS}-BR`, finance: {}, createdAt: new Date().toISOString() });
    await data.collection('be_customer_wallets').doc(`${C}__${W}`).set({ customerId: C, walletTypeId: W, walletTypeName: 'R15', balance: 500, totalUsed: 0, createdAt: new Date().toISOString() });
    await data.collection('be_deposits').doc(D).set({ depositId: D, customerId: C, branchId: `${NS}-BR`, amount: 500, usedAmount: 0, remainingAmount: 500, refundAmount: 0, status: 'active', usageHistory: [], createdAt: new Date().toISOString() });

    // DEPOSIT guards
    console.log('DEPOSIT — over-apply / zero / negative / NaN / double-apply');
    check('G1 over-apply (600 > 500 rem) rejects', await rejects(() => applyDepositToSale(D, `${NS}-s1`, 600)));
    check('G2 zero rejects', await rejects(() => applyDepositToSale(D, `${NS}-s2`, 0)));
    check('G3 negative rejects', await rejects(() => applyDepositToSale(D, `${NS}-s3`, -100)));
    check('G4 NaN rejects', await rejects(() => applyDepositToSale(D, `${NS}-s4`, NaN)));
    check('G5 deposit UNCORRUPTED after bad inputs (rem still 500, used 0)', (await dep()).remainingAmount === 500 && (await dep()).usedAmount === 0, `rem=${(await dep()).remainingAmount} used=${(await dep()).usedAmount}`);
    // valid apply then double-apply (M1)
    await applyDepositToSale(D, `${NS}-sOK`, 200);
    check('G6 valid apply 200 → rem 300', (await dep()).remainingAmount === 300, `rem=${(await dep()).remainingAmount}`);
    check('G7 double-apply same sale (M1) rejects', await rejects(() => applyDepositToSale(D, `${NS}-sOK`, 200)));
    check('G8 deposit still rem 300 after rejected double-apply (no phantom)', (await dep()).remainingAmount === 300, `rem=${(await dep()).remainingAmount}`);

    // WALLET guards
    console.log('\nWALLET — over-deduct / zero / negative');
    check('G9 over-deduct (600 > 500 bal) rejects', await rejects(() => deductWallet(C, W, { amount: 600, referenceType: 'sale', referenceId: `${NS}-w1` })));
    check('G10 zero rejects', await rejects(() => deductWallet(C, W, { amount: 0, referenceType: 'sale', referenceId: `${NS}-w2` })));
    check('G11 negative rejects', await rejects(() => deductWallet(C, W, { amount: -50, referenceType: 'sale', referenceId: `${NS}-w3` })));
    check('G12 wallet UNCORRUPTED (still 500, never negative)', (await wal()) === 500, `bal=${await wal()}`);

    // REFUND-DEPOSIT guards
    console.log('\nREFUND-DEPOSIT — over-refund (> remaining) / zero');
    check('G13 over-refund (400 > 300 rem) rejects', await rejects(() => refundDeposit(D, { refundAmount: 400 })));
    check('G14 zero refund rejects', await rejects(() => refundDeposit(D, { refundAmount: 0 })));
    check('G15 deposit UNCORRUPTED after bad refunds (rem still 300)', (await dep()).remainingAmount === 300 && (Number((await dep()).refundAmount) || 0) === 0, `rem=${(await dep()).remainingAmount} refund=${(await dep()).refundAmount}`);

  } finally {
    try {
      for (const col of ['be_wallet_transactions']) { const snap = await data.collection(col).where('customerId', '==', C).get(); for (const d of snap.docs) await d.ref.delete(); }
      for (const [col, id] of [['be_customers', C], ['be_customer_wallets', `${C}__${W}`], ['be_deposits', D]]) { try { await data.collection(col).doc(id).delete(); } catch {} }
    } catch (e) { console.warn('cleanup warning:', e.message); }
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — every money guard rejects bad input + leaves the doc uncorrupted');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
