# 2026-05-05 EOD — Phase 17.2 quinquies/sexies/septies/octies + Phase 18.0 Branch Exam Rooms

## Summary

Marathon EOD session shipping 4 cross-branch correctness fixes (Phase 17.2-x — V12 shape-drift recurrences) + Phase 18.0 Branch Exam Rooms feature (full 11-task plan). Two deploys (V15 #19 + V15 #20) + migration `--apply` on prod (3 rooms seeded for นครราชสีมา). Wiki backfilled with 6 NEW pages distilling the cycle. master 2 commits ahead-of-prod awaiting V15 #21 (small UX follow-up).

## Current State

- master = `a89fc6a` (wiki backfill); prod = `bdd917e` (V15 #20 LIVE)
- 2 commits ahead-of-prod: `882fb35` empty-state removal (V15 #21 pending) + `a89fc6a` wiki docs only
- 5394/5394 tests pass · build clean · firestore.rules v26
- Phase 18.0 migration ran on prod — audit `be_admin_audit/phase-18-0-seed-exam-rooms-1777978075511-15c426ec-...`
- Wiki at 19 entities + 12 concepts + 3 sources

## Commits (chronological)

```
a89fc6a docs(wiki): backfill Phase 17.2 fix series + Phase 18.0 Branch Exam Rooms cycle
882fb35 feat(phase-18-0/follow-up): drop "ไม่มีนัดหมายวันนี้" empty-state — always render grid
f87b290 docs(agents): V15 #20 deploy complete — AppointmentTab master-rooms-only fix LIVE
bdd917e fix(phase-18-0/follow-up): AppointmentTab columns = master rooms ONLY
00887ba docs(agents): V15 #19 deploy complete — Phase 17.2 + 18.0 LIVE in prod
e5f2171 docs(agents): EOD 2026-05-05 — Phase 17.2 trilogy + 17.2-bis/ter/quinquies/sexies/septies/octies + Phase 18.0
c5609c9 feat(phase-18-0/task-10): Rule I full-flow simulate + source-grep regression bank
b3c2f74 feat(phase-18-0/task-9): seed exam rooms migration script
978b90e feat(phase-18-0/task-8): DepositPanel deposit→appt writes both roomId + roomName
ef81f49 feat(phase-18-0/task-7): appointmentRoomColumns helper + AppointmentTab grid columns
2b96f04 feat(phase-18-0/task-6): AppointmentFormModal sources rooms from be_exam_rooms
6a29908 feat(phase-18-0/task-5): permission + nav + dashboard + rules wiring
5aa7e00 feat(phase-18-0/task-4): ExamRoomFormModal + ExamRoomsTab UI
9870538 feat(phase-18-0/task-3): scopedDataLayer re-exports + branch-collection coverage
46102ed feat(phase-18-0/task-2): backendClient exam-room CRUD + branchId stamping
c08fc14 feat(phase-18-0/task-1): examRoomValidation pure helpers
c248c67 fix(phase-17-2-octies): isCourseUsableInTreatment shape-aware + cross-branch course-use tests
c2663c1 docs(phase-17-2-octies): isCourseUsableInTreatment shape-aware spec
9046dcf fix(phase-17-2-septies): TFP reader field-name + branch indicator banner
73771d9 fix(phase-17-2-sexies): internal-leak audit follow-up — 3 backendClient fixes + 2 cross-tier annotations
c76e953 fix(phase-17-2-quinquies): TFP modal data caches leak across branches
2b106c3 docs(phase-18-0): branch exam rooms implementation plan
3cba005 docs(phase-18-0): branch exam rooms design spec
```

## Files touched (top-level — names only)

**Phase 17.2-x** (4 commits): src/components/TreatmentFormPage.jsx · src/lib/treatmentBuyHelpers.js · src/lib/backendClient.js (5 internal sites) · 4 NEW test files

**Phase 18.0** (10 task commits): NEW src/lib/{examRoomValidation,appointmentRoomColumns}.js · NEW src/components/backend/{ExamRoomsTab,ExamRoomFormModal}.jsx · NEW scripts/phase-18-0-seed-exam-rooms.mjs · src/lib/{backendClient,scopedDataLayer,permissionGroupValidation,tabPermissions}.js · src/components/backend/{AppointmentFormModal,AppointmentTab,DepositPanel,nav/navConfig}.{jsx,js} · src/pages/BackendDashboard.jsx · firestore.rules · 6 NEW test files + 4 stale rebases

**Phase 18.0 follow-ups** (2 commits): src/components/backend/AppointmentTab.jsx (drop allKnownRooms + drop empty-state JSX)

**Wiki** (1 commit): wiki/{index,log,entities/treatment-form-page}.md + 6 NEW wiki pages

## Decisions (one-line each — full reasoning in commit messages + spec/plan files + v-log-archive.md)

- Phase 18.0 brainstorm Q1=A be_exam_rooms collection / Q2=B roomId+roomName denorm / Q3=C schedules unchanged / Q4=A columns=full branch list / Q5=B-soft seed+smart-backfill+confirm
- Phase 17.2-octies: helper accepts grouped shape (Array.isArray(c.products)); flat shape preserved as fallback; total>0 parity guard
- Phase 18.0 Task 7 minimal patch initially preserved `allKnownRooms` legacy localStorage cache (WRONG — V15 #20 dropped entirely per Phase 18.0 contract: master rooms ARE source of truth)
- V15 #20 follow-up: empty branches get virtual UNASSIGNED column always (so user can click-create even with 0 master rooms). Empty-state "ไม่มีนัดหมายวันนี้" JSX block deleted (`882fb35`)
- Wiki backfill consolidated cycle into 6 pages — branch-exam-rooms feature, runtime-fallback-orphan-room pattern, V12 shape-drift bug class (distilled from V12 + Phase 17.2-quinquies/septies/octies recurrences)
- Wiki schema rule "V-entries are NOT sources" preserved; V-entries continue to live in v-log-archive.md
- TFP entity page extended with Phase 17.2 fix series section above History; cross-link to v12-shape-drift concept

## Migration applied to prod data

```
be_admin_audit/phase-18-0-seed-exam-rooms-1777978075511-15c426ec-c1f3-4d68-bd51-b08c5679de19
  3 writes (1 batch):
  - 3 NEW be_exam_rooms docs at นครราชสีมา (BR-1777873556815-26df6480):
    - EXR-1777978075393-4b27639d "ห้องแพทย์/ห้องผ่าตัด" sortOrder=0
    - EXR-1777978075393-02d92c65 "ห้องช็อคเวฟ" sortOrder=1
    - EXR-1777978075393-f4f88b19 "ห้องดริป" sortOrder=2
  0 appt backfills (none of 27 existing appts had roomName matching seeded names)
```

Idempotent: re-running script finds 0 new ops (verified post-apply).

## V15 deploys this session

| # | SHA | Focus | Probe |
|---|---|---|---|
| #19 | `e5f2171` | Phase 17.2 quinquies/sexies/septies/octies + Phase 18.0 Tasks 1-10 + firestore.rules v26 (be_exam_rooms match block) | 6/6 + 6/6 + 4/4 ✓ |
| #20 | `bdd917e` | AppointmentTab master-rooms-only follow-up (drop legacy localStorage cache) | 6/6 + 6/6 + 4/4 ✓ |

`be_exam_rooms` unauth POST → 403 verified post-V15 #19 (rule active).

## Next Todo

- 🟢 V15 #21 deploy (`882fb35` empty-state removal — small UX fix; awaits explicit "deploy" THIS turn per V18)
- Browser smoke in user's actual prod browser: ExamRoomsTab navigable + AppointmentTab columns + TFP branch indicator banner visible
- Future deferred: SaleTab field-name audit (post-Phase-17.2-septies — same pattern) · full AppointmentTab roomId migration (openCreate handlers + occupied detection + apptMap keying) · LineSettings พระราม 3 per-branch redesign · Hard-gate Firebase custom claim · /audit-all readiness · 🚨 H-bis ProClinic strip pre-launch (MasterDataTab + brokerClient + cookie-relay/ + dev-only api/proclinic/* + CloneTab)

## Resume Prompt

See `SESSION_HANDOFF.md` Resume Prompt block.
