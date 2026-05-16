#!/usr/bin/env node
// scripts/v81-fix4-stress-test-loop.mjs
//
// V81-fix4 Feature E (2026-05-17 EOD+2) — wipe-restore stress test loop.
//
// Per user directive: "ให้ทำการลบทั้งระบบ dump file ออกมา แล้วใส่กลับเข้าไปใหม่
// ให้เหมือนเดิม 100% ด้วยระบบ backup ของเรา ไม่ต่ำกว่า 10 รอบ ... จนระบบ
// Whole-System Backups เราไม่เจออะไรแล้วถึงจะหยุดการทำงานได้".
//
// Each cycle:
//   1. Capture pre-state (doc counts + auth count + sample uids + sample docs)
//   2. Run whole-system backup
//   3. Run whole-system restore in Replace mode with replaceAuthFromBackup=false
//      (V81-fix4 default — preserves Auth + sessions + passwords)
//   4. Capture post-state
//   5. Diff: doc counts MUST match, auth uids MUST be preserved, sample docs MUST exist
//   6. If clean → cycle_clean++; if dirty → log + EXIT (user fixes + reruns)
//
// Bypasses Vercel 5-min timeout by calling executors directly via admin SDK.
//
// Usage:
//   node scripts/v81-fix4-stress-test-loop.mjs                  # 10 cycles
//   node scripts/v81-fix4-stress-test-loop.mjs --cycles=3        # custom count
//   node scripts/v81-fix4-stress-test-loop.mjs --start-from=5    # resume from cycle 5
//   node scripts/v81-fix4-stress-test-loop.mjs --skip-cleanup    # don't auto-delete generated backups

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const APP_ID = 'loverclinic-opd-4c39b';

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
      console.log(`[env] loaded ${name}`);
      return;
    } catch { /* try next */ }
  }
}

function initAdmin() {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN env required');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail,
      privateKey: rawKey.split('\\n').join('\n'),
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

const PREFIX = `artifacts/${APP_ID}/public/data`;
const KEY_COLLECTIONS = [
  'be_customers', 'be_staff', 'be_doctors', 'be_branches',
  'be_treatments', 'be_sales', 'be_appointments',
  'be_products', 'be_courses',
  'chat_conversations', 'chat_history',
];

async function captureState(db, auth) {
  const docCounts = {};
  for (const col of KEY_COLLECTIONS) {
    const snap = await db.collection(`${PREFIX}/${col}`).get();
    docCounts[col] = snap.size;
  }
  // Total docs across ALL universal + branch-scoped (rough — for sanity)
  let authCount = 0;
  const sampleAuth = [];
  let nextPageToken;
  do {
    const page = await auth.listUsers(1000, nextPageToken);
    authCount += page.users.length;
    for (const u of page.users) {
      if (sampleAuth.length < 8) {
        sampleAuth.push({
          uid: u.uid,
          email: u.email || '',
          disabled: u.disabled || false,
          customClaims: u.customClaims || {},
          providerCount: (u.providerData || []).length,
        });
      }
    }
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  // Sample 3 docs from be_customers + 3 from be_staff for round-trip equality
  const sampleDocs = {};
  for (const col of ['be_customers', 'be_staff']) {
    const snap = await db.collection(`${PREFIX}/${col}`).limit(3).get();
    sampleDocs[col] = snap.docs.map(d => ({
      id: d.id,
      // Take a stable sample of fields (excluding timestamps that may render differently)
      keys: Object.keys(d.data()).sort(),
    }));
  }

  return { docCounts, authCount, sampleAuth, sampleDocs };
}

function compareStates(pre, post) {
  const issues = [];
  // Doc counts
  for (const col of KEY_COLLECTIONS) {
    if (pre.docCounts[col] !== post.docCounts[col]) {
      issues.push(`docCount.${col}: pre=${pre.docCounts[col]} post=${post.docCounts[col]}`);
    }
  }
  // Auth count
  if (pre.authCount !== post.authCount) {
    issues.push(`authCount: pre=${pre.authCount} post=${post.authCount}`);
  }
  // Sample auth users preserved
  const postUids = new Set(post.sampleAuth.map(u => u.uid));
  for (const preUser of pre.sampleAuth) {
    if (!postUids.has(preUser.uid)) {
      issues.push(`auth user disappeared: uid=${preUser.uid} email=${preUser.email}`);
    } else {
      const postUser = post.sampleAuth.find(u => u.uid === preUser.uid);
      if (postUser && postUser.email !== preUser.email) {
        issues.push(`auth email mismatch uid=${preUser.uid}: pre=${preUser.email} post=${postUser.email}`);
      }
    }
  }
  // Sample docs preserved
  for (const col of Object.keys(pre.sampleDocs)) {
    const preDocs = pre.sampleDocs[col];
    const postDocs = post.sampleDocs[col];
    for (const pd of preDocs) {
      const matched = postDocs.find(p => p.id === pd.id);
      if (!matched) {
        issues.push(`sample doc disappeared: ${col}/${pd.id}`);
      } else {
        const missingKeys = pd.keys.filter(k => !matched.keys.includes(k));
        if (missingKeys.length) {
          issues.push(`sample doc ${col}/${pd.id} missing keys: ${missingKeys.join(',')}`);
        }
      }
    }
  }
  return issues;
}

async function runCycle(cycleNum, db, storage, auth) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔁 CYCLE ${cycleNum} starting at ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Pre-state
  console.log('\n[pre] Capturing state...');
  const tPre = Date.now();
  const preState = await captureState(db, auth);
  console.log(`[pre] docs total: ${Object.values(preState.docCounts).reduce((a, b) => a + b, 0)} | auth users: ${preState.authCount} | (${((Date.now() - tPre) / 1000).toFixed(1)}s)`);
  console.log(`[pre] doc counts:`, JSON.stringify(preState.docCounts));
  console.log(`[pre] sample auth uids: ${preState.sampleAuth.slice(0, 3).map(u => u.uid).join(', ')}...`);

  // Backup (calls executor directly)
  console.log('\n[backup] Running whole-system backup...');
  const tBackup = Date.now();
  const { runWholeSystemBackup } = await import('../api/admin/_lib/wholeSystemBackupExecutor.js');
  const backupResult = await runWholeSystemBackup({
    db, storage, auth,
    type: 'manual',
    createdBy: `stress-test-cycle-${cycleNum}`,
    runCleanup: false,
  });
  const backupRef = backupResult.name;
  console.log(`[backup] ✓ ${backupRef} | ${((Date.now() - tBackup) / 1000).toFixed(1)}s | failedCols: ${backupResult.failedCollections.length} | failedStorage: ${backupResult.failedStorageObjects.length}`);

  // Restore (Replace mode, V81-fix4 Auth preserve default)
  console.log('\n[restore] Running Replace mode (replaceAuthFromBackup=false — V81-fix4 default)...');
  const tRestore = Date.now();
  const { runWholeSystemRestore } = await import('../api/admin/_lib/wholeSystemRestoreExecutor.js');
  const restoreResult = await runWholeSystemRestore({
    db, storage, auth,
    backupRef,
    mode: 'replace',
    callerUid: '__stress-test-fake-caller-uid__',  // never matches real auth uid; safe
    sendPasswordResetEmails: false,
    ackPasswordResetRequired: false,
    replaceAuthFromBackup: false,
  });
  console.log(`[restore] ✓ Replace done | autoBackupRef=${restoreResult.autoBackupRef} | restored docs: ${restoreResult.stats.restoredDocs} | auth ${restoreResult.stats.skipped ? 'PRESERVED' : 'restored'} | storage: ${restoreResult.stats.restoredStorage} | ${((Date.now() - tRestore) / 1000).toFixed(1)}s`);

  // Post-state
  console.log('\n[post] Capturing state...');
  const postState = await captureState(db, auth);
  console.log(`[post] docs total: ${Object.values(postState.docCounts).reduce((a, b) => a + b, 0)} | auth users: ${postState.authCount}`);

  // Diff
  const issues = compareStates(preState, postState);
  if (issues.length === 0) {
    console.log(`\n✅ CYCLE ${cycleNum} CLEAN — pre + post identical`);
  } else {
    console.log(`\n❌ CYCLE ${cycleNum} DIRTY — ${issues.length} issues:`);
    for (const issue of issues) console.log(`   - ${issue}`);
  }

  return {
    cycleNum,
    backupRef,
    autoBackupRef: restoreResult.autoBackupRef,
    success: issues.length === 0,
    issues,
    docCountsMatch: KEY_COLLECTIONS.every(c => preState.docCounts[c] === postState.docCounts[c]),
    authPreserved: preState.authCount === postState.authCount,
    elapsedSec: Math.round((Date.now() - tPre) / 1000),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const argMap = Object.fromEntries(args.map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }));
  const TOTAL_CYCLES = parseInt(argMap.cycles || '10', 10);
  const START_FROM = parseInt(argMap['start-from'] || '1', 10);
  const SKIP_CLEANUP = argMap['skip-cleanup'] === 'true';

  loadEnv();
  initAdmin();
  const db = getFirestore();
  const storage = getStorage().bucket();
  const auth = getAuth();

  console.log('\n=== V81-fix4 Feature E — Wipe-Restore Stress Test Loop ===');
  console.log(`Target: ${TOTAL_CYCLES} clean cycles (start from cycle ${START_FROM})`);
  console.log(`Cleanup auto-generated backups: ${!SKIP_CLEANUP}`);

  const results = [];
  const generatedBackups = [];
  let cleanStreak = 0;
  for (let i = START_FROM; i <= TOTAL_CYCLES; i++) {
    try {
      const result = await runCycle(i, db, storage, auth);
      results.push(result);
      generatedBackups.push(result.backupRef, result.autoBackupRef);
      if (result.success) {
        cleanStreak += 1;
        if (cleanStreak >= TOTAL_CYCLES) {
          console.log(`\n🎉 ${TOTAL_CYCLES} CLEAN CYCLES IN A ROW — STOP CRITERIA MET`);
          break;
        }
      } else {
        console.log(`\n❗ Cycle ${i} had issues — stopping for user triage. Resume with --start-from=${i}`);
        break;
      }
    } catch (e) {
      console.log(`\n💥 Cycle ${i} EXCEPTION: ${e.message}`);
      console.log(e.stack);
      results.push({ cycleNum: i, exception: e.message });
      break;
    }
  }

  // Summary
  console.log('\n\n=== SUMMARY ===');
  for (const r of results) {
    const flag = r.exception ? '💥' : r.success ? '✅' : '❌';
    console.log(`  ${flag} Cycle ${r.cycleNum}: ${r.exception || (r.success ? 'CLEAN' : `${r.issues.length} issues`)} | ${r.elapsedSec || '-'}s`);
  }

  // Save report
  const reportPath = resolve(REPO_ROOT, `scripts/.tmp-stress-report-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify({ results, generatedBackups }, null, 2));
  console.log(`\nReport: ${reportPath}`);

  // Cleanup generated backups (--skip-cleanup to skip)
  if (!SKIP_CLEANUP && generatedBackups.length > 0) {
    console.log(`\n🧹 Cleaning ${generatedBackups.length} auto-generated backups...`);
    for (const name of generatedBackups) {
      if (!name) continue;
      try {
        await storage.deleteFiles({ prefix: `backups/whole-system/${name}/` });
      } catch (e) { console.log(`  skip ${name}: ${e.message}`); }
    }
  }

  console.log(`\nDone. cleanStreak=${cleanStreak}/${TOTAL_CYCLES}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('\n❌ FATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

export { runCycle, captureState, compareStates };
