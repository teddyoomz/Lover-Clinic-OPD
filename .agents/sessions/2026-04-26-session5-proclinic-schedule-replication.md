# 2026-04-26 (session 5) — Phase 13.2.6-13.2.16 ProClinic schedule replication + V15 combined deploy COMPLETE

## Summary

12 commits shipped + V15 combined deploy (vercel + firebase rules) to
production at `9169363`. ProClinic `/admin/schedule/{doctor,employee}`
+ `/admin/appointment` "แพทย์เข้าตรวจ N คน" panel replicated 1:1 with
multi-staff calendar (color-hash chips per user_id), 3-section sidebar,
recurring weekly + per-date override + leave model. Full sync chain
shipped: ProClinic `/admin/api/schedule/today` → `master_data/staff_schedules/items/*`
→ `migrateMasterStaffSchedulesToBe` → `be_staff_schedules` → 7 UI consumers
all reactive via `listenToScheduleByDay`. V22 logged for the user-flagged
"calendar-was-filtered-to-selected-staff" correction (sidebar-only filter
is the right scope; calendar is everyone). 234 new schedule-domain tests
across SR/DST/EST/MS/TDP/AFC/SC/MM/SD; 105 deleted obsolete list-view
tests; net `~5190 vitest passing`.

## Current State

- **Branch**: `master`
- **HEAD**: `59f7ddc docs(handoff): mark V15 combined deploy COMPLETE`
- **Production**: `9169363` aliased at https://lover-clinic-app.vercel.app
- **Tests**: ~5190 vitest passing (no E2E delta this session)
- **Build**: clean. BackendDashboard chunk ~925 KB
- **firestore:rules**: live at v10 (idempotent fire — "latest version
  already up to date, skipping upload"); pre+post probes 200/200/200/200
- **SCHEMA_VERSION**: 15
- **Pending deploy**: `59f7ddc` (1 commit ahead — docs-only,
  no production impact, no re-deploy needed)

## What shipped (12 commits)

| # | Commit | Phase | Tests | What |
|---|---|---|---|---|
| 1 | `3bf9f31` | 13.2.6 | 44 SR | schema: 'recurring' type + dayOfWeek + mergeSchedulesForDate + getActiveSchedulesForDate + listenToScheduleByDay; collision rewire |
| 2 | `7ff124d` | 13.2.7 | 29 DST | DoctorSchedulesTab calendar + scheduling/MonthCalendarGrid + ScheduleSidebarPanel + ScheduleEntryFormModal |
| 3 | `5b2d4cb` | 13.2.8 | 25 EST | EmployeeSchedulesTab (parallel structure for staff) |
| 4 | `b2e31bc` | 13.2.9 | 21 TDP | TodaysDoctorsPanel schedule-derived (NOT appointment) — fixes V21-class missing-doctors bug |
| 5 | `e192b0c` | 13.2.10 | 15 AFC | AppointmentFormModal collision honors recurring + override-wins |
| 6 | `e574897` | 13.2.7-bis | 20 MS | **V22 HOTFIX**: calendar shows ALL staff (not filtered); chip text = "HH:MM-HH:MM <name>"; per-staff color hash; V21-anti name-as-text guard |
| 7 | `326ef6c` | 13.2.13 | 27 SC | ProClinic sync: api/proclinic/master action=syncSchedules + brokerClient.syncSchedules + MasterDataTab "ตารางหมอ + พนักงาน" sync button |
| 8 | `a7bf674` | 13.2.14 | 23 MM | migrateMasterStaffSchedulesToBe FK-resolves + orphan reporting + MasterDataTab MIGRATE_TARGETS |
| 9 | `14f4feb` | 13.2.15 | 30 SD | synced-data wiring E2E pure pipeline simulator + LIVE preview_eval verifying all 5 consumer paths |
| 10 | `0c4a90d` | 13.2.16 | -105 | legacy StaffSchedulesTab.jsx + 105 list-view RTL tests deleted; 4 references updated |
| 11 | `9169363` | docs | – | session 5 handoff + V22 entry in 00-session-start.md |
| 12 | `59f7ddc` | docs | – | mark V15 combined deploy COMPLETE |

## V15 combined deploy verification (this session, EOD)

- **Pre-probe** (TS=1777182256): chat_conversations 200 + pc_appointments
  200 + proclinic_session 200 + proclinic_session_trial 200 ✓
- **vercel --prod --yes**: deployed in 34s, aliased to lover-clinic-app.vercel.app
- **firebase deploy --only firestore:rules**: idempotent fire ("latest
  version already up to date, skipping upload")
- **Post-probe** (TS=1777182323): 200/200/200/200 ✓
- **Cleanup**: 4/4 OK (pc_appointments DELETE x 2 + proclinic_session*
  probe-field strip)
- **Production HTTP smoke**: backend / public-session / public-patient
  all HTTP 200 ✓

## Decisions (non-obvious — preserve reasoning)

### D1 — Calendar shows ALL staff, sidebar shows ONE (V22)
User caught Phase 13.2.7+13.2.8 had the calendar filtered to selectedStaffId.
ProClinic shows ALL staff stacked per cell with color-hash chips
(one per user_id); the right-rail sidebar (3 sections — recurring,
override, leave) is the per-staff scope. Triangle screenshots Phase 0
were correct; I misinterpreted "ตารางแพทย์ tab + sidebar selector → must
be per-selected filter". The selector drives the sidebar ONLY.

### D2 — Chip label format = "HH:MM-HH:MM <name>" verbatim
ProClinic's title field is structured exactly this way ("08:30-12:00 นาสาว เอ").
Initial chip rendered only "HH:MM-HH:MM" — pixel-different from reference.
V22 hotfix added name; resolveStaffName fallback chain (staffMap → entry.staffName → '?')
prevents numeric user_id from EVER leaking as visible text.

### D3 — Per-staff color via 10-color hash palette
ProClinic stores `backgroundColor: "#FF6A9C"` per user_id (one color
per staff). We don't sync color directly — instead deterministic hash
of staffId → palette index (pink/cyan/orange/violet/lime/yellow/teal/
fuchsia/indigo/rose). Same staff gets the same color across reloads.
SAME ID across reload = SAME color (deterministic).

### D4 — Multi-source migrator with orphan reporting
Schedule entries reference user_ids from BOTH `be_doctors` AND `be_staff`.
Migrator pre-loads both Maps + tries doctor first (precedence — schedule
API is primarily doctor-feed). Orphans (no match in either) reported
in result.orphans[] instead of crashed. User runs Doctors/Staff sync
first, then re-runs schedule migrate.

### D5 — 7 wiring points verified end-to-end
The "100% wiring" requirement (user explicit ask) is met by:
1. DoctorSchedulesTab calendar
2. EmployeeSchedulesTab calendar
3. TodaysDoctorsPanel
4. AppointmentFormModal collision check
5. AppointmentTab subtitle "แพทย์เข้าตรวจ N คน"
6. MasterDataTab sync button (writes master_data)
7. MasterDataTab migrate button (writes be_staff_schedules)

Each verified via 30 SD tests (pure pipeline simulator chains all 7) +
LIVE preview_eval against real Firestore (5 consumer paths probed).

### D6 — Legacy list-view StaffSchedulesTab deleted
The list-view component was kept during the cutover (Phase 13.2.7-13.2.15)
as a back-compat safety net. After Phase K verified the new pipeline
end-to-end, deletion is safe. -105 obsolete RTL tests; calendar UI is
covered by 234 new schedule-domain tests across the new architecture.

## V-entries logged this session

### V22 — Schedule calendar wrongly filtered to selected staff + chip text leak risk
Logged in `.claude/rules/00-session-start.md` § 2. Lessons:
- **Multi-instance render must have multi-instance test fixtures**.
  A test that passes 1 entry + asserts time format is FALSE confidence.
- **Screenshots aren't enough — count entries per cell**. Phase 0
  audit should check "given N entries, expect N chips".
- **Chip label format is part of the fidelity contract**.

## Files Touched (this session — heavy)

### NEW (10 files)
- `src/components/backend/DoctorSchedulesTab.jsx`
- `src/components/backend/EmployeeSchedulesTab.jsx`
- `src/components/backend/scheduling/MonthCalendarGrid.jsx`
- `src/components/backend/scheduling/ScheduleSidebarPanel.jsx`
- `src/components/backend/scheduling/ScheduleEntryFormModal.jsx`
- `src/components/backend/scheduling/TodaysDoctorsPanel.jsx`

### NEW tests (9 files)
- `tests/staff-schedule-recurring.test.js` (44 SR)
- `tests/doctor-schedules-tab.test.jsx` (29 DST)
- `tests/employee-schedules-tab.test.jsx` (25 EST)
- `tests/schedule-calendar-multi-staff.test.jsx` (20 MS)
- `tests/todays-doctors-panel.test.jsx` (21 TDP)
- `tests/appointment-form-modal-recurring-collision.test.js` (15 AFC)
- `tests/proclinic-schedule-sync.test.js` (27 SC)
- `tests/migrate-master-staff-schedules.test.js` (23 MM)
- `tests/schedule-synced-data-wiring.test.js` (30 SD)

### Modified (heavy)
- `src/lib/staffScheduleValidation.js` — recurring + dayOfWeek + helpers
- `src/lib/backendClient.js` — getActiveSchedulesForDate +
  listenToScheduleByDay + migrateMasterStaffSchedulesToBe +
  mapMasterToBeStaffSchedule
- `src/lib/brokerClient.js` — syncSchedules wrapper
- `api/proclinic/master.js` — handleSyncSchedules + mapProClinicScheduleEvent
- `src/components/backend/AppointmentTab.jsx` — TodaysDoctorsPanel mount +
  schedule-derived subtitle
- `src/components/backend/AppointmentFormModal.jsx` — collision recurring-aware
- `src/components/backend/MasterDataTab.jsx` — sync + migrate buttons
- `src/components/backend/nav/navConfig.js` — doctor-schedules entry +
  staff-schedules label trim
- `src/lib/tabPermissions.js` — split doctor vs staff schedule perms
- `src/pages/BackendDashboard.jsx` — lazy-imports + routing
- `tests/staffScheduleValidation.test.js` — SV6 + SV26 updated for new
  TYPE_OPTIONS shape
- `tests/staffSchedulesNavWiring.test.js` — label change accepted
- `tests/audit-2026-04-26-code-split.test.js` — LAZY_TABS list updated
- `tests/branch-collection-coverage.test.js` — be_staff_schedules
  source attribution updated
- `.claude/rules/00-session-start.md` — V22 entry added
- `SESSION_HANDOFF.md` + `.agents/active.md` — refreshed twice (mid +
  end)

### Deleted
- `src/components/backend/StaffSchedulesTab.jsx` (legacy list view)
- `tests/staffSchedulesUi.test.jsx` (105 list-view RTL tests)

## Blockers

None. Production deployed + verified.

## Iron-clad rules invoked

- **A** revert: not invoked — no rollbacks needed
- **B** Probe-Deploy-Probe: ran 1× for V15 combined deploy of `9169363`;
  pre + post probes 200/200/200/200; 4-endpoint cleanup OK
- **C1** Rule of 3: scheduling/* shared between Doctor + Employee tabs
  (2 consumers; 3rd reuse trigger if Holiday calendar tab added)
- **C2** Security: no new uid-public exposure; @dev-only markers on
  sync infra; V21-anti name-as-text guard
- **D** Continuous improvement: every fix shipped with adversarial
  tests (~234 new tests + V22 entry)
- **E** Backend Firestore-only: ✓ schedule entries stay 100% in
  be_staff_schedules; no broker write-back
- **F** Triangle Rule: 3 ProClinic screenshots + opd.js network/intel
  captured BEFORE code (Phase 0). User-flagged V22 correction loop
  closed by re-reading screenshots more carefully
- **F-bis** Behaviour capture: ✓ verified ProClinic data-source via
  Phase 0 agent + Phase K live preview_eval
- **G** Dynamic capability: opd.js sync via existing pattern
- **H** Data ownership: schedules are OURS in be_staff_schedules;
  ProClinic /admin/api/schedule/today is reference + initial-seed only
- **H-bis** Sync = DEV-ONLY: api/proclinic/* + brokerClient sync helpers
  + MasterDataTab buttons all marked @dev-only; production-strip ready
- **I** Full-flow simulate: SD test bank chains every consumer (Phase K
  is the gold-standard verification for schedule); preview_eval
  end-to-end on real Firestore

## Next todo (ranked by priority + risk)

### P0 (none — production stable)

### P1 (next session if user wants polish)
1. **Sync flow exercise** — user clicks "ดูดตารางหมอ + พนักงาน"
   button in production MasterDataTab → verify ProClinic data flows
   into master_data, then "นำเข้า → be_staff_schedules" → verify
   DoctorSchedulesTab + AppointmentTab show real data
2. **Permission group customization** — 5 default groups
   (gp-owner / gp-manager / gp-frontdesk / gp-nurse / gp-doctor)
   shipped Phase 13.5; user can edit names/permissions in
   PermissionGroupsTab
3. **DocumentPrintModal DOMPurify** — XSS hardening shipped Phase 13.5;
   monitor for any template-injection regressions

### P2 (defer until next pre-launch sweep)
- TFP 3200 LOC refactor — split into 7-8 sub-components (XL effort)
- Phase 13.5.4 hard-gate via firestore.rules + custom claims
- Phase 14.4 G5 customer-product-change (NOT STARTED)
- Phase 15 Central Stock Conditional (skip if single-branch)

### P3 (out of scope)
- Sync flow MIGHT need branchId field if user runs in multi-branch
  environment; current sync drops branchId='' which causes default-branch
  fallback. Reconsider if user reports cross-branch issues.

## Resume Prompt (paste into next chat)

```
Resume LoverClinic OPD — continue from 2026-04-26 end-of-session 5.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (cross-session state of truth — master = 59f7ddc, prod = 9169363)
3. .agents/active.md (hot state — production LIVE, master 1 commit ahead with deploy-completion docs only)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V22)
5. .agents/sessions/2026-04-26-session5-proclinic-schedule-replication.md (this session detail — 12 commits)

Status summary:
- master = 59f7ddc, ~5190 vitest passing
- Production: 9169363 LIVE — V15 combined deploy 2026-04-26 EOD (vercel + firestore:rules; pre+post probes 200/200/200/200)
- master 1 commit ahead with deploy-completion docs only — no production code change → no re-deploy needed
- Phase 13.2.6-13.2.16 ProClinic schedule replication + sync chain SHIPPED end-to-end
  - Calendar UI shows ALL staff stacked (V22 HOTFIX); chip text = "HH:MM-HH:MM <name>" with V21-anti name-as-text guard
  - TodaysDoctorsPanel schedule-derived (not appointment)
  - AppointmentFormModal collision honors recurring + override
  - ProClinic sync via MasterDataTab "ตารางหมอ + พนักงาน" → master_data → migrate → be_staff_schedules → 7 UI consumers
- 234 new schedule-domain tests; 105 deleted obsolete list-view tests

Next action (when user gives go-ahead):
- If user wants to exercise sync: click MasterDataTab "ดูดตารางหมอ + พนักงาน" → "นำเข้า → be_staff_schedules" → verify DoctorSchedulesTab + AppointmentTab show real data
- If user wants to customize permission groups: edit via PermissionGroupsTab + assign staff via StaffFormModal
- If user wants Phase 15 Central Stock: skip if single-branch; otherwise plan multi-branch infrastructure
- If user wants Phase 13.5.4 hard-gate: server-side firebase custom claims + firestore.rules narrowing (deferred from session 4)

Outstanding user-triggered actions (NOT auto-run):
- None code-side. Production deployed + verified.

Rules:
- No deploy unless user explicitly says "deploy" THIS turn (V4/V7/V18)
- V15 combined: "deploy" = vercel + firestore:rules in parallel
- Probe-Deploy-Probe with /artifacts/{appId}/public/data prefix (V1/V9/V19)
- Multi-branch decision is locked at Option 1 (V20)
- be_stock_movements update narrowed to reversedByMovementId only (V19)
- V21 lesson: source-grep tests can encode broken behavior — pair with runtime
- V22 lesson: multi-instance render must have multi-instance test fixtures
- Every bug → test + audit invariant + V-entry (Rule D + Rule I)
- Triangle Rule F-bis: read screenshots carefully — selector ≠ filter (V22)

Invoke /session-start to boot context.
```
