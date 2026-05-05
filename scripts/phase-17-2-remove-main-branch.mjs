#!/usr/bin/env node
// ─── Phase 17.2 — Remove "main / default branch" concept (admin SDK migration) ──
// One-shot script. Run via:
//   node scripts/phase-17-2-remove-main-branch.mjs              (default --dry-run)
//   node scripts/phase-17-2-remove-main-branch.mjs --apply      (commits writes)
//
// Operations:
//   1. Read be_branches → find isDefault=true → DEFAULT_TARGET (or alphabetical-first fallback)
//   2. Survey 'main' branchId / 'main' locationId docs across all branch-scoped collections
//   3. Survey be_branches docs with isDefault field present (any value)
//   4. --apply: chunked atomic batch writes (re-stamp branchId, FieldValue.delete isDefault) +
//      one audit doc to be_admin_audit/phase-17-2-...
//
// Idempotent: re-running on clean state finds 0 docs + exits clean.
//
// Pre-flight:
//   - .env.local.prod must contain FIREBASE_ADMIN_CLIENT_EMAIL +
//     FIREBASE_ADMIN_PRIVATE_KEY. Pull via:
//       vercel env pull .env.local.prod --environment=production --yes

import { readFileSync, existsSync } from 'fs';
const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  const envText = readFileSync(envFile, 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

const APP_ID = 'loverclinic-opd-4c39b';
const DRY_RUN = !process.argv.includes('--apply');

const BRANCH_SCOPED_COLLECTIONS = [
  'be_treatments', 'be_sales', 'be_appointments', 'be_quotations',
  'be_vendor_sales', 'be_online_sales', 'be_sale_insurance_claims',
  'be_expenses', 'be_staff_schedules', 'be_promotions', 'be_coupons',
  'be_vouchers', 'be_deposits', 'be_link_requests',
  'be_products', 'be_courses', 'be_product_groups', 'be_product_unit_groups',
  'be_medical_instruments', 'be_holidays', 'be_df_groups', 'be_df_staff_rates',
  'be_bank_accounts', 'be_expense_categories',
];

const STOCK_COLLECTIONS = [
  'be_stock_batches', 'be_stock_orders', 'be_stock_movements',
  'be_stock_transfers', 'be_stock_withdrawals', 'be_stock_adjustments',
];

function initAdmin() {
  if (getApps().length === 0) {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!clientEmail || !privateKey) {
      throw new Error('FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY required');
    }
    initializeApp({ credential: cert({ projectId: APP_ID, clientEmail, privateKey }) });
  }
}

function colRef(db, name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}

// --- Pure helpers (extracted for testability) -------------------------------

export function chunkOps500(ops) {
  const chunks = [];
  for (let i = 0; i < ops.length; i += 500) {
    chunks.push(ops.slice(i, i + 500));
  }
  return chunks;
}

export function pickDefaultTarget(branches) {
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error('be_branches is empty — cannot determine migration target');
  }
  const isDefaultBranch = branches.find(b => b.isDefault === true);
  if (isDefaultBranch) return isDefaultBranch;
  // Fallback: alphabetical-first by name (Thai locale-aware).
  const sorted = [...branches].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'th-TH')
  );
  return sorted[0];
}

export function maybeTruncate(arr, max = 500) {
  if (!Array.isArray(arr) || arr.length <= max) return { value: arr, truncated: false };
  return { value: arr.slice(0, 10), truncated: true, totalCount: arr.length };
}

export function summarizeLegacyDocs(docs, branchIdField) {
  const ids = docs.map(d => d.id);
  return { count: docs.length, sampleIds: ids.slice(0, 10), branchIdField };
}

// --- Survey ----------------------------------------------------------------

async function surveyLegacyMainDocs(db, collection, idField) {
  const snap = await colRef(db, collection).where(idField, '==', 'main').get();
  return snap.docs.map(d => ({ id: d.id, ref: d.ref }));
}

async function surveyIsDefaultDocs(db) {
  const snap = await colRef(db, 'be_branches').get();
  return snap.docs.filter(d => 'isDefault' in d.data()).map(d => ({ id: d.id, ref: d.ref, data: d.data() }));
}

// --- Main ------------------------------------------------------------------

async function main() {
  initAdmin();
  const db = getFirestore();

  console.log(`=== Phase 17.2 migration ${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} @ ${new Date().toISOString()} ===\n`);

  // 1. Read be_branches.
  const branchesSnap = await colRef(db, 'be_branches').get();
  const branches = branchesSnap.docs.map(d => ({ branchId: d.id, ...d.data() }));
  if (branches.length === 0) {
    console.error('ERROR: be_branches is empty. Cannot determine migration target.');
    process.exit(1);
  }
  const target = pickDefaultTarget(branches);
  console.log(`DEFAULT_TARGET: ${target.branchId} (${target.name || '<no name>'})`);
  console.log(`  via: ${target.isDefault === true ? 'isDefault=true' : 'alphabetical-first fallback'}\n`);

  // 2. Survey legacy 'main' branchId docs (branch-scoped).
  console.log('Surveying legacy branchId="main" docs...');
  const legacyBranchIdOps = [];
  const perCollectionBreakdown = {};
  for (const col of BRANCH_SCOPED_COLLECTIONS) {
    const docs = await surveyLegacyMainDocs(db, col, 'branchId');
    perCollectionBreakdown[col] = docs.length;
    for (const d of docs) {
      legacyBranchIdOps.push({ ref: d.ref, update: { branchId: target.branchId } });
    }
    if (docs.length > 0) console.log(`  ${col}: ${docs.length}`);
  }

  // 3. Survey legacy 'main' locationId docs (stock).
  console.log('\nSurveying legacy locationId="main" stock docs...');
  const legacyLocationIdOps = [];
  for (const col of STOCK_COLLECTIONS) {
    const docs = await surveyLegacyMainDocs(db, col, 'locationId');
    perCollectionBreakdown[col] = (perCollectionBreakdown[col] || 0) + docs.length;
    for (const d of docs) {
      legacyLocationIdOps.push({ ref: d.ref, update: { locationId: target.branchId } });
    }
    if (docs.length > 0) console.log(`  ${col}: ${docs.length}`);
  }

  // 4. Survey isDefault field on be_branches.
  console.log('\nSurveying be_branches with isDefault field...');
  const isDefaultDocs = await surveyIsDefaultDocs(db);
  const isDefaultOps = isDefaultDocs.map(d => ({ ref: d.ref, update: { isDefault: FieldValue.delete() } }));
  console.log(`  be_branches with isDefault: ${isDefaultDocs.length}\n`);

  // 5. Print summary.
  const totalOps = legacyBranchIdOps.length + legacyLocationIdOps.length + isDefaultOps.length;
  console.log(`SUMMARY:`);
  console.log(`  ${legacyBranchIdOps.length} branchId='main' docs → branchId='${target.branchId}'`);
  console.log(`  ${legacyLocationIdOps.length} locationId='main' stock docs → locationId='${target.branchId}'`);
  console.log(`  ${isDefaultOps.length} be_branches docs → isDefault stripped`);
  console.log(`  TOTAL: ${totalOps} writes\n`);

  if (totalOps === 0) {
    console.log('Nothing to migrate. Exiting.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('DRY RUN — re-run with --apply to commit writes.');
    process.exit(0);
  }

  // 6. Apply: chunked atomic batches.
  console.log('Applying writes...');
  const allOps = [...legacyBranchIdOps, ...legacyLocationIdOps, ...isDefaultOps];
  const chunks = chunkOps500(allOps);
  for (let i = 0; i < chunks.length; i++) {
    const batch = db.batch();
    for (const op of chunks[i]) {
      batch.update(op.ref, { ...op.update, updatedAt: new Date().toISOString(), updatedBy: 'phase-17-2-script' });
    }
    await batch.commit();
    console.log(`  Batch ${i + 1}/${chunks.length} committed (${chunks[i].length} ops).`);
  }

  // 7. Audit doc emit (separate single-doc batch).
  const ts = Date.now();
  const auditId = `phase-17-2-remove-main-branch-${ts}-${crypto.randomUUID()}`;
  const importedTrunc = maybeTruncate(legacyBranchIdOps.map(o => o.ref.id));
  const stockTrunc = maybeTruncate(legacyLocationIdOps.map(o => o.ref.id));
  const isDefaultTrunc = maybeTruncate(isDefaultOps.map(o => o.ref.id));
  const auditDoc = {
    action: 'phase-17-2-remove-main-branch',
    defaultTargetId: target.branchId,
    defaultTargetName: target.name || null,
    migratedBranchIdCount: legacyBranchIdOps.length,
    migratedLocationIdCount: legacyLocationIdOps.length,
    strippedIsDefaultCount: isDefaultOps.length,
    perCollectionBreakdown,
    migratedBranchIdSample: importedTrunc.value,
    migratedBranchIdTruncated: !!importedTrunc.truncated,
    migratedLocationIdSample: stockTrunc.value,
    migratedLocationIdTruncated: !!stockTrunc.truncated,
    strippedIsDefaultSample: isDefaultTrunc.value,
    strippedIsDefaultTruncated: !!isDefaultTrunc.truncated,
    dryRun: false,
    adminUid: 'phase-17-2-script',
    ts: new Date(ts).toISOString(),
  };
  await colRef(db, 'be_admin_audit').doc(auditId).set(auditDoc);
  console.log(`\nAudit doc: be_admin_audit/${auditId}`);
  console.log('DONE.');
  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
