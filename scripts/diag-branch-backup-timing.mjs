#!/usr/bin/env node
// Diagnostic: time the full T1+T2+T3+T4 backup operation against real prod.
// Helps size the Vercel maxDuration setting correctly.
//
// Mirrors api/admin/branch-backup-export logic but READ-ONLY (no Storage
// upload, no Firestore writes). Just measures time for the data fetch
// portion which is the suspected timeout cause.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveBackupScope, T4_SUBCOLLECTIONS } from '../src/lib/branchBackupCore.js';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2]; if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const TARGET_BRANCH = 'BR-1777873556815-26df6480'; // นครราชสีมา

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
const dataCol = (name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);

async function timed(label, fn) {
  const t0 = Date.now();
  const result = await fn();
  const dt = Date.now() - t0;
  console.log(`  [${(dt/1000).toFixed(2)}s] ${label}`);
  return { dt, result };
}

async function main() {
  console.log('═══ Branch Backup Timing Diag ═══');
  console.log(`Branch: ${TARGET_BRANCH}\n`);

  const scope = resolveBackupScope({ tiers: ['T1', 'T2', 'T3', 'T4'] });
  console.log(`Total scope: ${scope.length} collection slots\n`);

  let totalDocs = 0;
  let totalTime = 0;
  const out = {};

  console.log('─── T1+T2+T3 collections (1 query each) ───');
  for (const colName of scope) {
    if (colName === 'be_customers/__per_customer__') continue;
    const { dt, result } = await timed(colName, async () => {
      const snap = await dataCol(colName).where('branchId', '==', TARGET_BRANCH).get();
      return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    });
    out[colName] = result;
    totalDocs += result.length;
    totalTime += dt;
    console.log(`     → ${result.length} docs`);
  }

  console.log('\n─── T4 — be_customers traversal ───');
  const { dt: customersDt, result: customers } = await timed('be_customers full list', async () => {
    const snap = await dataCol('be_customers').get();
    return snap.docs;
  });
  totalTime += customersDt;
  console.log(`     → ${customers.length} customer docs`);

  console.log(`\n─── T4 — per-customer × per-subcollection (sequential) ───`);
  console.log(`     Will iterate ${customers.length} customers × ${T4_SUBCOLLECTIONS.length} subcollections = ${customers.length * T4_SUBCOLLECTIONS.length} queries`);
  console.log(`     Sampling first 20 customers + extrapolating...`);

  const SAMPLE_SIZE = Math.min(20, customers.length);
  const sampleStart = Date.now();
  let sampleDocCount = 0;
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const cust = customers[i];
    for (const sub of T4_SUBCOLLECTIONS) {
      const subSnap = await cust.ref.collection(sub).where('branchId', '==', TARGET_BRANCH).get();
      sampleDocCount += subSnap.size;
    }
  }
  const sampleDt = Date.now() - sampleStart;
  const avgPerCustomer = sampleDt / SAMPLE_SIZE;
  const projectedT4Dt = avgPerCustomer * customers.length;
  console.log(`     Sample: ${SAMPLE_SIZE} customers × ${T4_SUBCOLLECTIONS.length} subs = ${SAMPLE_SIZE * T4_SUBCOLLECTIONS.length} queries in ${(sampleDt/1000).toFixed(2)}s`);
  console.log(`     Sample docs found: ${sampleDocCount}`);
  console.log(`     Avg per customer: ${avgPerCustomer.toFixed(0)}ms`);
  console.log(`     Projected T4 total: ${(projectedT4Dt/1000).toFixed(1)}s for ${customers.length} customers`);
  totalTime += projectedT4Dt;

  console.log('\n─── T4 — PARALLEL-batched (V40-prod-fix-2 pattern) ───');
  console.log(`     50 customers × 8 subs concurrent per batch`);
  const T4_BATCH_SIZE = 50;
  const parallelStart = Date.now();
  let parallelDocCount = 0;
  for (let i = 0; i < customers.length; i += T4_BATCH_SIZE) {
    const batch = customers.slice(i, i + T4_BATCH_SIZE);
    const batchResults = await Promise.all(batch.flatMap(cust =>
      T4_SUBCOLLECTIONS.map(async sub => {
        const subSnap = await cust.ref.collection(sub).where('branchId', '==', TARGET_BRANCH).get();
        return subSnap.size;
      })
    ));
    parallelDocCount += batchResults.reduce((a, b) => a + b, 0);
  }
  const parallelDt = Date.now() - parallelStart;
  console.log(`     Parallel total: ${(parallelDt/1000).toFixed(2)}s for ${customers.length} customers (${parallelDocCount} docs)`);
  console.log(`     Speedup: ${(projectedT4Dt / parallelDt).toFixed(1)}× over sequential`);

  const totalTimeParallel = totalTime - projectedT4Dt + parallelDt;

  console.log('\n═══ SUMMARY ═══');
  console.log(`Total T1+T2+T3 docs: ${totalDocs}`);
  console.log(`Total customers: ${customers.length}`);
  console.log(`Sequential T4 estimate: ${(projectedT4Dt/1000).toFixed(1)}s`);
  console.log(`Parallel T4 actual:     ${(parallelDt/1000).toFixed(2)}s`);
  console.log(`\nFull backup time SEQUENTIAL: ${(totalTime/1000).toFixed(1)}s`);
  console.log(`Full backup time PARALLEL:   ${(totalTimeParallel/1000).toFixed(1)}s (+ serialization/upload ≈ +5-15s)`);
  console.log(`\nVercel default maxDuration: 10s (Hobby) / 15s (Pro)`);
  console.log(`Vercel max maxDuration: 60s (Hobby) / 300s (Pro)`);
  console.log(`\nWith maxDuration:60 + parallel T4: ${totalTimeParallel/1000 < 50 ? '✅ fits 60s with margin' : totalTimeParallel/1000 < 60 ? '⚠️ fits 60s but tight' : '❌ exceeds 60s'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e.message, '\n', e.stack); process.exit(1); });
}
