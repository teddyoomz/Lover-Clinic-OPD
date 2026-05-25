---
updated_at: "2026-05-26 EOD+3 — /systematic-debugging 3-fix batch (goto-appt date · open-hours default · cancel hard-delete) SHIPPED LOCAL"
status: "master e07451fb — Issue 1/2/3 + 2 Rule-P siblings + AV133 + tests. Full suite GREEN. NOT deployed (await explicit 'deploy'). prod still 65ab6467."
branch: "master"
last_commit: "e07451fb fix(appointment): goto-appt date nav + branch open-hours default + Frontend cancel hard-delete (AV133)"
tests: "full suite 14731/14731 — 0 fail · build clean 2.91s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "65ab6467 LIVE — this batch + tab-removal + deposit-cancel + appointment-hub + appointment-modal-deposit ALL NOT yet deployed"
firestore_rules_version: "unchanged (client-only logic; NO rules/index change → no Probe-Deploy-Probe)"
---

# Active Context

## State
- **Issue 1** — Finance "ไปที่นัด" opens the appt's DATE (was today). Root cause: BackendDashboard default `activeTab='appointment-all'` mounts AppointmentCalendarView on first render before the deep-link useEffect set `initialApptDate` → its `useState(()=>)` locked to today. Fix: synchronous `?date=` derive in the useState initializer + a `[initialSelectedDate]` prop-sync effect.
- **Issue 2** — create-appointment default start = branch open hours via `getOpenHoursForDate` (was hardcoded '10:00'). Rule-P siblings fixed: `AppointmentCalendarView.openCreate` (`time||''`) + `DepositPanel` deposit-appt sub-form (`visibleTime.openRange`).
- **Issue 3** — Frontend นัดหมาย cancel HARD-DELETES (`deleteBackendAppointment`, mirrors Backend) instead of `status:'cancelled'`; V125 linked-session archive cascade preserved (reason `appt-deleted`).

## What this session shipped
- /session-start → /systematic-debugging (Phase 1 root-cause for all 3 via code, no guessing) → fix → Tier-2.
- AV133 + NEW `tests/finance-goto-default-time-cancel-delete.test.js` (Issue 2 runs the REAL getOpenHoursForDate = L2) + 3 V21 fixups (v125 SG-A3 hard-delete/appt-deleted · phase-19-0 C2.1 · phase-24-0 VOC.B.1).
- Detail → `.agents/sessions/2026-05-26-finance-goto-default-time-cancel-delete.md`

## Next action
- **Await explicit "deploy"** (V18) → `vercel --prod` (frontend; NO rules → no Probe-Deploy-Probe). One deploy ships everything since prod 65ab6467.
- Post-deploy Rule Q **L1 by user**: Finance·มัดจำ "ไปที่นัด" opens the appt's day; create-appt modal start defaults to the branch open time (e.g. 11:30); cancel a นัดหมาย → row GONE from appointment-all (not just marked cancelled).

## Rule Q-honest scope
- Logic = L2 (real `getOpenHoursForDate` in the bank) + source-grep + full suite. Real-browser render (date-land / 11:30 default) + real Firestore delete round-trip = USER L1 post-deploy (auth-gated dashboards; workstyle "ไม่ self-test UI") — disclosed, not driven by me.

## Outstanding user-triggered actions
- Deploy the combined stack (this batch + tab-removal + deposit-cancel + appointment-hub + appointment-modal-deposit) when ready.
- (carryover) V124-126 L1 verify · cron monitoring (passive).
