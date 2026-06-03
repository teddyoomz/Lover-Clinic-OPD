#!/usr/bin/env node
// Rule M (TWO-PHASE) — one-time cleanup: delete 3 specific CANCELLED test
// import-orders (be_stock_orders) in สาขานครราชสีมา. User-requested
// (2026-06-03): "ลบรายการที่ยกเลิกในหน้า order นำเข้า ... 3 รายการ ... ทดลองเฉยๆ
// อยากเคลียให้สะอาด".
//
// SAFETY (verified at BOTH dry-run + apply, per-order — abort that order if any fail):
//   (1) the order doc EXISTS
//   (2) status === 'cancelled' (or 'cancelled_post_receive') — NEVER delete a live order
//   (3) branchId === the นครราชสีมา branch — NEVER touch another branch
//   (4) any dependent stock BATCHES (linked to the order) must be cancelled/qty0
//       — reported; deleted ONLY with --with-batches (cascade-clean). CANCEL_IMPORT
//       MOVEMENTS are the immutable audit ledger (AV176/Rule O) → NEVER deleted.
//
// DEFAULT = DRY-RUN (no writes). --apply commits. --with-batches also removes the
// order's cancelled batches (qty0, invisible in the balance view) for a cleaner wipe.
//
//   node scripts/cleanup-cancelled-import-orders-nakhon.mjs                 # dry-run
//   node scripts/cleanup-cancelled-import-orders-nakhon.mjs --apply         # delete the 3 order docs
//   node scripts/cleanup-cancelled-import-orders-nakhon.mjs --apply --with-batches

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function loadDotEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue;
    let [, k, v] = m; if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));
if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) loadDotEnv(path.resolve(process.cwd(), '.env.local'));
const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  return getFirestore(initializeApp({ credential: cert({ projectId: APP_ID, clientEmail, privateKey: rawKey.split('\\n').join('\n') }) }));
}
const C = (db, name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);

const TARGET_IDS = [
  'ORD-1780482186981-6tgn',
  'ORD-1780481885603-q9ns',
  'ORD-1780481795569-xpwu',
];
const BRANCH_NAME = 'นครราชสีมา';
const CANCELLED_STATUSES = new Set(['cancelled', 'cancelled_post_receive']);
const APPLY = process.argv.includes('--apply');
const WITH_BATCHES = process.argv.includes('--with-batches');

// scan an object's own string values for an exact match (robust: catches whatever
// the order-link field is named — orderId / sourceOrderId / linkedOrderId / …).
function refsOrderId(data, orderId) {
  for (const v of Object.values(data || {})) {
    if (typeof v === 'string' && v === orderId) return true;
  }
  return false;
}

async function main() {
  console.log(`▶ Cleanup cancelled import-orders (นครราชสีมา) — ${APPLY ? `APPLY${WITH_BATCHES ? ' +batches' : ''} (writing)` : 'DRY-RUN (no writes)'}\n`);
  const db = getAdmin();

  // resolve the นครราชสีมา branchId from be_branches (don't hardcode)
  const branchSnap = await C(db, 'be_branches').get();
  const nakhon = branchSnap.docs.find(d => String(d.data().name || '').trim() === BRANCH_NAME);
  const NAKHON_ID = nakhon ? nakhon.id : null;
  console.log(`สาขา "${BRANCH_NAME}" → branchId = ${NAKHON_ID || '⚠ NOT FOUND'}\n`);

  // load all batches + movements ONCE for dependent scans
  const [batchSnap, movSnap] = await Promise.all([C(db, 'be_stock_batches').get(), C(db, 'be_stock_movements').get()]);
  const allBatches = batchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allMovements = movSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const deletable = [];   // { id, batches: [...] }
  const blocked = [];     // { id, why }

  for (const id of TARGET_IDS) {
    const snap = await C(db, 'be_stock_orders').doc(id).get();
    if (!snap.exists) { blocked.push({ id, why: 'NOT FOUND' }); console.log(`✗ ${id} → NOT FOUND (already gone?) — SKIP\n`); continue; }
    const d = snap.data();
    const status = d.status;
    const branchId = d.branchId || '';
    const vendor = d.vendorName || d.vendor || d.supplierName || '(?)';
    const items = Array.isArray(d.items) ? d.items : [];
    const itemSummary = items.map(it => `${it.qty ?? it.quantity ?? '?'}× ${it.productName || it.name || '?'}`).join(', ') || '(no items)';
    const depBatches = allBatches.filter(b => refsOrderId(b, id));
    const depMovements = allMovements.filter(m => refsOrderId(m, id));

    console.log(`• ${id}`);
    console.log(`    คู่ค้า=${vendor} · status=${status} · branchId=${branchId} · total=${d.total ?? d.grandTotal ?? 0} · note=${d.note || '-'}`);
    console.log(`    items: ${itemSummary}`);
    console.log(`    dependent batches: ${depBatches.length}${depBatches.length ? ' → ' + depBatches.map(b => `${b.id}[status=${b.status},rem=${b.qty?.remaining}]`).join(', ') : ''}`);
    console.log(`    dependent movements (audit ledger, NEVER deleted): ${depMovements.length}${depMovements.length ? ' → ' + depMovements.map(m => `${m.id}[type=${m.type}]`).join(', ') : ''}`);

    const reasons = [];
    if (!CANCELLED_STATUSES.has(status)) reasons.push(`status="${status}" is NOT cancelled`);
    if (NAKHON_ID && branchId !== NAKHON_ID) reasons.push(`branchId="${branchId}" ≠ นครราชสีมา`);
    const liveBatches = depBatches.filter(b => !(b.status === 'cancelled' || Number(b.qty?.remaining) === 0));
    if (liveBatches.length) reasons.push(`${liveBatches.length} dependent batch(es) still LIVE (status≠cancelled & remaining≠0)`);

    if (reasons.length) { blocked.push({ id, why: reasons.join('; ') }); console.log(`    → ⚠ BLOCKED: ${reasons.join('; ')}\n`); }
    else { deletable.push({ id, batches: depBatches }); console.log(`    → ✓ SAFE to delete (cancelled + นครราชสีมา${depBatches.length ? `; ${depBatches.length} cancelled batch(es)` : ''})\n`); }
  }

  const totBatches = deletable.reduce((n, o) => n + o.batches.length, 0);
  console.log(`── SUMMARY ──`);
  console.log(`  deletable order docs: ${deletable.length} → ${deletable.map(o => o.id).join(', ') || '(none)'}`);
  console.log(`  their cancelled batches: ${totBatches}${WITH_BATCHES ? ' (WILL delete — --with-batches)' : ' (kept unless --with-batches)'}`);
  console.log(`  blocked: ${blocked.length}${blocked.length ? ' → ' + blocked.map(b => `${b.id} (${b.why})`).join(' | ') : ''}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN complete. --apply would delete ${deletable.length} order doc(s)${WITH_BATCHES ? ` + ${totBatches} cancelled batch(es)` : ''}. Movements untouched (audit). No live order / other branch touched.`);
    process.exit(0);
  }

  console.log(`\n▶ APPLYING…`);
  let batch = db.batch(); let inBatch = 0; let delOrders = 0, delBatches = 0;
  for (const o of deletable) {
    batch.delete(C(db, 'be_stock_orders').doc(o.id)); delOrders++; inBatch++;
    if (WITH_BATCHES) for (const b of o.batches) { batch.delete(C(db, 'be_stock_batches').doc(b.id)); delBatches++; inBatch++; }
  }
  const auditId = `cleanup-cancelled-import-orders-nakhon-${Date.now()}-${randomBytes(4).toString('hex')}`;
  batch.set(C(db, 'be_admin_audit').doc(auditId), {
    op: 'cleanup-cancelled-import-orders-nakhon',
    branch: BRANCH_NAME, branchId: NAKHON_ID,
    requestedIds: TARGET_IDS,
    deletedOrderIds: deletable.map(o => o.id),
    deletedBatchIds: WITH_BATCHES ? deletable.flatMap(o => o.batches.map(b => b.id)) : [],
    withBatches: WITH_BATCHES,
    blocked,
    appliedAt: FieldValue.serverTimestamp(),
  });
  inBatch++;
  await batch.commit();
  console.log(`✓ APPLIED — deleted ${delOrders} order doc(s)${WITH_BATCHES ? ` + ${delBatches} batch(es)` : ''}. audit: ${auditId}`);
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
