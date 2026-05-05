---
title: Runtime fallback for orphan roomIds (Phase 18.0)
type: concept
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [phase-18-0, render-pattern, no-cascade]
source-count: 1
---

# Runtime fallback for orphan roomIds

> Render-time pattern that routes appointments with blank, missing, stale, or cross-branch `roomId` to a virtual "ไม่ระบุห้อง" column. Zero writes to appt docs on room delete. Implemented in `appointmentRoomColumns.js` + AppointmentTab.jsx.

## The problem this solves

When admin deletes an exam room, the N appointments referencing it shouldn't disappear — they should still display somewhere. Traditional solutions:

- **Cascade-update**: rewrite every affected appt's `roomId = ''` on delete. Atomic, but expensive (could be 100s of writes) and irreversible.
- **Foreign-key constraint**: refuse delete while references exist. Frustrating UX; admin can't decommission rooms without manually reassigning every appt.

Phase 18.0 chose **runtime fallback**: delete the room doc, leave appt docs untouched, the renderer notices the broken FK and routes the appt to a virtual UNASSIGNED column.

User directive (verbatim, 2026-05-05):

> "หรือทำให้ออโต้ไปเลยก็ได้เผื่ออนาคตมีการลบห้องตรวจ คือทำให้ไอ้การนัดหมายหรือตารางแพทย์ ผู้ช่วย ที่มีห้องที่ไม่มีอยู่แล้วในสาขานั้นๆ ไปอยู่ในหมวด ไม่ระบุห้อง อัตโนมัติ เพื่อป้องกันข้อมูลมั่ว"

## The contract

Pure helper [`effectiveRoomId(appt, branchRoomIds)`](../entities/appointment-room-columns.md):

```js
export const UNASSIGNED_ROOM_ID = '__UNASSIGNED__';
export const UNASSIGNED_ROOM_LABEL = 'ไม่ระบุห้อง';

function effectiveRoomId(appt, branchRoomIds /* Set<string> */) {
  if (!appt) return UNASSIGNED_ROOM_ID;
  const id = appt.roomId;
  if (!id) return UNASSIGNED_ROOM_ID;
  if (!branchRoomIds || !branchRoomIds.has(id)) return UNASSIGNED_ROOM_ID;
  return id;
}
```

Five collapse cases all return UNASSIGNED:
1. `appt = null/undefined`
2. `appt.roomId === ''` (blank — no room picked)
3. `appt.roomId` is undefined (legacy appt pre-Phase-18.0)
4. `appt.roomId` points to a room that's been deleted (stale FK)
5. `appt.roomId` belongs to a different branch (cross-branch orphan)

Column derivation [`buildRoomColumnList(rooms, dayAppts)`](../entities/appointment-room-columns.md):

- Master rooms sorted by `sortOrder` ASC, then Thai-locale `name`
- Virtual `{ id: UNASSIGNED_ROOM_ID, label: 'ไม่ระบุห้อง', virtual: true }` appended iff at least one appt resolves to UNASSIGNED OR the branch has zero master rooms (Phase 18.0 follow-up [882fb35](#) — empty branches get a clickable column for roomless appt creation)

## Why no cascade

Trade-off vs cascade-update:

| Concern | Cascade-update | Runtime fallback (Phase 18.0) |
|---|---|---|
| Delete cost | O(N) writes | O(1) write (just the master doc) |
| Reversibility | None — appt docs lost their roomId | Restoring the room re-binds appts automatically |
| Audit trail | Hard to tell if appt's empty roomId was original or post-cascade | Original roomId preserved on appt; just doesn't match current master |
| Race safety | Concurrent appt-edit during cascade can lose changes | No race — read-only fallback at render |
| Cross-tenant scope | Per-branch limited but still many writes | Per-render filter; scales |

The denormalized `roomName` snapshot ([be_exam_rooms entity](../entities/be-exam-rooms.md) → appt write) gives "best-effort historical display" even when the master is gone — admin sees the OLD room name in the appt detail view, just routed to UNASSIGNED in the calendar grid.

## Soft-confirm dialog

[ExamRoomsTab](../entities/exam-rooms-tab.md) delete button shows a non-blocking warning:

> "ลบห้อง 'X' ?
> นัดหมายที่อ้างถึงห้องนี้จะถูกย้ายไป 'ไม่ระบุห้อง' อัตโนมัติ
> ลบจาก Firestore — ย้อนไม่ได้"

Admin clicks ยืนยัน → `deleteExamRoom(id)` runs (single Firestore delete). On next AppointmentTab render, the affected appts appear in the ไม่ระบุห้อง column. Admin can re-edit each one individually if they want to bind to a different room.

## Cross-references

- Concept: [Branch Exam Rooms (Phase 18.0)](branch-exam-rooms.md) — parent feature
- Entity: [appointmentRoomColumns helper](../entities/appointment-room-columns.md) — `effectiveRoomId`, `buildRoomColumnList`, sentinels
- Entity: [be_exam_rooms](../entities/be-exam-rooms.md) — the master collection
- File: `src/components/backend/AppointmentTab.jsx` (V15 #20: drops legacy localStorage cache; columns = master ONLY + virtual UNASSIGNED)

## History

- 2026-05-05 — Created. Phase 18.0 design Q5=B-soft (soft-confirm + runtime fallback) per user directive.
- 2026-05-05 — Phase 18.0 follow-up: legacy `appt-rooms-seen` localStorage cache dropped; orphan strings route via this fallback instead of polluting column headers.
- 2026-05-05 — Phase 18.0 follow-up #2: empty-branch case gets a virtual UNASSIGNED column always (so users can click-create on rooms-less branches).
