#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R16 — CONCURRENT double-cancel (probes V153's documented gap)
//
// V153 made wallet refund + points reverse idempotent for SEQUENTIAL repeats
// (cancel→delete) via a QUERY guard (Σdeduct−Σrefund / Σearn−Σreverse) that is
// NOT in a transaction — explicitly documented as "not a concurrency lock".
// This fires TWO full cancel cascades CONCURRENTLY (Promise.allSettled) on the
// SAME sale (double-click / two admins) and asserts each channel reverses ONCE.
//   If wallet ends 1200 / points 150 → concurrent double-apply → REAL BUG.
//   deposit (in-tx usageHistory filter) + course (in-tx terminal skip) should hold.
// Rule Q L2 (real prod). Rule M/R: TEST- namespace + cleanup.
// Run: node scripts/e2e-r16-concurrent-double-cancel.mjs
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
const NS = `TEST-R16-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); } }
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[line.slice(0, eq).trim()] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const C = `${NS}-cust`, W = `${NS}-wt`, D = `${NS}-dep`, SID = `${NS}-sale`;
  const dep = async () => (await data.collection('be_deposits').doc(D).get()).data();
  const wal = async () => Number((await data.collection('be_customer_wallets').doc(`${C}__${W}`).get()).data().balance) || 0;
  const pts = async () => Number((await data.collection('be_customers').doc(C).get()).data().finance?.loyaltyPoints) || 0;
  const cnt = async (col, type) => (await data.collection(col).where('referenceId', '==', SID).where('type', '==', type).get()).size;

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — CONCURRENT double-cancel\n`);
    await data.collection('be_customers').doc(C).set({ customerId: C, fullName: 'R16', branchId: `${NS}-BR`, finance: { loyaltyPoints: 200 }, createdAt: new Date().toISOString() });
    await data.collection('be_customer_wallets').doc(`${C}__${W}`).set({ customerId: C, walletTypeId: W, walletTypeName: 'R16', balance: 1000, totalUsed: 0, createdAt: new Date().toISOString() });
    await data.collection('be_deposits').doc(D).set({ depositId: D, customerId: C, branchId: `${NS}-BR`, amount: 1000, usedAmount: 0, remainingAmount: 1000, refundAmount: 0, status: 'active', usageHistory: [], createdAt: new Date().toISOString() });

    // apply: deposit 300, wallet 200, earn 50
    await applyDepositToSale(D, SID, 300);
    await deductWallet(C, W, { amount: 200, walletTypeName: 'R16', referenceType: 'sale', referenceId: SID });
    await earnPoints(C, { purchaseAmount: 500, bahtPerPoint: 10, referenceType: 'sale', referenceId: SID });
    console.log(`applied → deposit rem ${(await dep()).remainingAmount} / wallet ${await wal()} / pts ${await pts()}`);

    // CONCURRENT double-cancel — two full money-reverse cascades at once
    console.log('\nfiring 2 CONCURRENT cancel cascades (reverseDeposit + refundWallet + reversePoints)…');
    const cascade = () => Promise.allSettled([
      reverseDepositUsage(D, SID),
      refundToWallet(C, W, { amount: 200, walletTypeName: 'R16', referenceType: 'sale', referenceId: SID }),
      reversePointsEarned(C, SID),
    ]);
    await Promise.allSettled([cascade(), cascade()]);

    const dF = await dep(), wF = await wal(), pF = await pts();
    const refundTx = await cnt('be_wallet_transactions', 'refund');
    const revTx = await cnt('be_point_transactions', 'reverse');
    console.log(`\nafter concurrent double-cancel: deposit rem ${dF.remainingAmount} / wallet ${wF} / pts ${pF}; refundTx=${refundTx} revTx=${revTx}`);
    check('R1 deposit restored ONCE (rem 1000, in-tx usageHistory holds)', dF.remainingAmount === 1000 && dF.usedAmount === 0, `rem=${dF.remainingAmount} used=${dF.usedAmount}`);
    check('R2 wallet refunded ONCE (1000, NOT 1200)', wF === 1000, `bal=${wF} → LEAK +${wF - 1000}`);
    check('R3 points reversed ONCE (200, NOT 150)', pF === 200, `pts=${pF} → over-reversed ${200 - pF}`);
    check('R4 exactly ONE wallet refund txn', refundTx === 1, `got ${refundTx}`);
    check('R5 exactly ONE points reverse txn', revTx === 1, `got ${revTx}`);

  } finally {
    try {
      for (const col of ['be_wallet_transactions', 'be_point_transactions']) { const snap = await data.collection(col).where('referenceId', '==', SID).get(); for (const d of snap.docs) await d.ref.delete(); }
      for (const [col, id] of [['be_customers', C], ['be_customer_wallets', `${C}__${W}`], ['be_deposits', D]]) { try { await data.collection(col).doc(id).delete(); } catch {} }
    } catch (e) { console.warn('cleanup warning:', e.message); }
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — concurrent double-cancel reverses each channel exactly once');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
