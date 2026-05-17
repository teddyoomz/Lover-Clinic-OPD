#!/usr/bin/env node
// scripts/diag-v81fix1-branch-contents.mjs (Rule R read-only)
//
// User report 2026-05-17 EOD+3 LATE+3 (post V82-fix5):
//   "ฝากลบสาขา V81-fix1 Branch ด้วย มึงสร้างมาลองแล้วก็ไม่ลบ แล้วฝากดูว่ามี
//    ขยะอะไรในสาขานี้ที่สร้างมาก็ลบไปด้วย เคลียให้สะอาด"
//
// Branch ID = TEST-V81-TS-BR-1778958484080 (per earlier diag)
//
// Goal: Find ALL docs (across all collections) that reference this branchId
// OR that have the TEST-V81-TS- prefix, so we can clean them up + delete the
// branch doc itself.

import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = ['artifacts', APP_ID, 'public', 'data'];
const V81_BRANCH_ID = 'TEST-V81-TS-BR-1778958484080';

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
  initializeApp({
    credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: pk }),
  });
  return getFirestore();
}

function col(db, name) {
  let ref = db;
  for (const seg of BASE) ref = ref.collection ? ref.collection(seg) : ref.doc(seg);
  return ref.collection(name);
}

// Scan ALL branch-scoped collections + collections that might contain
// TEST-V81-TS- prefixed doc IDs.
const COLLECTIONS_TO_SCAN = [
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
  'be_recalls', 'be_admin_audit',
];

async function main() {
  const db = initAdmin();

  console.log(`\n=== Scanning for V81-fix1 Branch artifacts ===\n`);
  console.log(`Target branchId: ${V81_BRANCH_ID}\n`);

  let totalByBranch = 0;
  let totalByPrefix = 0;
  const findings = [];

  for (const colName of COLLECTIONS_TO_SCAN) {
    try {
      const snap = await col(db, colName).get();
      const matches = [];
      snap.forEach(d => {
        const data = d.data();
        const matchByBranch = data.branchId === V81_BRANCH_ID;
        const matchByPrefix = d.id.startsWith('TEST-V81-TS-') || d.id.startsWith('TEST-V81-');
        if (matchByBranch || matchByPrefix) {
          matches.push({ id: d.id, byBranch: matchByBranch, byPrefix: matchByPrefix });
          if (matchByBranch) totalByBranch++;
          if (matchByPrefix && !matchByBranch) totalByPrefix++;
        }
      });
      if (matches.length > 0) {
        findings.push({ collection: colName, count: matches.length, sample: matches.slice(0, 5), all: matches });
        console.log(`[${colName}] ${matches.length} match(es)`);
        matches.slice(0, 5).forEach(m => {
          const tags = [m.byBranch ? 'by-branch' : null, m.byPrefix ? 'by-prefix' : null].filter(Boolean).join('+');
          console.log(`  ${m.id}  (${tags})`);
        });
        if (matches.length > 5) console.log(`  ... +${matches.length - 5} more`);
      }
    } catch (e) {
      console.log(`[${colName}] ERROR — ${e.message}`);
    }
  }

  // Branch doc itself
  console.log(`\n--- Branch doc be_branches/${V81_BRANCH_ID} ---`);
  const branchDoc = await col(db, 'be_branches').doc(V81_BRANCH_ID).get();
  if (branchDoc.exists) {
    const d = branchDoc.data();
    console.log(`  EXISTS — name: ${d.name || d.branchName}, status: ${d.status || '(none)'}`);
  } else {
    console.log(`  NOT FOUND`);
  }

  // Storage scan (V81 backups path)
  console.log(`\n--- Storage backups/whole-system/ + per-branch ---`);
  console.log(`  (storage scan deferred — check Firebase Console manually OR add to cleanup script)`);

  console.log(`\n=== SUMMARY ===`);
  console.log(`Findings across ${findings.length} collection(s)`);
  console.log(`  by branchId match: ${totalByBranch}`);
  console.log(`  by TEST-V81- prefix (not in branch): ${totalByPrefix}`);
  console.log(`  + 1 branch doc (be_branches/${V81_BRANCH_ID})`);
  console.log(`\n=== DONE — read-only ===\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e); process.exit(1); });
}
