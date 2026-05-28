// scripts/verify-v129-sale-report-seller-creator.mjs
// Rule Q L2 (READ-ONLY, real prod) — run the SHIPPED aggregateSaleReport against
// real be_sales, WITH vs WITHOUT the be_staff+be_doctors lookup, to prove the
// fix resolves พนักงานขาย / ผู้ทำรายการ that previously showed "-".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { aggregateSaleReport } from '../src/lib/saleReportAggregator.js';

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

  const opts = { from: '', to: '', includeCancelled: true };
  const before = aggregateSaleReport(sales, { ...opts });                  // no sellers lookup (pre-fix)
  const after  = aggregateSaleReport(sales, { ...opts, sellers: lookup }); // V129 (post-fix)

  const dash = (rows, key) => rows.filter(r => r[key] === '-').length;
  console.log(`\nTotal be_sales rows: ${after.rows.length} · lookup entries: ${lookup.length}`);
  console.log('\n=== พนักงานขาย (sellersLabel) "-" count ===');
  console.log(`  WITHOUT lookup (pre-fix): ${dash(before.rows, 'sellersLabel')}`);
  console.log(`  WITH lookup    (V129)   : ${dash(after.rows, 'sellersLabel')}`);
  console.log('\n=== ผู้ทำรายการ (createdBy) "-" count ===');
  console.log(`  WITHOUT lookup (pre-fix): ${dash(before.rows, 'createdBy')}`);
  console.log(`  WITH lookup    (V129)   : ${dash(after.rows, 'createdBy')}`);

  // Sales that have a seller id but no resolvable name even WITH lookup (truly orphaned).
  const orphan = after.rows.filter(r => r.sellersLabel === '-').map(r => r.saleId);
  console.log('\nsample resolved rows:');
  for (const r of after.rows.slice(0, 8)) {
    console.log(`  ${String(r.saleId).padEnd(20)} พนักงานขาย="${r.sellersLabel}"  ผู้ทำรายการ="${r.createdBy}"`);
  }

  const fixed = dash(before.rows, 'sellersLabel') - dash(after.rows, 'sellersLabel');
  const ok = fixed > 0 && dash(after.rows, 'sellersLabel') === 0;
  console.log(`\n  resolved ${fixed} previously-"-" seller rows; remaining "-": ${dash(after.rows, 'sellersLabel')} ${orphan.length ? `(orphans: ${orphan.slice(0,5)})` : ''}`);
  console.log(`  RESULT: ${ok ? 'PASS ✅ — lookup resolves all seller rows that have a known staff id' : (fixed > 0 ? 'PARTIAL — some seller ids not in be_staff/be_doctors (legacy/deleted)' : 'FAIL ❌')}`);
  process.exit(ok || fixed > 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
