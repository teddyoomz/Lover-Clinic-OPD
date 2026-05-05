// ─── Cross-branch import adapter — courses ────────────────────────────────
// Phase 17.1. Branch-scoped collection `be_courses`. FK: items[].productId
// → be_products. Admin must import products before courses (block on
// missing FK per Q2 lock).
//
// FIELD-NAME ADJUSTMENT: be_courses canonical name field is `courseName`
// (per courseValidation.js:85 + saveCourse normalizer). Dedup + display use
// `courseName`, fall back to `name` for legacy/migrated docs that may still
// carry the older field shape.

export const coursesAdapter = {
  entityType: 'courses',
  collection: 'be_courses',
  dedupKey: (item) => `${item.courseName || item.name || ''}`,
  fkRefs: (item) => {
    const ids = Array.isArray(item.items)
      ? item.items.map(it => it && it.productId ? String(it.productId) : null).filter(Boolean)
      : [];
    return ids.length ? [{ collection: 'be_products', ids }] : [];
  },
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { courseId, ...rest } = item;
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
    primary: item.courseName || item.name || '(ไม่มีชื่อ)',
    secondary: `${(item.items || []).length} รายการ${typeof item.price === 'number' ? ` • ฿${item.price.toLocaleString('th-TH')}` : ''}`,
    tertiary: item.courseType || null,
  }),
};

export default coursesAdapter;
