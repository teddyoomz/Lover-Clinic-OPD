// src/lib/wholeSystemBackupCore.js
// V81 (2026-05-16 NIGHT+4) — Whole-System Backup & Clone pure helpers.
//
// Schema version 2 (V40 per-branch=1; V75 whole-fleet customer=1; V81 whole-system=2).
// Pure JS (no Firebase deps) so emulator tests + property-based tests can
// import without spinning up admin SDK.

export const WHOLE_SYSTEM_SCHEMA_VERSION = 2;

export const UNIVERSAL_COLLECTIONS = Object.freeze([
  'be_customers',
  'be_staff',
  'be_doctors',
  'be_branches',
  'be_admin_audit',
  'chat_conversations',
  'chat_history',
  'be_line_configs',
  'be_fb_configs',
  'be_line_reminder_log',
  'be_line_reminder_postback_log',
  'be_recalls',
  'be_link_requests',
  'be_customer_link_tokens',
  'be_document_templates',
  'be_audiences',
  'be_permission_groups',
  'be_central_stock_orders',
  'be_central_stock_movements',
  'be_vendors',
  'system_config',
  'clinic_settings',
  'opd_sessions',
]);

export const BRANCH_SCOPED_COLLECTIONS = Object.freeze([
  'be_treatments',
  'be_sales',
  'be_appointments',
  'be_quotations',
  'be_vendor_sales',
  'be_online_sales',
  'be_sale_insurance_claims',
  'be_stock_batches',
  'be_stock_orders',
  'be_stock_movements',
  'be_stock_transfers',
  'be_stock_withdrawals',
  'be_stock_adjustments',
  'be_products',
  'be_courses',
  'be_product_groups',
  'be_product_units',
  'be_medical_instruments',
  'be_holidays',
  'be_df_groups',
  'be_df_staff_rates',
  'be_bank_accounts',
  'be_expense_categories',
  'be_expenses',
  'be_staff_schedules',
  'be_exam_rooms',
  'be_promotions',
  'be_coupons',
  'be_vouchers',
  'be_staff_chat_messages',
]);

export const CUSTOMER_SUBCOLLECTIONS = Object.freeze([
  'wallets',
  'memberships',
  'points',
  'treatments',
  'sales',
  'appointments',
  'deposits',
  'courseChanges',
]);

export const STORAGE_INCLUDE_PREFIXES = Object.freeze([
  'customers/',
  'staff-chat-attachments/',
]);

// CRITICAL recursion gate — `backups/` MUST NOT be backed up itself.
export const STORAGE_EXCLUDE_PREFIXES = Object.freeze([
  'backups/',
  'probe/',
  'TEST-',
  'E2E-',
]);

export const RETENTION_DAYS = Object.freeze({
  auto: 5,
  preRestore: 7,
  archive: 1,
});

export const NAME_PATTERN = /^(?:auto|manual|pre-restore)-\d{8}-\d{4}$/;

/**
 * resolveStorageScope — should a given Storage object path be included in backup?
 * EXCLUDE takes precedence over INCLUDE (defensive — `backups/` recursion gate).
 * Default for unknown paths = false (forward-compat safety — new features add to INCLUDE list).
 */
export function resolveStorageScope(filePath) {
  if (typeof filePath !== 'string' || !filePath) return false;
  for (const ex of STORAGE_EXCLUDE_PREFIXES) {
    if (filePath.startsWith(ex)) return false;
  }
  for (const inc of STORAGE_INCLUDE_PREFIXES) {
    if (filePath.startsWith(inc)) return true;
  }
  return false;
}

/**
 * resolveCollectionScope — returns scope object for backup enumeration.
 */
export function resolveCollectionScope() {
  return {
    universal: UNIVERSAL_COLLECTIONS.slice(),
    branchScoped: BRANCH_SCOPED_COLLECTIONS.slice(),
  };
}

// ─── Task 2 — manifest builder + AV62 hash sealing + validator ────────────

import crypto from 'node:crypto';

/**
 * computeStorageManifestHash — SHA-256 of sorted storageObjects[*].fileHash.
 * Per spec §4.3: storageManifestHash is its own seal, then included in the
 * outer manifestHash. Two-tier sealing makes Storage-only tamper detectable
 * independent of collection-side tampering.
 */
export function computeStorageManifestHash(storageObjects) {
  const sorted = [...(storageObjects || [])]
    .map(o => `${o.path}::${o.fileHash || ''}`)
    .sort();
  const h = crypto.createHash('sha256');
  for (const s of sorted) h.update(s);
  return `sha256:${h.digest('hex')}`;
}

/**
 * buildWholeSystemManifest — construct manifest object (without manifestHash; sealed separately).
 * manifestHash field starts null; caller assigns via computeWholeSystemManifestHash(manifest).
 */
export function buildWholeSystemManifest({
  name,
  createdAt,
  createdBy,
  collections = [],
  storageObjects = [],
  authUsers = { path: 'auth/users.json', userCount: 0, fileHash: '' },
  stats = {},
}) {
  return {
    schemaVersion: WHOLE_SYSTEM_SCHEMA_VERSION,
    backupType: 'whole-system',
    name,
    createdAt,
    createdBy,
    manifestHash: null,
    scope: {
      universalCollections: UNIVERSAL_COLLECTIONS.slice(),
      branchScopedCollections: BRANCH_SCOPED_COLLECTIONS.slice(),
    },
    collections,
    storageObjects,
    storageObjectsTotalCount: storageObjects.length,
    storageObjectsTotalBytes: storageObjects.reduce((s, o) => s + (o.fileSizeBytes || 0), 0),
    storageManifestHash: computeStorageManifestHash(storageObjects),
    authUsers,
    stats: {
      totalDocCount: stats.totalDocCount ?? 0,
      totalCollectionFileBytes: collections.reduce((s, c) => s + (c.fileSizeBytes || 0), 0),
      totalStorageBytes: stats.totalStorageBytes ?? 0,
      totalAuthUsers: stats.totalAuthUsers ?? 0,
      elapsedSec: stats.elapsedSec,
    },
    _v81Marker: 'whole-system-backup-v1',
  };
}

/**
 * computeWholeSystemManifestHash — canonical SHA-256 of manifest's data-bearing fields.
 *
 * INCLUDED (hash-sealed):
 *   - All collections[*].fileHash sorted by name
 *   - storageManifestHash (which already sealed storageObjects[*].fileHash)
 *   - authUsers.fileHash
 *   - name, createdAt, schemaVersion, totalDocCount, totalStorageBytes, totalAuthUsers
 *
 * EXCLUDED (mutable for admin convenience):
 *   - createdBy, manifestHash (self), elapsedSec, _v81Marker, scope (constant)
 */
export function computeWholeSystemManifestHash(manifest) {
  const collectionHashes = (manifest.collections || [])
    .map(c => `${c.name}::${c.fileHash || ''}`)
    .sort();
  const payload = {
    name: manifest.name,
    createdAt: manifest.createdAt,
    schemaVersion: manifest.schemaVersion,
    collectionHashes,
    storageManifestHash: manifest.storageManifestHash || '',
    authUsersHash: manifest.authUsers?.fileHash || '',
    totalDocCount: manifest.stats?.totalDocCount ?? 0,
    totalStorageBytes: manifest.stats?.totalStorageBytes ?? 0,
    totalAuthUsers: manifest.stats?.totalAuthUsers ?? 0,
  };
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}

/**
 * validateWholeSystemManifest — AV62 contract enforcement.
 * Returns { valid: true } OR { valid: false, reason }.
 *
 * Checks (in order):
 *   1. manifest exists + is object
 *   2. schemaVersion === WHOLE_SYSTEM_SCHEMA_VERSION
 *   3. backupType === 'whole-system'
 *   4. name matches NAME_PATTERN
 *   5. manifestHash present + is string
 *   6. recomputed hash === stored hash (tamper detection)
 */
export function validateWholeSystemManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, reason: 'manifest not an object' };
  }
  if (manifest.schemaVersion !== WHOLE_SYSTEM_SCHEMA_VERSION) {
    return { valid: false, reason: `schemaVersion mismatch: got ${manifest.schemaVersion}, expected ${WHOLE_SYSTEM_SCHEMA_VERSION}` };
  }
  if (manifest.backupType !== 'whole-system') {
    return { valid: false, reason: `backupType mismatch: got ${manifest.backupType}` };
  }
  if (!manifest.name || !NAME_PATTERN.test(manifest.name)) {
    return { valid: false, reason: `name pattern invalid: got ${manifest.name}` };
  }
  if (!manifest.manifestHash || typeof manifest.manifestHash !== 'string') {
    return { valid: false, reason: 'manifestHash missing or not a string' };
  }
  const recomputed = computeWholeSystemManifestHash(manifest);
  if (recomputed !== manifest.manifestHash) {
    return { valid: false, reason: `manifestHash mismatch — tampered (expected ${recomputed}, got ${manifest.manifestHash})` };
  }
  return { valid: true };
}

// ─── Task 3 — cleanup retention (AV64) + name parse/format helpers ──────────

/**
 * formatBackupName — produces '{type}-YYYYMMDD-HHmm' style name in Bangkok TZ.
 * Bangkok TZ uses Intl.DateTimeFormat for stable cross-Node/cross-browser output.
 * Thailand has no DST → fixed UTC+7 offset.
 */
export function formatBackupName(type, date) {
  if (!['auto', 'manual', 'pre-restore'].includes(type)) {
    throw new Error(`formatBackupName: invalid type ${type}`);
  }
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  const yyyymmdd = `${get('year')}${get('month')}${get('day')}`;
  const rawHour = get('hour');
  const hh = rawHour === '24' ? '00' : rawHour;
  const hhmm = `${hh}${get('minute')}`;
  return `${type}-${yyyymmdd}-${hhmm}`;
}

/**
 * parseBackupName — extracts {type, ts}; returns {valid: false, reason} on pattern mismatch.
 * ts is the UTC timestamp reconstructed from Bangkok-formatted name (-7h offset).
 */
export function parseBackupName(name) {
  const m = name?.match(/^(auto|manual|pre-restore)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return { valid: false, reason: 'name pattern mismatch' };
  const [, type, yyyy, mm, dd, HH, MM] = m;
  const ts = Date.UTC(+yyyy, +mm - 1, +dd, +HH - 7, +MM);
  return { valid: true, type, ts };
}

/**
 * shouldCleanupBackup — AV64 retention contract.
 * Returns { action: 'keep'|'delete', reason }.
 *
 * Rules:
 *   - auto-*       > 5 days → delete (RETENTION_DAYS.auto)
 *   - pre-restore-* > 7 days → delete (RETENTION_DAYS.preRestore)
 *   - manual-*     → keep (∞ — admin's responsibility)
 *   - unknown pattern → keep + log reason (forward-compat safety)
 */
export function shouldCleanupBackup(name, ageMs, nowMs = Date.now()) {
  const parsed = parseBackupName(name);
  if (!parsed.valid) {
    return { action: 'keep', reason: 'unknown pattern — forward-compat preserve' };
  }
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (parsed.type === 'auto') {
    return ageDays >= RETENTION_DAYS.auto
      ? { action: 'delete', reason: `auto > ${RETENTION_DAYS.auto}d retention` }
      : { action: 'keep', reason: 'within-retention' };
  }
  if (parsed.type === 'pre-restore') {
    return ageDays >= RETENTION_DAYS.preRestore
      ? { action: 'delete', reason: `pre-restore > ${RETENTION_DAYS.preRestore}d retention` }
      : { action: 'keep', reason: 'within-retention' };
  }
  return { action: 'keep', reason: 'manual — admin responsibility' };
}

// ─── V81-fix1 (2026-05-17 EOD+1) — Firestore type encoder/decoder ────────
// Firebase admin SDK Timestamp's JSON.stringify produces {_seconds, _nanoseconds}
// which Firestore.batch.set treats as a plain Map field, NOT a Timestamp.
// This caused V81 restore to silently degrade every Timestamp to a Map.
// Diagnostic confirmed bug on real prod 2026-05-17.
//
// Fix: serialize Firestore-native types with a sentinel marker that the
// restore side can detect + re-hydrate via the SDK constructor.
//
// Supported types:
//   Timestamp  — duck-typed by {_seconds, _nanoseconds} (admin SDK internal)
//   GeoPoint   — duck-typed by {_latitude, _longitude} (admin SDK internal)
//   Buffer/Bytes — duck-typed by Buffer.isBuffer / Uint8Array
//
// Marker format: `{ __type: '<type>', ...payload }` — single-key namespace
// __type is reserved + unambiguous in this codebase (grep confirms unused).

/**
 * isFirestoreTimestamp — duck-type detector for Firebase admin SDK Timestamp.
 * Strict 2-key shape: `_seconds` (number) + `_nanoseconds` (number).
 * Avoids false positives on user data that might have these field names.
 */
function isFirestoreTimestamp(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  if (typeof v._seconds !== 'number' || typeof v._nanoseconds !== 'number') return false;
  const keys = Object.keys(v);
  return keys.length === 2 && keys.includes('_seconds') && keys.includes('_nanoseconds');
}

/**
 * isFirestoreGeoPoint — duck-type detector for admin SDK GeoPoint.
 */
function isFirestoreGeoPoint(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  if (typeof v._latitude !== 'number' || typeof v._longitude !== 'number') return false;
  const keys = Object.keys(v);
  return keys.length === 2 && keys.includes('_latitude') && keys.includes('_longitude');
}

/**
 * encodeFirestoreData — recursively walks a JS value + replaces Firestore-native
 * types with `{__type, ...}` markers so JSON.stringify produces a self-describing
 * file the restore side can re-hydrate.
 *
 * Preserves V38 spread-order invariant: input key insertion order is maintained
 * in output (the encoder doesn't reorder); callers that spread `{...data, id: d.id}`
 * still get docId-WINS semantics through the encoder.
 *
 * @param {any} value
 * @returns {any} encoded value (plain JS, JSON-safe)
 */
export function encodeFirestoreData(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (isFirestoreTimestamp(value)) {
    return { __type: 'timestamp', seconds: value._seconds, nanoseconds: value._nanoseconds };
  }
  if (isFirestoreGeoPoint(value)) {
    return { __type: 'geopoint', latitude: value._latitude, longitude: value._longitude };
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return { __type: 'bytes', base64: value.toString('base64') };
  }
  if (value instanceof Uint8Array) {
    return { __type: 'bytes', base64: Buffer.from(value).toString('base64') };
  }
  if (Array.isArray(value)) {
    return value.map(encodeFirestoreData);
  }
  // Plain object: recurse, preserving key insertion order
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = encodeFirestoreData(v);
  }
  return out;
}

/**
 * decodeFirestoreData — recursively walks parsed JSON + re-hydrates Firestore
 * types from `{__type, ...}` markers using the provided SDK constructors.
 *
 * `opts.Timestamp` / `opts.GeoPoint` should be the Firebase admin SDK classes.
 * If a constructor is missing, the marker is converted to a plain object that
 * preserves the data (forward-compat fallback — not ideal but non-destructive).
 *
 * @param {any} value
 * @param {{Timestamp?: Function, GeoPoint?: Function}} opts
 */
export function decodeFirestoreData(value, opts = {}) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(v => decodeFirestoreData(v, opts));
  }
  // Detect sentinel marker
  if (value.__type === 'timestamp' && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
    if (opts.Timestamp) return new opts.Timestamp(value.seconds, value.nanoseconds);
    return { _seconds: value.seconds, _nanoseconds: value.nanoseconds }; // fallback
  }
  if (value.__type === 'geopoint' && typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    if (opts.GeoPoint) return new opts.GeoPoint(value.latitude, value.longitude);
    return { _latitude: value.latitude, _longitude: value.longitude }; // fallback
  }
  if (value.__type === 'bytes' && typeof value.base64 === 'string') {
    return Buffer.from(value.base64, 'base64');
  }
  // Plain object: recurse
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = decodeFirestoreData(v, opts);
  }
  return out;
}

// ─── Task 4 — Auth user sanitization + diff helpers ──────────────────────

/**
 * Fields stripped on Auth user export (security — never serialized to backup).
 * passwordHash + passwordSalt: Firebase 1-way hash; even exporting them is
 * a confused-deputy risk. refreshTokens + tokensValidAfterTime: session
 * tokens — exporting effectively grants attacker session access.
 */
const AUTH_EXCLUDE_FIELDS = Object.freeze([
  'passwordHash',
  'passwordSalt',
  'refreshTokens',
  'tokensValidAfterTime',
  'multiFactor',
]);

/**
 * sanitizeAuthUser — strip secrets; preserve identity + claims + providers.
 * Returns null for non-object input.
 *
 * KEEP: uid, email, displayName, emailVerified, disabled, customClaims,
 *       providerData, photoURL, phoneNumber, metadata (creationTime, lastSignInTime)
 * STRIP: passwordHash, passwordSalt, refreshTokens, tokensValidAfterTime, multiFactor
 */
export function sanitizeAuthUser(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const safe = {};
  for (const [k, v] of Object.entries(raw)) {
    if (AUTH_EXCLUDE_FIELDS.includes(k)) continue;
    safe[k] = v;
  }
  if (!safe.customClaims) safe.customClaims = {};
  if (!safe.providerData) safe.providerData = [];
  return safe;
}

/**
 * diffStates — compares two states { collection: [{id, ...}] } shape.
 * Used for round-trip equality verification (P1 invariant).
 * Returns { added, removed, modified } each as [{collection, id}].
 */
export function diffStates(stateA, stateB) {
  const added = [];
  const removed = [];
  const modified = [];
  const allCols = new Set([...Object.keys(stateA || {}), ...Object.keys(stateB || {})]);
  for (const col of allCols) {
    const aDocs = new Map((stateA?.[col] || []).map(d => [d.id, d]));
    const bDocs = new Map((stateB?.[col] || []).map(d => [d.id, d]));
    for (const [id, bDoc] of bDocs) {
      if (!aDocs.has(id)) added.push({ collection: col, id });
      else if (JSON.stringify(aDocs.get(id)) !== JSON.stringify(bDoc)) modified.push({ collection: col, id });
    }
    for (const [id] of aDocs) {
      if (!bDocs.has(id)) removed.push({ collection: col, id });
    }
  }
  return { added, removed, modified };
}
