#!/usr/bin/env node
// scripts/v81-fix5-cleanup-test-branch.mjs
//
// Rule M one-shot — clean up V81-fix1 test fixture leftover:
//   - be_branches/TEST-V81-TS-BR-1778958484080 (test branch from V81-fix1 verify script)
//   - Re-stamp the 1 customer with branchId='TEST-V81-TS-BR-...' → NAKHON
//   - Audit doc
//
// Two-phase per Rule M (dry-run + --apply).

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const APP_ID = 'loverclinic-opd-4c39b';
const NAKHON = 'BR-1777873556815-26df6480';

function loadEnv() {
  for (const name of ['.env.local.prod', '.env.local', '.env']) {
    try {
      const path = resolve(REPO_ROOT, name);
      const txt = readFileSync(path, 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (!m) continue;
        const [, k, v] = m;
        if (!process.env[k]) process.env[k] = v.replace(/^"|"$/g, '');
      }
      return;
    } catch { /* try next */ }
  }
}

function initAdmin() {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

const PREFIX = `artifacts/${APP_ID}/public/data`;
const TEST_PREFIX_RE = /^(TEST-V81|TEST-V81-TS-|E2E-V81)/;

async function main() {
  const args = process.argv.slice(2);
  const APPLY = args.includes('--apply');
  loadEnv();
  initAdmin();
  const db = getFirestore();

  console.log('\n=== V81-fix5 cleanup — test branch + orphan customer ===');
  console.log(`Mode: ${APPLY ? '🔥 APPLY' : '🔍 DRY-RUN (pass --apply to commit)'}\n`);

  // Find test branches
  const branchSnap = await db.collection(`${PREFIX}/be_branches`).get();
  const testBranches = [];
  for (const d of branchSnap.docs) {
    if (TEST_PREFIX_RE.test(d.id)) {
      testBranches.push({ id: d.id, name: d.data().name || '?' });
    }
  }
  console.log(`Test branches: ${testBranches.length}`);
  for (const b of testBranches) console.log(`  ${b.id} (${b.name})`);

  // Find customers stamped to test branches
  const orphanCustomers = [];
  const custSnap = await db.collection(`${PREFIX}/be_customers`).get();
  for (const d of custSnap.docs) {
    const bid = d.data().branchId || '';
    if (testBranches.some(b => b.id === bid)) {
      orphanCustomers.push({ id: d.id, branchId: bid, hn: d.data().customerHN || d.data().hn || '?' });
    }
  }
  console.log(`\nCustomers stamped to test branches: ${orphanCustomers.length}`);
  for (const c of orphanCustomers.slice(0, 10)) console.log(`  ${c.id} | HN ${c.hn} | branchId=${c.branchId}`);

  if (!APPLY) {
    console.log('\nDRY-RUN complete. Re-run with --apply.');
    return;
  }

  // Apply
  console.log('\n🔥 APPLY — re-stamping orphan customers to NAKHON...');
  for (const c of orphanCustomers) {
    await db.doc(`${PREFIX}/be_customers/${c.id}`).update({
      branchId: NAKHON,
      branchIdSource: 'v81-fix5-restamp-from-test-fixture',
      _v81fix5RestampedAt: FieldValue.serverTimestamp(),
      _v81fix5LegacyBranchId: c.branchId,
    });
    console.log(`  restamped ${c.id}: ${c.branchId} → ${NAKHON}`);
  }

  console.log('\n🔥 APPLY — deleting test branches...');
  for (const b of testBranches) {
    await db.doc(`${PREFIX}/be_branches/${b.id}`).delete();
    console.log(`  deleted ${b.id} (${b.name})`);
  }

  // Audit
  const auditId = `v81-fix5-cleanup-test-branch-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${PREFIX}/be_admin_audit/${auditId}`).set({
    op: 'v81-fix5-cleanup-test-branch',
    deletedTestBranches: testBranches.map(b => b.id),
    restampedCustomerCount: orphanCustomers.length,
    restampedCustomerIds: orphanCustomers.map(c => c.id),
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`\n📝 Audit doc: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
