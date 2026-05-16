// src/lib/customerBackupSchema.js
// V74 — Customer backup file schema (extends branchBackupSchema v2).
// File shape includes Firestore data (collections + subcollections +
// chatConversations) PLUS Storage manifest with per-object SHA-256.
//
// meta.userNote is EXCLUDED from bodyHash + storageManifestHash so admin
// can rename labels without invalidating integrity (Q5b=Y label-edit).

import crypto from 'crypto';
import { BACKUP_SCHEMA_VERSION, computeBodyHash } from './branchBackupSchema.js';

/**
 * Compose a customer backup file object.
 *
 * @param {object} args
 * @param {string} args.customerId
 * @param {string} args.customerHN
 * @param {string} args.customerName
 * @param {string} args.exportedBy
 * @param {Object<string,Array>} args.collections - {colName: [doc, ...]}
 * @param {Object<string,Array>} args.subcollections - {subName: [doc, ...]}
 * @param {Array<object>} args.chatConversations
 * @param {Array<object>} args.storageManifest - [{path, size, sha256, contentType}]
 * @param {boolean} [args.isAutoPreFresh=false]
 * @param {string} [args.userNote='']
 * @returns {object} canonical backup file
 */
export function buildCustomerBackupFile({
  customerId,
  customerHN,
  customerName,
  exportedBy,
  collections,
  subcollections,
  chatConversations,
  storageManifest,
  isAutoPreFresh = false,
  userNote = '',
}) {
  const perCollectionCounts = {};
  for (const [k, arr] of Object.entries(collections || {})) {
    perCollectionCounts[k] = Array.isArray(arr) ? arr.length : 0;
  }
  const subcollectionCounts = {};
  for (const [k, arr] of Object.entries(subcollections || {})) {
    subcollectionCounts[k] = Array.isArray(arr) ? arr.length : 0;
  }
  // Body hash spans collections + subcollections + chatConversations.
  // computeBodyHash (from branchBackupSchema) expects each value to be an
  // Array of docs — flatten subcollections into `__sub__<name>` keys so the
  // hash input stays flat (object-of-arrays). chatConversations is already
  // a flat array — bucket under `__chat__` for the same reason.
  const hashedBody = { ...(collections || {}) };
  for (const [subName, docs] of Object.entries(subcollections || {})) {
    hashedBody[`__sub__${subName}`] = Array.isArray(docs) ? docs : [];
  }
  hashedBody.__chat__ = Array.isArray(chatConversations) ? chatConversations : [];
  const manifest = Array.isArray(storageManifest) ? storageManifest : [];
  const meta = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    backupType: 'customer',
    customerId: String(customerId || ''),
    customerHN: String(customerHN || ''),
    customerName: String(customerName || ''),
    exportedBy: String(exportedBy || ''),
    exportedAt: new Date().toISOString(),
    isAutoPreFresh: !!isAutoPreFresh,
    scope: {
      tiers: ['CD', 'C11', 'CG', 'CS', 'CF', 'CH'],
      auditImmutableExcluded: [
        'be_admin_audit', 'be_stock_movements', 'be_line_reminder_log',
        'be_recall_audit_log', 'be_postback_log', 'be_line_reminder_postback_log',
      ],
    },
    userNote: String(userNote || ''),
    perCollectionCounts,
    subcollectionCounts,
    chatConversationCount: Array.isArray(chatConversations) ? chatConversations.length : 0,
    storageObjectCount: manifest.length,
    storageManifest: manifest,
    bodyHash: computeBodyHash(hashedBody),
    storageManifestHash: computeStorageManifestHash(manifest),
  };
  return {
    meta,
    collections: collections || {},
    subcollections: subcollections || {},
    chatConversations: chatConversations || [],
  };
}

/**
 * Validate a customer backup file. Throws on contract violation.
 * Accepts schemaVersion 1 + 2.
 */
export function validateCustomerBackupFile(file) {
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
  if (meta.backupType !== 'customer') {
    throw new Error(`BACKUP_TYPE_MISMATCH: expected 'customer', got '${meta.backupType}'`);
  }
  if (typeof meta.customerId !== 'string' || !meta.customerId.trim()) {
    throw new Error('CUSTOMER_ID_MISSING');
  }
  if (typeof file.collections !== 'object' || file.collections === null) {
    throw new Error('COLLECTIONS_BLOCK_MISSING');
  }
  if (typeof file.subcollections !== 'object' || file.subcollections === null) {
    throw new Error('SUBCOLLECTIONS_BLOCK_MISSING');
  }
  if (meta.bodyHash !== undefined && meta.bodyHash !== null) {
    if (typeof meta.bodyHash !== 'string' || !/^[0-9a-f]{64}$/.test(meta.bodyHash)) {
      throw new Error('INVALID_BODY_HASH_FORMAT');
    }
  }
  if (meta.storageManifestHash !== undefined && meta.storageManifestHash !== null) {
    if (typeof meta.storageManifestHash !== 'string' || !/^[0-9a-f]{64}$/.test(meta.storageManifestHash)) {
      throw new Error('INVALID_STORAGE_MANIFEST_HASH_FORMAT');
    }
  }
  return true;
}

/**
 * SHA-256 hash of canonical storage manifest entries.
 * Sorted by path; each entry serialized as `${path}|${size}|${sha256}`;
 * joined with '\n'. Empty manifest produces consistent fixed hash.
 *
 * @param {Array<{path: string, size: number, sha256: string}>} manifest
 * @returns {string} 64-char hex SHA-256
 */
export function computeStorageManifestHash(manifest) {
  const sorted = [...(manifest || [])].sort((a, b) => {
    const ap = String(a?.path ?? '');
    const bp = String(b?.path ?? '');
    return ap < bp ? -1 : ap > bp ? 1 : 0;
  });
  const lines = sorted.map(entry =>
    `${String(entry?.path ?? '')}|${Number(entry?.size ?? 0)}|${String(entry?.sha256 ?? '')}`
  );
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}
