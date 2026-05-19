#!/usr/bin/env node
// SYSTEM-WIDE BSA branch-scope stamping audit.
//
// For each be_* collection that BSA classifies as branch-scoped, check
// every doc for top-level branchId field. Report missing or empty.
//
// Branch-scoped collections per BSA Rule L:
//   be_treatments, be_sales, be_appointments, be_quotations, be_vendor_sales,
//   be_online_sales, be_sale_insurance_claims, be_stock_batches/orders/
//   movements/transfers/withdrawals/adjustments (locationId), be_products,
//   be_courses, be_product_groups, be_product_units, be_medical_instruments,
//   be_holidays, be_df_groups, be_df_staff_rates, be_bank_accounts,
//   be_expense_categories, be_expenses, be_staff_schedules, be_link_requests,
//   be_promotions/coupons/vouchers (with allBranches:true OR-merge),
//   be_recalls.
//
// Universal (skip): be_staff, be_doctors, be_customers, customer subcolls.
//
// READ-ONLY (Rule R).

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}
const env = loadEnv();
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();

// All branch-scoped collections that should carry top-level branchId.
// Stock movement collections use `locationId` (warehouse), so check both.
const BRANCH_SCOPED = [
  { col: 'be_treatments',          field: 'branchId' },
  { col: 'be_sales',               field: 'branchId' },
  { col: 'be_appointments',        field: 'branchId' },
  { col: 'be_deposits',            field: 'branchId' },
  { col: 'be_quotations',          field: 'branchId' },
  { col: 'be_vendor_sales',        field: 'branchId' },
  { col: 'be_online_sales',        field: 'branchId' },
  { col: 'be_sale_insurance_claims', field: 'branchId' },
  { col: 'be_products',            field: 'branchId' },
  { col: 'be_courses',             field: 'branchId' },
  { col: 'be_product_groups',      field: 'branchId' },
  { col: 'be_product_units',       field: 'branchId' },
  { col: 'be_medical_instruments', field: 'branchId' },
  { col: 'be_holidays',            field: 'branchId' },
  { col: 'be_df_groups',           field: 'branchId' },
  { col: 'be_df_staff_rates',      field: 'branchId' },
  { col: 'be_bank_accounts',       field: 'branchId' },
  { col: 'be_expense_categories',  field: 'branchId' },
  { col: 'be_expenses',            field: 'branchId' },
  { col: 'be_staff_schedules',     field: 'branchId' },
  { col: 'be_link_requests',       field: 'branchId' },
  { col: 'be_recalls',             field: 'branchId' },
  { col: 'be_exam_rooms',          field: 'branchId' },
  { col: 'be_stock_batches',       field: 'branchId' },
  { col: 'be_stock_orders',        field: 'branchId' },
  { col: 'be_stock_movements',     field: 'branchId' },
  { col: 'be_stock_adjustments',   field: 'branchId' },
  { col: 'be_stock_transfers',     field: 'fromBranchId' },
  { col: 'be_stock_withdrawals',   field: 'branchId' },
];

// Marketing OR-merge — branchId may be present OR allBranches:true
const OR_MERGE = ['be_promotions', 'be_coupons', 'be_vouchers'];

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  BSA branch-scope stamping audit (Rule R, read-only)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const summary = [];

  for (const { col, field } of BRANCH_SCOPED) {
    try {
      const snap = await db.collection(`${BASE}/${col}`).get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (docs.length === 0) {
        summary.push({ col, total: 0, missing: 0, samples: [] });
        continue;
      }
      const missing = docs.filter(d => {
        const v = d[field];
        return v == null || v === '';
      });
      const samples = missing.slice(0, 3).map(d => ({ id: d.id, hasField: field in d, value: d[field] }));
      summary.push({ col, total: docs.length, missing: missing.length, field, samples });
    } catch (e) {
      summary.push({ col, total: -1, missing: -1, error: e.message });
    }
  }

  // Marketing OR-merge
  for (const col of OR_MERGE) {
    try {
      const snap = await db.collection(`${BASE}/${col}`).get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (docs.length === 0) {
        summary.push({ col, total: 0, missing: 0, mode: 'OR-merge' });
        continue;
      }
      // Missing = neither branchId nor allBranches:true
      const missing = docs.filter(d => {
        const hasBranch = d.branchId && d.branchId.trim();
        const hasAllBranches = d.allBranches === true;
        return !hasBranch && !hasAllBranches;
      });
      summary.push({ col, total: docs.length, missing: missing.length, mode: 'OR-merge', samples: missing.slice(0, 3).map(d => ({ id: d.id, branchId: d.branchId, allBranches: d.allBranches })) });
    } catch (e) {
      summary.push({ col, total: -1, missing: -1, error: e.message });
    }
  }

  // Print tabular
  console.log('Collection                          Total  Missing  Field          Notes');
  console.log('─────────────────────────────────  ─────  ───────  ─────────────  ─────────────');
  for (const s of summary) {
    const col = s.col.padEnd(33);
    const total = String(s.total).padStart(5);
    const missing = String(s.missing).padStart(7);
    const field = (s.field || s.mode || '?').padEnd(14);
    const tag = s.missing > 0 && s.total > 0 ? '⚠ DESYNC' : (s.total === 0 ? '(empty)' : '✓ clean');
    console.log(`${col}  ${total}  ${missing}  ${field}  ${tag}`);
    if (s.samples && s.samples.length > 0) {
      s.samples.forEach(samp => console.log(`     sample: ${JSON.stringify(samp)}`));
    }
    if (s.error) console.log(`     ERROR: ${s.error}`);
  }

  const totalDesync = summary.reduce((sum, s) => sum + (s.missing > 0 ? s.missing : 0), 0);
  const collectionsWithDesync = summary.filter(s => s.missing > 0).length;
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  TOTAL DESYNC DOCS: ${totalDesync}  across ${collectionsWithDesync} collections`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
