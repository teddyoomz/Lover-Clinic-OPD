---
updated_at: "2026-05-08 EOD #7 — V53 Per-branch open hours → time-axis filter (BS-12) shipped"
status: "master=<v53-commit> (+1 ahead of prod ef580a6) · 7637/7637 + 1 skipped GREEN · build clean · NOT yet deployed"
branch: "master"
last_commit: "feat(V53/BS-12): per-branch open hours drive time-axis everywhere"
tests: 7637
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef580a6"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = V53 commit · prod = `ef580a6` (V52 + V53 NOT yet deployed; user authorizes separately)
- Iron-clad **Rule J brainstorming HARD-GATE** + **Rule P 7-step class-of-bug expansion** — both honored
- Invariant set: AV1-AV29 + **BS-1..BS-12** (NEW: BS-12 time-axis branch-aware) + CB-1..5
- AV28 sanctioned-exception list still EMPTY (no `master_data` runtime references)
- Rule H-bis EXECUTED + COMPLETE (V50 + V50-followup + V50-followup-2)

## What EOD #7 shipped (autonomous overnight job continuation)
**User directive (verbatim)**: "ทำให้เวลาเปิด-ปิดของแต่ละสาขา มีผลกับตารางแพทย์ ตารางนัดหมาย และ modal ที่จะไปดึงเวลานัดจากสาขานั้นทั้งหมด ... แค่เวลาที่เปิดเปิดคลินิก ไม่ต้องแสดงตั้งแต่ 8 โมง ถึง 4 ทุ่ม ถ้าคลินิกมันเปิดแค่ 11 โมง ถึง 3 ทุ่ม"

**Class-of-bug**: parallel to V52 BS-11 — V51 shipped per-branch openHours schema but the canonical TIME_SLOTS time-axis (08:15–22:00 hardcoded) was rendered raw in 4 surfaces, ignoring per-branch settings.

**Architectural fix (V53)**:
- `src/lib/scheduleFilterUtils.js` — 3 NEW pure helpers: `getOpenHoursForDate`, `getVisibleTimeSlotsForDate`, `isTimeOutsideOpenHours`. Bangkok-TZ-stable day-bucket (midday-UTC parse to avoid TZ shift edge case). Q1=A: legacy out-of-hours appts auto-expand visible range + `hasOutsideAppts: true` flag for chip rendering.
- 4 victim files wired to canonical V53 pattern: `useEffectiveClinicSettings(undefined)` + `useMemo` on `cs.openHoursMonFri/SatSun` + `visibleSlots.map(...)` replaces `TIME_SLOTS.map(...)`:
  1. `AppointmentCalendarView.jsx` — grid filter + closed-day banner + orange "นอกเวลา" chip on legacy appt cards
  2. `AppointmentFormModal.jsx` — start/end picker filter + warning hint + closed-day banner inside modal
  3. `scheduling/ScheduleEntryFormModal.jsx` — picker filter + DOW_ANCHOR_DATE map for `kind === 'recurring'` (no concrete date)
  4. `DepositPanel.jsx` — picker filter for embedded deposit-booking sub-form (4th surface discovered via audit-grep regression test)
- Each victim file preserves legacy current value as a hidden option so legacy edits don't lose data when current value is outside new open range.

**NEW audit invariant BS-12** (parallel to BS-9, BS-11):
- Every component importing `TIME_SLOTS` from `staffScheduleValidation.js` AND mapping it MUST also import `getVisibleTimeSlotsForDate` AND read `cs.openHoursMonFri/SatSun` (deps array hint)
- 7 sub-tests in `tests/audit-branch-scope.test.js` (BS-12.1..BS-12.7)
- `audit-branch-scope` SKILL.md: 11 → 12 invariants
- Sanctioned exception: `TimeSelect24.jsx` (uses HOURS/MINUTES, not TIME_SLOTS — naturally exempt from grep)

**Test bank shipped (Rule N + Rule I)**:
- `tests/v53-open-hours-helpers.test.js` (33 tests, L1-L3) — Bangkok TZ + closed/reversed/missing detection + auto-expand + adversarial inputs
- `tests/v53-open-hours-source-grep.test.js` (41 tests, G1-G6) — per-victim regression locks + canonical V53 wiring + V12 anti-regression sweep
- `tests/v53-open-hours-flow-simulate.test.js` (7 tests, F1-F7) — Rule I full-flow simulate using actual BranchProvider + canonical pattern → branch switch + date change + closed-branch + auto-expand + lifecycle A→B→A
- `tests/audit-branch-scope.test.js` extended (+7 BS-12.x sub-tests)

**Cumulative test delta**: 7543 → 7637 + 1 skipped (+94 net) all GREEN.

**Build**: clean (BackendDashboard chunk size unchanged from V52).

## Next action
Idle — V53 shipped + committed + pushed. Awaiting user wake-up + (optional) deploy authorization.

## Outstanding user-triggered actions
- 🚨 `vercel --prod` (V18 — explicit "deploy" THIS turn). V52 + V53 both pending.
- (Optional) visual verification: set branch openHours to 11:30–20:30 → AppointmentCalendarView grid renders only those rows; modal pickers shrink dropdown.

## Institutional memory anchors
- V53 / BS-12 — closes the time-axis class-of-bug at the canonical TIME_SLOTS layer. Future surfaces importing TIME_SLOTS must wire through `getVisibleTimeSlotsForDate` to be branch-aware. Rule of 3 leverage (1 helper module → 4 victim files).
- V52 / BS-11 — closes the report-tab class-of-bug gap (BS-9 only covered scopedDataLayer importers; report tabs use reportsLoaders).
- V50 Phase 3 — cross-branch booking contract verified (commit `1c67baf` EOD #3); existing `be_customers.branchId` already serves the creation-branch role, immutable post-CREATE.
- V50-followup-2 — full ProClinic strip COMPLETE (no `master_data` / `pc_*` / `broker_jobs` / `proclinic_session` / `brokerClient` runtime references anywhere). Future ProClinic interop must go through a NEW well-defined integration boundary.
- Spec V53: `docs/superpowers/specs/2026-05-08-per-branch-open-hours-time-axis-design.md`
- Plan V53: `docs/superpowers/plans/2026-05-08-per-branch-open-hours-time-axis.md`
- V-entry: see `.claude/rules/v-log-archive.md` V53 + `00-session-start.md` § 2 row.
