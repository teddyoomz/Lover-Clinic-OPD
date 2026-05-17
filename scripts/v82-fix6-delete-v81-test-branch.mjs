#!/usr/bin/env node
// scripts/v82-fix6-delete-v81-test-branch.mjs
//
// V82-fix6 (2026-05-17 EOD+3 LATE+3) — narrow data-fix to delete the
// V81-fix1 Branch (TEST-V81-TS-BR-1778958484080) + any orphan artifacts.
//
// User report (verbatim):
//   "ฝากลบสาขาในภาพที่ 2 ด้วย มึงสร้างมาลองแล้วก็ไม่ลบ แล้วฝากดูว่ามีขยะ
//    อะไรในสาขานี้ที่สร้างมาก็ลบไปด้วย เคลียให้สะอาด"
//
// Pre-flight diag (`scripts/diag-v81fix1-branch-contents.mjs`) found:
//   - branch doc be_branches/TEST-V81-TS-BR-1778958484080 — EXISTS
//   - 0 docs in ANY collection referencing this branchId
//   - 0 docs with TEST-V81-* prefix in any collection
//   - 1 audit doc + storage backups exist but those are LEGITIMATE V81
//     historical backups, not orphan test artifacts — preserved.
//
// This script:
//   1. Re-verifies pre-flight diag (defensive — refuses delete if scope grew)
//   2. Deletes the branch doc
//   3. Emits audit doc
//
// USAGE:
//   node scripts/v82-fix6-delete-v81-test-branch.mjs           # dry-run
//   node scripts/v82-fix6-delete-v81-test-branch.mjs --apply   # commit

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = ['artifacts', APP_ID, 'public', 'data'];
const V81_BRANCH_ID = 'TEST-V81-TS-BR-1778958484080';
const EXPECTED_BRANCH_NAME = 'V81-fix1 Branch';

// Branch-scoped + test-id-bearing collections (mirror diag-v81fix1-branch-contents.mjs)
const SCOPE_COLLECTIONS = [
  'opd_sessions', 'be_customers', 'be_appointments', 'be_deposits',
  'be_treatments', 'be_sales', 'be_quotations', 'be_vendor_sales',
  'be_online_sales', 'be_sale_insurance_claims', 'be_stock_batches',
  'be_stock_orders', 'be_stock_movements', 'be_stock_transfers',
  'be_stock_withdrawals', 'be_stock_adjustments', 'be_products',
  'be_courses', 'be_product_groups', 'be_product_units',
  'be_medical_instruments', 'be_holidays', 'be_df_groups',
  'be_df_staff_rates', 'be_bank_accounts', 'be_expense_categories',
  'be_expenses', 'be_staff_schedules', 'be_link_requests',
  'be_promotions', 'be_coupons', 'be_vouchers', 'be_exam_rooms',
  'be_recalls',
];

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function initAdmin() {
  if (getApps().length) return getFirestore();
  const env = loadEnv();
  const pk = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: pk }) });
  return getFirestore();
}

function col(db, name) {
  let ref = db;
  for (const seg of BASE) ref = ref.collection ? ref.collection(seg) : ref.doc(seg);
  return ref.collection(name);
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  console.log(`\n=== V82-fix6 delete V81-fix1 Branch (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  const db = initAdmin();
  const branchRef = col(db, 'be_branches').doc(V81_BRANCH_ID);

  // Defensive re-verify: ensure branch exists + name matches expected
  const branchSnap = await branchRef.get();
  if (!branchSnap.exists) {
    console.log('Branch already deleted (idempotent). Exiting.');
    return;
  }
  const branchData = branchSnap.data();
  const observedName = branchData.name || branchData.branchName || '';
  console.log(`Found branch: name="${observedName}" status="${branchData.status || '(none)'}"`);
  if (observedName !== EXPECTED_BRANCH_NAME) {
    throw new Error(`Name guard FAILED — observed "${observedName}", expected "${EXPECTED_BRANCH_NAME}"`);
  }

  // Defensive re-verify: NO orphan docs reference this branchId
  console.log(`\nVerifying NO orphan docs reference this branchId across ${SCOPE_COLLECTIONS.length} collections…`);
  let orphanCount = 0;
  const orphansByCol = {};
  for (const colName of SCOPE_COLLECTIONS) {
    try {
      const snap = await col(db, colName).get();
      const matches = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.branchId === V81_BRANCH_ID) matches.push(d.id);
      });
      if (matches.length > 0) {
        orphanCount += matches.length;
        orphansByCol[colName] = matches;
      }
    } catch (e) {
      console.warn(`[${colName}] scan error: ${e.message}`);
    }
  }

  if (orphanCount > 0) {
    console.log(`\n❌ ${orphanCount} orphan doc(s) FOUND across ${Object.keys(orphansByCol).length} collection(s):`);
    Object.entries(orphansByCol).forEach(([c, ids]) => {
      console.log(`  ${c}: ${ids.length} — ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '...' : ''}`);
    });
    console.log('\nREFUSING TO DELETE — clean up orphans first (or extend this script to cascade-delete).');
    throw new Error('orphan_docs_present');
  }
  console.log('✓ NO orphan docs found.');

  // Also verify NO docs with TEST-V81-* prefix exist (separate concern from branchId)
  console.log(`\nVerifying NO TEST-V81-* prefixed docs across ${SCOPE_COLLECTIONS.length} collections…`);
  let prefixCount = 0;
  const prefixesByCol = {};
  for (const colName of SCOPE_COLLECTIONS) {
    try {
      const snap = await col(db, colName).get();
      const matches = [];
      snap.forEach(d => {
        if (d.id.startsWith('TEST-V81-') || d.id.startsWith('TEST-V81-TS-')) matches.push(d.id);
      });
      if (matches.length > 0) {
        prefixCount += matches.length;
        prefixesByCol[colName] = matches;
      }
    } catch (e) {
      console.warn(`[${colName}] scan error: ${e.message}`);
    }
  }
  if (prefixCount > 0) {
    console.log(`\nℹ️ ${prefixCount} TEST-V81-* prefixed doc(s) found across ${Object.keys(prefixesByCol).length} collection(s):`);
    Object.entries(prefixesByCol).forEach(([c, ids]) => {
      console.log(`  ${c}: ${ids.length} — ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '...' : ''}`);
    });
    console.log('\nThese are likely TEST fixtures from V81 verification scripts. NOT auto-deleted here.');
    console.log('Re-run with custom cascade option OR delete manually if confirmed orphan.');
  } else {
    console.log('✓ NO TEST-V81-* prefixed docs found.');
  }

  if (!APPLY) {
    console.log('\n(dry-run — branch doc NOT deleted. Re-run with --apply to commit.)');
    return;
  }

  // Apply: delete branch doc + audit
  const batch = db.batch();
  batch.delete(branchRef);
  const auditId = `v82-fix6-delete-v81-test-branch-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  batch.set(col(db, 'be_admin_audit').doc(auditId), {
    op: 'v82-fix6-delete-v81-test-branch',
    deleted: {
      collection: 'be_branches',
      id: V81_BRANCH_ID,
      name: observedName,
      status: branchData.status || null,
    },
    orphansFound: 0,
    prefixedDocsFound: prefixCount,
    appliedAt: FieldValue.serverTimestamp(),
    notes: 'V82-fix6 narrow data-fix — delete V81-fix1 Branch (test artifact from V81 backup verification 2026-05-16). Root cause of "login empty skeleton" bug: newest-createdAt branch → first-login default → 0 data.',
  });
  await batch.commit();
  console.log(`\n✅ Branch ${V81_BRANCH_ID} (${observedName}) DELETED + audit doc be_admin_audit/${auditId}`);

  // Post-apply verify
  const postSnap = await branchRef.get();
  console.log(`\n--- POST-APPLY VERIFY ---`);
  console.log(`  branch ${V81_BRANCH_ID} exists? ${postSnap.exists ? '❌ STILL THERE' : '✓ deleted'}`);

  console.log('\n=== DONE ===\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e); process.exit(1); });
}
