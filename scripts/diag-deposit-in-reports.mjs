// scripts/diag-deposit-in-reports.mjs — Rule R / Rule Q L2 (READ-ONLY, real prod)
// Verifies the deposit-in-reports change against REAL Firestore:
//  (1) DOUBLE-COUNT GUARD — no real non-cancelled sale carries a 'มัดจำ' payment
//      channel (deposit is deducted before channels), so folding deposit-received
//      in cannot double-count. Expect: 0 sales with a มัดจำ channel.
//  (2) RECONCILE — aggregatePaymentSummary grand total == salesTotal + depositTotal,
//      and Σ rows.total == totals.total (AR5).
//  (3) VISIBILITY — how much deposit money the OLD report omitted (= depositTotal).
//  (4) SHAPE — real deposits carry paymentDate + paymentChannel; system remaining.
//  (5) BRANCH — per-branch aggregation isolates correctly.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { aggregatePaymentSummary, canonicalMethod, getMethodDocuments } from '../src/lib/paymentSummaryAggregator.js';
import { sumSystemRemainingDeposits, depositsReceivedInRange } from '../src/lib/depositReportUtils.js';
import { roundTHB } from '../src/lib/reportsUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
function loadEnv(){const e={};for(const l of readFileSync('.env.local.prod','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].replace(/^"|"$/g,'');}return e;}
const f = (n) => roundTHB(n).toLocaleString('en-US', { minimumFractionDigits: 2 });

// Mirror the aggregator's channelsOf so we can independently scan sales.
function channelsOf(sale){
  const ch = sale?.payment?.channels;
  if (Array.isArray(ch) && ch.length) return ch.map(c=>({method:canonicalMethod(c?.method||c?.paymentMethod||c?.name),amount:Number(c?.amount)||0})).filter(c=>c.amount>0);
  if (sale?.paymentMethod) return [{method:canonicalMethod(sale.paymentMethod),amount:Number(sale.paidAmount)||0}].filter(c=>c.amount>0);
  return [];
}

async function main(){
  const env=loadEnv();
  if(!getApps().length) initializeApp({credential:cert({projectId:APP_ID,clientEmail:env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:(env.FIREBASE_ADMIN_PRIVATE_KEY||'').split('\\n').join('\n')})});
  const db=getFirestore();
  const sales=(await db.collection(`${PREFIX}/be_sales`).get()).docs.map(d=>({id:d.id,...d.data()}));
  const deposits=(await db.collection(`${PREFIX}/be_deposits`).get()).docs.map(d=>({id:d.id,...d.data()}));
  const liveSales=sales.filter(s=>s&&s.status!=='cancelled');
  console.log(`be_sales: ${sales.length} (non-cancelled ${liveSales.length}) · be_deposits: ${deposits.length}`);

  // (1) DOUBLE-COUNT GUARD
  let salesWithMadjamChannel=0; const offenders=[];
  for(const s of liveSales){
    const m=channelsOf(s).filter(c=>c.method==='มัดจำ');
    if(m.length){ salesWithMadjamChannel++; if(offenders.length<5) offenders.push({saleId:s.saleId||s.id, channels:m}); }
  }
  console.log(`\n--- (1) DOUBLE-COUNT GUARD ---`);
  console.log(`real non-cancelled sales carrying a 'มัดจำ' payment channel: ${salesWithMadjamChannel}  ${salesWithMadjamChannel===0?'✓ (no double-count possible)':'✗ DOUBLE-COUNT RISK'}`);
  if(offenders.length) console.log('  offenders:', JSON.stringify(offenders));

  // (4) deposit shape
  const noPayDate=deposits.filter(d=>!d.paymentDate).length;
  const noChannel=deposits.filter(d=>!d.paymentChannel).length;
  const cancelled=deposits.filter(d=>d.status==='cancelled').length;
  console.log(`\n--- (4) DEPOSIT SHAPE ---`);
  console.log(`deposits missing paymentDate: ${noPayDate} · missing paymentChannel: ${noChannel} · cancelled: ${cancelled}`);
  console.log(`มัดจำคงเหลือในระบบ (Σ remaining active/partial): ฿${f(sumSystemRemainingDeposits(deposits))}`);

  // (2)+(3) ALL-TIME aggregate (from='' to='') — covers everything
  const out=aggregatePaymentSummary(sales, deposits, {});
  const rowSum=roundTHB(out.rows.reduce((s,r)=>s+r.total,0));
  console.log(`\n--- (2)+(3) ALL-TIME aggregate ---`);
  console.log('วิธีชำระ            ยอดขาย          มัดจำ           ยอดรวม          ใบเสร็จ');
  for(const r of out.rows){
    console.log(`  ${(r.method+'              ').slice(0,14)} ${f(r.salesAmount).padStart(13)} ${f(r.depositAmount).padStart(13)} ${f(r.total).padStart(13)}  ${String(r.docCount).padStart(5)}`);
  }
  console.log(`  ${'รวม'.padEnd(12)}   ${f(out.totals.salesAmount).padStart(13)} ${f(out.totals.depositAmount).padStart(13)} ${f(out.totals.total).padStart(13)}  ${String(out.totals.docCount).padStart(5)}`);
  console.log(`\nRECONCILE: Σrows.total ${f(rowSum)} == totals.total ${f(out.totals.total)}  diff ${roundTHB(rowSum-out.totals.total)}  ${Math.abs(rowSum-out.totals.total)<0.005?'✓':'✗'}`);
  console.log(`RECONCILE: sales ${f(out.totals.salesAmount)} + deposit ${f(out.totals.depositAmount)} == total ${f(out.totals.total)}  diff ${roundTHB(out.totals.salesAmount+out.totals.depositAmount-out.totals.total)}  ${Math.abs(out.totals.salesAmount+out.totals.depositAmount-out.totals.total)<0.005?'✓':'✗'}`);
  console.log(`VISIBILITY: deposit money now counted = ฿${f(out.totals.depositAmount)} (was ฿0.00 in the old report) · refundsTotal ฿${f(out.refundsTotal)}`);

  // drill-down smoke: documents for the top channel
  if(out.rows.length){
    const top=out.rows[0].method;
    const docs=getMethodDocuments(sales, deposits, top, {});
    const sCount=docs.filter(d=>d.type==='sale').length, dCount=docs.filter(d=>d.type==='deposit').length;
    console.log(`\n--- drill-down '${top}': ${docs.length} docs (${sCount} ใบขาย + ${dCount} ใบมัดจำ) — matches row.docCount ${out.rows[0].docCount}: ${docs.length===out.rows[0].docCount?'✓':'(note: docCount counts unique-sale-ids; drill lists per-doc)'} ---`);
  }

  // (5) per-branch isolation (use the branches present in deposits/sales)
  const branches=[...new Set([...sales.map(s=>s?.branchId),...deposits.map(d=>d?.branchId)].filter(Boolean))];
  console.log(`\n--- (5) PER-BRANCH (${branches.length} branches) ---`);
  let branchDepSum=0;
  for(const b of branches){
    const o=aggregatePaymentSummary(sales, deposits, { branchId:b });
    branchDepSum+=o.totals.depositAmount;
    console.log(`  ${b}: ขาย ฿${f(o.totals.salesAmount)} · มัดจำ ฿${f(o.totals.depositAmount)} · รวม ฿${f(o.totals.total)}`);
  }
  console.log(`  Σ per-branch มัดจำ ${f(branchDepSum)} vs all-branch มัดจำ ${f(out.totals.depositAmount)}  ${Math.abs(branchDepSum-out.totals.depositAmount)<0.5?'✓ (branch partition conserves)':'(diff — some docs lack branchId)'}`);

  console.log(`\nVERDICT: double-count-guard ${salesWithMadjamChannel===0?'PASS':'FAIL'} · reconcile ${Math.abs(rowSum-out.totals.total)<0.005?'PASS':'FAIL'} · deposit-visible ฿${f(out.totals.depositAmount)}`);
  process.exit(0);
}
if(process.argv[1]===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e);process.exit(1);});
