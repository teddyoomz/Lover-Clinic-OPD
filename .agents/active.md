---
updated_at: "2026-05-05 EOD — wiki backfilled. master 2 ahead-of-prod (V15 #21 + wiki docs)"
status: "master=a89fc6a · prod=bdd917e (V15 #20 LIVE) · 2 commits ahead-of-prod · 5394 tests pass"
current_focus: "Idle — awaits V15 #21 deploy auth (882fb35 empty-state removal); wiki + active.md frozen for next session boot"
branch: "master"
last_commit: "a89fc6a"
tests: 5394
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "bdd917e"
firestore_rules_version: 26
storage_rules_version: 2
---

# Active Context

## State
- master = `a89fc6a` (wiki backfill); prod = `bdd917e` (V15 #20 LIVE 2026-05-05)
- 2 commits ahead-of-prod: `882fb35` (empty-state removal — needs V15 #21) + `a89fc6a` (wiki docs only — no deploy needed)
- 5394/5394 tests pass · build clean · firestore.rules v26

## What this session shipped
- **Phase 17.2-quinquies** (`c76e953`) — TFP cache leak across branches: BS-9 + buyItems/buyCategories + drop length>0 short-circuits + form-data SELECTED_BRANCH_ID dep
- **Phase 17.2-sexies** (`73771d9`) — internal-leak audit: `_resolveProductIdByName(name, branchId)` + `findProductGroupByName(opts)` + `saveBankAccount` isDefault mutex scoped + 2 cross-tier annotations
- **Phase 17.2-septies** (`9046dcf`) — TFP reader field-name fix (productType/productName/categoryName/mainUnitName fallback) + branch indicator banner at TFP top
- **Phase 17.2-octies** (`c248c67`) — `isCourseUsableInTreatment` shape-aware (GROUPED + FLAT); fixes asdas dasd's 3 IV Drip courses now visible
- **Phase 18.0 Tasks 1-10** (`c08fc14`→`c5609c9`) — Branch Exam Rooms feature: `be_exam_rooms` + UI tab + AppointmentFormModal/Tab/DepositPanel integration + migration script. 89 new tests
- **V15 #19 deploy** (`e5f2171`) — combined vercel + firestore:rules. 6/6 pre + 6/6 post + 4/4 cleanup. Migration `--apply` ran (3 rooms seeded for นครราชสีมา; audit doc `phase-18-0-seed-exam-rooms-1777978075511-...`)
- **Phase 18.0 follow-ups** (`bdd917e` + `882fb35`) — drop legacy `appt-rooms-seen` localStorage cache + drop "ไม่มีนัดหมายวันนี้" empty-state. V15 #20 shipped first; V15 #21 pending
- **Wiki backfill** (`a89fc6a`) — 6 NEW pages (3 entities + 3 concepts) + 1 EXTENDED entity + index/log
- Detail: `.agents/sessions/2026-05-05-phase-18-0-and-phase-17-2-fix-series.md`

## Decisions (this session — one-line each)
- Phase 18.0 Q1=A be_exam_rooms collection; Q2=B roomId+roomName denorm; Q3=C schedules unchanged; Q4=A columns=full branch list; Q5=B-soft seed+smart-backfill+confirm
- Phase 17.2-octies: helper accepts grouped shape; flat shape preserved; total>0 parity guard
- Phase 18.0 Task 7 minimal patch initially preserved `allKnownRooms` legacy cache (WRONG); V15 #20 dropped it entirely (correct per Phase 18.0 contract)
- V15 #20 follow-up: empty branches get virtual UNASSIGNED column (so user can click-create on rooms-less branches)
- Wiki backfill: 6 pages distill the cycle's V12 shape-drift recurrences into one canonical concept page

## Next action
Idle. Awaits V15 #21 deploy auth (`882fb35` empty-state removal — small UX fix).

## Outstanding user-triggered actions
- 🟢 V15 #21 deploy — `882fb35` empty-state removal (small; awaits "deploy" THIS turn per V18)
- Future: SaleTab field-name audit · full AppointmentTab roomId migration · LineSettings พระราม 3 · Hard-gate Firebase claim · /audit-all readiness · 🚨 H-bis ProClinic strip pre-launch
