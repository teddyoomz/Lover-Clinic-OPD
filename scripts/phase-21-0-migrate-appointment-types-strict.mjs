#!/usr/bin/env node
// ─── Phase 21.0 — Strict appointmentType stamp + deposit→appointment backfill ──
// Two-phase migration in a single script. Both phases are idempotent.
//
// Phase 21.0a — Strict stamp:
//   Re-scan be_appointments. Any doc whose `appointmentType` is NOT in the
//   canonical 4-set ('no-deposit-booking', 'deposit-booking', 'treatment-in',
//   'follow-up') gets stamped 'no-deposit-booking' (DEFAULT). Covers any
//   stragglers not picked up by Phase 19.0 (e.g. docs created via direct
//   admin SDK writes, post-19.0 ProClinic-imports without translator pass).
//
// Phase 21.0b — Backfill be_appointments from be_deposits (hasAppointment=true):
//   Scan be_deposits. For each doc where:
//     - hasAppointment === true
//     - status !== 'cancelled'
//     - linkedAppointmentId is empty / null / missing
//     - embedded `appointment` field has at least date + startTime
//   ... spawn a corresponding be_appointments doc with:
//     - appointmentType = 'deposit-booking'
//     - linkedDepositId = depositId
//     - branchId = deposit.branchId (preserved exactly)
//     - all relevant fields copied from deposit + deposit.appointment
//     - spawnedFromDepositId / spawnedAt forensic-trail
//   Update the deposit with linkedAppointmentId = newAppointmentId.
//
// Why this matters: pre-Phase 21.0, DepositPanel wrote the appointment as a
// NESTED FIELD on be_deposits without spawning a be_appointments doc. The new
// 'จองมัดจำ' sub-tab reads be_appointments → these legacy deposits would be
// invisible until backfilled. After this script runs, every active deposit-
// booking ever created appears in the จองมัดจำ sub-tab of its branch.
//
// Run via:
//   node scripts/phase-21-0-migrate-appointment-types-strict.mjs           (dry-run)
//   node scripts/phase-21-0-migrate-appointment-types-strict.mjs --apply   (commits)
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
const APPOINTMENT_TYPE_VALUES = Object.freeze([
  'deposit-booking',
  'no-deposit-booking',
  'treatment-in',
  'follow-up',
]);
const DEFAULT_TYPE = 'no-deposit-booking';
const APP_ID = 'loverclinic-opd-4c39b';
// Production data lives under artifacts/{APP_ID}/public/data/* — V15 #22
// lock. Bare collection paths hit default-deny and look like rule drift.
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const APPT_COLLECTION = `${BASE_PATH}/be_appointments`;
const DEPOSIT_COLLECTION = `${BASE_PATH}/be_deposits`;
const AUDIT_COLLECTION = `${BASE_PATH}/be_admin_audit`;

// ─── CLI args ──────────────────────────────────────────────────────────────
const apply = process.argv.includes('--apply');
const dryRun = !apply;

// ─── Pure helpers (exported for tests) ─────────────────────────────────────

/**
 * Map any value to the canonical 4-set. Idempotent for values already in set.
 * Unknown / null / missing → DEFAULT_TYPE.
 */
export function mapAppointmentType(value) {
  if (typeof value === 'string' && APPOINTMENT_TYPE_VALUES.includes(value)) {
    return value;
  }
  return DEFAULT_TYPE;
}

/**
 * Predicate — does this be_deposits doc need a backfilled be_appointments doc?
 *   Skip if status='cancelled' (no live booking)
 *   Skip if hasAppointment !== true
 *   Skip if linkedAppointmentId already set
 *   Skip if the embedded appointment field lacks date or startTime (incomplete)
 */
export function depositNeedsBackfill(deposit) {
  if (!deposit || typeof deposit !== 'object') return false;
  if (deposit.status === 'cancelled') return false;
  if (deposit.hasAppointment !== true) return false;
  if (deposit.linkedAppointmentId) return false;
  const appt = deposit.appointment;
  if (!appt || typeof appt !== 'object') return false;
  if (!appt.date || !appt.startTime) return false;
  return true;
}

/**
 * Build the be_appointments doc payload to spawn from a be_deposits doc.
 * Returns the payload — caller writes it via batch.set.
 *
 * @param {Object} args
 * @param {Object} args.deposit       — the deposit doc data
 * @param {string} args.depositId     — the deposit doc id
 * @param {string} args.appointmentId — the new appointment doc id (caller-minted)
 * @param {Date}   args.now           — capture-once timestamp
 */
export function buildBackfillAppointment({ deposit, depositId, appointmentId, now }) {
  const appt = deposit.appointment || {};
  const iso = (now instanceof Date ? now : new Date()).toISOString();
  return {
    appointmentId,
    customerId: String(deposit.customerId || ''),
    customerName: deposit.customerName || '',
    customerHN: deposit.customerHN || '',
    date: appt.date || '',
    startTime: appt.startTime || '',
    endTime: appt.endTime || appt.startTime || '',
    appointmentType: 'deposit-booking',
    advisorId: appt.advisorId || '',
    advisorName: appt.advisorName || '',
    doctorId: appt.doctorId || '',
    doctorName: appt.doctorName || '',
    assistantIds: Array.isArray(appt.assistantIds) ? appt.assistantIds : [],
    assistantNames: Array.isArray(appt.assistantNames) ? appt.assistantNames : [],
    roomId: appt.roomId || '',
    roomName: appt.roomName || '',
    channel: appt.channel || '',
    appointmentTo: appt.purpose || appt.appointmentTo || '',
    location: appt.location || '',
    notes: appt.note || appt.notes || '',
    appointmentColor: appt.color || appt.appointmentColor || '',
    lineNotify: !!appt.lineNotify,
    status: 'pending',
    branchId: deposit.branchId || null,
    linkedDepositId: depositId,
    spawnedFromDepositId: depositId,
    spawnedAt: iso,
    createdAt: iso,
    updatedAt: iso,
  };
}

export function randHex(n = 8) {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

// ─── Firebase init (mirrors Phase 19.0 / Phase 20.0 templates) ──────────────

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
    // PEM key with literal \n escapes → real newlines (V15 #22 lesson).
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
    console.error('[phase-21-0] FATAL — no Firebase admin credentials found.');
    console.error('  Set FIREBASE_ADMIN_CREDENTIALS_PATH=/path/to/key.json, OR');
    console.error('  set FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY, OR');
    console.error('  create .env.local.prod with FIREBASE_ADMIN_PRIVATE_KEY=... (vercel env pull).');
    process.exit(1);
  }

  const cred = JSON.parse(credText);
  initializeApp({ credential: cert(cred) });
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[phase-21-0] mode = ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  initFirebase();
  const db = getFirestore();

  // ── Phase 21.0a — strict stamp scan ─────────────────────────────────────
  console.log(`[phase-21-0a] scanning ${APPT_COLLECTION}…`);
  const apptSnap = await db.collection(APPT_COLLECTION).get();
  console.log(`[phase-21-0a] scanned ${apptSnap.size} appointment documents`);

  const apptBeforeDist = {};
  const apptAfterDist = {};
  const toStrictStamp = [];
  for (const doc of apptSnap.docs) {
    const data = doc.data();
    const before = data.appointmentType ?? null;
    const beforeKey = String(before);
    apptBeforeDist[beforeKey] = (apptBeforeDist[beforeKey] || 0) + 1;
    const after = mapAppointmentType(before);
    apptAfterDist[after] = (apptAfterDist[after] || 0) + 1;
    if (APPOINTMENT_TYPE_VALUES.includes(before)) continue;
    toStrictStamp.push({ id: doc.id, before, after });
  }
  console.log('[phase-21-0a] before-distribution:', apptBeforeDist);
  console.log('[phase-21-0a] after-distribution :', apptAfterDist);
  console.log(`[phase-21-0a] docs-to-stamp: ${toStrictStamp.length}`);

  // ── Phase 21.0b — backfill scan ─────────────────────────────────────────
  console.log(`[phase-21-0b] scanning ${DEPOSIT_COLLECTION}…`);
  const depositSnap = await db.collection(DEPOSIT_COLLECTION).get();
  console.log(`[phase-21-0b] scanned ${depositSnap.size} deposit documents`);

  const depositBeforeDist = {
    total: depositSnap.size,
    hasAppointment: 0,
    cancelled: 0,
    alreadyLinked: 0,
    incomplete: 0,
    needsBackfill: 0,
  };
  const toBackfill = [];
  for (const doc of depositSnap.docs) {
    const data = doc.data();
    if (data.hasAppointment === true) depositBeforeDist.hasAppointment += 1;
    if (data.status === 'cancelled') depositBeforeDist.cancelled += 1;
    if (data.linkedAppointmentId) depositBeforeDist.alreadyLinked += 1;
    const ok = depositNeedsBackfill(data);
    if (!ok) {
      // categorize skip reason for diagnostics
      if (data.hasAppointment === true && data.status !== 'cancelled' &&
          !data.linkedAppointmentId) {
        depositBeforeDist.incomplete += 1;
      }
      continue;
    }
    depositBeforeDist.needsBackfill += 1;
    toBackfill.push({ id: doc.id, data });
  }
  console.log('[phase-21-0b] deposit distribution:', depositBeforeDist);
  console.log(`[phase-21-0b] docs-to-backfill: ${toBackfill.length}`);

  if (dryRun) {
    console.log('[phase-21-0] DRY-RUN — no writes. Re-run with --apply to commit.');
    process.exit(0);
  }

  // APPLY — Phase 21.0a strict stamp ─────────────────────────────────────
  let stamped = 0;
  if (toStrictStamp.length > 0) {
    const BATCH_SIZE = 400;
    for (let i = 0; i < toStrictStamp.length; i += BATCH_SIZE) {
      const slice = toStrictStamp.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const { id, before, after } of slice) {
        batch.update(db.collection(APPT_COLLECTION).doc(id), {
          appointmentType: after,
          appointmentTypeMigratedAt: FieldValue.serverTimestamp(),
          appointmentTypeLegacyValue: before,
        });
      }
      await batch.commit();
      stamped += slice.length;
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      console.log(`[phase-21-0a] committed strict batch ${batchNum} (${stamped}/${toStrictStamp.length})`);
    }
  } else {
    console.log('[phase-21-0a] APPLY — 0 docs to stamp (idempotent).');
  }

  // APPLY — Phase 21.0b backfill ─────────────────────────────────────────
  // For each deposit needing backfill, mint a new appointment id and write
  // BOTH docs (new appointment + deposit update) in the same batch.
  // Constraints: writeBatch caps at 500 ops; pair counts as 2 ops per item.
  let spawned = 0;
  const PAIR_BATCH_SIZE = 200;  // 200 * 2 = 400 ops, safely under 500
  if (toBackfill.length > 0) {
    const now = new Date();
    let pairCounter = 0;
    for (let i = 0; i < toBackfill.length; i += PAIR_BATCH_SIZE) {
      const slice = toBackfill.slice(i, i + PAIR_BATCH_SIZE);
      const batch = db.batch();
      for (const { id: depositId, data: deposit } of slice) {
        // Mint deterministic-but-collision-resistant appointment id.
        // Format: BA-{ms}-{2-char-rand}. Uses Date.now() + counter so two
        // appts spawned in same millisecond don't collide.
        pairCounter += 1;
        const appointmentId = `BA-${Date.now()}-${randHex(2)}-bf${pairCounter.toString().padStart(4, '0')}`;
        const apptPayload = buildBackfillAppointment({
          deposit, depositId, appointmentId, now,
        });
        batch.set(db.collection(APPT_COLLECTION).doc(appointmentId), apptPayload);
        batch.update(db.collection(DEPOSIT_COLLECTION).doc(depositId), {
          linkedAppointmentId: appointmentId,
          linkedAppointmentBackfilledAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      spawned += slice.length;
      const batchNum = Math.floor(i / PAIR_BATCH_SIZE) + 1;
      console.log(`[phase-21-0b] committed backfill batch ${batchNum} (${spawned}/${toBackfill.length})`);
    }
  } else {
    console.log('[phase-21-0b] APPLY — 0 docs to backfill (idempotent).');
  }

  // Audit doc — single doc records BOTH phases
  const auditId = `phase-21-0-strict-and-backfill-${Date.now()}-${randHex()}`;
  await db.collection(AUDIT_COLLECTION).doc(auditId).set({
    phase: '21.0',
    op: 'strict-appointment-type + backfill-deposit-bookings',
    scanned: { appts: apptSnap.size, deposits: depositSnap.size },
    migratedA: stamped,
    spawnedB: spawned,
    skippedA: apptSnap.size - stamped,
    skippedB: depositSnap.size - spawned,
    beforeDistribution: {
      appts: apptBeforeDist,
      deposits: depositBeforeDist,
    },
    afterDistribution: {
      appts: apptAfterDist,
    },
    appliedAt: FieldValue.serverTimestamp(),
  });

  console.log(`[phase-21-0] APPLY done — strict-stamped ${stamped}, backfilled ${spawned}. Audit: ${AUDIT_COLLECTION}/${auditId}`);
  process.exit(0);
}

// Only run main() when invoked directly via CLI (not when imported by tests).
// Mirrors Phase 18.0 / 19.0 / 20.0 convention (V15 #22 lesson).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[phase-21-0] FATAL', err);
    process.exit(1);
  });
}
