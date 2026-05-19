// V104 diag — investigate why V101 auto-link didn't fire on the 19:37
// treatment. Per V101 fix: TFP save chain should produce courseItems[]
// via Pass 2 productId fallback even when selectedCourseItems was empty.
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
const ts = (v) => v?._seconds ? new Date(v._seconds * 1000).toISOString() : (typeof v === 'string' ? v : '(none)');

// Pull customer
const cSnap = await db.doc(`${BASE}/be_customers/LC-26000078`).get();
const c = cSnap.data();
const courses = c.courses || [];
console.log(`━━━ customer.courses[] (total ${courses.length}) ━━━\n`);
courses.forEach((cc, i) => {
  console.log(`[${i}] name="${cc.name}" product="${cc.product}"`);
  console.log(`    qty="${cc.qty}" status="${cc.status || '(none)'}" productId="${cc.productId || '(none)'}"`);
  console.log(`    linkedSaleId="${cc.linkedSaleId || ''}" assignedAt=${ts(cc.assignedAt)}`);
});

// Pull treatments
const tSnap = await db.collection(`${BASE}/be_treatments`).where('customerId', '==', 'LC-26000078').get();
const ts2 = (v) => v?._seconds || 0;
const treatments = tSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => ts2(b.createdAt) - ts2(a.createdAt));
console.log(`\n━━━ be_treatments[] (total ${treatments.length}) sorted desc ━━━\n`);
treatments.forEach((t, i) => {
  const d = t.detail || {};
  const ti = d.treatmentItems || [];
  const ci = d.courseItems || [];
  console.log(`[${i}] ${t.treatmentId || t.id}`);
  console.log(`    createdAt: ${ts(t.createdAt)}  updatedAt: ${ts(t.updatedAt)}`);
  console.log(`    completedAt: ${ts(t.completedAt)}  status: ${t.status || '(no field)'}`);
  console.log(`    branchId: ${t.branchId || d.branchId || '(none)'}`);
  console.log(`    treatmentItems (${ti.length}):`);
  ti.forEach(it => console.log(`      id="${it.id}" name="${it.name}" qty=${it.qty} productId="${it.productId || ''}"`));
  console.log(`    courseItems (${ci.length}):`);
  ci.forEach(c2 => console.log(`      rowId="${c2.rowId}" courseName="${c2.courseName}" productName="${c2.productName}" deductQty=${c2.deductQty} _v101AutoLinked=${c2._v101AutoLinked}`));
});

// Pull recent course_changes
const ccSnap = await db.collection(`${BASE}/be_course_changes`).where('customerId', '==', 'LC-26000078').limit(20).get();
const changes = ccSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => ts2(b.timestamp) - ts2(a.timestamp));
console.log(`\n━━━ be_course_changes (last 10) ━━━\n`);
changes.slice(0, 10).forEach((cc, i) => {
  console.log(`[${i}] kind=${cc.kind} treatmentId=${cc.treatmentId || '(none)'} productName="${cc.productName || ''}" qty=${cc.qty} ts=${ts(cc.timestamp)}`);
});
