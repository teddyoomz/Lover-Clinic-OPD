#!/usr/bin/env node
// Quick Rule R diag — count stock movements for นครราชสีมา branch + recent samples
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
const NAKHON = 'BR-1777873556815-26df6480';

const all = await db.collection(`${BASE}/be_stock_movements`).get();
console.log(`Total be_stock_movements: ${all.size}`);

const byBranch = new Map();
for (const doc of all.docs) {
  const m = doc.data();
  const bid = m.branchId || '(none)';
  byBranch.set(bid, (byBranch.get(bid) || 0) + 1);
}
console.log(`\nBy branchId:`);
for (const [bid, n] of byBranch.entries()) console.log(`  ${bid}: ${n}`);

const nakhon = await db.collection(`${BASE}/be_stock_movements`)
  .where('branchId', '==', NAKHON).get();
console.log(`\nนครราชสีมา (${NAKHON}): ${nakhon.size} movements`);

const sorted = nakhon.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .sort((a,b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
console.log(`\nLatest 10 นครราชสีมา movements:`);
for (const m of sorted.slice(0, 10)) {
  const created = m.createdAt?._seconds ? new Date(m.createdAt._seconds * 1000).toISOString() : '(no createdAt)';
  console.log(`  ${m.id}: type=${m.type} qty=${m.qty} ${m.productName} at ${created} linkedSaleId=${m.linkedSaleId || ''} linkedTreatmentId=${m.linkedTreatmentId || ''}`);
}

// Check if V105 RE-DEDUCT entries are present
const v105 = nakhon.docs.filter(d => d.data()._v105ReDeductOf).length;
console.log(`\nV105 RE-DEDUCT entries (added by V105 backfill): ${v105}`);
process.exit(0);
