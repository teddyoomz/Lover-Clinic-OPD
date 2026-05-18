#!/usr/bin/env node
// scripts/v81-fix5-stress-with-user-simulation.mjs
//
// V81-fix5 Feature E enhanced — wipe-restore stress loop with USER SIMULATION
// per user directive 2026-05-17 EOD+2 LATE:
//   "ลูกค้าที่สร้างใหม่เป็นแบบไฟล์เดียว ก็จ้องทดลองถอดออกใส่ใหม่รัวๆๆๆ หลายๆรอบ
//    ผ่าน User Stimulate ราวกัย user เป็นคนกดด้วย"
//
// Each cycle:
//   1. User Simulation — create 3 TEST-V81-FIX5- customers via the same
//      shape addCustomer() produces (branchId stamped from non-NAKHON branches
//      to exercise non-default cases)
//   2. Capture pre-state (counts + Auth + sample uids + sample docs + 3 test customer branchIds)
//   3. Backup whole-system
//   4. Restore Replace mode (V81-fix4 default — Auth preserved, branchesMap reachable)
//   5. Capture post-state
//   6. Verify:
//      - Doc count equal
//      - Auth count equal + sample uids preserved
//      - 3 test customers restored with EXACT same branchId
//      - test customers' branchId still resolves in be_branches (no orphan)
//      - branchesMap lookup yields actual NAME (not raw BR-... ID) — Bug "ขึ้นสาขามั่ว"
//   7. Cleanup test customers (avoid prod data pollution)
//   8. If clean → cycle_clean++; else log + EXIT for triage
//
// Bypasses Vercel 5-min timeout by calling executors directly via admin SDK.

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
const TEST_PREFIX = 'TEST-V81-FIX5-CUST-';

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

const KEY_COLLECTIONS = [
  'be_customers', 'be_staff', 'be_doctors', 'be_branches',
  'be_treatments', 'be_sales', 'be_appointments',
  'be_products', 'be_courses',
];

async function loadBranches(db) {
  const snap = await db.collection(`${PREFIX}/be_branches`).get();
  const branches = [];
  for (const d of snap.docs) {
    branches.push({ id: d.id, name: d.data().name || '?', isDefault: !!d.data().isDefault });
  }
  return branches;
}

function buildBranchesMap(branches) {
  const map = new Map();
  for (const b of branches) {
    if (b.id) map.set(b.id, { id: b.id, name: b.name });
  }
  return map;
}

async function userSimulationCreate(db, branches, cycleNum) {
  // Create 3 test customers — one per non-NAKHON branch (to exercise non-default branchId stamping)
  const nakhon = 'BR-1777873556815-26df6480';
  const nonNakhon = branches.filter(b => b.id !== nakhon);
  const targets = nonNakhon.length >= 2 ? nonNakhon.slice(0, 3) : [...nonNakhon, ...branches.slice(0, 3 - nonNakhon.length)];
  const created = [];
  for (let i = 0; i < Math.min(3, targets.length); i++) {
    const branch = targets[i];
    const cid = `${TEST_PREFIX}c${cycleNum}-${i}-${randomBytes(3).toString('hex')}`;
    // Mirror addCustomer() output shape — same fields the UI would produce
    await db.doc(`${PREFIX}/be_customers/${cid}`).set({
      branchId: branch.id,
      branchIdSource: 'user-sim-create-cycle-' + cycleNum,
      customerHN: `T${cycleNum}-${i}`,
      firstname: `TestFirst${i}`,
      lastname: `TestLast${i}`,
      patientData: { firstNameTh: `ทดสอบ${i}`, lastNameTh: `ลูกค้า${i}`, prefix: 'นาย' },
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'stress-loop-user-sim',
      _testFixture: 'V81-fix5-stress',
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
  const docCounts = {};
  for (const col of KEY_COLLECTIONS) {
    const snap = await db.collection(`${PREFIX}/${col}`).get();
    docCounts[col] = snap.size;
  }
  let authCount = 0;
  const sampleAuth = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    authCount += page.users.length;
    for (const u of page.users) {
      if (sampleAuth.length < 5) sampleAuth.push({ uid: u.uid, email: u.email || '' });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return { docCounts, authCount, sampleAuth };
}

async function verifyTestCustomersAfterRestore(db, expected, branches) {
  const branchesMap = buildBranchesMap(branches);
  const issues = [];
  for (const tc of expected) {
    const doc = await db.doc(`${PREFIX}/be_customers/${tc.id}`).get();
    if (!doc.exists) {
      issues.push(`test customer ${tc.id} DISAPPEARED post-restore`);
      continue;
    }
    const data = doc.data();
    if (data.branchId !== tc.branchId) {
      issues.push(`test customer ${tc.id} branchId DRIFT: expected=${tc.branchId} got=${data.branchId}`);
    }
    // Verify branchId still resolves to a branch name (no orphan; V81-fix5 bug check)
    const resolved = branchesMap.get(data.branchId);
    if (!resolved) {
      issues.push(`test customer ${tc.id} branchId=${data.branchId} is ORPHAN — not in be_branches`);
    } else if (resolved.name !== tc.branchName) {
      issues.push(`test customer ${tc.id} branch NAME drift: expected=${tc.branchName} got=${resolved.name}`);
    }
  }
  return issues;
}

async function runCycle(cycleNum, db, storage, auth) {
  console.log(`\n${'='.repeat(60)}\n🔁 CYCLE ${cycleNum} starting at ${new Date().toISOString()}\n${'='.repeat(60)}`);

  const branches = await loadBranches(db);
  console.log(`[branches] ${branches.length} branches loaded`);

  // User Simulation: create test customers with non-NAKHON branchIds
  console.log('\n[user-sim] Creating 3 test customers with non-default branchIds...');
  const testCustomers = await userSimulationCreate(db, branches, cycleNum);
  for (const tc of testCustomers) console.log(`  + ${tc.id} → branch="${tc.branchName}" (${tc.branchId})`);

  // Pre-state
  const preState = await captureState(db, auth);
  console.log(`\n[pre] docs total: ${Object.values(preState.docCounts).reduce((a,b)=>a+b,0)} | auth: ${preState.authCount} | customers: ${preState.docCounts.be_customers}`);

  // Backup
  console.log('\n[backup] Running whole-system backup...');
  const tBackup = Date.now();
  const { runWholeSystemBackup } = await import('../api/admin/_lib/wholeSystemBackupExecutor.js');
  const backupResult = await runWholeSystemBackup({
    db, storage, auth, type: 'manual',
    createdBy: `stress-v81-fix5-cycle-${cycleNum}`,
    runCleanup: false,
  });
  console.log(`[backup] ✓ ${backupResult.name} | ${((Date.now()-tBackup)/1000).toFixed(1)}s | failed cols: ${backupResult.failedCollections.length}`);

  // Restore (V81-fix4 default — Auth preserved)
  console.log('\n[restore] Replace mode (replaceAuthFromBackup=false)...');
  const tRestore = Date.now();
  const { runWholeSystemRestore } = await import('../api/admin/_lib/wholeSystemRestoreExecutor.js');
  const restoreResult = await runWholeSystemRestore({
    db, storage, auth,
    backupRef: backupResult.name,
    mode: 'replace',
    callerUid: '__stress-fake-uid__',
    sendPasswordResetEmails: false,
    ackPasswordResetRequired: false,
    replaceAuthFromBackup: false,
  });
  console.log(`[restore] ✓ Replace done | auth ${restoreResult.stats.skipped ? 'PRESERVED' : 'restored'} | ${((Date.now()-tRestore)/1000).toFixed(1)}s`);

  // Post-state
  const postState = await captureState(db, auth);
  console.log(`\n[post] docs total: ${Object.values(postState.docCounts).reduce((a,b)=>a+b,0)} | auth: ${postState.authCount} | customers: ${postState.docCounts.be_customers}`);

  // Verify
  const issues = [];

  // Doc counts equal
  for (const col of KEY_COLLECTIONS) {
    if (preState.docCounts[col] !== postState.docCounts[col]) {
      issues.push(`docCount.${col}: pre=${preState.docCounts[col]} post=${postState.docCounts[col]}`);
    }
  }
  // Auth equal
  if (preState.authCount !== postState.authCount) {
    issues.push(`authCount: pre=${preState.authCount} post=${postState.authCount}`);
  }
  // Sample auth preserved
  const postUids = new Set(postState.sampleAuth.map(u => u.uid));
  for (const pu of preState.sampleAuth) {
    if (!postUids.has(pu.uid)) issues.push(`auth uid disappeared: ${pu.uid}`);
  }
  // Test customers preserved + branchId intact + branchName resolves
  const branchesPost = await loadBranches(db);
  const tcIssues = await verifyTestCustomersAfterRestore(db, testCustomers, branchesPost);
  issues.push(...tcIssues);

  // Cleanup
  console.log('\n[cleanup] Removing test customers...');
  const deletedCount = await cleanupTestCustomers(db);
  console.log(`[cleanup] deleted ${deletedCount} test customers`);

  // Cleanup the backup + auto-pre-backup (avoid storage clutter)
  try {
    await storage.deleteFiles({ prefix: `backups/whole-system/${backupResult.name}/` });
    if (restoreResult.autoBackupRef) {
      await storage.deleteFiles({ prefix: `backups/whole-system/${restoreResult.autoBackupRef}/` });
    }
  } catch { /* tolerant */ }

  if (issues.length === 0) {
    console.log(`\n✅ CYCLE ${cycleNum} CLEAN — all checks pass`);
  } else {
    console.log(`\n❌ CYCLE ${cycleNum} DIRTY (${issues.length} issues):`);
    for (const i of issues) console.log(`   - ${i}`);
  }

  return { cycleNum, success: issues.length === 0, issues, backupRef: backupResult.name };
}

async function main() {
  const args = process.argv.slice(2);
  const argMap = Object.fromEntries(args.map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }));
  const TOTAL_CYCLES = parseInt(argMap.cycles || '10', 10);
  const START_FROM = parseInt(argMap['start-from'] || '1', 10);
  loadEnv();
  initAdmin();
  const db = getFirestore();
  const storage = getStorage().bucket();
  const auth = getAuth();

  console.log('\n=== V81-fix5 Stress Loop with User Simulation ===');
  console.log(`Target: ${TOTAL_CYCLES} clean cycles`);

  const results = [];
  let cleanStreak = 0;
  for (let i = START_FROM; i <= TOTAL_CYCLES; i++) {
    try {
      const r = await runCycle(i, db, storage, auth);
      results.push(r);
      if (r.success) {
        cleanStreak += 1;
        if (cleanStreak >= TOTAL_CYCLES) {
          console.log(`\n🎉 ${TOTAL_CYCLES} CLEAN CYCLES — STOP CRITERIA MET`);
          break;
        }
      } else {
        console.log(`\n❗ Cycle ${i} dirty — stopping. Resume with --start-from=${i}`);
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

  const reportPath = resolve(REPO_ROOT, `scripts/.tmp-stress-fix5-report-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify({ results }, null, 2));
  console.log(`\nReport: ${reportPath}`);
  console.log(`\nDone. cleanStreak=${cleanStreak}/${TOTAL_CYCLES}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
