#!/usr/bin/env node
// Rule M (TWO-PHASE) — the two v146-DEFERRED data ops:
//
//   PART A — Neuramis MERGE: KEEP 38764 ← DUP PRODUCTS_1778150429849_9B1DEFF7.
//     Both "Neuramis Deep", SAME branch (นครราชสีมา) → a true duplicate. The dup
//     is referenced by exactly: 1 course (mainProductId), 1 live batch (20 CC),
//     1 import movement, 1 active stock order. NO sales/treatments/customers.
//     Merge = RE-POINT every dup reference to 38764, then delete the dup doc.
//       • course.mainProductId / courseProducts[].productId  9B1DEFF7 → 38764
//       • batch.productId (keeps the 20 CC under the canonical product)
//       • stock_movement.productId  (deliberate, forensic-stamped + audited —
//         the dup IS the same physical product, so the import really was 38764;
//         repointing keeps per-product ledger consistency. This is a MERGE, not
//         the delete-cascade's "leave history" rule.)
//       • stock-order items[].productId (else the pending order → PRODUCT_NOT_FOUND
//         on receive once the dup product is gone — HAS_PENDING_OP guard)
//       • be_product_groups productIds[]/products[]  (pull dup / keep 38764)
//       • DELETE be_products/9B1DEFF7
//     Forensic `_mergedFromProductId` + `_mergedAt` on every repointed doc.
//
//   PART B — junk test-course "หฟแฟ" (COURSE-mov6aenj-3ee6d422bbde833d, test
//     branch BR-1778136097138, orphan mainProductId, salePrice null) — 0 refs
//     (re-verified at apply). DELETE the course doc.
//
// DEFAULT = DRY-RUN. --apply commits. Idempotent (re-run after apply = 0 writes).
//   node scripts/v146-followup-neuramis-merge-and-junk-course.mjs          # dry-run
//   node scripts/v146-followup-neuramis-merge-and-junk-course.mjs --apply  # commit
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { courseProductList } from '../src/lib/productDeleteCascade.js';

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
  return getFirestore(initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) }));
}
const C = (db, name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);

const KEEP = '38764';
const DUP = 'PRODUCTS_1778150429849_9B1DEFF7';
const JUNK_COURSE_ID = 'COURSE-mov6aenj-3ee6d422bbde833d';
const APPLY = process.argv.includes('--apply');
const jstr = (o) => { try { return JSON.stringify(o); } catch { return ''; } };

async function main() {
  console.log(`▶ Neuramis merge + junk-course cleanup — ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}\n`);
  const db = getAdmin();
  const [prod, course, batch, mov, sales, treat, cust, group, ord, trans, wd, cord] = await Promise.all([
    C(db, 'be_products').get(), C(db, 'be_courses').get(), C(db, 'be_stock_batches').get(),
    C(db, 'be_stock_movements').get(), C(db, 'be_sales').get(), C(db, 'be_treatments').get(),
    C(db, 'be_customers').get(), C(db, 'be_product_groups').get(),
    C(db, 'be_stock_orders').get(), C(db, 'be_stock_transfers').get(), C(db, 'be_stock_withdrawals').get(), C(db, 'be_central_stock_orders').get(),
  ]);
  const products = prod.docs.map(d => ({ id: d.id, ...d.data() }));
  const courses = course.docs.map(d => ({ id: d.id, ...d.data() }));
  const batches = batch.docs.map(d => ({ id: d.id, ...d.data() }));
  const movements = mov.docs.map(d => ({ id: d.id, ...d.data() }));
  const allSales = sales.docs.map(d => ({ id: d.id, ...d.data() }));
  const treatments = treat.docs.map(d => ({ id: d.id, ...d.data() }));
  const customers = cust.docs.map(d => ({ id: d.id, ...d.data() }));
  const groups = group.docs.map(d => ({ id: d.id, ...d.data() }));
  const opsByCol = { be_stock_orders: ord, be_stock_transfers: trans, be_stock_withdrawals: wd, be_central_stock_orders: cord };

  // ── batch writer (450-flush) ──
  let wb = db.batch(), inB = 0;
  const writes = [];
  const stamp = () => ({ _mergedFromProductId: DUP, _mergedAt: FieldValue.serverTimestamp() });
  const queueUpdate = async (ref, patch, label) => { writes.push(label); if (APPLY) { wb.update(ref, patch); if (++inB >= 400) { await wb.commit(); wb = db.batch(); inB = 0; } } };
  const queueDelete = async (ref, label) => { writes.push(label); if (APPLY) { wb.delete(ref); if (++inB >= 400) { await wb.commit(); wb = db.batch(); inB = 0; } } };

  // ═══ PART A — Neuramis merge ═══
  console.log('═══ PART A — Neuramis merge (9B1DEFF7 → 38764) ═══');
  const keepP = products.find(p => p.id === KEEP);
  const dupP = products.find(p => p.id === DUP);
  let mergeCounts = { courses: 0, batches: 0, movements: 0, ops: 0, groups: 0, productDeleted: 0 };
  if (!dupP) {
    console.log('  DUP already gone → merge already applied (idempotent skip).');
  } else if (!keepP) {
    console.log('  ⚠ KEEP 38764 NOT FOUND — ABORTING merge (cannot repoint into a missing canonical).');
  } else if (keepP.branchId !== dupP.branchId) {
    console.log(`  ⚠ NOT same branch (keep=${keepP.branchId} dup=${dupP.branchId}) — ABORTING (per-branch copies are NOT dups, V145).`);
  } else {
    const keepName = keepP.productName || keepP.name || 'Neuramis Deep';
    // (1) courses — mainProductId + courseProducts[]
    for (const c of courses) {
      let changed = false; const patch = {};
      if (String(c.mainProductId) === DUP) { patch.mainProductId = KEEP; patch.mainProductName = keepName; changed = true; }
      const list = courseProductList(c);
      if (list.some(p => String(p.productId) === DUP)) {
        const key = Array.isArray(c.courseProducts) ? 'courseProducts' : 'products';
        patch[key] = list.map(p => String(p.productId) === DUP ? { ...p, productId: KEEP, productName: keepName } : p);
        changed = true;
      }
      if (changed) { Object.assign(patch, stamp()); await queueUpdate(C(db, 'be_courses').doc(c.id), patch, `course ${c.id}`); mergeCounts.courses++; console.log(`  course ${c.id} "${c.courseName}" → repoint (main=${String(c.mainProductId) === DUP})`); }
    }
    // (2) batches
    for (const b of batches.filter(b => String(b.productId) === DUP)) {
      await queueUpdate(C(db, 'be_stock_batches').doc(b.id), { productId: KEEP, productName: keepName, ...stamp() }, `batch ${b.id}`);
      mergeCounts.batches++; console.log(`  batch ${b.id} (remaining=${b.qty?.remaining}) → productId 38764`);
    }
    // (3) movements (deliberate merge repoint — audited)
    for (const m of movements.filter(m => String(m.productId) === DUP)) {
      await queueUpdate(C(db, 'be_stock_movements').doc(m.id), { productId: KEEP, productName: keepName, ...stamp() }, `movement ${m.id}`);
      mergeCounts.movements++; console.log(`  movement ${m.id} (type=${m.type}) → productId 38764`);
    }
    // (4) stock ops — repoint any items[].productId === DUP (+ top-level)
    for (const [colName, snap] of Object.entries(opsByCol)) {
      for (const d of snap.docs) {
        const data = d.data(); let changed = false; const patch = {};
        if (String(data.productId) === DUP) { patch.productId = KEEP; changed = true; }
        for (const [field, val] of Object.entries(data)) {
          if (Array.isArray(val) && val.some(el => el && typeof el === 'object' && String(el.productId) === DUP)) {
            patch[field] = val.map(el => (el && typeof el === 'object' && String(el.productId) === DUP) ? { ...el, productId: KEEP, productName: el.productName || keepName } : el);
            changed = true;
          }
        }
        if (changed) { Object.assign(patch, stamp()); await queueUpdate(C(db, colName).doc(d.id), patch, `${colName} ${d.id}`); mergeCounts.ops++; console.log(`  ${colName} ${d.id} (status=${data.status}) → repoint items to 38764`); }
      }
    }
    // (5) product_groups — pull dup (keep 38764) / replace
    for (const g of groups) {
      const ids = Array.isArray(g.productIds) ? g.productIds : [];
      const prods = Array.isArray(g.products) ? g.products : [];
      const hasDupId = ids.some(x => String(x) === DUP);
      const hasDupProd = prods.some(p => String(p?.productId) === DUP);
      if (!hasDupId && !hasDupProd) continue;
      const patch = {};
      if (ids.length) { const keepHas = ids.some(x => String(x) === KEEP); patch.productIds = ids.filter(x => String(x) !== DUP).concat(keepHas ? [] : [KEEP]); }
      if (prods.length) { const keepHas = prods.some(p => String(p?.productId) === KEEP); patch.products = prods.filter(p => String(p?.productId) !== DUP).concat(keepHas ? [] : [{ productId: KEEP, productName: keepName }]); }
      Object.assign(patch, stamp()); await queueUpdate(C(db, 'be_product_groups').doc(g.id), patch, `group ${g.id}`); mergeCounts.groups++; console.log(`  group ${g.id} → pull/replace dup`);
    }
    // (6) delete dup product
    await queueDelete(C(db, 'be_products').doc(DUP), `DELETE product ${DUP}`); mergeCounts.productDeleted = 1;
    console.log(`  DELETE be_products/${DUP}`);
    // safety re-check: no historical sales/treatments reference DUP (they'd keep a now-dead productId)
    const salesDup = allSales.filter(s => jstr(s).includes(DUP)).length;
    const treatDup = treatments.filter(t => jstr(t).includes(DUP)).length;
    const custDup = customers.filter(c => jstr(c).includes(DUP)).length;
    console.log(`  (historical refs left as-is per Rule O — sales=${salesDup} treatments=${treatDup} customers=${custDup}; all 0 = clean)`);
  }

  // ═══ PART B — junk course delete ═══
  console.log('\n═══ PART B — junk course "หฟแฟ" delete ═══');
  let junkDeleted = 0;
  const junk = courses.find(c => c.id === JUNK_COURSE_ID) || courses.find(c => String(c.courseName) === 'หฟแฟ');
  if (!junk) {
    console.log('  junk course already gone (idempotent skip).');
  } else {
    // re-verify 0 refs at apply
    const custRef = customers.filter(c => (c.courses || []).some(cc => String(cc.courseId) === junk.id || String(cc.name || '').includes('หฟแฟ'))).length;
    const salesRef = allSales.filter(s => jstr(s).includes(junk.id) || jstr(s).includes('หฟแฟ')).length;
    const treatRef = treatments.filter(t => jstr(t).includes(junk.id) || jstr(t).includes('หฟแฟ')).length;
    if (custRef || salesRef || treatRef) {
      console.log(`  ⚠ SKIP — gained refs since diag (customers=${custRef} sales=${salesRef} treatments=${treatRef}); not deleting.`);
    } else {
      await queueDelete(C(db, 'be_courses').doc(junk.id), `DELETE course ${junk.id}`);
      junkDeleted = 1;
      console.log(`  DELETE be_courses/${junk.id} "${junk.courseName}" (branch ${junk.branchId}, 0 refs verified)`);
    }
  }

  // ═══ audit + commit ═══
  const auditId = `v146-followup-neuramis-merge-junk-course-${Date.now()}-${randomBytes(4).toString('hex')}`;
  if (APPLY) {
    wb.set(C(db, 'be_admin_audit').doc(auditId), {
      op: 'v146-followup-neuramis-merge-and-junk-course',
      neuramis: { keep: KEEP, dup: DUP, ...mergeCounts },
      junkCourseDeleted: junkDeleted, junkCourseId: JUNK_COURSE_ID,
      totalWrites: writes.length, appliedAt: FieldValue.serverTimestamp(),
    });
    await wb.commit();
    console.log(`\n✓ APPLIED — ${writes.length} writes. audit: ${auditId}`);
  } else {
    console.log(`\nDRY-RUN: --apply would do ${writes.length} writes:`);
    console.log(`  merge: ${mergeCounts.courses} course, ${mergeCounts.batches} batch, ${mergeCounts.movements} movement, ${mergeCounts.ops} op, ${mergeCounts.groups} group, delete ${mergeCounts.productDeleted} product`);
    console.log(`  junk course delete: ${junkDeleted}`);
  }
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
