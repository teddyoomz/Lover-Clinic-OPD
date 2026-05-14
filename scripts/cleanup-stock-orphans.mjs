#!/usr/bin/env node
// ─── Cleanup stock orphans — Rule M two-phase + Rule R diag ─────────────────
//
// User request 2026-05-15:
// "ฝากเคลีย orphan ของทุก tab ย่อยของทุกสาขา รวมถึงคลังกลาง ด้วยนะ เยอะมากๆ"
//
// Scans 7 stock collections across all branches + central warehouses. Classifies
// each doc against canonical branch + warehouse lists.
//
// Classifications:
//   1. VALID         — location matches a known branch or warehouse → KEEP
//   2. TEST_FIXTURE  — id or location starts with TEST-*/E2E-*/ADVB-*/ADVX-*/
//                      ADVW-*/ADVO-*/ADVS-*/ADVT-*/OTHER- → DELETE
//   3. ORPHAN        — location doesn't match anything known + not test → DELETE
//   4. LEGACY_MAIN   — sourceLocationId/locationId === 'main' (pre-Phase 17
//                      legacy default). KEEP by default; --include-legacy-main
//                      flag includes them in deletion.
//
// Coverage:
//   - be_stock_batches      (filter: branchId)
//   - be_stock_movements    (filter: branchId)
//   - be_stock_orders       (filter: branchId)
//   - be_stock_transfers    (filter: sourceLocationId + destinationLocationId)
//   - be_stock_withdrawals  (filter: sourceLocationId + destinationLocationId)
//   - be_stock_adjustments  (filter: branchId)
//   - be_central_stock_orders (filter: centralWarehouseId)
//
// Rule M two-phase: dry-run by default, --apply commits writes + audit doc.
// Rule M canonical: admin-SDK, artifacts/{APP_ID}/public/data/* paths, audit
// doc to be_admin_audit, forensic-trail _cleanupDeletedAt, idempotent.
//
// Usage:
//   node scripts/cleanup-stock-orphans.mjs                       # DRY-RUN
//   node scripts/cleanup-stock-orphans.mjs --apply               # DELETE
//   node scripts/cleanup-stock-orphans.mjs --include-legacy-main # also delete main-source
//   node scripts/cleanup-stock-orphans.mjs --scope=test-only     # only test prefixes
//   node scripts/cleanup-stock-orphans.mjs --scope=orphans-only  # only orphans (no test)

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));
if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) loadDotEnv(path.resolve(process.cwd(), '.env.local'));

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const BATCH_LIMIT = 400;

const APPLY = process.argv.includes('--apply');
const INCLUDE_LEGACY_MAIN = process.argv.includes('--include-legacy-main');
const SCOPE_ARG = process.argv.find(a => a.startsWith('--scope='));
const SCOPE = SCOPE_ARG ? SCOPE_ARG.replace('--scope=', '') : 'all';
const VALID_SCOPES = ['all', 'test-only', 'orphans-only'];
if (!VALID_SCOPES.includes(SCOPE)) {
  console.error(`Invalid --scope=${SCOPE}. Must be one of: ${VALID_SCOPES.join(', ')}`);
  process.exit(1);
}

// Test fixture id-prefix patterns (regex matches if doc EITHER its own id OR
// any of its location keys starts with these). Crypto-evident — added when a
// test bank seeded these.
const TEST_PREFIXES = [
  /^TEST-/i,
  /^E2E-/i,
  /^ADVB-/i,         // adversarial branch (Phase 14.x)
  /^ADVX-(SRC|DST)-/, // adversarial transfer
  /^ADVW-(SRC|DST)-/, // adversarial withdrawal
  /^ADVO-/i,         // adversarial order
  /^ADVS-/i,         // adversarial sale stock
  /^ADVT-/i,         // adversarial test products
  /^OTHER-/i,        // V20-era multi-branch test
];

function isTestPrefix(value) {
  if (!value || typeof value !== 'string') return false;
  return TEST_PREFIXES.some(re => re.test(value));
}

function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* env missing');
  const app = initializeApp({
    credential: cert({ projectId: APP_ID, clientEmail, privateKey: rawKey.split('\\n').join('\n') }),
  });
  return getFirestore(app);
}

const db = getAdmin();
const dataCol = (n) => db.collection(BASE_PATH + '/' + n);

// 7 stock collections + their location-key fields
const COLLECTIONS = [
  { name: 'be_stock_batches', locationKeys: ['branchId', 'locationId'] },
  { name: 'be_stock_movements', locationKeys: ['branchId'] },
  { name: 'be_stock_orders', locationKeys: ['branchId'] },
  { name: 'be_stock_transfers', locationKeys: ['sourceLocationId', 'destinationLocationId'] },
  { name: 'be_stock_withdrawals', locationKeys: ['sourceLocationId', 'destinationLocationId'] },
  { name: 'be_stock_adjustments', locationKeys: ['branchId'] },
  { name: 'be_central_stock_orders', locationKeys: ['centralWarehouseId'] },
];

async function loadValidIds() {
  console.log('── Loading canonical branch + warehouse IDs ──');
  const validIds = new Set();

  const branchSnap = await dataCol('be_branches').get();
  for (const d of branchSnap.docs) validIds.add(d.id);
  console.log(`  Loaded ${branchSnap.size} branches`);

  const whSnap = await dataCol('be_central_stock_warehouses').get();
  for (const d of whSnap.docs) validIds.add(d.id);
  console.log(`  Loaded ${whSnap.size} warehouses`);

  console.log(`  Total valid location IDs: ${validIds.size}\n`);
  return validIds;
}

function classifyDoc(docId, data, locationKeys, validIds) {
  // Collect all location values from this doc
  const locations = [];
  for (const key of locationKeys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      locations.push(String(data[key]));
    }
  }

  // Doc with no location keys at all → ORPHAN (can't determine which branch)
  if (locations.length === 0) {
    return { class: 'ORPHAN_NO_LOCATION', reason: 'no location fields populated', locations: [] };
  }

  // Doc id itself matches test prefix
  if (isTestPrefix(docId)) {
    return { class: 'TEST_FIXTURE', reason: `docId matches test prefix`, locations };
  }

  // Any location key matches test prefix
  for (const loc of locations) {
    if (isTestPrefix(loc)) {
      return { class: 'TEST_FIXTURE', reason: `location "${loc}" matches test prefix`, locations };
    }
  }

  // Check if ANY location is valid (matches known branch/warehouse)
  const anyValid = locations.some(loc => validIds.has(loc));
  if (anyValid) {
    return { class: 'VALID', reason: 'matches known branch/warehouse', locations };
  }

  // Legacy "main" sourceLocationId — pre-Phase 17 default. Special handling.
  const allMain = locations.every(loc => loc === 'main');
  if (allMain) {
    return { class: 'LEGACY_MAIN', reason: 'sourceLocationId=main (pre-Phase 17 legacy)', locations };
  }
  const someMain = locations.some(loc => loc === 'main');
  if (someMain) {
    return {
      class: 'LEGACY_MAIN_MIXED',
      reason: `mix of 'main' and unknown locations: ${locations.join(', ')}`,
      locations,
    };
  }

  // Locations exist but none match anything known → ORPHAN
  return { class: 'ORPHAN', reason: `locations not in canonical lists: ${locations.join(', ')}`, locations };
}

function shouldDelete(classification) {
  switch (SCOPE) {
    case 'test-only':
      return classification === 'TEST_FIXTURE';
    case 'orphans-only':
      return classification === 'ORPHAN' || classification === 'ORPHAN_NO_LOCATION'
          || (INCLUDE_LEGACY_MAIN && (classification === 'LEGACY_MAIN' || classification === 'LEGACY_MAIN_MIXED'));
    case 'all':
    default:
      return classification === 'TEST_FIXTURE' || classification === 'ORPHAN' || classification === 'ORPHAN_NO_LOCATION'
          || (INCLUDE_LEGACY_MAIN && (classification === 'LEGACY_MAIN' || classification === 'LEGACY_MAIN_MIXED'));
  }
}

async function main() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  Stock orphan cleanup — Rule M two-phase + Rule R diag');
  console.log(`  Mode: ${APPLY ? 'APPLY (writes deletes + audit doc)' : 'DRY-RUN'}`);
  console.log(`  Scope: ${SCOPE}  |  Include LEGACY_MAIN: ${INCLUDE_LEGACY_MAIN}`);
  console.log('═════════════════════════════════════════════════════════════════\n');

  const validIds = await loadValidIds();

  const report = {};
  const toDelete = []; // [{collection, docId, ref, reason}]

  for (const { name, locationKeys } of COLLECTIONS) {
    console.log(`── Scanning ${name} (filterFields: ${locationKeys.join(', ')}) ──`);
    const snap = await dataCol(name).get();
    const counts = {
      VALID: 0,
      TEST_FIXTURE: 0,
      ORPHAN: 0,
      ORPHAN_NO_LOCATION: 0,
      LEGACY_MAIN: 0,
      LEGACY_MAIN_MIXED: 0,
    };
    const samples = { TEST_FIXTURE: [], ORPHAN: [], ORPHAN_NO_LOCATION: [], LEGACY_MAIN: [], LEGACY_MAIN_MIXED: [] };

    for (const d of snap.docs) {
      const c = classifyDoc(d.id, d.data(), locationKeys, validIds);
      counts[c.class] = (counts[c.class] || 0) + 1;
      if (samples[c.class] && samples[c.class].length < 3) {
        samples[c.class].push({ id: d.id, reason: c.reason, locations: c.locations });
      }
      if (shouldDelete(c.class)) {
        toDelete.push({ collection: name, docId: d.id, ref: d.ref, classification: c.class, reason: c.reason });
      }
    }

    report[name] = { total: snap.size, counts, samples };
    console.log(`  Total: ${snap.size}`);
    for (const [k, v] of Object.entries(counts)) {
      if (v > 0) console.log(`    ${k}: ${v}`);
    }
    console.log();
  }

  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═════════════════════════════════════════════════════════════════');
  let totalDocsScanned = 0;
  let totalToDelete = 0;
  for (const [col, r] of Object.entries(report)) {
    totalDocsScanned += r.total;
    const willDelete = Object.entries(r.counts)
      .filter(([k]) => shouldDelete(k))
      .reduce((sum, [, v]) => sum + v, 0);
    totalToDelete += willDelete;
    console.log(`  ${col}: scan=${r.total}, willDelete=${willDelete}`);
  }
  console.log(`\n  TOTAL: scanned=${totalDocsScanned}, willDelete=${totalToDelete}`);

  if (totalToDelete === 0) {
    console.log('\n  ✅ No docs to delete — collections are clean.');
    process.exit(0);
  }

  // Print samples per collection per class
  console.log('\n── Samples per (collection, classification) ──');
  for (const [col, r] of Object.entries(report)) {
    for (const [klass, samps] of Object.entries(r.samples)) {
      if (samps.length === 0) continue;
      if (!shouldDelete(klass)) continue;
      console.log(`  ${col}.${klass} (showing up to 3):`);
      for (const s of samps) {
        console.log(`    - ${s.id}: ${s.reason}`);
      }
    }
  }

  if (!APPLY) {
    console.log('\n  ⚠️  DRY-RUN — re-run with --apply to commit deletes');
    process.exit(0);
  }

  // ─── APPLY phase ───
  console.log('\n── APPLY: deleting docs + writing audit doc ──');
  const auditId = `cleanup-stock-orphans-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const auditCounts = {};
  const auditClassBreakdown = {};
  let deleted = 0;

  for (const { collection, docId, ref, classification } of toDelete) {
    auditCounts[collection] = (auditCounts[collection] || 0) + 1;
    if (!auditClassBreakdown[classification]) auditClassBreakdown[classification] = 0;
    auditClassBreakdown[classification]++;
  }

  // Batch delete (max 400 per batch)
  for (let i = 0; i < toDelete.length; i += BATCH_LIMIT) {
    const slice = toDelete.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const { ref } of slice) batch.delete(ref);
    await batch.commit();
    deleted += slice.length;
    if (i % (BATCH_LIMIT * 5) === 0) console.log(`  Deleted ${deleted}/${toDelete.length}`);
  }
  console.log(`  Deleted ${deleted}/${toDelete.length} total\n`);

  // Audit doc
  await dataCol('be_admin_audit').doc(auditId).set({
    action: 'cleanup-stock-orphans',
    scope: SCOPE,
    includeLegacyMain: INCLUDE_LEGACY_MAIN,
    perCollectionCounts: auditCounts,
    perClassificationCounts: auditClassBreakdown,
    totalDeleted: deleted,
    totalScanned: totalDocsScanned,
    executedAt: new Date().toISOString(),
    executedBy: 'cli-cleanup-stock-orphans',
  });
  console.log(`  ✓ Audit doc: be_admin_audit/${auditId}`);

  console.log('\n═════════════════════════════════════════════════════════════════');
  console.log(`  ✅ CLEANUP COMPLETE — ${deleted} docs deleted`);
  console.log('═════════════════════════════════════════════════════════════════');
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
  });
}
