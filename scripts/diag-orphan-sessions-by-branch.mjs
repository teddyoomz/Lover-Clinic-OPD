#!/usr/bin/env node
// scripts/diag-orphan-sessions-by-branch.mjs (Rule R read-only)
//
// User report 2026-05-17 EOD+3 LATE+3 (post-V82-fix2):
//   "ฝากย้ายพี่คนนี้ (LOV-D1E638 = นิรุต) จากสาขาทดลอง 1 กลับไปสาขา
//    นครราชสีมา หา orphan แล้ว migrate มาสาขานครราชสีมาให้หมด ผมจะได้
//    มานั่งคัดแล้วเลือกลบเอง"
//
// Goal: Find ALL opd_sessions whose branchId is NOT นครราชสีมา. Classify
// each by:
//   - test-branch (ทดลอง 1, ทดลอง 2, etc.) — likely migrate candidates
//   - other production branch (พระราม 3, etc.) — needs user confirmation
//   - no branchId — definitely orphan
//   - invalid branchId (points to deleted branch) — definitely orphan
//
// Also list per-branch counts for ALL collections that have a branchId:
//   - opd_sessions
//   - be_customers
//   - be_appointments
//   - be_deposits
//   - be_treatments
//   - be_sales
//
// Read-only diag — no writes. Per Rule R standing authorization.

import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = ['artifacts', APP_ID, 'public', 'data'];
const NAKHON_BR_ID = 'BR-1777873556815-26df6480';

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function initAdmin() {
  if (getApps().length) return getFirestore();
  const env = loadEnv();
  const pk = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: pk,
    }),
  });
  return getFirestore();
}

function col(db, name) {
  let ref = db;
  for (const seg of BASE) ref = ref.collection ? ref.collection(seg) : ref.doc(seg);
  return ref.collection(name);
}

function nameOf(pd, fallback) {
  if (!pd) return fallback || '(no patientData)';
  const prefix = pd.prefix || '';
  const first = pd.firstName || pd.firstNameTh || '';
  const last = pd.lastName || pd.lastNameTh || '';
  return `${prefix} ${first} ${last}`.trim() || fallback || '(name fields empty)';
}

async function main() {
  const db = initAdmin();

  // 1. List all branches
  console.log('\n=== 1. ALL BRANCHES ===\n');
  const branchSnap = await col(db, 'be_branches').get();
  const branchMap = new Map();
  branchSnap.forEach(d => {
    const data = d.data();
    branchMap.set(d.id, { id: d.id, name: data.name || data.branchName || '(no name)', data });
  });
  branchMap.forEach(b => console.log(`  [${b.id}]  ${b.name}${b.id === NAKHON_BR_ID ? '  ← NAKHON (target)' : ''}`));

  // 2. Per-branch counts for branch-scoped collections
  console.log('\n=== 2. PER-BRANCH COUNTS ===\n');
  const COLLECTIONS = ['opd_sessions', 'be_customers', 'be_appointments', 'be_deposits', 'be_treatments', 'be_sales'];

  for (const colName of COLLECTIONS) {
    const snap = await col(db, colName).get();
    const counts = new Map();
    let noBranchId = 0;
    let invalidBranchId = 0;
    snap.forEach(d => {
      const data = d.data();
      const bid = data.branchId;
      if (!bid) {
        noBranchId++;
        return;
      }
      if (!branchMap.has(bid)) {
        invalidBranchId++;
        counts.set(`INVALID:${bid}`, (counts.get(`INVALID:${bid}`) || 0) + 1);
        return;
      }
      counts.set(bid, (counts.get(bid) || 0) + 1);
    });

    console.log(`--- ${colName} (total ${snap.size}) ---`);
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([bid, n]) => {
        const isNakhon = bid === NAKHON_BR_ID;
        const name = bid.startsWith('INVALID:') ? `(deleted branch ${bid.slice(8)})` : branchMap.get(bid)?.name || '(unknown)';
        console.log(`  ${n.toString().padStart(4)} | ${bid}${isNakhon ? '  ★ NAKHON' : ''}  ${name}`);
      });
    if (noBranchId > 0) console.log(`  ${noBranchId.toString().padStart(4)} | (no branchId)`);
    if (invalidBranchId > 0) console.log(`  ${invalidBranchId.toString().padStart(4)} | (invalid branchId — references deleted branch)`);
    console.log();
  }

  // 3. opd_sessions detail in non-นครราชสีมา branches
  console.log('=== 3. NON-NAKHON opd_sessions DETAIL ===\n');
  const sessSnap = await col(db, 'opd_sessions').get();
  const nonNakhon = [];
  sessSnap.forEach(d => {
    const data = { id: d.id, ...d.data() };
    if (data.branchId !== NAKHON_BR_ID) nonNakhon.push(data);
  });
  console.log(`Total non-NAKHON opd_sessions: ${nonNakhon.length}\n`);

  // Group by branchId
  const byBranch = new Map();
  nonNakhon.forEach(s => {
    const key = s.branchId || '(no branchId)';
    if (!byBranch.has(key)) byBranch.set(key, []);
    byBranch.get(key).push(s);
  });

  byBranch.forEach((sessions, bid) => {
    const branch = branchMap.get(bid);
    const branchName = branch ? branch.name : `(unknown or invalid: ${bid})`;
    console.log(`--- Branch [${bid}] ${branchName} — ${sessions.length} sessions ---`);
    sessions.forEach(s => {
      const name = nameOf(s.patientData, s.sessionName);
      const status = `isArchived=${!!s.isArchived} isPermanent=${!!s.isPermanent} formType=${s.formType} serviceCompleted=${!!s.serviceCompleted} resetStamp=${s._v82FollowupOpdResetAt ? 'Y' : 'n'}`;
      console.log(`  [${s.id}]  ${name}`);
      console.log(`         ${status}`);
    });
    console.log();
  });

  // 4. LOV-D1E638 spotlight (user-named example)
  console.log('=== 4. SPOTLIGHT: LOV-D1E638 (นิรุต) ===\n');
  const targetSnap = await col(db, 'opd_sessions').doc('LOV-D1E638').get();
  if (!targetSnap.exists) {
    console.log('  ❌ LOV-D1E638 — doc does not exist');
  } else {
    const data = { id: targetSnap.id, ...targetSnap.data() };
    const name = nameOf(data.patientData, data.sessionName);
    console.log(`  [${data.id}]  ${name}`);
    console.log(`         branchId: ${data.branchId} (${branchMap.get(data.branchId)?.name || 'unknown'})`);
    console.log(`         isArchived=${!!data.isArchived} isPermanent=${!!data.isPermanent} formType=${data.formType} serviceCompleted=${!!data.serviceCompleted} resetStamp=${data._v82FollowupOpdResetAt ? 'Y' : 'n'}`);
  }

  console.log('\n=== DONE — read-only ===\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('diag failed:', e);
    process.exit(1);
  });
}
