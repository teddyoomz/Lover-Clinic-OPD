// ─── Cross-branch import adapter — df-groups ──────────────────────────────
// Phase 17.1. Branch-scoped `be_df_groups`. NO branch-scoped FK refs:
// staffId / doctorId references are to UNIVERSAL be_staff / be_doctors
// collections (per BSA matrix). Importing a df-group across branches keeps
// the same staff/doctor refs valid because staff/doctors are not
// branch-scoped.
//
// FIELD-NAME ADJUSTMENT: be_df_groups doc-shape stores BOTH `id` and
// `groupId` (NOT `dfGroupId`) per saveDfGroup at backendClient.js:10806.
// The clone destructures both `id` and `groupId` to strip the legacy
// stamps so the server can mint a fresh ID.

export const dfGroupsAdapter = {
  entityType: 'df-groups',
  collection: 'be_df_groups',
  dedupKey: (item) => `${item.name || ''}`,
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { id, groupId, dfGroupId, ...rest } = item;
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
    secondary: Array.isArray(item.rates) ? `${item.rates.length} อัตรา` : null,
    tertiary: item.status === 'disabled' ? 'พักใช้งาน' : null,
  }),
};

export default dfGroupsAdapter;
