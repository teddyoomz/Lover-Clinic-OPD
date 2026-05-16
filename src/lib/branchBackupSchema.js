// ─── Branch backup file schema + validators ────────────────────────────────
// Used by api/admin/branch-backup-export.js, branch-restore.js + CLI mirrors.
//
// schemaVersion history:
//   1 — V40 initial. NaN/Infinity in source serialized as `null` per JSON spec
//       (lossy: number → null, type drift on round-trip).
//   2 — V40-prod-fix-5 (2026-05-08). NaN/Infinity preserved via sentinel
//       encoding `{__number__: 'NaN' | 'Infinity' | '-Infinity'}` in file.
//       Restore reviver decodes back to actual NaN/Infinity. 100% bit-perfect
//       round-trip including non-finite numeric values.
//   2+ — 2026-05-14 selective-make-fresh. Added OPTIONAL meta fields:
//        `bodyHash` (SHA-256 hex of canonical doc list) + `bucketIds`
//        (string[] for traceability). Files without these fields are still
//        valid (V40 legacy v2). New buildBackupFile output ALWAYS includes
//        them. branch-make-fresh.js verifies hash when present.
//
// Backwards compat: validateBackupFile accepts v1 AND v2. The reviver
// (jsonReviverForNonFinite) is a no-op on v1 files (no sentinels present).

import crypto from 'crypto';

export const BACKUP_SCHEMA_VERSION = 2;

/**
 * Validate a backup file's meta block. Throws on any contract violation;
 * caller catches + maps to HTTP 400 / Thai error.
 *
 * Accepts both schemaVersion=1 (legacy) and =2 (current). Newer-than-current
 * is rejected to prevent forward-incompatible files from importing silently.
 *
 * 2026-05-14 selective-make-fresh: if `meta.bodyHash` is PRESENT, validate
 * format (64-char lower-hex). If absent, OK (V40 legacy v2 file).
 */
export function validateBackupFile(file) {
  if (!file || typeof file !== 'object') {
    throw new Error('BACKUP_FILE_INVALID: not an object');
  }
  const meta = file.meta;
  if (!meta || typeof meta !== 'object') {
    throw new Error('BACKUP_META_MISSING');
  }
  if (typeof meta.schemaVersion !== 'number') {
    throw new Error('SCHEMA_VERSION_MISSING');
  }
  if (meta.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(`SCHEMA_VERSION_UNSUPPORTED: ${meta.schemaVersion}`);
  }
  if (typeof meta.sourceBranchId !== 'string' || !meta.sourceBranchId.trim()) {
    throw new Error('SOURCE_BRANCH_ID_MISSING');
  }
  if (typeof file.collections !== 'object' || file.collections === null) {
    throw new Error('COLLECTIONS_BLOCK_MISSING');
  }
  // 2026-05-14 selective-make-fresh — bodyHash optional but if present must be valid
  if (meta.bodyHash !== undefined && meta.bodyHash !== null) {
    if (typeof meta.bodyHash !== 'string' || !/^[0-9a-f]{64}$/.test(meta.bodyHash)) {
      throw new Error('INVALID_BODY_HASH_FORMAT');
    }
  }
  // bucketIds optional but if present must be array of strings
  if (meta.bucketIds !== undefined && meta.bucketIds !== null) {
    if (!Array.isArray(meta.bucketIds)) {
      throw new Error('INVALID_BUCKET_IDS_FORMAT');
    }
  }
  return true;
}

/**
 * Compose a backup-file object with current schema. As of 2026-05-14
 * selective-make-fresh, emits bodyHash + bucketIds in meta when bucketIds
 * is provided.
 */
export function buildBackupFile({ sourceBranchId, exportedBy, scope, collections, isAutoPreFresh = false, bucketIds }) {
  const perCollectionCounts = {};
  for (const [k, arr] of Object.entries(collections || {})) {
    perCollectionCounts[k] = Array.isArray(arr) ? arr.length : 0;
  }
  const meta = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    sourceBranchId: String(sourceBranchId || ''),
    exportedBy: String(exportedBy || ''),
    exportedAt: new Date().toISOString(),
    scope: scope || { tiers: [], collections: [] },
    perCollectionCounts,
    isAutoPreFresh: !!isAutoPreFresh,
  };
  // Selective-make-fresh fields (only emit when bucketIds provided)
  if (Array.isArray(bucketIds) && bucketIds.length > 0) {
    meta.bucketIds = [...bucketIds].sort();
    meta.bodyHash = computeBodyHash(collections || {});
  }
  return {
    meta,
    collections: collections || {},
  };
}

/**
 * V40-prod-fix-5 (2026-05-08) — JSON.stringify replacer that encodes
 * non-finite numbers (NaN, Infinity, -Infinity) as a sentinel object so
 * they survive the round-trip. JSON spec says NaN/Infinity have no
 * representation, so default JSON.stringify converts them to `null` —
 * lossy + cannot distinguish actual null from former NaN.
 *
 * Encoding shape: `{ __number__: 'NaN' | 'Infinity' | '-Infinity' }`
 *
 * Risk: if user data already has an object literally shaped
 * `{ __number__: 'NaN' }` it would be misinterpreted on restore. The chance
 * of such a literal in clinic data is effectively zero (the key is
 * deliberately uncommon).
 */
export function jsonReplacerForNonFinite(_key, value) {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { __number__: 'NaN' };
    if (value === Infinity) return { __number__: 'Infinity' };
    if (value === -Infinity) return { __number__: '-Infinity' };
  }
  return value;
}

/**
 * V40-prod-fix-5 (2026-05-08) — JSON.parse reviver that decodes the
 * sentinel objects produced by jsonReplacerForNonFinite back into actual
 * NaN/Infinity numbers. Acts as a no-op on schemaVersion=1 files (no
 * sentinels present) — backwards compatible.
 */
export function jsonReviverForNonFinite(_key, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value.__number__ === 'string' && Object.keys(value).length === 1) {
      if (value.__number__ === 'NaN') return NaN;
      if (value.__number__ === 'Infinity') return Infinity;
      if (value.__number__ === '-Infinity') return -Infinity;
    }
  }
  return value;
}

// ─── Canonical hash computation (2026-05-14 selective-make-fresh) ──────────
// SHA-256 of canonicalized doc list across all collections.
//
// Canonicalization rules:
//   1. Collections iterated in alphabetical order by collection name.
//   2. Within each collection, docs sorted by `id` (fallback `docId`) string.
//   3. Each value stringified with stable key order (recursive sort).
//   4. NaN/Infinity → existing sentinel `{__number__: 'NaN'|'Infinity'|'-Infinity'}`.
//   5. undefined → 'null' (defensive — Firestore rejects undefined anyway).
//   6. Lines concatenated as `${collection}|${docId}|${stableJson}` joined by '\n'.
//   7. SHA-256 hex of the line buffer → 64-char lower-hex string.
//
// Same input + same canonicalization → same hash. Used by:
//   - buildBackupFile (write side — embed in meta.bodyHash)
//   - branch-make-fresh.js (read side — recompute + compare before wipe)
//   - scripts/e2e-backup-restore-roundtrip-real-prod.mjs (verify round-trip)

// V77-fix3 (2026-05-16 NIGHT — SP-1): exported so wholeFleetBackupCore.js
// can share the same canonicalization. Same input + same canonicalization →
// same hash across V40 branch / V74 customer / V75 whole-fleet flows.
export function canonicalJson(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '{"__number__":"NaN"}';
    if (value === Infinity) return '{"__number__":"Infinity"}';
    if (value === -Infinity) return '{"__number__":"-Infinity"}';
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  // Fallback (functions/symbols shouldn't appear in Firestore data)
  return JSON.stringify(value);
}

/**
 * Compute SHA-256 hex of canonicalized doc list across all collections.
 * Returns 64-char lower-hex string.
 *
 * @param {Object<string, Array<Object>>} collections - {colName: [doc, ...]}
 * @returns {string} 64-char hex SHA-256 hash
 */
export function computeBodyHash(collections) {
  const lines = [];
  const colNames = Object.keys(collections || {}).sort();
  for (const col of colNames) {
    const docs = collections[col] || [];
    const sorted = [...docs].sort((a, b) => {
      const ai = String(a?.id ?? a?.docId ?? '');
      const bi = String(b?.id ?? b?.docId ?? '');
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });
    for (const doc of sorted) {
      const docId = String(doc?.id ?? doc?.docId ?? '');
      lines.push(`${col}|${docId}|${canonicalJson(doc)}`);
    }
  }
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}
