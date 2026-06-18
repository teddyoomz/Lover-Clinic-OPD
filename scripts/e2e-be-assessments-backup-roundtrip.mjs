// Rule Q L2 (real prod, admin-SDK = the real backup path) — prove the customer cascade
// list now captures be_assessments + be_customer_wallets. Seeds TEST- fixtures, runs the
// REAL CUSTOMER_CASCADE_COLLECTIONS_FULL collect-by-customerId, restores into a TEST namespace,
// asserts round-trip, cleans up (zero orphans). No real-customer data touched.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { CUSTOMER_CASCADE_COLLECTIONS_FULL } from '../src/lib/customerBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
if (!getApps().length) initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = getFirestore();
const data = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const TS = Date.now();
const CID = `TEST-CUST-${TS}`;
const RCID = `TEST-CUST-RESTORE-${TS}`;
let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${name}`); ok ? pass++ : fail++; };

async function main() {
  console.log('=== e2e be_assessments backup round-trip (real prod, TEST fixtures) ===');
  const seeded = [];
  const seed = async (col, id, doc) => { const ref = data().collection(col).doc(id); await ref.set(doc); seeded.push(ref); };

  // 1. SEED — a TEST customer + 2 ED rounds + 1 wallet balance (all customerId=CID)
  await seed('be_customers', CID, { id: CID, firstname: 'TEST', lastname: 'Backup', hn_no: CID });
  await seed('be_assessments', `TEST-ASMT-${TS}-a`, { customerId: CID, assessmentDate: '2026-06-18', rawAnswers: { adam_1: true } });
  await seed('be_assessments', `TEST-ASMT-${TS}-b`, { customerId: CID, assessmentDate: '2026-06-19', rawAnswers: { adam_1: false } });
  await seed('be_customer_wallets', `${CID}__WT-${TS}`, { customerId: CID, balance: 1234, walletTypeName: 'TEST' });
  console.log(`seeded TEST customer ${CID} (2 be_assessments + 1 be_customer_wallets)`);

  // 2. COLLECT — the REAL backup path: iterate the cascade list, query where customerId==CID
  const file = {};
  for (const col of CUSTOMER_CASCADE_COLLECTIONS_FULL) {
    const snap = await data().collection(col).where('customerId', '==', CID).get();
    file[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  check('cascade list INCLUDES be_assessments', CUSTOMER_CASCADE_COLLECTIONS_FULL.includes('be_assessments'));
  check('cascade list INCLUDES be_customer_wallets (real store, not the be_wallets phantom)', CUSTOMER_CASCADE_COLLECTIONS_FULL.includes('be_customer_wallets'));
  check('cascade list does NOT include be_wallets phantom', !CUSTOMER_CASCADE_COLLECTIONS_FULL.includes('be_wallets'));
  check('backup captured 2 be_assessments rounds', file.be_assessments.length === 2);
  check('backup captured 1 be_customer_wallets balance', file.be_customer_wallets.length === 1);
  check('captured wallet balance value preserved (1234)', file.be_customer_wallets[0]?.balance === 1234);

  // 3. RESTORE — recreate into a TEST-RESTORE customer namespace; re-read; assert round-trip
  const restored = [];
  for (const d of file.be_assessments) { const ref = data().collection('be_assessments').doc(`${d.id}-restore`); await ref.set({ ...d, customerId: RCID }); restored.push(ref); }
  const reread = await data().collection('be_assessments').where('customerId', '==', RCID).get();
  check('restore recreated 2 be_assessments under the restored customer', reread.size === 2);
  check('restored round preserves assessmentDate + rawAnswers', reread.docs.some((d) => d.data().assessmentDate === '2026-06-18' && d.data().rawAnswers?.adam_1 === true));

  // 4. CLEANUP — delete every TEST doc (seed + restore); verify zero orphans left
  for (const ref of [...seeded, ...restored]) await ref.delete();
  const leftA = await data().collection('be_assessments').where('customerId', '==', CID).get();
  const leftR = await data().collection('be_assessments').where('customerId', '==', RCID).get();
  const leftW = await data().collection('be_customer_wallets').where('customerId', '==', CID).get();
  check('cleanup removed all TEST fixtures (zero orphans)', leftA.empty && leftR.empty && leftW.empty);

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
