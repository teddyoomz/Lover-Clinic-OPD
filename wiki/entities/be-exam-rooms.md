---
title: be_exam_rooms (Firestore collection)
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [phase-18-0, firestore, branch-scope]
source-count: 1
---

# be_exam_rooms

> Branch-scoped exam-room master. Each doc represents one room belonging to one branch. Sorted by `sortOrder` then Thai-locale name for column display. Status enum (`'ใช้งาน' | 'พักใช้งาน'`).

## Schema

```js
{
  examRoomId: 'EXR-<ts>-<hex>',   // doc id; matches generateMarketingId('EXR') pattern
  branchId: 'BR-...',              // FK; immutable post-create; stamped via _resolveBranchIdForWrite
  name: 'ห้องดริป',                  // required, ≤ 80 chars (NAME_MAX_LENGTH)
  nameEn: 'Drip room',             // optional, ≤ 80 chars
  note: '',                        // optional, ≤ 200 chars
  status: 'ใช้งาน' | 'พักใช้งาน',
  sortOrder: 0,                    // integer ≥ 0; AppointmentTab column order
  createdAt, updatedAt             // ISO string
}
```

## Branch-scope classification

- `tests/branch-collection-coverage.test.js:72` — `be_exam_rooms: { scope: 'branch-spread', source: 'Phase 18.0 — ExamRoomsTab; saveExamRoom spreads branchId via _resolveBranchIdForWrite' }`
- Audit BS-1..BS-9 enforced via [scopedDataLayer.js](../entities/scoped-data-layer.md) auto-inject
- BS-9 listener-driven re-fetch via `useEffect([branchId])` in ExamRoomsTab + `listExamRooms({branchId})` in AppointmentFormModal/Tab/DepositPanel

## Public API

Layer 1 (`src/lib/backendClient.js:8771-8869` — inserted between be_holidays and be_branches blocks):

| Function | Signature | Notes |
|---|---|---|
| `listExamRooms` | `({ branchId?, allBranches?, status? })` | Sorts by sortOrder→name; `allBranches:true` bypasses filter |
| `getExamRoom` | `(examRoomId)` | Single doc; null on missing |
| `listenToExamRoomsByBranch` | `(branchId, onChange, onError)` | Returns unsubscribe; same sort contract as listExamRooms |
| `saveExamRoom` | `(id, data, opts)` | Validates via `validateExamRoom`; stamps branchId via `_resolveBranchIdForWrite({ ...data, ...opts })` |
| `deleteExamRoom` | `(id)` | Pure deleteDoc; no cascading writes (runtime fallback handles routing) |

Layer 2 ([scopedDataLayer.js](../entities/scoped-data-layer.md):95-101):

```js
export const listExamRooms = _autoInject(() => raw.listExamRooms);
export const getExamRoom = (...args) => raw.getExamRoom(...args);
export const saveExamRoom = (...args) => raw.saveExamRoom(...args);
export const deleteExamRoom = (...args) => raw.deleteExamRoom(...args);
export const listenToExamRoomsByBranch = (...args) => raw.listenToExamRoomsByBranch(...args);
```

## Firestore rule

`firestore.rules:204-215` (deployed v26 on V15 #19):

```
match /be_exam_rooms/{roomId} {
  allow read, write: if isClinicStaff();
}
```

Same gate as `be_holidays` and other branch-scoped masters. Branch isolation enforced at the application layer via `_resolveBranchIdForWrite` + `listExamRooms({branchId})` auto-inject — NOT via field-level rules (which Firestore can't OR-merge cleanly).

## Cross-references

- Concept: [Branch Exam Rooms](../concepts/branch-exam-rooms.md) — feature overview
- Concept: [Runtime fallback for orphan roomIds](../concepts/runtime-fallback-orphan-room.md)
- Entity: [appointmentRoomColumns helper](appointment-room-columns.md) — render-side
- Entity: [scopedDataLayer.js](scoped-data-layer.md) — Layer 2 wrapper
- Migration: `scripts/phase-18-0-seed-exam-rooms.mjs` — initial seed for นครราชสีมา (3 rooms)

## History

- 2026-05-05 — Created. Phase 18.0 Task 2 ([46102ed](#)). Validation helper at [examRoomValidation.js](../../src/lib/examRoomValidation.js).
