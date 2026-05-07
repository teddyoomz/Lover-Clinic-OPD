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
//
// Backwards compat: validateBackupFile accepts v1 AND v2. The reviver
// (jsonReviverForNonFinite) is a no-op on v1 files (no sentinels present).

export const BACKUP_SCHEMA_VERSION = 2;

/**
 * Validate a backup file's meta block. Throws on any contract violation;
 * caller catches + maps to HTTP 400 / Thai error.
 *
 * Accepts both schemaVersion=1 (legacy) and =2 (current). Newer-than-current
 * is rejected to prevent forward-incompatible files from importing silently.
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
  return true;
}

/** Compose a backup-file object with current schema. */
export function buildBackupFile({ sourceBranchId, exportedBy, scope, collections, isAutoPreFresh = false }) {
  const perCollectionCounts = {};
  for (const [k, arr] of Object.entries(collections || {})) {
    perCollectionCounts[k] = Array.isArray(arr) ? arr.length : 0;
  }
  return {
    meta: {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      sourceBranchId: String(sourceBranchId || ''),
      exportedBy: String(exportedBy || ''),
      exportedAt: new Date().toISOString(),
      scope: scope || { tiers: [], collections: [] },
      perCollectionCounts,
      isAutoPreFresh: !!isAutoPreFresh,
    },
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
