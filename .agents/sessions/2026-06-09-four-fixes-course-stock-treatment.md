# 2026-06-09 — 4 fixes: แก้คงเหลือ(ลด/เพิ่ม)+Issue-4 index · treatment-count · stock customer-link · course-use editor — COMMITTED, NOT deployed

## Summary
Triage/fix pass via `/systematic-debugging` ×4 (user "เสร็จแล้วอนุมัติ แก้หมดเลย"). Four user-reported issues root-caused on real prod, fixed, regression-tested, committed + pushed. The marquee fix = the Issue-4 "wrong course shows Nebido" root cause: a positional index into a FILTERED array used against the FULL customer.courses.

## Current State
- master = `b8351546` (1 commit ahead of prod). Tree clean.
- prod = `e56d2ac7` (V doctor-name) — **NOT deployed** (frontend-only, no firestore.rules → vercel-only when authorized, no Probe-Deploy-Probe).
- Verified: full vitest **16277/0** + build clean + new bank `course-adjust-and-fixes-2026-06-09` **22/0** (incl. a REAL index-fix unit test) + 7 V21 fixups + Rule-Q L2 prod (movement customerId 43/43 sale + 152/152 tx; sale-name from authoritative result).
- #2 prod data SELF-HEALED (user re-created the treatment → CREATE rebuilds with the right id); `heal-stale-treatment-count.mjs --apply` = 0 drift (idempotent).

## Commits
```
b8351546 fix(customer/stock/course): แก้คงเหลือ ลด/เพิ่ม + Issue-4 wrong-course index + treatment-count + stock customer-link + course-use editor
```

## Files Touched
Source: treatmentBuyHelpers.js (grouping rawIndex) · CustomerDetailView.jsx (activeCourses+AddQtyModal redesign+CourseItemBar+purchase-history+treatmentEditorMap) · backendClient.js (adjustCourseRemainingQty + wrapper) · scopedDataLayer.js · SaleRowParts.jsx (reduceRemaining) · CourseHistoryTab.jsx (reduce kind+product+editor live-resolve) · MovementLogPanel.jsx (customer link) · src/hooks/useCustomerMap.js (NEW) · TreatmentFormPage.jsx (2 deduct sites → editor) · BackendDashboard.jsx:497 (id||proClinicId)
Tests: course-adjust-and-fixes-2026-06-09 (NEW) · treatment-delete-customer-id-resolution (NEW) · 7 V21 fixups (phase15.7-quater PAR1.4, phase16.5-quater, phase16.7-quinquies-ter, v136, v148, v36)
AV: audit-anti-vibe-code AV189 (bare .proClinicId class). Scripts: heal-stale-treatment-count.mjs + 6 diag-*.mjs (Rule R/M).

## Decisions (1-line)
- #1 INDEX is the root cause: originalIndex must be a customer.courses index, not a filtered-array position → carry {course,rawIndex} (also fixes exchange/share, Rule P).
- #1 sale/audit derive product+name from the authoritative mutation RESULT, never a UI snapshot (Issue-4 wrong-name). Q1=A toggle / Q2=A both write 0-baht sale / Q3=A product+bundle subline.
- #2 bare viewingCustomer.proClinicId = undefined for all LC-* (V33 class); sole surviving bare callsite. PAR1.4 only checked the getCustomer form → extended (V66-class guard gap).
- #4 course-USE "โดย ..." = OPD editor (editorContext.name), not doctor; live-resolve existing from treatment.editedByName (V113, no backfill).
- Thai-culture rule 04: modal title teal, stock link sky — never red on a NAME.

## Next Todo
- IDLE / await direction. If "deploy" → vercel-only (no rules), then L1 hands-on.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-09 EOD.
Read: CLAUDE.md → SESSION_HANDOFF.md (master=b8351546, prod=e56d2ac7) → .agents/active.md → .claude/rules/00-session-start.md → this checkpoint.
Status: master=b8351546 (1 ahead of prod, NOT deployed); 4 fixes committed (แก้คงเหลือ ลด/เพิ่ม + Issue-4 index + treatment-count + stock customer-link + course-use editor); full vitest 16277/0.
Next: idle / await direction (deploy = vercel-only when authorized).
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules.
/session-start
