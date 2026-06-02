#!/usr/bin/env node
// ─── HUNT R18 — multi-lot FEFO allocation SPAN + ledger-replay conservation
//                (S16 time-travel) + reverse-consistency on a realistic sequence
//   3 lots: L1(4, exp 07-01) L2(4, exp 09-01) L3(4, no-exp). Total 12.
//   R18.1 deduct 6 → FEFO span L1(4)+L2(2): L1=0 L2=2 L3=4, 2 movements
//   R18.2 deduct 5 → L2(2)+L3(3): L2=0 L3=1
//   R18.3 deduct 4 → L3(1) + negative carrier(-3): sum(remaining) = -3
//   R18.4 TIME-TRAVEL: initial 12 + Σ(signed movements) = current sum(remaining)
//   R18.5 reverse the 5-deduct → conservation holds (sum -3 → +2), ledger intact
// Rule Q L2 (real prod). Run: node scripts/e2e-stock-multilot-fefo-conservation.mjs
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken } from 'firebase/auth';
import { auth as clientAuth } from '../src/firebase.js';
import { deductStockForSale, reverseStockForSale, listStockMovements } from '../src/lib/backendClient.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-FEFO18-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const BR = `${NS}-BR`, P = `${NS}-P`;
  const cleanup = [['be_branches', BR], ['be_products', P]];
  const lotDocs = async () => (await data.collection('be_stock_batches').where('productId', '==', P).get()).docs.map(d => d.data());
  const lotById = (arr, id) => arr.find(b => b.batchId === id);
  const sumRemaining = (arr) => arr.reduce((s, b) => s + (Number(b.qty?.remaining) || 0), 0);
  const saleMvts = async () => (await listStockMovements({ includeReversed: true })).filter(m => String(m.productId) === P);
  // create a lot directly (controlled expiresAt/receivedAt) — deduction reads be_stock_batches regardless of creator
  const mkLot = async (id, qty, expiresAt, recvIso) => {
    cleanup.push(['be_stock_batches', id]);
    await data.collection('be_stock_batches').doc(id).set({
      batchId: id, productId: P, productName: `${P}-name`, branchId: BR, locationId: BR, locationType: 'branch',
      status: 'active', qty: { total: qty, remaining: qty }, originalCost: 5, cost: 5,
      receivedAt: recvIso, expiresAt, createdAt: recvIso, updatedAt: recvIso,
    });
  };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'FEFO18', isDefault: false });
    await data.collection('be_products').doc(P).set({ productId: P, productName: `${P}-name`, productType: 'สินค้าหน้าร้าน', branchId: BR, stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString() });
    const L1 = `${NS}-L1`, L2 = `${NS}-L2`, L3 = `${NS}-L3`;
    await mkLot(L1, 4, '2026-07-01T00:00:00+07:00', '2026-06-01T00:00:00+07:00'); // earliest expiry
    await mkLot(L2, 4, '2026-09-01T00:00:00+07:00', '2026-06-02T00:00:00+07:00'); // mid expiry
    await mkLot(L3, 4, null, '2026-06-03T00:00:00+07:00');                         // no expiry → FEFO last
    console.log(`signed in ${STAFF_UID} — multi-lot FEFO span + conservation (3 lots, total 12)\n`);

    // R18.1 — deduct 6 → FEFO span L1(4)+L2(2). NOTE: V144 deletes the drained
    // 0-lot (L1) since live lots remain → assert via conservation + FEFO order,
    // not by L1 still existing.
    console.log('R18.1 — deduct 6 → FEFO: L1(4) fully [→V144-deleted] then L2(2)');
    await deductStockForSale(`TEST-SALE-${NS}-S1`, [{ productId: P, productName: `${P}-name`, qty: 6, unit: 'cc' }], { branchId: BR });
    { const a = await lotDocs();
      const rem = (id) => { const b = lotById(a, id); return b ? Number(b.qty.remaining) : 'GONE'; };
      check('R18.1.1 L1 fully drained then V144-cleared (earliest expiry consumed first)', rem(L1) === 'GONE' || rem(L1) === 0, `L1=${rem(L1)}`);
      check('R18.1.2 L2 partially drained = 2', rem(L2) === 2, `L2=${rem(L2)}`);
      check('R18.1.3 L3 (no-expiry) untouched = 4 (FEFO sorts nulls LAST)', rem(L3) === 4, `L3=${rem(L3)}`);
      check('R18.1.4 conservation: sum(remaining surviving) = 6 (12 - 6)', sumRemaining(a) === 6, `sum=${sumRemaining(a)}`);
      const s1 = (await saleMvts()).filter(m => m.linkedSaleId === `TEST-SALE-${NS}-S1` && m.type === 2);
      check('R18.1.5 exactly 2 SALE movements (one per spanned batch)', s1.length === 2, `mvts=${s1.length}`);
    }

    // R18.2 — deduct 5 → L2(2)+L3(3). L2 drains to 0 → V144-cleared.
    console.log('\nR18.2 — deduct 5 → L2(2) [→V144-deleted] then L3(3)');
    await deductStockForSale(`TEST-SALE-${NS}-S2`, [{ productId: P, productName: `${P}-name`, qty: 5, unit: 'cc' }], { branchId: BR });
    { const a = await lotDocs();
      const rem = (id) => { const b = lotById(a, id); return b ? Number(b.qty.remaining) : 'GONE'; };
      check('R18.2.1 L2 drained then V144-cleared', rem(L2) === 'GONE' || rem(L2) === 0, `L2=${rem(L2)}`);
      check('R18.2.2 L3 partially drained = 1', rem(L3) === 1, `L3=${rem(L3)}`);
      check('R18.2.3 conservation: sum(remaining surviving) = 1 (12 - 11)', sumRemaining(a) === 1, `sum=${sumRemaining(a)}`);
    }

    // R18.3 — deduct 4 (only 1 left) → L3(1) + negative carrier(-3)
    console.log('\nR18.3 — deduct 4 (only 1 left) → L3(1) drained + negative carrier(-3)');
    await deductStockForSale(`TEST-SALE-${NS}-S3`, [{ productId: P, productName: `${P}-name`, qty: 4, unit: 'cc' }], { branchId: BR });
    { const a = await lotDocs();
      check('R18.3.1 conservation: sum(remaining) = -3 (12 - 15)', sumRemaining(a) === -3, `sum=${sumRemaining(a)} lots=${JSON.stringify(a.map(b => b.qty.remaining))}`);
      check('R18.3.2 a negative carrier exists (active debt, NOT cleared)', a.some(b => Number(b.qty?.remaining) < 0), `lots=${a.map(b => b.qty.remaining)}`);
    }

    // R18.4 — TIME-TRAVEL: initial 12 + Σ(signed movements) = current sum(remaining)
    console.log('\nR18.4 — time-travel: initial 12 + Σ(movement qty) = current sum(remaining)');
    { const a = await lotDocs();
      const mvts = (await saleMvts()).filter(m => !m.skipped); // every non-skip movement carries a signed qty
      const signedSum = mvts.reduce((s, m) => s + (Number(m.qty) || 0), 0);
      const replay = 12 + signedSum;
      check('R18.4.1 ledger replay (12 + Σmvt) equals current sum(remaining)', replay === sumRemaining(a), `replay=${replay} actual=${sumRemaining(a)}`);
      check('R18.4.2 Σ(deduction movements) = -15 (6+5+4 fully ledgered)', signedSum === -15, `signedSum=${signedSum}`);
    }

    // R18.5 — reverse the 5-deduct (S2) → conservation holds, ledger intact
    console.log('\nR18.5 — reverse S2 (the 5-deduct) → sum -3 → +2, ledger consistent');
    { await reverseStockForSale(`TEST-SALE-${NS}-S2`, { user: { userId: STAFF_UID, userName: 'rev' } });
      const a = await lotDocs();
      check('R18.5.1 conservation after reverse: sum(remaining) = +2 (-3 + 5)', sumRemaining(a) === 2, `sum=${sumRemaining(a)}`);
      const revs = (await saleMvts()).filter(m => m.reverseOf && m.linkedSaleId === `TEST-SALE-${NS}-S2`);
      check('R18.5.2 reverse wrote movements for S2 (ledger records the credit-back)', revs.length >= 1, `revMvts=${revs.length}`);
      // time-travel STILL holds after reverse
      const mvts = (await saleMvts()).filter(m => !m.skipped);
      const replay = 12 + mvts.reduce((s, m) => s + (Number(m.qty) || 0), 0);
      check('R18.5.3 time-travel STILL holds post-reverse (12 + Σmvt = sum remaining)', replay === sumRemaining(a), `replay=${replay} actual=${sumRemaining(a)}`);
    }

    console.log('\n──────── cleanup ────────');
    for (const b of await lotDocs()) await data.collection('be_stock_batches').doc(b.batchId).delete().catch(() => {});
    const allMvts = await data.collection('be_stock_movements').get();
    let mdel = 0; for (const d of allMvts.docs) { const m = d.data(); if (String(m.productId || '').includes(NS) || String(m.linkedSaleId || '').includes(NS)) { await d.ref.delete().catch(() => {}); mdel++; } }
    for (const [coll, id] of cleanup) await data.collection(coll).doc(id).delete().catch(() => {});
    check('CLEANUP zero orphan batches', (await lotDocs()).length === 0);
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
