// scripts/verify-v130-sale-created-by.mjs
// Rule Q L2 (READ-ONLY, real prod) — prove the V130 "ผู้ทำรายการ" READ chain on
// real be_sales: (1) report current createdById/createdByName population +
// createdBy "-" count, (2) prove the chain resolves a captured createdById via
// the REAL be_staff+be_doctors lookup, (3) prove the captured-name snapshot wins.
//
// HONEST SCOPE (Rule Q-honest): the WRITE-time capture (auth.currentUser → be_staff
// by firebaseUid → stamp) is client-auth-driven and cannot be replicated via the
// admin SDK here — it is source-grep + unit verified (tests/v130-sale-created-by.test.js)
// and L1-pending (user creates a sale while logged in post-deploy → ผู้ทำรายการ = themselves).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { aggregateSaleReport, buildSaleReportRow } from '../src/lib/saleReportAggregator.js';

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

  // listAllSellers-equivalent: be_staff + be_doctors → [{id, name}] (+id aliases).
  const lookup = [];
  for (const coll of ['be_staff', 'be_doctors']) {
    const snap = await db.collection(`${PREFIX}/${coll}`).get();
    for (const d of snap.docs) {
      const x = d.data();
      const name = String(x.name || `${x.firstName || ''} ${x.lastName || ''}`.trim() || '').trim();
      for (const key of [d.id, x.id, x.staffId, x.doctorId]) {
        if (key != null && key !== '') lookup.push({ id: String(key), name });
      }
    }
  }
  const sales = (await db.collection(`${PREFIX}/be_sales`).get()).docs.map(d => ({ id: d.id, ...d.data() }));

  const out = aggregateSaleReport(sales, { from: '', to: '', includeCancelled: true, sellers: lookup });
  const haveId   = sales.filter(s => s.createdById).length;
  const haveName = sales.filter(s => s.createdByName).length;
  const dash = out.rows.filter(r => r.createdBy === '-').length;

  console.log(`\nTotal be_sales: ${sales.length} · lookup entries: ${lookup.length}`);
  console.log(`createdById populated : ${haveId}/${sales.length}`);
  console.log(`createdByName populated: ${haveName}/${sales.length}`);
  console.log(`ผู้ทำรายการ (createdBy) "-" count: ${dash}/${out.rows.length}`);
  console.log('\nsample rows (createdBy / source):');
  for (const r of out.rows.slice(0, 8)) {
    console.log(`  ${String(r.saleId).padEnd(20)} ผู้ทำรายการ="${r.createdBy}"  source="${r.createdBySource || ''}"`);
  }

  // Chain proof against the REAL lookup: a captured staffId resolves; a captured
  // name snapshot wins. Pick a real (id,name) pair from the lookup.
  const known = lookup.find(l => l.name);
  let chainOk = true;
  if (known) {
    const rId   = buildSaleReportRow({ saleId: 'CHAIN-ID',   saleDate: '2026-05-28', billing: {}, payment: {}, createdById: known.id }, null, null, lookup);
    const rName = buildSaleReportRow({ saleId: 'CHAIN-NAME', saleDate: '2026-05-28', billing: {}, payment: {}, createdByName: 'หมอทดสอบ', createdById: known.id }, null, null, lookup);
    chainOk = rId.createdBy === known.name && rName.createdBy === 'หมอทดสอบ';
    console.log(`\nchain proof: createdById "${known.id}" → "${rId.createdBy}" (expect "${known.name}") | name-snapshot wins → "${rName.createdBy}" (expect "หมอทดสอบ")`);
  }

  console.log(`\n  RESULT: ${chainOk ? 'PASS ✅ — read chain resolves captured createdById/Name against real prod lookup' : 'FAIL ❌ — chain did not resolve'}`);
  console.log('  NOTE: write-time capture (auth→be_staff) is L1-pending (user makes a sale logged-in post-deploy).');
  process.exit(chainOk ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
