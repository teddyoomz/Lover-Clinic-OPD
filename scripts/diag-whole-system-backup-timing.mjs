#!/usr/bin/env node
// Rule R (READ-ONLY) — measure per-step wall time of the V81 backup read sequence
// to confirm the cumulative-timeout root cause (steps 4/5 sequential subcoll reads
// vs the 300s Vercel cap). NO writes (no storage.save) — only the READ pattern,
// which is the expensive part the executor performs identically.
//
// Step 4 (be_customers × 8 subcoll = ~3032 reads) is SAMPLED + extrapolated to
// avoid the diag itself running for minutes.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import {
  UNIVERSAL_COLLECTIONS,
  BRANCH_SCOPED_COLLECTIONS,
  CUSTOMER_SUBCOLLECTIONS,
} from '../src/lib/wholeSystemBackupCore.js';

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
const PREFIX = `artifacts/${APP_ID}/public/data`;

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

async function main() {
  const db = getFirestore();
  console.log('═══ V81 backup READ-sequence timing (READ-ONLY) ═══\n');

  // ── Step 2+3: read all scoped collections sequentially (as executor does) ──
  const scoped = [...UNIVERSAL_COLLECTIONS, ...BRANCH_SCOPED_COLLECTIONS];
  let t = Date.now();
  let totalScopedDocs = 0;
  let slowest = { name: '', sec: 0, docs: 0 };
  for (const colName of scoped) {
    const c0 = Date.now();
    const snap = await db.collection(`${PREFIX}/${colName}`).get();
    const dt = (Date.now() - c0) / 1000;
    totalScopedDocs += snap.size;
    if (dt > slowest.sec) slowest = { name: colName, sec: dt, docs: snap.size };
  }
  const step23Sec = (Date.now() - t) / 1000;
  console.log(`Step 2+3 (read ${scoped.length} scoped collections, ${totalScopedDocs} docs): ${step23Sec.toFixed(1)}s`);
  console.log(`   slowest: ${slowest.name} (${slowest.docs} docs, ${slowest.sec.toFixed(1)}s)`);

  // ── Step 4: be_customers + sampled subcollection reads ──
  t = Date.now();
  const custSnap = await db.collection(`${PREFIX}/be_customers`).get();
  const custReadSec = (Date.now() - t) / 1000;
  const custCount = custSnap.size;
  console.log(`\nStep 4a (be_customers.get(), ${custCount} docs): ${custReadSec.toFixed(1)}s`);

  // SAMPLE: first 30 customers × 8 subcoll = 240 reads, extrapolate to custCount×8
  const SAMPLE_CUST = Math.min(30, custCount);
  const sampleDocs = custSnap.docs.slice(0, SAMPLE_CUST);
  t = Date.now();
  let sampleReads = 0, sampleNonEmpty = 0;
  for (const cd of sampleDocs) {
    for (const sub of CUSTOMER_SUBCOLLECTIONS) {
      const s = await db.collection(`${PREFIX}/be_customers/${cd.id}/${sub}`).get();
      sampleReads++;
      if (!s.empty) sampleNonEmpty++;
    }
  }
  const sampleSec = (Date.now() - t) / 1000;
  const perReadSec = sampleSec / (sampleReads || 1);
  const fullSubReads = custCount * CUSTOMER_SUBCOLLECTIONS.length;
  const step4SubSec = perReadSec * fullSubReads;
  console.log(`Step 4b (subcoll reads, SAMPLED ${sampleReads} reads in ${sampleSec.toFixed(1)}s, ${sampleNonEmpty} non-empty):`);
  console.log(`   per-read: ${perReadSec.toFixed(3)}s → FULL ${fullSubReads} reads (${custCount}×8) ≈ ${step4SubSec.toFixed(0)}s  ← SUSPECT`);

  // ── Step 5: chat_conversations + sampled messages reads ──
  t = Date.now();
  const convSnap = await db.collection(`${PREFIX}/chat_conversations`).get();
  const convReadSec = (Date.now() - t) / 1000;
  const convCount = convSnap.size;
  const SAMPLE_CONV = Math.min(20, convCount);
  t = Date.now();
  for (const cv of convSnap.docs.slice(0, SAMPLE_CONV)) {
    await db.collection(`${PREFIX}/chat_conversations/${cv.id}/messages`).get();
  }
  const convSampleSec = (Date.now() - t) / 1000;
  const perConvSec = convSampleSec / (SAMPLE_CONV || 1);
  const step5Sec = convReadSec + perConvSec * convCount;
  console.log(`\nStep 5 (chat_conversations ${convCount} + messages subcoll): read ${convReadSec.toFixed(1)}s + ${convCount} msg-reads ≈ ${step5Sec.toFixed(0)}s`);

  // ── Step 6: auth.listUsers full ──
  t = Date.now();
  let userCount = 0, pageToken;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    userCount += page.users.length;
    pageToken = page.pageToken;
  } while (pageToken);
  const step6Sec = (Date.now() - t) / 1000;
  console.log(`\nStep 6 (auth.listUsers, ${userCount} users): ${step6Sec.toFixed(1)}s`);

  // ── TOTAL ──
  const total = step23Sec + custReadSec + step4SubSec + step5Sec + step6Sec;
  console.log('\n─────────────────────────────────────────────');
  console.log(`  Step 2+3 collections : ${step23Sec.toFixed(0)}s`);
  console.log(`  Step 4 be_customers  : ${custReadSec.toFixed(0)}s`);
  console.log(`  Step 4 subcoll (×8)  : ${step4SubSec.toFixed(0)}s  ← ${((step4SubSec/total)*100).toFixed(0)}% of total`);
  console.log(`  Step 5 chat          : ${step5Sec.toFixed(0)}s`);
  console.log(`  Step 6 auth          : ${step6Sec.toFixed(0)}s`);
  console.log(`  ESTIMATED READ TOTAL : ${total.toFixed(0)}s  (excludes write/copy/encode/manifest)`);
  console.log(`  Vercel cap           : 300s`);
  console.log(`  >>> ${total > 300 ? '❌ READS ALONE EXCEED 300s — confirmed timeout root cause' : total > 240 ? '⚠ reads near cap; writes+encode push it over' : '✓ reads under cap'}`);
  console.log('─────────────────────────────────────────────');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error('\nFATAL:', e.message); console.error(e.stack); process.exit(1);
  });
}
