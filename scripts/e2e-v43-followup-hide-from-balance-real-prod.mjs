#!/usr/bin/env node
// scripts/e2e-v43-followup-hide-from-balance-real-prod.mjs
// V43-followup (2026-05-19) — Tier 5 admin-SDK e2e on real prod Firestore.
// 3 tiers × 4 product types × toggle + reversibility scenarios. TEST-V43F prefix.
// Rule M compliant: dry-run by default; --apply commits writes.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { filterOutSkippedProducts } from '../src/lib/skipStockFilter.js';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
const RUN_ID = randomBytes(4).toString('hex');
const NS = `TEST-V43F-${Date.now()}-${RUN_ID}`;

function loadEnv() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}
function initFs() {
  if (getApps().length) return getFirestore();
  const env = loadEnv();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = env.FIREBASE_ADMIN_PRIVATE_KEY;
  const privateKey = rawKey.split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore();
}
function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label}`); }
}

const PRODUCT_TYPES = ['ยา', 'สินค้าหน้าร้าน', 'สินค้าสิ้นเปลือง', 'บริการ'];

async function main() {
  const db = initFs();
  const data = dataPath(db);
  console.log(`[e2e] V43-followup hide-from-balance — NS=${NS}`);
  console.log(`[e2e] APPLY=${APPLY}\n`);

  // Phase 1: discover real branches
  const branchSnap = await data.collection('be_branches').get();
  const realBranches = branchSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(b => !b.id.startsWith('TEST-'));
  const tier1 = realBranches[0]?.id;
  const tier2 = realBranches[1]?.id || tier1;
  const futureBranchId = `${NS}-BR-FUTURE`;
  console.log(`[e2e] Phase 1 — tiers: A=${tier1} B=${tier2} future=${futureBranchId}`);

  const ids = { products: [], branches: [] };

  if (APPLY) {
    await data.collection('be_branches').doc(futureBranchId).set({
      branchId: futureBranchId, branchName: `${NS} Future`, isDefault: false,
      createdAt: new Date().toISOString(),
    });
    ids.branches.push(futureBranchId);
  }

  try {
    // Phase 2: create 12 test products (4 types × 3 tiers)
    console.log('\n[e2e] Phase 2 — Create 12 TEST products across 3 tiers × 4 types');
    const fixtures = [];
    for (const type of PRODUCT_TYPES) {
      for (const [tierIdx, tier] of [tier1, tier2, futureBranchId].entries()) {
        const id = `${NS}-${type}-${tierIdx}-PROD`;
        const doc = {
          productId: id,
          productName: `${NS} ${type} tier${tierIdx}`,
          productCode: `V43F-${id.slice(-12)}`,
          productType: type === 'สินค้าหน้าร้าน' ? 'สินค้าหน้าร้าน' : type === 'สินค้าสิ้นเปลือง' ? 'สินค้าสิ้นเปลือง' : type === 'บริการ' ? 'บริการ' : 'ยา',
          branchId: tier,
          categoryName: '',
          mainUnitName: 'ครั้ง',
          price: 100,
          skipStockDeduction: false,
          stockConfig: { trackStock: true, minAlert: 0, unit: 'ครั้ง', isControlled: false },
          status: 'ใช้งาน',
          createdAt: new Date().toISOString(),
        };
        if (APPLY) await data.collection('be_products').doc(id).set(doc);
        ids.products.push(id);
        fixtures.push({ id, type, tier });
      }
    }
    console.log(`  ${APPLY ? 'created' : 'would-create'} ${fixtures.length} products`);

    // Phase 3: assert all 12 visible BEFORE toggling
    console.log('\n[e2e] Phase 3 — All 12 products initially VISIBLE (flag=false)');
    if (APPLY) {
      const allProductsSnap = await data.collection('be_products').get();
      const all = allProductsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const testProducts = all.filter(p => p.productId && p.productId.startsWith(NS));
      const visible = filterOutSkippedProducts(testProducts);
      assert(visible.length === 12, `12 test products visible (got ${visible.length})`);
    } else {
      console.log('  (dry-run skipped)');
    }

    // Phase 4: toggle ON for first 4 (one per type)
    console.log('\n[e2e] Phase 4 — Toggle 4 (one per type, tier=A) ON');
    const toggledIds = [];
    for (const f of fixtures.filter(f => f.tier === tier1)) {
      if (APPLY) {
        await data.collection('be_products').doc(f.id).update({ skipStockDeduction: true });
      }
      toggledIds.push(f.id);
    }
    console.log(`  toggled ${toggledIds.length} products`);

    // Phase 5: assert filter now hides 4
    console.log('\n[e2e] Phase 5 — Filter hides toggled products');
    if (APPLY) {
      const allProductsSnap = await data.collection('be_products').get();
      const all = allProductsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const testProducts = all.filter(p => p.productId && p.productId.startsWith(NS));
      const visible = filterOutSkippedProducts(testProducts);
      assert(visible.length === 8, `8 visible after toggling 4 (got ${visible.length})`);
      for (const id of toggledIds) {
        assert(!visible.find(p => p.productId === id), `${id} HIDDEN by filter`);
      }
    } else {
      console.log('  (dry-run skipped)');
    }

    // Phase 6: untoggle (reversibility)
    console.log('\n[e2e] Phase 6 — Untoggle 4 products (reversibility)');
    if (APPLY) {
      for (const id of toggledIds) {
        await data.collection('be_products').doc(id).update({ skipStockDeduction: false });
      }
      const allProductsSnap = await data.collection('be_products').get();
      const all = allProductsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const testProducts = all.filter(p => p.productId && p.productId.startsWith(NS));
      const visible = filterOutSkippedProducts(testProducts);
      assert(visible.length === 12, `12 visible after untoggle (got ${visible.length})`);
    } else {
      console.log('  (dry-run skipped)');
    }

    // Phase 7: audit emit
    if (APPLY) {
      console.log('\n[e2e] Phase 7 — Audit doc emit');
      const auditId = `e2e-v43f-hide-from-balance-${Date.now()}-${RUN_ID}`;
      await data.collection('be_admin_audit').doc(auditId).set({
        op: 'e2e-v43-followup-hide-from-balance',
        ns: NS,
        productsCreated: fixtures.length,
        toggledCount: toggledIds.length,
        pass, fail,
        appliedAt: new Date().toISOString(),
      });
      console.log(`  audit doc: ${auditId}`);
    }
  } finally {
    // Cleanup ALWAYS — even on assertion failure
    console.log('\n[e2e] Cleanup — deleting TEST fixtures');
    if (APPLY) {
      for (const id of ids.products) {
        await data.collection('be_products').doc(id).delete();
        console.log(`  deleted be_products/${id}`);
      }
      for (const id of ids.branches) {
        await data.collection('be_branches').doc(id).delete();
        console.log(`  deleted be_branches/${id}`);
      }
    }
  }

  console.log(`\n[e2e] === TALLY ===`);
  console.log(`  PASS: ${pass}`);
  console.log(`  FAIL: ${fail}`);
  if (fail > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('[e2e] ERROR:', e); process.exit(1); });
}
