#!/usr/bin/env node
// Rule R diagnostic (READ-ONLY) — answer "cascade ขึ้นครบจริงไหม": map EVERY
// collection that can reference a productId, so the delete-cascade scope is
// proven COMPLETE (no orphan surface missed). Scans the 5 known orphans + a
// sample of in-use products (incl. ones with central stock + group membership).
// No writes.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

// every collection that might carry a productId, + how it references it
const STOCK_OP_COLS = ['be_stock_orders', 'be_stock_transfers', 'be_stock_withdrawals', 'be_stock_adjustments', 'be_central_stock_orders'];

// deep-scan: does this doc reference pid ANYWHERE (top-level productId, or in
// any array-of-objects with productId, or in productIds[])?
function docRefsProduct(data, pid) {
  if (!data || typeof data !== 'object') return false;
  if (String(data.productId || '') === pid) return true;
  if (Array.isArray(data.productIds) && data.productIds.map(String).includes(pid)) return true;
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) {
      for (const el of v) {
        if (el && typeof el === 'object' && (String(el.productId || '') === pid || String(el.sourceProductId || '') === pid)) return true;
      }
    }
  }
  return false;
}

async function main() {
  console.log('▶ Rule R diag — COMPLETE product-reference map (cascade completeness)\n');
  const db = getAdmin();

  // central warehouse ids (to label batches branch-vs-central)
  const whSnap = await C(db, 'be_central_stock_warehouses').get();
  const centralIds = new Set(whSnap.docs.map(d => d.id).concat(whSnap.docs.map(d => String(d.data().warehouseId || ''))));

  const [prodSnap, batchSnap, courseSnap, pgSnap, movSnap] = await Promise.all([
    C(db, 'be_products').get(), C(db, 'be_stock_batches').get(), C(db, 'be_courses').get(),
    C(db, 'be_product_groups').get(), C(db, 'be_stock_movements').get(),
  ]);
  const opSnaps = {};
  for (const col of STOCK_OP_COLS) opSnaps[col] = await C(db, col).get();

  // sample target productIds: 5 orphans + up to 6 in-use products that have
  // central stock and/or group membership (so we exercise every surface).
  const orphans = ['1080', '1064', '1066', 'PRODUCTS_1778150429849_3D3B4D36', 'PRODUCTS_1778150429849_0268FE93'];
  const withCentralBatch = new Set();
  for (const d of batchSnap.docs) { if (centralIds.has(String(d.data().locationId || ''))) withCentralBatch.add(String(d.data().productId || '')); }
  const inGroup = new Set();
  for (const d of pgSnap.docs) {
    const g = d.data();
    (Array.isArray(g.productIds) ? g.productIds : []).forEach(p => inGroup.add(String(p)));
    (Array.isArray(g.products) ? g.products : []).forEach(p => p?.productId && inGroup.add(String(p.productId)));
  }
  const sample = [...new Set([...orphans, ...[...withCentralBatch].slice(0, 4), ...[...inGroup].slice(0, 4)])];

  console.log(`be_central_stock_warehouses: ${whSnap.size} (central locationIds: ${[...centralIds].filter(Boolean).join(', ') || 'none'})`);
  console.log(`be_product_groups: ${pgSnap.size} · distinct productIds in groups: ${inGroup.size}`);
  console.log(`products with a CENTRAL-warehouse batch: ${withCentralBatch.size}`);
  console.log(`be_stock_movements: ${movSnap.size}\n`);

  console.log(`── per-productId reference map (sample of ${sample.length}) ──`);
  for (const pid of sample) {
    const branchBatches = batchSnap.docs.filter(d => String(d.data().productId) === pid && !centralIds.has(String(d.data().locationId || ''))).length;
    const centralBatches = batchSnap.docs.filter(d => String(d.data().productId) === pid && centralIds.has(String(d.data().locationId || ''))).length;
    const courseMain = courseSnap.docs.filter(d => String(d.data().mainProductId) === pid).length;
    const courseSub = courseSnap.docs.filter(d => { const cd = d.data(); const list = Array.isArray(cd.courseProducts) ? cd.courseProducts : (Array.isArray(cd.products) ? cd.products : []); return list.some(p => String(p?.productId) === pid); }).length;
    const groups = pgSnap.docs.filter(d => docRefsProduct(d.data(), pid)).length;
    const movements = movSnap.docs.filter(d => String(d.data().productId) === pid).length;
    const opHits = {};
    for (const col of STOCK_OP_COLS) opHits[col] = opSnaps[col].docs.filter(d => docRefsProduct(d.data(), pid)).length;
    const opStr = STOCK_OP_COLS.map(c => `${c.replace('be_stock_', '').replace('be_central_stock_', 'c.')}=${opHits[c]}`).join(' ');
    const exists = prodSnap.docs.some(d => d.id === pid || String(d.data().productId) === pid);
    console.log(`  ${pid}${exists ? '' : ' (ORPHAN)'}:`);
    console.log(`    stock: branchBatch=${branchBatches} centralBatch=${centralBatches} | course: main=${courseMain} sub=${courseSub} | group=${groups} | movements=${movements}`);
    console.log(`    stock-ops: ${opStr}`);
  }

  console.log('\n── CASCADE SCOPE VERDICT ──');
  console.log('  COVERED by cascade: be_stock_batches (branch+central, productId query is location-agnostic) + be_courses.courseProducts[] (pull) + mainProductId (BLOCK).');
  console.log('  GAP candidates (cascade does NOT touch): be_product_groups.productIds[]/products[] membership.');
  console.log('  INTENTIONALLY KEPT (history/audit, denormalized names per Rule O): be_stock_movements + be_stock_orders/transfers/withdrawals/adjustments/central_orders + be_treatments/be_sales.');
  console.log('\n✓ Diag complete (read-only)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
