#!/usr/bin/env node
// ─── Phase 24.0-vicies-novies-ter — wipe ALL master_data/* (Rule M) ────────
//
// User directive 2026-05-07 (verbatim): "และในภาพ ซึ่งเป็นสิ่งที่เคย sync มา
// แล้วจาก trial ที่เก็บไว้ในหน้า tab=masterdata ฝากลบและเคลียให้หมด สามารถ
// pull env แล้วรันไปลบได้เลย".
//
// Scope: every doc under
//   artifacts/{APP_ID}/public/data/master_data/* AND
//   artifacts/{APP_ID}/public/data/master_data/*/items/*
//
// After this script runs, MasterDataTab UI will show 0 items per entity.
// Admin can then re-sync from PRODUCTION ProClinic (Phase 24.0-vicies-novies-
// ter source-switch landed alongside this script) using the per-entity Sync
// buttons.
//
// Two-phase: dry-run by default, --apply commits. Idempotent: re-run with
// --apply yields 0 deletes (master_data tree already empty).
//
// Audit doc:
//   artifacts/{APP_ID}/public/data/be_admin_audit/
//     phase-24-0-vicies-novies-ter-wipe-master-data-<ts>-<rand>
//
// Run via:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/phase-24-0-vicies-novies-ter-wipe-master-data.mjs           (dry-run)
//   node scripts/phase-24-0-vicies-novies-ter-wipe-master-data.mjs --apply   (commit)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Load .env.local.prod or .env.local into process.env ─────────────────
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
const MASTER_DATA_PATH = `${BASE_PATH}/master_data`;
const AUDIT_COLLECTION = `${BASE_PATH}/be_admin_audit`;

// All master_data entity types currently synced from ProClinic. Mirrors the
// MasterDataTab ALL_SYNC_TARGETS list (post Phase 24.0-vicies-novies-ter).
// Items NOT in this list are still scanned + deleted via the recursive
// loop — listing here is informational + lets the script report counts
// per entity for the audit doc.
const KNOWN_ENTITIES = Object.freeze([
  // Marketing
  'promotions', 'coupons', 'vouchers',
  // Inventory taxonomy
  'product_groups', 'product_units', 'medical_instruments', 'holidays',
  'branches', 'permission_groups',
  // DF
  'df_groups', 'df_staff_rates',
  // Customer-facing
  'wallet_types', 'membership_types', 'medicine_labels',
  // Staff
  'staff', 'doctors', 'staff_schedules',
  // Catalog
  'products', 'courses',
]);

// ─── CLI args ──────────────────────────────────────────────────────────────
const apply = process.argv.includes('--apply');
const dryRun = !apply;

// ─── Pure helpers (exported for tests) ─────────────────────────────────────

/**
 * Generate cryptographically random hex string of length n (audit-doc suffix).
 * Mirrors Phase 18.0 / 19.0 / Rule M convention.
 */
export function randHex(n = 8) {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

/**
 * Tally per-entity counts from a flat list of doc paths. Splits each path
 * to extract the entity type (the segment after master_data/).
 */
export function tallyByEntity(paths, basePath = MASTER_DATA_PATH) {
  const tally = {};
  const prefix = basePath + '/';
  for (const p of paths) {
    if (!p.startsWith(prefix)) continue;
    const after = p.slice(prefix.length);
    const entity = after.split('/')[0];
    if (!entity) continue;
    tally[entity] = (tally[entity] || 0) + 1;
  }
  return tally;
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
    // PEM keys come from .env files with literal "\n" escapes — convert.
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
    console.error('[phase-24-0-vicies-novies-ter] FATAL — no Firebase admin credentials.');
    console.error('  Set FIREBASE_ADMIN_CREDENTIALS_PATH, OR');
    console.error('  set FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY, OR');
    console.error('  pull env via: vercel env pull .env.local.prod --environment=production');
    process.exit(1);
  }

  const cred = JSON.parse(credText);
  initializeApp({ credential: cert(cred) });
}

// ─── Recursive collection-tree deleter ──────────────────────────────────────

/**
 * Recursively collect all doc refs under a collection (including subcollection
 * items). Returns array of full Firestore paths. Used in dry-run + apply.
 */
async function collectDocPaths(db, collectionPath) {
  const paths = [];
  const colRef = db.collection(collectionPath);
  const snap = await colRef.get();
  for (const doc of snap.docs) {
    paths.push(doc.ref.path);
    // Probe each known subcollection ('items' is the canonical mc subcol).
    // Firestore Admin SDK has listCollections() which returns ALL subcols
    // — we use that to avoid hardcoding 'items' (defense-in-depth: future
    // entities might use a different subcol name).
    const subCols = await doc.ref.listCollections();
    for (const sub of subCols) {
      const subPaths = await collectDocPaths(db, `${collectionPath}/${doc.id}/${sub.id}`);
      paths.push(...subPaths);
    }
  }
  return paths;
}

/**
 * Delete a list of doc paths in batches of 400 (Firestore batch cap = 500;
 * 400 leaves headroom for retry).
 */
async function deletePaths(db, paths) {
  const BATCH_SIZE = 400;
  let deleted = 0;
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const slice = paths.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const p of slice) batch.delete(db.doc(p));
    await batch.commit();
    deleted += slice.length;
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(
      `[phase-24-0-vicies-novies-ter] committed batch ${batchNum} (${deleted}/${paths.length})`,
    );
  }
  return deleted;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[phase-24-0-vicies-novies-ter] mode = ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  initFirebase();
  const db = getFirestore();

  console.log(`[phase-24-0-vicies-novies-ter] scanning ${MASTER_DATA_PATH}…`);
  const paths = await collectDocPaths(db, MASTER_DATA_PATH);
  console.log(`[phase-24-0-vicies-novies-ter] scanned ${paths.length} docs`);

  const tally = tallyByEntity(paths);
  console.log('[phase-24-0-vicies-novies-ter] tally-by-entity:', tally);

  // Distinguish KNOWN_ENTITIES from unknowns (informational — both still nuked).
  const unknownEntities = Object.keys(tally).filter((k) => !KNOWN_ENTITIES.includes(k));
  if (unknownEntities.length) {
    console.log('[phase-24-0-vicies-novies-ter] unknown-entities (still wiped):', unknownEntities);
  }

  if (dryRun) {
    console.log(
      '[phase-24-0-vicies-novies-ter] DRY-RUN — no writes. Re-run with --apply to commit.',
    );
    process.exit(0);
  }

  // APPLY mode: commit deletes
  if (paths.length === 0) {
    console.log('[phase-24-0-vicies-novies-ter] APPLY — 0 docs to delete (idempotent re-run).');
    const auditId = `phase-24-0-vicies-novies-ter-wipe-master-data-${Date.now()}-${randHex()}`;
    await db.collection(AUDIT_COLLECTION).doc(auditId).set({
      phase: '24.0-vicies-novies-ter',
      op: 'wipe-master-data',
      scanned: 0,
      deleted: 0,
      tallyByEntity: {},
      appliedAt: FieldValue.serverTimestamp(),
    });
    console.log(
      `[phase-24-0-vicies-novies-ter] APPLY done (0 deleted). Audit: ${AUDIT_COLLECTION}/${auditId}`,
    );
    process.exit(0);
  }

  // Sort paths LONGEST first so subcollection docs delete BEFORE parent
  // master_data/{type} doc. (Firestore deleteDoc on a doc with subcollections
  // does NOT cascade — orphan items would be lost-but-readable. Longest-first
  // ensures we visit items/ before the parent.)
  const sortedPaths = [...paths].sort((a, b) => b.length - a.length);

  const deleted = await deletePaths(db, sortedPaths);

  const auditId = `phase-24-0-vicies-novies-ter-wipe-master-data-${Date.now()}-${randHex()}`;
  await db.collection(AUDIT_COLLECTION).doc(auditId).set({
    phase: '24.0-vicies-novies-ter',
    op: 'wipe-master-data',
    scanned: paths.length,
    deleted,
    tallyByEntity: tally,
    unknownEntities,
    appliedAt: FieldValue.serverTimestamp(),
  });

  console.log(
    `[phase-24-0-vicies-novies-ter] APPLY done — ${deleted} deleted. Audit: ${AUDIT_COLLECTION}/${auditId}`,
  );
  process.exit(0);
}

// Only run main() when invoked directly via CLI (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[phase-24-0-vicies-novies-ter] FATAL', err);
    process.exit(1);
  });
}
