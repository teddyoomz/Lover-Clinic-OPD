---
updated_at: "2026-05-26 EOD+1 — Appointment-hub all-types button + OPD-pending tab + link auto-cleanup SHIPPED (LOCAL)"
status: "master b476f615 — ①②③④ complete + full suite GREEN + real-prod e2e PASS. NOT deployed (await explicit 'deploy'). prod still 65ab6467."
branch: "master"
last_commit: "b476f615 test(opd): Rule Q L2 real-prod e2e — date-passed join+decision + dry-run + delete-on-save (③④)"
tests: "full suite 14688 (14687 pass + 1 KNOWN Phase 17.1 full-suite-load flake; isolated 7/7) · real-prod e2e 7/0 · build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "65ab6467 LIVE (treatment-blob Storage-ref) — appointment-hub + (prior) appointment-modal-deposit NOT yet deployed"
firestore_rules_version: "unchanged (NO rules change — be_appointments/opd_sessions already clinic-staff; no new composite index → no Probe-Deploy-Probe)"
---

# Active Context

## State
- Appointment-hub ①②③④ SHIPPED LOCAL (spec + plan + T1–T11, all committed+pushed). NOT deployed.
- ① "เพิ่มนัดหมาย" all-types button REUSES the AppointmentFormModal already rendered for edit, in create mode (no new modal); kiosk wiring retired. ② "รอ/ยังไม่ลง OPD" 5th pill (state B+C+D, ALL types per R4=keep-all; today+future, past hidden).
- ③ cron hard-deletes link when appt date passed (be_appointments join + decideCleanupAction branch, overrides V116, Q3=A). ④ delete session on OPD-save (gated isFromBookingFlow — kiosk safe). AV131.

## What this session shipped
- Full /session-start → brainstorming (Visual Companion via AskUserQuestion previews; Rule S = no live browser at ask/plan) → spec → writing-plans → executing-plans (11 tasks TDD, inline per V81/V86 baseline).
- T1-T2 ① · T3-T4 ② · T5-T6 ③ · T7 ④ · T8 Rule I flow-simulate · T9 real-prod e2e 7/0 (SAFE dry-run, no prod mutation) · T10 AV131 · T11 V21 fixups (5 files).
- Detail → `.agents/sessions/2026-05-26-appointment-hub-allbutton-opd-tab-lifecycle.md`

## Next action
- **Await explicit "deploy"** (V18) → `vercel --prod` (frontend + cron; NO rules → no Probe-Deploy-Probe). One deploy ships everything since prod 65ab6467 (this stack + the prior appointment-modal-deposit stack).
- Post-deploy Rule Q **L1 by user**: ① click เพิ่มนัดหมาย → all-types modal saves like ปฏิทิน; ② pill renders+filters; ③ past-dated link auto-gone after cron; ④ saved booking leaves tab + link gone.

## Outstanding user-triggered actions
- Deploy appointment-hub + (carryover) appointment-modal-deposit feature (master b476f615 → prod) when ready.
- (carryover) V124-126 L1 verify · cron monitoring (passive).
