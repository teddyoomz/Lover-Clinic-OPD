// ─── Appointment room columns — Phase 18.0 pure helpers ─────────────────
// Used by AppointmentTab.jsx column derivation. Branch-scoped exam rooms
// drive column layout; orphan/blank/stale roomIds collect in a virtual
// UNASSIGNED column.

export const UNASSIGNED_ROOM_ID = '__UNASSIGNED__';
export const UNASSIGNED_ROOM_LABEL = 'ไม่ระบุห้อง';

/**
 * Map an appt to the column it should render under.
 * Returns the appt's roomId if it points to a room currently in the
 * branch's master list; otherwise returns the UNASSIGNED sentinel.
 *
 * @param {{ roomId?: string }} appt
 * @param {Set<string>} branchRoomIds — Set of valid examRoomId values for the current branch
 */
export function effectiveRoomId(appt, branchRoomIds) {
  if (!appt) return UNASSIGNED_ROOM_ID;
  const id = appt.roomId;
  if (!id) return UNASSIGNED_ROOM_ID;
  if (!branchRoomIds || !branchRoomIds.has(id)) return UNASSIGNED_ROOM_ID;
  return id;
}

/**
 * Build the ordered column list for the AppointmentTab grid.
 * - One column per room in the branch (sorted by sortOrder asc, then name).
 * - Virtual UNASSIGNED column appended iff at least one appt resolves to it.
 *
 * @param {Array<{examRoomId?: string, id?: string, name?: string, sortOrder?: number}>} rooms
 * @param {Array<{ roomId?: string }>} dayAppts
 * @returns {Array<{ id: string, label: string, virtual?: boolean }>}
 */
export function buildRoomColumnList(rooms, dayAppts) {
  const ordered = (rooms || [])
    .slice()
    .sort((a, b) =>
      (a.sortOrder || 0) - (b.sortOrder || 0) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'th')
    )
    .map(r => ({ id: r.examRoomId || r.id, label: r.name }));

  const branchRoomIds = new Set(ordered.map(c => c.id));
  const hasOrphan = (dayAppts || []).some(a => effectiveRoomId(a, branchRoomIds) === UNASSIGNED_ROOM_ID);

  if (hasOrphan) {
    ordered.push({ id: UNASSIGNED_ROOM_ID, label: UNASSIGNED_ROOM_LABEL, virtual: true });
  }
  return ordered;
}
