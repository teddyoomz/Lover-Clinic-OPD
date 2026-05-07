// V50 Phase 6 — Rule M cleanup of ProClinic-side residue collections.
//
// After V50 Phase 1+2 stripped ALL runtime ProClinic code (broker.*, api/proclinic,
// cookie-relay, MasterDataTab, CloneTab), the following Firestore data is now
// orphaned (no readers, no writers):
//
//   1. master_data/* — was sync-mirror seed for be_* migrations (cloneOrchestrator
//      + MasterDataTab + Phase 11 sync). All migrators have shipped to prod.
//   2. broker_jobs/* — was the cookie-relay job queue (extension polled this).
//      Cookie-relay deleted in V50.Phase 2.2.
//   3. pc_* (12 collections) — was the ProClinic mirror (read-side cache for
//      AdminDashboard before the be_* unification). All readers migrated in
//      V50.Phase 1 to be_appointments / be_customers / be_treatments etc.
//   4. clinic_settings/proclinic_session + proclinic_session_trial — was the
//      cookie-relay session stash for ProClinic credentials. Cookie-relay gone.
//
// Verification (pre-script grep):
//   - src/components: only HISTORICAL COMMENTS reference master_data ("was X
//     via getAllMasterDataItems — stale ProClinic mirror")
//   - src/pages: zero matches for master_data CRUD function names
//   - scopedDataLayer.js: re-exports exist (deleteMasterCourse / deleteMasterItem
//     / getMasterDataMeta) but are NOT consumed anywhere; orphan exports
//   - firestore.rules: rules definitions exist but no UI/server reads/writes
//
// USAGE:
//   node scripts/v50-phase6-cleanup-proclinic-residue.mjs            # dry-run
//   node scripts/v50-phase6-cleanup-proclinic-residue.mjs --apply    # delete + audit
//
// Run from project root after `vercel env pull .env.local.prod`.
//
// Idempotency: re-run with --apply yields 0 deletions (skip-on-already-deleted
// pattern via collection-emptiness check).
//
// Two-phase: dry-run reports counts ONLY; no writes. --apply commits the
// deletes + emits audit doc to be_admin_audit/v50-phase6-cleanup-{ts}-{rand}.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Setup ─────────────────────────────────────────────────────────────────

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}

const APPLY = process.argv.includes('--apply');
const env = loadEnv();
const APP_ID = 'loverclinic-opd-4c39b';
const base = `artifacts/${APP_ID}/public/data`;

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }),
});
const db = getFirestore();

// ─── Targets ──────────────────────────────────────────────────────────────

// pc_* mirror collections (full list from firestore.rules + grep)
const PC_COLLECTIONS = [
  'pc_appointments',
  'pc_customers',
  'pc_customer_appointments',
  'pc_courses',
  'pc_doctors',
  'pc_treatments',
  'pc_treatment_history',
  'pc_chart_templates',
  'pc_form_options',
  'pc_inventory',
];

// master_data/* known subcollection types (each has /items subcollection)
// Inferred from grep + Phase 11 sync targets + masterDataItemsCol callsites
const MASTER_DATA_TYPES = [
  'courses',
  'products',
  'staff',
  'doctors',
  'product_groups',
  'product_units',
  'medical_instruments',
  'holidays',
  'permission_groups',
  'wallet_types',
  'membership_types',
  'document_templates',
  'medicine_labels',
  'staff_schedules',
  'df_groups',
  'df_staff_rates',
  'bank_accounts',
  'expense_categories',
  'promotions',
  'coupons',
  'vouchers',
];

// ─── Helpers ──────────────────────────────────────────────────────────────

let stats = {
  pc: {},                  // { collection: { scanned, deleted } }
  master_data: {},         // { type: { items: { scanned, deleted }, parent_doc: deleted } }
  broker_jobs: { scanned: 0, deleted: 0 },
  proclinic_session: { scanned: 0, deleted: 0 },
};

const ts = Date.now();
const sessionTag = randomBytes(4).toString('hex');

async function deleteCollectionInBatches(collRef, label, statBucket) {
  const snap = await collRef.get();
  statBucket.scanned = snap.size;
  if (snap.size === 0) {
    console.log(`  ${label}: 0 docs (already empty)`);
    return;
  }
  if (!APPLY) {
    console.log(`  ${label}: ${snap.size} docs (dry-run; would delete)`);
    return;
  }
  // Firestore batch limit = 500. Chunk if larger.
  const docs = snap.docs;
  const CHUNK = 400;
  let total = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const slice = docs.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const d of slice) batch.delete(d.ref);
    await batch.commit();
    total += slice.length;
  }
  statBucket.deleted = total;
  console.log(`  ${label}: ${total} docs DELETED`);
}

// ─── Main phases ──────────────────────────────────────────────────────────

async function phase1_pcMirrors() {
  console.log('\n=== Phase 1: pc_* mirror collections ===');
  for (const coll of PC_COLLECTIONS) {
    stats.pc[coll] = { scanned: 0, deleted: 0 };
    await deleteCollectionInBatches(
      db.collection(`${base}/${coll}`),
      coll,
      stats.pc[coll],
    );
  }
}

async function phase2_masterData() {
  console.log('\n=== Phase 2: master_data/* (items + parent doc) ===');
  for (const type of MASTER_DATA_TYPES) {
    stats.master_data[type] = {
      items: { scanned: 0, deleted: 0 },
      parent_doc: false,
    };
    // 1) Delete items subcollection
    await deleteCollectionInBatches(
      db.collection(`${base}/master_data/${type}/items`),
      `master_data/${type}/items`,
      stats.master_data[type].items,
    );
    // 2) Delete parent doc (master_data/{type})
    const parentRef = db.doc(`${base}/master_data/${type}`);
    const snap = await parentRef.get();
    if (snap.exists) {
      if (APPLY) {
        await parentRef.delete();
        stats.master_data[type].parent_doc = true;
        console.log(`  master_data/${type} (parent doc) DELETED`);
      } else {
        console.log(`  master_data/${type} (parent doc): exists (dry-run)`);
        stats.master_data[type].parent_doc = 'would-delete';
      }
    }
  }
}

async function phase3_brokerJobs() {
  console.log('\n=== Phase 3: broker_jobs/* ===');
  await deleteCollectionInBatches(
    db.collection(`${base}/broker_jobs`),
    'broker_jobs',
    stats.broker_jobs,
  );
}

async function phase4_proclinicSession() {
  console.log('\n=== Phase 4: clinic_settings/proclinic_session + _trial ===');
  // These are SINGLE docs at clinic_settings/{id}, not a subcollection
  const targets = [
    `${base}/clinic_settings/proclinic_session`,
    `${base}/clinic_settings/proclinic_session_trial`,
  ];
  for (const path of targets) {
    const ref = db.doc(path);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  ${path}: not present (already deleted)`);
      continue;
    }
    stats.proclinic_session.scanned++;
    if (APPLY) {
      await ref.delete();
      stats.proclinic_session.deleted++;
      console.log(`  ${path}: DELETED`);
    } else {
      console.log(`  ${path}: exists (dry-run; would delete)`);
    }
  }
}

async function phase5_auditDoc() {
  if (!APPLY) return;
  console.log('\n=== Phase 5: audit doc emit ===');
  const auditId = `v50-phase6-cleanup-proclinic-residue-${ts}-${randomBytes(4).toString('hex')}`;
  await db.collection(`${base}/be_admin_audit`).doc(auditId).set({
    phase: 'V50.Phase6',
    operation: 'cleanup-proclinic-residue',
    target: {
      pc_collections: PC_COLLECTIONS,
      master_data_types: MASTER_DATA_TYPES,
      broker_jobs: true,
      proclinic_session: true,
      proclinic_session_trial: true,
    },
    stats,
    appliedAt: FieldValue.serverTimestamp(),
    sessionTag,
  });
  console.log(`  Audit doc emitted: be_admin_audit/${auditId}`);
}

// ─── Summary ──────────────────────────────────────────────────────────────

function printSummary() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`V50 Phase 6 Summary (${APPLY ? '--apply' : 'dry-run'})`);
  console.log('='.repeat(70));

  let totalScan = 0, totalDel = 0;
  console.log('\nPC mirrors:');
  for (const [c, s] of Object.entries(stats.pc)) {
    console.log(`  ${c.padEnd(35)} scanned=${String(s.scanned).padStart(5)}  deleted=${String(s.deleted).padStart(5)}`);
    totalScan += s.scanned;
    totalDel += s.deleted;
  }

  console.log('\nMaster data:');
  for (const [t, s] of Object.entries(stats.master_data)) {
    const items = s.items;
    const parent = s.parent_doc;
    console.log(`  ${t.padEnd(25)} items: scanned=${String(items.scanned).padStart(5)} deleted=${String(items.deleted).padStart(5)}  parent_doc=${parent}`);
    totalScan += items.scanned;
    totalDel += items.deleted;
    if (parent === true) totalDel++;
  }

  console.log(`\nbroker_jobs: scanned=${stats.broker_jobs.scanned}  deleted=${stats.broker_jobs.deleted}`);
  totalScan += stats.broker_jobs.scanned;
  totalDel += stats.broker_jobs.deleted;

  console.log(`proclinic_session*: scanned=${stats.proclinic_session.scanned}  deleted=${stats.proclinic_session.deleted}`);
  totalScan += stats.proclinic_session.scanned;
  totalDel += stats.proclinic_session.deleted;

  console.log(`\nGRAND TOTAL  scanned=${totalScan}  deleted=${totalDel}`);
  console.log('='.repeat(70));
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`V50 Phase 6 ProClinic residue cleanup (${APPLY ? '--apply' : 'dry-run'})`);
  console.log(`  session=${sessionTag} ts=${ts}`);

  await phase1_pcMirrors();
  await phase2_masterData();
  await phase3_brokerJobs();
  await phase4_proclinicSession();
  await phase5_auditDoc();

  printSummary();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  });
}
