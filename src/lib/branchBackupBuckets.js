// ─── 7-bucket schema for selective make-fresh + backup ─────────────────────
// Pure ESM, no Firebase deps. Single source of truth — UI imports from here,
// endpoints import from here. Re-uses TIER_MAP[T1] from branchBackupCore for
// T1 protection (defense-in-depth at API boundary).
//
// Brainstorming decisions (Q1-Q6 locked 2026-05-14):
//   Q1=D Hybrid bucket UI + Advanced collection toggle + T1 server-protected
//   Q3=A 7 buckets
//   Q4=B Default 6 checked + customerActivity unchecked (opt-in only)
//
// 2026-05-15 V66 EXTENSION — per-collection filter-field overrides via
// BUCKET_FILTER_FIELDS side-table. Most collections store branchId (the
// default); a small set (be_stock_transfers + be_stock_withdrawals) instead
// store sourceLocationId + destinationLocationId. Endpoints/CLIs MUST consult
// getFilterSpecForCollection(name) instead of hard-coding `.where('branchId')`.
// V66 regression test `tests/branch-backup-buckets-v66-filter-fields.test.js`
// locks every override against production write-side code (backendClient.js).

import { TIER_MAP, BACKUP_TIER_T1 } from './branchBackupCore.js';

export const BUCKETS = Object.freeze({
  appointments: Object.freeze({
    label: '📅 นัดหมาย',
    description: 'ลบนัดหมาย + per-customer appointments subcollection',
    collections: Object.freeze(['be_appointments']),
    customerSubcollections: Object.freeze(['appointments']),
    defaultChecked: true,
  }),
  treatments: Object.freeze({
    label: '💊 การรักษา',
    description: 'ลบการรักษา + per-customer treatments subcollection',
    collections: Object.freeze(['be_treatments']),
    customerSubcollections: Object.freeze(['treatments']),
    defaultChecked: true,
  }),
  sales: Object.freeze({
    label: '💰 การขาย',
    description: 'ลบการขาย / vendor sales / online sales / quotation / sale insurance claim + per-customer sales subcoll',
    collections: Object.freeze([
      'be_sales', 'be_vendor_sales', 'be_online_sales',
      'be_quotations', 'be_sale_insurance_claims',
    ]),
    customerSubcollections: Object.freeze(['sales']),
    defaultChecked: true,
  }),
  stock: Object.freeze({
    label: '📦 สต็อก (ทั้งหมด)',
    description: 'ลบสต็อกทั้ง state + ledger (T3 6 collections)',
    collections: Object.freeze([
      'be_stock_batches', 'be_stock_movements', 'be_stock_orders',
      'be_stock_transfers', 'be_stock_withdrawals', 'be_stock_adjustments',
    ]),
    customerSubcollections: Object.freeze([]),
    defaultChecked: true,
  }),
  finance: Object.freeze({
    label: '💵 การเงิน + มัดจำ',
    description: 'ลบรายจ่าย + มัดจำ + per-customer deposits subcollection',
    collections: Object.freeze(['be_expenses', 'be_deposits']),
    customerSubcollections: Object.freeze(['deposits']),
    defaultChecked: true,
  }),
  lineLink: Object.freeze({
    label: '🎫 คำขอเชื่อม LINE',
    description: 'ลบคำขอเชื่อม LINE OA → customer',
    collections: Object.freeze(['be_link_requests']),
    customerSubcollections: Object.freeze([]),
    defaultChecked: true,
  }),
  customerActivity: Object.freeze({
    label: '⭐ กิจกรรมลูกค้า (wallet/membership/points/courseChanges)',
    description: '⚠️ ลบ wallet balance + membership + loyalty points + course-exchange log ของลูกค้า — affects customer-visible state',
    collections: Object.freeze([]),
    customerSubcollections: Object.freeze(['wallets', 'memberships', 'points', 'courseChanges']),
    defaultChecked: false, // Q4-B opt-in only
  }),
});

/** Returns true if `name` is a T1 collection (master/setup). */
export function isT1Collection(name) {
  return TIER_MAP[BACKUP_TIER_T1].includes(String(name || ''));
}

/** Throws T1_NOT_WIPEABLE if any element of `collections` is in T1. */
export function assertNotT1(collections) {
  for (const c of collections) {
    if (isT1Collection(c)) throw new Error(`T1_NOT_WIPEABLE: ${c}`);
  }
}

/**
 * Resolve a list of bucket IDs into a flat list of {collections, subcollections}.
 * Throws EMPTY_BUCKET_SET if no buckets given, UNKNOWN_BUCKET if any unknown.
 */
export function resolveBucketScope(bucketIds) {
  if (!Array.isArray(bucketIds) || bucketIds.length === 0) {
    throw new Error('EMPTY_BUCKET_SET');
  }
  const collections = new Set();
  const subcollections = new Set();
  for (const id of bucketIds) {
    const b = BUCKETS[id];
    if (!b) throw new Error(`UNKNOWN_BUCKET: ${id}`);
    for (const c of b.collections) collections.add(c);
    for (const s of b.customerSubcollections) subcollections.add(s);
  }
  return { collections: [...collections], subcollections: [...subcollections] };
}

/** Returns {appointments:true, ..., customerActivity:false} for UI default state. */
export function bucketDefaultsForUI() {
  const out = {};
  for (const [id, b] of Object.entries(BUCKETS)) {
    out[id] = !!b.defaultChecked;
  }
  return out;
}

// ─── V66 fix 2026-05-15 — per-collection filter-field overrides ────────────
//
// Most branch-scoped collections write `branchId` at write time (verified via
// Rule R env-pull diag + grep on backendClient.js write-side blocks). This
// table lists the exceptions — collections whose canonical filter fields
// differ from `branchId`. Endpoints/CLIs/scripts MUST consult this table
// instead of hard-coding `.where('branchId')` in wipe/backup loops.
//
// Verified canonical field names (production write-side, 2026-05-15):
//   - be_stock_transfers    → sourceLocationId + destinationLocationId
//                             (backendClient.js:7683-7684)
//   - be_stock_withdrawals  → sourceLocationId + destinationLocationId
//                             (backendClient.js:8059-8060)
//
// Pre-V66 BUG: branch-make-fresh.js + branch-backup-export.js + 2 CLI scripts
// hardcoded `.where('branchId', '==', X)` for ALL stock collections including
// transfers + withdrawals. Result: 0 matches on those 2 collections → 1,064
// transfers + 9 withdrawals survived make-fresh on นครราชสีมา branch (Rule R
// diag 2026-05-15 confirmed). Same class-of-bug as central CENTRAL_BUCKETS
// V66 fix (commit 25cdb41).
//
// To add a new override: verify field name appears in backendClient.js setDoc
// block, add entry here, extend `tests/branch-backup-buckets-v66-filter-fields.test.js`.
export const BUCKET_FILTER_FIELDS = Object.freeze({
  be_stock_transfers: Object.freeze({
    filterField: 'sourceLocationId',
    orFilterField: 'destinationLocationId',
  }),
  be_stock_withdrawals: Object.freeze({
    filterField: 'sourceLocationId',
    orFilterField: 'destinationLocationId',
  }),
});

/**
 * Returns filter spec for a single collection name. Default is `{filterField:
 * 'branchId'}` (most collections). Override comes from BUCKET_FILTER_FIELDS.
 *
 * @param {string} collectionName
 * @returns {{filterField: string, orFilterField?: string}}
 */
export function getFilterSpecForCollection(collectionName) {
  const override = BUCKET_FILTER_FIELDS[collectionName];
  if (override) return override;
  return { filterField: 'branchId' };
}

/**
 * Resolve bucketIds into a flat array of `{name, filterField, orFilterField?}`
 * specs. Wraps resolveBucketScope() + applies getFilterSpecForCollection() to
 * each collection name. Caller iterates and runs 1 query (or 2 if orFilterField
 * present, with Map<docId, doc> dedup-merge).
 *
 * @param {string[]} bucketIds
 * @returns {{collections: Array<{name, filterField, orFilterField?}>, subcollections: string[]}}
 */
export function resolveBucketScopeWithFilterSpecs(bucketIds) {
  const { collections, subcollections } = resolveBucketScope(bucketIds);
  return {
    collections: collections.map(name => ({
      name,
      ...getFilterSpecForCollection(name),
    })),
    subcollections,
  };
}

/**
 * Helper for endpoints/CLIs to run the actual Firestore queries. Returns
 * a Map<docId, docSnap> with all docs matching either filterField=value OR
 * orFilterField=value (if orFilterField present). Map dedup ensures docs
 * matching BOTH (e.g. internal transfer src=X, dst=X — unusual but possible)
 * count once.
 *
 * Caller provides `getQueryFn(field, value)` that returns a Promise<QuerySnapshot>.
 *
 * @param {{filterField: string, orFilterField?: string}} spec
 * @param {string} value
 * @param {(field: string, value: string) => Promise<{docs: Array<{ref:{}, id: string, data: Function}>}>} getQueryFn
 * @returns {Promise<Map<string, any>>}
 */
export async function queryWithFilterSpec(spec, value, getQueryFn) {
  const docs = new Map();
  const snap1 = await getQueryFn(spec.filterField, value);
  for (const d of snap1.docs) docs.set(d.id, d);
  if (spec.orFilterField) {
    const snap2 = await getQueryFn(spec.orFilterField, value);
    for (const d of snap2.docs) {
      if (!docs.has(d.id)) docs.set(d.id, d);
    }
  }
  return docs;
}
