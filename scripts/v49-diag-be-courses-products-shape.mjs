// V49 diag — verify be_courses + be_products + be_promotions canonical shape on prod
// Read-only probe; safe to run anytime. Helps confirm V49 multi-reader-sweep diagnosis.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const key = env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n');
initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: key,
  }),
});

const db = getFirestore();
const APP_ID = 'loverclinic-opd-4c39b';
const base = `artifacts/${APP_ID}/public/data`;

const sample = async (col, label, canonicalFields, legacyFields) => {
  const snap = await db.collection(`${base}/${col}`).limit(3).get();
  console.log(`\n=== ${label} (${snap.size} docs sampled) ===`);
  snap.forEach(d => {
    const data = d.data();
    console.log(`Doc ${d.id}:`);
    console.log(`  CANONICAL fields:`);
    for (const f of canonicalFields) {
      console.log(`    ${f} = ${JSON.stringify(data[f])?.slice(0,80)}`);
    }
    console.log(`  LEGACY fields (these should be UNDEFINED on canonical docs):`);
    for (const f of legacyFields) {
      console.log(`    ${f} = ${JSON.stringify(data[f])?.slice(0,80)}`);
    }
  });
};

await sample('be_courses', 'be_courses',
  ['courseName', 'salePrice', 'courseCategory', 'courseProducts'],
  ['name', 'price', 'category', 'products']);
await sample('be_products', 'be_products',
  ['productName', 'price', 'categoryName', 'mainUnitName'],
  ['name', 'category', 'unit']);
await sample('be_promotions', 'be_promotions',
  ['promotion_name', 'sale_price', 'category_name'],
  ['name', 'price', 'category']);
process.exit(0);
