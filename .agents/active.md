---
updated_at: "2026-05-26 EOD — Appointment-modal deposit-section + chip นัดมาเพื่อ unification SHIPPED (LOCAL)"
status: "master def9e256 — feature complete + full suite GREEN + real-prod e2e PASS. NOT deployed (await explicit 'deploy'). prod still 65ab6467."
branch: "master"
last_commit: "def9e256 docs(agents): appointment-modal deposit + chip unification SHIPPED (local)"
tests: "full suite 14658/0 · real-prod e2e 21/0 · build clean ✓ 3.25s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "65ab6467 LIVE (treatment-blob Storage-ref) — appointment-modal feature NOT yet deployed"
firestore_rules_version: "unchanged (NO rules change — be_deposits/be_appointments already clinic-staff write; no new compound index)"
---

# Active Context

## State
- Appointment-modal unification SHIPPED LOCAL (11 tasks E1–E11, all committed+pushed). NOT deployed.
- ① Deposit section auto-shows on EFFECTIVE type (`showDepositSection`, create+edit) — radio "จองมัดจำ" → required ยอด>0 → `createDepositBookingPair`; edit hydrate+update / flip-to `createDepositForExistingAppointment` (NEW) / flip-away → confirm ลบ(`cancelDepositBookingPair` cascade)/เก็บ + usedAmount guard.
- ② NEW `VisitPurposePicker` chip (required, อื่นๆ) replaces textarea; stores `appointmentTo` string (backward-compat); `visitReasonOptions` single source (Rule C1). AV130.

## What this session shipped
- E1 visitReasonOptions constant + 3-site refactor · E2 VisitPurposePicker · E3 wire+required · E4 effective-type gate · E5 createDepositForExistingAppointment · E6 edit hydrate+reconcile · E7 flip-away dialog · E8 AV130 · E9 flow-simulate(25) · E10 real-prod e2e(21/0) · E11 full-suite+handoff.
- Detail → `.agents/sessions/2026-05-26-appointment-modal-deposit-purpose.md`

## Next action
- **Await explicit "deploy"** (V18) → `vercel --prod` (frontend only; NO rules → no Probe-Deploy-Probe).
- Post-deploy Rule Q **L1 by user**: regular appt-create → pick จองมัดจำ → section+required → save → การเงิน→มัดจำ; edit amount → update; flip-away → dialog; chips required.
- **Edge to L1-check**: Walk-in OPD-save now also requires a "นัดมาเพื่อ" chip — confirm acceptable (else make required only on booking flows).

## Outstanding user-triggered actions
- Deploy appointment-modal feature (master def9e256 → prod) when ready.
- (carryover) นัดหมาย-tab unification brainstorm · cron monitoring (passive) · L1 verify V124-126.
