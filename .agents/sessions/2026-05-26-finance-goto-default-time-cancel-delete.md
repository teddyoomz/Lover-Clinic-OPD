# Checkpoint — 2026-05-26 EOD+3 — /systematic-debugging 3-fix batch

## Summary

Three user-reported appointment-area bugs fixed via `/systematic-debugging` (Phase 1 root-cause for all three found by reading the code — no guessing): (1) Finance "ไปที่นัด" landed on today instead of the appt's date; (2) create-appointment default start time was hardcoded 10:00 instead of the branch's open hours; (3) Frontend นัดหมาย cancel only marked `status:'cancelled'` instead of hard-deleting. SHIPPED LOCAL; full suite + build green; **NOT deployed** (await explicit "deploy", V18).

## Current State

- master = `e07451fb`; prod UNCHANGED `65ab6467`. One "deploy" ships this + tab-removal + deposit-cancel + appointment-hub + appointment-modal-deposit (all since prod `65ab6467`).
- Full vitest **14731/14731 — 0 fail** (caught + fixed 2 V21 regressions). Build clean 2.91s.
- **NO firestore.rules / composite-index change** → no Probe-Deploy-Probe. All client + pure-helper.
- AV133 added; NEW `tests/finance-goto-default-time-cancel-delete.test.js` (19 tests) + 3 V21 fixups.

## Architecture (root causes + fixes)

### Issue 1 — late-prop today-lock (derived-state-from-prop-initializes-once)
`BackendDashboard.jsx:141` default `activeTab='appointment-all'` already renders `<AppointmentCalendarView>` on the FIRST render — before the deep-link `useEffect` (`:187`) set `initialApptDate` from `?date=`. So the calendar's `selectedDate`/`calMonth` `useState(()=>valid(prop)?prop:today)` captured today (empty prop) and never re-derived when the prop later changed (same element → no remount). Fix: (a) derive `?date=` SYNCHRONOUSLY in `initialApptDate`'s `useState` initializer (root cause, no flash); (b) defense-in-depth `useEffect` in AppointmentCalendarView keyed on `[initialSelectedDate]` (NOT `selectedDate` → never fights admin nav). Same family as the tablet-chart `initialFabricJson` late-arrival.

### Issue 2 — appointment start default = branch open hours
`AppointmentFormModal.jsx:117/319` hardcoded `'10:00'`. `getOpenHoursForDate(date,cs)` already imported (picker filter) + `cs` available at line 254. Fix: create-mode initializer `getOpenHoursForDate(cDate,cs)?.open || '10:00'` + re-apply effect keyed on `[mode, initialStartTime, formData.date, cs.openHoursMonFri, cs.openHoursSatSun]` (NOT startTime → manual picks stick; handles async-cs-load + date-change). **Rule P siblings fixed**: `AppointmentCalendarView.openCreate` passed `time||'10:00'` (silently defeated the fix because the modal treats a non-empty `initialStartTime` as explicit → `time||''`); `DepositPanel` deposit-appt sub-form effect via `visibleTime.openRange?.open`. Issue-1's late-prop class confirmed ISOLATED (TFP/CustomerCreatePage/Recall/ScheduleEntry `useState(()=>initial)` sites get the prop synchronously at mount or are render-gated).

### Issue 3 — Frontend cancel hard-deletes (mirrors Backend)
`AdminDashboard.jsx:6362` did `updateBackendAppointment({status:'cancelled'})` (deliberate V125 mark+cascade, LOCAL not deployed). Working reference: Backend `AppointmentCalendarView` ALREADY hard-deletes via `deleteBackendAppointment` (`:1177/1207`). Fix: else-path (no-deposit + deposit "this-only") → `deleteBackendAppointment(appt.id)`; V125 linked-`opd_session` archive cascade PRESERVED (reason `appt-deleted` → queue+bubble still clear + trace kept); 'both' deposit path unchanged (`deleteDepositBookingPair`). Confirm copy → 'ยกเลิกและลบนัดนี้ออกจากระบบ?'. Removal propagates via the V64-fix9 `appointmentDataVersion` listener reload. Analytics note: ~12 aggregators read `'cancelled'` but mostly EXCLUDE it (no change); cancellation-rate metrics lose hard-deleted appts — but the Backend already hard-deletes, so this is consistency, not new loss.

## Commits

```
e07451fb fix(appointment): goto-appt date nav + branch open-hours default + Frontend cancel hard-delete (AV133)
```

## Files Touched

- SRC: `BackendDashboard.jsx` · `AppointmentCalendarView.jsx` · `AppointmentFormModal.jsx` · `DepositPanel.jsx` · `AdminDashboard.jsx` · `AppointmentHubView.jsx`
- AUDIT: `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV133)
- TESTS: NEW `tests/finance-goto-default-time-cancel-delete.test.js` + V21 fixups `tests/v125-cancel-cascade.test.js` · `tests/phase-19-0-grid-15min-cell.test.jsx` · `tests/phase-24-0-vicies-octies-finance-goto-appointment.test.js`

## Decisions

- Issue 1: synchronous URL-derive (root cause, no flash) + prop-sync effect (defense-in-depth) — not effect-only (would flash today first).
- Issue 2: re-apply effect NOT keyed on startTime → a manual time pick is never overridden; date-change re-defaults (matches "open time for THAT day").
- Issue 3: scope = Frontend only (user said "ใน Frontend"); brings it in line with the already-hard-deleting Backend; session archived (not deleted) — preserves intake trace.
- No commit-of-work until /session-end (global "commit only when asked"); /session-end authorizes it.

## Rule Q-honest scope

- Logic = L2 (the new bank runs the REAL `getOpenHoursForDate`) + pure-logic simulate (I1 derive/init/sync-effect, I3 routing) + source-grep + full suite + build.
- NOT driven by me: real-browser RENDER (calendar lands on the date / modal shows 11:30) + real Firestore DELETE round-trip — auth-gated AdminDashboard/BackendDashboard + workstyle "ไม่ self-test UI" → **USER L1 post-deploy**. Disclosed, not reasoned-away.

## Next Todo

- Await explicit "deploy" → `vercel --prod` (frontend; NO rules → no Probe-Deploy-Probe).
- Post-deploy USER L1: Finance·มัดจำ "ไปที่นัด" opens the appt's day; create-appt modal start defaults to the branch open time (e.g. 11:30); cancel a นัดหมาย → row GONE from appointment-all (not just marked).

## Resume Prompt

```text
Resume LoverClinic — continue from 2026-05-26 EOD+3.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=e07451fb, prod=65ab6467 LIVE)
3. .agents/active.md (14731 tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary; Rule Q + Q-honest + Q-vis)
5. .agents/sessions/2026-05-26-finance-goto-default-time-cancel-delete.md

Status: master=e07451fb, full suite 14731/0, build clean, prod=65ab6467 LIVE.
/systematic-debugging 3-fix batch SHIPPED LOCAL (goto-appt date nav · branch open-hours
default · Frontend cancel hard-delete; AV133) — NOT deployed.
Next: await explicit "deploy" → vercel --prod (frontend; NO rules → no Probe-Deploy-Probe) → user Rule Q L1.
Outstanding (user-triggered): deploy the combined stack (ships everything since 65ab6467) ·
L1 verify the 3 fixes + carryover V124-126.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules;
Rule Q + Q-honest + Q-vis (real-adversarial; disclose the test-vs-claim gap; verify pixels with eyes).
/session-start
```
