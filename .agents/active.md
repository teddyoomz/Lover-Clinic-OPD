---
updated_at: "2026-06-16 EOD — ED follow-up v2 (confirm card / latest-link-only / round dates) + intake-date preserve (B) + 🔴 province fix — SHIPPED local, backfill APPLIED, NOT deployed."
status: "Feature complete on master (=origin). NOT deployed (awaiting explicit 'deploy'). Frontend-only — no firestore.rules / CF change. Rule-M backfill (assessmentDate ×154) APPLIED to prod."
branch: "master"
last_commit: "9f2870f9 — docs(agents): active.md — B intake-date preserve + backfill applied"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = 019df953 (PRE-v2). ED follow-up v2 NOT yet deployed. (be_customers.assessmentDate backfill is LIVE data; the date DISPLAY needs the v2 deploy.)"
firestore_rules_version: "unchanged (WS1 + C2-bis + be_assessments). v2 needs NO rules change."
tests: "16542 / 0 (full suite this session; intermittent load-flakes pass on re-run per V161). NOT re-run at session-end."
---

# Active — 2026-06-16 EOD — ED follow-up v2 + intake-date preserve (SHIPPED local, NOT deployed)

## State
- master HEAD `9f2870f9` (=origin), tree clean. 10 commits this session. Detail → checkpoint `.agents/sessions/2026-06-16-ed-followup-v2.md`.
- Full vitest **16542/0** + build clean + Rule Q **L1** (anon link: confirm card + province-submit success) + **L2 13/0** real prod + Rule-M backfill applied (154, idempotent, LC-82→2026-05-20).
- NOT deployed — frontend-only; backfill DATA is live but the date DISPLAY needs the deploy.

## What this session shipped (`/brainstorming`→spec→plan→8 tasks + B)
- **R1** read-only confirm card on the follow-up link (ชื่อ-สกุล+อายุ+เบอร์ปิดกลาง, passive, neutral) — `confirmInfo` snapshotted into the opd_session (no rule change); editable fallback for legacy links.
- **R2** session pill (`FW-ED-…`) removed from all PatientForm modes.
- **R3** `supersedePendingFollowups` — new link deletes prior PENDING session+round per customer+branch (latest-link-only).
- **R4** TFP note + CDV ED box both show each round's date (dd/mm/yyyy พ.ศ.) + "วันนี้" badge.
- **🔴 BUG-FIX** province check was unconditional → follow-up submit was BLOCKED ("กรุณาเลือกจังหวัด"); gated to `isIntake`.
- **B (เอาแม่นๆ)** intake `assessmentDate` was dropped by the customer projection (0/154) → now preserved (kiosk snake `assessment_date`→camel; addCustomer stamps once at CREATE; edit round-trips) + Rule-M backfill of 154 existing.

## Next action
- **DEPLOY** when user says "deploy" (V18): frontend-only `vercel --prod` — NO rules change → NO Probe-Deploy-Probe.
- Honest L1 gap: backend-authed pixel render (CDV box + TFP "วันนี้") = USER hands-on after deploy (no staff creds for automated backend L1).

## Outstanding user-triggered actions
- ⚠ ROTATE LINE/FB secrets (AV195, carried).
- ภูดิท LC-26000151 unrecoverable → clinical re-assessment.
- Candidate V-entries (next session): (1) L2/admin-SDK e2e bypasses client handleSubmit validation → unsubmittable province-block; only L1 caught it. (2) patientData field-drop recurs in the projection (assessmentDate after AV194/V141) — needs a preserved-field audit.
