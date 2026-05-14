#!/usr/bin/env node
/**
 * Phase 29.22 (2026-05-14) — Rule M two-phase data ops.
 *
 * Strip legacy recall preset fields from be_products + be_courses:
 *   - followUpAfterDays
 *   - followUpReason
 *   - recallAfterDays
 *   - recallReason
 *
 * NO migration to be_recall_cases (per user directive — admin creates fresh).
 * Forensic stamps preserve legacy values for rollback.
 *
 * Usage:
 *   node scripts/phase-29-22-strip-recall-fields-from-product-course.mjs        # dry-run
 *   node scripts/phase-29-22-strip-recall-fields-from-product-course.mjs --apply # commit
 */

import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

function loadEnv(envPath = '.env.local.prod') {
  const text = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function initFirebase() {
  if (getApps().length) return getFirestore();
  const env = loadEnv();
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
  return getFirestore();
}

const LEGACY_FIELDS = ['followUpAfterDays', 'followUpReason', 'recallAfterDays', 'recallReason'];

async function scanCollection(db, collectionName) {
  const ref = db.collection(`${BASE_PATH}/${collectionName}`);
  const snap = await ref.get();
  const candidates = [];
  for (const docu of snap.docs) {
    const data = docu.data();
    const hasAny = LEGACY_FIELDS.some(
      (k) => data[k] != null && data[k] !== ''
    );
    const alreadyCleared = !!data._recallFieldsClearedAt;
    if (hasAny && !alreadyCleared) {
      const legacy = {};
      for (const k of LEGACY_FIELDS) {
        if (data[k] != null) legacy[k] = data[k];
      }
      candidates.push({ id: docu.id, legacy });
    }
  }
  return { totalDocs: snap.size, candidates };
}

function reportPhase1(productsScan, coursesScan) {
  console.log('\n=== Phase 29.22 — DRY RUN ===\n');
  console.log(`be_products: ${productsScan.totalDocs} total, ${productsScan.candidates.length} need cleanup`);
  console.log(`be_courses: ${coursesScan.totalDocs} total, ${coursesScan.candidates.length} need cleanup`);

  // Distinct (followUpReason, followUpAfterDays) + (recallReason, recallAfterDays)
  const distinctTuples = new Map();
  for (const c of [...productsScan.candidates, ...coursesScan.candidates]) {
    if (c.legacy.followUpReason || c.legacy.followUpAfterDays != null) {
      const key = `aftercare|${c.legacy.followUpReason || '(no-reason)'}|${c.legacy.followUpAfterDays ?? 0}`;
      distinctTuples.set(key, (distinctTuples.get(key) || 0) + 1);
    }
    if (c.legacy.recallReason || c.legacy.recallAfterDays != null) {
      const key = `revisit|${c.legacy.recallReason || '(no-reason)'}|${c.legacy.recallAfterDays ?? 0}`;
      distinctTuples.set(key, (distinctTuples.get(key) || 0) + 1);
    }
  }
  console.log(`\nDistinct (slot, reason, days) tuples: ${distinctTuples.size}`);
  if (distinctTuples.size > 0) {
    console.log('Top 20 by count (admin can recreate as be_recall_cases entries):');
    const sorted = [...distinctTuples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    for (const [key, count] of sorted) {
      const [slot, reason, days] = key.split('|');
      console.log(`  ${String(count).padStart(3)}x  ${slot.padEnd(10)} reason="${reason}" days=${days}`);
    }
  }
  console.log('\nSample affected doc IDs (first 5 each):');
  console.log('  products:', productsScan.candidates.slice(0, 5).map((c) => c.id));
  console.log('  courses:', coursesScan.candidates.slice(0, 5).map((c) => c.id));
  console.log('\nRe-run with --apply to commit deletes + forensic stamps.\n');
}

async function applyClear(db, candidates, collectionName) {
  let cleared = 0;
  for (const c of candidates) {
    const ref = db.collection(`${BASE_PATH}/${collectionName}`).doc(c.id);
    await ref.update({
      followUpAfterDays: FieldValue.delete(),
      followUpReason: FieldValue.delete(),
      recallAfterDays: FieldValue.delete(),
      recallReason: FieldValue.delete(),
      _recallFieldsClearedAt: FieldValue.serverTimestamp(),
      _recallFieldsLegacyValue: c.legacy,
    });
    cleared++;
  }
  return cleared;
}

async function writeAuditDoc(db, summary) {
  const auditId = `phase-29-22-strip-recall-fields-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db
    .collection(`${BASE_PATH}/be_admin_audit`)
    .doc(auditId)
    .set({
      phase: '29.22',
      op: 'strip-recall-fields-from-product-course',
      ...summary,
      appliedAt: FieldValue.serverTimestamp(),
      appliedBy: 'cli',
    });
  return auditId;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db = initFirebase();

  console.log(`Phase 29.22 strip-recall-fields — ${apply ? 'APPLY MODE' : 'DRY RUN'}\n`);

  const productsScan = await scanCollection(db, 'be_products');
  const coursesScan = await scanCollection(db, 'be_courses');

  if (!apply) {
    reportPhase1(productsScan, coursesScan);
    return;
  }

  console.log('Applying clears...');
  const productsCleared = await applyClear(db, productsScan.candidates, 'be_products');
  const coursesCleared = await applyClear(db, coursesScan.candidates, 'be_courses');

  const auditId = await writeAuditDoc(db, {
    scanned: { products: productsScan.totalDocs, courses: coursesScan.totalDocs },
    cleared: { products: productsCleared, courses: coursesCleared },
    sampleProducts: productsScan.candidates.slice(0, 10).map((c) => c.id),
    sampleCourses: coursesScan.candidates.slice(0, 10).map((c) => c.id),
  });

  console.log(`\nCleared ${productsCleared} products + ${coursesCleared} courses`);
  console.log(`Audit doc: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
