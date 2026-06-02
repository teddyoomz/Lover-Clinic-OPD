#!/usr/bin/env node
// ─── HUNT R19 — the EDIT path (reverse-old + deduct-new), the most common
//                real-world TFP/sale flow after initial save (V19 stockChanged).
//   Mirrors what TreatmentFormPage.handleSubmit does on edit: reverse the prior
//   deduction for this docId, then deduct the corrected items.
//   R19.1 edit qty UP   (3 → 5): net = 5 (NOT 8, NOT 3) — old fully reversed
//   R19.2 edit qty DOWN (5 → 1): net = 1
//   R19.3 edit swaps PRODUCT (A→B): A fully restored, B deducted
//   R19.4 edit to SAME (3 → 3): net unchanged = 3 (idempotent round-trip)
//   R19.5 re-edit AFTER a V144 0-lot clear: reverse re-creates (V151), net correct
// Rule Q L2 (real prod). Run: node scripts/e2e-stock-edit-path-conservation.mjs
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken } from 'firebase/auth';
import { auth as clientAuth } from '../src/firebase.js';
import { createStockOrder, deductStockForTreatment, reverseStockForTreatment } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-EDIT19-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const BR = `${NS}-BR`;
  const cleanup = [['be_branches', BR]];
  const lots = async (pid) => (await data.collection('be_stock_batches').where('productId', '==', pid).get()).docs.map(d => d.data());
  const sumRem = async (pid) => (await lots(pid)).reduce((s, b) => s + (Number(b.qty?.remaining) || 0), 0);
  const mkProduct = (pid) => { cleanup.push(['be_products', pid]); return data.collection('be_products').doc(pid).set({ productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR, stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString() }); };
  const importLot = async (pid, qty) => { const o = await createStockOrder({ branchId: BR, items: [{ productId: pid, productName: `${pid}-name`, qty, cost: 5, unit: 'cc' }] }); cleanup.push(['be_stock_orders', o.orderId]); };
  // simulate an edit: reverse the prior deduction for this treatment, then deduct the corrected items
  const editTreatment = async (tId, newItems) => { await reverseStockForTreatment(tId, { user: { userId: STAFF_UID, userName: 'edit' } }); await deductStockForTreatment(tId, newItems, { branchId: BR }); };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'EDIT19', isDefault: false });
    console.log(`signed in ${STAFF_UID} — treatment EDIT path (reverse-old + deduct-new)\n`);

    // R19.1 — edit qty UP (3 → 5)
    console.log('R19.1 — deduct 3, then EDIT to 5 → net = 5 (NOT 8, NOT 3)');
    { const P = `${NS}-1-P`; await mkProduct(P); await importLot(P, 10);
      const tId = `TEST-APPT-${NS}-1`;
      await deductStockForTreatment(tId, [{ productId: P, productName: `${P}-name`, qty: 3, unit: 'cc' }], { branchId: BR });
      check('R19.1.0 initial deduct 3 → remaining 7', await sumRem(P) === 7, `rem=${await sumRem(P)}`);
      await editTreatment(tId, [{ productId: P, productName: `${P}-name`, qty: 5, unit: 'cc' }]);
      check('R19.1.1 after edit to 5 → remaining 5 (old 3 fully reversed, new 5 applied)', await sumRem(P) === 5, `rem=${await sumRem(P)}`);
    }

    // R19.2 — edit qty DOWN (5 → 1)
    console.log('\nR19.2 — deduct 5, then EDIT to 1 → net = 1');
    { const P = `${NS}-2-P`; await mkProduct(P); await importLot(P, 10);
      const tId = `TEST-APPT-${NS}-2`;
      await deductStockForTreatment(tId, [{ productId: P, productName: `${P}-name`, qty: 5, unit: 'cc' }], { branchId: BR });
      await editTreatment(tId, [{ productId: P, productName: `${P}-name`, qty: 1, unit: 'cc' }]);
      check('R19.2.1 after edit down to 1 → remaining 9', await sumRem(P) === 9, `rem=${await sumRem(P)}`);
    }

    // R19.3 — edit swaps PRODUCT (A→B)
    console.log('\nR19.3 — deduct A×4, then EDIT to B×4 → A restored to full, B deducted');
    { const A = `${NS}-3-A`, B = `${NS}-3-B`; await mkProduct(A); await mkProduct(B); await importLot(A, 10); await importLot(B, 10);
      const tId = `TEST-APPT-${NS}-3`;
      await deductStockForTreatment(tId, [{ productId: A, productName: `${A}-name`, qty: 4, unit: 'cc' }], { branchId: BR });
      check('R19.3.0 A deducted → A=6, B=10', (await sumRem(A)) === 6 && (await sumRem(B)) === 10, `A=${await sumRem(A)} B=${await sumRem(B)}`);
      await editTreatment(tId, [{ productId: B, productName: `${B}-name`, qty: 4, unit: 'cc' }]);
      check('R19.3.1 after swap → A fully restored to 10', await sumRem(A) === 10, `A=${await sumRem(A)}`);
      check('R19.3.2 after swap → B deducted to 6', await sumRem(B) === 6, `B=${await sumRem(B)}`);
    }

    // R19.4 — edit to SAME (3 → 3): idempotent round-trip
    console.log('\nR19.4 — deduct 3, EDIT to 3 (no change) → net still 3');
    { const P = `${NS}-4-P`; await mkProduct(P); await importLot(P, 10);
      const tId = `TEST-APPT-${NS}-4`;
      await deductStockForTreatment(tId, [{ productId: P, productName: `${P}-name`, qty: 3, unit: 'cc' }], { branchId: BR });
      await editTreatment(tId, [{ productId: P, productName: `${P}-name`, qty: 3, unit: 'cc' }]);
      check('R19.4.1 edit-to-same → remaining 7 (round-trip conserves)', await sumRem(P) === 7, `rem=${await sumRem(P)}`);
    }

    // R19.5 — re-edit AFTER a V144 0-lot clear (small lot fully drained → deleted → reverse re-creates)
    console.log('\nR19.5 — small lot (3) fully drained by deduct 3 + a live lot exists → V144 clears the 0-lot → EDIT to 1 must restore correctly');
    { const P = `${NS}-5-P`; await mkProduct(P); await importLot(P, 3); await importLot(P, 10); // two lots: 3 + 10 = 13
      const tId = `TEST-APPT-${NS}-5`;
      // deduct 3 → drains the 3-lot to 0 (FIFO/FEFO oldest first) → V144 deletes it (10-lot live)
      await deductStockForTreatment(tId, [{ productId: P, productName: `${P}-name`, qty: 3, unit: 'cc' }], { branchId: BR });
      check('R19.5.0 deduct 3 → sum 10 (3-lot drained + V144-cleared, 10-lot intact)', await sumRem(P) === 10, `rem=${await sumRem(P)}`);
      await editTreatment(tId, [{ productId: P, productName: `${P}-name`, qty: 1, unit: 'cc' }]);
      check('R19.5.1 edit to 1 → sum 12 (reverse re-created/credited the cleared lot, then deduct 1: 13 - 1)', await sumRem(P) === 12, `rem=${await sumRem(P)}`);
    }

    console.log('\n──────── cleanup ────────');
    for (const sfx of ['1-P', '2-P', '3-A', '3-B', '4-P', '5-P']) { const pid = `${NS}-${sfx}`; for (const b of await lots(pid)) await data.collection('be_stock_batches').doc(b.batchId).delete().catch(() => {}); }
    const allMvts = await data.collection('be_stock_movements').get();
    let mdel = 0; for (const d of allMvts.docs) { const m = d.data(); if (String(m.productId || '').includes(NS) || String(m.linkedTreatmentId || '').includes(NS)) { await d.ref.delete().catch(() => {}); mdel++; } }
    for (const [coll, id] of cleanup) await data.collection(coll).doc(id).delete().catch(() => {});
    let orphan = 0; for (const sfx of ['1-P', '2-P', '3-A', '3-B', '4-P', '5-P']) orphan += (await lots(`${NS}-${sfx}`)).length;
    check('CLEANUP zero orphan batches', orphan === 0, `orphan=${orphan}`);
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
