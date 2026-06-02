#!/usr/bin/env node
// ─── HUNT R5 — concurrent loyalty-points lost-update (Rule T class) ───────────
//
// Loop continuation: after V147(stock)+V148(courses), audit the rest of the
// Rule-T concurrency-RMW class. WALLET is already atomic (M5 runTransaction).
// POINTS was missed: getPointBalance reads the SUMMARY finance.loyaltyPoints
// (NOT a ledger sum), and _earnPointsInternal (called on EVERY sale via
// earnPoints) + adjustPoints(deduct) do getPointBalance → setDoc(ledger) →
// updateDoc({finance.loyaltyPoints}) with NO transaction → two concurrent point
// ops both read the same `before`, both write `after` → LAST WRITE WINS → points
// earned/spent LOST (loyalty currency wrong; the "M9 reconciler" is aspirational).
//
// Rule Q L2 (real prod, shipped fns). Rule M/R: TEST customer + cleanup.
// Run: node scripts/e2e-points-concurrency.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { adjustPoints, getPointBalance } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-PTS-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const cleanupIds = [];
  const seed = async (id, pts) => {
    cleanupIds.push(id);
    await data.collection('be_customers').doc(id).set({
      customerId: id, fullName: 'PTS Test', branchId: `${NS}-BR`,
      finance: { loyaltyPoints: pts }, createdAt: new Date().toISOString(),
    });
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — concurrent loyalty-points lost-update\n`);
    const ROUNDS = 6;

    // P1 — concurrent EARN ×2 (each +10) on a 100-pt customer → expect 120
    console.log('P1 — 2 concurrent adjustPoints(+10) on 100 pts → expect 120');
    let p1Bad = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const C = `${NS}-P1-${r}`; await seed(C, 100);
      await Promise.allSettled([
        adjustPoints(C, { amount: 10, isIncrease: true, note: 'P1a' }),
        adjustPoints(C, { amount: 10, isIncrease: true, note: 'P1b' }),
      ]);
      const bal = await getPointBalance(C);
      if (bal !== 120) p1Bad++;
      console.log(`  round ${r}: balance=${bal} (want 120 — both earns applied)`);
    }
    check('P1 — concurrent earn×2 BOTH apply (no lost points)', p1Bad === 0, `${p1Bad}/${ROUNDS} lost points`);

    // P2 — concurrent DEDUCT ×2 (each -10) on a 100-pt customer → expect 80
    console.log('\nP2 — 2 concurrent adjustPoints(-10) on 100 pts → expect 80');
    let p2Bad = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const C = `${NS}-P2-${r}`; await seed(C, 100);
      await Promise.allSettled([
        adjustPoints(C, { amount: 10, isIncrease: false, note: 'P2a' }),
        adjustPoints(C, { amount: 10, isIncrease: false, note: 'P2b' }),
      ]);
      const bal = await getPointBalance(C);
      if (bal !== 80) p2Bad++;
      console.log(`  round ${r}: balance=${bal} (want 80 — both deducts applied)`);
    }
    check('P2 — concurrent deduct×2 BOTH apply (no over-credit)', p2Bad === 0, `${p2Bad}/${ROUNDS} over-credited`);

  } finally {
    console.log('\ncleanup...');
    try {
      for (const id of cleanupIds) await data.collection('be_customers').doc(id).delete().catch(() => {});
      const pt = await data.collection('be_point_transactions').get();
      for (const d of pt.docs) { if (String(d.data().customerId || '').startsWith(NS)) await d.ref.delete().catch(() => {}); }
      let orphans = 0;
      for (const id of cleanupIds) if ((await data.collection('be_customers').doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }

  console.log(`\n━━━ HUNT R5 points concurrency: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
