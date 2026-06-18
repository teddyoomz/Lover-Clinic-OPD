// Rule R diag — FULL data footprint of the dup-customer pairs across EVERY
// customer-attached collection (the first pass MISSED be_recalls — user caught it).
// Counts every collection that carries customerId so no data is lost on delete.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCustomerDisplayName } from '../src/lib/customerDisplayName.js';

const APP_ID = 'loverclinic-opd-4c39b';
const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
if (!getApps().length) initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = getFirestore();
const data = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const PAIRS = [
  { key: 'CITIZEN:3309901263672', a: 'LC-26000069', b: 'LC-26000074' },
  { key: 'CITIZEN:1309801395457', a: 'LC-26000123', b: 'LC-26000125' },
  { key: 'CITIZEN:1309900766135', a: 'LC-26000143', b: 'LC-26000155' },
];
// EVERY customer-attached collection (V74 cascade-FULL 16 + be_recalls).
const COLS = ['be_treatments', 'be_sales', 'be_deposits', 'be_customer_wallets', 'be_wallet_transactions', 'be_memberships', 'be_point_transactions', 'be_appointments', 'be_course_changes', 'be_link_requests', 'be_customer_link_tokens', 'be_quotations', 'be_vendor_sales', 'be_online_sales', 'be_sale_insurance_claims', 'be_recalls'];

async function footprint(cid) {
  const doc = await data().collection('be_customers').doc(cid).get();
  if (!doc.exists) return { cid, MISSING: true };
  const c = doc.data();
  const counts = {}; let total = 0;
  for (const col of COLS) { const s = await data().collection(col).where('customerId', '==', cid).get(); if (s.size) { counts[col] = s.size; total += s.size; } }
  const courses = Array.isArray(c.courses) ? c.courses.length : 0;
  return { cid, name: resolveCustomerDisplayName(c) || '(no name)', hn: c.hn_no || cid, branchId: c.branchId || '', createdAt: String(c.createdAt || c.clonedAt || '?').slice(0, 10), coursesOnDoc: courses, total: total + courses, counts };
}

async function main() {
  for (const p of PAIRS) {
    console.log(`\n═══ ${p.key} ═══`);
    for (const cid of [p.a, p.b]) {
      const f = await footprint(cid);
      if (f.MISSING) { console.log(`  ${cid}: MISSING`); continue; }
      console.log(`  ${cid} | ${f.name} | HN ${f.hn} | สาขา ${f.branchId} | ${f.createdAt} | courses ${f.coursesOnDoc} | TOTAL ${f.total} ${JSON.stringify(f.counts)}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
