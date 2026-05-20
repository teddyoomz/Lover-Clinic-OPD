// scripts/diag-sale-customer-name.mjs
// Rule R (read-only diag) — V66 real-data introspection for the SaleTab "-" bug.
// Reads recent be_sales + resolves each customer to see whether sale.customerName
// is empty at write time (Layer A) and/or whether the customer is resolvable
// (Layer B — the V105 fallback would work IF the customers array were loaded).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCustomerDisplayName, resolveCustomerHN } from '../src/lib/customerDisplayName.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const txt = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

async function main() {
  const env = loadEnv();
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();
  const salesSnap = await db.collection(`${PREFIX}/be_sales`).get();
  const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(s => String(s.saleId || s.id).startsWith('INV-20260520'))
    .sort((a, b) => String(b.saleId || b.id).localeCompare(String(a.saleId || a.id)))
    .slice(0, 12);

  console.log(`\n${'saleId'.padEnd(20)} ${'rawName'.padEnd(22)} ${'rawHN'.padEnd(13)} custId  | resolvable?`);
  console.log('-'.repeat(110));
  for (const s of sales) {
    const rawName = s.customerName == null ? '<undef>' : (s.customerName === '' ? '<empty>' : s.customerName);
    const rawHN = s.customerHN == null ? '<undef>' : (s.customerHN === '' ? '<empty>' : s.customerHN);
    let resolved = '(no customerId)';
    if (s.customerId) {
      const cSnap = await db.doc(`${PREFIX}/be_customers/${s.customerId}`).get();
      if (!cSnap.exists) resolved = `CUSTOMER MISSING (${s.customerId})`;
      else {
        const c = cSnap.data();
        const rn = resolveCustomerDisplayName(c);
        const rh = resolveCustomerHN(c);
        resolved = `name="${rn || '<EMPTY>'}" hn="${rh || '<empty>'}"`;
      }
    }
    const flag = (rawName === '<undef>' || rawName === '<empty>') ? ' ← "-" ON LIST' : '';
    console.log(`${String(s.saleId || s.id).padEnd(20)} ${String(rawName).slice(0, 22).padEnd(22)} ${String(rawHN).slice(0, 13).padEnd(13)} ${String(s.customerId || '-').padEnd(7)} | ${resolved}${flag}`);
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
