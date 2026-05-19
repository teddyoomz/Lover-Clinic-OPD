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

for (const col of ['be_stock_batches', 'be_stock_orders', 'be_stock_movements']) {
  const snap = await db.collection(`${BASE}/${col}`).limit(3).get();
  console.log(`\n━━━ ${col} (showing first 3 docs) ━━━`);
  snap.docs.forEach((d, i) => {
    const data = d.data();
    const fields = Object.keys(data).sort();
    console.log(`[${i}] ${d.id}`);
    console.log(`    fields: ${fields.join(', ')}`);
    console.log(`    branchId: ${JSON.stringify(data.branchId)}`);
    console.log(`    locationId: ${JSON.stringify(data.locationId)}`);
    console.log(`    warehouseId: ${JSON.stringify(data.warehouseId)}`);
  });
}
