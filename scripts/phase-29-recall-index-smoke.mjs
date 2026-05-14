#!/usr/bin/env node
// scripts/phase-29-recall-index-smoke.mjs
//
// Phase 29.21-fix1 (2026-05-14) — POST-DEPLOY real-query smoke for be_recalls
// composite indexes. Fills a gap exposed by user incident: vitest tests +
// admin-SDK e2e (doc.get/doc.set) + post-deploy probes (anon POST) all PASSED
// while real client-SDK compound queries returned "index currently building"
// for ~minutes after deploy.
//
// Runs each compound query shape that the live UI will issue against real
// prod Firestore via admin-SDK. Admin SDK and client SDK both consult the
// same composite indexes, so this surfaces index-not-ready / index-mismatch
// before users hit it.
//
// Use as part of post-deploy verification for ANY feature that adds a NEW
// collection with compound queries (where + orderBy on different fields, or
// multi-where). Per Rule P class-of-bug: "compound query deployed before
// index ready" is a real-world failure mode that test-mocks can't catch.
//
// Usage:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/phase-29-recall-index-smoke.mjs
//
// Output: 3 query attempts; all should succeed for healthy state. If any
// returns "Index is still BUILDING", wait 1-2 min and retry. If returns
// any other error, investigate (likely index-shape mismatch in
// firestore.indexes.json vs query).
//
// Reuses exact env-loading pattern from scripts/phase-29-recall-e2e-real-prod.mjs.

import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

const { initializeApp, cert, getApps } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');

const privateKey = rawKey.replace(/\\n/g, '\n');
if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId: APP_ID, clientEmail, privateKey }) });
}
const db = getFirestore();

const basePath = `artifacts/${APP_ID}/public/data`;

async function tryQuery(label, queryBuilder) {
  console.log(`\n${label}`);
  try {
    const snap = await queryBuilder().get();
    console.log(`  ✅ Query succeeded — ${snap.size} docs. Index READY.`);
    return true;
  } catch (err) {
    const msg = err.message || String(err);
    console.log(`  ❌ Query failed: ${msg.slice(0, 250)}`);
    if (/index/i.test(msg) && /building|require/i.test(msg)) {
      console.log(`  → Index is still BUILDING.`);
    }
    return false;
  }
}

await tryQuery(
  '1. where(branchId,==,X).orderBy(recallDate,asc)  [Backend tab default]',
  () => db.collection(`${basePath}/be_recalls`).where('branchId', '==', 'TEST').orderBy('recallDate', 'asc'),
);

await tryQuery(
  '2. where(customerId,==,X).orderBy(recallDate,asc)  [CDV per-customer]',
  () => db.collection(`${basePath}/be_recalls`).where('customerId', '==', 'TEST').orderBy('recallDate', 'asc'),
);

await tryQuery(
  '3. where(branchId,==,X).where(status,==,Y).orderBy(recallDate,asc)  [filtered]',
  () => db.collection(`${basePath}/be_recalls`).where('branchId', '==', 'TEST').where('status', '==', 'pending').orderBy('recallDate', 'asc'),
);

process.exit(0);
