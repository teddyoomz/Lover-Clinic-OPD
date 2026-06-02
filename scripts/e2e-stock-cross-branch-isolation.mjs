#!/usr/bin/env node
// ─── HUNT R20 — cross-branch deduction ISOLATION (BSA + purpose integrity).
//   A sale/treatment at branch A must deduct ONLY branch-A lots — never drain
//   branch-B's lots of the same productId. The negative carrier on shortfall
//   must also be branch-scoped to A. (If listStockBatches({branchId}) or
//   pickNegativeTargetBatch leaked cross-branch, A's sale would steal B's stock.)
//   Same productId P with a lot at branch A (locationId A) AND branch B (locationId B).
//   R20.1 deduct 6 at A → A=4, B=10 (untouched)
//   R20.2 deduct 8 at B → B=2, A=4 (untouched)
//   R20.3 deduct 6 at A (only 4 left) → A goes to -2 (branch-A carrier), B=2 untouched
//   R20.4 per-branch conservation: A=-2, B=2; every movement carries the right branchId
// Rule Q L2 (real prod). Run: node scripts/e2e-stock-cross-branch-isolation.mjs
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken } from 'firebase/auth';
import { auth as clientAuth } from '../src/firebase.js';
import { deductStockForSale, listStockMovements } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-XBR20-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; fails.push(n); console.log(`  ✗ ${n} ${e}`); } };
function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {};
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
  const A = `${NS}-BRA`, B = `${NS}-BRB`, P = `${NS}-P`;
  const cleanup = [['be_branches', A], ['be_branches', B], ['be_products', P]];
  const allLots = async () => (await data.collection('be_stock_batches').where('productId', '==', P).get()).docs.map(d => d.data());
  const sumAt = (arr, loc) => arr.filter(b => b.locationId === loc).reduce((s, b) => s + (Number(b.qty?.remaining) || 0), 0);
  const mkLot = async (id, loc, qty) => {
    cleanup.push(['be_stock_batches', id]);
    await data.collection('be_stock_batches').doc(id).set({ batchId: id, productId: P, productName: `${P}-name`, branchId: loc, locationId: loc, locationType: 'branch', status: 'active', qty: { total: qty, remaining: qty }, originalCost: 5, cost: 5, receivedAt: new Date().toISOString(), expiresAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(A).set({ branchId: A, branchName: 'BRA', isDefault: false });
    await data.collection('be_branches').doc(B).set({ branchId: B, branchName: 'BRB', isDefault: false });
    await data.collection('be_products').doc(P).set({ productId: P, productName: `${P}-name`, productType: 'สินค้าหน้าร้าน', branchId: A, stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString() });
    const LA = `${NS}-LA`, LB = `${NS}-LB`;
    await mkLot(LA, A, 10); await mkLot(LB, B, 10);
    console.log(`signed in ${STAFF_UID} — cross-branch deduction isolation (P at A=10, B=10)\n`);

    // R20.1 — deduct 6 at A → A=4, B untouched=10
    console.log('R20.1 — deduct 6 at branch A → A=4, B=10 (B untouched)');
    await deductStockForSale(`TEST-SALE-${NS}-A1`, [{ productId: P, productName: `${P}-name`, qty: 6, unit: 'cc' }], { branchId: A });
    { const a = await allLots();
      check('R20.1.1 branch A drained to 4', sumAt(a, A) === 4, `A=${sumAt(a, A)}`);
      check('R20.1.2 branch B UNTOUCHED = 10 (no cross-branch leak)', sumAt(a, B) === 10, `B=${sumAt(a, B)}`);
    }

    // R20.2 — deduct 8 at B → B=2, A untouched=4
    console.log('\nR20.2 — deduct 8 at branch B → B=2, A=4 (A untouched)');
    await deductStockForSale(`TEST-SALE-${NS}-B1`, [{ productId: P, productName: `${P}-name`, qty: 8, unit: 'cc' }], { branchId: B });
    { const a = await allLots();
      check('R20.2.1 branch B drained to 2', sumAt(a, B) === 2, `B=${sumAt(a, B)}`);
      check('R20.2.2 branch A UNTOUCHED = 4 (no cross-branch leak)', sumAt(a, A) === 4, `A=${sumAt(a, A)}`);
    }

    // R20.3 — deduct 6 at A (only 4 left) → A goes to -2, B untouched=2
    console.log('\nR20.3 — deduct 6 at A (only 4 left) → A=-2 (branch-A carrier), B=2 untouched');
    await deductStockForSale(`TEST-SALE-${NS}-A2`, [{ productId: P, productName: `${P}-name`, qty: 6, unit: 'cc' }], { branchId: A });
    { const a = await allLots();
      check('R20.3.1 branch A = -2 (4 - 6; negative carrier stayed at A)', sumAt(a, A) === -2, `A=${sumAt(a, A)}`);
      check('R20.3.2 branch B STILL untouched = 2 (shortfall did NOT borrow from B)', sumAt(a, B) === 2, `B=${sumAt(a, B)}`);
      check('R20.3.3 every branch-A lot has locationId A (carrier branch-scoped, none landed on B)', a.filter(b => Number(b.qty?.remaining) < 0).every(b => b.locationId === A), `negLots=${JSON.stringify(a.filter(b => b.qty.remaining < 0).map(b => b.locationId))}`);
    }

    // R20.4 — per-branch movement branchId correctness
    console.log('\nR20.4 — every SALE movement carries the branch it was issued at');
    { const mvts = (await listStockMovements({ includeReversed: true })).filter(m => String(m.productId) === P && m.type === 2);
      const aMvts = mvts.filter(m => String(m.linkedSaleId || '').includes(`${NS}-A`));
      const bMvts = mvts.filter(m => String(m.linkedSaleId || '').includes(`${NS}-B`));
      check('R20.4.1 all branch-A sale movements stamped branchId A', aMvts.length > 0 && aMvts.every(m => m.branchId === A), `A-mvts=${aMvts.length} branches=${JSON.stringify([...new Set(aMvts.map(m => m.branchId))])}`);
      check('R20.4.2 all branch-B sale movements stamped branchId B', bMvts.length > 0 && bMvts.every(m => m.branchId === B), `B-mvts=${bMvts.length} branches=${JSON.stringify([...new Set(bMvts.map(m => m.branchId))])}`);
    }

    console.log('\n──────── cleanup ────────');
    for (const b of await allLots()) await data.collection('be_stock_batches').doc(b.batchId).delete().catch(() => {});
    const allMvts = await data.collection('be_stock_movements').get();
    let mdel = 0; for (const d of allMvts.docs) { const m = d.data(); if (String(m.productId || '').includes(NS) || String(m.linkedSaleId || '').includes(NS)) { await d.ref.delete().catch(() => {}); mdel++; } }
    for (const [coll, id] of cleanup) await data.collection(coll).doc(id).delete().catch(() => {});
    check('CLEANUP zero orphan batches', (await allLots()).length === 0);
    console.log(`  (deleted ${mdel} movements)`);
  } catch (e) {
    console.error('\n!!! FATAL in body:', e?.message, '\n', e?.stack?.split('\n').slice(0, 6).join('\n'));
    fail++; fails.push('FATAL: ' + e?.message);
  } finally {
    console.log(`\n════════ ${pass} passed / ${fail} failed ════════`);
    if (fails.length) console.log('FAILED:', fails.join(', '));
    process.exit(fail ? 1 : 0);
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
