// ─── Cross-branch import adapter — promotions ──────────────────────────────
// Phase 17.1 marketing extension (2026-05-07). Defines how `be_promotions`
// items are dedup-checked, FK-validated, cloned, and rendered in the
// cross-branch import modal.
//
// dedupKey: promotion_name (validated required by promotionValidation.js;
//           promotion_code is OPTIONAL so unsuitable as primary key).
// fkRefs:   strict-block via courses[].id → be_courses + products[].id →
//           be_products. Mirrors coursesAdapter pattern for items[].productId.
//           User must copy products + courses BEFORE promotions can be
//           imported (natural dependency order).
// canonicalIdField: promotionId (V39 stamping pattern).
//
// Spec: docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md

export const promotionsAdapter = {
  entityType: 'promotions',
  collection: 'be_promotions',
  canonicalIdField: 'promotionId',
  dedupKey: (item) => String(item.promotion_name || ''),
  fkRefs: (item) => {
    const refs = [];
    const courseIds = Array.isArray(item.courses)
      ? item.courses.map(c => c && c.id ? String(c.id) : null).filter(Boolean)
      : [];
    if (courseIds.length) refs.push({ collection: 'be_courses', ids: courseIds });
    const productIds = Array.isArray(item.products)
      ? item.products.map(p => p && p.id ? String(p.id) : null).filter(Boolean)
      : [];
    if (productIds.length) refs.push({ collection: 'be_products', ids: productIds });
    return refs;
  },
  // Clone: strip promotionId (server generates fresh), stamp branchId=target,
  // preserve createdAt+createdBy from source, new updatedAt+updatedBy=now+admin.
  // Strips stray `id` per V39 lock (legacy ProClinic numeric id can shadow
  // docId in list spread — V38 silent-no-op delete bug).
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { id, promotionId, ...rest } = item;
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
    primary: item.promotion_name || '(ไม่มีชื่อ)',
    secondary: `${item.status || 'active'} • ${item.category_name || '-'} • ฿${Number(item.sale_price || 0).toLocaleString('th-TH')}`,
    tertiary: item.has_promotion_period && item.promotion_period_start
      ? `${item.promotion_period_start} → ${item.promotion_period_end || '?'}`
      : null,
  }),
};

export default promotionsAdapter;
