#!/usr/bin/env node
// Rule R diagnostic (READ-ONLY) — supports the "B" be_products cleanup + the
// orphan-stock debug + the category-dropdown feature. NO writes.
//   (1) clean-vs-corrupt field comparison (confirm exactly what to restore)
//   (2) be_product_groups per branch (dropdown source + restore-target check)
//   (3) FK references (be_stock_batches.productId / be_courses mainProductId +
//       products[].productId) for the 3 dup groups + Neuramis pair + 7 NONE docs
//       — which docId is "in use" → informs dedup-delete + the cascade debug.

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

const FK_DOC_IDS = [
  // dup groups
  '38745', '38912',                                                   // พระราม3 ไม้พันสำลี
  '38764', 'PRODUCTS_1778150429849_9B1DEFF7',                         // นครราชสีมา neuramis deep
  'PRODUCTS_1778150429849_2C82741F', 'PRODUCTS_1778150429849_A232D1FE', // นครราชสีมา ไม้พันสำลี
  // 7 NONE (no clean copy)
  'PROD-mpp4dmws-d1b937d0da074884', 'PROD-mpw64wje-6e3e107618482ef3',
  'PROD-mpw68hd7-eec4a9713cf51f8f', 'PRODUCTS_1778150429849_06E6F90E',
  'PRODUCTS_1778150429849_41DC9B11', 'PRODUCTS_1778150429849_5FA24C67',
  'PRODUCTS_1778150429849_63949276',
];
const RESTORE_FIELDS = ['productType', 'categoryName', 'subCategoryName', 'mainUnitName', 'defaultProductUnitGroupId'];

async function main() {
  console.log('▶ Rule R diag — B restore fields + FK references (READ-ONLY)\n');
  const db = getAdmin();
  const prodSnap = await C(db, 'be_products').get();
  const byId = new Map(prodSnap.docs.map(d => [d.id, d.data()]));

  // ── (1) clean-vs-corrupt field comparison (2 pairs) ──
  console.log('── (1) CLEAN vs CORRUPT field comparison ──');
  const pairs = [
    ['PRODUCTS_1778150429849_0056417C', '38813', 'Diazepam 2 mg'],
    ['PRODUCTS_1778150429849_0940BA77', '39012', 'IV Drip Fat Burn'],
  ];
  for (const [corruptId, cleanId, label] of pairs) {
    const c = byId.get(corruptId) || {}, s = byId.get(cleanId) || {};
    console.log(`\n  "${label}"`);
    console.log(`    corrupt ${corruptId}: ${RESTORE_FIELDS.map(f => `${f}=${JSON.stringify(c[f])}`).join(' ')}`);
    console.log(`    clean   ${cleanId}: ${RESTORE_FIELDS.map(f => `${f}=${JSON.stringify(s[f])}`).join(' ')}`);
    const corruptExtra = Object.keys(c).filter(k => !k.startsWith('_')).sort();
    console.log(`    corrupt full keys: ${corruptExtra.join(', ')}`);
  }

  // ── (2) be_product_groups per branch (dropdown source) ──
  console.log('\n\n── (2) be_product_groups (category dropdown source) ──');
  const pgSnap = await C(db, 'be_product_groups').get();
  const groupsByBranch = new Map();
  for (const d of pgSnap.docs) {
    const g = d.data();
    const b = g.branchId || '?';
    if (!groupsByBranch.has(b)) groupsByBranch.set(b, []);
    groupsByBranch.get(b).push(g.groupName || g.name || g.productGroupName || '(?)');
  }
  console.log(`  be_product_groups total: ${pgSnap.size}`);
  for (const [b, names] of groupsByBranch) {
    console.log(`  branch ${b}: ${names.length} groups → ${names.sort().join(', ')}`);
  }
  // also dump the raw field shape of one group doc (so dropdown knows the name field)
  if (pgSnap.docs[0]) console.log(`  sample group doc keys: ${Object.keys(pgSnap.docs[0].data()).join(', ')}`);

  // distinct categoryName strings currently used on be_products, per branch
  console.log('\n  distinct categoryName on be_products, per branch:');
  const catByBranch = new Map();
  for (const d of prodSnap.docs) {
    const data = d.data(); const b = data.branchId || '?';
    const cn = String(data.categoryName || '').trim();
    if (!cn) continue;
    if (!catByBranch.has(b)) catByBranch.set(b, new Set());
    catByBranch.get(b).add(cn);
  }
  for (const [b, set] of catByBranch) console.log(`    ${b}: ${[...set].sort().join(', ')}`);

  // ── (3) FK references ──
  console.log('\n\n── (3) FK references for dup + NONE docIds ──');
  const stockSnap = await C(db, 'be_stock_batches').get();
  const courseSnap = await C(db, 'be_courses').get();
  const fk = {};
  for (const id of FK_DOC_IDS) fk[id] = { name: (byId.get(id) || {}).productName || (byId.get(id) || {}).name || '(missing!)', branchId: (byId.get(id) || {}).branchId, stockBatches: 0, courseMain: 0, courseProducts: 0 };

  for (const d of stockSnap.docs) {
    const pid = String(d.data().productId || '');
    if (fk[pid]) fk[pid].stockBatches++;
  }
  for (const d of courseSnap.docs) {
    const cd = d.data();
    const mp = String(cd.mainProductId || '');
    if (fk[mp]) fk[mp].courseMain++;
    const prods = Array.isArray(cd.courseProducts) ? cd.courseProducts : (Array.isArray(cd.products) ? cd.products : []);
    for (const p of prods) {
      const pid = String(p.productId || '');
      if (fk[pid]) fk[pid].courseProducts++;
    }
  }
  console.log(`  (scanned ${stockSnap.size} stock batches, ${courseSnap.size} courses)\n`);
  for (const id of FK_DOC_IDS) {
    const r = fk[id];
    const inUse = r.stockBatches + r.courseMain + r.courseProducts;
    console.log(`  ${id} "${r.name}" branch=${r.branchId}  → batches=${r.stockBatches} courseMain=${r.courseMain} courseProd=${r.courseProducts}  ${inUse ? '🔗 IN USE' : '∅ no refs'}`);
  }

  console.log('\n✓ Diag complete (read-only)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
