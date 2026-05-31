# Checkpoint — 2026-05-31 EOD+5 — confirmed-card + course-step plan IMPLEMENTED + confirm-btn debug + sky→green

## Summary
Implemented the approved plan (`2026-05-31-appt-confirmed-card-and-course-step.html`, มติ ①A/②A/③B) Tasks 1-7 via TDD/subagent-driven (canary subagent for Task 1, then inline — subagent cost ~355K tok/task on this baseline). Then `/systematic-debugging` on 2 user-reported issues: the "คอนเฟิร์มนัด" button vanishing when pending + a treatment record exists (V73-BS1 class), and recolor confirmed sky→green. All pushed; NOT deployed.

## Current State
- master = `15cde92e` (pushed origin/master); prod UNCHANGED = `0c607f68` LIVE. 13 commits ahead of prod.
- Frontend/lib only → no rules/storage/index/cron → **no Probe-Deploy-Probe**.
- Net UI: confirmed "วันนี้" card = GREEN (Task 3 shipped sky → debug recolored) + reorder-to-top; OPD course step muted "ไม่ตัดคอร์ส"; CDV history has 4th course step; confirm button follows real status.
- Full suite 711 files / **15440 tests, 0 fail** (this session, after debug fixes; lightbox flake passed). NOT re-run at session-end.

## Commits (this session)
```
15cde92e fix(appt): confirmed status color sky -> green (card tint + accent bar + chip); distinct from done=emerald
98861470 fix(appt): confirm button follows real status (separate showConfirmBtn gate) — V73-BS1 class
5889ee84 chore(diag): Rule R diag-course-deducted-check — verify resolveCourseDeducted split on real prod (③)
25b2b931 test(opd): V21 fixups — V139 course step warn->not-deducted muted contract (②)
24057242 feat(opd): add course step to customer-detail history, keep teal/amber connectors (③B)
a4c5b16e feat(opd): course step amber 'ยังไม่ตัด' -> muted 'ไม่ตัดคอร์ส' (②A)
fac780c9 feat(appt): confirmed card sky tint (①A)   [recolored→green in 15cde92e]
bc0be518 feat(appt): today tab orders confirmed-active first (① reorder wiring)
d80d2331 feat(appt): sortApptsConfirmedFirst — confirmed-active to top (① reorder)
```

## Files Touched (names only)
- src/lib/appointmentHubFilters.js (sortApptsConfirmedFirst) · src/components/admin/AppointmentHubView.jsx (today-tab sort)
- src/components/admin/AppointmentHubRowCard.jsx (card tint→green · showConfirmBtn gate) · src/components/admin/_apptHubStyles.js (confirmed bar+chip→green)
- src/lib/treatmentDisplayResolvers.js (resolveCourseStepState 'warn'→'not-deducted') · .../treatment-history/TreatmentLifecycleStepper.jsx (muted course) · TreatmentHistoryRow.jsx (withCourseStep) · backend/CustomerDetailView.jsx (courseDeducted in mapper)
- scripts/diag-course-deducted-check.mjs (Rule R)
- tests: appt-confirmed-card-sort-and-tint.test.jsx · course-step-not-deducted-muted.test.jsx · cdv-treatment-history-course-step.test.jsx · appt-confirm-button-follows-status.test.jsx · v139-opd-course-step.test.jsx + v139-flow-simulate.test.js (V21 fixups)

## Decisions (1-line each)
- ① reorder = today tab only; confirmed-active = status==='confirmed' && !serviceCompletedAt; pure sort reuses sortApptsByDateTimeAsc.
- ② ONE SSOT resolveCourseStepState 'warn'→'not-deducted' drives Frontend card AND CDV history; muted reuses pending/skip dim style; dot "–".
- ③B compute courseDeducted in the CDV treatmentSummary mapper from raw t (V139/V104 detail-strip trap); keep teal/amber connectors.
- Debug Issue 1: pending was the ONLY status without a separate status-driven gate (confirmed=showMarkCompleteBtn, done=showUnmarkBtn); add showConfirmBtn mirroring them → confirm follows rawStatus, not hasTreatmentForDay. Affected case: today/future pending + treatment-record-exists.
- Debug Issue 2: confirmed sky→green (3 sites); `green` ≠ done=`emerald` (distinct + both "เขียว"); done is in a separate sub-tab so no collision.
- Subagent-driven canary (Task 1) confirmed subagents don't break but cost ~355K tok/task → inline rest (V81/tablet-chart baseline lesson).

## Next Todo (ship artifacts — at deploy)
- Add V-entry + AVxx: (a) V73-BS1 class — AppointmentHubRowCard status-action buttons MUST have status-driven gates, not hasTreatmentForDay; (b) course-step consumers must receive courseDeducted from a source that has `detail` (mapper, not detail-stripped summary).
- Delete dev mockups `public/brainstorm-*.html` (plan Task 7).

## Resume Prompt
```text
Resume LoverClinic — continue from 2026-05-31 EOD+5.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=15cde92e, prod=0c607f68)
3. .agents/active.md (15440 tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-31-confirmed-card-coursestep-confirmbtn.md

Status: master=15cde92e (13 commits ahead, pushed), prod=0c607f68 LIVE, 15440/0 (not re-run).
Next: USER-gated — deploy the 13-commit batch (frontend/lib, no Probe-Deploy-Probe) → USER L1
  (confirm-btn reappears on pending+treated card; confirmed card/chip GREEN both themes; ① reorder+realtime; ②/③ course steps).
  At deploy: add V-entry + AVxx (V73-BS1 status-gate class + course-step-needs-detail) + delete public/brainstorm-*.html.
Outstanding (user): deploy + L1; carryover V142/V143 L1 (2-device balance + NK shows 0); cron stock-lot-cleanup active 03:45 BKK.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules; Rule Q L1/L2 before "verified"; ground mockups in REAL design (§S-design).
/session-start
```
