// Rule R (read-only) — orphan check for the collections that were missing from the
// customer cascade before 2026-06-18: be_assessments (ED rounds) + be_customer_wallets
// (wallet balances; was the be_wallets phantom). Reports docs whose customerId no longer
// has a be_customers doc (orphaned by a pre-fix customer delete). No writes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
if (!getApps().length) initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = getFirestore();
const data = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function checkOrphans(col) {
  const snap = await data().collection(col).get();
  const out = [];
  for (const d of snap.docs) {
    const cid = d.data().customerId;
    if (!cid) { out.push({ id: d.id, customerId: '(none)', orphan: true, reason: 'no customerId field' }); continue; }
    const cust = await data().collection('be_customers').doc(String(cid)).get();
    if (!cust.exists) out.push({ id: d.id, customerId: cid, orphan: true });
  }
  return { total: snap.size, orphans: out };
}

async function main() {
  console.log('=== orphan check (read-only) — customerId without a be_customers doc ===');
  for (const col of ['be_assessments', 'be_customer_wallets']) {
    const r = await checkOrphans(col);
    console.log(`\n${col}: ${r.total} docs · ${r.orphans.length} ORPHANED`);
    for (const o of r.orphans) console.log(`  orphan: ${o.id} (customerId=${o.customerId})${o.reason ? ' — ' + o.reason : ''}`);
  }
  console.log('\n(0 orphans → nothing to clean; the code fix prevents future orphans. >0 → Rule-M two-phase cleanup.)');
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
