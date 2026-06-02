#!/usr/bin/env node
// ─── HUNT R13 — transfer full lifecycle + cancel-restores-source + V144/V151 ──
//
// Cross-location stock-purpose (untested since V20). A transfer moves stock
// SRC→DST; total must be conserved across both locations, and cancelling a SENT
// transfer must RESTORE the source (never lose stock in transit).
//   T1 — send (0→1) then CANCEL (1→3) → source restored, conservation.
//   T2 — full lifecycle 0→1→2 → SRC −4 + DST +4 = original total (cross-loc).
//   T3 — transfer a FULL lot (source→0, another lot live → V144 deletes source)
//        then CANCEL → _reverseExport → _reverseOneMovement → V151 re-creates
//        the vanished source lot → restored (the transfer V151-interaction).
//
// Rule Q L2 (real prod). Rule M/R cleanup.
// Run: node scripts/e2e-stock-transfer-lifecycle.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';

import { auth as clientAuth } from '../src/firebase.js';
import { createStockTransfer, updateStockTransferStatus } from '../src/lib/backendClient.js';
import { BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-XFER-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const SRC = `${NS}-SRC`, DST = `${NS}-DST`;
  const cleanup = [['be_branches', SRC], ['be_branches', DST]];
  const remAt = async (pid, loc) => {
    const s = await data.collection('be_stock_batches').where('productId', '==', pid).get();
    let sum = 0; s.docs.forEach(d => { const v = d.data(); if (!loc || v.branchId === loc || v.locationId === loc) sum += Number(v.qty?.remaining) || 0; });
    return sum;
  };
  const totalRem = async (pid) => remAt(pid, null);
  const mkProduct = (pid) => { cleanup.push(['be_products', pid]); return data.collection('be_products').doc(pid).set({
    productId: pid, productName: `${pid}-name`, productType: 'สินค้าหน้าร้าน', branchId: SRC,
    stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString(),
  }); };
  const mkBatch = (bid, pid, remaining, ageMs = 0) => { cleanup.push(['be_stock_batches', bid]); return data.collection('be_stock_batches').doc(bid).set({
    batchId: bid, productId: pid, productName: `${pid}-name`, branchId: SRC, locationId: SRC, locationType: 'branch',
    status: BATCH_STATUS.ACTIVE, qty: { total: remaining, remaining }, originalCost: 7,
    receivedAt: new Date(Date.now() - ageMs).toISOString(), createdAt: new Date(Date.now() - ageMs).toISOString(),
  }); };

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(SRC).set({ branchId: SRC, branchName: 'XFER-SRC', isDefault: false });
    await data.collection('be_branches').doc(DST).set({ branchId: DST, branchName: 'XFER-DST', isDefault: false });
    console.log(`signed in ${STAFF_UID} — transfer lifecycle\n`);
    const xfer = (pid, srcBatch, qty) => createStockTransfer({
      sourceLocationId: SRC, destinationLocationId: DST,
      items: [{ sourceBatchId: srcBatch, productId: pid, productName: `${pid}-name`, qty, unit: 'cc', cost: 7 }],
    });

    // T1 — send then CANCEL → source restored
    console.log('T1 — transfer 4 of 10; send (SRC→6); cancel → SRC restored to 10');
    { const P = `${NS}-T1-P`, B = `${NS}-T1-B`;
      await mkProduct(P); await mkBatch(B, P, 10);
      const { transferId } = await xfer(P, B, 4);
      await updateStockTransferStatus(transferId, 1, {}); // send
      check('T1.1 after send: SRC drained to 6', (await remAt(P, SRC)) === 6, `SRC=${await remAt(P, SRC)}`);
      await updateStockTransferStatus(transferId, 3, { canceledNote: 'T1 cancel' }); // cancel
      check('T1.2 after cancel: SRC restored to 10 (no stock lost in transit)', (await remAt(P, SRC)) === 10, `SRC=${await remAt(P, SRC)}`);
      cleanup.push(['be_stock_transfers', transferId]);
    }

    // T2 — full lifecycle 0→1→2 cross-location conservation
    console.log('\nT2 — transfer 4 of 10; send + receive → SRC 6 + DST 4 = 10 (conserved)');
    { const P = `${NS}-T2-P`, B = `${NS}-T2-B`;
      await mkProduct(P); await mkBatch(B, P, 10);
      const { transferId } = await xfer(P, B, 4);
      await updateStockTransferStatus(transferId, 1, {}); // send
      await updateStockTransferStatus(transferId, 2, {}); // receive
      const src = await remAt(P, SRC), dst = await remAt(P, DST), tot = await totalRem(P);
      check('T2.1 SRC = 6 after transfer-out', src === 6, `SRC=${src}`);
      check('T2.2 DST = 4 after receive (new lot at destination)', dst === 4, `DST=${dst}`);
      check('T2.3 cross-location conservation: SRC+DST = 10 (original total)', tot === 10, `total=${tot}`);
      cleanup.push(['be_stock_transfers', transferId]);
    }

    // T3 — full-lot transfer → V144 deletes drained source → cancel → V151 restores
    console.log('\nT3 — A(5)+B(5); transfer FULL 5 of A; send (A→0, V144 deletes A); cancel → A re-created → SRC 10');
    { const P = `${NS}-T3-P`, A = `${NS}-T3-A`, BB = `${NS}-T3-B`;
      await mkProduct(P);
      await mkBatch(A, P, 5, 200000); // the lot we fully transfer
      await mkBatch(BB, P, 5, 100000); // keeps SRC non-empty → V144 may delete A
      const { transferId } = await xfer(P, A, 5);
      await updateStockTransferStatus(transferId, 1, {}); // send → A drains to 0 → V144 may delete A
      const aGone = !(await data.collection('be_stock_batches').doc(A).get()).exists;
      console.log(`  after send: A deleted by V144 = ${aGone}, SRC total = ${await remAt(P, SRC)}`);
      check('T3.1 after send: SRC = 5 (A drained, B live)', (await remAt(P, SRC)) === 5, `SRC=${await remAt(P, SRC)}`);
      let cancelOk = true, err = '';
      try { await updateStockTransferStatus(transferId, 3, { canceledNote: 'T3 cancel' }); } catch (e) { cancelOk = false; err = e?.message || String(e); }
      check('T3.2 cancel did NOT throw (V151 re-creates vanished source lot)', cancelOk, `err=${err}`);
      check('T3.3 SRC restored to 10 (V151 brought the transferred-out stock back)', (await remAt(P, SRC)) === 10, `SRC=${await remAt(P, SRC)}`);
      cleanup.push(['be_stock_transfers', transferId]);
    }
  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanup) await data.collection(c).doc(id).delete().catch(() => {});
      for (const coll of ['be_stock_movements', 'be_stock_batches', 'be_stock_transfers']) {
        const snap = await data.collection(coll).get();
        for (const d of snap.docs) { const v = d.data();
          if ([v.branchId, v.productId, v.batchId, v.transferId, v.linkedTransferId, v.sourceLocationId, v.destinationLocationId].some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {}); }
      }
      let orphans = 0;
      for (const [c, id] of cleanup) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ HUNT R13 transfer lifecycle: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
