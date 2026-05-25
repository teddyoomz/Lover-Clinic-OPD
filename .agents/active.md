---
updated_at: "2026-05-25 EOD+1 — Customer patient-link SHIPPED + DEPLOYED (+2 L1 bugfixes)"
status: "prod 9d82e923 LIVE (feature + AV127 used-up-course fix). master 0df352fa (+AV128 done-appt fix, DEPLOY-PENDING). targeted tests green."
branch: "master"
last_commit: "0df352fa fix(patient-link): exclude completed/serviced appts from upcoming (AV128)"
tests: "flow-sim 15/0 · helpers 15/0 · modal 7/0 · CDV 6/0 · PD-ref 286/0 · Rule Q L2 e2e 11/0 REAL prod · handler-invoke real prod. Full suite 14551/0 @ session start; F6/F7 additive (no regression). Full suite NOT re-run post-bugfix (user-rejected the 206s gather)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "9d82e923 LIVE (feature + AV127 course fix). 0df352fa (AV128 appt fix) committed, NOT deployed."
firestore_rules_version: "unchanged (NO rules change — endpoint is the secure anon path; be_* stay clinic-staff)"
---

# Active Context

## State
- Customer patient-link SHIPPED + DEPLOYED. 🔗 in CustomerDetailView (Layout A: action group + แยกปุ่มลบ) → CustomerPatientLinkModal → anon `?patient=<token>` (no login) → EXISTING PatientDashboard view + นัดหมายครั้งต่อไป (📍สาขา + เดือนเต็ม) + คอร์สคงเหลือ.
- Architecture: token on be_customers (clinic-staff write) → public `api/patient-view.js` (admin SDK, unified resolve be_customers OR opd_session, field-minimized). PatientDashboard customer-mode = endpoint-first + reuse render + gate auto-sync + legacy fallback. **NO firestore.rules change** (endpoint = secure anon path; opening anon-read would expose PII DB).
- 2 L1 bugfixes (user-caught on prod, systematic-debugging + Rule P class-of-bug): **AV127** = exclude used-up courses (deriveEffectiveStatus, buffet-safe); **AV128** = exclude completed/serviced appts from upcoming (didAttend set + serviceCompletedAt). Both fixed across endpoint + fetchCoursesViaApi.

## What this session shipped
- brainstorm→spec→plan→executing-plans (8 tasks) + 2 bugfix cycles (Visual Companion mockups; Rule R diag; Rule Q L2/L1)
- NEW `api/patient-view.js` + `CustomerPatientLinkModal.jsx`; CustomerDetailView Layout A; PatientDashboard customer-mode + course/appt effective-status filters; backendClient 3 helpers + scopedDataLayer
- AV126/127/128 + F1-F7 flow-sim + helpers/modal/CDV tests + e2e + diag scripts + spec/plan HTML
- DEPLOYED twice (feature + AV127 course fix); AV128 appt fix committed deploy-pending
- Skill-repo session (prior, 5a82c856/ccbd3cf5) also unshipped tooling
- Detail → `.agents/sessions/2026-05-25-customer-patient-link.md`

## Next action
- **DEPLOY the AV128 done-appt fix (`0df352fa`)** — `vercel --prod` (frontend + endpoint; no rules deploy). Then ไพบูลย์'s link shows only the 4 มิ.ย. pending appt (25 พ.ค. done dropped).
- Rule Q L1: user re-test the prod link (hard refresh) → ไพบูลย์ = 1 upcoming appt + "ไม่มีคอร์ส".

## Outstanding user-triggered actions
- Deploy `0df352fa` (AV128 appt fix) — say "deploy"
- L1 re-test patient link on prod
- (carryover) L1 verify V124-126 · นัดหมาย-tab unification brainstorm · cron monitoring (passive)
