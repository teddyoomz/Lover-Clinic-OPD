#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R10 — refundDeposit / cancelDeposit atomicity (Rule T) ────
//
// Root cause (code-read, backendClient.js): refundDeposit (4681) + cancelDeposit
// (4660) are getDoc→updateDoc (NON-atomic money RMW). Two concurrent refunds
// (or a double-click) both read the same remaining/refundAmount, both write from
// the stale base → LAST WRITE WINS → one refund's record is LOST → refundAmount
// understates the money actually paid out → the deposit shows MORE remaining than
// reality → customer can re-spend already-refunded money. Same class as V149
// (points) / V148 (courses) / M5 (wallet) — the Rule-T atomic-RMW family.
//
// This e2e fires 2 concurrent refundDeposit(300) on a 1000 deposit and asserts
// CONSERVATION: (# successful refunds) × 300 === recorded refundAmount, and
// remaining === amount − used − refundAmount.
//   BEFORE fix → both succeed but refundAmount=300 (one lost) → FAILS.
//   AFTER fix  → OCC serializes → refundAmount=600, remaining=400 → PASS.
// Rule Q L2 (real prod). Rule M/R: TEST- namespace + cleanup.
// Run: node scripts/e2e-deposit-refund-atomicity.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { refundDeposit, cancelDeposit } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-DEPATOM-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const C = `${NS}-cust`;
  const seedDep = async (id) => {
    await data.collection('be_deposits').doc(id).set({
      depositId: id, customerId: C, branchId: `${NS}-BR`,
      amount: 1000, usedAmount: 0, remainingAmount: 1000, refundAmount: 0,
      status: 'active', usageHistory: [], createdAt: new Date().toISOString(),
    });
  };
  const readDep = async (id) => (await data.collection('be_deposits').doc(id).get()).data();

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — deposit refund/cancel atomicity (Rule T)\n`);
    await data.collection('be_customers').doc(C).set({ customerId: C, fullName: 'DepAtom', branchId: `${NS}-BR`, finance: {}, createdAt: new Date().toISOString() });

    // R — concurrent refundDeposit ×2 (each 300) on a 1000 deposit
    console.log('R — 2 concurrent refundDeposit(300) on a 1000 deposit → both must record');
    const DID = `${NS}-dep`; await seedDep(DID);
    const res = await Promise.allSettled([
      refundDeposit(DID, { refundAmount: 300, refundChannel: 'เงินสด', note: 'concurrent A' }),
      refundDeposit(DID, { refundAmount: 300, refundChannel: 'เงินสด', note: 'concurrent B' }),
    ]);
    const ok = res.filter(r => r.status === 'fulfilled').length;
    const d = await readDep(DID);
    const refundAmt = Number(d.refundAmount) || 0, remaining = Number(d.remainingAmount) || 0, used = Number(d.usedAmount) || 0;
    console.log(`  ${ok}/2 refunds succeeded; refundAmount=${refundAmt} remaining=${remaining}`);
    check('R1 — recorded refundAmount === (successful refunds)×300 (no lost update)', refundAmt === ok * 300, `refundAmount=${refundAmt}, expected ${ok * 300}`);
    check('R2 — conservation: remaining === amount − used − refundAmount', remaining === 1000 - used - refundAmt, `remaining=${remaining} vs ${1000 - used - refundAmt}`);
    cleanupId(DID);

    // C — concurrent cancelDeposit ×2 on a fresh deposit → both safe, status cancelled
    console.log('\nC — 2 concurrent cancelDeposit on a fresh 1000 deposit');
    const DID2 = `${NS}-dep2`; await seedDep(DID2);
    const res2 = await Promise.allSettled([
      cancelDeposit(DID2, { cancelNote: 'A' }),
      cancelDeposit(DID2, { cancelNote: 'B' }),
    ]);
    const ok2 = res2.filter(r => r.status === 'fulfilled').length;
    const d2 = await readDep(DID2);
    console.log(`  ${ok2}/2 cancels succeeded; status=${d2.status} remaining=${d2.remainingAmount}`);
    check('C1 — cancel converges to status=cancelled, remaining=0', d2.status === 'cancelled' && (Number(d2.remainingAmount) || 0) === 0, `status=${d2.status} remaining=${d2.remainingAmount}`);
    cleanupId(DID2);

    function cleanupId(id) { _cleanup.push(id); }
  } finally {
    for (const id of _cleanup) { try { await data.collection('be_deposits').doc(id).delete(); } catch {} }
    try { await data.collection('be_customers').doc(C).delete(); } catch {}
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — refundDeposit/cancelDeposit atomic (no lost-update)');
}
const _cleanup = [];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
