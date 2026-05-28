// scripts/diag-hn-resolution.mjs — Rule R (READ-ONLY, real prod)
// Investigate WHY some reports-sale rows + CustomerDetailView show blank HN.
// Compares the aggregator's hardcoded `proClinicHN || hn` vs the canonical
// resolveCustomerHN, and shows where HN actually lives on customer docs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCustomerHN } from '../src/lib/customerDisplayName.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const env = {};
  for (const line of readFileSync('.env.local.prod', 'utf8').split('\n')) {
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

  const custSnap = await db.collection(`${PREFIX}/be_customers`).get();
  const custMap = new Map();
  for (const d of custSnap.docs) custMap.set(d.id, { id: d.id, ...d.data() });

  // Where does HN live across customer docs?
  const fieldHits = { proClinicHN:0, hn:0, hn_no:0, HN:0, 'pd.hn':0, 'pd.HN':0, 'pd.proClinicHN':0, idIsLC:0, none:0 };
  for (const c of custMap.values()) {
    const pd = c.patientData || {};
    if (c.proClinicHN) fieldHits.proClinicHN++;
    if (c.hn) fieldHits.hn++;
    if (c.hn_no) fieldHits.hn_no++;
    if (c.HN) fieldHits.HN++;
    if (pd.hn) fieldHits['pd.hn']++;
    if (pd.HN) fieldHits['pd.HN']++;
    if (pd.proClinicHN) fieldHits['pd.proClinicHN']++;
    if (/^LC-/.test(c.id)) fieldHits.idIsLC++;
    if (!resolveCustomerHN(c) && !c.proClinicHN) fieldHits.none++;
  }
  console.log(`\nbe_customers: ${custMap.size}`);
  console.log('HN field presence across customers:', fieldHits);

  // sample 6 customers' HN-ish fields
  console.log('\nsample customers (id | proClinicHN | hn | hn_no | pd.hn | resolveCustomerHN):');
  let n=0;
  for (const c of custMap.values()) {
    if (n++>=6) break;
    const pd=c.patientData||{};
    console.log(`  ${c.id} | pcHN=${c.proClinicHN||''} | hn=${c.hn||''} | hn_no=${c.hn_no||''} | pd.hn=${pd.hn||''} | resolve=${resolveCustomerHN(c)}`);
  }

  // Sales: aggregator (proClinicHN||hn) vs canonical, count blanks + fixes
  const sales = (await db.collection(`${PREFIX}/be_sales`).get()).docs.map(d => ({ id:d.id, ...d.data() }));
  let aggBlank=0, canonBlank=0, fixedByCanon=0, noCid=0, cidNoCust=0;
  const blanksSample=[];
  for (const s of sales) {
    const cid = s.customerId ? String(s.customerId) : '';
    const c = cid ? custMap.get(cid) : null;
    const saleHN = (s.customerHN||'').trim();
    const aggHN = saleHN || (c ? (c.proClinicHN || c.hn || '') : '');
    const canonHN = saleHN || (c ? resolveCustomerHN(c) : '');
    if (!aggHN) aggBlank++;
    if (!canonHN) canonBlank++;
    if (!aggHN && canonHN) fixedByCanon++;
    if (!aggHN) {
      if (!cid) noCid++;
      else if (!c) cidNoCust++;
      if (blanksSample.length<10) blanksSample.push({ saleId:s.saleId||s.id, cid, hasCust:!!c, saleHN, aggHN, canonHN, custFields: c?`pcHN=${c.proClinicHN||''},hn=${c.hn||''},pd.hn=${c.patientData?.hn||''}`:'(no cust)' });
    }
  }
  console.log(`\nbe_sales: ${sales.length}`);
  console.log(`report HN blank (current aggregator proClinicHN||hn): ${aggBlank}`);
  console.log(`report HN blank (canonical resolveCustomerHN)       : ${canonBlank}`);
  console.log(`FIXED by switching to canonical resolver            : ${fixedByCanon}`);
  console.log(`  of the agg-blank: no customerId=${noCid}, cid-but-no-custDoc=${cidNoCust}`);
  console.log('\nagg-blank sample:');
  for (const b of blanksSample) console.log('  ', JSON.stringify(b));

  // Task D: appointments carry customerId?
  const appts = (await db.collection(`${PREFIX}/be_appointments`).get()).docs.map(d=>d.data());
  const withCid = appts.filter(a=>a.customerId).length;
  console.log(`\nbe_appointments: ${appts.length} · with customerId (linked, clickable): ${withCid} · without (pick-later/walk-in): ${appts.length-withCid}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
