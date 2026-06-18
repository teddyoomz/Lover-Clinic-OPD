// src/lib/customerBackupCore.js
// V74 — Customer backup core helpers (pure ESM, no Firestore deps).
// Single source of truth for customer-data scope across export / wipe /
// restore endpoints + CLI mirrors. Mirrors Phase 24.0 cascade pattern but
// extends with CG (5 gap collections), CS (subcollections), AI (immutable).

/**
 * 17 top-level collections that hold customer-referenced docs (filterable by
 * `where('customerId', '==', X)`). Extends Phase 24.0's 11-collection
 * CUSTOMER_CASCADE_COLLECTIONS with 5 gap collections (V74) + be_assessments
 * (2026-06-18) that reference customerId but were missed when added.
 *
 * Wipe action: delete all docs where customerId == X
 * Restore action: recreate all docs at same docIds
 */
export const CUSTOMER_CASCADE_COLLECTIONS_FULL = Object.freeze([
  // Phase 24.0 baseline 11
  'be_treatments',
  'be_sales',
  'be_deposits',
  // 2026-06-18 — was be_wallets (a Phase-24.0 PHANTOM: 0 docs, no rule, no
  // accessor). The real wallet-balance store is be_customer_wallets (backendClient
  // walletsCol; composite id customerId__walletTypeId). Renamed so customer delete
  // no longer ORPHANS wallet balances + per-customer backup captures them.
  'be_customer_wallets',
  'be_wallet_transactions',
  'be_memberships',
  'be_point_transactions',
  'be_appointments',
  'be_course_changes',
  'be_link_requests',
  'be_customer_link_tokens',
  // V74 gap closures (cascade stale)
  'be_quotations',
  'be_vendor_sales',
  'be_online_sales',
  'be_sale_insurance_claims',
  'be_recalls',
  // 2026-06-18 — ED Score follow-up assessment rounds (be_assessments, added
  // 2026-06-15). Universal, customerId-keyed; mirrors be_course_changes.
  'be_assessments',
]);

/**
 * 8 customer-attached subcollections (under be_customers/{customerId}/).
 *
 * Wipe action: recursively delete every doc in each subcollection.
 * Restore action: recreate every doc at same docId in same subcoll path.
 *
 * Mirror of V40 T4_SUBCOLLECTIONS list in src/lib/branchBackupCore.js
 * (intentional — same semantic).
 */
export const T4_SUBCOLLECTIONS = Object.freeze([
  'treatments',
  'sales',
  'appointments',
  'deposits',
  'wallets',
  'memberships',
  'points',
  'courseChanges',
]);

/**
 * 6 audit-immutable collections (NEVER wiped, NEVER restored by V74).
 * Legal/MOPH retention per V34 (stock movements) + admin-audit chain
 * + LINE/recall operational audit logs.
 *
 * Wipe action: LEAVE INTACT (orphaned refs to deleted treatmentIds OK).
 * Restore action: SKIP (was never deleted; treatmentId refs auto-re-resolve
 * when restore recreates be_treatments at same docId).
 */
export const AUDIT_IMMUTABLE_COLLECTIONS = Object.freeze([
  'be_admin_audit',
  'be_stock_movements',
  'be_line_reminder_log',
  'be_recall_audit_log',
  'be_postback_log',
  'be_line_reminder_postback_log',
]);

/**
 * Test whether a chat_conversations doc belongs to a customer.
 *
 * Match criteria (OR):
 *   - chat.customerId === customer.id (explicit link)
 *   - chat.lineUserId in customer.lineUserId_byBranch values (LINE link)
 *
 * Defensive on missing fields:
 *   - null/undefined chat or customer → returns false
 *   - missing customer.lineUserId_byBranch → treated as empty (skip LINE path)
 */
export function matchCustomerChatPredicate(chat, customer) {
  if (!chat || !customer) return false;
  if (chat.customerId && chat.customerId === customer.id) return true;
  if (chat.lineUserId) {
    const lineByBranch = customer.lineUserId_byBranch || {};
    for (const branchLineId of Object.values(lineByBranch)) {
      if (chat.lineUserId === branchLineId) return true;
    }
  }
  return false;
}
