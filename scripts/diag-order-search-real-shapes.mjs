// Rule R diag (READ-ONLY) — exercise the V159 order search/summary against REAL
// prod orders. Flags item shapes that would make the search filter or
// formatOrderItemsSummary misbehave: empty productName (search-by-name misses it),
// non-numeric qty, or a summary that yields '' / NaN / undefined.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { formatOrderItemsSummary } from '../src/lib/orderItemsSummary.js';

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));
if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) loadDotEnv(path.resolve(process.cwd(), '.env.local'));
const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const app = initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) });
  return getFirestore(app);
}
const col = (db, n) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(n);

// mirror of OrderPanel/CentralStockOrderPanel filter (line-item productName match)
const filterMatch = (o, q) => (o.vendorName || '').toLowerCase().includes(q)
  || (o.orderId || '').toLowerCase().includes(q)
  || (Array.isArray(o.items) ? o.items : []).some(it => (it.productName || '').toLowerCase().includes(q));

async function audit(db, coll, label) {
  const snap = await col(db, coll).get();
  let emptyName = 0, badQty = 0, summaryBlank = 0, searchByNameMisses = 0, totalItems = 0;
  const samples = [];
  for (const doc of snap.docs) {
    const o = doc.data();
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) {
      totalItems++;
      const nm = typeof it.productName === 'string' ? it.productName.trim() : '';
      if (!nm) { emptyName++; if (samples.length < 8) samples.push(`${doc.id} EMPTY productName (productId=${it.productId})`); }
      const q = Number(it.qty);
      if (!Number.isFinite(q)) { badQty++; if (samples.length < 8) samples.push(`${doc.id} non-numeric qty=${JSON.stringify(it.qty)} (${nm})`); }
      // would search-by-(real)-name surface this order? (the filter matches productName)
      if (nm) { const hit = filterMatch(o, nm.toLowerCase()); if (!hit) { searchByNameMisses++; if (samples.length < 8) samples.push(`${doc.id} search "${nm}" does NOT match its own order`); } }
    }
    // summary must never be NaN/undefined; non-empty order → non-empty summary
    const s = formatOrderItemsSummary(items);
    const sMatch = formatOrderItemsSummary(items, { matchQuery: (items.find(i => i.productName)?.productName || '').slice(0, 4) });
    if (items.length > 0 && items.some(i => (i.productName || i.productId)) && (s === '' || /NaN|undefined/.test(s) || /NaN|undefined/.test(sMatch))) {
      summaryBlank++; if (samples.length < 8) samples.push(`${doc.id} summary anomaly: "${s}"`);
    }
  }
  console.log(`\n── ${label} (${coll}): ${snap.size} orders, ${totalItems} items ──`);
  console.log(`  empty productName items: ${emptyName}`);
  console.log(`  non-numeric qty items:   ${badQty}`);
  console.log(`  summary NaN/blank anomalies: ${summaryBlank}`);
  console.log(`  search-by-own-name MISSES (filter wouldn't surface): ${searchByNameMisses}`);
  if (samples.length) { console.log('  samples:'); samples.forEach(s => console.log('   ' + s)); }
  return emptyName + badQty + summaryBlank + searchByNameMisses;
}

async function main() {
  const db = getAdmin();
  let issues = 0;
  issues += await audit(db, 'be_stock_orders', 'BRANCH import orders');
  issues += await audit(db, 'be_central_stock_orders', 'CENTRAL import orders');
  console.log(`\n${issues === 0 ? '✓ no search/summary anomalies on real data' : `⚠ ${issues} anomalies found`}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
