#!/usr/bin/env node
// scripts/v82-fix3-migrate-orphans-to-nakhon.mjs
//
// User report 2026-05-17 EOD+3 LATE+3:
//   "ฝากย้ายพี่คนนี้ (LOV-D1E638 = นิรุต) จากสาขาทดลอง 1 กลับไปสาขา
//    นครราชสีมา หา orphan แล้ว migrate มาสาขานครราชสีมาให้หมด ผมจะได้
//    มานั่งคัดแล้วเลือกลบเอง"
//
// Diag (Rule R) found exactly 2 non-NAKHON opd_sessions:
//   1. LOV-D1E638 = นาย นิรุต ชำนาญปรุ — branch=ทดลอง 1 (TEST branch)
//      User EXPLICITLY named this. SAFE-default migrate.
//   2. DEP-CF4F32 = นาย สมชุ่ย สมชุ่ย — branch=พระราม 3 (REAL production branch)
//      User did NOT explicitly name this. Per surprising-destructive-scope
//      discipline, this is GATED behind `--include-pram3` flag. User can
//      opt-in by re-running with that flag.
//
// All OTHER branch-scoped collections (be_customers, be_appointments, etc.)
// already 100% in NAKHON — no migration needed for them.
//
// USAGE:
//   node scripts/v82-fix3-migrate-orphans-to-nakhon.mjs                       # dry-run (safe-default scope)
//   node scripts/v82-fix3-migrate-orphans-to-nakhon.mjs --apply               # apply LOV-D1E638 only
//   node scripts/v82-fix3-migrate-orphans-to-nakhon.mjs --include-pram3       # dry-run with pram3 included
//   node scripts/v82-fix3-migrate-orphans-to-nakhon.mjs --apply --include-pram3   # apply both
//
// Per Rule M: admin SDK, pulled env, canonical path, two-phase, audit doc,
// idempotency (skip if branchId already = NAKHON), forensic stamps.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = ['artifacts', APP_ID, 'public', 'data'];
const NAKHON_BR_ID = 'BR-1777873556815-26df6480';
const PRAM3_BR_ID = 'BR-1777885958735-38afbdeb';
const THDLOG1_BR_ID = 'BR-1778136097138-98199ef5';

// Hardcoded narrow scope per diag findings + user explicit naming.
const EXPLICIT_TARGETS = [
  {
    id: 'LOV-D1E638',
    expectedName: 'นาย นิรุต ชำนาญปรุ',
    expectedFromBranch: THDLOG1_BR_ID,
    expectedFromBranchName: 'ทดลอง 1',
    scope: 'explicit', // always migrated (user named this)
  },
];

const PRAM3_TARGETS = [
  {
    id: 'DEP-CF4F32',
    expectedName: 'นาย สมชุ่ย สมชุ่ย',
    expectedFromBranch: PRAM3_BR_ID,
    expectedFromBranchName: 'พระราม 3',
    scope: 'surprising', // gated behind --include-pram3
  },
];

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
  const APPLY = process.argv.includes('--apply');
  const INCLUDE_PRAM3 = process.argv.includes('--include-pram3');

  const targets = [
    ...EXPLICIT_TARGETS,
    ...(INCLUDE_PRAM3 ? PRAM3_TARGETS : []),
  ];

  console.log(`\n=== V82-fix3 orphan migration (${APPLY ? 'APPLY' : 'DRY-RUN'}, include-pram3=${INCLUDE_PRAM3}) ===\n`);
  console.log(`Scope: ${targets.length} target(s) — explicit:${EXPLICIT_TARGETS.length} surprising:${INCLUDE_PRAM3 ? PRAM3_TARGETS.length : 0}\n`);

  if (!INCLUDE_PRAM3) {
    console.log(`ℹ️  ${PRAM3_TARGETS.length} surprising-scope candidate(s) DEFERRED:`);
    PRAM3_TARGETS.forEach(t => {
      console.log(`     [${t.id}] ${t.expectedName} (from ${t.expectedFromBranchName} — REAL production branch)`);
    });
    console.log('   Re-run with --include-pram3 to include these.\n');
  }

  const db = initAdmin();
  const opdCol = col(db, 'opd_sessions');

  const decisions = [];
  for (const t of targets) {
    const snap = await opdCol.doc(t.id).get();
    if (!snap.exists) {
      decisions.push({ ...t, action: 'skip', reason: 'doc does not exist' });
      continue;
    }
    const data = snap.data();
    const observedName = nameOf(data.patientData, data.sessionName);

    console.log(`[${t.id}] (${t.scope})`);
    console.log(`  observed name:    ${observedName}`);
    console.log(`  expected name:    ${t.expectedName}`);
    console.log(`  current branchId: ${data.branchId || '(none)'}`);
    console.log(`  expected from:    ${t.expectedFromBranch} (${t.expectedFromBranchName})`);

    if (data.branchId === NAKHON_BR_ID) {
      decisions.push({ ...t, action: 'skip', reason: 'already in NAKHON (idempotent)' });
      console.log(`  → already in NAKHON, idempotent skip\n`);
      continue;
    }
    if (data.branchId !== t.expectedFromBranch) {
      decisions.push({ ...t, action: 'skip', reason: `branchId mismatch — current ${data.branchId}, expected ${t.expectedFromBranch}` });
      console.log(`  ❌ branchId mismatch — refusing to migrate\n`);
      continue;
    }

    // Name guard
    const expectedTokens = t.expectedName.split(/\s+/).filter(s => s.length >= 3);
    const observedLow = observedName.toLowerCase();
    if (!expectedTokens.some(tok => observedLow.includes(tok.toLowerCase()))) {
      decisions.push({ ...t, action: 'skip', reason: 'name guard failed' });
      console.log(`  ❌ name guard failed — refusing to migrate\n`);
      continue;
    }

    decisions.push({ ...t, action: 'migrate', currentData: data });
    console.log(`  ✓ ready to migrate ${t.expectedFromBranchName} → นครราชสีมา\n`);
  }

  const toApply = decisions.filter(d => d.action === 'migrate');
  console.log(`--- DECISIONS ---`);
  decisions.forEach(d => console.log(`  [${d.id}] action=${d.action}${d.reason ? `  (${d.reason})` : ''}`));
  console.log(`\n${toApply.length} doc(s) to migrate. ${APPLY ? 'COMMITTING…' : '(dry-run — no writes)'}`);

  if (!APPLY) {
    console.log('\nRe-run with --apply to commit.');
    return;
  }

  if (toApply.length === 0) {
    console.log('\nNothing to migrate. Exiting.');
    return;
  }

  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  for (const d of toApply) {
    batch.update(opdCol.doc(d.id), {
      branchId: NAKHON_BR_ID,
      _v82Fix3BranchMigratedAt: now,
      _v82Fix3BranchMigratedFrom: d.expectedFromBranch,
      _v82Fix3BranchMigratedFromName: d.expectedFromBranchName,
      _v82Fix3BranchMigratedReason: `user-directive-consolidate-orphan-to-nakhon (${d.scope})`,
    });
  }

  const auditId = `v82-fix3-migrate-orphans-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  batch.set(col(db, 'be_admin_audit').doc(auditId), {
    op: 'v82-fix3-migrate-orphans-to-nakhon',
    scope: INCLUDE_PRAM3 ? 'explicit+pram3' : 'explicit-only',
    target: NAKHON_BR_ID,
    targetName: 'นครราชสีมา',
    decisions: decisions.map(d => ({
      id: d.id,
      action: d.action,
      reason: d.reason || null,
      scope: d.scope,
      expectedFromBranch: d.expectedFromBranch || null,
      expectedName: d.expectedName,
    })),
    appliedCount: toApply.length,
    appliedAt: now,
    notes: 'V82-fix3 narrow data-fix — migrate orphan opd_sessions back to นครราชสีมา per user re-sync workflow context (post customer wipe + HN reset). Forensic _v82Fix3BranchMigratedAt/From/Reason on each touched doc.',
  });

  await batch.commit();
  console.log(`\n✅ Applied. ${toApply.length} docs migrated + audit doc be_admin_audit/${auditId}`);

  // Post-apply verify
  console.log('\n--- POST-APPLY VERIFY ---');
  for (const d of toApply) {
    const snap = await opdCol.doc(d.id).get();
    const data = snap.data();
    console.log(`  [${d.id}] branchId=${data.branchId}  _v82Fix3BranchMigratedAt=${data._v82Fix3BranchMigratedAt ? 'YES' : 'NO'}`);
  }

  console.log('\n=== DONE ===\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
