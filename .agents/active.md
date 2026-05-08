---
updated_at: "2026-05-08 EOD #8 — V54 Listener safe-by-default (BS-13) — AdminDashboard branch leak fix"
status: "master=<v54-commit> (+3 ahead of prod ef580a6) · 7662/7662 + 1 skipped GREEN · build clean · NOT yet deployed"
branch: "master"
last_commit: "fix(V54/BS-13): raw appointment listeners safe-by-default (AdminDashboard branch leak)"
tests: 7662
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef580a6"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = V54 commit · prod = `ef580a6` (V52 + V53 + V54 NOT yet deployed; user authorizes separately)
- Iron-clad **systematic-debugging** (Phase 1-4) + **Rule P 7-step class-of-bug expansion** + **Rule J brainstorming HARD-GATE**
- Invariant set: AV1-AV29 + **BS-1..BS-13** (NEW: BS-13 listener safe-by-default) + CB-1..5

## What EOD #8 shipped (systematic-debugging session)
**User report (verbatim)**: "tab นัดหมายใน Frontend ยังไม่แยกดึงข้อมูลเป็นสาขาๆ"

**Root cause** (3-layer V21 chain):
1. AdminDashboard.jsx:713-715 comment claimed "scopedDataLayer wrapper resolves the current branch"
2. scopedDataLayer.js:307 `listenToAppointmentsByMonth` is plain passthrough (NOT auto-inject)
3. backendClient.js:2361 `useFilter = undefined && !false` falsy → query = WHOLE be_appointments collection

Result: AdminDashboard's queue calendar (the patient-queue "Frontend" page at `/admin`) showed ALL branches' appointments steady-state, regardless of top-right BranchSelector.

**V54 architectural fix** (mirror `listenToScheduleByDay` safe template):
- `backendClient.js` 4 functions safe-by-default: `getAppointmentsByMonth` + `getAppointmentsByDate` + `listenToAppointmentsByDate` + `listenToAppointmentsByMonth`. When `branchId` falsy AND `!allBranches` → resolve via `resolveSelectedBranchId()`. If still falsy → return empty (`{}` / `[]` / `onChange([])` + noop unsub). NEVER falls back to whole-collection query.
- `AdminDashboard.jsx:716` — pass `{ branchId: selectedBranchId }` explicitly (V52/BS-11 canonical pattern; defense-in-depth).
- Closes the AppointmentCalendarView initial-mount race window too (cold-load with localStorage empty no longer leaks cross-branch data).

**NEW audit invariant BS-13**: every raw appointment getter+listener in backendClient.js MUST be safe-by-default; anchor on resolveSelectedBranchId reference + V54/BS-13 marker. Closed sanctioned-exception list (none — all 4 follow the rule).

**Test bank (Rule N targeted + Rule I covered by V52/V53 existing flow-simulates)**:
- `tests/v54-listener-safe-by-default.test.js` (24 tests, L1-L5) — 4 functions × 4-6 scenarios + V54 marker verification
- `tests/audit-branch-scope.test.js` extended (+7 BS-13.x sub-tests)
- 4 V21-class regression tests fixed (Z3.1, A6.1, S5.1, BS-F.2) — they had locked the broken `{}` opts pattern; updated to lock V54 explicit-branchId contract

**Final tally**: 7631 → 7662 + 1 skipped (+31 net) all GREEN. Build clean.

## Next action
Idle — V54 shipped + committed + pushed. Awaiting user wake-up + (optional) deploy authorization for combined V52 + V53 + V54.

## Outstanding user-triggered actions
- 🚨 `vercel --prod` (V18 — explicit "deploy" THIS turn). V52 + V53 + V54 all pending.
- (Optional) visual verification: open `/admin`, switch top-right BranchSelector → Appointment Manager queue calendar should show ONLY current branch's appointments.

## Institutional memory anchors
- V54 / BS-13 — closes the listener safe-by-default-FAILED class permanently. Future raw appointment fetches in backendClient.js fail audit unless they resolve via resolveSelectedBranchId + return empty when no branch.
- V53 / BS-12 — closes the time-axis class-of-bug at the canonical TIME_SLOTS layer.
- V52 / BS-11 — closes the report-tab class-of-bug gap.
- V50 Phase 3 — cross-branch booking contract verified (commit `1c67baf` EOD #3); existing `be_customers.branchId` already serves the creation-branch role, immutable post-CREATE.
- V50-followup-2 — full ProClinic strip COMPLETE.
- Spec V54: `docs/superpowers/specs/2026-05-08-listener-safe-by-default-design.md`
- Plan V54: `docs/superpowers/plans/2026-05-08-listener-safe-by-default.md`
- V-entry: see `.claude/rules/v-log-archive.md` V54 + `00-session-start.md` § 2 row.

## Methodology lessons (V54)
- **systematic-debugging Phase 1-2 caught what static audit missed**: V52/V53 audits saw "comment says auto-inject ✓" without VERIFYING the wrapper actually performs auto-inject. This is the V21 comment-vs-code drift family — fixed structurally by adding BS-13 audit anchored on `resolveSelectedBranchId` reference (not on comment text).
- **3-layer V21 drift requires backstop at the data layer**: comment lies + wrapper passthrough + safe-by-default-FAILED stack up. The architectural backstop (safe-by-default in backendClient.js) closes the gap permanently regardless of caller mistakes or comment drift.
- **Test fixups are first-class**: 4 pre-existing tests asserted the broken contract (locked `{}` opts pattern). Updated each with V54 marker comment explaining the pre-V54 V21 drift + post-V54 contract. Same pattern as V52 stale-annotation strip + V53 BS-12 invariant addition.
