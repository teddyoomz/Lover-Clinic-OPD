// src/lib/wholeFleetBackupCore.js
// V75 Item 2 — Whole-fleet customer backup manifest builder + hasher + validator.
// Parallels V74's customerBackupSchema.js but for the multi-customer case.
// AV56 invariant: every whole-fleet backup MUST emit manifest.json with
// manifestHash covering all customer file hashes + Storage manifest hashes;
// userNote EXCLUDED from hash (Q5b=Y precedent from V74).

import crypto from 'node:crypto';
import { canonicalJson } from './branchBackupSchema.js';

export const WHOLE_FLEET_SCHEMA_VERSION = 1;
export const WHOLE_FLEET_TYPE = 'whole-fleet-customers';

export function buildWholeFleetManifest({
  customers = [],
  failedCustomers = [],
  userNote = '',
  exportedAt = new Date().toISOString(),
  exporterUid = '',
} = {}) {
  const totals = customers.reduce((acc, c) => ({
    appointmentCount: acc.appointmentCount + (c.totals?.appointmentCount || 0),
    saleCount: acc.saleCount + (c.totals?.saleCount || 0),
    treatmentCount: acc.treatmentCount + (c.totals?.treatmentCount || 0),
  }), { appointmentCount: 0, saleCount: 0, treatmentCount: 0 });

  return {
    schemaVersion: WHOLE_FLEET_SCHEMA_VERSION,
    type: WHOLE_FLEET_TYPE,
    customerCount: customers.length,
    customers,
    failedCustomers,
    totals,
    userNote: String(userNote || ''),
    exporterUid: String(exporterUid || ''),
    exportedAt,
  };
}

// Hash EXCLUDES userNote (Q5b=Y) but INCLUDES every customer file hash +
// storage manifest hash + (post-V77-fix3) exporterUid + fileEntry.
// Used as the tampering-detection seal.
//
// V77-fix3 (2026-05-16 NIGHT):
//   - SP-1: switched from raw JSON.stringify to canonicalJson (sorted keys +
//     deterministic across Node versions / future field reorderings); mirrors
//     computeBodyHash in branchBackupSchema.js for cross-flow consistency.
//   - P1-6: exporterUid added to hash seed (was previously omitted —
//     undocumented gap that let admin A overwrite manifest with their uid +
//     same hash, defeating "who exported" audit-integrity).
//   - P1-5 (partial): fileEntry now part of seed; tampering the file path
//     forces a hash mismatch.
//
// V77-fix4 (2026-05-16 NIGHT — N1 retro-compat fix from adversarial Round 2):
//   - Legacy V77b/c-era manifests (written between V77b/c deploy and
//     V77-fix3 deploy, ~17min window) have NO `exporterUid` field at top
//     level + NO `customers[].fileEntry`. The V77-fix3 seed unconditionally
//     included those → hash recompute on legacy manifests yields a
//     DIFFERENT hash than the stored manifestHash → WHOLE_FLEET_MANIFEST_
//     TAMPERED on EVERY legacy-manifest restore.
//   - Fix: gate inclusion. Legacy manifests (no exporterUid OR no
//     fileEntry across all customers) compute the SAME hash they did at
//     write-time. Post-V77-fix3 manifests include both seed contributions.
//   - Trade-off: legacy-shape manifests have weaker tamper-detection
//     (exporterUid + fileEntry omitted from seal). Acceptable because:
//       (a) V77b/c-era manifest pool is tiny (ship window was 17 min;
//           realistic prod count ≤ 1 if any),
//       (b) admin-rotation re-export creates a post-fix3 manifest with
//           the stronger seal.
export function computeWholeFleetManifestHash(manifest) {
  const customers = manifest.customers || [];
  // V77-fix4 retro-compat probe: does this manifest have the post-V77-fix3
  // seed contributions? If ANY customer is missing fileEntry, treat as
  // legacy — exclude fileEntry + exporterUid from seed.
  const hasFileEntryEverywhere = customers.length > 0
    && customers.every(c => typeof c.fileEntry === 'string' && c.fileEntry.length > 0);
  const hasExporterUid = manifest.exporterUid !== undefined && manifest.exporterUid !== null;
  const includePostFix3 = hasFileEntryEverywhere && hasExporterUid;

  const seed = {
    schemaVersion: manifest.schemaVersion,
    type: manifest.type,
    customerCount: manifest.customerCount,
    customers: customers.map(c => {
      const entry = {
        cid: c.cid,
        hn: c.hn,
        fileHash: c.fileHash,
        storageManifestHash: c.storageManifestHash,
        totals: c.totals,
      };
      if (includePostFix3) entry.fileEntry = c.fileEntry;
      return entry;
    }),
    failedCustomers: (manifest.failedCustomers || []).map(f => ({ cid: f.cid, reason: f.reason })),
    totals: manifest.totals,
    exportedAt: manifest.exportedAt,
  };
  if (includePostFix3) seed.exporterUid = String(manifest.exporterUid);
  return crypto.createHash('sha256').update(canonicalJson(seed)).digest('hex');
}

export function validateWholeFleetManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return { valid: false, reason: 'NOT_OBJECT' };
  if (manifest.schemaVersion !== WHOLE_FLEET_SCHEMA_VERSION) return { valid: false, reason: 'schemaVersion mismatch' };
  if (manifest.type !== WHOLE_FLEET_TYPE) return { valid: false, reason: `type must be ${WHOLE_FLEET_TYPE}` };
  if (!Array.isArray(manifest.customers)) return { valid: false, reason: 'customers must be array' };
  if (manifest.customerCount !== manifest.customers.length) return { valid: false, reason: 'customerCount mismatch' };
  if (!manifest.exportedAt) return { valid: false, reason: 'exportedAt required' };
  if (!manifest.totals || typeof manifest.totals !== 'object') return { valid: false, reason: 'totals required' };
  // V77-fix3 (P1-5): every customer entry must have cid + a Storage entry
  // pointing at the canonical backups/customers/ prefix.
  // V77-fix4 (N2 retro-compat — Round 2 adversarial): legacy V77b/c-era
  // manifests used `backupRef` field; V77-fix3 introduced `fileEntry`.
  // Accept EITHER for read-side compat. Restore endpoint reads via
  // resolveCustomerEntryPath() helper below.
  for (let i = 0; i < manifest.customers.length; i++) {
    const c = manifest.customers[i];
    if (!c || typeof c !== 'object') return { valid: false, reason: `customers[${i}] not object` };
    if (!c.cid || typeof c.cid !== 'string') return { valid: false, reason: `customers[${i}].cid missing` };
    const entryPath = c.fileEntry || c.backupRef;
    if (!entryPath || typeof entryPath !== 'string') {
      return { valid: false, reason: `customers[${i}].fileEntry|backupRef missing` };
    }
    if (!entryPath.startsWith('backups/customers/')) {
      return { valid: false, reason: `customers[${i}].fileEntry path-traversal (must start with backups/customers/)` };
    }
  }
  return { valid: true };
}

/**
 * Resolve the canonical Storage path for a customer manifest entry.
 * V77-fix4 (N2): legacy V77b/c-era manifests used `backupRef`; V77-fix3+ use
 * `fileEntry`. Always prefer the post-V77-fix3 field; fall back to legacy.
 *
 * @param {object} entry — one element of manifest.customers[]
 * @returns {string} Storage path or '' if neither field present
 */
export function resolveCustomerEntryPath(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(entry.fileEntry || entry.backupRef || '');
}
