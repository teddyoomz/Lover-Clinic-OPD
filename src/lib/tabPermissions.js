// ─── Tab Permission gate — Phase 13.5.1 ───────────────────────────────────
// Maps backend nav tab IDs to the permission keys that unlock them. Admin
// bypass covers master-data / system tabs that don't map cleanly to a
// business permission. Pure — composes with navConfig at render time.
//
// Consumers:
//   - Sidebar (filters visible items)
//   - BackendDashboard route guard (redirects deep-link to first allowed tab)
//   - CmdPalette (hides forbidden entries from fuzzy search)
//
// Rule E: no Firestore reads in this file — pure logic.
// Rule D: 15 invariants covered by tests/tabPermissions.test.js.

/**
 * Tab id → permission gate config.
 *   - requires: array of permission keys; any-of match unlocks. Empty = always visible.
 *   - adminOnly: when true, only adminBypass grants access (master-data CRUD).
 *
 * Missing tab id = default allow (unknown tabs treat as public — better to
 * surface than to silently hide behind an unconfigured gate).
 */
export const TAB_PERMISSION_MAP = Object.freeze({
  // Pinned
  appointments:          { requires: ['appointment', 'coming_appointment', 'coming_appointment_self'] },

  // Customers
  clone:                 { requires: ['customer_management'] },
  customers:             { requires: ['customer_management', 'customer_view'] },

  // Sales
  sales:                 { requires: ['sale_management', 'sale_view'] },
  quotations:            { requires: ['quotation_management', 'quotation_view'] },
  'online-sales':        { requires: ['online_sale'] },
  'insurance-claims':    { requires: ['sale_management', 'sale_view'] },
  'vendor-sales':        { requires: ['vendor_sale_management'] },

  // Stock
  stock:                 { requires: ['stock_management', 'stock_movement'] },
  'central-stock':       { requires: ['central_stock'] },  // Phase 15.1 — central warehouse view (read-only in 15.1)

  // Finance
  finance:               { requires: ['deposit', 'wallet_management'] },

  // Marketing
  promotions:            { requires: ['promotion_management', 'promotion_view', 'clinic_promotion_management'] },
  coupons:               { requires: ['coupon_management', 'coupon_view'] },
  vouchers:              { requires: ['voucher_management', 'voucher_view', 'clinic_voucher_management'] },

  // Reports
  reports:               { requires: ['dashboard'] },
  'reports-sale':        { requires: ['sale_view'] },
  'reports-customer':    { requires: ['customer_view'] },
  'reports-appointment': { requires: ['appointment'] },
  'reports-stock':       { requires: ['stock_movement', 'stock_management'] },
  'reports-rfm':         { requires: ['customer_view'] },
  'reports-revenue':     { requires: ['sale_view'] },
  'reports-appt-analysis': { requires: ['appointment'] },
  'reports-daily-revenue': { requires: ['sale_view'] },
  'reports-staff-sales': { requires: ['sale_view'] },
  'reports-pnl':         { requires: ['expense_view', 'expense_management'] },
  'reports-payment':     { requires: ['sale_view', 'deposit'] },
  'reports-df-payout':   { requires: ['doctor_df_management', 'treatment_df_view', 'treatment_df_management'] },

  // Master data — most are admin-configured settings
  masterdata:            { adminOnly: true },
  'product-groups':      { adminOnly: true },
  'product-units':       { adminOnly: true },
  'medical-instruments': { adminOnly: true },
  holidays:              { adminOnly: true },
  branches:              { adminOnly: true },
  'permission-groups':   { adminOnly: true },
  staff:                 { adminOnly: true },
  'staff-schedules':     { requires: ['user_schedule_management', 'user_schedule_view'], adminOnly: false },
  'doctor-schedules':    { requires: ['doctor_schedule_management', 'doctor_schedule_view'], adminOnly: false },
  doctors:               { adminOnly: true },
  products:              { adminOnly: true },
  courses:               { adminOnly: true },
  'finance-master':      { adminOnly: true },
  'df-groups':           { requires: ['df_group'], adminOnly: false },
  'document-templates':  { adminOnly: true },
  'line-settings':       { adminOnly: true },  // V32-tris-ter — LINE OA channel + bot config
  'link-requests':       { adminOnly: true },  // V32-tris-quater — LINE link approval queue
});

/**
 * @param {string} tabId
 * @param {Record<string, boolean>} permissions  - flat key → true map
 * @param {boolean} isAdmin  - admin bypass (all tabs visible)
 * @returns {boolean}
 */
export function canAccessTab(tabId, permissions, isAdmin) {
  if (isAdmin) return true;
  const gate = TAB_PERMISSION_MAP[tabId];
  if (!gate) return true; // unknown tab → default allow
  if (gate.adminOnly) return false;
  const reqs = gate.requires || [];
  if (reqs.length === 0) return true;
  const perms = permissions || {};
  return reqs.some((key) => perms[key] === true);
}

/**
 * Filter a list of tab ids to only those the user can access.
 * @param {Array<string>} tabIds
 * @param {Record<string, boolean>} permissions
 * @param {boolean} isAdmin
 * @returns {Array<string>}
 */
export function filterAllowedTabs(tabIds, permissions, isAdmin) {
  return (tabIds || []).filter((id) => canAccessTab(id, permissions, isAdmin));
}

/**
 * Resolve a landing tab for a user given their permissions. Returns the
 * first allowed tab in preference order: `appointments` → `customers` →
 * `reports` → `sales` → any tab. Used by BackendDashboard when the
 * requested deep-link tab is forbidden.
 */
export function firstAllowedTab(permissions, isAdmin, candidates = ['appointments', 'customers', 'reports', 'sales']) {
  for (const id of candidates) {
    if (canAccessTab(id, permissions, isAdmin)) return id;
  }
  // Fallback: scan the full map.
  for (const id of Object.keys(TAB_PERMISSION_MAP)) {
    if (canAccessTab(id, permissions, isAdmin)) return id;
  }
  return null;
}
