// ─── Cross-branch import adapter — coupons ─────────────────────────────────
// Phase 17.1 marketing extension (2026-05-07). Defines how `be_coupons`
// items are dedup-checked, FK-validated, cloned, and rendered in the
// cross-branch import modal.
//
// dedupKey: coupon_code (REQUIRED + user-validated unique per
//           couponValidation.js; admins manually pick e.g. "SUMMER2026"
//           and would conflict with same code at target).
// fkRefs:   none — coupons are standalone. branch_ids[] is metadata
//           (list of branches the coupon applies to), NOT a FK reference.
// canonicalIdField: couponId.
// Special: clone resets branch_ids → [] per Q2 lock — fresh copy at target
//          applies to all branches by default; admin can edit to restrict.
//
// Spec: docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md

export const couponsAdapter = {
  entityType: 'coupons',
  collection: 'be_coupons',
  canonicalIdField: 'couponId',
  dedupKey: (item) => String(item.coupon_code || ''),
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    // Strip id + couponId + branch_ids; reset branch_ids → [] per Q2 lock
    // (Phase 17.1 marketing-extension brainstorming, NOT V-log V41).
    const { id, couponId, branch_ids, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      branch_ids: [],
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => {
    const discountText = item.discount_type === 'baht'
      ? `฿${Number(item.discount || 0).toLocaleString('th-TH')}`
      : `${item.discount || 0}%`;
    return {
      primary: item.coupon_name || '(ไม่มีชื่อ)',
      secondary: `${item.coupon_code || '-'} • ${discountText} • max=${item.max_qty || 0}`,
      tertiary: item.start_date ? `${item.start_date} → ${item.end_date || '?'}` : null,
    };
  },
};

export default couponsAdapter;
