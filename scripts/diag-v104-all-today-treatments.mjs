#!/usr/bin/env node
// V104 diag — print every treatment from 2026-05-19, courseItems shape, customer.courses snapshot
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const ts = (v) => v?._seconds ? new Date(v._seconds * 1000 + 7 * 3600 * 1000).toISOString().replace('Z', '+07:00') : '(none)';
const ts2 = (v) => v?._seconds || 0;

const tSnap = await db.collection(`${BASE}/be_treatments`)
  .where('detail.treatmentDate', '==', '2026-05-19').get();
const treatments = tSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  .sort((a, b) => ts2(b.createdAt) - ts2(a.createdAt));

console.log(`\n━━━ ALL ${treatments.length} TREATMENTS for 2026-05-19 (newest first) ━━━\n`);

for (let i = 0; i < treatments.length; i++) {
  const t = treatments[i];
  const d = t.detail || {};
  const ci = d.courseItems || [];
  const ti = d.treatmentItems || [];
  const pi = d.purchasedItems || [];
  const hasSale = d.hasSale || t.hasSale;
  const linkedSaleId = d.linkedSaleId || t.linkedSaleId || '';
  console.log(`[${i}] ${t.treatmentId || t.id}  branchId=${d.branchId || t.branchId || '(none)'}`);
  console.log(`    createdAt: ${ts(t.createdAt)}  customer: ${t.customerId} (${t.customerName || d.customerName || ''})`);
  console.log(`    status: ${t.status || '(none)'}  hasSale: ${hasSale}  linkedSaleId: ${linkedSaleId}`);
  console.log(`    purchasedItems (${pi.length}):`);
  pi.forEach(p => console.log(`      id="${p.id}" name="${p.name}" itemType="${p.itemType}" qty=${p.qty}`));
  console.log(`    treatmentItems (${ti.length}):`);
  ti.forEach(it => console.log(`      id="${it.id}" name="${it.name}" qty=${it.qty} productId="${it.productId || ''}"`));
  console.log(`    courseItems (${ci.length}):`);
  if (ci.length === 0) {
    console.log(`      (none)`);
  }
  ci.forEach(c2 => console.log(`      rowId="${c2.rowId}" courseName="${c2.courseName}" productName="${c2.productName}" deductQty=${c2.deductQty} courseIndex=${c2.courseIndex ?? '-'} _v101AutoLinked=${c2._v101AutoLinked || false}`));
}
console.log('\n━━━ END ━━━\n');
process.exit(0);
