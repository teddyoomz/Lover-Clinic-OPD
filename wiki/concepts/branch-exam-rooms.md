---
title: Branch Exam Rooms (Phase 18.0)
type: concept
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [phase-18-0, branch-scope, master-data, bsa]
source-count: 2
---

# Branch Exam Rooms

> Per-branch exam-room CRUD master. Each branch maintains its own independent room list (different counts, different names, no cross-branch leak). Replaces the legacy `appt-rooms-seen` localStorage cumulative cache with a real branch-scoped master entity. Shipped V15 #19 / V15 #20 (2026-05-05).

## Overview

User directive (verbatim, 2026-05-05):

> "ตั้งสาขาของเราต้องเพิ่ม การเพิ่มลดห้องตรวจ … ซึ่งจะมีผลกับการนัดหมายคือไปโผล่อยู่ในทุกการนัดหมายที่เลือกห้องได้ … ซึ่งแต่ละสาขาจะมีห้องตรวจไม่เหมือนกันและไม่เท่ากันดังนั้น ข้อมูลห้องตรวจจะต้องเก็บแยกเป็นสาขาไว้ และแต่ละสาขาใช้กันต่างหากไม่เกี่ยวข้องกัน"

Pre-Phase-18.0, exam rooms were free-text strings stored on each `be_appointments` doc as `roomName`. AppointmentFormModal hardcoded `FALLBACK_ROOMS = []` + cached every seen string in `localStorage.appt-rooms-seen`. This meant:

- No cross-branch separation (every room name accumulated into one global cache)
- Renaming a room left orphan strings forever
- Empty rooms invisible (admin couldn't drag-create into a room without an existing booking)

Phase 18.0 introduces `be_exam_rooms` as the canonical branch-scoped master, with denormalized `roomId + roomName` on every appointment write. Runtime fallback (`effectiveRoomId`) routes orphan/blank/cross-branch ids to a virtual "ไม่ระบุห้อง" column at render — no writes on delete, no data loss.

## Key facts

- **Storage**: NEW Firestore collection `be_exam_rooms`, branch-scoped via standard BSA pattern (matches `be_holidays` shape) — see [be_exam_rooms](../entities/be-exam-rooms.md)
- **Reference shape on appointments**: both `roomId` (FK) and `roomName` (snapshot) written together — denormalization pattern matches sales/treatments productName + productId
- **Initial seed**: นครราชสีมา branch seeded with 3 rooms (ห้องแพทย์/ห้องผ่าตัด · ห้องช็อคเวฟ · ห้องดริป) via `scripts/phase-18-0-seed-exam-rooms.mjs --apply` on 2026-05-05
- **Schedule entries** (`be_staff_schedules`) deliberately NOT touched — Q3=C in brainstorm, defer to follow-up if user changes mind
- **Cross-branch contract**: customer-attached entities (courses, deposits) remain universal; stock deduction stays per-treatment-branch via Phase 17.2-sexies `_resolveProductIdByName(name, branchId)` name-fallback
- **Permission key**: `exam_room_management` (separate from `branch_management` for finer ACL)

## Surface map

- [be_exam_rooms](../entities/be-exam-rooms.md) — Firestore collection
- [examRoomValidation.js](../../src/lib/examRoomValidation.js) — `validateExamRoom`, `emptyExamRoomForm`, `normalizeExamRoom`, `STATUS_OPTIONS`
- [ExamRoomsTab](../entities/exam-rooms-tab.md) — backend nav `tab=exam-rooms`, branch-scoped CRUD list
- ExamRoomFormModal — MarketingFormShell modal: name (req) / nameEn / note / status / sortOrder
- [appointmentRoomColumns.js](../entities/appointment-room-columns.md) — `effectiveRoomId(appt, Set)` + `buildRoomColumnList(rooms, appts)` + `UNASSIGNED_ROOM_ID` sentinel
- AppointmentFormModal — drops `FALLBACK_ROOMS` const + `ROOMS_CACHE_KEY` localStorage cache; sources from `listExamRooms({branchId, status:'ใช้งาน'})`
- AppointmentTab — column derivation from branch master (V15 #20 dropped `allKnownRooms` legacy cache; orphan strings route to virtual ไม่ระบุห้อง)
- DepositPanel — deposit→appointment flow writes both `roomId` + `roomName`
- `scripts/phase-18-0-seed-exam-rooms.mjs` — admin SDK migration with `--dry-run` / `--apply` modes; idempotent via name-keyed lookup

## Render-time orphan fallback

See [Runtime fallback for orphan roomIds](runtime-fallback-orphan-room.md). Pattern: `effectiveRoomId(appt, branchRoomIdSet)` returns `appt.roomId` iff the id exists in the branch's master Set; otherwise returns `UNASSIGNED_ROOM_ID`. Any appt with `roomId === ''` / missing / stale (room deleted) / cross-branch all collapse to the virtual "ไม่ระบุห้อง" column at render. Zero writes to appt docs on room delete.

## Cross-references

- Concept: [Branch-Scope Architecture](branch-scope-architecture.md) — Phase 18.0 `be_exam_rooms` follows the BSA pattern (Layer 2 auto-inject, Layer 3 listener, audit BS-1..BS-9)
- Concept: [Runtime fallback for orphan roomIds](runtime-fallback-orphan-room.md)
- Concept: [V12 shape-drift bug class](v12-shape-drift.md) — Phase 17.2-quinquies/septies/octies + Phase 18.0 follow-up all relate
- Source: Phase 18.0 design spec (`docs/superpowers/specs/2026-05-05-branch-exam-rooms-design.md`)
- Source: Phase 18.0 implementation plan (`docs/superpowers/plans/2026-05-05-phase-18-0-branch-exam-rooms.md`)

## History

- 2026-05-05 — Created. Phase 18.0 + follow-up bug fixes shipped (V15 #19, V15 #20). Migration `--apply` ran on prod (3 rooms seeded for นครราชสีมา; audit doc `be_admin_audit/phase-18-0-seed-exam-rooms-1777978075511-...`).
