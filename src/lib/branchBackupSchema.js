// ─── Branch backup file schema + validators (V40 — schemaVersion=1) ────────
// Used by api/admin/branch-backup-export.js, branch-restore.js + CLI mirrors.

export const BACKUP_SCHEMA_VERSION = 1;

/**
 * Validate a backup file's meta block. Throws on any contract violation;
 * caller catches + maps to HTTP 400 / Thai error.
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
