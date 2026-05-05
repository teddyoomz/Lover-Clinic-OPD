#!/usr/bin/env node
// ─── Phase 19.0 — Migrate be_appointments.appointmentType to new taxonomy ──
// One-shot script. Run via:
//   node scripts/phase-19-0-migrate-appointment-types.mjs           (dry-run)
//   node scripts/phase-19-0-migrate-appointment-types.mjs --apply   (commits)
//
// Q1 lock = Option B Uniform: ALL legacy appointmentType values
//   ('sales' / 'followup' / 'follow' / 'consult' / 'treatment' / null)
//   → 'no-deposit-booking'.
//
// Admin re-classifies per appointment manually post-migration per user need.
//
// Forensic-trail fields stamped on migrated docs:
//   - appointmentTypeMigratedAt: serverTimestamp()
//   - appointmentTypeLegacyValue: value before migration
//
// Idempotent: re-run after --apply finds 0 docs needing migration + exits clean.
// Audit doc: be_admin_audit/phase-19-0-migrate-appointment-types-<ts>-<rand>
//
// Pre-flight: .env.local or .env.local.prod must contain Firebase admin creds
//   (FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY), OR
//   set FIREBASE_ADMIN_CREDENTIALS_PATH=/path/to/serviceAccountKey.json

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Load .env.local or .env.local.prod into process.env ─────────────────
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

// ─── Constants ─────────────────────────────────────────────────────────────
const NEW_APPOINTMENT_TYPES = Object.freeze([
  'deposit-booking',
  'no-deposit-booking',
  'treatment-in',
  'follow-up',
]);
const DEFAULT_TYPE = 'no-deposit-booking';
const APP_ID = 'loverclinic-opd-4c39b';
// Production data lives under artifacts/{APP_ID}/public/data/* — matches
// Phase 18.0 migration script convention. Root-level collections are
// blocked by the default-deny rule.
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const APPT_COLLECTION = `${BASE_PATH}/be_appointments`;
const AUDIT_COLLECTION = `${BASE_PATH}/be_admin_audit`;

// ─── CLI args ──────────────────────────────────────────────────────────────
const apply = process.argv.includes('--apply');
const dryRun = !apply;

// ─── Pure helpers (exported for tests) ─────────────────────────────────────

/**
 * Map legacy or invalid appointmentType value to the new taxonomy.
 * If value is already in NEW_APPOINTMENT_TYPES, return it unchanged.
 * Otherwise, return DEFAULT_TYPE.
 */
export function mapAppointmentType(value) {
  if (typeof value === 'string' && NEW_APPOINTMENT_TYPES.includes(value)) {
    return value;
  }
  return DEFAULT_TYPE;
}

/**
 * Generate cryptographically random hex string of length n (for audit-doc suffix).
 * Mirrors Phase 18.0 convention — collision-resistant audit IDs.
 */
export function randHex(n = 8) {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

// ─── Firebase init ────────────────────────────────────────────────────────

function initFirebase() {
  if (getApps().length > 0) return;

  // Try explicit credential path or env JSON
  let credText = null;
  if (process.env.FIREBASE_ADMIN_CREDENTIALS_PATH) {
    credText = readFileSync(process.env.FIREBASE_ADMIN_CREDENTIALS_PATH, 'utf8');
  } else if (process.env.FIREBASE_ADMIN_CREDENTIALS_JSON) {
    credText = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  } else if (
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    // Build from individual env vars. PEM keys come from .env files with
    // literal "\n" (backslash-n) escapes — convert to real newlines so
    // firebase-admin's PEM parser accepts them.
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
    console.error(
      '[phase-19-0] FATAL — no Firebase admin credentials found.'
    );
    console.error(
      '  Set FIREBASE_ADMIN_CREDENTIALS_PATH=/path/to/key.json, OR'
    );
    console.error(
      '  set FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY, OR'
    );
    console.error('  create .env.local with FIREBASE_ADMIN_PRIVATE_KEY=...');
    process.exit(1);
  }

  const cred = JSON.parse(credText);
  initializeApp({ credential: cert(cred) });
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[phase-19-0] mode = ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  initFirebase();
  const db = getFirestore();

  // Scan all appointments
  console.log(`[phase-19-0] scanning ${APPT_COLLECTION}…`);
  const snap = await db.collection(APPT_COLLECTION).get();
  console.log(`[phase-19-0] scanned ${snap.size} documents`);

  // Tally before/after distribution
  const beforeDist = {};
  const afterDist = {};
  const toMigrate = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const before = data.appointmentType ?? null;
    const beforeKey = String(before);
    beforeDist[beforeKey] = (beforeDist[beforeKey] || 0) + 1;

    const after = mapAppointmentType(before);
    afterDist[after] = (afterDist[after] || 0) + 1;

    // Skip if value is already in new taxonomy
    if (NEW_APPOINTMENT_TYPES.includes(before)) {
      continue;
    }

    // Queue for migration (legacy value found)
    toMigrate.push({ id: doc.id, before, after });
  }

  console.log('[phase-19-0] before-distribution:', beforeDist);
  console.log('[phase-19-0] after-distribution:', afterDist);
  console.log(`[phase-19-0] docs-to-migrate: ${toMigrate.length}`);
  console.log(`[phase-19-0] docs-already-new-shape: ${snap.size - toMigrate.length}`);

  if (dryRun) {
    console.log(
      '[phase-19-0] DRY-RUN mode — no writes. Re-run with --apply to commit.'
    );
    process.exit(0);
  }

  // APPLY mode: commit writes
  if (toMigrate.length === 0) {
    console.log('[phase-19-0] APPLY — 0 docs to migrate (idempotent re-run).');
    // Still write an audit doc for the run
    const auditId = `phase-19-0-migrate-appointment-types-${Date.now()}-${randHex()}`;
    await db.collection(AUDIT_COLLECTION).doc(auditId).set({
      phase: '19.0',
      op: 'migrate-appointment-types',
      scanned: snap.size,
      migrated: 0,
      skipped: snap.size,
      beforeDistribution: beforeDist,
      afterDistribution: afterDist,
      appliedAt: FieldValue.serverTimestamp(),
    });
    console.log(
      `[phase-19-0] APPLY done (0 migrated). Audit: ${AUDIT_COLLECTION}/${auditId}`
    );
    process.exit(0);
  }

  // Batch writes: Firestore caps batch at 500 ops. Each appt = 1 update.
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const slice = toMigrate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { id, before, after } of slice) {
      batch.update(db.collection(APPT_COLLECTION).doc(id), {
        appointmentType: after,
        appointmentTypeMigratedAt: FieldValue.serverTimestamp(),
        appointmentTypeLegacyValue: before,
      });
    }
    await batch.commit();
    written += slice.length;
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(
      `[phase-19-0] committed batch ${batchNum} (${written}/${toMigrate.length})`
    );
  }

  // Audit doc
  const auditId = `phase-19-0-migrate-appointment-types-${Date.now()}-${randHex()}`;
  await db.collection(AUDIT_COLLECTION).doc(auditId).set({
    phase: '19.0',
    op: 'migrate-appointment-types',
    scanned: snap.size,
    migrated: written,
    skipped: snap.size - written,
    beforeDistribution: beforeDist,
    afterDistribution: afterDist,
    appliedAt: FieldValue.serverTimestamp(),
  });

  console.log(
    `[phase-19-0] APPLY done — ${written} migrated. Audit: ${AUDIT_COLLECTION}/${auditId}`
  );
  process.exit(0);
}

// Only run main() when invoked directly via CLI (not when imported by tests).
// Mirrors Phase 18.0 convention.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[phase-19-0] FATAL', err);
    process.exit(1);
  });
}
