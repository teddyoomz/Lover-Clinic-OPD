---
updated_at: "2026-05-25 EOD+1 — Customer patient-link SHIPPED LOCAL (not deployed)"
status: "master 13 ahead of prod 9af2989e (feature + prior tooling). NOT deployed. Full suite 14551/0 GREEN."
branch: "master"
last_commit: "c9a855ce test(v21-fixup): v75 button 3→4 + v116 SG3 retarget to cron core"
tests: "14551 PASS / 0 FAIL (full suite). Feature targeted: endpoint 11 + helpers 4 + modal 7 + CDV 6 + flow-sim 6. Rule Q L2 e2e 11/0 on REAL prod. Rule R diag confirmed field shape."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "9af2989e LIVE (unchanged — feature NOT deployed)"
firestore_rules_version: "unchanged (NO rules change in this feature — be_* stay clinic-staff)"
---

# Active Context

## State
- **Customer patient-link feature DONE (local, 8 tasks, brainstorm→spec→plan→executing-plans).** 🔗 button in CustomerDetailView (Layout A: action group + แยกปุ่มลบ) → modal → anon link `?patient=<token>` shows the EXISTING PatientDashboard view + นัดหมายครั้งต่อไป (📍 สาขา + เดือนเต็ม) + คอร์สคงเหลือ. No login needed.
- **Architecture**: token on be_customers (clinic-staff write) → NEW public `api/patient-view.js` (admin SDK, unified resolve be_customers OR opd_session, field-minimized). PatientDashboard customer-mode = endpoint-first + reuse render + gate auto-sync + legacy opd_session fallback. **NO firestore.rules change** (be_*/be_appointments/be_branches stay clinic-staff; endpoint is the secure anon path). AppointmentCard already had a 📍 branch slot — just feed `a.branch` (resolved name) + full-month date.
- **Reuse, not redesign** — user corrected mid-brainstorm: patient view = existing design 100%; only ADD appointments-with-branch.
- AV126 (anon-safety) added. 2 V21 fixups absorbed (v75 button 3→4; v116 SG3 retargeted to cron core after the 2026-05-24 perf-cron relocation — V116 behavior verified intact in opdSessionCleanupCore.js).

## What this session shipped (11 feature commits, pushed, NOT deployed)
- `api/patient-view.js` (NEW) · `src/lib/backendClient.js` (3 helpers) · `scopedDataLayer.js` re-export
- `src/components/backend/CustomerPatientLinkModal.jsx` (NEW) · `CustomerDetailView.jsx` (Layout A + 🔗 + modal)
- `src/pages/PatientDashboard.jsx` (customer-mode)
- tests: helpers(15) + modal(7) + CDV-button(6) + flow-simulate(6) · `scripts/{diag,e2e}-*` · AV126
- spec + plan HTML in `docs/superpowers/{specs,plans}/2026-05-25-customer-patient-link*`

## Next action
- **AWAIT user "deploy"** (V18 — no deploy without explicit auth THIS turn). On deploy: `vercel --prod` (frontend + the new serverless endpoint deploy together). NO firestore rules change → no Probe-Deploy-Probe needed for this feature.
- **Then Rule Q L1** (real browser, Rule S): CustomerDetailView → 🔗 → สร้างลิงก์ → copy → open in fresh/incognito (anon) → verify patient card + นัดหมาย (เดือนเต็ม + 📍 สาขา) + คอร์ส render, no login. Toggle off → "ปิดใช้งาน". Revoke → "ไม่พบข้อมูล". (Note: a customer needs a FUTURE appointment to show the นัดหมาย section — อุดม/LC-26000101's only appt was 2026-05-24, past → none show, correct.)

## Outstanding user-triggered actions
- Deploy the customer patient-link feature (`vercel --prod`)
- Rule Q L1 hands-on for the patient-link (after deploy)
- (carryover) L1 verify V124+V125+V126 cancel/mark-complete · นัดหมาย-tab unification brainstorm · cron monitoring (passive)
