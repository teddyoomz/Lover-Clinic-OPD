---
updated_at: "2026-05-08 EOD #9 — V55 Schedule-link modal branch-scope (BS-14) shipped"
status: "master=<v55-sha> (+4 ahead of prod) · 7735 GREEN · build clean · NOT yet deployed"
branch: "master"
last_commit: "fix(V55/BS-14): schedule-link modal data sources branch-scoped"
tests: 7735
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef580a6"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<v55-sha>` · prod = `ef580a6` (4 commits ahead — V52 + V53 + V54 + V55)
- Invariant set: AV1-AV29 + **BS-1..BS-14** (NEW today: BS-11/BS-12/BS-13/BS-14) + CB-1..5
- Iron-clad rules locked: systematic-debugging Phase 1-4 + Rule P 7-step + Rule J HARD-GATE + Rule N targeted-only

## What this session shipped (4 V-entries — autonomous overnight + morning)
- **V52 / BS-11** (`4df1347`) — Report tabs branch-scope: 13 report sub-tabs respect top-right BranchSelector + 2 EXEMPTED (expense + clinic) + ReportsHomeTab nav-only. +211 tests.
- **V53 / BS-12** (`dd7f473`) — Per-branch open hours filter time-axis: 4 victim surfaces (AppointmentCalendarView + AppointmentFormModal + ScheduleEntryFormModal + DepositPanel). 3 helpers in scheduleFilterUtils.js. Bangkok-TZ-stable midday-UTC parse. +88 tests.
- **V54 / BS-13** (`eee8003`) — Raw appointment listeners safe-by-default: AdminDashboard `/admin` queue calendar pre-V54 leaked all branches' appts. 4 fns in backendClient.js mirror `listenToScheduleByDay` template. +31 tests + 4 V21-class test fixups.
- **V55 / BS-14** (NEW) — Schedule-link modal branch-scope: Bug A (filter livePractitioners by branch) + Bug B (rooms via listExamRooms({branchId,status:'ใช้งาน'}) → branchExamRooms) + Bug C (12 hours sites use per-branch helpers monFriOpen/Close + satSunOpen/Close via useEffectiveClinicSettings) + defensive reset of schedSelectedDoctor/Room on branch switch + explicit branchId on pre-create getAppointmentsByMonth. +65 tests (38 helper + 17 flow-simulate + 10 BS-14 audit). Real-data layer × admin-mask layer architecture honored (real per-branch data filtered through schedClosedDays/schedManualBlocked admin override per Phase 22.0c).
- Detail: `.agents/sessions/2026-05-08-v52-v53-v54-branch-scope-trilogy.md` + V55 entry below

## Next action
Idle — awaiting user wake-up + (optional) deploy authorization for combined V52+V53+V54+V55.

## Outstanding user-triggered actions
- 🚨 `vercel --prod` (V18 — explicit "deploy" THIS turn). 4 commits ahead of prod.
- (Optional) visual verify: open AdminDashboard `/admin` → "สร้างลิงก์ตาราง" modal → switch branch → verify doctor + room dropdowns refresh; saved schedule-link doc carries per-branch hours.

## Institutional memory anchors
- V55 / BS-14 — schedule-link modal data sources branch-scoped (real-data per branch + admin-mask layer for "fake-busy" via schedClosedDays/schedManualBlocked).
- V54 / BS-13 — raw listener safe-by-default (architectural backstop; anchor on `resolveSelectedBranchId` reference, not comment).
- V53 / BS-12 — time-axis branch-aware (TIME_SLOTS readers must derive via `getVisibleTimeSlotsForDate`).
- V52 / BS-11 — report-tab branch-refresh (reportsLoaders consumers must subscribe `useSelectedBranch`).
- V50 Phase 3 — cross-branch booking contract verified; `be_customers.branchId` immutable post-CREATE.
- V50-followup-2 — full ProClinic strip COMPLETE.
