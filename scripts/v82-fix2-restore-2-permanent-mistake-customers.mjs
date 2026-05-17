#!/usr/bin/env node
// scripts/v82-fix2-restore-2-permanent-mistake-customers.mjs
//
// V82-fix2 narrow data-fix for the 2 named customers reported missing
// 2026-05-17 EOD+3 LATE+3 by user:
//   - LOV-1F5QNL = นาย วิชยุตม์ ธนวัฒน์โอฬาร
//   - LOV-5PG74T = นาย แป้น โอนสันเทียะ
//
// User report (verbatim): "ใน frontend tab ประวัติ เมื่อกดปุ่มกลับเข้าคิว
// แล้วเลือกคิวถาวร กลายเป็น list ลูกค้านั้นหายไปเลย ไม่ยอมกลับเข้ามาหน้าคิว
// หน้าคลินิก แล้วก็หายไปจากหน้าประวัติด้วย ทำให้ใช้ได้ปกติ แล้วเอา 2 คนที่
// หายกลับมาด้วย".
//
// Root cause: restoreToQueue(id, 'permanent') sets isPermanent=true. The
// queue filter at AdminDashboard.jsx:2275 (pre-V82-fix2 ordering) excluded
// isPermanent-non-deposit-unserviced before reaching the V82-followup opt-out
// at line ~2282. Result: silently routed to จองไม่มัดจำ tab (instead of
// staying in queue per the _v82FollowupOpdResetAt re-sync workflow intent).
//
// V82-fix2 patches the source filter ordering AND adds noDepositSessions
// exclusion. This script ALSO resets isPermanent=false on the 2 named
// customers so their data state matches the pre-mistake intent. Forensic
// trail stamps recovery time + reason for audit.
//
// NARROW SCOPE per user — only these 2 docs. The 3rd permanent-stamped
// customer (ND-122290 = นาย นย พะรน, archived sub-list) was NOT named by
// user; this script does NOT touch it. Per
// feedback_surprising_destructive_scope_callout.md.
//
// USAGE:
//   node scripts/v82-fix2-restore-2-permanent-mistake-customers.mjs        # dry-run
//   node scripts/v82-fix2-restore-2-permanent-mistake-customers.mjs --apply
//
// Per Rule M: admin SDK, pulled env, canonical artifacts/{APP_ID}/public/data
// path, two-phase, audit doc, idempotency, forensic stamps, crypto-secure id.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = ['artifacts', APP_ID, 'public', 'data'];

// Hardcoded narrow scope per user — 2 named customers only.
const TARGET_IDS = ['LOV-1F5QNL', 'LOV-5PG74T'];
const EXPECTED_NAMES = {
  'LOV-1F5QNL': 'นาย วิชยุตม์ ธนวัฒน์โอฬาร',
  'LOV-5PG74T': 'นาย แป้น โอนสันเทียะ',
};

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

function nameOf(pd) {
  if (!pd) return '(no patientData)';
  const prefix = pd.prefix || '';
  const first = pd.firstName || pd.firstNameTh || '';
  const last = pd.lastName || pd.lastNameTh || '';
  return `${prefix} ${first} ${last}`.trim() || '(name fields empty)';
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  const mode = APPLY ? 'APPLY' : 'DRY-RUN';
  console.log(`\n=== V82-fix2 restore 2 permanent-mistake customers (${mode}) ===\n`);

  const db = initAdmin();
  const opdCol = col(db, 'opd_sessions');

  const targets = [];
  for (const id of TARGET_IDS) {
    const snap = await opdCol.doc(id).get();
    if (!snap.exists) {
      console.error(`[MISSING] ${id} — doc does not exist; expected ${EXPECTED_NAMES[id]}`);
      continue;
    }
    const data = snap.data();
    targets.push({ id, data });

    const observedName = nameOf(data.patientData);
    const expectedName = EXPECTED_NAMES[id];
    console.log(`[${id}]`);
    console.log(`  observed name:          ${observedName}`);
    console.log(`  expected name:          ${expectedName}`);
    console.log(`  isArchived:             ${!!data.isArchived}`);
    console.log(`  isPermanent:            ${!!data.isPermanent}`);
    console.log(`  formType:               ${data.formType}`);
    console.log(`  serviceCompleted:       ${!!data.serviceCompleted}`);
    console.log(`  _v82FollowupOpdResetAt: ${data._v82FollowupOpdResetAt ? 'YES' : 'no'}`);
    console.log(`  branchId:               ${data.branchId || '(none)'}`);
    console.log();

    // Name-match sanity guard (per V44/V46 lessons — never touch data unless
    // observed name matches expected. Prevents accidentally clobbering the
    // wrong customer if doc IDs were reused.)
    const expectedTokens = expectedName.split(/\s+/).filter(t => t.length >= 3);
    const observedLow = observedName.toLowerCase();
    const matches = expectedTokens.some(t => observedLow.includes(t.toLowerCase()));
    if (!matches) {
      console.error(`  ❌ NAME MISMATCH — refusing to touch ${id}. Expected tokens: ${expectedTokens.join(', ')}`);
      throw new Error(`Name guard failed for ${id}`);
    }
  }

  if (targets.length === 0) {
    console.log('No targets resolved. Aborting.');
    return;
  }

  // Decide per-doc action — idempotent skip if already isPermanent=false.
  const decisions = targets.map(({ id, data }) => {
    if (data.isArchived) {
      return { id, action: 'skip', reason: 'isArchived=true (not in our bug class — user must restore via UI first)' };
    }
    if (!data.isPermanent) {
      return { id, action: 'skip', reason: 'isPermanent already false (idempotent skip)' };
    }
    return { id, action: 'restore-to-queue' };
  });

  console.log('--- DECISIONS ---');
  decisions.forEach(d => console.log(`  [${d.id}] action=${d.action}${d.reason ? `  (${d.reason})` : ''}`));

  const toRestore = decisions.filter(d => d.action === 'restore-to-queue');
  console.log(`\n${toRestore.length} doc(s) to restore. ${APPLY ? 'COMMITTING…' : '(dry-run — no writes)'}`);

  if (!APPLY) {
    console.log('\nRe-run with --apply to commit.');
    return;
  }

  // Apply: batch write + audit doc.
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  for (const d of toRestore) {
    batch.update(opdCol.doc(d.id), {
      isPermanent: false,
      _v82Fix2RestoredAt: now,
      _v82Fix2RestoredFrom: 'permanent-restore-bug',
      _v82Fix2RestoredReason: 'user-clicked-permanent-on-reset-stamped-session',
    });
  }

  const auditId = `v82-fix2-restore-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  batch.set(col(db, 'be_admin_audit').doc(auditId), {
    op: 'v82-fix2-restore-2-permanent-mistake-customers',
    scope: 'narrow-named-2-customers',
    targetIds: TARGET_IDS,
    decisions,
    appliedCount: toRestore.length,
    appliedAt: now,
    notes: 'V82-fix2 narrow data-fix — restore isPermanent=false on 2 customers reported missing by user post-V82-followup permanent-restore bug. Forensic stamps _v82Fix2RestoredAt + _v82Fix2RestoredFrom on each touched doc.',
  });

  await batch.commit();
  console.log(`\n✅ Applied. ${toRestore.length} docs updated + audit doc be_admin_audit/${auditId}`);

  // Re-read for verification
  console.log('\n--- POST-APPLY VERIFY ---');
  for (const d of toRestore) {
    const snap = await opdCol.doc(d.id).get();
    const data = snap.data();
    console.log(`  [${d.id}] isPermanent=${!!data.isPermanent}  _v82Fix2RestoredAt=${data._v82Fix2RestoredAt ? 'YES' : 'NO'}`);
  }

  console.log('\n=== DONE ===\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
