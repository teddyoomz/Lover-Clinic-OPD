---
updated_at: "2026-05-08 EOD #14 — V61 schedule-link modal room dropdown driven by be_staff_schedules (AV33)"
status: "master=<HEAD> (+29 ahead of prod) · 7992 + 1 skipped GREEN · build clean · NOT yet deployed"
branch: "master"
last_commit: "feat(V61/AV33): schedule-link modal room dropdown derived from be_staff_schedules canonical source"
tests: 7992
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef580a6"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<HEAD>` · prod = `ef580a6` (29 commits ahead — V52..V60 + V61)
- Invariant set: AV1-AV30 + **AV32** + **AV33** + **BS-1..BS-15** + CB-1..5 (AV31 still pending in SKILL.md from V58 — separate cleanup)
- Iron-clad rules locked: systematic-debugging Phase 1-4 + Rule P 7-step + Rule J HARD-GATE (brainstorming spec written + approved) + Rule N targeted-only + Rule M two-phase data ops + Rule K work-first/test-last

## What this session shipped (10 V-entries — overnight → morning → afternoon → evening → late evening → late late evening)
- **V61 / AV33** (`<HEAD>`) — Schedule-link modal room dropdown driven by `be_staff_schedules` canonical source (replaces pre-V61 V57 `r.role` static kind filter). User reported (with screenshot): พบแพทย์ mode should show only rooms the selected doctor enters in window; ไม่พบแพทย์ mode should show only rooms NO doctor enters. Brainstormed Q1-Q4 with user (B refined / A / B / A); spec at `docs/superpowers/specs/2026-05-08-v61-schedule-link-room-dropdown-from-schedules-design.md`. NEW pure helpers `deriveDoctorRoomIdsForWindow` + `deriveNonDoctorRoomIdsForWindow` in `staffScheduleValidation.js`. Modal: useEffect extension for branch-wide fetch + `v61EligibleRoomIds` useMemo + dropdown JSX + defensive reset + pre-flight gate (3 Thai-copy variants) + empty-state banner (`data-testid="v61-room-empty-state"`). Save: `selectedRoomIds: string[]` snapshot field on saved doc (V61 NEW; legacy `selectedRoomId` preserved for backward compat). `shouldBlockScheduleSlot` extended to accept array — prefers when present + non-empty. Resync: `updateActiveSchedules` detects "ทุกห้อง" V61 saved docs and recomputes union from current `be_staff_schedules`; specific-pick docs preserved. AV33 invariant locks the contract. +83 V61 tests + 2 V21-class fixups (V55.L7.2 + V59.P1.5). 7909 → 7992. Live preview_eval: V60-fixed link still renders 14 fire days (backward-compat preserved).
- **V60 / AV32** (`6af477a`) — Schedule-link doctorDays derived from be_staff_schedules canonical source. User reported customer-facing link `SCH-2f69d853fb` had every May 2026 calendar cell disabled (admin painted only March/April manual paint, never advanced UI to paint May; pre-V60 save dumped `[...schedDoctorDays]` verbatim). Multi-layer fix: (1) NEW `derivedDoctorDaysFromSchedules` pure helper in `staffScheduleValidation.js`; (2) `handleGenScheduleLink` derives from canonical + UNIONs with manual-scoped-to-months + pre-flight gate + Thai toast; (3) `ClinicSchedule.jsx` empty-state banner (defense in depth); (4) Rule M two-phase data fix migration backfilled SCH-2f69d853fb → 18 May days; (5) AV32 invariant. +48 tests (7861 → 7909). Live preview_eval verified customer click on May 9 opens slot panel with 9 slots.
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
Idle — awaiting user authorization for combined deploy (V52..V60 + V61 = 29 commits ahead of prod).

## Outstanding user-triggered actions
- 🚨 `vercel --prod` (V18 — explicit "deploy" THIS turn). 29 commits ahead of prod (V52+V53+V54+V55+V56+V57+V58+V59-bis+V60+V61).
- (Optional) admin re-generate any other in-the-wild schedule links that may have the same shape bug. Use `scripts/v60-fix-schedule-link-doctor-days.mjs <TOKEN> --apply` for one-off backfill.
- (Optional) visual verify: refresh page → schedule-link modal post-V61: pick doctor → room dropdown narrows to doctor's rooms; toggle ไม่พบแพทย์ → dropdown shows non-doctor rooms; empty state banner fires when zero rooms qualify; SCH-2f69d853fb still works (V60 backward-compat).

## Institutional memory anchors
- V61 / AV33 — schedule-link modal room dropdown MUST derive from canonical `be_staff_schedules` data (NOT V57 `r.role` static kind filter). Helpers: `deriveDoctorRoomIdsForWindow` + `deriveNonDoctorRoomIdsForWindow` in `staffScheduleValidation.js`. Saved doc shape: `selectedRoomIds: string[]` array (V61) + `selectedRoomId: string` legacy. `shouldBlockScheduleSlot` prefers array. Resync recomputes "ทุกห้อง" snapshot. Q1=B refined / Q2=A / Q3=B / Q4=A locked.
- V60 / AV32 — schedule-link `doctorDays` (per-date set in customer-facing world-readable doc) MUST derive from canonical Firestore source (`be_staff_schedules`) for the doc's months window — verbatim spread of admin-state Set forbidden. Pre-flight gate when `noDoctorRequired=false` AND any month has zero doctor days. Customer-side empty-state banner for legacy in-the-wild links. Rule M data fix template: `scripts/v60-fix-schedule-link-doctor-days.mjs`.
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
