// scripts/diag-money-reconciliation-l2.mjs — Rule Q L2 for the reconciliation core.
//
// READ-ONLY (Rule R standing auth). Runs the EXACT cron code path
// (sweepMoneyReconciliation → buildAdminFetchers → reconcileSales SSOT core)
// against REAL prod sales for one or more recent dates. No writes — the cron's
// audit-doc write is NOT invoked here (we import the sweep, not the handler).
//
// Usage: node scripts/diag-money-reconciliation-l2.mjs [YYYY-MM-DD ...]
//        (defaults: scans backwards from yesterday until it finds a date with sales, max 30 days)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sweepMoneyReconciliation } from '../api/cron/money-reconciliation-sweep.js';

const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  const p = '.env.local.prod';
  if (!existsSync(p)) throw new Error('.env.local.prod missing — vercel env pull first (Rule R)');
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function bkkDateISO(offsetDays) {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

async function main() {
  loadEnv();
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
      }),
    });
  }
  const db = getFirestore();

  let dates = process.argv.slice(2).filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  if (!dates.length) {
    // find the most recent 3 dates that actually have sales (max 30-day lookback)
    dates = [];
    for (let i = 1; i <= 30 && dates.length < 3; i++) {
      const iso = bkkDateISO(i);
      const snap = await db.collection(`artifacts/${APP_ID}/public/data/be_sales`)
        .where('saleDate', '==', iso).limit(1).get();
      if (!snap.empty) dates.push(iso);
    }
    if (!dates.length) { console.log('no sales found in the last 30 days'); return; }
  }

  let totalChecked = 0, totalIssues = 0;
  for (const dateISO of dates) {
    const { summary, results } = await sweepMoneyReconciliation({ db, dateISO });
    totalChecked += summary.checked; totalIssues += summary.discrepancyCount;
    console.log(`\n=== ${dateISO} — ตรวจ ${summary.checked} ใบ · ครบ ${summary.ok} · ไม่ครบ ${summary.discrepancyCount} · ยกเลิก ${summary.cancelledChecked} ===`);
    for (const r of results) {
      const ch = r.channels;
      const line = `${r.invoiceNo}${r.cancelled ? ' (ยกเลิก)' : ''} | มัดจำ:${ch.deposit.verdict}(${ch.deposit.found}/${ch.deposit.expected}) wallet:${ch.wallet.verdict}(${ch.wallet.found}/${ch.wallet.expected}) แต้ม:${ch.points.verdict}(${ch.points.net}) คอร์ส:${ch.courses.verdict}(${ch.courses.linked}/${ch.courses.expected}) mvts:${ch.stock.movements}`;
      console.log((r.hasDiscrepancy ? '  ❌ ' : '  ✓ ') + line);
      for (const d of r.discrepancies) console.log('      → ' + d);
    }
  }
  console.log(`\nTOTAL: checked ${totalChecked} · discrepancies ${totalIssues}`);
  console.log('L2 PASS criteria: real compound queries executed, verdicts computed on real data, zero writes.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
