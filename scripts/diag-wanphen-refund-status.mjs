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
const cSnap = await db.doc('artifacts/loverclinic-opd-4c39b/public/data/be_customers/LC-26000078').get();
const c = cSnap.data();
const courses = c.courses || [];
console.log(`Total courses: ${courses.length}\n`);
courses.forEach((cc, i) => {
  console.log(`[${i}] name="${cc.name}" product="${cc.product}"`);
  console.log(`    qty="${cc.qty}" status="${cc.status || '(none)'}"`);
  console.log(`    refundedAt=${cc.refundedAt || 'none'}  cancelledAt=${cc.cancelledAt || 'none'}`);
  console.log(`    refundAmount=${cc.refundAmount || 0}  linkedSaleId=${cc.linkedSaleId || 'none'}`);
});
