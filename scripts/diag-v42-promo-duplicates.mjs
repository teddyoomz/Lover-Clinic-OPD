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
const snap = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('be_promotions').get();
console.log(`Total be_promotions: ${snap.size}`);
const byName = new Map();
for (const doc of snap.docs) {
  const d = doc.data();
  const n = d.promotion_name || '';
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push({ docId: doc.id, branchId: d.branchId, courses: d.courses });
}
for (const [name, list] of byName) {
  console.log(`\nPromotion "${name}" — ${list.length} doc(s):`);
  for (const p of list) {
    console.log(`  docId=${p.docId}  branchId=${p.branchId}`);
    for (const c of (p.courses || [])) {
      console.log(`    sub: name="${c.name}"  qty=${c.qty}  products=${(c.products || []).map(pp => `${pp.name}×${pp.qty}`).join(', ')}`);
    }
  }
}
