// Rule R (read-only) — where do customer wallets actually live in prod?
// Resolves whether `be_wallets` (in the cascade list) is a phantom vs the real
// `be_customer_wallets` (backendClient walletsCol), and whether the be_customers/{id}/wallets
// subcollection holds data. Read-only; no writes.
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

async function count(col) {
  try { const s = await data().collection(col).count().get(); return s.data().count; }
  catch (e) { return `ERR ${e.code || e.message}`; }
}

async function main() {
  console.log('=== wallet collection diag (read-only) ===');
  for (const c of ['be_wallets', 'be_customer_wallets', 'be_memberships', 'be_point_transactions', 'be_assessments']) {
    console.log(`  ${c}: ${await count(c)} docs`);
  }
  // sample customer subcollection check
  const custs = await data().collection('be_customers').limit(3).get();
  console.log(`\n=== sample customers (${custs.size}) — flat be_customer_wallets vs subcoll wallets ===`);
  for (const c of custs.docs) {
    const cid = c.id;
    const flat = await data().collection('be_customer_wallets').where('customerId', '==', cid).count().get().then((s) => s.data().count).catch((e) => `ERR ${e.code}`);
    let subcoll = 'n/a';
    try { const ss = await data().collection('be_customers').doc(cid).collection('wallets').count().get(); subcoll = ss.data().count; } catch (e) { subcoll = `ERR ${e.code}`; }
    const flatWallets2 = await data().collection('be_wallets').where('customerId', '==', cid).count().get().then((s) => s.data().count).catch((e) => `ERR ${e.code}`);
    console.log(`  ${cid}: be_customer_wallets=${flat} · be_wallets=${flatWallets2} · subcoll(wallets)=${subcoll}`);
  }
  console.log('\n(be_wallets ~0 + be_customer_wallets >0 → be_wallets is a phantom; the real store is be_customer_wallets)');
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
