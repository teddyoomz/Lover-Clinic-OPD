#!/usr/bin/env node
// scripts/v81-fix6-customer-only-stress-loop.mjs
//
// V81-fix6 stress test for CUSTOMER-ONLY backup + restore cycle.
// Mirrors V81-fix5 stress loop but uses customer-only scope:
//   1. User Simulation — create 3 TEST-V81-FIX6- customers in non-NAKHON branches
//   2. Capture pre-state (customer count + auth count + sample customer doc shapes)
//   3. Customer-only backup via runWholeSystemBackup({ scope: 'customer-only' })
//   4. Customer-only restore Replace via runWholeSystemRestore({ scope: 'customer-only' })
//   5. Capture post-state
//   6. Verify:
//      - Customer count equal pre + post
//      - Auth count UNCHANGED (customer-only NEVER touches Auth)
//      - Non-customer collections (be_staff, be_products) UNCHANGED
//      - Test customers preserved + branchId intact
//   7. Cleanup test customers + cycle's backups

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const TEST_PREFIX = 'TEST-V81-FIX6-CUST-';

function loadEnv() {
  for (const name of ['.env.local.prod', '.env.local', '.env']) {
    try {
      const txt = readFileSync(resolve(REPO_ROOT, name), 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (!m) continue;
        if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
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

// Collections that customer-only should TOUCH (counts may change)
const CUSTOMER_COLS = ['be_customers'];
// Collections that customer-only should NOT TOUCH (counts MUST be invariant)
const UNTOUCHED_COLS = ['be_staff', 'be_doctors', 'be_branches', 'be_products', 'be_courses'];

async function loadBranches(db) {
  const snap = await db.collection(`${PREFIX}/be_branches`).get();
  return snap.docs.map(d => ({ id: d.id, name: d.data().name || '?' }));
}

async function userSimulationCreate(db, branches, cycleNum) {
  const nakhon = 'BR-1777873556815-26df6480';
  const nonNakhon = branches.filter(b => b.id !== nakhon);
  const targets = nonNakhon.slice(0, 3);
  if (targets.length === 0) targets.push(...branches.slice(0, 1));
  const created = [];
  for (let i = 0; i < Math.min(3, targets.length); i++) {
    const branch = targets[i];
    const cid = `${TEST_PREFIX}c${cycleNum}-${i}-${randomBytes(3).toString('hex')}`;
    await db.doc(`${PREFIX}/be_customers/${cid}`).set({
      branchId: branch.id,
      branchIdSource: `user-sim-cycle-${cycleNum}`,
      customerHN: `T${cycleNum}-${i}`,
      firstname: `TestFirstFix6-${i}`,
      lastname: `TestLastFix6-${i}`,
      patientData: { firstNameTh: `ทดสอบFix6-${i}`, lastNameTh: `ลูกค้า${i}`, prefix: 'นาย' },
      createdAt: FieldValue.serverTimestamp(),
      createdBy: `stress-fix6-loop-cycle-${cycleNum}`,
      _testFixture: 'V81-fix6-stress',
    });
    created.push({ id: cid, branchId: branch.id, branchName: branch.name });
  }
  return created;
}

async function cleanupTestCustomers(db) {
  const snap = await db.collection(`${PREFIX}/be_customers`).get();
  let deleted = 0;
  for (const d of snap.docs) {
    if (d.id.startsWith(TEST_PREFIX)) {
      await d.ref.delete();
      deleted += 1;
    }
  }
  return deleted;
}

async function captureState(db, auth) {
  const counts = {};
  for (const col of [...CUSTOMER_COLS, ...UNTOUCHED_COLS]) {
    const snap = await db.collection(`${PREFIX}/${col}`).get();
    counts[col] = snap.size;
  }
  let authCount = 0;
  const sampleAuth = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    authCount += page.users.length;
    for (const u of page.users) if (sampleAuth.length < 3) sampleAuth.push(u.uid);
    pageToken = page.pageToken;
  } while (pageToken);
  return { counts, authCount, sampleAuth };
}

async function runCycle(cycleNum, db, storage, auth) {
  console.log(`\n${'='.repeat(60)}\n🔁 CYCLE ${cycleNum} starting at ${new Date().toISOString()}\n${'='.repeat(60)}`);

  const branches = await loadBranches(db);
  console.log(`[branches] ${branches.length} branches`);

  // User Simulation — create test customers
  const testCustomers = await userSimulationCreate(db, branches, cycleNum);
  console.log(`\n[user-sim] Created ${testCustomers.length} test customers`);
  for (const tc of testCustomers) console.log(`  + ${tc.id} → ${tc.branchName} (${tc.branchId})`);

  // Pre-state
  const preState = await captureState(db, auth);
  console.log(`\n[pre] customers: ${preState.counts.be_customers} | auth: ${preState.authCount} | staff: ${preState.counts.be_staff} | products: ${preState.counts.be_products}`);

  // Customer-only Backup
  console.log('\n[backup] Customer-only backup (scope=customer-only)...');
  const tB = Date.now();
  const { runWholeSystemBackup } = await import('../api/admin/_lib/wholeSystemBackupExecutor.js');
  const backupResult = await runWholeSystemBackup({
    db, storage, auth, type: 'manual',
    createdBy: `stress-fix6-cycle-${cycleNum}`,
    runCleanup: false,
    scope: 'customer-only',
  });
  console.log(`[backup] ✓ ${backupResult.name} | scope=${backupResult.scope} | ${((Date.now() - tB) / 1000).toFixed(1)}s | failed: ${backupResult.failedCollections.length}`);

  // Customer-only Restore Replace
  console.log('\n[restore] Customer-only Replace (Auth NEVER touched)...');
  const tR = Date.now();
  const { runWholeSystemRestore } = await import('../api/admin/_lib/wholeSystemRestoreExecutor.js');
  const restoreResult = await runWholeSystemRestore({
    db, storage, auth,
    backupRef: backupResult.name,
    mode: 'replace',
    callerUid: '__stress-fake__',
    sendPasswordResetEmails: false,
    ackPasswordResetRequired: false,
    replaceAuthFromBackup: false,
    scope: 'customer-only',
  });
  console.log(`[restore] ✓ Replace done | auth ${restoreResult.stats.skipped ? 'PRESERVED' : 'TOUCHED'} | restored: ${restoreResult.stats.restoredDocs} | ${((Date.now() - tR) / 1000).toFixed(1)}s`);

  // Post-state
  const postState = await captureState(db, auth);
  console.log(`\n[post] customers: ${postState.counts.be_customers} | auth: ${postState.authCount} | staff: ${postState.counts.be_staff} | products: ${postState.counts.be_products}`);

  // Verify
  const issues = [];
  if (preState.counts.be_customers !== postState.counts.be_customers) {
    issues.push(`customer count: pre=${preState.counts.be_customers} post=${postState.counts.be_customers}`);
  }
  // Auth invariant (customer-only NEVER touches Auth)
  if (preState.authCount !== postState.authCount) {
    issues.push(`auth count CHANGED (customer-only must NOT touch Auth): pre=${preState.authCount} post=${postState.authCount}`);
  }
  // Untouched collections must be invariant
  for (const col of UNTOUCHED_COLS) {
    if (preState.counts[col] !== postState.counts[col]) {
      issues.push(`${col} CHANGED (customer-only must NOT touch): pre=${preState.counts[col]} post=${postState.counts[col]}`);
    }
  }
  // Auth restore status flag — MUST be skipped
  if (!restoreResult.stats.skipped) {
    issues.push(`restore stats.skipped=false (Auth was touched — V81-fix6 violation)`);
  }
  // Test customers preserved
  for (const tc of testCustomers) {
    const doc = await db.doc(`${PREFIX}/be_customers/${tc.id}`).get();
    if (!doc.exists) {
      issues.push(`test customer ${tc.id} DISAPPEARED`);
    } else if (doc.data().branchId !== tc.branchId) {
      issues.push(`test customer ${tc.id} branchId drift: expected=${tc.branchId} got=${doc.data().branchId}`);
    }
  }

  // Cleanup
  const deleted = await cleanupTestCustomers(db);
  console.log(`\n[cleanup] deleted ${deleted} test customers`);
  try {
    await storage.deleteFiles({ prefix: `backups/customer-only/${backupResult.name}/` });
    if (restoreResult.autoBackupRef) {
      await storage.deleteFiles({ prefix: `backups/customer-only/${restoreResult.autoBackupRef}/` });
    }
  } catch { /* tolerant */ }

  if (issues.length === 0) {
    console.log(`\n✅ CYCLE ${cycleNum} CLEAN`);
  } else {
    console.log(`\n❌ CYCLE ${cycleNum} DIRTY (${issues.length}):`);
    for (const i of issues) console.log(`   - ${i}`);
  }
  return { cycleNum, success: issues.length === 0, issues };
}

async function main() {
  const args = process.argv.slice(2);
  const argMap = Object.fromEntries(args.map(a => { const [k,v]=a.replace(/^--/,'').split('='); return [k, v ?? 'true']; }));
  const TOTAL = parseInt(argMap.cycles || '10', 10);
  loadEnv(); initAdmin();
  const db = getFirestore();
  const storage = getStorage().bucket();
  const auth = getAuth();

  console.log(`\n=== V81-fix6 Customer-Only Stress Loop ===\nTarget: ${TOTAL} CLEAN cycles\n`);

  const results = [];
  let cleanStreak = 0;
  for (let i = 1; i <= TOTAL; i++) {
    try {
      const r = await runCycle(i, db, storage, auth);
      results.push(r);
      if (r.success) {
        cleanStreak += 1;
        if (cleanStreak >= TOTAL) {
          console.log(`\n🎉 ${TOTAL} CLEAN CYCLES — STOP CRITERIA MET`);
          break;
        }
      } else {
        console.log(`\n❗ Cycle ${i} dirty — stopping`);
        break;
      }
    } catch (e) {
      console.log(`\n💥 Cycle ${i} EXCEPTION: ${e.message}\n${e.stack}`);
      results.push({ cycleNum: i, exception: e.message });
      break;
    }
  }

  console.log('\n\n=== SUMMARY ===');
  for (const r of results) {
    const flag = r.exception ? '💥' : r.success ? '✅' : '❌';
    console.log(`  ${flag} Cycle ${r.cycleNum}: ${r.exception || (r.success ? 'CLEAN' : `${r.issues.length} issues`)}`);
  }

  const reportPath = resolve(REPO_ROOT, `scripts/.tmp-stress-fix6-report-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify({ results }, null, 2));
  console.log(`\nReport: ${reportPath}\ncleanStreak=${cleanStreak}/${TOTAL}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
