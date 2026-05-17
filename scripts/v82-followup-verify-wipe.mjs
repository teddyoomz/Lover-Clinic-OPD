#!/usr/bin/env node
// scripts/v82-followup-verify-wipe.mjs
// Post-wipe verification — every WIPE_COLLECTIONS should be 0; HN counter absent;
// be_admin_audit should contain the v82-followup-full-customer-wipe-* doc.
// Rule R diagnostic (read-only).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = ['artifacts', APP_ID, 'public', 'data'];

const WIPE_COLLECTIONS = [
  'be_customers', 'be_treatments', 'be_sales', 'be_appointments', 'be_deposits',
  'be_quotations', 'be_online_sales', 'be_sale_insurance_claims', 'be_recalls',
  'chat_conversations', 'chat_history', 'opd_sessions',
];

const PRESERVED_SAMPLES = [
  'be_products', 'be_courses', 'be_doctors', 'be_staff', 'be_branches',
  'be_stock_batches', 'be_stock_movements', 'be_admin_audit',
  'be_promotions', 'be_coupons', 'be_vouchers',
];

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function dataCol(db, name) {
  let ref = db;
  for (const seg of BASE) ref = ref.collection ? ref.collection(seg) : ref.doc(seg);
  return ref.collection(name);
}

async function countDocs(query) {
  try { return (await query.count().get()).data().count; }
  catch { return (await query.get()).size; }
}

async function main() {
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  const db = getFirestore();

  console.log('=== V82-followup wipe post-verify ===\n');

  // 1. Wiped collections must all be 0
  console.log('[verify] WIPED collections (must = 0):');
  let allZero = true;
  for (const col of WIPE_COLLECTIONS) {
    const n = await countDocs(dataCol(db, col));
    const ok = n === 0;
    if (!ok) allZero = false;
    console.log(`  ${ok ? '✓' : '✗'} ${col}: ${n}`);
  }

  // 2. HN counter doc must be absent
  console.log('\n[verify] HN counter:');
  const counterSnap = await dataCol(db, 'be_customer_counter').doc('counter').get();
  const counterOK = !counterSnap.exists;
  console.log(`  ${counterOK ? '✓' : '✗'} be_customer_counter/counter ${counterOK ? 'absent (next HN → LC-26000001)' : 'STILL EXISTS: ' + JSON.stringify(counterSnap.data())}`);

  // 3. Audit doc must be present
  console.log('\n[verify] Audit doc (latest):');
  const auditSnap = await dataCol(db, 'be_admin_audit')
    .where('type', '==', 'v82-followup-full-customer-wipe')
    .orderBy('performedAt', 'desc')
    .limit(1)
    .get();
  const auditOK = !auditSnap.empty;
  if (auditOK) {
    const d = auditSnap.docs[0];
    console.log(`  ✓ ${d.id}`);
    console.log(`     scope: ${d.data().scope}`);
    console.log(`     wipedCollections total: ${Object.values(d.data().wipedCollections || {}).reduce((a, b) => a + b, 0)}`);
    console.log(`     hnCounterDeleted: ${d.data().hnCounterDeleted}`);
    console.log(`     nextHN: ${d.data().nextHN}`);
  } else {
    console.log('  ✗ No audit doc found (THIS IS UNEXPECTED)');
  }

  // 4. Preserved collections must still have data (sanity check)
  console.log('\n[verify] PRESERVED collections (must > 0 OR explicitly empty-on-prod):');
  let allPreserved = true;
  for (const col of PRESERVED_SAMPLES) {
    const n = await countDocs(dataCol(db, col));
    console.log(`  ${n > 0 ? '✓' : '⚠'} ${col}: ${n}${n === 0 ? ' (possibly empty in prod — verify if surprising)' : ''}`);
  }

  console.log('\n=== VERIFY RESULT ===');
  if (allZero && counterOK && auditOK) {
    console.log('  ✓ ALL CHECKS PASSED — wipe is clean + recoverable via V81 restore.');
    process.exit(0);
  } else {
    console.log('  ✗ Some checks FAILED — investigate above.');
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => { console.error('FATAL:', err.message || err); process.exit(1); });
}
