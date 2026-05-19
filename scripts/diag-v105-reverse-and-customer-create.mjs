#!/usr/bin/env node
// V105 deeper diag — investigate WHY:
//   A. Customer LC-26000079 has empty patientData (how was customer created?)
//   B. Stock reversal at 12:24 UTC ~10 min after deduct — what triggered it?

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
const SALE_ID = 'INV-20260519-0008';
const TREATMENT_ID = 'BT-1779195907349';
const CUSTOMER_ID = 'LC-26000079';

const ts = (v) => v?._seconds ? new Date(v._seconds * 1000).toISOString() : '(none)';

async function main() {
  // 1. Full customer doc dump
  const cSnap = await db.doc(`${BASE}/be_customers/${CUSTOMER_ID}`).get();
  console.log(`━━━ FULL CUSTOMER DOC ━━━`);
  if (cSnap.exists) {
    const c = cSnap.data();
    console.log(`  id: ${cSnap.id}`);
    console.log(`  createdAt: ${ts(c.createdAt)}`);
    console.log(`  updatedAt: ${ts(c.updatedAt)}`);
    console.log(`  source: "${c.source || ''}"`);
    console.log(`  patientData keys: ${Object.keys(c.patientData || {}).join(', ')}`);
    console.log(`  patientData: ${JSON.stringify(c.patientData, null, 2)}`);
    console.log(`  Top-level non-patientData keys: ${Object.keys(c).filter(k => k !== 'patientData' && k !== 'courses').join(', ')}`);
    console.log(`  proClinicHN: "${c.proClinicHN || ''}"`);
    console.log(`  HN: "${c.HN || c.hn || ''}"`);
    console.log(`  customerName: "${c.customerName || ''}"`);
    console.log(`  name: "${c.name || ''}"`);
  }

  // 2. Full sale doc (everything)
  const sSnap = await db.doc(`${BASE}/be_sales/${SALE_ID}`).get();
  if (sSnap.exists) {
    const s = sSnap.data();
    console.log(`\n━━━ FULL SALE DOC (top-level only) ━━━`);
    for (const k of Object.keys(s).sort()) {
      if (k === 'detail' || k === 'items') continue;
      const v = s[k];
      const repr = typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : v;
      console.log(`  ${k}: ${repr}`);
    }
    console.log(`\n━━━ sale.detail keys: ${Object.keys(s.detail || {}).join(', ')} ━━━`);
  }

  // 3. Reverse stock movements — find the 7 reverse movements + check note
  console.log(`\n━━━ ALL STOCK MOVEMENTS for sale=${SALE_ID} (sorted by time) ━━━`);
  const mov = await db.collection(`${BASE}/be_stock_movements`)
    .where('linkedSaleId', '==', SALE_ID).get();
  const all = mov.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?._seconds || 0) - (b.createdAt?._seconds || 0));
  for (const m of all) {
    console.log(`  ${m.id}  type=${m.type} qty=${m.qty} ${m.qty < 0 ? '(DEDUCT)' : '(REVERSE)'}`);
    console.log(`    productName="${m.productName}" productId="${m.productId}"`);
    console.log(`    note: "${m.note || ''}"  reason: "${m.reason || ''}"`);
    console.log(`    reversedByMovementId: "${m.reversedByMovementId || ''}"`);
    console.log(`    reverseOfMovementId: "${m.reverseOfMovementId || ''}"`);
    console.log(`    createdAt: ${ts(m.createdAt)}`);
    console.log(`    actor: "${m.actor || ''}"  user: ${JSON.stringify(m.user || {})}`);
  }

  // 4. Check sale + treatment + customer modification history (if any audit field)
  console.log(`\n━━━ TREATMENT createdAt + updatedAt ━━━`);
  const tSnap = await db.doc(`${BASE}/be_treatments/${TREATMENT_ID}`).get();
  if (tSnap.exists) {
    const t = tSnap.data();
    console.log(`  createdAt: ${ts(t.createdAt)}`);
    console.log(`  updatedAt: ${ts(t.updatedAt)}`);
    console.log(`  completedAt: ${ts(t.completedAt)}`);
    console.log(`  editedAt: ${ts(t.editedAt)}`);
    console.log(`  editedBy: ${t.editedBy || '(none)'}`);
    console.log(`  status: "${t.status || '(none)'}"`);
    console.log(`  _v101BackfilledAt: ${ts(t._v101BackfilledAt)}`);
  }

  // 5. Look at customer LC-26000079 - opd_sessions link
  console.log(`\n━━━ opd_sessions linked to ${CUSTOMER_ID} ━━━`);
  const opdSessions = await db.collection('opd_sessions').where('linkedCustomerId', '==', CUSTOMER_ID).limit(5).get();
  console.log(`  Found: ${opdSessions.size}`);
  for (const doc of opdSessions.docs) {
    const o = doc.data();
    console.log(`    ${doc.id}: pd.firstName="${o.patientData?.firstName || ''}" pd.lastName="${o.patientData?.lastName || ''}" pd.firstNameTh="${o.patientData?.firstNameTh || ''}"`);
  }

  // 6. Look at any be_admin_audit entry referencing this sale
  console.log(`\n━━━ be_admin_audit entries referencing ${SALE_ID} or ${TREATMENT_ID} ━━━`);
  const audits = await db.collection(`${BASE}/be_admin_audit`).get();
  let found = 0;
  for (const doc of audits.docs) {
    const a = doc.data();
    const s = JSON.stringify(a);
    if (s.includes(SALE_ID) || s.includes(TREATMENT_ID) || s.includes(CUSTOMER_ID)) {
      found++;
      console.log(`  ${doc.id}: phase=${a.phase} operation=${a.operation} appliedAt=${ts(a.appliedAt)}`);
    }
  }
  console.log(`  Total relevant audits: ${found}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
