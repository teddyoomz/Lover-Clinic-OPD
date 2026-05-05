// ─── Cross-branch import adapter — medical-instruments ────────────────────
// Phase 17.1. Standalone (no FK refs).

export const medicalInstrumentsAdapter = {
  entityType: 'medical-instruments',
  collection: 'be_medical_instruments',
  dedupKey: (item) => `${item.name || ''}`,
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { instrumentId, ...rest } = item;
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
    secondary: item.category || null,
    tertiary: item.status === 'พักใช้งาน' ? 'พักใช้งาน' : null,
  }),
};

export default medicalInstrumentsAdapter;
