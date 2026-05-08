---
updated_at: "2026-05-08 EOD #12 — V57+V58+V59-bis trilogy + black-screen revert recovery"
status: "master=<HEAD> (+27 ahead of prod) · 7861 + 1 skipped GREEN · build clean · NOT yet deployed"
branch: "master"
last_commit: "fix(test): A5.2 regex window 3000→6000 for grown fetchDepositOptions + state files"
tests: 7861
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef580a6"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `92e0cf9` · prod = `ef580a6` (19 commits ahead — V52 + V53 + V54 + V55 + V56)
- Invariant set: AV1-AV29 + **BS-1..BS-15** (NEW this session: BS-11/BS-12/BS-13/BS-14/BS-15) + CB-1..5
- Iron-clad rules locked: systematic-debugging Phase 1-4 + Rule P 7-step + Rule J HARD-GATE + Rule N targeted-only

## What this session shipped (8 V-entries — overnight → morning → afternoon → evening)
- **V58 / AV31** (`41abd19`) — Doctor picker `Number()` coercion. `Number("DOC-...")` → NaN → snap-back to "all doctors". 1-line fix: `setSchedSelectedDoctor(e.target.value || null)`. AV31 invariant + 11 tests.
- **V59-bis** (`7ae231e`) — V56 auto-closure inline preview (3 color-coded states). Original V59 (`51929f1`) crashed frontend via Temporal Dead Zone (useMemo deps referenced later-declared vars → ReferenceError → black screen). Reverted in `05e210f` per Rule A. Re-applied with hooks placed AFTER deps. 22 tests.
- **V57 / AV30** (`103e9da`) — Exam Room Kind Schema Completion: user reported "ไม่มีห้องตรวจได้ยังไง?" — V56 modal showed empty-state placeholder despite 6 doctor-rooms in prod. Root cause: Phase 18.0 schema-vs-consumer drift (kind field never declared in examRoomValidation.js + ExamRoomFormModal had no picker, but V55 mapper + V56 consumers all filtered `r.kind === 'doctor'` strictly). Multi-layer fix (Approach A): schema (KIND_OPTIONS + emptyForm default + validate enum + normalize coerce) + UI (radio picker ห้องแพทย์/ห้องหัตถการทั่วไป) + 5 consumer defensive defaults `(r.kind ?? 'doctor') === 'doctor'` + Rule M backfill (6 prod rooms stamped kind:'doctor', idempotent, audit doc emit) + AV30 invariant (audit-anti-vibe-code AV29 → AV30). +26 tests (V57.K1-K5).
- **V56 / BS-15** (`92e0cf9`) — Doctor Schedule Room Assignment: per-shift `roomIds: string[]` on `be_staff_schedules`; SS-10 (doctor+working→roomIds required) + SS-11 (assistant→roomIds forbidden) validators; `expandRoomIdsForDisplay` + `derivedAutoClosedDates` pure helpers; room-checkbox UI in ScheduleEntryFormModal; inline chips in TodaysDoctorsPanel; auto-closure integration in handleGenScheduleLink; BS-15 audit invariant (14→15). +11 net tests (7735→7746, 25 RTL flow-simulate). Subagent-driven Tasks 1–7.
- **V55 / BS-14** (`d54b201`) — Schedule-link modal branch-scope: Bug A (filter livePractitioners by branch) + Bug B (rooms via listExamRooms({branchId,status:'ใช้งาน'}) → branchExamRooms) + Bug C (12 hours sites use per-branch helpers monFriOpen/Close + satSunOpen/Close via useEffectiveClinicSettings) + defensive reset of schedSelectedDoctor/Room on branch switch + explicit branchId on pre-create getAppointmentsByMonth. +65 tests (38 helper + 17 flow-simulate + 10 BS-14 audit). Real-data layer × admin-mask layer architecture honored (real per-branch data filtered through schedClosedDays/schedManualBlocked admin override per Phase 22.0c).
- **V54 / BS-13** (`eee8003`) — Raw appointment listeners safe-by-default: AdminDashboard `/admin` queue calendar pre-V54 leaked all branches' appts. 4 fns in backendClient.js mirror `listenToScheduleByDay` template. +31 tests + 4 V21-class test fixups.
- **V53 / BS-12** (`dd7f473`) — Per-branch open hours filter time-axis: 4 victim surfaces (AppointmentCalendarView + AppointmentFormModal + ScheduleEntryFormModal + DepositPanel). 3 helpers in scheduleFilterUtils.js. Bangkok-TZ-stable midday-UTC parse. +88 tests.
- **V52 / BS-11** (`4df1347`) — Report tabs branch-scope: 13 report sub-tabs respect top-right BranchSelector + 2 EXEMPTED (expense + clinic) + ReportsHomeTab nav-only. +211 tests.
- Detail: `.agents/sessions/2026-05-08-v52-v53-v54-branch-scope-trilogy.md` + `.agents/sessions/2026-05-08-v57-v58-v59-bis.md`

## Next action
Idle — awaiting user authorization for combined deploy (V52+V53+V54+V55+V56+V57+V58+V59-bis = 27 commits ahead of prod).

## Outstanding user-triggered actions
- 🚨 `vercel --prod` (V18 — explicit "deploy" THIS turn). 27 commits ahead of prod (V52+V53+V54+V55+V56+V57+V58+V59-bis).
- (Optional) visual verify: refresh page → schedule-link modal: doctor dropdown sticks (V58); after picking doctor+room, inline preview banner shows green/amber/neutral (V59-bis).

## Institutional memory anchors
- V59-bis — useMemo deps referencing later-declared variables = JS Temporal Dead Zone = silent React render crash = black screen. New hooks default to landing AFTER all state/memo declarations they reference. PLACEMENT NOTE comment template in source.
- V58 / AV31 — ID-picker `<select onChange>` MUST NOT wrap `e.target.value` in `Number()` when option values are entity IDs (DOC-/ASST-/STAFF-/EXR- prefix). NaN → falsy → default revert. Class: legacy ProClinic numeric-ID assumption.
- V57 / AV30 — Schema-vs-consumer drift on optional enum fields. Phase 18.0 declared be_exam_rooms but never added `kind` field; V55+V56 consumers filtered `r.kind === 'doctor'` strict → silent exclusion. Fix: schema + UI picker + defensive `(kind ?? 'doctor')` + Rule M backfill.
- V56 / BS-15 — doctor schedule room assignment (roomIds[] per-shift; SS-10/SS-11 validators; BS-15 invariant; expandRoomIdsForDisplay + derivedAutoClosedDates helpers).
- V55 / BS-14 — schedule-link modal data sources branch-scoped (real-data per branch + admin-mask layer for "fake-busy" via schedClosedDays/schedManualBlocked).
- V54 / BS-13 — raw listener safe-by-default (architectural backstop; anchor on `resolveSelectedBranchId` reference, not comment).
- V53 / BS-12 — time-axis branch-aware (TIME_SLOTS readers must derive via `getVisibleTimeSlotsForDate`).
- V52 / BS-11 — report-tab branch-refresh (reportsLoaders consumers must subscribe `useSelectedBranch`).
- V50 Phase 3 — cross-branch booking contract verified; `be_customers.branchId` immutable post-CREATE.
- V50-followup-2 — full ProClinic strip COMPLETE.
