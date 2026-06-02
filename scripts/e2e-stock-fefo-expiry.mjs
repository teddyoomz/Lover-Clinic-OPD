#!/usr/bin/env node
// ─── HUNT R7 — FEFO + never-dispense-expired (medical stock purpose) ─────────
//
// Non-concurrency stock-purpose check (the user: "ไม่เป็นไปตามจุดประสงค์ของ
// โปรแกรม", stock critical). A medical clinic MUST: (E1) never dispense an
// EXPIRED batch when a valid one exists; (E3) consume earliest-EXPIRY first
// (FEFO). Rule Q L2 against real prod via the shipped deductStockForTreatment.
// Run: node scripts/e2e-stock-fefo-expiry.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { deductStockForTreatment } from '../src/lib/backendClient.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-FEFO-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const BR = `${NS}-BR`;
  const cleanup = [['be_branches', BR]];
  const readBatch = async (id) => (await data.collection('be_stock_batches').doc(id).get()).data();
  const mkProduct = (pid) => { cleanup.push(['be_products', pid]); return data.collection('be_products').doc(pid).set({
    productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR,
    stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString(),
  }); };
  const mkBatch = (bid, pid, remaining, expiresAt) => { cleanup.push(['be_stock_batches', bid]); return data.collection('be_stock_batches').doc(bid).set({
    batchId: bid, productId: pid, productName: `${pid}-name`, branchId: BR, locationId: BR, locationType: 'branch',
    status: BATCH_STATUS.ACTIVE, qty: { total: remaining, remaining }, originalCost: 0, expiresAt,
    receivedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  }); };
  const deduct = (pid, qty, ref) => deductStockForTreatment(`${NS}-T-${ref}`, [{ productId: pid, name: `${pid}-name`, qty, unit: 'cc' }],
    { customerId: `${NS}-C`, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT });

  const PAST = '2020-01-01T00:00:00.000Z';      // expired
  const SOON = '2026-08-01T00:00:00.000Z';      // valid, expires sooner
  const LATE = '2027-12-31T00:00:00.000Z';      // valid, expires later

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'FEFO', isDefault: false });
    console.log(`signed in ${STAFF_UID} — FEFO + never-dispense-expired\n`);

    // E1 — EXPIRED batch must NOT be dispensed when a VALID batch exists
    console.log('E1 — expired(10) + valid(10), deduct 5 → valid drains to 5, expired UNTOUCHED');
    { const P = `${NS}-E1-P`, EXP = `${NS}-E1-EXP`, VAL = `${NS}-E1-VAL`;
      await mkProduct(P);
      await mkBatch(EXP, P, 10, PAST);   // expired
      await mkBatch(VAL, P, 10, LATE);   // valid
      await deduct(P, 5, 'E1');
      const exp = await readBatch(EXP), val = await readBatch(VAL);
      check('E1.1 expired batch UNTOUCHED (never dispensed)', Number(exp.qty.remaining) === 10, `expired rem=${exp.qty.remaining} (want 10)`);
      check('E1.2 valid batch drained to 5', Number(val.qty.remaining) === 5, `valid rem=${val.qty.remaining} (want 5)`);
    }

    // E2 — ONLY an expired batch: deduct must NOT consume it (goes negative elsewhere)
    console.log('\nE2 — only an expired(10) batch, deduct 3 → expired NOT consumed (negative recorded elsewhere)');
    { const P = `${NS}-E2-P`, EXP = `${NS}-E2-EXP`;
      await mkProduct(P);
      await mkBatch(EXP, P, 10, PAST);
      await deduct(P, 3, 'E2');
      const exp = await readBatch(EXP);
      // The expired batch's remaining must NOT be drained by the positive FIFO path.
      // (Negative-stock may record the debt on a synthetic/other lot, but the
      // EXPIRED lot must never be dispensed as if valid → remaining stays 10.)
      check('E2.1 expired-only: expired batch NOT positively dispensed (remaining still 10)', Number(exp.qty.remaining) === 10, `expired rem=${exp.qty.remaining} (want 10)`);
    }

    // E3 — FEFO: two VALID batches, earliest-expiry consumed first
    console.log('\nE3 — valid SOON(10) + valid LATE(10), deduct 6 → SOON drains first');
    { const P = `${NS}-E3-P`, SOONB = `${NS}-E3-SOON`, LATEB = `${NS}-E3-LATE`;
      await mkProduct(P);
      await mkBatch(LATEB, P, 10, LATE);   // created first but expires later
      await mkBatch(SOONB, P, 10, SOON);   // expires sooner → FEFO picks this first
      await deduct(P, 6, 'E3');
      const soon = await readBatch(SOONB), late = await readBatch(LATEB);
      check('E3.1 earliest-expiry (SOON) drained first → 4', Number(soon.qty.remaining) === 4, `SOON rem=${soon.qty.remaining} (want 4)`);
      check('E3.2 later-expiry (LATE) untouched → 10', Number(late.qty.remaining) === 10, `LATE rem=${late.qty.remaining} (want 10)`);
    }
  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanup) await data.collection(c).doc(id).delete().catch(() => {});
      for (const coll of ['be_stock_movements', 'be_stock_batches']) {
        const snap = await data.collection(coll).get();
        for (const d of snap.docs) { const v = d.data();
          if ([v.branchId, v.productId, v.batchId, v.linkedTreatmentId, v.customerId].some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {}); }
      }
      let orphans = 0;
      for (const [c, id] of cleanup) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ HUNT R7 FEFO/expiry: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
