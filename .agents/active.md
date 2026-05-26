---
updated_at: "2026-05-27 EOD+10 — deposit-list appt-date + OPD stepper polish + light-theme contrast sweep (SHIPPED + DEPLOYED)"
status: "SHIPPED + DEPLOYED. master=8f6b7ced (pushed); prod=8f6b7ced LIVE (vercel --prod, aliased lover-clinic-app.vercel.app). Full suite 14942/0; build clean. Light theme user-verified clear (real browser, after dev-server restart). NO rules/storage/data/cron touched → vercel-only deploy, no Probe-Deploy-Probe."
branch: "master"
last_commit: "8f6b7ced feat(finance+appt): deposit-list appt date + OPD stepper polish + light-theme contrast sweep"
tests: "full suite 14942 pass / 0 fail. build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "8f6b7ced LIVE (deployed 2026-05-27 EOD+10) — was 0805da87 (V122)"
firestore_rules_version: "UNCHANGED (no rules/storage/data/cron this session)"
---

# Active Context

## State
- deposit-list appt-date display + OPD stepper polish + light-theme contrast sweep — SHIPPED + DEPLOYED to prod (8f6b7ced).
- Flow: /systematic-debugging reframed (it was a DESIGN req, not a bug) → brainstorming (Visual Companion) → spec.html → plan.html → executing-plans (TDD) → light-theme contrast sweep follow-on.
- Verify: full suite 14942/0 · build clean · Rule Q-vis: deposit feature seen live in dark w/ real data; light theme user-confirmed clear AFTER dev-server restart.

## What this session shipped (detail: .agents/sessions/2026-05-27-light-theme-deposit-appt-polish.md)
- Deposit list (Finance→มัดจำ): appt date under "มัดจำสำหรับ" — clickable "นัด <date> · <time>" (reuses goto-appt nav) / "ยังไม่นัด" hint. Pure display (dep.appointment.date already on doc).
- OPD stepper (Appointment tab): center-align (justify-center) + Ember footer band (theme-aware). Shared TreatmentLifecycleStepper untouched (no ripple to treatment-history).
- Light-theme contrast sweep (deposit + appt zone): badges/chips/link-buttons/action-icons/VisitPurposePicker selected-chips/create-appt-modal → theme-aware; active/selected = solid bg + white text (were dark-first -300/-400 washing out on light). AppointmentHubRowCard + OpdLifecycleRow were already theme-aware.
- Tests: +opd-stepper-polish, +deposit-appt-date (.jsx + flow-simulate); 2 V21 fixups (purpose-cell source-grep window → non-greedy). 12 files, commit 8f6b7ced.

## Next action
- idle — awaiting user.

## Outstanding user-triggered actions
- 2 pre-existing Rule S doc edits (CLAUDE.md, .claude/rules/01-iron-clad.md) STILL uncommitted (user's — left untouched both sessions).
- OPD stepper Ember band: live-pixel (both themes) NOT seen — current data has no checked-in customer to render the OPD footer; centering RTL-verified + ember source-verified. User L1 when a patient is mid-OPD.
