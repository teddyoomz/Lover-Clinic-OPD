import fs from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = {};
for (const line of fs.readFileSync('.env.local.prod', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
  if (m) env[m[1]] = m[2];
}
const pk = env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n');
if (!getApps().length) initializeApp({
  credential: cert({
    projectId: 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: pk,
  }),
});
const db = getFirestore();
const base = ['artifacts', 'loverclinic-opd-4c39b', 'public', 'data'];
const col = (n) => {
  let r = db;
  for (const s of base) r = r.collection ? r.collection(s) : r.doc(s);
  return r.collection(n);
};
const cnt = async (n) => (await col(n).count().get()).data().count;

const restored = ['opd_sessions', 'chat_history', 'chat_conversations'];
const stillWiped = [
  'be_customers', 'be_treatments', 'be_sales', 'be_appointments', 'be_recalls',
  'be_deposits', 'be_quotations', 'be_online_sales', 'be_sale_insurance_claims',
];
const preserved = ['be_products', 'be_courses', 'be_doctors', 'be_staff', 'be_branches', 'be_admin_audit'];

console.log('=== POST-ROLLBACK VERIFICATION ===\n');
console.log('RESTORED (must match backup counts):');
for (const c of restored) console.log(`  ${c}: ${(await cnt(c)).toLocaleString()}`);
console.log('\nSTILL WIPED (must = 0 per user actual intent):');
for (const c of stillWiped) console.log(`  ${c}: ${await cnt(c)}`);
console.log('\nPRESERVED (sanity check):');
for (const c of preserved) console.log(`  ${c}: ${(await cnt(c)).toLocaleString()}`);

const counterSnap = await col('be_customer_counter').doc('counter').get();
console.log('\nHN counter:', counterSnap.exists ? `EXISTS ${JSON.stringify(counterSnap.data())}` : 'absent → next addCustomer = LC-26000001');
