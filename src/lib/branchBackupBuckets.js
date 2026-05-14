// ─── 7-bucket schema for selective make-fresh + backup ─────────────────────
// Pure ESM, no Firebase deps. Single source of truth — UI imports from here,
// endpoints import from here. Re-uses TIER_MAP[T1] from branchBackupCore for
// T1 protection (defense-in-depth at API boundary).
//
// Brainstorming decisions (Q1-Q6 locked 2026-05-14):
//   Q1=D Hybrid bucket UI + Advanced collection toggle + T1 server-protected
//   Q3=A 7 buckets
//   Q4=B Default 6 checked + customerActivity unchecked (opt-in only)

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
