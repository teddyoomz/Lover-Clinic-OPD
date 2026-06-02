#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R22 — manual adjustPoints × sale earn/reverse interplay ───
//
// Fresh angle: a manual adjustPoints (referenceId='' → NO pointsSaleNet marker)
// shares the finance.loyaltyPoints SUMMARY with a sale's earn/reverse (which DO
// carry the V158 marker). Verify: (1) a manual ± between a sale's earn and its
// reverse is PRESERVED (the marker-based reverse subtracts ONLY the sale's 50,
// never the manual delta); (2) concurrent earn‖adjust+‖adjust− on the shared
// summary has NO lost-update (V149 atomic); (3) the post-concurrent reverse still
// reverses exactly the sale's net via the marker.
// Rule Q L2 (real prod). Rule M/R: TEST- namespace + cleanup.
// Run: node scripts/e2e-r22-points-adjust-interplay.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { earnPoints, adjustPoints, reversePointsEarned } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-R22-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); } }
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[line.slice(0, eq).trim()] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const C = `${NS}-cust`, SID = `${NS}-sale`;
  const cust = async () => (await data.collection('be_customers').doc(C).get()).data();
  const pts = async () => Number((await cust()).finance?.loyaltyPoints) || 0;
  const marker = async () => Number((await cust()).finance?.pointsSaleNet?.[SID]) || 0;
  const seed = async (p) => data.collection('be_customers').doc(C).set({ customerId: C, fullName: 'R22', branchId: `${NS}-BR`, finance: { loyaltyPoints: p }, createdAt: new Date().toISOString() });

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — points adjust × sale-reverse interplay\n`);

    // ── INTERPLAY: earn(sale) → manual ± → reverse(sale) preserves the manual delta ─
    console.log('INTERPLAY — base 100 → earn 50 (sale) → +30 → −20 (manual) → reverse sale');
    await seed(100);
    await earnPoints(C, { purchaseAmount: 500, bahtPerPoint: 10, referenceType: 'sale', referenceId: SID }); // +50, marker 50
    check('I1 after sale earn → pts 150, marker 50', (await pts()) === 150 && (await marker()) === 50, `pts=${await pts()} marker=${await marker()}`);
    await adjustPoints(C, { amount: 30, isIncrease: true, note: 'R22 manual +' });   // +30, no marker
    await adjustPoints(C, { amount: 20, isIncrease: false, note: 'R22 manual −' });   // −20, no marker
    check('I2 manual ± applied → pts 160, marker STILL 50 (untouched)', (await pts()) === 160 && (await marker()) === 50, `pts=${await pts()} marker=${await marker()}`);
    await reversePointsEarned(C, SID); // reverse ONLY the sale's 50
    check('I3 reverse sale → pts 110 (manual net +10 preserved, sale 50 gone)', (await pts()) === 110, `pts=${await pts()}`);
    check('I4 marker drained to 0', (await marker()) === 0, `marker=${await marker()}`);
    await reversePointsEarned(C, SID); // idempotent
    check('I5 re-reverse is NO-OP (pts still 110, manual untouched)', (await pts()) === 110, `pts=${await pts()}`);

    // ── CONCURRENT earn ‖ adjust+ ‖ adjust− on the shared summary (V149 atomic) ──
    console.log('\nCONCURRENT — base 100 → earn 50(sale) ‖ +30 ‖ −20 all at once');
    await seed(100);
    await Promise.allSettled([
      earnPoints(C, { purchaseAmount: 500, bahtPerPoint: 10, referenceType: 'sale', referenceId: SID }),
      adjustPoints(C, { amount: 30, isIncrease: true, note: 'R22 conc +' }),
      adjustPoints(C, { amount: 20, isIncrease: false, note: 'R22 conc −' }),
    ]);
    check('X1 no lost-update on summary → pts 160 (100+50+30−20)', (await pts()) === 160, `pts=${await pts()}`);
    check('X2 sale marker = 50 (earn landed, untouched by manual ±)', (await marker()) === 50, `marker=${await marker()}`);
    await reversePointsEarned(C, SID);
    check('X3 reverse after concurrent → pts 110 (only the sale 50 reversed)', (await pts()) === 110, `pts=${await pts()}`);
    check('X4 marker 0 after reverse', (await marker()) === 0, `marker=${await marker()}`);

  } finally {
    try {
      const s = await data.collection('be_point_transactions').where('customerId', '==', C).get();
      for (const d of s.docs) await d.ref.delete();
      try { await data.collection('be_customers').doc(C).delete(); } catch {}
    } catch (e) { console.warn('cleanup warning:', e.message); }
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — manual adjust never corrupts the sale marker; reverse subtracts only the sale; concurrent summary RMW has no lost-update');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
