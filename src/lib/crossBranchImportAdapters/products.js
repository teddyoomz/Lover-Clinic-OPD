// ─── Cross-branch import adapter — products ────────────────────────────────
// Phase 17.1 (2026-05-05). Defines how `be_products` items are dedup-checked,
// FK-validated, cloned, and rendered in the cross-branch import modal.
//
// Spec: docs/superpowers/specs/2026-05-05-phase-17-1-cross-branch-master-data-import-design.md
// Wiki: wiki/concepts/cross-branch-import-pattern.md

export const productsAdapter = {
  entityType: 'products',
  collection: 'be_products',
  // Dedup by productType + productName (a product with same name in
  // different productType is legitimately different — e.g. "Acetin" as
  // ยา vs as สินค้าสิ้นเปลือง).
  dedupKey: (item) => `${item.productType || ''}:${item.productName || ''}`,
  // FK references: unitId → be_product_unit_groups, categoryId → be_product_groups.
  // Both are optional in the source doc; only return refs that are present.
  fkRefs: (item) => {
    const refs = [];
    if (item.unitId) {
      refs.push({ collection: 'be_product_unit_groups', ids: [String(item.unitId)] });
    }
    if (item.categoryId) {
      refs.push({ collection: 'be_product_groups', ids: [String(item.categoryId)] });
    }
    return refs;
  },
  // Clone: strip productId (server generates fresh), stamp branchId=target,
  // preserve createdAt+createdBy from source, new updatedAt+updatedBy=now+admin.
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { productId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  // Display row for modal preview. Returns JSX. enrichmentMap reserved for
  // adapter-specific join data (unused for products — has all fields inline).
  displayRow: (item /*, enrichmentMap */) => ({
    primary: item.productName || '(ไม่มีชื่อ)',
    secondary: `${item.productType || '-'} • ${item.mainUnitName || '-'} • ${item.categoryName || '-'}`,
    tertiary: typeof item.price === 'number' ? `฿${item.price.toLocaleString('th-TH')}` : null,
  }),
};

export default productsAdapter;
