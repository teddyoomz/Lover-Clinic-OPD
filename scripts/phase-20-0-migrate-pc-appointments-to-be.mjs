#!/usr/bin/env node
// ─── Phase 20.0 — Migrate pc_appointments → be_appointments ───────────────
// One-shot script. Run via:
//   node scripts/phase-20-0-migrate-pc-appointments-to-be.mjs           (dry-run)
//   node scripts/phase-20-0-migrate-pc-appointments-to-be.mjs --apply   (commits)
//
// Source : pc_appointments/{YYYY-MM} — monthly summary docs containing
//          { appointments: [...] } embedded array (ProClinic mirror data
//          synced via brokerClient + cookie-relay extension).
// Target : be_appointments/{appointmentId} — one doc per appointment in
//          our canonical Firestore (post-Phase-19.0 4-type taxonomy).
//
// Branch stamping: all migrated appts inherit branchId =
//   'BR-1777095572005-ae97f911' (นครราชสีมา) per Phase 17.2 newest-default
//   convention. Admin can re-classify per-appointment if needed.
//
// Type mapping: ProClinic 2-type → BE 4-type per Phase 19.0 Q1 Option B
//   UNIFORM — ALL legacy values ('sales' / 'followup' / 'follow' / null /
//   unknown / '') → 'no-deposit-booking'. Admin re-classifies per-appt
//   manually post-migration. Already-new values pass through unchanged.
//   Original legacy value preserved in `pcAppointmentTypeLegacyValue` for
//   forensic trail + future bulk re-classification.
//
// Forensic-trail fields stamped on migrated docs:
//   - migratedFromPc: true
//   - pcMonthDocId: 'YYYY-MM' (source month)
//   - migratedAt: serverTimestamp()
//
// Idempotent:
//   - Skip if be_appointments/{appointmentId} already exists (dual-creates
//     or re-migrations would otherwise overwrite admin edits).
//
// Audit doc: be_admin_audit/phase-20-0-migrate-pc-appointments-<ts>-<rand>
//   { phase, op, scanned, migrated, skipped, monthsProcessed,
//     beforeShapeDistribution, afterDistribution, appliedAt }
//
// Pre-flight: .env.local or .env.local.prod must contain Firebase admin
//   credentials, OR set FIREBASE_ADMIN_CREDENTIALS_PATH=/path/to/key.json
//
// Mirrors Phase 18.0 + Phase 19.0 templates per Rule M canonical pattern.

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
const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const PC_COLLECTION = `${BASE_PATH}/pc_appointments`;
const BE_COLLECTION = `${BASE_PATH}/be_appointments`;
const AUDIT_COLLECTION = `${BASE_PATH}/be_admin_audit`;

// นครราชสีมา (Phase 17.2 newest-default — see active.md / SESSION_HANDOFF)
const DEFAULT_BRANCH_ID = 'BR-1777095572005-ae97f911';

// Phase 19.0 4-type taxonomy
const NEW_APPOINTMENT_TYPES = Object.freeze([
  'deposit-booking',
  'no-deposit-booking',
  'treatment-in',
  'follow-up',
]);
const DEFAULT_NEW_TYPE = 'no-deposit-booking';

// ─── CLI args ──────────────────────────────────────────────────────────────
const apply = process.argv.includes('--apply');
const dryRun = !apply;

// ─── Pure helpers (exported for tests) ─────────────────────────────────────

/**
 * Map ProClinic 2-type appointmentType → BE 4-type per Phase 19.0 Q1
 * Option B UNIFORM default.
 *
 * ALL legacy values ('sales' / 'followup' / 'follow' / 'consult' /
 * 'treatment' / null / undefined / '' / unknown) → 'no-deposit-booking'.
 * Admin re-classifies per-appointment manually post-migration.
 *
 * Already-new values ('deposit-booking' / 'no-deposit-booking' /
 * 'treatment-in' / 'follow-up') pass through unchanged.
 *
 * Mirrors Phase 19.0's `mapAppointmentType` semantics exactly so a
 * legacy doc migrated by Phase 19.0 (in-place) and one migrated by
 * Phase 20.0 (pc → be) end up with the same `appointmentType` shape.
 */
export function mapPcTypeToBe(pcType) {
  if (typeof pcType === 'string' && NEW_APPOINTMENT_TYPES.includes(pcType)) {
    return pcType;
  }
  return DEFAULT_NEW_TYPE;
}

/**
 * Map a single embedded pc_appointments item to a be_appointments doc shape.
 * Returns the doc shape ready for setDoc; doc-id is the input's `id` field.
 *
 * @param {object} pcAppt — embedded item from pc_appointments/{month}.appointments[]
 * @param {string} monthDocId — 'YYYY-MM' source month (for forensic trail)
 * @returns {{ id: string, doc: object } | null} — null if pcAppt invalid (no id)
 */
export function mapPcAppointmentToBe(pcAppt, monthDocId) {
  const id = String(pcAppt?.id || '').trim();
  if (!id) return null;

  const date = String(pcAppt?.date || '').trim();
  const startTime = String(pcAppt?.startTime || '').trim();
  const endTime = String(pcAppt?.endTime || pcAppt?.startTime || '').trim();
  const customerId = pcAppt?.customerId ? String(pcAppt.customerId) : null;
  const customerName = String(pcAppt?.customerName || '').trim() || null;
  const doctorId = pcAppt?.doctorId ? String(pcAppt.doctorId) : null;
  const doctorName = String(pcAppt?.doctorName || '').trim() || null;
  const advisorId = pcAppt?.advisorId ? String(pcAppt.advisorId) : null;
  const assistants = pcAppt?.assistants ?? null;
  const roomId = pcAppt?.roomId ? String(pcAppt.roomId) : null;
  const roomName = String(pcAppt?.roomName || '').trim() || null;
  const note = pcAppt?.note ?? null;
  const status = pcAppt?.status ?? null;
  const confirmed = !!pcAppt?.confirmed;
  const source = pcAppt?.source ?? 'pc_migration';

  const appointmentType = mapPcTypeToBe(pcAppt?.appointmentType);

  // Minimal shape — be_appointments accepts arbitrary fields, but we keep
  // only the ones AdminDashboard + AppointmentTab + reports actually read.
  const doc = {
    appointmentId: id,
    customerId,
    customerName,
    doctorId,
    doctorName,
    advisorId,
    assistants,
    date,
    startTime,
    endTime,
    appointmentType,
    appointmentColor: '',
    roomId,
    roomName,
    note,
    status,
    confirmed,
    source,
    branchId: DEFAULT_BRANCH_ID,
    // Forensic trail (Rule M) — preserve original ProClinic value so admin
    // can bulk re-classify post-migration if Phase 19.0 Q1 uniform default
    // mapping is too coarse for their workflow.
    migratedFromPc: true,
    pcMonthDocId: monthDocId,
    pcAppointmentTypeLegacyValue: pcAppt?.appointmentType ?? null,
    migratedAt: FieldValue.serverTimestamp(),
    // Standard timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { id, doc };
}

/**
 * Generate cryptographically random hex string of length n (for audit-doc suffix).
 * Mirrors Phase 18.0 + 19.0 convention.
 */
export function randHex(n = 8) {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

// ─── Firebase init ────────────────────────────────────────────────────────

function initFirebase() {
  if (getApps().length > 0) return;

  let credText = null;
  if (process.env.FIREBASE_ADMIN_CREDENTIALS_PATH) {
    credText = readFileSync(process.env.FIREBASE_ADMIN_CREDENTIALS_PATH, 'utf8');
  } else if (process.env.FIREBASE_ADMIN_CREDENTIALS_JSON) {
    credText = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  } else if (
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    // PEM keys come from .env files with literal "\n" (backslash-n)
    // escapes — convert to real newlines so firebase-admin's PEM parser
    // accepts them. Phase 19.0 lesson lock.
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
    console.error('[phase-20-0] FATAL — no Firebase admin credentials found.');
    console.error('  Set FIREBASE_ADMIN_CREDENTIALS_PATH=/path/to/key.json, OR');
    console.error('  set FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY, OR');
    console.error('  create .env.local with FIREBASE_ADMIN_PRIVATE_KEY=...');
    process.exit(1);
  }

  const cred = JSON.parse(credText);
  initializeApp({ credential: cert(cred) });
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[phase-20-0] mode = ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  initFirebase();
  const db = getFirestore();

  // 1. Scan all pc_appointments month docs
  console.log(`[phase-20-0] scanning ${PC_COLLECTION}…`);
  const snap = await db.collection(PC_COLLECTION).get();
  console.log(`[phase-20-0] scanned ${snap.size} month docs`);

  // 2. Flatten embedded arrays + tally
  const allAppts = [];           // { monthDocId, pcAppt }
  const beforeShapeDist = {};    // type-distribution before mapping
  const afterDist = {};          // type-distribution after mapping

  for (const monthDoc of snap.docs) {
    const monthDocId = monthDoc.id;
    const data = monthDoc.data();
    const list = Array.isArray(data?.appointments) ? data.appointments : [];
    for (const pcAppt of list) {
      allAppts.push({ monthDocId, pcAppt });
      const beforeKey = String(pcAppt?.appointmentType ?? 'null');
      beforeShapeDist[beforeKey] = (beforeShapeDist[beforeKey] || 0) + 1;
      const after = mapPcTypeToBe(pcAppt?.appointmentType);
      afterDist[after] = (afterDist[after] || 0) + 1;
    }
  }
  console.log(`[phase-20-0] total embedded appointments: ${allAppts.length}`);
  console.log('[phase-20-0] before-shape-distribution:', beforeShapeDist);
  console.log('[phase-20-0] after-distribution:', afterDist);

  // 3. Filter for migration — skip if be_appointments/{id} already exists
  console.log(`[phase-20-0] checking ${BE_COLLECTION} for existing docs (idempotency)…`);
  const toMigrate = [];
  let skippedExisting = 0;
  let skippedInvalid = 0;
  // Read existing be_appointments IDs once (faster than per-appt get)
  const beSnap = await db.collection(BE_COLLECTION).select().get();
  const existingIds = new Set(beSnap.docs.map(d => d.id));
  console.log(`[phase-20-0] existing be_appointments docs: ${existingIds.size}`);

  for (const { monthDocId, pcAppt } of allAppts) {
    const mapped = mapPcAppointmentToBe(pcAppt, monthDocId);
    if (!mapped) {
      skippedInvalid++;
      continue;
    }
    if (existingIds.has(mapped.id)) {
      skippedExisting++;
      continue;
    }
    toMigrate.push(mapped);
  }

  console.log(`[phase-20-0] docs-to-migrate: ${toMigrate.length}`);
  console.log(`[phase-20-0] skipped (already in be_appointments): ${skippedExisting}`);
  console.log(`[phase-20-0] skipped (invalid — no id): ${skippedInvalid}`);

  if (dryRun) {
    console.log('[phase-20-0] DRY-RUN mode — no writes. Re-run with --apply to commit.');
    process.exit(0);
  }

  // 4. APPLY mode: commit writes
  if (toMigrate.length === 0) {
    console.log('[phase-20-0] APPLY — 0 docs to migrate (idempotent re-run).');
    const auditId = `phase-20-0-migrate-pc-appointments-${Date.now()}-${randHex()}`;
    await db.collection(AUDIT_COLLECTION).doc(auditId).set({
      phase: '20.0',
      op: 'migrate-pc-appointments-to-be',
      scanned: allAppts.length,
      migrated: 0,
      skippedExisting,
      skippedInvalid,
      monthsProcessed: snap.size,
      beforeShapeDistribution: beforeShapeDist,
      afterDistribution: afterDist,
      appliedAt: FieldValue.serverTimestamp(),
    });
    console.log(`[phase-20-0] APPLY done (0 migrated). Audit: ${AUDIT_COLLECTION}/${auditId}`);
    process.exit(0);
  }

  // Batch writes: Firestore caps batch at 500 ops. Each appt = 1 set.
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const slice = toMigrate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { id, doc } of slice) {
      batch.set(db.collection(BE_COLLECTION).doc(id), doc);
    }
    await batch.commit();
    written += slice.length;
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`[phase-20-0] committed batch ${batchNum} (${written}/${toMigrate.length})`);
  }

  // 5. Audit doc
  const auditId = `phase-20-0-migrate-pc-appointments-${Date.now()}-${randHex()}`;
  await db.collection(AUDIT_COLLECTION).doc(auditId).set({
    phase: '20.0',
    op: 'migrate-pc-appointments-to-be',
    scanned: allAppts.length,
    migrated: written,
    skippedExisting,
    skippedInvalid,
    monthsProcessed: snap.size,
    beforeShapeDistribution: beforeShapeDist,
    afterDistribution: afterDist,
    defaultBranchId: DEFAULT_BRANCH_ID,
    appliedAt: FieldValue.serverTimestamp(),
  });

  console.log(`[phase-20-0] APPLY done — ${written} migrated. Audit: ${AUDIT_COLLECTION}/${auditId}`);
  process.exit(0);
}

// Only run main() when invoked directly via CLI (not when imported by tests).
// Mirrors Phase 18.0 + 19.0 convention.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[phase-20-0] FATAL', err);
    process.exit(1);
  });
}
