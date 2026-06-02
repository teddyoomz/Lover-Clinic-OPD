#!/usr/bin/env node
// Rule R diag (READ-ONLY) — why does the นครราชสีมา stock balance show "-" for
// หมวดหมู่/ประเภท on every row? Checks whether the branch's stock BATCHES'
// productIds match the branch-scoped be_products docs (and whether those docs
// carry productType/categoryName). Mirrors StockBalancePanel's data sources:
//   batches  = be_stock_batches where branchId == <branch> (status active/depleted)
//   products = be_products      where branchId == <branch>  (listenToProducts map)

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

async function main() {
  const db = getAdmin();
  // 1) resolve นครราชสีมา branchId
  const branchesSnap = await C(db, 'be_branches').get();
  const nakhon = branchesSnap.docs.find(d => /นครราชสีมา/.test(String(d.data().name || '')));
  if (!nakhon) { console.log('นครราชสีมา branch not found'); process.exit(1); }
  const branchId = nakhon.id;
  console.log(`นครราชสีมา branchId = ${branchId}\n`);

  // 2) products scoped to the branch (= listenToProducts map source)
  const prodSnap = await C(db, 'be_products').where('branchId', '==', branchId).get();
  const prodById = new Map();
  let withType = 0, withCat = 0;
  for (const d of prodSnap.docs) {
    const data = d.data();
    prodById.set(d.id, data);                 // map keyed by DOC ID (matches StockBalancePanel)
    if (String(data.productType || '').trim()) withType++;
    if (String(data.categoryName || '').trim()) withCat++;
  }
  console.log(`be_products (branch-scoped): ${prodSnap.size} docs | withProductType=${withType} | withCategory=${withCat}`);

  // 3) active/depleted batches scoped to the branch (= balance table source)
  const batchSnap = await C(db, 'be_stock_batches').where('branchId', '==', branchId).get();
  const batches = batchSnap.docs.map(d => d.data()).filter(b => b.status === 'active' || b.status === 'depleted');
  const batchPids = [...new Set(batches.map(b => String(b.productId)).filter(Boolean))];
  console.log(`be_stock_batches (branch, active/depleted): ${batches.length} | unique productIds = ${batchPids.length}\n`);

  // 4) match rate: how many batch productIds resolve in the branch-scoped products?
  let matched = 0, matchedWithType = 0, matchedWithCat = 0; const misses = [];
  for (const pid of batchPids) {
    const p = prodById.get(pid);
    if (p) {
      matched++;
      if (String(p.productType || '').trim()) matchedWithType++;
      if (String(p.categoryName || '').trim()) matchedWithCat++;
    } else if (misses.length < 12) {
      misses.push(pid);
    }
  }
  console.log(`MATCH (batch.productId ∈ branch-scoped products): ${matched}/${batchPids.length}`);
  console.log(`  of matched: withProductType=${matchedWithType} | withCategory=${matchedWithCat}`);
  console.log(`  sample UNMATCHED batch productIds: ${misses.join(', ') || '(none)'}`);

  // 5) for a few unmatched, where does the product ACTUALLY live? (global by-id)
  if (misses.length) {
    console.log('\n── tracing unmatched productIds globally (by doc id) ──');
    for (const pid of misses.slice(0, 6)) {
      const g = await C(db, 'be_products').doc(pid).get();
      if (g.exists) {
        const d = g.data();
        console.log(`  ${pid}: EXISTS globally — branchId=${d.branchId} type=${d.productType} cat=${d.categoryName} name="${d.productName}"`);
      } else {
        console.log(`  ${pid}: NO be_products doc with this id (FK orphan)`);
      }
    }
  }
  console.log('\n✓ diag complete (read-only)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
