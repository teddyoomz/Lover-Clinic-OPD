// src/lib/stockMovementRetentionCore.js
// V106 — pure helpers for stock-movement retention. NO Firebase imports.
// Single source of truth for retention constants + transforms. Consumed by
// api/cron/stock-movement-retention.js + flow-simulate + admin-SDK e2e.

export const RETENTION_DAYS = 90;
export const RETENTION_BATCH_LIMIT = 2000;
export const ARCHIVE_SCHEMA_VERSION = 1;

// now − days, as ISO string (UTC instant). Movements whose normalized
// createdAt < cutoff are eligible for archive+delete.
export function computeCutoffISO(now = new Date(), days = RETENTION_DAYS) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function archiveStoragePath(branchId, yyyyMM) {
  return `stock-movements-archive/${branchId}/${yyyyMM}.json`;
}

export function monthKeyFromISO(createdAtISO) {
  if (typeof createdAtISO !== 'string' || createdAtISO.length < 7) return '';
  return createdAtISO.slice(0, 7);
}

// Normalize createdAt → ISO string for safe age comparison.
// Ported from MovementLogPanel._v105NormalizeCreatedAt (AV95 safe-read backstop):
// handles ISO string | client Timestamp (.toDate) | admin {_seconds} | plain {seconds}.
export function normalizeCreatedAtForCompare(value) {
  const ca = value;
  if (typeof ca === 'string' || ca == null) return ca || '';
  if (typeof ca === 'object') {
    if (typeof ca.toDate === 'function') {
      try { return ca.toDate().toISOString(); } catch { return ''; }
    }
    if (ca._seconds != null) {
      return new Date(ca._seconds * 1000 + Math.floor((ca._nanoseconds || 0) / 1e6)).toISOString();
    }
    if (ca.seconds != null) {
      return new Date(ca.seconds * 1000 + Math.floor((ca.nanoseconds || 0) / 1e6)).toISOString();
    }
  }
  return '';
}

// "{branchId}|{YYYY-MM}" key for a movement. '' when createdAt unparseable
// (such a doc is NEVER archived or deleted — defensive).
export function groupKeyForMovement(m) {
  const month = monthKeyFromISO(normalizeCreatedAtForCompare(m && m.createdAt));
  if (!month) return '';
  const branchId = (m && typeof m.branchId === 'string' && m.branchId) ? m.branchId : '';
  return `${branchId}|${month}`;
}

export function groupByBranchMonth(movements) {
  const groups = {};
  for (const m of (Array.isArray(movements) ? movements : [])) {
    const key = groupKeyForMovement(m);
    if (!key) continue;
    (groups[key] = groups[key] || []).push(m);
  }
  return groups;
}

// Union deduped by movementId. Idempotent. Order: existing first, then new.
export function mergeArchive(existing, incoming) {
  const seen = new Set();
  const out = [];
  const push = (arr) => {
    for (const m of (Array.isArray(arr) ? arr : [])) {
      const id = m && m.movementId;
      if (id == null) { out.push(m); continue; } // keep id-less legacy rows as-is
      if (seen.has(id)) continue;
      seen.add(id); out.push(m);
    }
  };
  push(existing); push(incoming);
  return out;
}

export function buildArchiveFileBody({ branchId, month, movements, archivedAt = new Date().toISOString() }) {
  const arr = Array.isArray(movements) ? movements : [];
  return { schemaVersion: ARCHIVE_SCHEMA_VERSION, branchId, month, archivedAt, count: arr.length, movements: arr };
}
