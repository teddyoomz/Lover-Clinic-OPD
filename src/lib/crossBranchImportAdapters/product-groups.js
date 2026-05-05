// ─── Cross-branch import adapter — product-groups ─────────────────────────
// Phase 17.1. Branch-scoped collection `be_product_groups`. Dedup by
// productType + name (consumable group "VAT" vs medication group "VAT" both
// legitimate). FK: products[].productId → be_products.

export const productGroupsAdapter = {
  entityType: 'product-groups',
  collection: 'be_product_groups',
  dedupKey: (item) => `${item.productType || ''}:${item.name || ''}`,
  fkRefs: (item) => {
    const ids = Array.isArray(item.products)
      ? item.products.map(p => p && p.productId ? String(p.productId) : null).filter(Boolean)
      : [];
    return ids.length ? [{ collection: 'be_products', ids }] : [];
  },
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { groupId, ...rest } = item;
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
    secondary: `${item.productType || '-'} • ${(item.products || []).length} รายการ`,
    tertiary: item.status === 'พักใช้งาน' ? 'พักใช้งาน' : null,
  }),
};

export default productGroupsAdapter;
