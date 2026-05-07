// ─── Cross-branch import adapter — vouchers ────────────────────────────────
// Phase 17.1 marketing extension (2026-05-07). Defines how `be_vouchers`
// items are dedup-checked, FK-validated, cloned, and rendered in the
// cross-branch import modal.
//
// dedupKey: voucher_name:platform — same name on different platforms
//           (HDmall, GoWabi, SkinX, Shopee, Tiktok) is legitimately
//           distinct (different commission rules, different sales channel).
//           Composite key avoids false-positive dedup.
// fkRefs:   none — vouchers are standalone (no embedded courses/products).
// canonicalIdField: voucherId.
//
// Spec: docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md

export const vouchersAdapter = {
  entityType: 'vouchers',
  collection: 'be_vouchers',
  canonicalIdField: 'voucherId',
  dedupKey: (item) => `${item.voucher_name || ''}:${item.platform || ''}`,
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    // V39: strip stray id (V38 silent-no-op delete anti-regression) — see productsAdapter clone.
    const { id, voucherId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => ({
    primary: item.voucher_name || '(ไม่มีชื่อ)',
    secondary: `฿${Number(item.sale_price || 0).toLocaleString('th-TH')} • comm ${item.commission_percent || 0}% • ${item.platform || '-'}`,
    tertiary: item.has_period && item.period_start
      ? `${item.period_start} → ${item.period_end || '?'}`
      : null,
  }),
};

export default vouchersAdapter;
