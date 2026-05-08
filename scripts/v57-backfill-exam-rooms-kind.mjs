#!/usr/bin/env node
// V57 / AV30 (2026-05-08) — Backfill `kind: 'doctor'` on legacy
// be_exam_rooms entries that lack the field.
//
// Phase 18.0 introduced be_exam_rooms but examRoomValidation.js never
// declared the `kind` field. V55 mapper + V56 modal/panel all filter
// `r.kind === 'doctor'` and silently exclude rooms with missing kind.
//
// Diagnostic (preview_eval 2026-05-08): 6 rooms across 3 branches, all
// with `kind: undefined`. Names ("ห้องแพทย์/ผ่าตัด", "ห้องช็อคเวฟ", "ดำได")
// suggest most are doctor-rooms; ห้องช็อคเวฟ is a procedure room admin
// will manually flip to 'staff' via the new V57 UI radio picker.
//
// This script defaults all legacy rooms to `kind: 'doctor'` (the most
// common case). Admin can edit individual rooms post-backfill via the
// updated ExamRoomFormModal.
//
// Usage (Rule M two-phase):
//   node scripts/v57-backfill-exam-rooms-kind.mjs            # dry-run
//   node scripts/v57-backfill-exam-rooms-kind.mjs --apply    # commit writes
//
// Idempotent — re-run with --apply yields 0 writes after first apply.

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';

// Load .env.local.prod (Vercel env pull) — Rule M canonical pattern.
loadEnv({ path: '.env.local.prod' });

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');

function initAdmin() {
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID) {
    throw new Error('FIREBASE_ADMIN_PROJECT_ID missing — run `vercel env pull .env.local.prod --environment=production` first');
  }
  // Rule M PEM key conversion — .env.local.prod stores literal `\n` escapes.
  const pemKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: pemKey,
    }),
  });
}

async function main() {
  console.log(`[V57/AV30] backfill be_exam_rooms.kind — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  initAdmin();
  const db = getFirestore();

  // Rule M canonical path — production data lives at
  // artifacts/{APP_ID}/public/data/{collection}.
  const examRoomsCol = db.collection(`artifacts/${APP_ID}/public/data/be_exam_rooms`);

  console.log('[V57/AV30] scanning be_exam_rooms ...');
  const snap = await examRoomsCol.get();
  console.log(`[V57/AV30] total rooms found: ${snap.size}`);

  const stats = {
    scanned: snap.size,
    backfilled: 0,
    skipped_already_set: 0,
    skipped_invalid_kind: 0,
    perBranch: {},
  };

  // Build before-distribution
  for (const doc of snap.docs) {
    const data = doc.data();
    const b = data.branchId || '(no-branchId)';
    if (!stats.perBranch[b]) stats.perBranch[b] = { total: 0, alreadyDoctor: 0, alreadyStaff: 0, missing: 0 };
    stats.perBranch[b].total++;
    if (data.kind === 'doctor') stats.perBranch[b].alreadyDoctor++;
    else if (data.kind === 'staff') stats.perBranch[b].alreadyStaff++;
    else stats.perBranch[b].missing++;
  }

  // Backfill pass
  const candidates = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.kind === 'doctor' || data.kind === 'staff') {
      stats.skipped_already_set++;
      continue;
    }
    if (data.kind != null && data.kind !== '') {
      // Some other invalid value — DON'T touch (admin should investigate manually)
      console.warn(`[V57/AV30] SKIP invalid kind='${data.kind}' on ${doc.id} (manual review)`);
      stats.skipped_invalid_kind++;
      continue;
    }
    candidates.push({
      id: doc.id,
      branchId: data.branchId || '(no-branchId)',
      name: data.name || '(no-name)',
      currentKind: data.kind,
    });
  }

  console.log(`[V57/AV30] candidates for backfill (kind missing/empty → 'doctor'): ${candidates.length}`);
  for (const c of candidates) {
    console.log(`  - ${c.id} (${c.branchId}): "${c.name}" — kind=${c.currentKind === undefined ? 'undefined' : `'${c.currentKind}'`} → 'doctor'`);
  }

  console.log(`\n[V57/AV30] before-distribution by branch:`);
  for (const [b, s] of Object.entries(stats.perBranch)) {
    console.log(`  ${b}: total=${s.total}, alreadyDoctor=${s.alreadyDoctor}, alreadyStaff=${s.alreadyStaff}, missing=${s.missing}`);
  }

  if (!APPLY) {
    console.log(`\n[V57/AV30] DRY-RUN — no writes. Re-run with --apply to commit.`);
    return;
  }

  if (candidates.length === 0) {
    console.log(`[V57/AV30] no candidates — nothing to backfill.`);
    return;
  }

  console.log(`\n[V57/AV30] APPLY — committing ${candidates.length} writes ...`);
  const batch = db.batch();
  for (const c of candidates) {
    const ref = examRoomsCol.doc(c.id);
    batch.update(ref, {
      kind: 'doctor',
      _v57BackfilledAt: FieldValue.serverTimestamp(),
      _v57BackfilledFrom: c.currentKind === undefined ? null : c.currentKind,
    });
    stats.backfilled++;
  }
  await batch.commit();

  // Audit doc — Rule M canonical (be_admin_audit + crypto-secure random id)
  const auditId = `v57-backfill-exam-rooms-kind-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const auditCol = db.collection(`artifacts/${APP_ID}/public/data/be_admin_audit`);
  await auditCol.doc(auditId).set({
    phase: 'V57/AV30',
    op: 'backfill-exam-rooms-kind',
    scanned: stats.scanned,
    backfilled: stats.backfilled,
    skipped_already_set: stats.skipped_already_set,
    skipped_invalid_kind: stats.skipped_invalid_kind,
    perBranchBefore: stats.perBranch,
    appliedAt: FieldValue.serverTimestamp(),
  });

  console.log(`\n[V57/AV30] APPLIED:`);
  console.log(`  scanned: ${stats.scanned}`);
  console.log(`  backfilled (kind→'doctor'): ${stats.backfilled}`);
  console.log(`  skipped (already set): ${stats.skipped_already_set}`);
  console.log(`  skipped (invalid kind): ${stats.skipped_invalid_kind}`);
  console.log(`  audit doc: be_admin_audit/${auditId}`);
  console.log(`\n[V57/AV30] Re-run with --apply → expect 0 backfills (idempotency check).`);
}

// Rule M invocation guard — only run main() when invoked as a script,
// NOT when imported by unit tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('[V57/AV30] FATAL:', e);
    process.exit(1);
  });
}
