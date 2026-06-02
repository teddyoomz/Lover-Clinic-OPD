#!/usr/bin/env node
// ─── HUNT R14 — withdrawal full lifecycle + cancel-restore + V144/V151 ───────
// Mirror of R13 (transfer) for withdrawals (branch_to_central). Same CAS status
// machine {0:[1,3],1:[2,3]} + _exportFromSource/_receiveAtDestination/_reverseExport.
//   W1 send (0→1) then CANCEL (1→3) → source restored.
//   W2 full 0→1→2 → SRC −4 + DST +4 = original total (cross-location).
//   W3 full-lot withdrawal (source→0, V144 deletes source) → cancel → V151
//      re-creates the vanished source lot → restored.
// Rule Q L2 (real prod). Rule M/R cleanup.
// Run: node scripts/e2e-stock-withdrawal-lifecycle.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth as clientAuth } from '../src/firebase.js';
import { createStockWithdrawal, updateStockWithdrawalStatus } from '../src/lib/backendClient.js';
import { BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-WD-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); }
}
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
  const SRC = `${NS}-SRC`, DST = `${NS}-WH`; // branch → central warehouse
  const cleanup = [['be_branches', SRC]];
  const remAt = async (pid, loc) => { const s = await data.collection('be_stock_batches').where('productId', '==', pid).get(); let sum = 0; s.docs.forEach(d => { const v = d.data(); if (!loc || v.branchId === loc || v.locationId === loc) sum += Number(v.qty?.remaining) || 0; }); return sum; };
  const mkProduct = (pid) => { cleanup.push(['be_products', pid]); return data.collection('be_products').doc(pid).set({ productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: SRC, stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString() }); };
  const mkBatch = (bid, pid, remaining, ageMs = 0) => { cleanup.push(['be_stock_batches', bid]); return data.collection('be_stock_batches').doc(bid).set({ batchId: bid, productId: pid, productName: `${pid}-name`, branchId: SRC, locationId: SRC, locationType: 'branch', status: BATCH_STATUS.ACTIVE, qty: { total: remaining, remaining }, originalCost: 7, receivedAt: new Date(Date.now() - ageMs).toISOString(), createdAt: new Date(Date.now() - ageMs).toISOString() }); };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(SRC).set({ branchId: SRC, branchName: 'WD-SRC', isDefault: false });
    console.log(`signed in ${STAFF_UID} — withdrawal lifecycle\n`);
    const wd = (pid, srcBatch, qty) => createStockWithdrawal({ direction: 'branch_to_central', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: srcBatch, productId: pid, productName: `${pid}-name`, qty, unit: 'cc', cost: 7 }] });

    // W1 — send then cancel → source restored
    console.log('W1 — withdraw 4 of 10; send (SRC→6); cancel → SRC restored to 10');
    { const P = `${NS}-W1-P`, B = `${NS}-W1-B`; await mkProduct(P); await mkBatch(B, P, 10);
      const { withdrawalId } = await wd(P, B, 4);
      await updateStockWithdrawalStatus(withdrawalId, 1, {});
      check('W1.1 after send: SRC = 6', (await remAt(P, SRC)) === 6, `SRC=${await remAt(P, SRC)}`);
      await updateStockWithdrawalStatus(withdrawalId, 3, { canceledNote: 'W1' });
      check('W1.2 after cancel: SRC restored to 10', (await remAt(P, SRC)) === 10, `SRC=${await remAt(P, SRC)}`);
      cleanup.push(['be_stock_withdrawals', withdrawalId]);
    }

    // W2 — full lifecycle 0→1→2 conservation
    console.log('\nW2 — withdraw 4 of 10; send + receive → SRC 6 + WH 4 = 10');
    { const P = `${NS}-W2-P`, B = `${NS}-W2-B`; await mkProduct(P); await mkBatch(B, P, 10);
      const { withdrawalId } = await wd(P, B, 4);
      await updateStockWithdrawalStatus(withdrawalId, 1, {});
      await updateStockWithdrawalStatus(withdrawalId, 2, {});
      const src = await remAt(P, SRC), dst = await remAt(P, DST), tot = await remAt(P, null);
      check('W2.1 SRC = 6', src === 6, `SRC=${src}`);
      check('W2.2 WH (central) = 4 after receive', dst === 4, `WH=${dst}`);
      check('W2.3 cross-location conservation: SRC+WH = 10', tot === 10, `total=${tot}`);
      cleanup.push(['be_stock_withdrawals', withdrawalId]);
    }

    // W3 — full-lot withdrawal → V144 deletes source → cancel → V151 restores
    console.log('\nW3 — A(5)+B(5); withdraw FULL 5 of A; send (A→0, V144 deletes A); cancel → SRC 10');
    { const P = `${NS}-W3-P`, A = `${NS}-W3-A`, BB = `${NS}-W3-B`; await mkProduct(P);
      await mkBatch(A, P, 5, 200000); await mkBatch(BB, P, 5, 100000);
      const { withdrawalId } = await wd(P, A, 5);
      await updateStockWithdrawalStatus(withdrawalId, 1, {});
      const aGone = !(await data.collection('be_stock_batches').doc(A).get()).exists;
      console.log(`  after send: A deleted by V144 = ${aGone}, SRC = ${await remAt(P, SRC)}`);
      let ok = true, err = '';
      try { await updateStockWithdrawalStatus(withdrawalId, 3, { canceledNote: 'W3' }); } catch (e) { ok = false; err = e?.message || String(e); }
      check('W3.1 cancel did NOT throw (V151 re-creates vanished source)', ok, `err=${err}`);
      check('W3.2 SRC restored to 10', (await remAt(P, SRC)) === 10, `SRC=${await remAt(P, SRC)}`);
      cleanup.push(['be_stock_withdrawals', withdrawalId]);
    }
  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanup) await data.collection(c).doc(id).delete().catch(() => {});
      for (const coll of ['be_stock_movements', 'be_stock_batches', 'be_stock_withdrawals']) {
        const snap = await data.collection(coll).get();
        for (const d of snap.docs) { const v = d.data(); if ([v.branchId, v.productId, v.batchId, v.withdrawalId, v.linkedWithdrawalId, v.sourceLocationId, v.destinationLocationId].some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {}); }
      }
      let orphans = 0; for (const [c, id] of cleanup) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {}); await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ HUNT R14 withdrawal lifecycle: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
