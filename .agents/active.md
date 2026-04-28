---
updated_at: "2026-04-29 EOD (session 29) — Phase 16 kickoff + 16.5 base/bis/ter/quater"
status: "Production = cf54400 LIVE (V15 #4). master = 2aae710 with 5 commits unpushed-to-prod (Phase 16.5 family + P0 hotfix)."
current_focus: "Phase 16.5 closed (4 sub-phases shipped). Awaiting deploy auth OR proceed to 16.3 System Settings."
branch: "master"
last_commit: "2aae710"
tests: 3456
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "cf54400"
firestore_rules_version: 20
storage_rules_version: 2
---

# Active Context

## State
- master = `2aae710` · production = `cf54400` (V15 #4 LIVE) · 5 commits unpushed-to-prod
- **3456/3456** focused vitest pass (3312 → 3456 = +144 across all 16.5 sub-phases)
- Build clean · working tree clean · firestore.rules unchanged this session

## What this session shipped (2026-04-29 — session 29)
6 commits — see [`.agents/sessions/2026-04-29-session29-phase16-5-family.md`](.agents/sessions/2026-04-29-session29-phase16-5-family.md)
- **V15 #7 deploy** + phantom branch BR-1777095572005-ae97f911 cleanup (51 ops via /api/admin/cleanup-phantom-branch)
- **Phase 16.5 base** — Remaining Course tab + 3 modals (Cancel/Refund/Exchange) + cancelCustomerCourse helper + 5 test files (+112 tests)
- **Phase 16.5-bis** — surface ProClinic-cloned courses (1384/1384 were skipped) + effective status promotion (qty=0 → 'ใช้หมดแล้ว') + pagination 20/page
- **P0 hotfix** — buildChangeAuditEntry undefined-courseId crash (V14 lock pattern; coerce undefined → null/'')
- **Phase 16.5-ter** — staff dropdowns (Cancel + Exchange + SaleTab cancel) + applySaleCancelToCourses flip-status cascade + SaleDetailModal staff display
- **Phase 16.5-quater** — addQty bug fix (reverseQty math) + cancel REMOVES course from array + audit unification (kinds: add/exchange/share/cancel/refund/use) + NEW CourseHistoryTab + treatment-deduction emit on save
- **Memory locks**: `feedback_no_real_action_in_preview_eval.md` (NEVER click real action btns in preview) + `feedback_no_prelaunch_cleanup_without_explicit_ask.md` (LOCKED OFF)

## Next action
**Phase 16.5 closed.** Awaiting deploy auth (V18) OR proceed to **16.3 System Settings** (next sub-phase).

## Outstanding user-triggered actions
- V15 #8 combined deploy auth (5 commits ready: 6aae9c3 + ae865db + 51a4141 + 6c82d3c + 2aae710)
- After deploy: live QA on 16.5 family — Remaining Course tab · cancel/exchange/refund flows · ProClinic course display · history tab · sale-cancel cascade · เพิ่มคงเหลือ button · staff dropdowns
- V13 incident from this session: 1 unauthorized cancel on customer 2853 course 200 — REVERTED within 60s; audit entry kept (be_course_changes append-only)
