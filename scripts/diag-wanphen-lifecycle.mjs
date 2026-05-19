#!/usr/bin/env node
// Extended Rule R diag - inspect lifecycle stage fields + raw courseItems
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
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();
const TARGET = 'LC-26000078';

const ts = (v) => {
  if (!v) return '(none)';
  if (typeof v === 'string') return v;
  if (v._seconds) return new Date(v._seconds * 1000).toISOString();
  if (v.toDate) return v.toDate().toISOString();
  return JSON.stringify(v);
};

async function main() {
  const tSnap = await db.collection(`${BASE}/be_treatments`)
    .where('customerId', '==', TARGET).get();
  const treatments = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  treatments.sort((a, b) => {
    const ta = a.createdAt?._seconds || 0;
    const tb = b.createdAt?._seconds || 0;
    return tb - ta;
  });
  console.log(`Lifecycle audit for ${TARGET} treatments (${treatments.length} total)\n`);
  for (const t of treatments) {
    const d = t.detail || {};
    const ti = d.treatmentItems || [];
    const ci = d.courseItems || [];
    const pi = d.purchasedItems || [];
    console.log(`━━━ ${t.treatmentId || t.id}`);
    console.log(`  TIMESTAMPS:`);
    console.log(`    createdAt:             ${ts(t.createdAt)}`);
    console.log(`    updatedAt:             ${ts(t.updatedAt)}`);
    console.log(`    vitalsignsRecordedAt:  ${ts(t.vitalsignsRecordedAt)}`);
    console.log(`    doctorRecordedAt:      ${ts(t.doctorRecordedAt)}`);
    console.log(`    completedAt:           ${ts(t.completedAt)}`);
    console.log(`    editedAt:              ${ts(t.editedAt)}`);
    console.log(`    status:                ${t.status || '(no status — completed via staff)'}`);
    console.log(`  TOP-LEVEL: linkedSaleId=${t.linkedSaleId || '(none)'}`);
    console.log(`  COUNTS:    treatmentItems=${ti.length}  courseItems=${ci.length}  purchasedItems=${pi.length}  hasSale=${d.hasSale}`);
    if (ti.length > 0) {
      console.log(`  treatmentItems[].id values:`);
      ti.forEach((item, i) => {
        console.log(`    [${i}] id="${item.id}" name="${item.name}" qty=${item.qty} unit="${item.unit}" productId="${item.productId || ''}"`);
      });
    }
    if (ci.length > 0) {
      console.log(`  courseItems shape:`);
      ci.forEach((c, i) => {
        console.log(`    [${i}] rowId="${c.rowId}" courseName="${c.courseName}" productName="${c.productName}" courseIndex=${c.courseIndex} deductQty=${c.deductQty}`);
      });
    } else {
      console.log(`  ⚠ courseItems EMPTY — no course decrement was tracked despite treatmentItems present`);
    }
    if (pi.length > 0) {
      console.log(`  purchasedItems:`);
      pi.forEach((p, i) => {
        console.log(`    [${i}] id="${p.id}" name="${p.name}" type="${p.itemType}" qty=${p.qty}`);
      });
    }
    console.log();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
