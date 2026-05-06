// ─── Branch backup core helpers — Phase: branch backup/restore/make-fresh ──
// Pure ESM; no Firestore deps. Tier matrix matches the BSA classification
// in COLLECTION_MATRIX (tests/branch-collection-coverage.test.js) plus the
// 8 customer-attached subcollections classified as T4 here.
//
// Used by: api/admin/branch-backup-export.js, branch-restore.js,
// branch-make-fresh.js, scripts/branch-{backup-export,restore,make-fresh}.mjs.

export const BACKUP_TIER_T1 = 'T1';
export const BACKUP_TIER_T2 = 'T2';
export const BACKUP_TIER_T3 = 'T3';
export const BACKUP_TIER_T4 = 'T4';

/** T1 — Master/setup collections (low volume, branch-scoped). */
const T1_COLLECTIONS = Object.freeze([
  'be_products',
  'be_courses',
  'be_product_groups',
  'be_product_units',         // canonical (firestore.rules + backendClient)
  'be_product_unit_groups',   // V39 cross-branch-import adapter writes here too
  'be_exam_rooms',            // Phase 18.0 — branch-spread per COLLECTION_MATRIX
  'be_medical_instruments',
  'be_holidays',
  'be_df_groups',
  'be_df_staff_rates',
  'be_promotions',
  'be_coupons',
  'be_vouchers',
  'be_bank_accounts',
  'be_expense_categories',
  'be_staff_schedules',
]);

// be_deposits + be_link_requests are scope:'global' in COLLECTION_MATRIX
// but stamp branchId at capture, so per-branch backup is meaningful.
/** T2 — Transactions (high volume). */
const T2_COLLECTIONS = Object.freeze([
  'be_treatments',
  'be_sales',
  'be_appointments',
  'be_quotations',
  'be_vendor_sales',
  'be_online_sales',
  'be_sale_insurance_claims',
  'be_deposits',
  'be_link_requests',
  'be_expenses',
]);

/** T3 — Stock state + ledger. be_stock_movements is V34-immutable. */
const T3_COLLECTIONS = Object.freeze([
  'be_stock_batches',
  'be_stock_movements',
  'be_stock_orders',
  'be_stock_transfers',
  'be_stock_withdrawals',
  'be_stock_adjustments',
]);

/** T4 — Customer subcollections (per customer, filtered by branchId). */
export const T4_SUBCOLLECTIONS = Object.freeze([
  'treatments', 'sales', 'appointments', 'deposits',
  'wallets', 'memberships', 'points', 'courseChanges',
]);

const T4_VIRTUAL = 'be_customers/__per_customer__';
const T4_COLLECTIONS = Object.freeze([T4_VIRTUAL]);

export const TIER_MAP = Object.freeze({
  [BACKUP_TIER_T1]: T1_COLLECTIONS,
  [BACKUP_TIER_T2]: T2_COLLECTIONS,
  [BACKUP_TIER_T3]: T3_COLLECTIONS,
  [BACKUP_TIER_T4]: T4_COLLECTIONS,
});

const UNIVERSAL = new Set([
  'be_customers', 'be_staff', 'be_doctors', 'be_branches',
  'be_permission_groups', 'be_wallet_types', 'be_membership_types',
  'be_medicine_labels', 'be_document_templates', 'be_audiences',
  'be_central_stock_orders', 'be_central_stock_movements',
  'be_central_stock_warehouses', 'be_vendors',
  'system_config', 'clinic_settings', 'chat_conversations',
  'be_admin_audit',
]);

export function isUniversalCollection(name) {
  return UNIVERSAL.has(String(name || ''));
}

/**
 * Resolve a backup scope into a flat collection list.
 * - `collections` override `tiers` when provided (Advanced UI mode)
 * - Empty input yields empty output (DOES NOT default to all)
 * - Throws if any explicit collection is universal (cannot be backed up)
 */
export function resolveBackupScope({ tiers = [], collections = [] } = {}) {
  if (Array.isArray(collections) && collections.length > 0) {
    for (const c of collections) {
      if (isUniversalCollection(c)) {
        throw new Error(`UNIVERSAL_COLLECTION_NOT_BACKUPABLE: ${c}`);
      }
    }
    return [...collections];
  }
  const out = [];
  for (const t of tiers) {
    const list = TIER_MAP[t];
    if (!list) continue;
    for (const c of list) {
      if (!out.includes(c)) out.push(c);
    }
  }
  return out;
}

/**
 * Build a (sourceId → newId) lookup table for FK remap during clone mode.
 * Caller pre-mints newIds (positionally aligned with sources).
 */
export function buildFkRemapTable(sources, newIds) {
  const map = new Map();
  for (let i = 0; i < sources.length; i++) {
    const sid = String(sources[i]?.id ?? sources[i]?.docId ?? '').trim();
    const nid = String(newIds[i] ?? '').trim();
    if (sid && nid) map.set(sid, nid);
  }
  return map;
}

/**
 * Apply FK remap to a document. `fkSpec` maps doc-paths to target collection
 * names. `tables` provides per-collection (oldId → newId) maps.
 *
 * Supported path patterns:
 *   - 'productId' → flat field
 *   - 'items[].productId' → array-of-objects field
 *
 * Unmapped IDs left unchanged + reported via `audit.unmapped` (caller mutates).
 */
export function applyFkRemap(doc, fkSpec, tables, audit = null) {
  const out = JSON.parse(JSON.stringify(doc));
  for (const [path, collection] of Object.entries(fkSpec)) {
    const map = tables[collection];
    if (!map) continue;
    if (path.includes('[].')) {
      const [arrKey, leafKey] = path.split('[].');
      if (Array.isArray(out[arrKey])) {
        for (const item of out[arrKey]) {
          const oldId = String(item?.[leafKey] ?? '').trim();
          if (!oldId) continue;
          if (map.has(oldId)) {
            item[leafKey] = map.get(oldId);
          } else if (audit) {
            audit.unmapped.push({ field: path, oldId, collection });
          }
        }
      }
    } else {
      const oldId = String(out?.[path] ?? '').trim();
      if (!oldId) continue;
      if (map.has(oldId)) {
        out[path] = map.get(oldId);
      } else if (audit) {
        audit.unmapped.push({ field: path, oldId, collection });
      }
    }
  }
  return out;
}

/**
 * FK spec per T1 collection. Mirrors cross-branch-import adapter fkRefs but
 * keyed by doc-path so applyFkRemap can rewrite generically.
 */
export const T1_FK_SPEC = Object.freeze({
  be_products: { /* unitId, categoryId — optional refs */
    unitId: 'be_product_unit_groups',
    categoryId: 'be_product_groups',
  },
  be_courses: { /* items[].productId → be_products */
    'items[].productId': 'be_products',
  },
  be_product_groups: { /* products[].productId → be_products */
    'products[].productId': 'be_products',
  },
});
