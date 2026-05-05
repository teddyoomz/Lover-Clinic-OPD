// ─── Cross-branch import adapter — product-units (be_product_unit_groups) ──
// Phase 17.1. Standalone (no FK refs).

export const productUnitsAdapter = {
  entityType: 'product-units',
  collection: 'be_product_unit_groups',
  dedupKey: (item) => `${item.name || ''}`,
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { unitGroupId, ...rest } = item;
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
    primary: item.name || '(ไม่มีชื่อ)',
    secondary: Array.isArray(item.units) ? `${item.units.length} หน่วย` : null,
    tertiary: null,
  }),
};

export default productUnitsAdapter;
