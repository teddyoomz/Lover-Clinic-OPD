---
updated_at: "2026-05-27 EOD+11 — appointment page LIVE cross-device + CC field row-align (LOCAL, committed, NOT pushed/deployed)"
status: "Committed locally (2 feature commits on top of EOD+10). Full suite 14958/0, build clean. Verified Rule Q L1 (real-browser pixel, cross-device 2-window) + L2 (real-prod onSnapshot 18/18). NOT pushed, NOT deployed — await explicit 'push'/'deploy' (V18)."
branch: "master"
last_commit: "0c702091 feat(appt): live cross-device card-list — treatments/deposits/sales onSnapshot triggers -> loadAll"
tests: "full suite 14958 pass / 0 fail. build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "8f6b7ced LIVE (EOD+10) — EOD+11 NOT deployed"
firestore_rules_version: "UNCHANGED (no rules/storage/data/cron this session)"
---

# Active Context

## State
- 2 features committed LOCALLY on master (HEAD 0c702091), 2 commits ahead of EOD+10 (4b8e3123); origin NOT pushed; prod 8f6b7ced unchanged.
- Appointment-page card-list now updates REAL-TIME cross-device (OPD stepper / appt status / deposit-sale chips) without refresh, all day. Verified L1 pixel (2 windows) + L2 18/18 real prod.
- Working tree clean except the 2 pre-existing Rule S doc edits (CLAUDE.md, rules/01) — user's, untouched.

## What this session shipped (detail: .agents/sessions/2026-05-27-appt-live-cross-device.md)
- **CC button row-align** (`7857a2dd`): TFP left col `space-y-4`→`flex flex-col gap-4` + teal save `mt-auto` → vitals/doctor buttons land same row. Root cause (real-browser measured): block-vs-flex trailing-`mb-3` mismatch (~12px); bumping CC `rows` is a NO-OP (flex-1). Cosmetic only.
- **Live cross-device** (`0c702091`): NEW `listenToTreatmentsByDateRange` + `listenToAllDeposits` (backendClient) + scopedDataLayer re-exports; AppointmentHubView subscribes 3 triggers → `liveRefreshTick` (skip-first) → existing `loadAll({silent})`. Extends the proven `appointmentDataVersion` pattern. + day-rollover/resume guard. NO logic/mutation/render touched.
- **V66 trap caught pre-ship**: branch-scoped sales = `where(saleDate>=)+where(branchId)` = composite index that does NOT exist → would FAIL_PRECONDITION in prod (admin-SDK can't catch). Fixed → sales `allBranches` saleDate-only (single-field). treatments=whole-collection, deposits=single-field → all index-free.
- Tests: +`appointment-live-cross-device.test.js` (12 source-grep+flow-sim) + 6 RTL mock fixes (partial-mock-missing-new-export, V11-class) + `e2e-appointment-live-cross-device.mjs` (L2 18/18 real prod, keep).
- Verify: full suite 14958/0 (ran 2×) · build clean · L2 18/18 (appt CRUD, treatment vitals→doctor cross-branch + cancelled/out-of-window filtered, deposit branch-isolation, sale) · L1 real-browser pixel demo (ซักประวัติ✓ + แพทย์✓ lit live on 2 windows; cleaned up).
- Flow this session: /systematic-debugging (verify current state = BROKEN cross-device for OPD) → brainstorming (Q1=A listener-trigger, Q2=A treatments allBranches) → writing-plans HTML → executing-plans inline → V66 fix → L2 → L1 pixel demo.

## Next action
- USER-TRIGGERED: push master (2 commits) + deploy (vercel-only — no rules/storage/cron → no Probe-Deploy-Probe). Say "push" / "deploy".

## Outstanding user-triggered actions
- push origin master (0c702091) + `vercel --prod` — await explicit word (V18). Frontend-only deploy.
- 2 pre-existing Rule S doc edits (CLAUDE.md, .claude/rules/01-iron-clad.md) STILL uncommitted (user's, left untouched 3 sessions).
- OPD ember-band live-pixel (EOD+10 carryover) — still no checked-in customer in data to render the footer band; user L1 when a patient is mid-OPD.
