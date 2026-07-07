// scripts/diag-reports-new-l2.mjs — Rule Q L2 for the 3 NEW reports-home
// aggregators (alt-sales / outstanding / stock-alert) against REAL prod data.
// (reports-stock-movements reuses the proven MovementLogPanel — no aggregator.)
//
// READ-ONLY (Rule R standing auth). Runs the EXACT pure aggregators the tabs run,
// over real be_online_sales / be_vendor_sales / be_sales / be_stock_batches /
// be_products, then ADVERSARIALLY re-verifies each flagged row against its raw
// doc — this is the "could-fail" test that surfaces a wrong field or a
// false-positive (the reconciliation lesson) BEFORE ship. Exits non-zero on any
// invariant break.
//
// Usage: node scripts/diag-reports-new-l2.mjs

import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { aggregateAltSales } from '../src/lib/altSalesReportAggregator.js';
import { aggregateOutstanding } from '../src/lib/outstandingSalesAggregator.js';
import { aggregateStockAlert } from '../src/lib/stockAlertReportAggregator.js';
import { hasExpired } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const AUDIT_SALE_SOURCES = ['reduceRemaining', 'addRemaining', 'exchange', 'share'];

function loadEnv() {
  const p = '.env.local.prod';
  if (!existsSync(p)) throw new Error('.env.local.prod missing — vercel env pull first (Rule R)');
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const col = (db, name) => db.collection(`artifacts/${APP_ID}/public/data/${name}`);
const readAll = async (db, name) => (await col(db, name).get()).docs.map(d => ({ ...d.data(), id: d.id }));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const saleTotal = (s) => num(s?.billing?.netTotal ?? s?.billing?.grandTotal ?? s?.billing?.total ?? s?.total);
const salePaid = (s) => {
  const chans = s?.payment?.channels;
  if (Array.isArray(chans)) return Math.round(chans.filter(c => c && c.enabled !== false).reduce((t, c) => t + num(c.amount), 0) * 100) / 100;
  return num(s?.totalPaidAmount ?? s?.total_paid_amount ?? s?.payment?.totalPaid ?? s?.paidAmount);
};

let failures = 0;
const check = (cond, msg) => { if (!cond) { console.log(`  ❌ ${msg}`); failures++; } };

async function main() {
  loadEnv();
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();

  // ── 1) alt-sales ─────────────────────────────────────────────────────────
  console.log('\n=== alt-sales (online + vendor) ===');
  const [online, vendor] = await Promise.all([readAll(db, 'be_online_sales'), readAll(db, 'be_vendor_sales')]);
  const alt = aggregateAltSales(online, vendor);
  console.log(`  online ${alt.onlineRows.length} rows / realized ${alt.totals.online} · vendor ${alt.vendorRows.length} / realized ${alt.totals.vendor} · total ${alt.totals.total}`);
  check(alt.onlineRows.length === online.length && alt.vendorRows.length === vendor.length, 'row counts must equal doc counts');
  check(Number.isFinite(alt.totals.total), 'total must be finite');
  // realized total must equal Σ of realized rows re-derived from raw amount fields
  const onlineRealized = online.filter(o => ['paid', 'completed'].includes(o.status)).reduce((s, o) => s + num(o.amount), 0);
  const vendorRealized = vendor.filter(v => v.status === 'confirmed').reduce((s, v) => s + num(v.totalAmount), 0);
  check(Math.abs(alt.totals.total - Math.round((onlineRealized + vendorRealized) * 100) / 100) < 0.01, `alt total ${alt.totals.total} must equal raw realized Σ ${Math.round((onlineRealized + vendorRealized) * 100) / 100}`);

  // ── 2) outstanding ───────────────────────────────────────────────────────
  console.log('\n=== outstanding (ค้างชำระ) ===');
  const sales = await readAll(db, 'be_sales');
  const out = aggregateOutstanding(sales);
  console.log(`  ${out.totals.count} unpaid rows · outstanding ${out.totals.outstanding} (of ${sales.length} sales scanned)`);
  // ADVERSARIAL: every flagged row must genuinely be unpaid + not cancelled/refunded + not audit-source
  const rawById = new Map(sales.map(s => [s.id, s]));
  let badRows = 0;
  for (const r of out.rows) {
    const raw = rawById.get(r.id);
    const realOutstanding = Math.round((saleTotal(raw) - salePaid(raw)) * 100) / 100;
    if (!(realOutstanding > 0.005)) badRows++;
    if (raw?.status === 'cancelled' || raw?.status === 'refunded' || raw?.refunded) badRows++;
    if (AUDIT_SALE_SOURCES.includes(raw?.source)) badRows++;
  }
  check(badRows === 0, `${badRows} outstanding rows failed re-verification (false positive → the recon lesson)`);
  out.rows.slice(0, 5).forEach(r => console.log(`    ${r.ref} · ${r.customer} · total ${r.total} paid ${r.paid} → ค้าง ${r.outstanding} [${r.status}]`));

  // ── 3) stock-alert ───────────────────────────────────────────────────────
  console.log('\n=== stock-alert (expiry + low-stock) ===');
  const [batches, products] = await Promise.all([readAll(db, 'be_stock_batches'), readAll(db, 'be_products')]);
  const now = new Date();
  const sa = aggregateStockAlert(batches, products, now);
  console.log(`  expired ${sa.counts.expired} · nearExpiry ${sa.counts.nearExpiry} · lowStock ${sa.counts.lowStock} (of ${batches.length} batches / ${products.length} products)`);
  // ADVERSARIAL: expired rows must truly be past expiry; low-stock remaining must be ≤ threshold
  const batchById = new Map(batches.map(b => [b.id, b]));
  let badExpired = 0;
  for (const e of sa.expired) { const b = batchById.get(e.id); if (!hasExpired(b, now)) badExpired++; }
  check(badExpired === 0, `${badExpired} "expired" rows are not actually past expiresAt`);
  let badLow = 0;
  for (const l of sa.lowStock) { if (!(Number.isFinite(l.threshold) && l.threshold > 0 && l.remaining <= l.threshold)) badLow++; }
  check(badLow === 0, `${badLow} low-stock rows violate remaining ≤ threshold`);
  sa.expired.slice(0, 3).forEach(e => console.log(`    EXPIRED ${e.product} lot ${e.batch} qty ${e.remaining} exp ${e.expiresAt} (+${e.overdueDays}d)`));
  sa.nearExpiry.slice(0, 3).forEach(e => console.log(`    NEAR    ${e.product} lot ${e.batch} qty ${e.remaining} exp ${e.expiresAt} (${e.daysLeft}d)`));
  sa.lowStock.slice(0, 3).forEach(l => console.log(`    LOW     ${l.product} remaining ${l.remaining} ≤ threshold ${l.threshold}`));

  console.log(`\n${failures === 0 ? '✅ ALL L2 INVARIANTS HELD' : `❌ ${failures} INVARIANT(S) BROKEN`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
