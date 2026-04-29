---
updated_at: "2026-04-29 EOD (session 30) — V36 multi-writer-sweep + phantom-branch fallback + V15 #8 deploy"
status: "Production = ae760c7 LIVE (V15 #8). master = ae760c7. V36 family closed. Phase 16.5 family LIVE."
current_focus: "V36 closed + V15 #8 deployed. Awaiting live QA on Phase 16.5 family + V36 stock fixes."
branch: "master"
last_commit: "ae760c7"
tests: 3597
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ae760c7"
firestore_rules_version: 20
storage_rules_version: 2
---

# Active Context

## State
- master = `ae760c7` · production = `ae760c7` (V15 #8 LIVE) · all commits in prod
- **3597/3597** focused vitest pass (3456 → 3597 = +141 across V36 family)
- Build clean · working tree clean · firestore.rules unchanged this deploy (idempotent re-publish)

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
**V36 closed + V15 #8 deployed.** Awaiting live QA on:
- V36 stock flows: treatment deduct at default branch → real movement (NOT SKIP); transfer/withdrawal post-deploy → movements visible at correct branch view; phantom-branch BranchContext fallback resolves to 'main' on next page load
- Phase 16.5 family (now LIVE): Remaining Course tab · cancel/exchange/refund flows · ProClinic course display · history tab · sale-cancel cascade · เพิ่มคงเหลือ button · staff dropdowns

OR proceed to **16.3 System Settings** (next sub-phase).

## Outstanding user-triggered actions
- Live QA on V36 + Phase 16.5 family at https://lover-clinic-app.vercel.app
- Pre-launch H-bis cleanup remains LOCKED OFF per `feedback_no_prelaunch_cleanup_without_explicit_ask.md`
- V13 incident from session 29: 1 unauthorized cancel on customer 2853 course 200 — REVERTED within 60s; audit entry kept (be_course_changes append-only)
