#!/usr/bin/env node
// Rule M (TWO-PHASE) — one-time heal for the orphan-stock debug:
//   PHASE 1 — delete ORPHAN stock batches (productId has NO be_products doc;
//             the product was hard-deleted but the batch lingered → showed in
//             the balance view with "-" cat/type). Admin SDK bypasses the V144
//             ==0-only client rule, so negative-debt orphan lots delete too.
//   PHASE 2 — dedup the 2 SAFE same-branch duplicate-name groups: delete the
//             0-ref doc, keep the sibling. FK-RE-VERIFIED at apply via the same
//             pure guards the runtime cascade uses (evaluateProductDeleteGuards +
//             planProductCascade) — a doc that gained any ref since the diag is
//             SKIPPED, never force-deleted.
//   DEFERRED (reported, NOT touched): the Neuramis 38764↔9B1DEFF7 MERGE (both in
//             use — needs re-pointing 9B1DEFF7's course+batch into 38764) + the
//             junk test-course orphan mainProductId — both need a decision.
//
// DEFAULT = DRY-RUN. Pass --apply to commit. Audit doc + forensic on every op.
//
//   node scripts/v146-cleanup-orphan-stock-and-dedup.mjs            # dry-run
//   node scripts/v146-cleanup-orphan-stock-and-dedup.mjs --apply    # commit

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { evaluateProductDeleteGuards, planProductCascade } from '../src/lib/productDeleteCascade.js';

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

// 2 SAFE dedup deletes (FK-re-verified at apply). { delete, keep } per group.
const DEDUP_DELETE = [
  { del: '38912', keep: '38745', name: 'ไม้พันสำลี (พระราม3)' },
  { del: 'PRODUCTS_1778150429849_A232D1FE', keep: 'PRODUCTS_1778150429849_2C82741F', name: 'ไม้พันสำลี (นครราชสีมา)' },
];
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`▶ V146 orphan-stock + dedup cleanup — ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}\n`);
  const db = getAdmin();
  const [prodSnap, batchSnap, courseSnap, groupSnap, ordSnap, trSnap, wdSnap, cordSnap] = await Promise.all([
    C(db, 'be_products').get(), C(db, 'be_stock_batches').get(), C(db, 'be_courses').get(), C(db, 'be_product_groups').get(),
    C(db, 'be_stock_orders').get(), C(db, 'be_stock_transfers').get(), C(db, 'be_stock_withdrawals').get(), C(db, 'be_central_stock_orders').get(),
  ]);
  const prodIds = new Set();
  for (const d of prodSnap.docs) { prodIds.add(d.id); if (d.data().productId) prodIds.add(String(d.data().productId)); }
  const allCourses = courseSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allBatches = batchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allGroups = groupSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allOps = [ordSnap, trSnap, wdSnap, cordSnap].flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })));

  // ── PHASE 1 — orphan batches ──
  const orphanBatches = allBatches.filter(b => b.productId && !prodIds.has(String(b.productId)));
  console.log(`── PHASE 1 — orphan stock batches (productId ∉ be_products): ${orphanBatches.length} ──`);
  for (const b of orphanBatches) {
    console.log(`  batch ${b.id} product=${b.productId} "${b.productName || '?'}" loc=${b.locationId || b.branchId} remaining=${b.qty?.remaining} status=${b.status}`);
  }

  // ── PHASE 2 — dedup deletes (FK re-verify via the runtime guards) ──
  console.log(`\n── PHASE 2 — dedup deletes (FK re-verified): ${DEDUP_DELETE.length} candidates ──`);
  const dedupOk = [], dedupSkip = [];
  for (const g of DEDUP_DELETE) {
    const exists = prodSnap.docs.find(d => d.id === g.del);
    if (!exists) { dedupSkip.push({ ...g, why: 'already gone' }); console.log(`  ${g.del} "${g.name}" → SKIP (already gone)`); continue; }
    const batches = allBatches.filter(b => String(b.productId) === g.del);
    const branchId = exists.data().branchId || '';
    const courses = allCourses.filter(c => String(c.branchId) === String(branchId));
    const groups = allGroups.filter(gr => String(gr.branchId) === String(branchId));
    // ALL ops (NOT branch-filtered) — transfers/withdrawals/central lack branchId;
    // the guard filters by product-reference + pending status (2026-06-02 fix).
    const guards = evaluateProductDeleteGuards({ productId: g.del, batches, courses, stockOps: allOps });
    const plan = planProductCascade({ productId: g.del, batches, courses, groups });
    const refCount = plan.batches.length + plan.courseUpdates.length + plan.groupUpdates.length;
    if (guards.blocked || refCount > 0) {
      dedupSkip.push({ ...g, why: guards.blocked ? guards.reasons.map(r => r.code).join('+') : `${refCount} refs` });
      console.log(`  ${g.del} "${g.name}" → ⚠ SKIP (${guards.blocked ? guards.reasons.map(r => r.code).join('+') : refCount + ' refs'}) — gained a ref since diag; not force-deleting`);
    } else {
      dedupOk.push(g);
      console.log(`  ${g.del} "${g.name}" → DELETE (keep sibling ${g.keep}; 0 refs verified)`);
    }
  }

  // ── DEFERRED report ──
  console.log(`\n── DEFERRED (NOT touched — need a decision) ──`);
  console.log(`  Neuramis MERGE: 38764 (17 courses + 1 batch, KEEP) ↔ PRODUCTS_1778150429849_9B1DEFF7 (1 course + 1 batch) — re-point 9B1DEFF7's course/batch into 38764 then delete (needs explicit confirm).`);
  console.log(`  junk test-course orphan mainProductId "หฟแฟ" (branch BR-1778136097138) — test data; course-delete is a separate cascade.`);

  if (!APPLY) {
    console.log(`\nDRY-RUN complete. --apply would: delete ${orphanBatches.length} orphan batches + delete ${dedupOk.length} dup product docs (${dedupSkip.length} skipped). NO Neuramis merge, NO junk-course touch.`);
    process.exit(0);
  }

  // ── APPLY ──
  console.log(`\n▶ APPLYING…`);
  let batch = db.batch(); let inBatch = 0; let deletedBatches = 0, deletedDups = 0;
  const flush = async () => { if (inBatch >= 450) { await batch.commit(); batch = db.batch(); inBatch = 0; } };
  for (const b of orphanBatches) { batch.delete(C(db, 'be_stock_batches').doc(b.id)); deletedBatches++; inBatch++; await flush(); }
  for (const g of dedupOk) { batch.delete(C(db, 'be_products').doc(g.del)); deletedDups++; inBatch++; await flush(); }
  const auditId = `v146-orphan-dedup-cleanup-${randomBytes(6).toString('hex')}`;
  batch.set(C(db, 'be_admin_audit').doc(auditId), {
    op: 'v146-orphan-stock-and-dedup-cleanup',
    orphanBatchesDeleted: deletedBatches,
    orphanBatchIds: orphanBatches.map(b => b.id),
    dupProductsDeleted: deletedDups,
    dupProductIds: dedupOk.map(g => g.del),
    dupSkipped: dedupSkip,
    deferred: ['neuramis-merge-38764-9B1DEFF7', 'junk-course-หฟแฟ'],
    appliedAt: FieldValue.serverTimestamp(),
  });
  inBatch++;
  await batch.commit();
  console.log(`✓ APPLIED — deleted ${deletedBatches} orphan batches + ${deletedDups} dup products. audit: ${auditId}`);
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
