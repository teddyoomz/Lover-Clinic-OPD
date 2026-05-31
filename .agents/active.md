---
updated_at: "2026-05-31 EOD+2 — V139 (OPD course-step + status↔tab sync) DONE+verified; V138 also still held. Both UNCOMMITTED."
status: "V139 + V138 code done + full-verified but NOT committed/deployed (held — no commit auth this turn). prod UNCHANGED = 409804fc."
branch: "master"
last_commit: "06e0fca8 (V135/V136/V137) + EOD-docs commits. V138 + V139 SOURCE both uncommitted in working tree."
tests: "V139: course-step 14/0 + status-sync 12/0 + flow-sim 17/0 (43 new) + V21 fixups (opd-stepper-polish, v71-mark, v71-opd-stepper-row, v71a) + FULL vitest 15319/0 (698 files) + build clean + TRUE-L2 e2e 13/0 real prod + theme-AA visual (Chrome MCP). V138: 34/0 + e2e 12/0 (unchanged, still held)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "409804fc LIVE (V135/V136/V137). V138 + V139 NOT deployed."
firestore_rules_version: "UNCHANGED — V138 + V139 are frontend/lib only (no rules/storage/index/cron → frontend-only deploy, no Probe-Deploy-Probe)."
---

# Active Context — V139 OPD course-step + status↔tab sync (2026-05-31 EOD+2)

## State
- `/brainstorming → spec → writing-plans → executing-plans` (inline, 8 tasks). 2 user-requested features, both DONE + fully verified, **UNCOMMITTED/HELD** (no commit auth this turn).
- **V138 ALSO still held** (negative-batch status invariant — heal/commit/deploy all gated from prior turn). Both feature sets sit in the working tree together.

## V139 — what shipped (detail → checkpoint 2026-05-31-v139-opd-course-step-status-sync.md)
- **Feature 1 — ขั้น "คอร์ส" ในสเต็ปเปอร์ OPD** (card "นัดหมาย วันนี้"): 4 ขั้น ซักประวัติ→แพทย์→**คอร์ส**→เสร็จ. ตัดคอร์ส=violet ✓ · เสร็จแต่ไม่ตัด=amber "ยังไม่ตัด" (Q1=B) · กำลังทำ=เลขจาง. SSOT `resolveCourseDeducted`/`resolveCourseStepState` (treatmentDisplayResolvers.js, reads `detail.courseItems`/`treatmentItems` — Rule R confirmed: top-level=0 on prod). opt-in `withCourseStep` prop → CDV history คง 3 ขั้นเดิม. Live ฟรี (listenToTreatmentsByDateRange เดิม).
- **Feature 2 — sync status ↔ tab (real-time ทุก surface)**: pure `decideApptStatusServiceSync` (appointmentDisplay.js) wired 3 chokepoints in backendClient.js — markAppointmentServiceCompleted(+status:'done'), unmark(+status:'confirmed'), updateBackendAppointment(stamp/clear serviceCompletedAt on done-boundary). serviceCompletedAt ยังเป็น SSOT ของ tab → ไม่แตะ filter, ไม่ migrate. Live ฟรี (onSnapshot เดิม, Frontend hub + Backend calendar).
- **AV159** (course SSOT + status-sync coupling). Files: 2 src libs + stepper + row + backendClient + appointmentDisplay (mod); 3 V139 tests + 2 scripts (diag + e2e) (new); 4 V21 test fixups.

## Files touched (V139 — uncommitted/held, stacked on V138)
- src: `treatmentDisplayResolvers.js` · `appointmentDisplay.js` · `backendClient.js` (also V138) · `components/backend/treatment-history/TreatmentLifecycleStepper.jsx` · `components/admin/AppointmentOpdStepperRow.jsx`
- skill: `.agents/skills/audit-anti-vibe-code/SKILL.md` AV159 (also V138 AV158)
- tests new: `tests/v139-opd-course-step.test.jsx` · `tests/v139-appt-status-service-sync.test.js` · `tests/v139-flow-simulate.test.js`
- tests V21 fixup: `opd-stepper-polish` · `v71-mark-service-completed` · `v71-opd-stepper-row` · `v71a-edit-fix-and-unmark`
- scripts new: `scripts/diag-opd-course-step-field-path.mjs` (Rule R) · `scripts/e2e-v139-status-sync-course-step.mjs` (TRUE-L2 13/0)
- docs: spec + plan HTML + mockup

## Honest Rule Q gap (disclose)
- TRUE-L2 (13/0 real prod) proved the SHIPPED coupling fns + `resolveCourseDeducted` on real data; pure+RTL prove stepper states; theme-AA seen via Chrome MCP (faithful Tailwind repro).
- **USER L1 post-deploy** = the ASSEMBLED real-browser flow on the auth-gated AdminDashboard: deduct a course → course dot lights live on the real card; mark-complete / edit-modal-status cross-surface → card hops tab live cross-device.

## Next action / Outstanding (user-triggered)
- **Commit** V139 (+ decide grouping vs held V138 — backendClient.js + SKILL.md carry both).
- **Deploy** (frontend-only, no rules → no Probe-Deploy-Probe; V18 needs "deploy").
- **V138 still held**: heal `--apply` (3 prod batches) + commit + deploy.
- **L1 hands-on** prod (both V139 + V138) after deploy.
- Pre-existing (large, NOT deploy-gating): extended-suite 280 stale tests.
