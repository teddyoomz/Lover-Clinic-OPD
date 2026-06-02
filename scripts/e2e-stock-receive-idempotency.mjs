#!/usr/bin/env node
// ─── HUNT R8 (convergence round) — transfer/receive double-action idempotency ─
//
// Last untested real-concurrency angle in the stock hunt: a status-advancing op
// that should fire ONCE (send/receive a transfer) firing twice (double-click /
// retry) must NOT double-export the source. The CAS-in-tx pattern is the SAME
// in-tx-status-recheck mechanism RV1/RV2 (V148) already proved on real prod —
// this confirms it for the transfer path too. If clean → the loop converges.
//
// Rule Q L2 (real prod, shipped createStockTransfer + updateStockTransferStatus).
// Run: node scripts/e2e-stock-receive-idempotency.mjs
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
const NS = `TEST-RCV-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  const readBatch = async (id) => (await data.collection('be_stock_batches').doc(id).get()).data();

  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    await data.collection('be_branches').doc(SRC).set({ branchId: SRC, branchName: 'RCV-SRC', isDefault: false });
    await data.collection('be_branches').doc(DST).set({ branchId: DST, branchName: 'RCV-DST', isDefault: false });
    console.log(`signed in ${STAFF_UID} — transfer double-send idempotency\n`);

    const ROUNDS = 5;
    let doubleExport = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const P = `${NS}-P-${r}`, B = `${NS}-B-${r}`;
      cleanup.push(['be_products', P], ['be_stock_batches', B]);
      await data.collection('be_products').doc(P).set({
        productId: P, productName: `${P}-name`, productType: 'สินค้าหน้าร้าน', branchId: SRC,
        stockConfig: { trackStock: true, minAlert: 0, unit: 'cc' }, status: 'ใช้งาน', createdAt: new Date().toISOString(),
      });
      await data.collection('be_stock_batches').doc(B).set({
        batchId: B, productId: P, productName: `${P}-name`, branchId: SRC, locationId: SRC, locationType: 'branch',
        status: BATCH_STATUS.ACTIVE, qty: { total: 10, remaining: 10 }, originalCost: 0,
        receivedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      });
      const { transferId } = await createStockTransfer({
        sourceLocationId: SRC, destinationLocationId: DST,
        items: [{ sourceBatchId: B, productId: P, productName: `${P}-name`, qty: 4, unit: 'cc' }],
      });
      // Double-send (status 0 → 1) concurrently — the CAS must let only ONE through.
      const res = await Promise.allSettled([
        updateStockTransferStatus(transferId, 1, {}),
        updateStockTransferStatus(transferId, 1, {}),
      ]);
      const ok = res.filter(x => x.status === 'fulfilled').length;
      const rej = res.filter(x => x.status === 'rejected').length;
      const src = await readBatch(B);
      const rem = Number(src?.qty?.remaining);
      // export 4 ONCE → source 6. Double-export → 2. Idempotent CAS → exactly one fulfilled.
      if (rem !== 6 || ok !== 1) doubleExport++;
      cleanup.push(['be_stock_transfers', transferId]);
      console.log(`  round ${r}: fulfilled=${ok} rejected=${rej} source_remaining=${rem} (want 6, exported once)`);
    }
    check('R8 — concurrent double-send exports the source EXACTLY once (CAS idempotent, no double-export)',
      doubleExport === 0, `${doubleExport}/${ROUNDS} double-exported`);
  } finally {
    console.log('\ncleanup...');
    try {
      for (const [c, id] of cleanup) await data.collection(c).doc(id).delete().catch(() => {});
      for (const coll of ['be_stock_movements', 'be_stock_batches', 'be_stock_transfers']) {
        const snap = await data.collection(coll).get();
        for (const d of snap.docs) { const v = d.data();
          if ([v.branchId, v.productId, v.batchId, v.transferId, v.sourceLocationId, v.destinationLocationId, v.linkedTransferId]
            .some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {}); }
      }
      let orphans = 0;
      for (const [c, id] of cleanup) if ((await data.collection(c).doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ HUNT R8 transfer idempotency: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
