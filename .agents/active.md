---
updated_at: "2026-04-26 (session 6 — V23 hotfix: anon patient submit on opd_sessions DEPLOYED)"
status: "Production at 0a0b9f5 LIVE. V23 hotfix DEPLOYED (vercel + firestore:rules). 5-endpoint Probe-Deploy-Probe extended permanently. Anon QR/link patient submit now works (was PERMISSION_DENIED for entire project history since 2026-03-23)."
current_focus: "Idle. V23 closed end-to-end. Production verified working for anon-auth patient form submit + dashboard course-refresh."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "0a0b9f5"
tests: "~5239 vitest (5190 + 49 V23 — A1-A5 source-grep + R7 writer-side + V23-lock e2e)"
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "0a0b9f5 (2026-04-26 V15 combined deploy V23 hotfix). Pre-probe baseline 200/200/200/200; pre-V23 anon UPDATE 403 (bug confirmed); post-deploy 5 probes 200/200/200/200/200 (V23 LIVE). Production HTTP 200 on backend + 2 public-link routes. Cleanup OK on pc_appointments + proclinic_session* probe fields."
firestore_rules_deployed: "v11 (V23: opd_sessions update narrowed — isClinicStaff() OR (isSignedIn() AND hasOnly([11-field whitelist])); mirrors V19 pattern)"
bundle: "BackendDashboard ~925 KB unchanged"
---

# Active Context

## Objective

Resume from session 5 EOD. User authorized P0 hotfix (V23):
- "ตอนนี้กดส่งข้อมูลคนไข้ผ่านลิ้งหรือ QR code แล้วขึ้นผิดพลาดตลอดส่งไม่ได้"
- "เช็คให้หมดทั้ง frontend แบบ 100% จริงๆ ว่าจะไม่มีบั๊คแบบนี้หรือใกล้เคียงกับแบบนี้อีกแล้ว"
- "ทำเสร็จ test แล้ว deploy เลย เพราะใช้จริงอยู่"

V23 SHIPPED + DEPLOYED end-to-end this session.

## V23 fix summary (commit 0a0b9f5)

Root cause (live since 2026-03-23 initial commit `554506b` — entire project
history): firestore.rules opd_sessions had `allow update: if isClinicStaff()`.
Patients reach the form via signInAnonymously (App.jsx:89) — anon users
have no @loverclinic.com email → isClinicStaff() = false → PERMISSION_DENIED
→ "เกิดข้อผิดพลาดของระบบ" alert.

Comprehensive 100%-frontend sweep finding: EXACTLY 3 anon-reachable
Firestore writes, all opd_sessions:
- src/pages/PatientForm.jsx:372 (visible alert — bug visible)
- src/pages/PatientDashboard.jsx:403 (silent fail — fire-and-forget)
- src/pages/PatientDashboard.jsx:410 (silent fail — console.warn caught)
Adjacent surfaces (Storage, Cloud Functions, /api/*) verified safe.

Fix: opd_sessions update narrowed to `isClinicStaff() OR (isSignedIn() AND
affectedKeys().hasOnly([11-field whitelist]))`. Mirrors V19 hasOnly pattern.

Tests added (V21-paired):
- NEW tests/firestore-rules-anon-patient-update.test.js (24 tests A1-A5)
- EXTEND tests/public-link-auth-race.test.js R7 (5 tests writer-side)
- EXTEND tests/e2e/public-links-no-auth.spec.js V23-lock (2 tests runtime)
49 tests total — all pass.

Rule B probe-list extended permanently 4 → 5 endpoints. Future rules deploys
catch this regression class automatically (.claude/rules/01-iron-clad.md).

## Live verification this session

### Pre-deploy probes (TS=1777184152 + 1777184257)
- Probes 1-4 (chat_conversations / pc_appointments / proclinic_session*):
  ALL 200 baseline ✓
- V23 anon UPDATE: 403 PERMISSION_DENIED — **bug confirmed live**

### V15 combined deploy (parallel)
- vercel --prod: deployed in 31s, aliased to lover-clinic-app.vercel.app
- firebase deploy --only firestore:rules: rules compiled + released
- Both exit code 0

### Post-deploy probes (TS=1777184370)
- Probes 1-4: ALL 200 ✓ (no regression)
- V23 anon CREATE: 200 ✓ (preserved)
- V23 anon UPDATE: 200 ✓ (**fix LIVE**)

### Cleanup
- DELETE pc_appointments test-probe x 2: 200/200 ✓
- PATCH proclinic_session* strip probe field: 200/200 ✓
- chat_conversations + opd_sessions test-probe-anon docs: blocked by rules
  (require staff for delete) — left as identifiable noise; admin can clean
  manually if desired

### Production HTTP smoke
- /admin (backend): 200 ✓
- /?session=DEP-DBGMJ7: 200 ✓
- /?patient=dkeq1b2hx7bk5138pe80: 200 ✓

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

None. V23 fix verified working in production. User-side verification:
1. Open production `?session=<id>` from incognito → fill → submit →
   should succeed without "เกิดข้อผิดพลาดของระบบ" alert
2. Open `?patient=<token>` → course refresh succeeds without silent stall

Cleanup tip (optional): admin can manually archive the
`opd_sessions/test-probe-anon-1777184257` and
`opd_sessions/test-probe-anon-1777184370` docs from the queue if they
appear as noise. They will not affect any real flow.

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
