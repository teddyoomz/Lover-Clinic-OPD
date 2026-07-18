// TFP-entry payload diag (READ-ONLY, Rule R) — quantify what TFP mount pulls
// from Firestore: the 6 Promise.all collections + a sample customer doc.
// Run from F:/LoverClinic-app (needs .env.local.prod).
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}
const env = loadEnv();
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const NAKHON = 'BR-1777873556815-26df6480';

const sizeOf = (docs) => docs.reduce((s, d) => s + JSON.stringify(d.data()).length, 0);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

async function scan(col, { branchField = null } = {}) {
  const snap = await db.collection(`${BASE}/${col}`).get();
  const all = snap.docs;
  const bAll = sizeOf(all);
  let line = `${col.padEnd(22)} docs=${String(all.length).padStart(4)} json=${kb(bAll).padStart(10)}`;
  if (branchField) {
    const scoped = all.filter(d => (d.data()[branchField] || '') === NAKHON);
    line += `  | nakhon docs=${String(scoped.length).padStart(4)} json=${kb(sizeOf(scoped)).padStart(10)}`;
  }
  // top-3 biggest docs (spot outliers)
  const top = all.map(d => ({ id: d.id, n: JSON.stringify(d.data()).length }))
    .sort((a, b) => b.n - a.n).slice(0, 3);
  line += `  top3=[${top.map(t => `${t.id}:${kb(t.n)}`).join(', ')}]`;
  console.log(line);
  return { count: all.length, bytes: bAll };
}

console.log('=== TFP mount-time Promise.all collections (server getDocs on EVERY TFP open) ===');
let total = 0;
for (const [col, opt] of [
  ['be_doctors', {}],
  ['be_products', { branchField: 'branchId' }],
  ['be_staff', {}],
  ['be_courses', { branchField: 'branchId' }],
  ['be_df_groups', { branchField: 'branchId' }],
  ['be_df_staff_rates', { branchField: 'branchId' }],
]) {
  const r = await scan(col, opt);
  total += r.bytes;
}
console.log(`TOTAL raw JSON (all-branch upper bound): ${kb(total)}`);

// sample: a real customer with treatments (for the Playwright probe) + doc sizes
const custSnap = await db.collection(`${BASE}/be_customers`).limit(500).get();
const withCourses = custSnap.docs.filter(d => (d.data().courses || []).length > 0);
const sample = withCourses.sort((a, b) => JSON.stringify(b.data()).length - JSON.stringify(a.data()).length)[0];
if (sample) {
  console.log(`\nsample customer: ${sample.id} json=${kb(JSON.stringify(sample.data()).length)} courses=${(sample.data().courses || []).length}`);
  const tSnap = await db.collection(`${BASE}/be_treatments`).where('customerId', '==', sample.id).get();
  console.log(`  treatments of sample: ${tSnap.size} docs json=${kb(sizeOf(tSnap.docs))}`);
  if (tSnap.size) {
    const t = tSnap.docs.sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0))[0];
    console.log(`  latest treatmentId for probe: ${t.id}`);
  }
}
// customer collection total (getCustomerTreatments is per-customer; fine)
console.log(`\nbe_customers total docs=${custSnap.size} (scan capped 500)`);
