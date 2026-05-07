import { readFileSync, existsSync } from 'node:fs';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue;
  let val = m[2]; if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();

const snap = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('be_customers').get();
const allParentNames = new Map();
const promoLike = [];
for (const doc of snap.docs) {
  const courses = doc.data().courses;
  if (!Array.isArray(courses)) continue;
  for (const c of courses) {
    const pn = String(c?.parentName || '');
    if (pn) {
      const k = pn.slice(0, 30);
      allParentNames.set(k, (allParentNames.get(k) || 0) + 1);
      if ((pn.includes('โปรโมช') || pn.toLowerCase().includes('promo')) && promoLike.length < 12) {
        promoLike.push({
          cust: doc.id,
          name: c.name,
          product: c.product,
          qty: c.qty,
          parentName: c.parentName,
          linkedSaleId: c.linkedSaleId || '',
        });
      }
    }
  }
}
console.log('parentName prefix → count (top 15):');
[...allParentNames.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,v]) => console.log(`  ${String(v).padStart(5)}  "${k}"`));
console.log('\nSample promo-like entries (first 12):');
for (const e of promoLike) console.log(`  cust=${e.cust}  name="${e.name}"  product="${e.product}"  qty="${e.qty}"  parent="${e.parentName}"  saleId=${e.linkedSaleId}`);
