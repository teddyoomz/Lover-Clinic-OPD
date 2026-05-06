#!/usr/bin/env node
// ─── Phase 22.0a — Sync-Status Reset (NO DELETIONS, status-only flip) ──────
//
// Spec: docs/superpowers/specs/2026-05-06-phase-22-0a-sync-status-reset-design.md
//
// User safety directive (verbatim 2026-05-06):
//   "อย่าลบข้อมูลลูกค้าใน frontend นะเว้ย แค่ให้หบุด sync นะเว้ยย ข้อมูลสำคัญ
//    มากนะ"
//
// 🚨 NO DOCUMENT IS DELETED. Only status fields are flipped/nulled.
// All customer / appointment / course / deposit / treatment DATA is preserved.
// Forensic trail (nested *ResetMetadata field) on every wiped doc captures
// legacy values for full reversibility.
//
// Three sub-phases (single audit doc):
//   A. opd_sessions — wipe broker-* and *SyncStatus fields (8 fields → null)
//   B. pc_* (5 collections) — clear `syncedAt` field only (DOCS PRESERVED)
//   C. be_deposits — null-out proClinicDepositId (only safe be_* ref)
//
// Rule M canonical (mirrors Phase 19/20/21 templates):
//   - env loaded from .env.local.prod (vercel env pull)
//   - firebase-admin SDK
//   - canonical artifacts/{APP_ID}/public/data/<collection> paths
//   - --dry-run default; --apply commits
//   - audit doc to be_admin_audit
//   - idempotent (re-runs yield 0 writes)
//   - PEM `\n` escape conversion (V15 #22 lock)
//   - invocation guard (V19 #22 lock)
//   - crypto-secure audit-id suffix (Rule C2)
//
// Run:
//   node scripts/phase-22-0a-reset-sync-status.mjs           (dry-run)
//   node scripts/phase-22-0a-reset-sync-status.mjs --apply   (commits)

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
const COL = {
  opd: `${BASE_PATH}/opd_sessions`,
  pcCustomers: `${BASE_PATH}/pc_customers`,
  pcAppointments: `${BASE_PATH}/pc_appointments`,
  pcCourses: `${BASE_PATH}/pc_courses`,
  pcDeposits: `${BASE_PATH}/pc_deposits`,
  pcTreatments: `${BASE_PATH}/pc_treatments`,
  beDeposits: `${BASE_PATH}/be_deposits`,
  audit: `${BASE_PATH}/be_admin_audit`,
};

// Wipe-target fields on opd_sessions (Q1=B aggressive wipe).
const OPD_WIPE_FIELDS = Object.freeze([
  'brokerStatus',
  'brokerProClinicId',
  'brokerProClinicHN',
  'brokerError',
  'brokerFilledAt',
  'brokerLastAutoSyncAt',
  'depositSyncStatus',
  'appointmentSyncStatus',
]);

// ─── CLI args ──────────────────────────────────────────────────────────────
const apply = process.argv.includes('--apply');
const dryRun = !apply;

// ─── Pure helpers (exported for tests) ─────────────────────────────────────

/**
 * Crypto-secure hex string for audit-doc id suffix (Rule C2 — no Math.random).
 */
export function randHex(n = 8) {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

/**
 * Compute the wipe patch for an opd_sessions doc.
 *
 * Returns:
 *   { hasChange, patch, legacy }
 *     hasChange — true if any wipe-target field is currently non-null
 *     patch     — object to apply via batch.update (all 8 fields → null
 *                 + brokerResetMetadata nested forensic trail)
 *     legacy    — captured prior values (for forensic trail + audit telemetry)
 *
 * Idempotent: a doc whose 8 fields are ALL null returns hasChange=false
 * EXCEPT we still preserve any prior brokerResetMetadata so re-runs
 * recognize the doc as already migrated.
 */
export function mapOpdSessionWipe(doc) {
  const data = doc || {};
  const legacy = {};
  let hasChange = false;
  for (const field of OPD_WIPE_FIELDS) {
    const cur = data[field];
    if (cur != null && cur !== '') {
      hasChange = true;
      legacy[`legacy${field[0].toUpperCase()}${field.slice(1)}`] = cur;
    }
  }
  // If brokerResetMetadata already exists AND no field is non-null,
  // treat as already-migrated (idempotent skip).
  if (!hasChange) return { hasChange: false, patch: null, legacy: {} };
  // Build the patch
  const patch = {};
  for (const field of OPD_WIPE_FIELDS) {
    patch[field] = null;
  }
  patch.brokerResetMetadata = {
    resetAt: FieldValue.serverTimestamp(),
    resetPhase: '22.0a',
    ...legacy,
  };
  return { hasChange: true, patch, legacy };
}

/**
 * Compute the patch for a pc_* doc (clear syncedAt + forensic trail).
 *
 * NO doc deletion — only status field flip. User safety directive 2026-05-06:
 * "อย่าลบข้อมูลลูกค้าใน frontend นะเว้ย".
 *
 * Idempotent: a doc with syncedAt already null returns hasChange=false.
 */
export function mapPcSyncCleared(doc) {
  const data = doc || {};
  const cur = data.syncedAt;
  if (cur == null || cur === '') {
    return { hasChange: false, patch: null, legacy: {} };
  }
  const patch = {
    syncedAt: null,
    proSyncedResetMetadata: {
      resetAt: FieldValue.serverTimestamp(),
      resetPhase: '22.0a',
      legacySyncedAt: cur,
    },
  };
  return { hasChange: true, patch, legacy: { legacySyncedAt: cur } };
}

/**
 * Compute the patch for a be_deposits doc (null-out proClinicDepositId).
 *
 * Conservative scope: only the pure ProClinic ref field is touched. Other
 * be_* fields with proClinic prefix (proClinicId on be_customers, etc.)
 * are KEPT — they're doc IDs / FKs / source-traceability, nulling breaks
 * lookups not sync state.
 */
export function mapBeDepositWipe(doc) {
  const data = doc || {};
  const cur = data.proClinicDepositId;
  if (cur == null || cur === '') {
    return { hasChange: false, patch: null, legacy: {} };
  }
  const patch = {
    proClinicDepositId: null,
    proClinicDepositResetMetadata: {
      resetAt: FieldValue.serverTimestamp(),
      resetPhase: '22.0a',
      legacyProClinicDepositId: cur,
    },
  };
  return { hasChange: true, patch, legacy: { legacyProClinicDepositId: cur } };
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
    // PEM key stored with literal \n escapes in .env — convert to real
    // newlines so firebase-admin's PEM parser accepts them (V15 #22 lock).
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
    console.error('[phase-22-0a] FATAL — no Firebase admin credentials found.');
    console.error('  Run `vercel env pull .env.local.prod --environment=production` first.');
    process.exit(1);
  }
  const cred = JSON.parse(credText);
  initializeApp({ credential: cert(cred) });
}

// ─── Scan helpers ──────────────────────────────────────────────────────────

async function scanOpdSessions(db) {
  console.log(`[phase-22-0a-A] scanning ${COL.opd}…`);
  const snap = await db.collection(COL.opd).get();
  console.log(`[phase-22-0a-A] scanned ${snap.size} opd_sessions docs`);
  const beforeDist = { total: snap.size, hasAnyWipeField: 0 };
  const fieldDist = Object.fromEntries(OPD_WIPE_FIELDS.map(f => [f, 0]));
  const toMigrate = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    let hasAny = false;
    for (const field of OPD_WIPE_FIELDS) {
      if (data[field] != null && data[field] !== '') {
        fieldDist[field] += 1;
        hasAny = true;
      }
    }
    if (hasAny) beforeDist.hasAnyWipeField += 1;
    const { hasChange, patch } = mapOpdSessionWipe(data);
    if (hasChange) toMigrate.push({ id: doc.id, patch });
  }
  console.log('[phase-22-0a-A] before-distribution:', { ...beforeDist, fieldDist });
  console.log(`[phase-22-0a-A] docs-to-wipe: ${toMigrate.length}`);
  return { snap, toMigrate, beforeDist, fieldDist };
}

async function scanPcCollection(db, collectionPath, label) {
  console.log(`[phase-22-0a-B] scanning ${collectionPath}…`);
  const snap = await db.collection(collectionPath).get();
  console.log(`[phase-22-0a-B] scanned ${snap.size} ${label} docs`);
  const toMigrate = [];
  let withSyncedAt = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.syncedAt != null && data.syncedAt !== '') withSyncedAt += 1;
    const { hasChange, patch } = mapPcSyncCleared(data);
    if (hasChange) toMigrate.push({ id: doc.id, patch });
  }
  console.log(`[phase-22-0a-B] ${label}: ${withSyncedAt}/${snap.size} have non-null syncedAt`);
  return { snap, toMigrate, withSyncedAt };
}

async function scanBeDeposits(db) {
  console.log(`[phase-22-0a-C] scanning ${COL.beDeposits}…`);
  const snap = await db.collection(COL.beDeposits).get();
  console.log(`[phase-22-0a-C] scanned ${snap.size} be_deposits docs`);
  const toMigrate = [];
  let withProClinicId = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.proClinicDepositId != null && data.proClinicDepositId !== '') withProClinicId += 1;
    const { hasChange, patch } = mapBeDepositWipe(data);
    if (hasChange) toMigrate.push({ id: doc.id, patch });
  }
  console.log(`[phase-22-0a-C] be_deposits: ${withProClinicId}/${snap.size} have non-null proClinicDepositId`);
  return { snap, toMigrate, withProClinicId };
}

// ─── Batched commit helper ─────────────────────────────────────────────────

async function commitBatched(db, collectionPath, items, label) {
  if (items.length === 0) {
    console.log(`[phase-22-0a] ${label} — 0 docs to update (idempotent).`);
    return 0;
  }
  const BATCH_SIZE = 400; // safely under Firestore's 500-op cap
  let written = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const slice = items.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { id, patch } of slice) {
      batch.update(db.collection(collectionPath).doc(id), patch);
    }
    await batch.commit();
    written += slice.length;
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`[phase-22-0a] ${label} — committed batch ${batchNum} (${written}/${items.length})`);
  }
  return written;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[phase-22-0a] mode = ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('[phase-22-0a] 🚨 SAFETY: NO doc is DELETED. All status fields flip/null. Forensic trail recoverable.');
  initFirebase();
  const db = getFirestore();

  // ── Sub-phase A: opd_sessions wipe ──
  const opdScan = await scanOpdSessions(db);

  // ── Sub-phase B: pc_* sync-cleared ──
  const pcLabels = [
    ['pcCustomers', COL.pcCustomers],
    ['pcAppointments', COL.pcAppointments],
    ['pcCourses', COL.pcCourses],
    ['pcDeposits', COL.pcDeposits],
    ['pcTreatments', COL.pcTreatments],
  ];
  const pcScans = {};
  for (const [label, path] of pcLabels) {
    pcScans[label] = await scanPcCollection(db, path, label);
  }

  // ── Sub-phase C: be_deposits.proClinicDepositId null-out ──
  const beScan = await scanBeDeposits(db);

  // ── Summary ──
  const summary = {
    scanned: {
      opdSessions: opdScan.snap.size,
      pcCustomers: pcScans.pcCustomers.snap.size,
      pcAppointments: pcScans.pcAppointments.snap.size,
      pcCourses: pcScans.pcCourses.snap.size,
      pcDeposits: pcScans.pcDeposits.snap.size,
      pcTreatments: pcScans.pcTreatments.snap.size,
      beDeposits: beScan.snap.size,
    },
    toModify: {
      opdSessionsWipe: opdScan.toMigrate.length,
      pcCustomersSyncCleared: pcScans.pcCustomers.toMigrate.length,
      pcAppointmentsSyncCleared: pcScans.pcAppointments.toMigrate.length,
      pcCoursesSyncCleared: pcScans.pcCourses.toMigrate.length,
      pcDepositsSyncCleared: pcScans.pcDeposits.toMigrate.length,
      pcTreatmentsSyncCleared: pcScans.pcTreatments.toMigrate.length,
      beDepositsProClinicIdNulled: beScan.toMigrate.length,
    },
  };
  console.log('[phase-22-0a] SUMMARY:', JSON.stringify(summary, null, 2));

  if (dryRun) {
    console.log('[phase-22-0a] DRY-RUN — no writes. Re-run with --apply to commit.');
    process.exit(0);
  }

  // ── APPLY mode: commit all sub-phases ──
  const written = {
    opdSessions: await commitBatched(db, COL.opd, opdScan.toMigrate, 'opd_sessions wipe'),
    pcCustomers: await commitBatched(db, COL.pcCustomers, pcScans.pcCustomers.toMigrate, 'pc_customers syncedAt cleared'),
    pcAppointments: await commitBatched(db, COL.pcAppointments, pcScans.pcAppointments.toMigrate, 'pc_appointments syncedAt cleared'),
    pcCourses: await commitBatched(db, COL.pcCourses, pcScans.pcCourses.toMigrate, 'pc_courses syncedAt cleared'),
    pcDeposits: await commitBatched(db, COL.pcDeposits, pcScans.pcDeposits.toMigrate, 'pc_deposits syncedAt cleared'),
    pcTreatments: await commitBatched(db, COL.pcTreatments, pcScans.pcTreatments.toMigrate, 'pc_treatments syncedAt cleared'),
    beDeposits: await commitBatched(db, COL.beDeposits, beScan.toMigrate, 'be_deposits proClinicDepositId nulled'),
  };

  // ── Audit doc (single doc records all 3 sub-phases) ──
  const auditId = `phase-22-0a-sync-status-reset-${Date.now()}-${randHex()}`;
  await db.collection(COL.audit).doc(auditId).set({
    phase: '22.0a',
    op: 'sync-status-reset (opd_sessions wipe + pc_*.syncedAt cleared + be_deposits.proClinicDepositId null-out) — NO DELETIONS',
    safetyDirective: 'อย่าลบข้อมูลลูกค้าใน frontend นะเว้ย แค่ให้หบุด sync นะเว้ยย ข้อมูลสำคัญมากนะ (2026-05-06)',
    scanned: summary.scanned,
    modified: {
      opdSessionsWiped: written.opdSessions,
      pcCustomersSyncCleared: written.pcCustomers,
      pcAppointmentsSyncCleared: written.pcAppointments,
      pcCoursesSyncCleared: written.pcCourses,
      pcDepositsSyncCleared: written.pcDeposits,
      pcTreatmentsSyncCleared: written.pcTreatments,
      beDepositsProClinicIdNulled: written.beDeposits,
    },
    beforeDistribution: {
      opdSessions: { fieldDist: opdScan.fieldDist },
    },
    appliedAt: FieldValue.serverTimestamp(),
  });

  console.log(`[phase-22-0a] APPLY done. Audit: ${COL.audit}/${auditId}`);
  console.log('[phase-22-0a] Summary of writes:', JSON.stringify(written, null, 2));
  process.exit(0);
}

// Only run main() when invoked directly via CLI (not when imported by tests).
// V19 #22 invocation guard.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[phase-22-0a] FATAL', err);
    process.exit(1);
  });
}
