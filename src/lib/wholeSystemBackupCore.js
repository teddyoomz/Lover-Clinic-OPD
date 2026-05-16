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
