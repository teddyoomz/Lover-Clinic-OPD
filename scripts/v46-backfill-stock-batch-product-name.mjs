#!/usr/bin/env node
// ─── V46 — Backfill — be_stock_batches.productName from be_products live ────
//
// Rule M two-phase migration. Restamps `productName` field on every
// be_stock_batches doc by looking up be_products[batch.productId].productName.
// Closes the V46 batch-poisoning gap: batches created during older bug
// rounds may carry a stale/wrong productName (e.g. course name leaked from
// V44-era buggy buy). Live-read at deduct time (Rule O) sidesteps this for
// FUTURE movements; this migration cleans existing poisoned batches so
// admin UI displays canonical names too.
//
// Idempotent: re-run with --apply yields 0 writes when all batches match
// their product's current productName.
//
// Usage:
//   node scripts/v46-backfill-stock-batch-product-name.mjs           # DRY
//   node scripts/v46-backfill-stock-batch-product-name.mjs --apply   # COMMIT

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local.prod');
  const txt = readFileSync(envPath, 'utf8');
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

function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

async function main() {
  const db = init();
  const data = dataPath(db);

  console.log(`[v46-backfill] mode = ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log('[v46-backfill] reading be_products ...');
  const prodSnap = await data.collection('be_products').get();
  const productNameById = new Map();
  for (const d of prodSnap.docs) {
    const p = d.data();
    const nm = String(p.productName || p.name || '').trim();
    if (nm) productNameById.set(d.id, nm);
  }
  console.log(`[v46-backfill]   ${prodSnap.size} be_products (${productNameById.size} with names)`);

  console.log('[v46-backfill] reading be_stock_batches ...');
  const batchSnap = await data.collection('be_stock_batches').get();
  console.log(`[v46-backfill]   ${batchSnap.size} batches\n`);

  const drift = [];
  let inSync = 0;
  let orphan = 0; // batch.productId doesn't exist in be_products
  for (const b of batchSnap.docs) {
    const data_ = b.data();
    const pid = String(data_.productId || '').trim();
    if (!pid) continue;
    const liveName = productNameById.get(pid);
    if (liveName == null) {
      orphan += 1;
      continue;
    }
    const current = String(data_.productName || '').trim();
    if (current === liveName) {
      inSync += 1;
      continue;
    }
    drift.push({
      batchId: b.id,
      productId: pid,
      currentName: current,
      liveName,
      branchId: data_.branchId || '',
      autoNegative: !!data_.autoNegative,
    });
  }

  console.log('[v46-backfill] === DRIFT ===');
  console.log(`  Total batches:                ${batchSnap.size}`);
  console.log(`  In-sync (canonical name):     ${inSync}`);
  console.log(`  Orphan (no master product):   ${orphan}`);
  console.log(`  ⚠ Drift (poisoned batches):   ${drift.length}`);

  if (drift.length > 0) {
    console.log('\n  --- DRIFT samples (showing up to 10) ---');
    for (const d of drift.slice(0, 10)) {
      console.log(`    batch=${d.batchId}  productId=${d.productId}  branch=${d.branchId}  autoNeg=${d.autoNegative}`);
      console.log(`      current="${d.currentName}"`);
      console.log(`      live   ="${d.liveName}"`);
    }
  }

  if (!APPLY) {
    console.log('\n[v46-backfill] DRY RUN — no writes. Re-run with --apply to commit.');
    return;
  }

  if (drift.length === 0) {
    console.log('\n[v46-backfill] nothing to apply');
    return;
  }

  console.log(`\n[v46-backfill] APPLYING ${drift.length} batch updates ...`);
  let applied = 0;
  let batchOp = db.batch();
  let inBatch = 0;
  const ids = [];
  for (const d of drift) {
    const ref = data.collection('be_stock_batches').doc(d.batchId);
    batchOp.update(ref, {
      productName: d.liveName,
      _v46ProductNameBackfilledAt: new Date().toISOString(),
      _v46ProductNameBackfilledFrom: d.currentName,
    });
    ids.push(d.batchId);
    inBatch += 1;
    if (inBatch >= 400) {
      await batchOp.commit();
      applied += inBatch;
      console.log(`[v46-backfill]   committed ${applied}/${drift.length} ...`);
      batchOp = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) {
    await batchOp.commit();
    applied += inBatch;
  }
  console.log(`[v46-backfill]   committed ${applied}/${drift.length} TOTAL`);

  const auditId = `v46-backfill-stock-batch-product-name-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    type: 'v46-backfill-stock-batch-product-name',
    totalBatches: batchSnap.size,
    inSync,
    orphan,
    driftCount: drift.length,
    appliedCount: applied,
    sampleBatchIds: ids.slice(0, 50),
    appliedAt: FieldValue.serverTimestamp(),
    invokedFrom: 'scripts/v46-backfill-stock-batch-product-name.mjs',
  });
  console.log(`[v46-backfill] audit doc: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('[v46-backfill] FATAL:', err); process.exit(1); });
}
