// scripts/diag-revenue-deposit-reconcile.mjs — Rule R (READ-ONLY, real prod)
// User: reports-revenue หักมัดจำ shows fractions (4,941.35 / 1,437.11 / 621.54)
// "I never had fractions like this — where from? and are the other amounts right?"
// Checks: (1) are raw billing.depositApplied values fractional or round?
//         (2) does the report CONSERVE deposit (Σ report == Σ real)?
//         (3) DENOMINATOR bug — deposit split across COURSE lines only; if a sale
//             also has products/promos/meds, courses over-absorb the deposit.
//         (4) reconcile lineTotal + paidAmount to source (ตรงตามที่ขาย).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { aggregateRevenueByProcedure } from '../src/lib/revenueAnalysisAggregator.js';
import { proportional, roundTHB, assertReconcile } from '../src/lib/reportsUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
function loadEnv(){const e={};for(const l of readFileSync('.env.local.prod','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].replace(/^"|"$/g,'');}return e;}

const sum = (a) => a.reduce((s,v)=>s+v,0);
const lineTotalOf = (it) => { const lt=Number(it?.lineTotal); if(Number.isFinite(lt)&&lt>0) return lt; return (Number(it?.qty)||0)*(Number(it?.unitPrice||it?.price)||0); };
const isFrac = (n) => Math.abs(n - Math.round(n)) > 0.005;

async function main(){
  const env=loadEnv();
  if(!getApps().length) initializeApp({credential:cert({projectId:APP_ID,clientEmail:env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:(env.FIREBASE_ADMIN_PRIVATE_KEY||'').split('\\n').join('\n')})});
  const db=getFirestore();
  const courses=(await db.collection(`${PREFIX}/be_courses`).get()).docs.map(d=>({id:d.id,...d.data()}));
  const sales=(await db.collection(`${PREFIX}/be_sales`).get()).docs.map(d=>({id:d.id,...d.data()}));
  const live=sales.filter(s=>s && s.status!=='cancelled');
  console.log(`be_sales: ${sales.length} (non-cancelled ${live.length}), be_courses: ${courses.length}`);

  // (1)+(3) per-sale: raw deposit, course total, NON-course total, fractional? mixed?
  let depSales=0, rawFractional=0, mixedCourseAndOther=0, depOnNonCourseOnly=0;
  let sumRawDepCourseSales=0, sumRawDepAll=0;
  const samples=[];
  for(const s of live){
    const it=s.items||{};
    const courseLines=(Array.isArray(it.courses)?it.courses:[]).map(lineTotalOf);
    const courseTot=sum(courseLines);
    const otherTot=['products','promotions','medications','vouchers','coupons'].reduce((t,k)=>{
      const arr=Array.isArray(it[k])?it[k]:[]; return t + sum(arr.map(lineTotalOf)); },0);
    const dep=Number(s?.billing?.depositApplied)||0;
    if(dep>0){
      depSales++; sumRawDepAll+=dep;
      if(isFrac(dep)) rawFractional++;
      if(courseTot>0){
        sumRawDepCourseSales+=dep;
        if(otherTot>0){ mixedCourseAndOther++; }
      } else { depOnNonCourseOnly++; }
      if(samples.length<12 && courseTot>0){
        const split=proportional(courseLines, roundTHB(dep));
        samples.push({saleId:s.saleId||s.id, saleDate:s.saleDate, rawDeposit:dep, rawDepFractional:isFrac(dep),
          courseLines, courseTot:roundTHB(courseTot), otherTot:roundTHB(otherTot), hasOther:otherTot>0,
          proportionalSplit:split, splitSum:roundTHB(sum(split))});
      }
    }
  }
  console.log(`\n--- (1) RAW deposit values ---`);
  console.log(`sales w/ depositApplied>0: ${depSales} · of those raw value is FRACTIONAL: ${rawFractional} (${rawFractional===0?'ALL ROUND — fractions are report-manufactured':'some raw fractional'})`);
  console.log(`\n--- (3) DENOMINATOR / over-attribution ---`);
  console.log(`deposit-sales that ALSO have non-course items (courses over-absorb deposit): ${mixedCourseAndOther}`);
  console.log(`deposit-sales with NO course items (deposit not in this report at all): ${depOnNonCourseOnly}`);

  console.log(`\n--- sample deposit sales (raw → proportional split across course lines) ---`);
  for(const x of samples) console.log(' ', JSON.stringify(x));

  // (2)+(4) reconcile the REAL aggregator output to source
  const out=aggregateRevenueByProcedure(sales, courses, {});
  // source truth: Σ course lineTotals over non-cancelled sales
  let srcLineTotal=0, srcDepCourseSales=0;
  for(const s of live){
    const cl=(Array.isArray(s.items?.courses)?s.items.courses:[]).map(lineTotalOf);
    srcLineTotal+=sum(cl);
    if(sum(cl)>0) srcDepCourseSales+=Number(s?.billing?.depositApplied)||0;
  }
  console.log(`\n--- (2)+(4) RECONCILE report vs source ---`);
  console.log(`ยอดรวม(lineTotal):  report ${roundTHB(out.totals.lineTotal).toLocaleString()} vs source ${roundTHB(srcLineTotal).toLocaleString()}  diff ${roundTHB(out.totals.lineTotal-srcLineTotal)}`);
  console.log(`หักมัดจำ(deposit):  report ${roundTHB(out.totals.depositApplied).toLocaleString()} vs source(course-sales) ${roundTHB(srcDepCourseSales).toLocaleString()}  diff ${roundTHB(out.totals.depositApplied-srcDepCourseSales)}`);
  console.log(`ยอดชำระเงิน(paid):  report ${roundTHB(out.totals.paidAmount).toLocaleString()}  (= lineTotal - dep - wallet - refund)`);
  console.log(`internal row→totals reconcile (AR5):`, assertReconcile(out).length===0?'CLEAN ✓':assertReconcile(out));
  process.exit(0);
}
if(process.argv[1]===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e);process.exit(1);});
