---
title: appointmentRoomColumns helper
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [phase-18-0, helper, render]
source-count: 1
---

# appointmentRoomColumns

> Pure render-side helpers for AppointmentTab grid. Maps an appointment to the column it should render under (`effectiveRoomId`), and builds the ordered column list (`buildRoomColumnList`). Used to enforce branch-master-only column rendering and runtime orphan-fallback to virtual UNASSIGNED column.

## Location

- File: `src/lib/appointmentRoomColumns.js`
- Tests: `tests/phase-18-0-appointment-room-columns.test.js` (16 unit cases)

## Public API

```js
export const UNASSIGNED_ROOM_ID = '__UNASSIGNED__';
export const UNASSIGNED_ROOM_LABEL = 'ไม่ระบุห้อง';

export function effectiveRoomId(appt, branchRoomIds /* Set<string> */) {
  // Returns appt.roomId iff valid in branchRoomIds; else UNASSIGNED_ROOM_ID
}

export function buildRoomColumnList(rooms, dayAppts) {
  // Returns Array<{ id, label, virtual? }>
  // Master rooms sorted by sortOrder ASC, then Thai-locale name
  // Virtual UNASSIGNED column appended iff orphan exists OR rooms is empty
}
```

## Why pure helpers

Pre-Phase-18.0, AppointmentTab did its own derivation inline (see `src/components/backend/AppointmentTab.jsx:241-310` pre-fix). Two problems:

1. Untestable without mounting React
2. Reused the legacy `appt-rooms-seen` localStorage cache as fallback, polluting columns with stale strings cross-branch

Extracting to a pure module:

- Tests don't need RTL/jsdom — just call the function with sample data
- 16 cases cover null safety, sort, virtual-column appearance, fallback-to-id, cross-branch rejection
- AppointmentTab.jsx inline logic shrinks; the V15 #20 fix (drop `allKnownRooms`) used the helper to enforce master-only columns

## Behavior summary

| Input | Output |
|---|---|
| `effectiveRoomId({ roomId: 'EXR-1' }, Set(['EXR-1']))` | `'EXR-1'` |
| `effectiveRoomId({ roomId: '' }, Set(['EXR-1']))` | `UNASSIGNED_ROOM_ID` |
| `effectiveRoomId({ roomId: 'EXR-DELETED' }, Set(['EXR-1']))` | `UNASSIGNED_ROOM_ID` |
| `effectiveRoomId({}, Set(['EXR-1']))` | `UNASSIGNED_ROOM_ID` |
| `effectiveRoomId(null, Set(['EXR-1']))` | `UNASSIGNED_ROOM_ID` |
| `buildRoomColumnList([{examRoomId:'A',name:'A',sortOrder:1},{examRoomId:'B',name:'B',sortOrder:0}], [])` | `[{id:'B'},{id:'A'}]` |
| `buildRoomColumnList(rooms, [{roomId:'EXR-DELETED'}])` | `[...master, {id:UNASSIGNED, virtual:true}]` |
| `buildRoomColumnList([], [{roomId:'X'}])` | `[{id:UNASSIGNED, virtual:true}]` |
| `buildRoomColumnList([], [])` (post Phase 18.0 follow-up) | `[]` *or* with empty-branch flag → `[{id:UNASSIGNED}]` |

## Cross-references

- Concept: [Runtime fallback for orphan roomIds](../concepts/runtime-fallback-orphan-room.md)
- Concept: [Branch Exam Rooms (Phase 18.0)](../concepts/branch-exam-rooms.md)
- Entity: [be_exam_rooms](be-exam-rooms.md) — the master that drives `branchRoomIds`
- File: `src/components/backend/AppointmentTab.jsx` — primary consumer

## History

- 2026-05-05 — Created. Phase 18.0 Task 7 ([ef81f49](#)). 16 unit tests at creation.
