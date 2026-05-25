# Checkpoint — 2026-05-25 EOD+1 — Customer Patient-Link SHIPPED + DEPLOYED + 2 L1 bugfixes

## Summary

Shipped an anon customer-facing data link: a 🔗 "ลิงก์ดูข้อมูล" button in CustomerDetailView generates a `?patient=<token>` URL the customer opens **without login** to see their **existing** PatientDashboard view + upcoming appointments (📍 สาขา + full Thai month) + remaining courses. Full `brainstorming → spec → writing-plans → executing-plans` (8 tasks) + 2 `/systematic-debugging` bugfix cycles. Deployed (feature + AV127 course fix LIVE); AV128 appt fix committed deploy-pending.

## Current State

- **prod `9d82e923` LIVE** (feature + AV127 used-up-course fix) — `vercel --prod` frontend + serverless endpoint, NO firestore.rules change.
- **master `0df352fa`** (+AV128 done-appt fix) — committed + pushed, **DEPLOY-PENDING** (V18; on "deploy" = `vercel --prod`).
- Full suite **14551/0 GREEN @ session start**; F6/F7 bugfix tests additive (no regression); build clean; audit-branch-scope 106/0. Full suite NOT re-run post-AV128 (user rejected the 206s gather — targeted green).
- **NO firestore.rules change** — be_customers/be_appointments/be_branches/be_courses stay clinic-staff; the endpoint (admin SDK) is the secure anon path. Opening anon-read would expose the PII DB.

## Architecture

- **Token**: crypto `getRandomValues` token on `be_customers` (clinic-staff client write via `generateCustomerPatientLink` / `setCustomerPatientLinkEnabled` / `revokeCustomerPatientLink` in backendClient + scopedDataLayer re-exports).
- **Endpoint** `api/patient-view.js` (NEW, public GET, admin SDK): unified resolve — `be_customers` first by `patientLinkToken`, then legacy `opd_session` (via `brokerProClinicId`); field-minimized (NO national ID); future-only appts + branchId→ชื่อ resolve + `fmtThaiDate(monthStyle:'full')` + `startTime`/`endTime` range. Returns the `latestCourses`-shaped payload PatientDashboard already renders.
- **PatientDashboard customer-mode**: endpoint-first useEffect → map to `{__customerMode, patientData, brokerProClinicHN, latestCourses:{courses, expiredCourses, appointments, patientName}}` → **reuse render 100%** (AppointmentCard already had a 📍 branch slot via `[a.branch, a.room]`). Gates: auto-sync skipped when `__customerMode`; legacy opd_session listener fires only when `legacyFallback` (endpoint error); SyncButton hidden.

## 2 L1 bugfixes (user-caught on prod — Rule P class-of-bug, both fixed in endpoint + `fetchCoursesViaApi`)

- **AV127** — exclude used-up courses. `isUsableActive(c)` = `deriveEffectiveStatus(parseStatusFromCourse(c), total, remaining) === STATUS_ACTIVE`. Buffet-safe (total 0 → kept; finite total>0 && remaining<=0 → ใช้หมดแล้ว → dropped). "0/1 กำลังใช้งาน" no longer shows. Ref: `lineBotResponder.formatCoursesReply` V33.8 + RemainingCourseTab.
- **AV128** — exclude completed/serviced appts from "นัดหมายครั้งต่อไป". `COMPLETED_APPT_STATUSES = {done, completed, มาตามนัด, ชำระเงิน}` (mirrors `didAttend`) + `serviceCompletedAt`/`wasServiceCompleted` (AppointmentHub "service done" signal). Ref: appointmentAnalysisAggregator + appointmentHubFilters.

## Commits

```
0df352fa fix(patient-link): exclude completed/serviced appts from upcoming (AV128)        [DEPLOY-PENDING]
9d82e923 fix(patient-link): exclude used-up courses from patient view (AV127)             [DEPLOYED]
90a2dd62 docs(handoff): customer patient-link feature SHIPPED LOCAL
c9a855ce test(v21-fixup): v75 button 3→4 + v116 SG3 retarget to cron core
f5336d55 test(patient-link): Rule Q L2 real-prod e2e — 11/0 PASS
3561fa7e test(patient-link): Rule I flow-simulate + AV126 anon-safety
f3d85183 feat(patient-link): PatientDashboard customer-mode
56da1347 feat(patient-link): CustomerDetailView Layout A button row + 🔗 + modal
bcb8499b feat(patient-link): CustomerPatientLinkModal (AV78 explicit-close)
1c4caa24 feat(patient-link): public token-gated endpoint + backendClient helpers + Rule R diag
8dbbe882 docs(plan): customer patient-link implementation plan (8 tasks)
846ba5e8 docs(spec): customer patient-link v2 — reuse PatientDashboard view + unified endpoint
0d3b0cac docs(spec): customer patient-link design — token-gated public endpoint
```

## Files Touched

- NEW `api/patient-view.js`
- NEW `src/components/backend/CustomerPatientLinkModal.jsx`
- `src/components/backend/CustomerDetailView.jsx` (Layout A button row + 🔗 + modal wire)
- `src/pages/PatientDashboard.jsx` (customer-mode + course/appt effective-status filters in fetchCoursesViaApi)
- `src/lib/backendClient.js` (3 helpers) + `src/lib/scopedDataLayer.js` (re-exports)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV126/127/128)
- NEW tests: `customer-patient-link-helpers.test.js` (15/0) · `customer-patient-link-modal-rtl.test.jsx` (7/0) · `customer-detail-patient-link-button.test.jsx` (6/0) · `customer-patient-link-flow-simulate.test.js` (15/0; F6=course, F7=appt)
- 2 V21 fixups: `v75-button-polish-rtl` (3→4), `v116` SG3 (retargeted to `opdSessionCleanupCore.js`)
- NEW `scripts/e2e-customer-patient-link.mjs` (Rule Q L2, 11/0) · `scripts/diag-patient-link-appointments.mjs` (Rule R) · `scripts/diag-patient-view-handler-invoke.mjs`
- NEW `docs/superpowers/specs/2026-05-25-customer-patient-link-design.html` + `docs/superpowers/plans/2026-05-25-customer-patient-link.html`

## Decisions (1-line each)

- Q1 = customer-level link (not session-level) — link survives across visits; revocable per-customer.
- Anon-read of be_* REJECTED (exposes PII DB) → server endpoint (admin SDK) is the only secure path; rules unchanged.
- Reuse PatientDashboard view 100% (user directive) — feed via endpoint, don't redesign.
- Snapshot semantic N/A — customer view is always-live (endpoint reads current be_customers/be_appointments).
- Both bugfixes applied to endpoint AND fetchCoursesViaApi (Rule P class-of-bug — same filter, two readers).

## Verification (Rule Q)

- **L2 e2e 11/0 on real prod** (`e2e-customer-patient-link.mjs`): resolve + gate + courses-split + future/cancelled filter + "30 พฤษภาคม 2569" full-month + "10:00 - 10:30 น." + branch "นครราชสีมา" + cleanup.
- **Handler-invoke** against real customer ไพบูลย์ LC-26000106: courses 0 (both used-up), appts 1 (4 มิ.ย. pending; 25 พ.ค. done dropped). Confirms AV127 + AV128 on real data.
- **Rule R diag**: LC-26000101 resolves; real appt field = `startTime` (not `time`).
- L1 hands-on = USER post-AV128-deploy (hard-refresh ไพบูลย์'s prod link → 1 upcoming appt + "ไม่มีคอร์ส").

## Next Todo

1. **DEPLOY AV128 fix `0df352fa`** — user says "deploy" → `vercel --prod` (frontend + endpoint; no rules). Then ไพบูลย์'s link drops the 25 พ.ค. done appt.
2. Rule Q L1: user re-test prod link (hard refresh) → ไพบูลย์ = 1 upcoming appt + "ไม่มีคอร์ส".

## Resume Prompt

Resume LoverClinic — continue from 2026-05-25 EOD+1.

Read: CLAUDE.md → SESSION_HANDOFF.md (prod=9d82e923, master=0df352fa) → .agents/active.md → .claude/rules/00-session-start.md.

Status: customer patient-link DEPLOYED (feature + AV127 LIVE @ 9d82e923). AV128 done-appt fix `0df352fa` committed+pushed, NOT deployed.
Next: deploy `0df352fa` (`vercel --prod`, no rules) when user says "deploy" → then ไพบูลย์'s link shows only the 4 มิ.ย. pending appt.
Rules: no deploy without "deploy" THIS turn (V18); Rule Q real-adversarial before any "verified" claim.
/session-start
