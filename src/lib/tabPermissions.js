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
  // Phase 21.0 (2026-05-06) — Pinned 'appointments' replaced with 4 sub-tabs
  // (one per appointmentType). All 4 share the SAME permission gate as the
  // legacy 'appointments' tab — no per-type sub-permissions (YAGNI; admin
  // who can see appointments can see all 4 type-filtered views).
  // Legacy 'appointments' key retained for backward-compat with any test
  // that imports it; the canonical entries are the 4 below.
  appointments:                { requires: ['appointment', 'coming_appointment', 'coming_appointment_self'] },
  'appointment-all':           { requires: ['appointment', 'coming_appointment', 'coming_appointment_self'] },
  'appointment-no-deposit':    { requires: ['appointment', 'coming_appointment', 'coming_appointment_self'] },
  'appointment-deposit':       { requires: ['appointment', 'coming_appointment', 'coming_appointment_self'] },
  'appointment-treatment-in':  { requires: ['appointment', 'coming_appointment', 'coming_appointment_self'] },
  'appointment-follow-up':     { requires: ['appointment', 'coming_appointment', 'coming_appointment_self'] },
  // Phase 29 (2026-05-14) — Recall tab — same gate as appointments
  // (admin who can see appointments can see/manage recalls).
  recall:                      { requires: ['appointment', 'coming_appointment', 'coming_appointment_self'] },

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
  'clinic-report':       { requires: ['report_clinic_summary'] },
  // Phase 16.7 (2026-04-29 session 33) — Expense Report tab replicating
  // ProClinic /admin/report/expense (4 sections: Products / Categories /
  // Doctors / Staff). Reuses existing `report_expense` permission key
  // (already in permissionGroupValidation.js as 'รายงานรายจ่าย').
  'expense-report':      { requires: ['report_expense'] },
  'reports-payment':     { requires: ['sale_view', 'deposit'] },
  // Recon (2026-07-07) — money-integrity report; same any-of gate as reports-payment
  'reports-reconciliation': { requires: ['sale_view', 'deposit'] },
  'reports-df-payout':   { requires: ['doctor_df_management', 'treatment_df_view', 'treatment_df_management'] },
  // 2026-07-08 — reports-home wire-up: data-ready new report tabs.
  'reports-alt-sales':   { requires: ['sale_view'] },
  'reports-outstanding': { requires: ['sale_view'] },
  'reports-stock-movements': { requires: ['stock_movement', 'stock_management'] },
  'reports-stock-alert': { requires: ['stock_movement', 'stock_management'] },
  // Phase 16.1 (2026-04-30) — Smart Audience tab. Permission key already
  // declared in permissionGroupValidation.js under "analytics" module.
  'smart-audience':      { requires: ['smart_audience'] },

  // Master data — V83-followup-3 (EOD8 2026-05-18) — class-of-bug fix.
  // Pre-fix bug: tabs with `adminOnly:true` short-circuited canAccessTab
  // BEFORE checking `requires`, so 11 perm keys in permissionGroupValidation.js
  // (product_group, default_product_unit, medical_instrument, holiday_setting,
  // branch_management, exam_room_management, permission_group_management,
  // user_management, doctor_management, product_management,
  // course_management/clinic_course_management) were DEAD — checking the box
  // in PermissionGroupFormModal granted nothing because the tab gate ignored
  // the perm. User reported: "คนที่มีสิทธิ์ในการตั้งค่า จัดการสินค้า ... sub tab
  // ทั้งแบบเดิมและใหม่ กลับปรากฎไม่ครบ". Fix: flip all 11 adminOnly → requires
  // (admin bypass still works via canAccessTab isAdmin early-return).
  //
  // Sanctioned remaining adminOnly: finance-master (umbrella, no specific
  // perm), document-templates / line-settings / fb-settings (no perm declared
  // in catalog), backup-manager / branch-backup (destructive ops — admin
  // claim is the intended gate).
  masterdata:            { adminOnly: true },   // stale — tab REMOVED in V50; entry kept for back-compat
  'product-groups':      { requires: ['product_group'] },
  'product-units':       { requires: ['default_product_unit'] },
  'medical-instruments': { requires: ['medical_instrument'] },
  holidays:              { requires: ['holiday_setting'] },
  branches:              { requires: ['branch_management'] },
  // Phase 18.0 + V83-followup-3 — branch-scoped exam-room master.
  // adminOnly DROPPED (was dead code blocking the requires path).
  'exam-rooms':          { requires: ['exam_room_management'] },
  'permission-groups':   { requires: ['permission_group_management'] },
  staff:                 { requires: ['user_management'] },
  'staff-schedules':     { requires: ['user_schedule_management', 'user_schedule_view'], adminOnly: false },
  'doctor-schedules':    { requires: ['doctor_schedule_management', 'doctor_schedule_view'], adminOnly: false },
  doctors:               { requires: ['doctor_management'] },
  products:              { requires: ['product_management'] },
  // Courses tab: either branch-scoped OR clinic-wide perm grants access
  courses:               { requires: ['course_management', 'clinic_course_management'] },
  'finance-master':      { adminOnly: true },   // umbrella — no specific perm declared
  'df-groups':           { requires: ['df_group'], adminOnly: false },
  'document-templates':  { adminOnly: true },   // no perm declared for templates admin
  'line-settings':       { adminOnly: true },   // V32-tris-ter — LINE OA channel + bot config (admin)
  'fb-settings':         { adminOnly: true },   // V75 Item 3 — Per-branch FB Page settings (admin)
  // V83 (EOD8 2026-05-18) — admin bypass implicit via canAccessTab isAdmin
  // early-return; per-branch user with link_request_management gets access
  // (LinkRequestsTab already branch-scoped via useSelectedBranch).
  'link-requests':       { requires: ['link_request_management'] },

  // Phase 16.3 (2026-04-29) — System Settings tab. Permission-key gated
  // (Q2-C: NEW key `system_config_management`) so owner can grant to
  // head-of-ops without giving full admin claim. Admin bypass implicit.
  'system-settings':     { requires: ['system_config_management'] },
  // 2026-06-02 — Scheduled Tasks tab. Admin bypass implicit.
  'scheduled-tasks':     { requires: ['scheduled_task_management'] },

  // V74 (2026-05-16) — Customer backup/restore admin surface.
  // 2026-05-17 post-V81-fix7b — 'customer-data-recovery' tab REMOVED per user
  // directive (orphan after V81-fix4 deprecated per-customer UI).
  // backup-manager admin-only (destructive ops + PII).
  'backup-manager':         { adminOnly: true },

  // V40 (2026-05-07) — Branch Backup/Restore tab. Admin-only (destructive
  // ops: export/import/make-fresh). No separate permission key needed —
  // admin bypass is the intended gate for this system-level tool.
  'branch-backup':       { adminOnly: true },
});

/**
 * Phase 16.3 (2026-04-29) — pure helper to merge a runtime override on top
 * of the static gate. NOT mutating — `TAB_PERMISSION_MAP` is frozen.
 *
 * Override shape (Q1-D, all 3 patterns):
 *   { hidden?: boolean, requires?: string[], adminOnly?: boolean }
 *
 * Merge semantics:
 *   - hidden: true → tab hidden (treat as adminOnly + no admin bypass for sidebar)
 *   - requires: array → ADDED to static requires list (any-of merge; admin can
 *     widen the gate by adding extra keys, deduplicated client-side)
 *   - adminOnly: true → flag flips on; false → flag flips off (or stays static)
 *
 * @param {{requires?: string[], adminOnly?: boolean}} staticGate
 * @param {{hidden?: boolean, requires?: string[], adminOnly?: boolean}|null} override
 * @returns {{requires: string[], adminOnly: boolean, hidden: boolean}}
 */
export function applyTabOverride(staticGate, override) {
  const sg = staticGate || {};
  const ov = override || {};
  const baseReq = Array.isArray(sg.requires) ? sg.requires : [];
  const addReq = Array.isArray(ov.requires) ? ov.requires : [];
  const merged = Array.from(new Set([...baseReq, ...addReq]));
  const adminOnly = ov.adminOnly !== undefined ? !!ov.adminOnly : !!sg.adminOnly;
  const hidden = ov.hidden === true;
  return { requires: merged, adminOnly, hidden };
}

/**
 * @param {string} tabId
 * @param {Record<string, boolean>} permissions  - flat key → true map
 * @param {boolean} isAdmin  - admin bypass (all tabs visible)
 * @param {Record<string, object>} [overrides]   - Phase 16.3 runtime overrides
 *   from `clinic_settings/system_config.tabOverrides`. Optional; falls back
 *   to static gate when omitted.
 * @returns {boolean}
 */
export function canAccessTab(tabId, permissions, isAdmin, overrides) {
  const staticGate = TAB_PERMISSION_MAP[tabId];
  if (!staticGate && !overrides?.[tabId]) return true; // unknown tab → default allow
  const gate = applyTabOverride(staticGate || {}, overrides?.[tabId] || null);
  // hidden:true → tab is hidden from EVERYONE except admin bypass.
  // Use case: admin temporarily disables a tab; admin still sees it to
  // un-hide. Non-admins see nothing.
  if (gate.hidden && !isAdmin) return false;
  if (isAdmin) return true;
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
 * @param {Record<string, object>} [overrides]
 * @returns {Array<string>}
 */
export function filterAllowedTabs(tabIds, permissions, isAdmin, overrides) {
  return (tabIds || []).filter((id) => canAccessTab(id, permissions, isAdmin, overrides));
}

/**
 * Resolve a landing tab for a user given their permissions. Returns the
 * first allowed tab in preference order: `appointments` → `customers` →
 * `reports` → `sales` → any tab. Used by BackendDashboard when the
 * requested deep-link tab is forbidden.
 */
export function firstAllowedTab(permissions, isAdmin, candidates = ['appointment-all', 'customers', 'reports', 'sales'], overrides) {
  for (const id of candidates) {
    if (canAccessTab(id, permissions, isAdmin, overrides)) return id;
  }
  // Fallback: scan the full map.
  for (const id of Object.keys(TAB_PERMISSION_MAP)) {
    if (canAccessTab(id, permissions, isAdmin, overrides)) return id;
  }
  return null;
}
