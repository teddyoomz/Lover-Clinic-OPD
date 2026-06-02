#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R23 — deposit refund↔reverse conservation (money-leak) ───
//
// Root cause (code-read, backendClient.js:4837 reverseDepositUsage):
//   newRemaining = amount - newUsed   ← DROPS the `- refundAmount` term.
// Deposit invariant is remaining = amount - usedAmount - refundAmount. So if a
// deposit was partially APPLIED to a sale AND then partially manual-REFUNDED
// (refundDeposit), cancelling the sale recomputes remaining from `amount` and
// FORGETS the manual refund → deposit balance over-states by the refunded
// amount → phantom spendable money.
//
// Sequence proved here (real prod, TEST- fixtures):
//   deposit 1000 → applyDepositToSale(saleX, 500) → remaining 500
//                → refundDeposit(200)             → remaining 300, refundAmount 200
//                → reverseDepositUsage(saleX)      → remaining SHOULD be 800
//   BEFORE fix → remaining=1000 (LEAK +200) → FAILS.  AFTER fix → 800 → PASS.
// Rule Q L2. Rule M/R: TEST- namespace + cleanup.
// Run: node scripts/e2e-deposit-refund-reverse.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { applyDepositToSale, refundDeposit, reverseDepositUsage } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-DEPREV-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const C = `${NS}-cust`, DID = `${NS}-dep`, SALEX = `${NS}-saleX`;
  const readDep = async () => (await data.collection('be_deposits').doc(DID).get()).data();

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — deposit refund↔reverse conservation\n`);

    // seed customer + a 1000 deposit
    await data.collection('be_customers').doc(C).set({
      customerId: C, fullName: 'DepRev Test', branchId: `${NS}-BR`,
      finance: {}, createdAt: new Date().toISOString(),
    });
    await data.collection('be_deposits').doc(DID).set({
      depositId: DID, customerId: C, branchId: `${NS}-BR`,
      amount: 1000, usedAmount: 0, remainingAmount: 1000, refundAmount: 0,
      status: 'active', usageHistory: [], createdAt: new Date().toISOString(),
    });

    console.log('seq: apply 500 to saleX → manual refund 200 → cancel saleX (reverse)');
    await applyDepositToSale(DID, SALEX, 500);
    const d1 = await readDep();
    check('D1 — after apply 500: remaining=500, used=500', d1.remainingAmount === 500 && d1.usedAmount === 500, `remaining=${d1.remainingAmount} used=${d1.usedAmount}`);

    await refundDeposit(DID, { refundAmount: 200, refundChannel: 'เงินสด', note: 'manual partial refund' });
    const d2 = await readDep();
    check('D2 — after refund 200: remaining=300, refundAmount=200', d2.remainingAmount === 300 && (Number(d2.refundAmount) || 0) === 200, `remaining=${d2.remainingAmount} refundAmount=${d2.refundAmount}`);

    await reverseDepositUsage(DID, SALEX);
    const d3 = await readDep();
    console.log(`  after reverse: amount=${d3.amount} used=${d3.usedAmount} refundAmount=${d3.refundAmount} remaining=${d3.remainingAmount}`);
    // remaining MUST honor the already-refunded 200: 1000 - used(0) - refund(200) = 800
    check('D3 — reverse honors prior manual refund (remaining=800, NOT 1000)', d3.remainingAmount === 800, `remaining=${d3.remainingAmount} (LEAK +${d3.remainingAmount - 800} phantom baht)`);
    check('D4 — conservation: remaining === amount - used - refundAmount', d3.remainingAmount === (Number(d3.amount) || 0) - (Number(d3.usedAmount) || 0) - (Number(d3.refundAmount) || 0), `${d3.remainingAmount} vs ${(Number(d3.amount) || 0) - (Number(d3.usedAmount) || 0) - (Number(d3.refundAmount) || 0)}`);
    check('D5 — usage removed (usedAmount back to 0)', (Number(d3.usedAmount) || 0) === 0, `used=${d3.usedAmount}`);

    // Control: a deposit reversed WITHOUT any manual refund still restores fully.
    const DID2 = `${NS}-dep2`, SALEY = `${NS}-saleY`;
    await data.collection('be_deposits').doc(DID2).set({
      depositId: DID2, customerId: C, branchId: `${NS}-BR`,
      amount: 1000, usedAmount: 0, remainingAmount: 1000, refundAmount: 0,
      status: 'active', usageHistory: [], createdAt: new Date().toISOString(),
    });
    await applyDepositToSale(DID2, SALEY, 400);
    await reverseDepositUsage(DID2, SALEY);
    const d4 = (await data.collection('be_deposits').doc(DID2).get()).data();
    check('D6 — no-refund control: reverse restores full 1000', d4.remainingAmount === 1000, `remaining=${d4.remainingAmount}`);

  } finally {
    for (const id of [`${NS}-dep`, `${NS}-dep2`]) { try { await data.collection('be_deposits').doc(id).delete(); } catch {} }
    try { await data.collection('be_customers').doc(C).delete(); } catch {}
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — deposit reverse honors prior manual refund (conservation holds)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
