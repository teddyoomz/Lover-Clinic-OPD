// src/lib/wholeFleetBackupCore.js
// V75 Item 2 — Whole-fleet customer backup manifest builder + hasher + validator.
// Parallels V74's customerBackupSchema.js but for the multi-customer case.
// AV56 invariant: every whole-fleet backup MUST emit manifest.json with
// manifestHash covering all customer file hashes + Storage manifest hashes;
// userNote EXCLUDED from hash (Q5b=Y precedent from V74).

import crypto from 'node:crypto';

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
// storage manifest hash. Used as the tampering-detection seal.
export function computeWholeFleetManifestHash(manifest) {
  const seed = {
    schemaVersion: manifest.schemaVersion,
    type: manifest.type,
    customerCount: manifest.customerCount,
    customers: (manifest.customers || []).map(c => ({
      cid: c.cid,
      hn: c.hn,
      fileHash: c.fileHash,
      storageManifestHash: c.storageManifestHash,
      totals: c.totals,
    })),
    failedCustomers: (manifest.failedCustomers || []).map(f => ({ cid: f.cid, reason: f.reason })),
    totals: manifest.totals,
    exportedAt: manifest.exportedAt,
  };
  return crypto.createHash('sha256').update(JSON.stringify(seed)).digest('hex');
}

export function validateWholeFleetManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return { valid: false, reason: 'NOT_OBJECT' };
  if (manifest.schemaVersion !== WHOLE_FLEET_SCHEMA_VERSION) return { valid: false, reason: 'schemaVersion mismatch' };
  if (manifest.type !== WHOLE_FLEET_TYPE) return { valid: false, reason: `type must be ${WHOLE_FLEET_TYPE}` };
  if (!Array.isArray(manifest.customers)) return { valid: false, reason: 'customers must be array' };
  if (manifest.customerCount !== manifest.customers.length) return { valid: false, reason: 'customerCount mismatch' };
  if (!manifest.exportedAt) return { valid: false, reason: 'exportedAt required' };
  if (!manifest.totals || typeof manifest.totals !== 'object') return { valid: false, reason: 'totals required' };
  return { valid: true };
}
