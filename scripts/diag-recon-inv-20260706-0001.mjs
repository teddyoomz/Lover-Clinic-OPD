// READ-ONLY adjudication of the L2 flag on INV-20260706-0001 (Rule R).
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
for (const line of readFileSync('.env.local.prod', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!getApps().length) initializeApp({ credential: cert({
  projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
})});
const db = getFirestore();
const PREFIX = `artifacts/${APP_ID}/public/data`;

const snap = await db.collection(`${PREFIX}/be_sales`).where('saleDate', '==', '2026-07-06').get();
for (const d of snap.docs) {
  const s = d.data();
  const inv = String(s.invoiceNo || s.invoice_no || d.id);
  if (inv !== 'INV-20260706-0001') continue;
  console.log('saleId(doc):', d.id, '| customerId:', s.customerId, '| status:', s.status, '| total:', s.billing?.grandTotal);
  console.log('items.courses:', JSON.stringify((s.items?.courses || []).map(c => ({ id: c.id, courseId: c.courseId, name: c.name || c.courseName, qty: c.qty })), null, 1));
  console.log('items.promotions:', JSON.stringify((s.items?.promotions || []).map(p => ({ id: p.id, name: p.name, qty: p.qty })), null, 1));
  console.log('note:', s.note || s.saleNote || '(none)');
  console.log('linkedTreatmentId:', s.linkedTreatmentId || '(none)', '| source fields:', s.source || s.createdFrom || '(n/a)');
  const cust = await db.doc(`${PREFIX}/be_customers/${s.customerId}`).get();
  if (!cust.exists) { console.log('CUSTOMER DOC MISSING:', s.customerId); continue; }
  const cd = cust.data();
  const courses = cd.courses || [];
  console.log('customer:', (cd.firstname || '') + ' ' + (cd.lastname || ''), '| courses[] length:', courses.length);
  for (const c of courses) {
    console.log('  -', JSON.stringify({ name: c.name, qty: c.qty, linkedSaleId: c.linkedSaleId || null, linkedTreatmentId: c.linkedTreatmentId || null, courseId: (c.courseId || '').slice(0, 40) }));
  }
  // any course-change audit entries for this customer around that date?
  const cc = await db.collection(`${PREFIX}/be_course_changes`).where('customerId', '==', String(s.customerId)).get();
  console.log('be_course_changes entries:', cc.size);
  for (const x of cc.docs.slice(0, 10)) {
    const v = x.data();
    console.log('  *', v.type || v.changeType, '|', v.courseName || v.name, '| treatmentId:', v.treatmentId || '-', '| at:', v.createdAt || v.at);
  }
}
console.log('done (read-only)');
