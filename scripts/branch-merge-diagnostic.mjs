// ─── Branch coverage diagnostic — find where the data went ─────────────
// Phase BS regression check: every branch-spread collection grouped by
// distinct branchId values + counts. Reveals legacy untagged/'main' docs
// that the server-side branchId filter (Phase BS) is now hiding from
// the UI.

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

const app = initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);
const data = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const COLLECTIONS = [
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
];

async function main() {
  console.log('=== branchId coverage by collection ===\n');
  for (const col of COLLECTIONS) {
    try {
      const snap = await data.collection(col).get();
      const total = snap.size;
      if (total === 0) {
        console.log(`${col.padEnd(32)} TOTAL=0`);
        continue;
      }
      const buckets = new Map();
      for (const d of snap.docs) {
        const dt = d.data();
        const bid = (typeof dt.branchId === 'string') ? dt.branchId : (dt.branchId === undefined ? '<missing>' : `<non-string:${typeof dt.branchId}>`);
        const key = bid === '' ? '<empty-string>' : bid;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      console.log(`${col.padEnd(32)} TOTAL=${total}`);
      const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
      for (const [k, v] of sorted) {
        console.log(`  ${k.padEnd(40)} ${v}`);
      }
    } catch (e) {
      console.log(`${col.padEnd(32)} ERR: ${e.message}`);
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
