// ─── Cross-branch import adapter — holidays ────────────────────────────────
// Phase 17.1. Standalone (no FK refs). Two kinds: specific-date(s) +
// weekly (day-of-week). Dedup key includes holidayType to differentiate.

export const holidaysAdapter = {
  entityType: 'holidays',
  collection: 'be_holidays',
  dedupKey: (item) => `${item.holidayType || 'specific'}:${item.name || ''}`,
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { holidayId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => {
    const typeLabel = item.holidayType === 'weekly' ? 'รายสัปดาห์' : 'วันเฉพาะ';
    let secondary = typeLabel;
    if (item.holidayType === 'weekly' && Array.isArray(item.daysOfWeek)) {
      secondary += ` • ${item.daysOfWeek.join(', ')}`;
    } else if (Array.isArray(item.dates)) {
      secondary += ` • ${item.dates.length} วัน`;
    }
    return {
      primary: item.name || '(ไม่มีชื่อ)',
      secondary,
      tertiary: null,
    };
  },
};

export default holidaysAdapter;
