---
updated_at: "2026-04-29 late evening (session 30 cont.) — Phase 16.3 System Settings + V36-quater/quinquies course-history fixes + V15 #9 deploy"
status: "Production = f4e6127 LIVE (V15 #9). master = f4e6127. Phase 16.3 + V36 family + V36-quinquies real-time listeners ALL deployed."
current_focus: "Phase 16.3 LIVE. Awaiting live QA + decision on next sub-phase (16.2 Clinic Report next per master plan)."
branch: "master"
last_commit: "f4e6127"
tests: 3759
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "f4e6127"
firestore_rules_version: 21
storage_rules_version: 2
---

# Active Context

## State
- master = `f4e6127` · production = `f4e6127` (V15 #9 LIVE) · all commits in prod
- **3759/3759** focused vitest pass (3597 → 3759 = +162 across V36-quater/quinquies + Phase 16.3)
- Build clean · working tree clean · **firestore.rules CHANGED this deploy** (Phase 16.3 narrow match for `clinic_settings/system_config` + `be_admin_audit/system-config-*` create exception; rules version 20 → 21)
- V15 #9 Probe-Deploy-Probe Rule B: pre 6/6 + 5/5 ✓; post 6/6 + 5/5 ✓; cleanup pc_appointments 2/2 + clinic_settings strip 2/2 ✓
- HTTP smoke: / 200, /admin 200, /api/webhook/line 401 ✓
- Phase 16.3 system_config new probe: GET unauth → 404 (doc not yet created — admin first save will materialize)

## What session 30 shipped (2026-04-29 evening) — V36 + V15 #8

V36 multi-writer-sweep + fail-loud + phantom-branch fallback (commit `ae760c7`):
- **Bug A** — Transfer + withdrawal `_receiveAtDestination` now route through `_ensureProductTracked` (V12 multi-writer mirror)
- **Bug B** — Treatment context throws `TRACKED_UPSERT_FAILED` Thai error when product genuinely missing; sale context preserves silent-skip per V35.3-ter
- **Bug C** — `BranchContext` re-validates `selectionStillValid` on EVERY snapshot; phantom-branch BR-1777095572005-ae97f911 from stale localStorage now falls back to `'main'`
- `_ensureProductTracked` switched `updateDoc` → `setDoc({merge:true})` for missing-doc + missing-stockConfig robustness
- **Phase 15.7 negative-stock invariant PRESERVED** — AUTO-NEG synth + auto-repay via 4 buttons (นำเข้า / โอน / เบิก / ปรับ) all locked by V36.E.11-15 + V36.F.4-8

Tests: +144 V36 across 4 new files; legacy regressions fixed (course-skip F.6 + G.4-G.6 slice; phase15.4 ML.C/ML.D fnSlice; branch-isolation BR1.5)

V15 #8 combined deploy:
- vercel `lover-clinic-gxx8hxgzm-...` aliased to `lover-clinic-app.vercel.app`
- firebase rules: idempotent re-publish (no schema change)
- Probe-Deploy-Probe Rule B: pre 6/6 + 5/5 ✓; post 6/6 + 5/5 ✓
- HTTP smoke: / 200, /admin 200, /api/webhook/line 401 (LINE sig — expected)
- Cleanup: pc_appointments DELETE 200/200; clinic_settings strip 200/200; opd_sessions probes hidden via V27 isArchived:true

## Earlier this day (session 29) shipped (2026-04-29 — session 29)
6 commits — see [`.agents/sessions/2026-04-29-session29-phase16-5-family.md`](.agents/sessions/2026-04-29-session29-phase16-5-family.md)
- **V15 #7 deploy** + phantom branch BR-1777095572005-ae97f911 cleanup (51 ops via /api/admin/cleanup-phantom-branch)
- **Phase 16.5 base** — Remaining Course tab + 3 modals (Cancel/Refund/Exchange) + cancelCustomerCourse helper + 5 test files (+112 tests)
- **Phase 16.5-bis** — surface ProClinic-cloned courses (1384/1384 were skipped) + effective status promotion (qty=0 → 'ใช้หมดแล้ว') + pagination 20/page
- **P0 hotfix** — buildChangeAuditEntry undefined-courseId crash (V14 lock pattern; coerce undefined → null/'')
- **Phase 16.5-ter** — staff dropdowns (Cancel + Exchange + SaleTab cancel) + applySaleCancelToCourses flip-status cascade + SaleDetailModal staff display
- **Phase 16.5-quater** — addQty bug fix (reverseQty math) + cancel REMOVES course from array + audit unification (kinds: add/exchange/share/cancel/refund/use) + NEW CourseHistoryTab + treatment-deduction emit on save
- **Memory locks**: `feedback_no_real_action_in_preview_eval.md` (NEVER click real action btns in preview) + `feedback_no_prelaunch_cleanup_without_explicit_ask.md` (LOCKED OFF)

## Next action
**Phase 16.3 LIVE + V15 #9 deployed.** Awaiting live QA on:
- Phase 16.3 System Settings tab — admin opens `/admin?tab=system-settings` → 4 sections render (Tab Overrides / Defaults / Feature Flags / Audit Viewer); save creates `clinic_settings/system_config` doc + `be_admin_audit/system-config-{ts}` audit entry
- V36-quater purchased-in-session course-history audit emit (kind='use' linkedTreatmentId)
- V36-quinquies real-time CourseHistoryTab + CustomerDetailView (no F5 needed)
- V36 stock flows already verified by user

Next sub-phase per master plan: **16.2 Clinic Report** (revenue trend / new customers / retention / top-10 services-doctors-products / branch comparison).

## Outstanding user-triggered actions
- Live QA on Phase 16.3 System Settings tab at https://lover-clinic-app.vercel.app
- Decision: ลุย 16.2 Clinic Report next OR pause for Phase 16.3 QA first
- 16.4 Order tab intel still failing `MODULE_NOT_FOUND` (scraper repo deps issue) — defer
- Pre-launch H-bis cleanup remains LOCKED OFF per memory
- V13 incident from session 29: 1 unauthorized cancel on customer 2853 course 200 — REVERTED within 60s; audit entry kept (be_course_changes append-only)
