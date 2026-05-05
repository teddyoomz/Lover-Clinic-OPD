---
title: ExamRoomsTab
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [phase-18-0, master-data, branch-scope, ui]
source-count: 1
---

# ExamRoomsTab

> Backend tab `tab=exam-rooms` — branch-scoped CRUD list for `be_exam_rooms`. Mirrors HolidaysTab + BranchesTab MarketingTabShell pattern. Lives under "ข้อมูลพื้นฐาน" section between BranchesTab and PermissionGroupsTab.

## Location

- File: `src/components/backend/ExamRoomsTab.jsx` (~180 LOC)
- Modal: `src/components/backend/ExamRoomFormModal.jsx` (~120 LOC)
- Validation: `src/lib/examRoomValidation.js` (~70 LOC, 19 tests)

## Permission

Gated via `useHasPermission('exam_room_management')` for delete; admin claim bypasses. Read = `isClinicStaff()` per `firestore.rules` `match /be_exam_rooms`.

`tabPermissions.js` entry:

```js
'exam-rooms': { requires: ['exam_room_management'], adminOnly: true }
```

Mirrors `df-groups` pattern — owner can grant a branch manager access without making them full admin.

## BS-9 compliance

Follows the [Branch-switch refresh discipline](../concepts/branch-switch-refresh-discipline.md):

```jsx
const { branchId } = useSelectedBranch();
const reload = useCallback(async () => {
  if (!branchId) return;
  setItems(await listExamRooms({ branchId }));
}, [branchId]);
useEffect(() => { reload(); }, [reload]);
```

`branchId` in deps array → re-fetch on top-right BranchSelector switch. Audit `tests/audit-branch-scope.test.js` BS-9 invariant validates.

## Card layout

- Icon: lucide-react `DoorOpen`
- Header: name (bold) + nameEn (muted small)
- Status badge: ใช้งาน (emerald) / พักใช้งาน (neutral)
- sortOrder display: "ลำดับ N"
- Note: line-clamp-2 muted text
- Footer: Edit + Delete buttons

Sort: `sortOrder` ASC then Thai-locale `name`.

## Delete flow (Phase 18.0 Q5=B-soft)

```jsx
const handleDelete = async (r) => {
  const id = r.examRoomId || r.id;
  const name = r.name || 'ห้อง';
  const msg = `ลบห้อง "${name}" ?\n\n` +
    `นัดหมายที่อ้างถึงห้องนี้จะถูกย้ายไป "ไม่ระบุห้อง" อัตโนมัติ\n` +
    `ลบจาก Firestore — ย้อนไม่ได้`;
  if (!window.confirm(msg)) return;
  await deleteExamRoom(id);
  await reload();
};
```

No appt-doc writes. Runtime fallback ([effectiveRoomId](appointment-room-columns.md)) handles re-routing on next render.

## Nav config entry

`src/components/backend/nav/navConfig.js` master section:

```js
{ id: 'exam-rooms', label: 'ห้องตรวจ', icon: DoorOpen, color: 'amber',
  palette: 'exam room treatment ห้อง ตรวจ ห้องตรวจ ห้องรักษา room' }
```

Inserted between `branches` and `permission-groups`. cmdk fuzzy search hits the palette.

## BackendDashboard wire

`src/pages/BackendDashboard.jsx`:

```jsx
import ExamRoomsTab from '../components/backend/ExamRoomsTab.jsx';
// ...
) : activeTab === 'exam-rooms' ? (
  <ExamRoomsTab clinicSettings={clinicSettings} theme={theme} />
)
```

Direct import (not lazy) — file is small and the tab is in the master section that admins use frequently.

## Cross-references

- Concept: [Branch Exam Rooms (Phase 18.0)](../concepts/branch-exam-rooms.md)
- Concept: [Branch-switch refresh discipline (BS-9)](../concepts/branch-switch-refresh-discipline.md)
- Entity: [be_exam_rooms](be-exam-rooms.md) — the collection
- Entity: [scopedDataLayer.js](scoped-data-layer.md) — auto-inject layer
- Pattern: [Master-data tabs pattern](../concepts/master-data-tabs-pattern.md) — sibling structure

## History

- 2026-05-05 — Created. Phase 18.0 Task 4 ([5aa7e00](#)).
