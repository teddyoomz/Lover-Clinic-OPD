#!/usr/bin/env node
// One-shot pre-test wipe: clear นครราชสีมา to 0 docs so v41 test starts clean.
// User imported 303 products via UI Copy button between V40 wipe and now.
// User authorized "wipe + re-test from scratch" so we clean these out.
// After v41 test completes, user will re-run the UI copy for real production seed.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const NAKHON = 'BR-1777873556815-26df6480';
const ALL_COLS = [
  'be_products', 'be_courses', 'be_product_groups', 'be_product_units',
  'be_product_unit_groups', 'be_exam_rooms', 'be_medical_instruments',
  'be_holidays', 'be_df_groups', 'be_df_staff_rates', 'be_promotions',
  'be_coupons', 'be_vouchers', 'be_bank_accounts', 'be_expense_categories',
  'be_staff_schedules',
  'be_treatments', 'be_sales', 'be_appointments', 'be_quotations',
  'be_vendor_sales', 'be_online_sales', 'be_sale_insurance_claims',
  'be_deposits', 'be_link_requests', 'be_expenses',
  'be_stock_batches', 'be_stock_movements', 'be_stock_orders',
  'be_stock_transfers', 'be_stock_withdrawals', 'be_stock_adjustments',
];

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const APPLY = args.apply === true || args.apply === 'true';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue;
  let val = m[2]; if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();
function dataCol(name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}

async function main() {
  console.log(`═══ Pre-test wipe of นครราชสีมา (${APPLY ? 'APPLY' : 'DRY-RUN'}) ═══`);
  let total = 0;
  for (const col of ALL_COLS) {
    const snap = await dataCol(col).where('branchId', '==', NAKHON).get();
    if (snap.size === 0) continue;
    if (APPLY) {
      // 400 batch limit — 303 fits in one batch but be safe with chunking
      for (let i = 0; i < snap.docs.length; i += 400) {
        const slice = snap.docs.slice(i, i + 400);
        const batch = db.batch();
        for (const d of slice) batch.delete(d.ref);
        await batch.commit();
      }
      console.log(`  ${col.padEnd(30)} deleted ${snap.size}`);
    } else {
      console.log(`  ${col.padEnd(30)} WOULD delete ${snap.size}`);
    }
    total += snap.size;
  }

  // Audit doc
  if (APPLY && total > 0) {
    const auditId = `pretest-wipe-nakhon-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await dataCol('be_admin_audit').doc(auditId).set({
      action: 'pretest-wipe',
      branchId: NAKHON,
      deletedTotal: total,
      reason: 'Clear UI-copied products before v41 cross-branch-import test (user-authorized: option C wipe-and-retest)',
      executedBy: 'cli:diag-wipe-nakhon-test-prep',
      executedAt: new Date().toISOString(),
    });
    console.log(`\n✓ Wiped ${total} docs from นครราชสีมา`);
    console.log(`✓ Audit: be_admin_audit/${auditId}`);
  } else if (APPLY) {
    console.log(`\n✓ Already empty — no-op`);
  } else {
    console.log(`\nWOULD wipe ${total} docs total. Re-run with --apply.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(99); });
}
