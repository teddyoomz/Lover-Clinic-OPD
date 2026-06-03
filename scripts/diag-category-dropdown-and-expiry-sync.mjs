#!/usr/bin/env node
// Rule R diagnostic (READ-ONLY) — adversarial audit of two V159/category stock features:
//   C1  Category dropdown (ProductFormModal): harvest reads ONLY prod.categoryName.
//       Do real be_products use legacy `category` / `category_name` instead? If so the
//       dropdown silently MISSES those categories (V49-class canonical-shape mismatch).
//   C2  Expiry → order-line sync (updateStockBatchExpiry Q4=B): matches
//       order.items[].orderProductId === batch.orderProductId. Branch items carry
//       orderProductId (= `${orderId}-${idx}`); central items key on centralOrderProductId.
//       Does the sync actually match for branch (expect YES) and central (expect NO = no-op)?
// No writes.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (process.env[k] !== undefined) continue;
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
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* env missing');
  const app = initializeApp({ credential: cert({ projectId: APP_ID, clientEmail, privateKey: rawKey.split('\\n').join('\n') }) });
  return getFirestore(app);
}
const dataCol = (db, name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
const dataDoc = (db, name, id) => dataCol(db, name).doc(id);
const trim = (v) => (typeof v === 'string' ? v.trim() : '');

async function main() {
  const db = getAdmin();

  // ════════════════════ C1 — category field universe on be_products ════════════════════
  console.log('═══ C1 — be_products category field audit (dropdown reads ONLY categoryName) ═══\n');
  const prods = await dataCol(db, 'be_products').get();
  console.log(`be_products total: ${prods.size}`);

  let hasCategoryName = 0, hasCategorySnake = 0, hasCategoryBare = 0;
  let onlyLegacy = 0;          // categoryName empty BUT category/category_name present → dropdown MISSES
  const sampleOnlyLegacy = [];
  const catFromCategoryName = new Set();  // what the dropdown WOULD show (per harvest)
  const catFromAnyField = new Set();      // what categories actually EXIST (union)
  const perBranch = new Map(); // branchId -> {dropdownCats:Set, allCats:Set, onlyLegacy:n}

  for (const d of prods.docs) {
    const x = d.data();
    const cn = trim(x.categoryName);
    const cs = trim(x.category_name);
    const cb = trim(x.category);
    if (cn) hasCategoryName++;
    if (cs) hasCategorySnake++;
    if (cb) hasCategoryBare++;
    if (cn) { catFromCategoryName.add(cn); }
    for (const v of [cn, cs, cb]) if (v) catFromAnyField.add(v);
    const br = String(x.branchId || x.locationId || '(none)');
    if (!perBranch.has(br)) perBranch.set(br, { dropdownCats: new Set(), allCats: new Set(), onlyLegacy: 0 });
    const pb = perBranch.get(br);
    if (cn) pb.dropdownCats.add(cn);
    for (const v of [cn, cs, cb]) if (v) pb.allCats.add(v);
    if (!cn && (cs || cb)) {
      onlyLegacy++; pb.onlyLegacy++;
      if (sampleOnlyLegacy.length < 12) sampleOnlyLegacy.push({ id: d.id, name: trim(x.productName), branchId: br, category: cb, category_name: cs });
    }
  }

  console.log(`  docs with categoryName (camel, what harvest reads): ${hasCategoryName}`);
  console.log(`  docs with category_name (snake legacy):             ${hasCategorySnake}`);
  console.log(`  docs with category (bare legacy):                   ${hasCategoryBare}`);
  console.log(`  ⚠ docs with categoryName EMPTY but legacy present (dropdown MISSES these products' category): ${onlyLegacy}`);
  console.log(`  distinct categories the dropdown WOULD show (categoryName): ${catFromCategoryName.size}`);
  console.log(`  distinct categories that actually EXIST (any field):        ${catFromAnyField.size}`);
  const missedCats = [...catFromAnyField].filter(c => !catFromCategoryName.has(c));
  console.log(`  ⚠ categories present in data but NEVER in the dropdown:     ${missedCats.length}`);
  if (missedCats.length) console.log('     e.g. ' + missedCats.slice(0, 20).map(c => JSON.stringify(c)).join(', '));
  if (sampleOnlyLegacy.length) {
    console.log('\n  sample products whose category the dropdown would MISS:');
    for (const s of sampleOnlyLegacy) console.log(`     ${s.id} "${s.name}" [branch ${s.branchId}] category=${JSON.stringify(s.category)} category_name=${JSON.stringify(s.category_name)}`);
  }
  console.log('\n  per-branch dropdown coverage (dropdownCats / allCats · onlyLegacy docs):');
  for (const [br, pb] of perBranch) {
    const gap = pb.allCats.size - pb.dropdownCats.size;
    console.log(`     ${br}: dropdown ${pb.dropdownCats.size} / exist ${pb.allCats.size}${gap ? `  ⚠ GAP ${gap}` : ''}  · onlyLegacy ${pb.onlyLegacy}`);
  }

  // ════════════════════ C2 — expiry → order-line sync match audit ════════════════════
  console.log('\n\n═══ C2 — updateStockBatchExpiry order-line sync match audit ═══\n');
  const batches = await dataCol(db, 'be_stock_batches').get();
  const withOrder = batches.docs.filter(d => trim(d.data().sourceOrderId));
  console.log(`be_stock_batches total: ${batches.size} · with sourceOrderId: ${withOrder.length}`);

  const orderCache = new Map(); // `${tier}:${id}` -> order data | null
  async function loadOrder(tier, id) {
    const key = `${tier}:${id}`;
    if (orderCache.has(key)) return orderCache.get(key);
    const col = tier === 'central' ? 'be_central_stock_orders' : 'be_stock_orders';
    let data = null;
    try { const s = await dataDoc(db, col, id).get(); data = s.exists ? s.data() : null; } catch { data = null; }
    orderCache.set(key, data);
    return data;
  }

  const tally = {
    branch: { n: 0, matchOrderProductId: 0, matchCentral: 0, orderMissing: 0, noBatchOPI: 0 },
    central: { n: 0, matchOrderProductId: 0, matchCentral: 0, orderMissing: 0, noBatchOPI: 0 },
  };
  const sampleCentralFail = [];
  let scanned = 0;
  for (const d of withOrder) {
    if (scanned >= 400) break; // cap
    const b = d.data();
    const tier = b.locationType === 'central' ? 'central' : 'branch';
    const t = tally[tier]; t.n++;
    const bOPI = trim(b.orderProductId);
    if (!bOPI) { t.noBatchOPI++; continue; }
    const order = await loadOrder(tier, trim(b.sourceOrderId));
    scanned++;
    if (!order) { t.orderMissing++; continue; }
    const items = Array.isArray(order.items) ? order.items : [];
    const matchOPI = items.some(it => it && it.orderProductId === bOPI);   // what the sync checks
    const matchCentral = items.some(it => it && it.centralOrderProductId === bOPI); // the real central key
    if (matchOPI) t.matchOrderProductId++;
    if (matchCentral) t.matchCentral++;
    if (tier === 'central' && !matchOPI && sampleCentralFail.length < 6) {
      sampleCentralFail.push({ batchId: d.id, orderId: trim(b.sourceOrderId), bOPI, itemKeys: items.slice(0, 3).map(it => ({ opi: it?.orderProductId, copi: it?.centralOrderProductId })) });
    }
  }
  for (const tier of ['branch', 'central']) {
    const t = tally[tier];
    console.log(`\n  ${tier.toUpperCase()} batches scanned: ${t.n}`);
    console.log(`    sync WOULD match (it.orderProductId === batch.orderProductId): ${t.matchOrderProductId}/${t.n}`);
    console.log(`    real key match (it.centralOrderProductId === batch.orderProductId): ${t.matchCentral}/${t.n}`);
    console.log(`    order doc missing: ${t.orderMissing} · batch has no orderProductId: ${t.noBatchOPI}`);
    if (tier === 'central' && t.n > 0 && t.matchOrderProductId === 0) {
      console.log('    🚨 CENTRAL SYNC IS A NO-OP — 0/' + t.n + ' central batches would sync their order line.');
    }
  }
  if (sampleCentralFail.length) {
    console.log('\n  sample central batches whose sync would NOT match (no-op):');
    for (const s of sampleCentralFail) console.log(`     batch ${s.batchId} order ${s.orderId} batch.orderProductId=${JSON.stringify(s.bOPI)} order item keys=${JSON.stringify(s.itemKeys)}`);
  }

  console.log('\n✓ Diag complete (read-only)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
