#!/usr/bin/env node
// Diag — check createdAt shape across be_stock_movements
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

const all = await db.collection(`${BASE}/be_stock_movements`).get();
const shapes = new Map();
for (const doc of all.docs) {
  const m = doc.data();
  const ca = m.createdAt;
  let shape;
  if (ca == null) shape = 'null/undefined';
  else if (typeof ca === 'string') shape = 'string (ISO)';
  else if (typeof ca === 'object' && ca._seconds !== undefined) shape = 'Timestamp object (_seconds)';
  else if (typeof ca === 'object' && ca.seconds !== undefined) shape = 'Timestamp instance (seconds)';
  else shape = `unknown (${typeof ca})`;
  shapes.set(shape, (shapes.get(shape) || 0) + 1);
}
console.log('createdAt shape distribution:');
for (const [s, n] of shapes.entries()) console.log(`  ${s}: ${n}`);

// Show V105 RE-DEDUCT sample
const v105Sample = all.docs.find(d => d.data()._v105ReDeductOf);
if (v105Sample) {
  console.log(`\nV105 RE-DEDUCT sample createdAt shape:`);
  const ca = v105Sample.data().createdAt;
  console.log(`  type: ${typeof ca}`);
  console.log(`  value: ${JSON.stringify(ca)}`);
  console.log(`  has localeCompare?: ${typeof ca?.localeCompare}`);
}

const oldSample = all.docs.find(d => !d.data()._v105ReDeductOf && typeof d.data().createdAt === 'string');
if (oldSample) {
  console.log(`\nOlder movement sample createdAt:`);
  const ca = oldSample.data().createdAt;
  console.log(`  type: ${typeof ca}`);
  console.log(`  value: ${JSON.stringify(ca)}`);
  console.log(`  has localeCompare?: ${typeof ca?.localeCompare}`);
}
process.exit(0);
