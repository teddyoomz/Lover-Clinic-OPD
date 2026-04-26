---
updated_at: "2026-04-26 (session 5 EOD — schedule replication + V15 combined deploy COMPLETE)"
status: "Production at 9169363 LIVE. V15 combined deploy of 11 commits done; pre+post-probe 200/200/200/200; production HTTP 200 on backend + public-link routes. Tests: ~5190 vitest passing. ProClinic schedule sync chain now LIVE."
current_focus: "Idle. Phase 13.2.6-13.2.16 ProClinic schedule replication (calendar UI + sync + migrate + 7-wiring E2E + V22 lesson) shipped + deployed end-to-end."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "9169363"
tests: "~5190 vitest"
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "9169363 (2026-04-26 EOD V15 combined deploy session 5 — 11 schedule-replication commits + 4 prior session-4 commits = 15 commits shipped). Pre+post probes 200/200/200/200. Production HTTP 200 on backend + 2 public-link routes."
firestore_rules_deployed: "v10 (be_stock_movements update narrowed in 14.7.F per V19; UNCHANGED this session — idempotent fire, no diff)"
bundle: "BackendDashboard ~925 KB after schedule replication"
---

# Active Context

## Objective

Resume from session 4 EOD. User authorized:
1. P1 polish + Phase 13.5 permission system (session 4 — already shipped)
2. Phase 13.2.6-13.2.16 ProClinic schedule replication (this session — shipped + deployed)

## What this session shipped (11 commits, all DEPLOYED)

### ProClinic schedule replication chain
- **Phase A** `3bf9f31` — schema: 'recurring' type + dayOfWeek field +
  mergeSchedulesForDate + getActiveSchedulesForDate +
  listenToScheduleByDay + checkAppointmentCollision rewire (44 SR)
- **Phase B** `7ff124d` — DoctorSchedulesTab calendar view +
  scheduling/MonthCalendarGrid + ScheduleSidebarPanel +
  ScheduleEntryFormModal (29 DST)
- **Phase C** `5b2d4cb` — EmployeeSchedulesTab calendar view (replaces
  list-view StaffSchedulesTab); reuses scheduling/* (25 EST)
- **Phase D** `b2e31bc` — TodaysDoctorsPanel schedule-derived (NOT
  appointment-derived) (21 TDP)
- **Phase E** `e192b0c` — AppointmentFormModal collision honors
  recurring shifts (drops broken date filter) (15 AFC)
- **Phase B-bis HOTFIX** `e574897` — V22: calendar shows ALL staff
  stacked (was filtered to selected); chip text "HH:MM-HH:MM <name>"
  with V21-anti name-as-text guard; per-staff color hash (20 MS)
- **Phase I** `326ef6c` — ProClinic sync: api/proclinic/master action=
  syncSchedules + brokerClient.syncSchedules + MasterDataTab "ตารางหมอ +
  พนักงาน" sync button (27 SC)
- **Phase J** `a7bf674` — migrateMasterStaffSchedulesToBe FK-resolves
  + orphan reporting + MasterDataTab MIGRATE_TARGETS entry (23 MM)
- **Phase K** `14f4feb` — synced-data wiring E2E: 30 SD pure
  pipeline-simulator tests + LIVE preview_eval verifying all 5
  consumer paths read synced data correctly
- **Phase F** `0c4a90d` — legacy StaffSchedulesTab.jsx + 105 list-view
  RTL tests deleted; 4 references updated
- **Phase H/handoff** `9169363` — V22 logged + handoff refresh

## Live verification done this session

### Pure-logic tests (Vitest)
- 234 schedule-domain new tests across SR/DST/EST/MS/TDP/AFC/SC/MM/SD
- All 4 pre-existing schedule test files updated for new schema
- 350-test sweep (all schedule + nav + perm + collision tests) passed

### Live preview_eval against real Firestore
- B-bis HOTFIX: wrote 3 recurring Sunday shifts for 3 distinct doctorIds
  → calendar cell rendered 3 chips with text names ("นาสาว An เอ" /
  "Wee 523" / etc.); cleanup OK
- Phase D: wrote 1 recurring shift → TodaysDoctorsPanel updated to
  "แพทย์เข้าตรวจ 1 คน" within 1.5s; deleted → reverted to 0
- Phase K: full pipeline simulator + 5/5 consumer paths verified on
  REAL Firestore (Tue recurring / Wed leave-override-wins / collision
  Tue OK / collision Wed blocked-ลา / Sun panel name-resolution)

### V15 combined deploy (this session, EOD)
- **Pre-probe**: chat_conversations 200 + pc_appointments 200 +
  proclinic_session 200 + proclinic_session_trial 200 ✓
- **vercel --prod --yes**: deployed in 34s, aliased to
  lover-clinic-app.vercel.app
- **firebase deploy --only firestore:rules**: idempotent fire ("latest
  version already up to date, skipping upload")
- **Post-probe**: 200/200/200/200 ✓
- **Cleanup**: 4 probe artifacts removed (pc_appointments DELETE +
  proclinic_session*.probe field strip)
- **Production HTTP smoke**: backend / public-session / public-patient
  all HTTP 200 ✓

## Outstanding user-triggered actions (NOT auto-run)

None. Production verified working. ProClinic schedule sync chain is LIVE.
User can now click MasterDataTab buttons in production to ดูด+import
real schedule data — Today's-Doctors panel, DoctorSchedulesTab calendar,
and AppointmentFormModal collision will all react via live listeners.

## Recent decisions (non-obvious — preserve reasoning)

1. **V22 multi-staff calendar correction** — user manually flagged
   that ProClinic shows ALL staff stacked per calendar cell, not
   filtered to selected. Triangle screenshots Phase 0 had it correct
   but I misinterpreted ("ตารางแพทย์" tab + sidebar selector → I
   inferred per-selected filter). The right-rail sidebar IS per-staff;
   the calendar grid is everyone. Hot-fix in `e574897` adds explicit
   multi-staff render tests + per-staff color hash + V21-anti
   name-as-text guard.

2. **Chip label format = "HH:MM-HH:MM <name>"** — ProClinic's title
   field is structured exactly this way. Initial chip showed only
   "HH:MM-HH:MM" — pixel-different from reference. Fix matches title
   format verbatim; resolveStaffName fallback chain prevents numeric
   user_id from ever leaking as visible text.

3. **Multi-source migrator with orphan reporting** (Phase J) — schedule
   entries reference user_ids from BOTH be_doctors AND be_staff. The
   migrator pre-loads both maps, tries doctor first (precedence —
   schedule API is primarily doctor-feed), then employee. Orphans
   (no match in either) reported instead of crashed; user runs
   Doctors/Staff sync first then re-imports.

4. **Calendar shows everyone, sidebar filters to one** — this is the
   correct architectural split. Calendar provides clinic-wide visual
   context; sidebar provides per-staff CRUD scope. Both Doctor and
   Employee tabs share scheduling/* components (Rule of 3 prep —
   2 consumers now, 3rd reuse trigger if Holiday calendar tab added).

5. **Sync chain dev-only** — api/proclinic/* + brokerClient + Master
   sync UI all marked @dev-only per Rule H-bis; production deploy
   strips them. Production user-flow: Doctors/Staff manually CRUD'd
   in our backend, schedule sync only used during initial seeding.

## Detail checkpoint

Each phase well-described in commit messages. No standalone
.agents/sessions/ checkpoint needed for this session — the 11 commits
self-document.
