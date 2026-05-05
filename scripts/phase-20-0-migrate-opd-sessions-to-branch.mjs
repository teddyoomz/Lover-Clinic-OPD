#!/usr/bin/env node
// ─── Phase 20.0 follow-up — Stamp branchId on existing opd_sessions ───────
// Run via:
//   node scripts/phase-20-0-migrate-opd-sessions-to-branch.mjs           (dry-run)
//   node scripts/phase-20-0-migrate-opd-sessions-to-branch.mjs --apply   (commits)
//
// Source : opd_sessions docs that lack a `branchId` field (legacy
//          pre-Phase-20.0-Task-6 + pre-BranchSelector frontend writes).
// Target : SAME docs, stamped with `branchId = นครราชสีมา` (default branch).
//
// User directive 2026-05-06 (verbatim): "ตอนนี่ทั้ง tab หน้าคิว จองมัดจำ
// จองไม่มัดจำ นัดหมาย ประวัติ กูเปลี่ยนสาขาไปมาใน selector แล้วไม่ีมีเหี้ย
// ไรเปลี่ยน้ลย งั้นเดี๋ยวกูให้ข้อมูลปัจจุบันใน frontend ทำการ migrate ไป
// สาขานครราชสีมาให้หมด ด้วยการี pull env แล้วยิงแก้ข้อมูลจาก local เลย".
//
// Forensic-trail (Rule M):
//   - branchIdMigratedAt: serverTimestamp()
//   - branchIdMigratedAtPhase: '20.0-opd-sessions'
//
// Idempotent: docs already having a branchId are skipped (re-run yields 0 writes).
//
// Audit doc: be_admin_audit/phase-20-0-migrate-opd-sessions-{ts}-{rand}

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Load .env.local.prod into process.env ────────────────────────────────
const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  const envText = readFileSync(envFile, 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const SESSIONS_COLLECTION = `${BASE_PATH}/opd_sessions`;
const AUDIT_COLLECTION = `${BASE_PATH}/be_admin_audit`;
const DEFAULT_BRANCH_ID = 'BR-1777095572005-ae97f911'; // นครราชสีมา

const apply = process.argv.includes('--apply');
const dryRun = !apply;

export function randHex(n = 8) {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

function initFirebase() {
  if (getApps().length > 0) return;
  let credText = null;
  if (process.env.FIREBASE_ADMIN_CREDENTIALS_PATH) {
    credText = readFileSync(process.env.FIREBASE_ADMIN_CREDENTIALS_PATH, 'utf8');
  } else if (process.env.FIREBASE_ADMIN_CREDENTIALS_JSON) {
    credText = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  } else if (process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    credText = JSON.stringify({
      type: 'service_account',
      project_id: 'loverclinic-opd-4c39b',
      private_key_id: 'key-id',
      private_key: privateKey,
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      client_id: 'client-id',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
    });
  } else {
    console.error('[phase-20-0-opd] FATAL — no Firebase admin creds');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(credText)) });
}

async function main() {
  console.log(`[phase-20-0-opd] mode = ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`[phase-20-0-opd] target branchId = ${DEFAULT_BRANCH_ID} (นครราชสีมา)`);
  initFirebase();
  const db = getFirestore();

  console.log(`[phase-20-0-opd] scanning ${SESSIONS_COLLECTION}…`);
  const snap = await db.collection(SESSIONS_COLLECTION).get();
  console.log(`[phase-20-0-opd] scanned ${snap.size} docs`);

  const beforeDist = {};
  const toMigrate = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const before = data.branchId ?? '(missing)';
    const beforeKey = String(before);
    beforeDist[beforeKey] = (beforeDist[beforeKey] || 0) + 1;
    if (!data.branchId) toMigrate.push(doc.id);
  }

  console.log('[phase-20-0-opd] before-distribution:', beforeDist);
  console.log(`[phase-20-0-opd] docs-to-migrate: ${toMigrate.length}`);
  console.log(`[phase-20-0-opd] docs-already-tagged: ${snap.size - toMigrate.length}`);

  if (dryRun) {
    console.log('[phase-20-0-opd] DRY-RUN — no writes. Re-run with --apply.');
    process.exit(0);
  }

  if (toMigrate.length === 0) {
    console.log('[phase-20-0-opd] APPLY — 0 docs to migrate (idempotent).');
    const auditId = `phase-20-0-migrate-opd-sessions-${Date.now()}-${randHex()}`;
    await db.collection(AUDIT_COLLECTION).doc(auditId).set({
      phase: '20.0-opd-sessions',
      op: 'migrate-opd-sessions-to-branch',
      scanned: snap.size,
      migrated: 0,
      skipped: snap.size,
      defaultBranchId: DEFAULT_BRANCH_ID,
      beforeDistribution: beforeDist,
      appliedAt: FieldValue.serverTimestamp(),
    });
    console.log(`[phase-20-0-opd] APPLY done (0). Audit: ${AUDIT_COLLECTION}/${auditId}`);
    process.exit(0);
  }

  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const slice = toMigrate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const id of slice) {
      batch.update(db.collection(SESSIONS_COLLECTION).doc(id), {
        branchId: DEFAULT_BRANCH_ID,
        branchIdMigratedAt: FieldValue.serverTimestamp(),
        branchIdMigratedAtPhase: '20.0-opd-sessions',
      });
    }
    await batch.commit();
    written += slice.length;
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`[phase-20-0-opd] committed batch ${batchNum} (${written}/${toMigrate.length})`);
  }

  const auditId = `phase-20-0-migrate-opd-sessions-${Date.now()}-${randHex()}`;
  await db.collection(AUDIT_COLLECTION).doc(auditId).set({
    phase: '20.0-opd-sessions',
    op: 'migrate-opd-sessions-to-branch',
    scanned: snap.size,
    migrated: written,
    skipped: snap.size - written,
    defaultBranchId: DEFAULT_BRANCH_ID,
    beforeDistribution: beforeDist,
    appliedAt: FieldValue.serverTimestamp(),
  });

  console.log(`[phase-20-0-opd] APPLY done — ${written} migrated. Audit: ${AUDIT_COLLECTION}/${auditId}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[phase-20-0-opd] FATAL', err);
    process.exit(1);
  });
}
