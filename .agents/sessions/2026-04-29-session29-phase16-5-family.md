# Session 29 — 2026-04-29 EOD — Phase 16 kickoff + 16.5 base/bis/ter/quater + V15 #7 deploy

## Summary
Heaviest session of the project to date. Started with V15 #7 deploy + phantom-branch cleanup, brainstormed Phase 16, then shipped 4 sub-phases of 16.5 (Remaining Course tab) iterating against rapid user feedback. 3312 → 3456 tests (+144). 6 commits, 5 unpushed-to-prod. Two memory rules locked. One V13-class unauthorized-cancel incident on real production data — reverted in 60s.

## Current State
- master = `2aae710` · production = `cf54400` (V15 #4 LIVE) · 5 commits unpushed
- 3456/3456 focused vitest pass · build clean · working tree clean
- firestore.rules unchanged (no schema bump)
- 4 customer doc-id formats now in audit history: `LC-*`, ProClinic numeric, hash-suffix, etc.
- Phase 16 master plan: `~/.claude/projects/F--LoverClinic-app/memory/project_phase16_plan.md`

## Commits
```
2aae710 feat(course): Phase 16.5-quater — bug bundle + course-history tab + audit unification
6c82d3c feat(course+sale): Phase 16.5-ter — staff dropdowns + sale-cancel cascade flips course status
51a4141 fix(course): P0 — buildChangeAuditEntry undefined-courseId crash on legacy ProClinic-cloned courses
ae865db fix(reports): Phase 16.5-bis — surface ProClinic-cloned courses + effective status + pagination
49db77c docs(agents): mark Phase 16.5 shipped + handoff state
6aae9c3 feat(reports): Phase 16.5 — Remaining Course tab + cancelCustomerCourse + 3 action modals
```
(plus V15 #7 deploy ops earlier in session — vercel + firebase rules + phantom-branch cleanup; no commits)

## Files Touched
- src/lib/{courseExchange,backendClient,remainingCourseUtils}.js
- src/components/backend/{CancelCourseModal,RefundCourseModal,ExchangeCourseModal,CourseHistoryTab,CustomerDetailView,SaleTab}.jsx
- src/components/backend/reports/{RemainingCourseTab,RemainingCourseRow,SaleDetailModal}.jsx
- src/components/TreatmentFormPage.jsx · src/pages/BackendDashboard.jsx
- src/components/backend/nav/navConfig.js
- tests/phase16.5-* (5 files) · tests/phase16.5-quater-* (1 file) · tests/phase16.5-cancel-customer-course.test.js (extended)
- api/admin/cleanup-phantom-branch.js (deployed via V15 #7)
- docs/superpowers/specs/2026-04-29-phase16-5-remaining-course-design.md
- 2 memory locks: `feedback_no_real_action_in_preview_eval.md` · `feedback_no_prelaunch_cleanup_without_explicit_ask.md`

## Decisions
- Status enum stays Thai ('กำลังใช้งาน'/'คืนเงิน'/'ยกเลิก'/'ใช้หมดแล้ว') — matches existing courseExchange.js convention
- Derived data strategy (no `be_remaining_courses` collection) — flatten customers[].courses[] client-side
- ProClinic-cloned courses lack courseId → synthesize `idx-${i}` + `hasRealCourseId` flag; backend helpers accept courseIndex fallback
- Cancel via RemainingCourse tab REMOVES course from array (Option B-like for cancel — "หายจริง" per user); audit doc preserves snapshot
- Sale-cancel cascade FLIPS status (kind derived from refundMethod) — keeps record in array per user spec
- Exchange Option B: partial = reduce qty + stay in array; full = splice out + audit-only trace
- Staff dropdown source = `listStaffByBranch({branchId})` (be_staff only, NO doctors) per user "พนักงานในหน้าพนักงาน" directive
- Audit kind enum unified: add/exchange/share/cancel/refund/use → all visible in NEW CourseHistoryTab

## Next Todo
- V15 #8 combined deploy auth (5 commits ready); live QA per active.md outstanding list
- 16.3 System Settings (next sub-phase) OR pre-launch H-bis cleanup (LOCKED — user trigger only)
- 16.2 Clinic Report · 16.1 Smart Audience · 16.4 Order intel decision · 16.8 /audit-all

## Resume Prompt
```
Resume LoverClinic — continue from 2026-04-29 EOD (session 29).

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=2aae710, prod=cf54400 — 5 commits unpushed)
3. .agents/active.md (3456 tests pass; Phase 16.5 family closed)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-04-29-session29-phase16-5-family.md

Status: master=2aae710, 3456/3456 tests pass, prod=cf54400 LIVE
Next: V15 #8 deploy when authorized OR start 16.3 System Settings
Outstanding (user-triggered):
- V15 #8 combined deploy auth (5 commits)
- After deploy: live QA Phase 16.5 family
- Pre-launch H-bis cleanup LOCKED OFF (user trigger only)

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe Rule B; Rule J skill auto-trigger; NO real-action clicks in preview_eval (memory-locked).
/session-start
```
