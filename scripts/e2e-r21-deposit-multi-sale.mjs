#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R21 — ONE deposit funding MULTIPLE sales (partial cancel) ──
//
// Fresh angle not yet e2e'd: a single deposit (1000) is applied to TWO sales
// (300 + 400). Cancelling ONE sale must restore ONLY that sale's portion and
// LEAVE the other's usage intact (M1 usageHistory is keyed per-saleId). Probes
// for a cross-sale over-restore / wrong-portion bug + a CONCURRENT multi-apply
// (two different sales applied to the same deposit at once → OCC must serialize,
// both land, no lost-update, never over-spend the remaining).
// Rule Q L2 (real prod). Rule M/R: TEST- namespace + cleanup.
// Run: node scripts/e2e-r21-deposit-multi-sale.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { applyDepositToSale, reverseDepositUsage } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-R21-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); } }
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[line.slice(0, eq).trim()] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  const adb = initAdmin();
  const data = base(adb);
  const C = `${NS}-cust`, D = `${NS}-dep`, S1 = `${NS}-s1`, S2 = `${NS}-s2`;
  const dep = async () => (await data.collection('be_deposits').doc(D).get()).data();
  const usageFor = async (sid) => { const h = (await dep()).usageHistory || []; return h.filter(u => String(u.saleId) === sid).reduce((s, u) => s + (Number(u.amount) || 0), 0); };
  const seed = async () => data.collection('be_deposits').doc(D).set({ depositId: D, customerId: C, branchId: `${NS}-BR`, amount: 1000, usedAmount: 0, remainingAmount: 1000, refundAmount: 0, status: 'active', usageHistory: [], createdAt: new Date().toISOString() });

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — one deposit, multiple sales\n`);
    await data.collection('be_customers').doc(C).set({ customerId: C, fullName: 'R21', branchId: `${NS}-BR`, createdAt: new Date().toISOString() });
    await seed();

    // ── apply to TWO sales ────────────────────────────────────────────────────
    console.log('APPLY — deposit 1000 → sale1 300 + sale2 400');
    await applyDepositToSale(D, S1, 300);
    await applyDepositToSale(D, S2, 400);
    let d = await dep();
    check('A1 used 700 / remaining 300', d.usedAmount === 700 && d.remainingAmount === 300, `used=${d.usedAmount} rem=${d.remainingAmount}`);
    check('A2 sale1 usage = 300', (await usageFor(S1)) === 300, `=${await usageFor(S1)}`);
    check('A3 sale2 usage = 400', (await usageFor(S2)) === 400, `=${await usageFor(S2)}`);

    // ── cancel ONLY sale1 → restores 300, leaves sale2's 400 ───────────────────
    console.log('\nPARTIAL CANCEL — reverse sale1 only → must keep sale2 intact');
    await reverseDepositUsage(D, S1);
    d = await dep();
    check('P1 used back to 400 (only sale1 reversed)', d.usedAmount === 400, `used=${d.usedAmount}`);
    check('P2 remaining back to 600', d.remainingAmount === 600, `rem=${d.remainingAmount}`);
    check('P3 sale1 usage now 0', (await usageFor(S1)) === 0, `=${await usageFor(S1)}`);
    check('P4 sale2 usage STILL 400 (untouched)', (await usageFor(S2)) === 400, `=${await usageFor(S2)}`);
    // reverse sale1 again → idempotent (M1) — must NOT touch sale2
    await reverseDepositUsage(D, S1);
    d = await dep();
    check('P5 re-reverse sale1 is NO-OP (used still 400, sale2 still 400)', d.usedAmount === 400 && (await usageFor(S2)) === 400, `used=${d.usedAmount} s2=${await usageFor(S2)}`);

    // ── cancel sale2 → back to baseline ────────────────────────────────────────
    await reverseDepositUsage(D, S2);
    d = await dep();
    check('P6 after cancelling both → used 0 / remaining 1000', d.usedAmount === 0 && d.remainingAmount === 1000, `used=${d.usedAmount} rem=${d.remainingAmount}`);

    // ── CONCURRENT multi-apply — two different sales to the same deposit at once ─
    console.log('\nCONCURRENT — apply sale1(300) ‖ sale2(400) to the same deposit (fresh)');
    await seed();
    await Promise.allSettled([applyDepositToSale(D, S1, 300), applyDepositToSale(D, S2, 400)]);
    d = await dep();
    check('X1 both applied, no lost-update (used 700 / rem 300)', d.usedAmount === 700 && d.remainingAmount === 300, `used=${d.usedAmount} rem=${d.remainingAmount}`);
    check('X2 each sale logged once (s1=300, s2=400)', (await usageFor(S1)) === 300 && (await usageFor(S2)) === 400, `s1=${await usageFor(S1)} s2=${await usageFor(S2)}`);
    check('X3 usageHistory has exactly 2 entries (no dup/loss)', ((await dep()).usageHistory || []).length === 2, `len=${((await dep()).usageHistory || []).length}`);

  } finally {
    try { for (const [col, id] of [['be_customers', C], ['be_deposits', D]]) { try { await data.collection(col).doc(id).delete(); } catch {} } } catch (e) { console.warn('cleanup warning:', e.message); }
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — one deposit / many sales: partial cancel restores only its portion; concurrent multi-apply has no lost-update');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
