// ─── appointmentHubEmptyState (2026-07-24) — pure ──────────────────────────
// Context-aware empty-state for the appointment hub. BEFORE: one message
// ("ลองเปลี่ยน tab หรือ ปรับตัวกรอง") for every empty reason — which nagged the
// user to adjust filters even when the day's queue was simply DONE (0 waiting,
// N completed) and no filter could reveal anything. This derives WHY the list
// is empty so the copy + CTA fit:
//   filtered  — a search/type/status filter is active AND the tab HAS data →
//               the only case where "ปรับตัวกรอง" is honest.
//   all-done  — today · waiting sub-pill · 0 waiting · ≥1 completed → celebrate,
//               and point at the completed sub-pill (which has the data).
//   no-appts  — genuinely nothing for this view → invite creating one.
// Pure (no React) so it's unit-testable; every input already lives in
// AppointmentHubView (appts, filteredAppts, todaySubCounts, filters, subPill).

export const EMPTY_STATE_COPY = {
  filtered:   { icon: '🔍', heading: 'ไม่พบนัดหมายที่ค้นหา', sub: 'ลองล้างคำค้นหา หรือปรับตัวกรอง' },
  'all-done': { icon: '✅', heading: 'เสร็จหมดแล้ววันนี้',   sub: 'ไม่มีคิวที่รออยู่ตอนนี้' },
  'no-appts': { icon: '🗓️', heading: 'ยังไม่มีนัดหมาย',      sub: 'เริ่มสร้างนัดใหม่ได้เลย' },
};

/**
 * @returns {'filtered'|'all-done'|'no-appts'} first match wins.
 */
export function deriveEmptyStateReason({ activeTab, todaySubPill, waiting, completed, hasActiveFilter, tabHasData } = {}) {
  if (hasActiveFilter && tabHasData) return 'filtered';
  if (activeTab === 'today' && todaySubPill === 'waiting' && Number(waiting) === 0 && Number(completed) > 0) return 'all-done';
  return 'no-appts';
}
