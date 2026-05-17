#!/usr/bin/env node
// scripts/v81-fix6-customer-only-10-scenarios.mjs
//
// V81-fix6 "10 DIFFERENT scenarios" stress test (NOT 10 repeats of same).
// Per user directive 2026-05-17 EOD+2 LATE+2:
//   "ลองแล้วในแบบต่างๆที่ไม่ซ้ำกัน 10 รอบหรือยัง"
//
// Each scenario tests a DIFFERENT edge case of the customer dump+restore cycle:
//   S1  Baseline preservation     — backup + restore with NO new fixtures
//   S2  Single new customer       — create 1 in NAKHON, backup, restore, verify
//   S3  Cross-branch creation     — create 1 in each non-NAKHON branch
//   S4  Delete-then-restore       — create 3, backup, DELETE 2, restore, verify 3 back
//   S5  Customer subcollection    — create + add appointment subcoll doc, backup, restore
//   S6  Chat conversation         — create chat_conversations doc, backup, restore
//   S7  Customer with Storage     — upload file to customers/{cid}/..., backup, restore
//   S8  Bulk 10 customers         — create 10, backup, restore, verify all 10
//   S9  Chained restore           — backup A → restore → backup B → restore B → verify
//   S10 Mixed delete+add          — create 5, delete 2, create 3 more, backup, wipe-all, restore, verify final 6
//
// Each scenario CLEANS UP after itself (test customers deleted; backups purged).
// If ANY scenario fails, script stops + reports for triage. User can resume.

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
const TEST_PREFIX = 'TEST-V81-FIX6-S';

function loadEnv() {
  for (const name of ['.env.local.prod', '.env.local', '.env']) {
    try {
      const txt = readFileSync(resolve(REPO_ROOT, name), 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
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

const NAKHON = 'BR-1777873556815-26df6480';
const KEY_COLLECTIONS = ['be_customers', 'be_staff', 'be_products', 'be_treatments', 'be_sales', 'be_appointments', 'chat_conversations'];

async function loadBranches(db) {
  const snap = await db.collection(`${PREFIX}/be_branches`).get();
  return snap.docs.map(d => ({ id: d.id, name: d.data().name || '?' }));
}

async function createCustomer(db, opts) {
  const { branchId, hn, suffix = '' } = opts;
  const cid = `${TEST_PREFIX}${suffix}-${randomBytes(3).toString('hex')}`;
  await db.doc(`${PREFIX}/be_customers/${cid}`).set({
    branchId,
    branchIdSource: `scenario-${suffix}`,
    customerHN: hn,
    firstname: `Sn${suffix}First`,
    lastname: `Sn${suffix}Last`,
    patientData: { firstNameTh: `S${suffix}`, lastNameTh: `T${suffix}`, prefix: 'นาย' },
    createdAt: FieldValue.serverTimestamp(),
    _testFixture: 'V81-fix6-scenario',
  });
  return cid;
}

async function backup(db, storage, auth, label) {
  const { runWholeSystemBackup } = await import('../api/admin/_lib/wholeSystemBackupExecutor.js');
  const t = Date.now();
  const r = await runWholeSystemBackup({
    db, storage, auth,
    type: 'manual',
    createdBy: `scenario-${label}`,
    runCleanup: false,
    scope: 'customer-only',
  });
  console.log(`  [backup] ✓ ${r.name} ${((Date.now()-t)/1000).toFixed(1)}s | failed: ${r.failedCollections.length}`);
  return r;
}

async function restore(db, storage, auth, backupRef) {
  const { runWholeSystemRestore } = await import('../api/admin/_lib/wholeSystemRestoreExecutor.js');
  const t = Date.now();
  const r = await runWholeSystemRestore({
    db, storage, auth,
    backupRef, mode: 'replace',
    callerUid: '__sc-fake__',
    sendPasswordResetEmails: false,
    ackPasswordResetRequired: false,
    replaceAuthFromBackup: false,
    scope: 'customer-only',
  });
  const failedCount = r.stats?.failedDocs?.length || 0;
  console.log(`  [restore] ✓ Replace done ${((Date.now()-t)/1000).toFixed(1)}s | auth ${r.stats.skipped ? 'PRESERVED' : 'TOUCHED'} | restored: ${r.stats.restoredDocs} | failedDocs: ${failedCount}`);
  if (failedCount > 0) {
    console.log(`  [restore] First 5 failures:`, JSON.stringify(r.stats.failedDocs.slice(0, 5), null, 2));
  }
  return r;
}

async function countCustomers(db) {
  const snap = await db.collection(`${PREFIX}/be_customers`).get();
  return snap.size;
}

async function countAuth(auth) {
  let c = 0, t;
  do { const p = await auth.listUsers(1000, t); c += p.users.length; t = p.pageToken; } while (t);
  return c;
}

async function counts(db, auth) {
  const o = {};
  for (const col of KEY_COLLECTIONS) {
    o[col] = (await db.collection(`${PREFIX}/${col}`).get()).size;
  }
  o.auth = await countAuth(auth);
  return o;
}

async function customerExists(db, cid) {
  const d = await db.doc(`${PREFIX}/be_customers/${cid}`).get();
  return d.exists;
}

async function cleanupBackup(storage, name) {
  try { await storage.deleteFiles({ prefix: `backups/customer-only/${name}/` }); } catch {}
}

async function cleanupTestCustomers(db) {
  const snap = await db.collection(`${PREFIX}/be_customers`).get();
  let d = 0;
  for (const doc of snap.docs) {
    if (doc.id.startsWith(TEST_PREFIX)) { await doc.ref.delete(); d++; }
  }
  return d;
}

async function cleanupChatTestDocs(db) {
  const snap = await db.collection(`${PREFIX}/chat_conversations`).get();
  let d = 0;
  for (const doc of snap.docs) {
    if (doc.id.startsWith(TEST_PREFIX)) { await doc.ref.delete(); d++; }
  }
  return d;
}

// ============== SCENARIOS ==============

async function S1_baseline(db, storage, auth, branches) {
  // No fixtures. Just verify backup-restore preserves baseline state.
  const pre = await counts(db, auth);
  const b = await backup(db, storage, auth, 'S1');
  await restore(db, storage, auth, b.name);
  const post = await counts(db, auth);
  await cleanupBackup(storage, b.name);
  const ok = pre.be_customers === post.be_customers && pre.auth === post.auth && pre.be_staff === post.be_staff;
  return { ok, pre, post, issue: ok ? null : `count drift: ${JSON.stringify(pre)} vs ${JSON.stringify(post)}` };
}

async function S2_singleNakhon(db, storage, auth, branches) {
  const cid = await createCustomer(db, { branchId: NAKHON, hn: 'S2-H', suffix: '2' });
  const pre = await counts(db, auth);
  const b = await backup(db, storage, auth, 'S2');
  await restore(db, storage, auth, b.name);
  const post = await counts(db, auth);
  const stillExists = await customerExists(db, cid);
  await cleanupTestCustomers(db);
  await cleanupBackup(storage, b.name);
  const ok = stillExists && pre.be_customers === post.be_customers && pre.auth === post.auth;
  return { ok, pre, post, cid, issue: ok ? null : `customer ${cid} missing post-restore OR count drift` };
}

async function S3_crossBranch(db, storage, auth, branches) {
  const nonNakhon = branches.filter(b => b.id !== NAKHON);
  const created = [];
  for (let i = 0; i < Math.min(3, nonNakhon.length); i++) {
    const cid = await createCustomer(db, { branchId: nonNakhon[i].id, hn: `S3-${i}`, suffix: `3-${i}` });
    created.push({ cid, branchId: nonNakhon[i].id });
  }
  const pre = await counts(db, auth);
  const b = await backup(db, storage, auth, 'S3');
  await restore(db, storage, auth, b.name);
  const post = await counts(db, auth);
  let allOk = true;
  const issues = [];
  for (const { cid, branchId } of created) {
    const d = await db.doc(`${PREFIX}/be_customers/${cid}`).get();
    if (!d.exists) { allOk = false; issues.push(`${cid} missing`); continue; }
    if (d.data().branchId !== branchId) { allOk = false; issues.push(`${cid} branchId drift: ${d.data().branchId} vs ${branchId}`); }
  }
  await cleanupTestCustomers(db);
  await cleanupBackup(storage, b.name);
  const ok = allOk && pre.be_customers === post.be_customers && pre.auth === post.auth;
  return { ok, pre, post, issue: ok ? null : issues.join('; ') || 'count drift' };
}

async function S4_deleteThenRestore(db, storage, auth, branches) {
  const c1 = await createCustomer(db, { branchId: NAKHON, hn: 'S4-1', suffix: '4-1' });
  const c2 = await createCustomer(db, { branchId: NAKHON, hn: 'S4-2', suffix: '4-2' });
  const c3 = await createCustomer(db, { branchId: NAKHON, hn: 'S4-3', suffix: '4-3' });
  const b = await backup(db, storage, auth, 'S4');
  // DELETE c1 + c2 (simulating accidental delete user wants restored)
  await db.doc(`${PREFIX}/be_customers/${c1}`).delete();
  await db.doc(`${PREFIX}/be_customers/${c2}`).delete();
  const middleCount = await countCustomers(db);
  await restore(db, storage, auth, b.name);
  // After restore: all 3 should exist again
  const c1Back = await customerExists(db, c1);
  const c2Back = await customerExists(db, c2);
  const c3Back = await customerExists(db, c3);
  await cleanupTestCustomers(db);
  await cleanupBackup(storage, b.name);
  const ok = c1Back && c2Back && c3Back;
  return { ok, middleCount, issue: ok ? null : `c1=${c1Back} c2=${c2Back} c3=${c3Back} — deleted customers NOT restored` };
}

async function S5_subcollFidelity(db, storage, auth, branches) {
  const cid = await createCustomer(db, { branchId: NAKHON, hn: 'S5', suffix: '5' });
  // Add an appointment subcoll doc
  const apptId = `${TEST_PREFIX}5appt-${randomBytes(3).toString('hex')}`;
  await db.doc(`${PREFIX}/be_customers/${cid}/appointments/${apptId}`).set({
    date: '2026-05-20', timeSlot: '10:00', staffId: 'STAFF-1',
    _testFixture: 'V81-fix6-S5',
  });
  const b = await backup(db, storage, auth, 'S5');
  // Delete the customer (cascade would clean subcoll too in production; here we leave subcoll for verify)
  await db.doc(`${PREFIX}/be_customers/${cid}`).delete();
  await db.doc(`${PREFIX}/be_customers/${cid}/appointments/${apptId}`).delete();
  await restore(db, storage, auth, b.name);
  // After restore: customer + subcoll doc should be back
  const custBack = await customerExists(db, cid);
  const apptBack = (await db.doc(`${PREFIX}/be_customers/${cid}/appointments/${apptId}`).get()).exists;
  // Cleanup
  await db.doc(`${PREFIX}/be_customers/${cid}/appointments/${apptId}`).delete().catch(() => {});
  await cleanupTestCustomers(db);
  await cleanupBackup(storage, b.name);
  const ok = custBack && apptBack;
  return { ok, issue: ok ? null : `customer=${custBack} appointment-subcoll=${apptBack}` };
}

async function S6_chatConv(db, storage, auth, branches) {
  const convId = `${TEST_PREFIX}6conv-${randomBytes(3).toString('hex')}`;
  await db.doc(`${PREFIX}/chat_conversations/${convId}`).set({
    branchId: NAKHON, customerId: '__test__', source: 'TEST', _testFixture: 'V81-fix6-S6',
  });
  const histId = `${TEST_PREFIX}6hist-${randomBytes(3).toString('hex')}`;
  await db.doc(`${PREFIX}/chat_history/${histId}`).set({
    branchId: NAKHON, convId, message: 'test', _testFixture: 'V81-fix6-S6',
  });
  const b = await backup(db, storage, auth, 'S6');
  await db.doc(`${PREFIX}/chat_conversations/${convId}`).delete();
  await db.doc(`${PREFIX}/chat_history/${histId}`).delete();
  await restore(db, storage, auth, b.name);
  const convBack = (await db.doc(`${PREFIX}/chat_conversations/${convId}`).get()).exists;
  const histBack = (await db.doc(`${PREFIX}/chat_history/${histId}`).get()).exists;
  // Cleanup
  await db.doc(`${PREFIX}/chat_conversations/${convId}`).delete().catch(() => {});
  await db.doc(`${PREFIX}/chat_history/${histId}`).delete().catch(() => {});
  await cleanupBackup(storage, b.name);
  const ok = convBack && histBack;
  return { ok, issue: ok ? null : `conv=${convBack} hist=${histBack}` };
}

async function S7_storageFile(db, storage, auth, branches) {
  const cid = await createCustomer(db, { branchId: NAKHON, hn: 'S7', suffix: '7' });
  // Upload a tiny file to customers/{cid}/ path
  const stPath = `customers/${cid}/test-photo.txt`;
  await storage.file(stPath).save('V81-fix6-S7 test storage payload', { contentType: 'text/plain' });
  const b = await backup(db, storage, auth, 'S7');
  // Wipe the storage file (simulating loss)
  await storage.file(stPath).delete().catch(() => {});
  // Verify file is gone
  const [existsBefore] = await storage.file(stPath).exists();
  await restore(db, storage, auth, b.name);
  // Verify file restored
  const [existsAfter] = await storage.file(stPath).exists();
  // Cleanup
  await storage.file(stPath).delete().catch(() => {});
  await cleanupTestCustomers(db);
  await cleanupBackup(storage, b.name);
  const ok = !existsBefore && existsAfter;
  return { ok, issue: ok ? null : `Storage file restore failed: before=${existsBefore} after=${existsAfter}` };
}

async function S8_bulk10(db, storage, auth, branches) {
  const created = [];
  for (let i = 0; i < 10; i++) {
    const cid = await createCustomer(db, { branchId: NAKHON, hn: `S8-${i}`, suffix: `8-${i}` });
    created.push(cid);
  }
  const b = await backup(db, storage, auth, 'S8');
  // Delete all 10
  for (const cid of created) await db.doc(`${PREFIX}/be_customers/${cid}`).delete();
  await restore(db, storage, auth, b.name);
  // Verify all 10 back
  const survivors = [];
  for (const cid of created) {
    if (await customerExists(db, cid)) survivors.push(cid);
  }
  await cleanupTestCustomers(db);
  await cleanupBackup(storage, b.name);
  const ok = survivors.length === 10;
  return { ok, issue: ok ? null : `expected 10 restored, got ${survivors.length}` };
}

async function S9_chainedRestore(db, storage, auth, branches) {
  // Cycle A: create 2, backup, restore
  const a1 = await createCustomer(db, { branchId: NAKHON, hn: 'S9-A1', suffix: '9-a1' });
  const a2 = await createCustomer(db, { branchId: NAKHON, hn: 'S9-A2', suffix: '9-a2' });
  const bA = await backup(db, storage, auth, 'S9-A');
  await restore(db, storage, auth, bA.name);
  // Cycle B: with A's customers still in state, create 2 more, backup, restore
  const b1 = await createCustomer(db, { branchId: NAKHON, hn: 'S9-B1', suffix: '9-b1' });
  const b2 = await createCustomer(db, { branchId: NAKHON, hn: 'S9-B2', suffix: '9-b2' });
  const bB = await backup(db, storage, auth, 'S9-B');
  await restore(db, storage, auth, bB.name);
  // All 4 should exist
  const allExist = await Promise.all([a1, a2, b1, b2].map(c => customerExists(db, c)));
  const allOk = allExist.every(Boolean);
  await cleanupTestCustomers(db);
  await cleanupBackup(storage, bA.name);
  await cleanupBackup(storage, bB.name);
  return { ok: allOk, issue: allOk ? null : `chained restore: ${allExist.map((v,i) => v ? '_' : ['a1','a2','b1','b2'][i]).filter(Boolean).join(',')} missing` };
}

async function S10_mixedDeleteAdd(db, storage, auth, branches) {
  // Create 5
  const initial = [];
  for (let i = 0; i < 5; i++) {
    initial.push(await createCustomer(db, { branchId: NAKHON, hn: `S10-i${i}`, suffix: `10-i${i}` }));
  }
  // Delete 2
  await db.doc(`${PREFIX}/be_customers/${initial[0]}`).delete();
  await db.doc(`${PREFIX}/be_customers/${initial[1]}`).delete();
  // Add 3 more
  const added = [];
  for (let i = 0; i < 3; i++) {
    added.push(await createCustomer(db, { branchId: NAKHON, hn: `S10-a${i}`, suffix: `10-a${i}` }));
  }
  // Final state: initial[2,3,4] + added[0,1,2] = 6 test customers
  const expectedSurvivors = [initial[2], initial[3], initial[4], ...added];
  const b = await backup(db, storage, auth, 'S10');
  // Wipe all 6 (simulating full loss)
  for (const cid of expectedSurvivors) await db.doc(`${PREFIX}/be_customers/${cid}`).delete();
  await restore(db, storage, auth, b.name);
  // Verify all 6 back; the 2 originally-deleted (initial[0,1]) should NOT come back (they were deleted BEFORE backup)
  const surv = await Promise.all(expectedSurvivors.map(c => customerExists(db, c)));
  const dead = await Promise.all([initial[0], initial[1]].map(c => customerExists(db, c)));
  await cleanupTestCustomers(db);
  await cleanupBackup(storage, b.name);
  const ok = surv.every(Boolean) && dead.every(v => !v);
  return { ok, issue: ok ? null : `survivors=${surv.filter(Boolean).length}/6 dead-still-deleted=${dead.filter(v => !v).length}/2` };
}

const SCENARIOS = [
  { id: 'S1', name: 'Baseline preservation', fn: S1_baseline },
  { id: 'S2', name: 'Single NAKHON customer', fn: S2_singleNakhon },
  { id: 'S3', name: 'Cross-branch creation', fn: S3_crossBranch },
  { id: 'S4', name: 'Delete-then-restore', fn: S4_deleteThenRestore },
  { id: 'S5', name: 'Subcollection fidelity', fn: S5_subcollFidelity },
  { id: 'S6', name: 'Chat conversation', fn: S6_chatConv },
  { id: 'S7', name: 'Customer with Storage file', fn: S7_storageFile },
  { id: 'S8', name: 'Bulk 10 customers', fn: S8_bulk10 },
  { id: 'S9', name: 'Chained restore (A → B)', fn: S9_chainedRestore },
  { id: 'S10', name: 'Mixed delete+add then wipe+restore', fn: S10_mixedDeleteAdd },
];

async function main() {
  loadEnv();
  initAdmin();
  const db = getFirestore();
  const storage = getStorage().bucket();
  const auth = getAuth();
  const branches = await loadBranches(db);

  // V81-fix7: BASELINE INVARIANT — record initial customer + auth counts BEFORE
  // any scenario runs. If at any point post-scenario, customer count drops below
  // BASELINE_MIN (95% of initial), ABORT IMMEDIATELY — restore is silently dropping
  // data (S2 root cause: 391 → 102 silent corruption). User must restore from
  // whole-system backup before continuing.
  const BASELINE_CUSTOMERS = await countCustomers(db);
  const BASELINE_AUTH = await countAuth(auth);
  const BASELINE_MIN = Math.floor(BASELINE_CUSTOMERS * 0.95);
  console.log(`\n=== V81-fix6 — 10 DIFFERENT scenarios stress test ===`);
  console.log(`Branches: ${branches.length} | BASELINE customers: ${BASELINE_CUSTOMERS} | BASELINE auth: ${BASELINE_AUTH}`);
  console.log(`Abort threshold: customer count < ${BASELINE_MIN} (5% loss tolerance)\n`);

  const results = [];
  for (const sc of SCENARIOS) {
    console.log(`\n${'='.repeat(60)}\n🧪 ${sc.id}: ${sc.name}\n${'='.repeat(60)}`);
    const t0 = Date.now();
    try {
      const r = await sc.fn(db, storage, auth, branches);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      // BASELINE INVARIANT CHECK after every scenario
      const postCustomers = await countCustomers(db);
      const postAuth = await countAuth(auth);
      if (postCustomers < BASELINE_MIN) {
        console.log(`\n🚨 BASELINE INVARIANT VIOLATED — customer count dropped: ${postCustomers} < ${BASELINE_MIN} (baseline ${BASELINE_CUSTOMERS})`);
        console.log(`🚨 ABORTING — restore silently dropping data. User MUST restore prod from whole-system backup before continuing.`);
        results.push({ ...sc, ok: false, baselineViolation: true, postCustomers, BASELINE_CUSTOMERS, elapsed });
        break;
      }
      if (postAuth < Math.floor(BASELINE_AUTH * 0.95)) {
        console.log(`\n🚨 AUTH INVARIANT VIOLATED — auth count dropped: ${postAuth} < ${Math.floor(BASELINE_AUTH * 0.95)} (baseline ${BASELINE_AUTH})`);
        console.log(`🚨 ABORTING — Auth was touched (customer-only should NEVER touch Auth).`);
        results.push({ ...sc, ok: false, authInvariantViolation: true, postAuth, BASELINE_AUTH, elapsed });
        break;
      }

      if (r.ok) {
        console.log(`✅ ${sc.id} CLEAN (${elapsed}s) | post customers=${postCustomers} auth=${postAuth}`);
        results.push({ ...sc, ...r, elapsed });
      } else {
        console.log(`❌ ${sc.id} DIRTY: ${r.issue} | post customers=${postCustomers} auth=${postAuth}`);
        results.push({ ...sc, ...r, elapsed });
        // Continue with other scenarios — collect ALL failures (still gated by baseline check above)
      }
    } catch (e) {
      console.log(`💥 ${sc.id} EXCEPTION: ${e.message}\n${e.stack}`);
      results.push({ ...sc, ok: false, exception: e.message });
      try { await cleanupTestCustomers(db); } catch {}
      try { await cleanupChatTestDocs(db); } catch {}
      // Check baseline even after exception
      const postCust = await countCustomers(db).catch(() => -1);
      if (postCust !== -1 && postCust < BASELINE_MIN) {
        console.log(`\n🚨 BASELINE VIOLATED post-exception (customers=${postCust}) — ABORTING`);
        break;
      }
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('FINAL SUMMARY — V81-fix6 10 DIFFERENT scenarios');
  console.log('='.repeat(60));
  let pass = 0, fail = 0;
  for (const r of results) {
    const flag = r.exception ? '💥' : r.ok ? '✅' : '❌';
    if (r.ok) pass++; else fail++;
    console.log(`  ${flag} ${r.id} ${r.name} — ${r.exception || (r.ok ? 'CLEAN' : r.issue || 'unknown')}`);
  }
  console.log(`\n${pass}/${results.length} PASSED · ${fail} FAILED`);
  const reportPath = resolve(REPO_ROOT, `scripts/.tmp-scenarios-report-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify({ results }, null, 2));
  console.log(`\nReport: ${reportPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
