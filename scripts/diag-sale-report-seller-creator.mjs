// scripts/diag-sale-report-seller-creator.mjs
// Rule R (READ-ONLY diag) — reports-sale "พนักงานขาย / ผู้ทำรายการ ไม่ครบ".
// Hypothesis: aggregator reads raw sellers[].name + raw createdBy; SaleTab
// resolves via a be_staff+be_doctors lookup (resolveSellerName). Confirm the
// real shape: are sellers[].name empty? is createdBy a uid?
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

  // Build the listAllSellers-equivalent lookup: be_staff + be_doctors → id→name.
  const lookup = new Map();
  for (const coll of ['be_staff', 'be_doctors']) {
    const snap = await db.collection(`${PREFIX}/${coll}`).get();
    for (const d of snap.docs) {
      const x = d.data();
      const name = String(x.name || `${x.firstName || ''} ${x.lastName || ''}`.trim() || '').trim();
      for (const key of [d.id, x.id, x.staffId, x.doctorId]) {
        if (key != null && key !== '') lookup.set(String(key), name);
      }
    }
  }
  const resolve = (id) => lookup.get(String(id)) || '';

  const sales = (await db.collection(`${PREFIX}/be_sales`).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  // recent first
  sales.sort((a, b) => String(b.saleId || b.id).localeCompare(String(a.saleId || a.id)));

  let sellerBugCount = 0;       // report shows '-' (no name) BUT lookup resolves
  let createdByUidCount = 0;    // createdBy is a uid resolvable to a staff name
  let createdByEmptyCount = 0;  // createdBy empty/'-'
  let createdByNameCount = 0;   // createdBy already a readable name
  const samples = [];

  for (const s of sales) {
    const sellers = Array.isArray(s.sellers) ? s.sellers : [];
    // report's current label (name only)
    const reportLabel = sellers.map(x => String(x?.name || '').trim()).filter(Boolean).join(', ') || '-';
    // resolved label (name → sellerName → lookup[id])
    const resolvedLabel = sellers.map(x => {
      const direct = String(x?.name || x?.sellerName || '').trim();
      return direct || resolve(x?.id);
    }).filter(Boolean).join(', ') || '-';

    if (reportLabel === '-' && resolvedLabel !== '-') sellerBugCount++;
    else if (reportLabel !== resolvedLabel) sellerBugCount++; // partial

    const createdBy = s.createdBy == null ? '' : String(s.createdBy);
    const createdByResolved = resolve(createdBy);
    if (!createdBy || createdBy === '-') createdByEmptyCount++;
    else if (createdByResolved) createdByUidCount++;            // it's a uid/id → name exists
    else if (/[ก-๙a-zA-Z]/.test(createdBy) && createdBy.length > 6 && !/^[A-Za-z0-9]{20,}$/.test(createdBy)) createdByNameCount++;
    else createdByUidCount++; // looks like an opaque uid with no lookup hit

    if (samples.length < 14 && (reportLabel !== resolvedLabel || createdByResolved || !createdBy)) {
      samples.push({
        saleId: s.saleId || s.id,
        sellersRaw: JSON.stringify(sellers.map(x => ({ id: x?.id, name: x?.name || '' }))),
        reportLabel, resolvedLabel,
        createdBy: createdBy || '<empty>',
        createdByResolved: createdByResolved || '<no-lookup-hit>',
        createdByName: s.createdByName || '<none>',
      });
    }
  }

  console.log(`\nTotal be_sales: ${sales.length} · staff/doctor lookup entries: ${lookup.size}`);
  console.log('\n=== พนักงานขาย (seller) ===');
  console.log(`  ★ report label differs from resolved (lookup would fix): ${sellerBugCount}`);
  console.log('\n=== ผู้ทำรายการ (createdBy) ===');
  console.log(`  createdBy is a uid/id resolvable to a staff name : ${createdByUidCount}`);
  console.log(`  createdBy already a readable name                : ${createdByNameCount}`);
  console.log(`  createdBy empty/'-'                              : ${createdByEmptyCount}`);

  console.log('\n=== samples ===');
  for (const s of samples) {
    console.log(`  ${String(s.saleId).padEnd(20)} sellersRaw=${s.sellersRaw}`);
    console.log(`      report="${s.reportLabel}" | resolved="${s.resolvedLabel}"`);
    console.log(`      createdBy="${s.createdBy}" → lookup="${s.createdByResolved}" | createdByName=${s.createdByName}`);
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
