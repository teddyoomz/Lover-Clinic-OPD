#!/usr/bin/env node
// ─── 4-SYSTEM AUDIT R18 — course buy→use→cancel→delete lifecycle conservation ─
//
// Fresh angle: a course is a PAID service (money-adjacent). Exercise the full
// customer.courses[] lifecycle through the REAL fns — assign (buy) → deduct (use
// 2 of 5) → applySaleCancelToCourses (cancel→refund) → re-cancel (delete) — and
// assert: remaining tracks exactly, never negative; cancel flips to a TERMINAL
// status; the re-cancel (delete) is an idempotent NO-OP (terminal-skip). Then a
// CONCURRENT use-vs-cancel race on a partially-used course → no corruption
// (remaining ≥ 0, qty string well-formed, status terminal — V148 atomic doc RMW).
// Rule Q L2 (real prod). Rule M/R: TEST- namespace + cleanup.
// Run: node scripts/e2e-r18-course-lifecycle-conservation.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { deductCourseItems, applySaleCancelToCourses } from '../src/lib/backendClient.js';
import { parseQtyString } from '../src/lib/courseUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-R18-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
const TERMINAL = ['คืนเงิน', 'ยกเลิก', 'แลกเปลี่ยน'];
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
  const course0 = async () => (await cust())?.courses?.[0];
  const remaining = async () => parseQtyString((await course0())?.qty || '').remaining;
  const status = async () => (await course0())?.status;
  const seedCourse = async () => data.collection('be_customers').doc(C).set({
    customerId: C, fullName: 'R18', branchId: `${NS}-BR`,
    courses: [{ name: 'R18Course', product: 'R18Product', qty: '5 / 5 ครั้ง', courseType: 'ปกติ', status: 'active', linkedSaleId: SID, products: [{ name: 'R18Product', qty: '5', remaining: '5' }] }],
    createdAt: new Date().toISOString(),
  });
  const use1 = () => deductCourseItems(C, [{ courseIndex: 0, courseName: 'R18Course', productName: 'R18Product', deductQty: 1, unit: 'ครั้ง' }]);

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} — course lifecycle conservation\n`);
    // applySaleCancelToCourses reads be_sales/{SID} for customerId (read-only) → seed once.
    await data.collection('be_sales').doc(SID).set({ saleId: SID, customerId: C, branchId: `${NS}-BR`, status: 'active', createdAt: new Date().toISOString() });

    // ── LIFECYCLE: buy 5 → use 2 → cancel → delete ──────────────────────────
    console.log('LIFECYCLE — buy 5/5 → use 2 → cancel(refund) → re-cancel(delete)');
    await seedCourse();
    check('L1 bought 5/5 active', (await remaining()) === 5 && (await status()) === 'active', `rem=${await remaining()} status=${await status()}`);
    await use1(); await use1();
    check('L2 after using 2 → remaining 3', (await remaining()) === 3, `rem=${await remaining()}`);
    await applySaleCancelToCourses(SID, 'refund', { reason: 'R18 cancel' });
    const sCancel = await status();
    check('L3 cancel flips to a TERMINAL status (คืนเงิน)', TERMINAL.includes(sCancel), `status=${sCancel}`);
    await applySaleCancelToCourses(SID, 'refund', { reason: 'R18 delete' });
    check('L4 re-cancel (delete) is idempotent — status unchanged', (await status()) === sCancel, `status=${await status()}`);
    check('L5 remaining never went negative through the lifecycle', (await remaining()) >= 0, `rem=${await remaining()}`);

    // ── RACE: concurrent use vs cancel on a partially-used course ────────────
    console.log('\nRACE — 6 rounds: use(1) ‖ cancel on a 5/5→ course → no corruption');
    let bad = 0;
    for (let r = 0; r < 6; r++) {
      await seedCourse();
      await use1();                                   // remaining 4
      await Promise.allSettled([use1(), applySaleCancelToCourses(SID, 'refund', { reason: `R18 race ${r}` })]);
      const rem = await remaining(), st = await status();
      const wellFormed = /^\d+(\.\d+)?\s*\/\s*\d+/.test((await course0())?.qty || '');
      // invariants: remaining ∈ [3,4] (use may or may not have landed before cancel),
      // never negative, qty well-formed, status terminal (cancel always lands).
      const ok = rem >= 0 && rem <= 4 && wellFormed && TERMINAL.includes(st);
      if (!ok) { bad++; console.log(`  round ${r}: rem=${rem} status=${st} wellFormed=${wellFormed} ✗`); }
      else console.log(`  round ${r}: rem=${rem} status=${st} ✓`);
    }
    check('R1 use‖cancel race never corrupts (rem∈[0,4], qty well-formed, status terminal)', bad === 0, `→ ${bad}/6 corrupted`);

  } finally {
    try {
      const cc = await data.collection('be_course_changes').where('customerId', '==', C).get();
      for (const d of cc.docs) await d.ref.delete();
      for (const [col, id] of [['be_customers', C], ['be_sales', SID]]) { try { await data.collection(col).doc(id).delete(); } catch {} }
    } catch (e) { console.warn('cleanup warning:', e.message); }
    try { await signOut(clientAuth); } catch {}
  }

  console.log(`\n${'─'.repeat(60)}\nRESULT: ${pass} pass / ${fail} fail`);
  if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL PASS — course lifecycle conserves; cancel terminal + idempotent; use‖cancel race never corrupts');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
