#!/usr/bin/env node
// ═══ Rule M — delete leaked FEFO18 stock-test pollution (two-phase) ═══
// scripts/e2e-stock-fefo-expiry.mjs (ran ~2026-06-02) created TEST-FEFO18-* branches
// + products + batches + movements on REAL prod and never cleaned up. They pollute
// the สาขาที่ออกตรวจ branch picker. Referenced ONLY by each other (verified by
// diag-doctor-name-and-test-branches.mjs: no real customer/appt/sale/treatment
// touches them; no doctor/staff has them in branchIds).
//   DRY-RUN (default): list everything that WOULD be deleted.
//   --apply: delete + write audit doc. Idempotent (re-run --apply → 0).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
const PREFIX_RE = /^TEST-FEFO18-/;
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  const db = initAdmin();
  const data = base(db);
  console.log(`═══ FEFO18 test-pollution cleanup — ${APPLY ? 'APPLY (will delete)' : 'DRY-RUN (no writes)'} ═══\n`);

  // 1. prefixed docs in be_branches / be_products / be_stock_batches
  const prefixedCols = ['be_branches', 'be_products', 'be_stock_batches'];
  const toDelete = []; // { col, id }
  const testBranchIds = new Set();
  for (const col of prefixedCols) {
    const snap = await data.collection(col).get();
    for (const d of snap.docs) {
      if (PREFIX_RE.test(d.id)) {
        toDelete.push({ col, id: d.id });
        if (col === 'be_branches') testBranchIds.add(d.id);
      }
    }
  }
  console.log(`  prefixed docs: ${toDelete.length}`);
  for (const x of toDelete) console.log(`    ${x.col}/${x.id}`);
  console.log(`  test branch ids: ${JSON.stringify([...testBranchIds])}\n`);

  // 2. auto-ID stock records referencing the test branches (movements/adjustments/orders/transfers/withdrawals)
  const refCols = ['be_stock_movements', 'be_stock_adjustments', 'be_stock_orders', 'be_stock_transfers', 'be_stock_withdrawals', 'be_central_stock_orders'];
  for (const col of refCols) {
    for (const bid of testBranchIds) {
      for (const field of ['branchId', 'locationId', 'sourceLocationId', 'destLocationId']) {
        let snap;
        try { snap = await data.collection(col).where(field, '==', bid).get(); } catch { continue; }
        for (const d of snap.docs) {
          if (!toDelete.some(x => x.col === col && x.id === d.id)) toDelete.push({ col, id: d.id });
        }
      }
    }
  }
  const byCol = {};
  for (const x of toDelete) byCol[x.col] = (byCol[x.col] || 0) + 1;
  console.log(`  TOTAL to delete: ${toDelete.length} → ${JSON.stringify(byCol)}\n`);

  if (!APPLY) { console.log('  DRY-RUN — re-run with --apply to delete.'); return; }

  // delete in batches
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = db.batch();
    for (const x of toDelete.slice(i, i + 400)) batch.delete(data.collection(x.col).doc(x.id));
    await batch.commit();
    deleted += Math.min(400, toDelete.length - i);
  }
  const auditId = `cleanup-fefo18-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    op: 'cleanup-fefo18-test-pollution', deleted, byCollection: byCol,
    testBranchIds: [...testBranchIds], deletedRefs: toDelete,
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`  ✓ DELETED ${deleted} docs. Audit: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e); process.exit(1); });
}
