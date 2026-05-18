// ─── Branch backfill — APPLY (writes Firestore via admin SDK) ───────────
// Phase BS regression-fix (2026-05-06). Production data without an
// explicit `branchId` is now hidden by the Phase BS server-side filter.
// User's SaleTab/TreatmentFormPage/AppointmentTab show empty.
//
// Migration policy (explicit user authorization 2026-05-06):
//   - empty / missing branchId → backfill to TARGET (BR-...-26df6480 / "นครราชสีมา")
//   - 'main' (legacy V20 default) → backfill to TARGET
//   - 'BR-1777095572005-ae97f911' (V35 phantom — deleted from be_branches
//      but live data still references it) → backfill to TARGET
//   - All other branchId values (ADVB-/ADVSA-/TEST-/etc.) → SKIP
//      (test pollution; separate cleanup task)
//
// Per-collection writeBatch ≤ 500 ops. Each write also stamps
// `_branchBaselineMigratedAt` + `_branchBaselineMigratedBy` for forensics.
// One audit doc per run summarizes counts + sample IDs.
//
// Usage: node scripts/branch-merge-apply.mjs

import { readFileSync } from 'fs';
const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const TARGET_BRANCH = 'BR-1777873556815-26df6480'; // "นครราชสีมา"

// branchId values that we MIGRATE to TARGET
const MIGRATABLE = (bid) => {
  if (bid === undefined || bid === null) return true;          // missing field
  if (typeof bid !== 'string') return true;                    // non-string  (V22-style noise)
  const s = bid.trim();
  if (s === '') return true;                                   // empty string
  if (s === 'main') return true;                               // pre-V20 default
  if (s === 'BR-1777095572005-ae97f911') return true;          // V35 phantom
  return false;                                                // anything else stays put
};

const COLLECTIONS = [
  // Phase BS first wave (already done 2026-05-04 first run)
  'be_customers',
  'be_sales',
  'be_treatments',
  'be_appointments',
  'be_quotations',
  'be_vendor_sales',
  'be_online_sales',
  'be_sale_insurance_claims',
  'be_expenses',
  'be_staff_schedules',
  'be_stock_orders',
  'be_stock_batches',
  'be_stock_movements',
  'be_stock_adjustments',
  // Phase BS V2 — master-data tabs that user wants branch-scoped
  // (per-branch product catalogs, holidays, DF groups, finance master, etc.)
  'be_product_groups',
  'be_product_units',
  'be_medical_instruments',
  'be_holidays',
  'be_products',
  'be_courses',
  'be_df_groups',
  'be_df_staff_rates',
  'be_bank_accounts',
  'be_expense_categories',
];

const app = initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);
const data = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function migrateCollection(col, ts, summary) {
  const snap = await data.collection(col).get();
  const targets = [];
  for (const d of snap.docs) {
    const dt = d.data();
    if (MIGRATABLE(dt.branchId)) targets.push(d);
  }
  summary[col] = { total: snap.size, migrated: targets.length, sampleIds: targets.slice(0, 5).map(d => d.id) };
  if (targets.length === 0) return;

  let batch = db.batch();
  let inBatch = 0;
  for (const d of targets) {
    batch.update(d.ref, {
      branchId: TARGET_BRANCH,
      _branchBaselineMigratedAt: ts,
      _branchBaselineMigratedBy: 'admin-script-2026-05-06',
    });
    inBatch += 1;
    if (inBatch >= 500) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();
}

async function main() {
  const ts = new Date().toISOString();
  console.log(`=== Branch Backfill APPLY ===`);
  console.log(`Target: ${TARGET_BRANCH} ("นครราชสีมา")`);
  console.log(`Time: ${ts}`);
  console.log('');

  const summary = {};
  for (const col of COLLECTIONS) {
    process.stdout.write(`  ${col.padEnd(32)} `);
    try {
      await migrateCollection(col, ts, summary);
      const r = summary[col];
      console.log(`migrated ${r.migrated}/${r.total}`);
    } catch (e) {
      summary[col] = { error: e.message };
      console.log(`ERR: ${e.message}`);
    }
  }
  console.log('');

  // Audit doc
  const auditId = `branch-baseline-apply-${Date.now()}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    type: 'branch-baseline-apply',
    targetBranch: TARGET_BRANCH,
    rule: 'empty / missing / main / BR-1777095572005-ae97f911 → TARGET',
    summary,
    callerEmail: 'admin-script-2026-05-06',
    callerUid: 'admin-script',
    createdAt: ts,
  });
  console.log(`Audit: be_admin_audit/${auditId}`);

  const totalMigrated = Object.values(summary).reduce((a, r) => a + (r.migrated || 0), 0);
  console.log('');
  console.log(`=== ${totalMigrated} docs migrated to ${TARGET_BRANCH} ===`);
  process.exit(0);
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
