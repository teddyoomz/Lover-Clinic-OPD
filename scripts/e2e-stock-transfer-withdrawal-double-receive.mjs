#!/usr/bin/env node
// ─── HUNT R21 — concurrent DOUBLE-RECEIVE of a transfer + withdrawal.
//   Verifies (Rule Q — empirically, NOT by code-read) the status-CAS gate that
//   the summary CLAIMED makes transfer/withdrawal "never vulnerable" to the
//   V152-class double-receive. Two concurrent "รับ" (status 1→2) must create
//   EXACTLY ONE destination batch — the loser's tx re-reads status=2, sees
//   allowed[2]=[] and THROWS before any batch creation. Plus cross-location
//   conservation (source loss = dest gain, no stock duplicated/lost).
//   R21.1 transfer: send → double-receive → 1 dest batch (+4), source −4, total conserved
//   R21.2 withdrawal: approve → double-receive → 1 dest batch (+4), source −4, conserved
// Rule Q L2 (real prod). Run: node scripts/e2e-stock-transfer-withdrawal-double-receive.mjs
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken } from 'firebase/auth';
import { auth as clientAuth } from '../src/firebase.js';
import { createStockTransfer, updateStockTransferStatus, createStockWithdrawal, updateStockWithdrawalStatus, listStockMovements } from '../src/lib/backendClient.js';
import { BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-XRCV21-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const SRC = `${NS}-SRC`, DST = `${NS}-DST`;
  const cleanup = [['be_branches', SRC], ['be_branches', DST]];
  const lots = async (pid) => (await data.collection('be_stock_batches').where('productId', '==', pid).get()).docs.map(d => d.data());
  // Branch batches are keyed by `branchId` — that is EXACTLY what production reads
  // (listStockBatches L5768 + the live StockBalancePanel listener L5840 both
  // `where('branchId','==',...)`). The transfer/withdrawal dest batch sets
  // branchId=destinationLocationId (no locationId field), so visibility is by
  // branchId. Match on branchId (fall back to locationId for my own seed lots).
  const at = (b, loc) => b.branchId === loc || b.locationId === loc;
  const remAt = (arr, loc) => arr.filter(b => at(b, loc)).reduce((s, b) => s + (Number(b.qty?.remaining) || 0), 0);
  const lotsAt = (arr, loc) => arr.filter(b => at(b, loc));
  const total = (arr) => arr.reduce((s, b) => s + (Number(b.qty?.remaining) || 0), 0);
  const mkProduct = (pid) => { cleanup.push(['be_products', pid]); return data.collection('be_products').doc(pid).set({ productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: SRC, stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString() }); };
  const mkBatch = (bid, pid, remaining) => { cleanup.push(['be_stock_batches', bid]); return data.collection('be_stock_batches').doc(bid).set({ batchId: bid, productId: pid, productName: `${pid}-name`, branchId: SRC, locationId: SRC, locationType: 'branch', status: BATCH_STATUS.ACTIVE, qty: { total: remaining, remaining }, originalCost: 7, cost: 7, receivedAt: new Date().toISOString(), expiresAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(SRC).set({ branchId: SRC, branchName: 'XRCV-SRC', isDefault: false });
    await data.collection('be_branches').doc(DST).set({ branchId: DST, branchName: 'XRCV-DST', isDefault: false });
    console.log(`signed in ${STAFF_UID} — transfer + withdrawal concurrent double-receive\n`);

    // R21.1 — transfer concurrent double-receive
    console.log('R21.1 — transfer SRC→DST 4, send, then RECEIVE (1→2) ×2 CONCURRENT → 1 dest batch');
    { const P = `${NS}-T-P`; await mkProduct(P); const LA = `${NS}-T-LA`; await mkBatch(LA, P, 10);
      const tr = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: LA, productId: P, productName: `${P}-name`, qty: 4, unit: 'cc', cost: 7 }] });
      cleanup.push(['be_stock_transfers', tr.transferId]);
      await updateStockTransferStatus(tr.transferId, 1, { user: { userId: STAFF_UID, userName: 'send' } }); // send 0→1
      check('R21.1.0 after send: source drained to 6 (still in transit, not at DST)', remAt(await lots(P), SRC) === 6, `SRC=${remAt(await lots(P), SRC)}`);
      const [a, b] = await Promise.allSettled([
        updateStockTransferStatus(tr.transferId, 2, { user: { userId: STAFF_UID, userName: 'rcvA' } }),
        updateStockTransferStatus(tr.transferId, 2, { user: { userId: STAFF_UID, userName: 'rcvB' } }),
      ]);
      const okCount = [a, b].filter(r => r.status === 'fulfilled').length;
      check('R21.1.1 exactly ONE receive succeeded (loser threw Invalid transition)', okCount === 1, `okCount=${okCount} (${a.status}/${b.status})`);
      const all = await lots(P);
      check('R21.1.2 exactly ONE destination batch created (no double-batch)', lotsAt(all, DST).length === 1, `destLots=${lotsAt(all, DST).length}`);
      check('R21.1.3 destination has +4 (not +8)', remAt(all, DST) === 4, `DST=${remAt(all, DST)}`);
      check('R21.1.4 cross-location conservation: total = 10 (SRC 6 + DST 4)', total(all) === 10, `total=${total(all)}`);
      const recv = (await listStockMovements({ includeReversed: true })).filter(m => m.linkedTransferId === tr.transferId && Number(m.qty) > 0);
      check('R21.1.5 exactly ONE RECEIVE movement (ledger not doubled)', recv.length === 1, `recvMvts=${recv.length}`);
    }

    // R21.2 — withdrawal concurrent double-receive
    console.log('\nR21.2 — withdrawal SRC→DST 4, approve, then RECEIVE (1→2) ×2 CONCURRENT → 1 dest batch');
    { const P = `${NS}-W-P`; await mkProduct(P); const LA = `${NS}-W-LA`; await mkBatch(LA, P, 10);
      const wd = await createStockWithdrawal({ direction: 'branch_to_central', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: LA, productId: P, productName: `${P}-name`, qty: 4, unit: 'cc', cost: 7 }] }, { user: { userId: STAFF_UID, userName: 'req' } });
      cleanup.push(['be_stock_withdrawals', wd.withdrawalId]);
      await updateStockWithdrawalStatus(wd.withdrawalId, 1, { user: { userId: STAFF_UID, userName: 'approve' } }); // approve+dispatch 0→1
      check('R21.2.0 after approve+dispatch: source drained to 6', remAt(await lots(P), SRC) === 6, `SRC=${remAt(await lots(P), SRC)}`);
      const [a, b] = await Promise.allSettled([
        updateStockWithdrawalStatus(wd.withdrawalId, 2, { user: { userId: STAFF_UID, userName: 'rcvA' } }),
        updateStockWithdrawalStatus(wd.withdrawalId, 2, { user: { userId: STAFF_UID, userName: 'rcvB' } }),
      ]);
      const okCount = [a, b].filter(r => r.status === 'fulfilled').length;
      check('R21.2.1 exactly ONE receive succeeded (loser threw)', okCount === 1, `okCount=${okCount} (${a.status}/${b.status})`);
      const all = await lots(P);
      check('R21.2.2 exactly ONE destination batch created', lotsAt(all, DST).length === 1, `destLots=${lotsAt(all, DST).length}`);
      check('R21.2.3 destination has +4 (not +8)', remAt(all, DST) === 4, `DST=${remAt(all, DST)}`);
      check('R21.2.4 conservation: total = 10 (SRC 6 + DST 4)', total(all) === 10, `total=${total(all)}`);
    }

    console.log('\n──────── cleanup ────────');
    for (const sfx of ['T-P', 'W-P']) { const pid = `${NS}-${sfx}`; for (const bt of await lots(pid)) await data.collection('be_stock_batches').doc(bt.batchId).delete().catch(() => {}); }
    const allMvts = await data.collection('be_stock_movements').get();
    let mdel = 0; for (const d of allMvts.docs) { const m = d.data(); if (String(m.productId || '').includes(NS) || String(m.linkedTransferId || '').includes(NS) || String(m.linkedWithdrawalId || '').includes(NS)) { await d.ref.delete().catch(() => {}); mdel++; } }
    for (const [coll, id] of cleanup) await data.collection(coll).doc(id).delete().catch(() => {});
    let orphan = 0; for (const sfx of ['T-P', 'W-P']) orphan += (await lots(`${NS}-${sfx}`)).length;
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
