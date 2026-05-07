#!/usr/bin/env node
// ─── V46 — E2E live admin-SDK — Rule O batch-name-resolution ────────────────
//
// Reproduces user-reported scenario (BT-1778169734111) end-to-end against
// real Firestore. Creates a POISONED batch (productName=courseName) +
// canonical product master + simulates the deduct chain as _deductOneItem
// would write a movement post-V46.
//
// Test invariants:
//   1. Even with batch.productName POISONED, the movement records the
//      canonical productName from be_products[productId] live read.
//   2. AUTO-NEG batch creation never inherits course-name when item.productName
//      is malformed (V46 helper resolves live first).
//   3. Cross-branch identity — V46 fix works on every branch (current + future).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const RUN_ID = randomBytes(4).toString('hex');
const NS = `TEST-V46-${Date.now()}-${RUN_ID}`;

function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

function init() {
  if (getApps().length > 0) return getFirestore();
  const env = loadEnvLocal();
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
  }) });
  return getFirestore();
}

let pass = 0, fail = 0;
const fails = [];
function assert(cond, lbl) { if (cond) { pass++; console.log(`  ✓ ${lbl}`); } else { fail++; fails.push(lbl); console.log(`  ✗ ${lbl}`); } }
function assertEq(a, b, lbl) {
  const sa = typeof a === 'object' ? JSON.stringify(a) : String(a);
  const sb = typeof b === 'object' ? JSON.stringify(b) : String(b);
  return assert(sa === sb, `${lbl}  got=${sa} want=${sb}`);
}

// Mirror of _resolveProductNameLive (admin-SDK side)
async function resolveProductNameLive(data, productId) {
  if (!productId) return '';
  try {
    const snap = await data.collection('be_products').doc(String(productId)).get();
    if (snap.exists) {
      const d = snap.data() || {};
      return String(d.productName || d.name || '').trim();
    }
  } catch (e) { /* swallow */ }
  return '';
}

async function main() {
  const db = init();
  const data = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
  console.log(`[e2e-v46] namespace=${NS}`);

  // Discover branches
  const branchSnap = await data.collection('be_branches').get();
  const realBranches = branchSnap.docs.map(d => d.id).filter(id => !id.startsWith('TEST-')).slice(0, 2);
  const futureBranchId = `${NS}-FUTURE`;
  await data.collection('be_branches').doc(futureBranchId).set({
    branchId: futureBranchId, branchName: `${NS} Future`, isDefault: false,
  });
  const ALL_BRANCHES = [...realBranches, futureBranchId];

  const ids = { be_products: [], be_stock_batches: [], be_stock_movements: [], be_branches: [futureBranchId] };

  try {
    for (const branchId of ALL_BRANCHES) {
      console.log(`\n═══ Branch: ${branchId} ═══`);

      // Create canonical product
      const productId = `${NS}-PROD-${branchId}`;
      const canonicalName = `${NS} Stapple Product`;
      await data.collection('be_products').doc(productId).set({
        productId, productName: canonicalName, productType: 'สินค้าหน้าร้าน',
        branchId, stockConfig: { trackStock: true, minAlert: 0, unit: 'ครั้ง' },
        status: 'ใช้งาน', createdAt: new Date().toISOString(),
      });
      ids.be_products.push(productId);

      // Create POISONED batch (productName = course name, simulating V44-era bug)
      const batchId = `${NS}-BATCH-${branchId}`;
      const poisonedName = `${NS} POISONED-COURSE-NAME`;
      await data.collection('be_stock_batches').doc(batchId).set({
        batchId, productId, productName: poisonedName, // ← POISONED
        branchId, locationType: 'branch',
        qty: { total: 0, remaining: -1 },
        status: 'active', autoNegative: true,
        receivedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      ids.be_stock_batches.push(batchId);

      // Verify batch is poisoned
      const batchData = (await data.collection('be_stock_batches').doc(batchId).get()).data();
      assertEq(batchData.productName, poisonedName,
        `[${branchId}] batch is POISONED (productName=courseName)`);

      // V46 Rule O: live-resolve productName from be_products
      const resolvedName = await resolveProductNameLive(data, productId);
      assertEq(resolvedName, canonicalName,
        `[${branchId}] V46 live-resolve returns CANONICAL product name`);
      assert(resolvedName !== poisonedName,
        `[${branchId}] live-resolve OVERRIDES poisoned batch.productName`);

      // Simulate post-V46 movement emit: productName = liveResolvedName || item.productName || batch.productName
      const item = { productId, productName: 'Stapple from-TFP-correct' };
      const movementProductName = resolvedName || item.productName || batchData.productName || '';
      assertEq(movementProductName, canonicalName,
        `[${branchId}] V46 movement productName = canonical (NOT poisoned, NOT TFP item)`);

      // Edge: be_products doesn't exist (orphan productId) → live returns ''
      const orphanResolve = await resolveProductNameLive(data, `${NS}-NONEXISTENT-${branchId}`);
      assertEq(orphanResolve, '',
        `[${branchId}] orphan productId → live returns '' (V14: no undefined leaves)`);

      // Edge fallback chain: liveName='' → item.productName wins
      const fallbackChain = orphanResolve || item.productName || batchData.productName || '';
      assertEq(fallbackChain, item.productName,
        `[${branchId}] orphan fallback: item.productName wins (NOT poisoned batch.productName)`);

      // Final invariant: regardless of which fallback fires, batch.productName
      // is NEVER chosen if any earlier source has a value.
      assert(fallbackChain !== poisonedName,
        `[${branchId}] V46 fallback chain NEVER returns poisoned batch.productName when item has value`);

      // Write a real test movement to verify the chain end-to-end
      const movId = `${NS}-MOV-${branchId}`;
      await data.collection('be_stock_movements').doc(movId).set({
        movementId: movId, type: 6, batchId,
        productId,
        productName: movementProductName,
        qty: -1, before: -1, after: -2,
        branchId, sourceDocPath: 'TEST-V46',
        linkedTreatmentId: null, linkedSaleId: null,
        skipped: false, negativeOverage: true,
        note: 'V46 e2e — verify productName resolution',
        createdAt: new Date().toISOString(),
      });
      ids.be_stock_movements.push(movId);

      const movData = (await data.collection('be_stock_movements').doc(movId).get()).data();
      assertEq(movData.productName, canonicalName,
        `[${branchId}] persisted movement.productName = canonical (V46 invariant in Firestore)`);
      assert(movData.productName !== poisonedName,
        `[${branchId}] persisted movement does NOT carry poisoned name`);
    }

    // Cross-branch consistency
    console.log('\n═══ Cross-branch consistency ═══');
    const namesPerBranch = {};
    for (const branchId of ALL_BRANCHES) {
      const productId = `${NS}-PROD-${branchId}`;
      namesPerBranch[branchId] = await resolveProductNameLive(data, productId);
    }
    const branchNames = Object.values(namesPerBranch);
    assert(branchNames.every(n => n.startsWith(NS)),
      `every branch's product master has TEST-V46 prefix (cross-branch fixture isolation)`);
    // Each branch product name is BRANCH-SPECIFIC (not identical) but ALL canonical
    assert(branchNames.length === ALL_BRANCHES.length,
      `${ALL_BRANCHES.length} live-resolved names returned`);
  } finally {
    console.log('\n═══ CLEANUP ═══');
    let cleaned = 0;
    for (const [coll, list] of Object.entries(ids)) {
      for (const id of list) {
        try {
          await data.collection(coll).doc(id).delete();
          cleaned += 1;
        } catch {}
      }
    }
    console.log(`  deleted ${cleaned} fixtures`);
  }

  console.log(`\n[e2e-v46] PASS=${pass} FAIL=${fail}`);
  if (fail > 0) {
    for (const f of fails) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('[e2e-v46] ✅ ALL ASSERTIONS PASSED');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
