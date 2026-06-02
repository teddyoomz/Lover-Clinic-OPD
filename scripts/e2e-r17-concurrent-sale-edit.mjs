#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R17 — CONCURRENT sale-EDIT under the V158 net markers ─────
//
// V158 made the cancel-reverse concurrency-safe via a per-reference net marker
// (saleNet / finance.pointsSaleNet). A sale EDIT is a different shape: reverse
// the OLD amount then re-apply the NEW (refund→deduct / reverse→earn) — TWO
// separate txns per channel. This fires TWO full edits CONCURRENTLY on the SAME
// sale (two admins / a re-submit) and asserts the DANGEROUS direction is
// impossible: NO money created (wallet never exceeds the start balance, no
// over-refund), the marker stays == the ledger net AND never negative, and a
// final cancel cannot push the balance above the start. (Which edit "wins" is a
// logical conflict needing sale-doc versioning — a FEATURE, not a money leak;
// this round only proves the marker keeps it money-SAFE.)
// Rule Q L2 (real prod). Rule M/R: TEST- namespace + cleanup.
// Run: node scripts/e2e-r17-concurrent-sale-edit.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { deductWallet, refundToWallet, earnPoints, reversePointsEarned } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-R17-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); } }
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[line.slice(0, eq).trim()] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const C = `${NS}-cust`, W = `${NS}-wt`, SID = `${NS}-sale`;
  const walDoc = async () => (await data.collection('be_customer_wallets').doc(`${C}__${W}`).get()).data();
  const wal = async () => Number((await walDoc()).balance) || 0;
  const saleNet = async () => { const sn = (await walDoc()).saleNet || {}; return Number(sn[SID]) || 0; };
  const ledgerNet = async () => {
    const snap = await data.collection('be_wallet_transactions').where('referenceId', '==', SID).get();
    let d = 0, r = 0;
    for (const doc of snap.docs) { const t = doc.data(); if (String(t.walletTypeId) !== W) continue; const a = Number(t.amount) || 0; if (t.type === 'deduct') d += a; else if (t.type === 'refund') r += a; }
    return { deducted: d, refunded: r, net: d - r };
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — CONCURRENT sale-edit\n`);
    const B0 = 1000;
    await data.collection('be_customers').doc(C).set({ customerId: C, fullName: 'R17', branchId: `${NS}-BR`, finance: { loyaltyPoints: 200 }, createdAt: new Date().toISOString() });
    await data.collection('be_customer_wallets').doc(`${C}__${W}`).set({ customerId: C, walletTypeId: W, walletTypeName: 'R17', balance: B0, totalUsed: 0, createdAt: new Date().toISOString() });

    // ORIGINAL sale: wallet 200 + earn 50
    await deductWallet(C, W, { amount: 200, walletTypeName: 'R17', referenceType: 'sale', referenceId: SID });
    await earnPoints(C, { purchaseAmount: 500, bahtPerPoint: 10, referenceType: 'sale', referenceId: SID });
    console.log(`original: wallet ${await wal()} (marker ${await saleNet()})`);

    // TWO CONCURRENT EDITS on the SAME sale — each: refund(old 200) → deduct(new)
    const editWallet = (newAmt) => (async () => {
      await refundToWallet(C, W, { amount: 200, walletTypeName: 'R17', referenceType: 'sale', referenceId: SID });
      await deductWallet(C, W, { amount: newAmt, walletTypeName: 'R17', referenceType: 'sale', referenceId: SID });
    })();
    const editPoints = () => (async () => { await reversePointsEarned(C, SID); await earnPoints(C, { purchaseAmount: 300, bahtPerPoint: 10, referenceType: 'sale', referenceId: SID }); })();
    console.log('firing 2 CONCURRENT edits (A:new wallet 100, B:new wallet 150) + concurrent point edits…');
    await Promise.allSettled([editWallet(100), editWallet(150), editPoints(), editPoints()]);

    const w1 = await wal(), m1 = await saleNet(), l1 = await ledgerNet();
    console.log(`\nafter concurrent edits: wallet ${w1} / marker ${m1} / ledger net ${l1.net} (Σd ${l1.deducted} Σr ${l1.refunded})`);
    check('R1 NO money created — wallet never exceeds start balance', w1 <= B0, `wallet=${w1} > ${B0}`);
    check('R2 marker never negative (no over-refund)', m1 >= 0, `marker=${m1}`);
    check('R3 marker == ledger net (saleNet mirrors Σdeduct−Σrefund)', m1 === l1.net, `marker=${m1} ledgerNet=${l1.net}`);
    check('R4 wallet balance == B0 − marker (conservation, SID is the only activity)', w1 === B0 - m1, `wallet=${w1} expected=${B0 - m1}`);
    check('R5 NO over-refund — Σrefund ≤ Σdeduct', l1.refunded <= l1.deducted, `Σr=${l1.refunded} > Σd=${l1.deducted}`);

    // FINAL CANCEL — refund the marker's worth (what the sale still owes the wallet) → must not over-credit
    console.log('\ncancel → refund the still-outstanding net → must NOT push wallet above B0');
    await refundToWallet(C, W, { amount: m1 || 1, walletTypeName: 'R17', referenceType: 'sale', referenceId: SID });
    const w2 = await wal(), m2 = await saleNet();
    check('R6 after cancel wallet ≤ B0 (no leak — refund bounded by marker)', w2 <= B0, `wallet=${w2}`);
    check('R7 after cancel marker == 0 (fully settled)', m2 === 0, `marker=${m2}`);
    check('R8 after cancel wallet == B0 (customer made whole, no money lost/created)', w2 === B0, `wallet=${w2}`);

  } finally {
    try {
      for (const col of ['be_wallet_transactions', 'be_point_transactions']) { const snap = await data.collection(col).where('referenceId', '==', SID).get(); for (const d of snap.docs) await d.ref.delete(); }
      for (const [col, id] of [['be_customers', C], ['be_customer_wallets', `${C}__${W}`]]) { try { await data.collection(col).doc(id).delete(); } catch {} }
    } catch (e) { console.warn('cleanup warning:', e.message); }
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — concurrent sale-edit cannot create money; marker stays == ledger net + ≥0; cancel conserves');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
