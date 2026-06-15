---
updated_at: "2026-06-15 EOD+2 — ED Score box + follow-up assessment SHIPPED + DEPLOYED (brainstorm→plan→14-task impl→Rule Q L2 12/0→deploy). 16482/0."
status: "Feature LIVE. master=3cf4b01b (=origin), prod frontend=019df953 LIVE + firestore.rules DEPLOYED (be_assessments) + functions (materialize CF). Tree clean."
branch: "master"
last_commit: "3cf4b01b — chore(ed-score): Rule B probe #17 — be_assessments anon-lockdown (client SDK, 3/3 DENIED post-deploy)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = 019df953 LIVE (HTTP 200; ED Score box + materialize CF); firestore.rules = +be_assessments (deployed, Probe-Deploy-Probe)."
firestore_rules_version: "WS1 + C2-bis + be_assessments (staff-only read/create/update/DELETE)."
tests: "16482 / 0 (this session's last run — NOT re-run per no-tests rule)."
---

# Active — 2026-06-15 EOD+2 — ED Score box + follow-up assessment (SHIPPED + DEPLOYED)

## State
- prod LIVE: vercel frontend `019df953` + firebase rules (+be_assessments) + functions (`sendPushOnSubmit` materialize CF). master HEAD `3cf4b01b` (=origin; probe #17 diag, non-bundled). Tree clean.
- Full vitest **16482/0** + build clean + **Rule Q L2 12/0 on REAL prod** + flow-simulate 6/0. 6-agent adversarial hunt + full-suite caught & fixed 5 real issues + 3 V21 test fixups + audit-design a11y.
- Zero-migration: round 1 derived LIVE from intake patientData → LC-26000082 (just backfilled) shows immediately, no data migration.

## What this session shipped
- **ED Score box** in CustomerDetailView (right col, under the 4-tab course box): latest round hero + 4 chips (ADAM/IIEF/MRS/PE) + expandable deletable history (followups only; intake `__intake__` not deletable) + "ครั้งที่ N" send button. Theme-aware both themes; Thai-culture safe (no red on names).
- **EDFollowupModal** — round-aware type picker + per-round link + **full-screen mobile QR** (`generateQrDataUrl width:600`). Neutral `formType:'followup_assessment'` (PatientForm gates by `types[]`); 128-bit crypto id; `expiresAt` = +1 day OR on-complete.
- **be_assessments** durable collection (`createAssessmentRound`/`deleteAssessmentRound`/`createAssessmentSession`/`listenToAssessments`) + BSA universal listener + `assessmentRoundsCore.js` (date-rank derived round# → delete renumbers) + `edScoreDisplay.js`.
- **Materialize CF** — `sendPushOnSubmit` runs `assessmentMaterialize` (non-fatal, canonical BASE_PATH) → completed follow-up → durable round.
- **TFP/CDV note** — strip ED from CDV note; TFP หมายเหตุทั่วไป shows clean ED latest-2 + dates (`generateClinicalSummary(...,includeScreening=false)` for the note builder ONLY; print/intake-view keep it). DX/Tx/Plan 2× taller (rows 6/6/4) + health-info rows 4 → both save buttons row-align.
- Detail → checkpoint `.agents/sessions/2026-06-15-ed-score-feature.md`.

## Next action
- **USER hands-on L1** on live prod (lover-clinic-app.vercel.app): the box on LC-26000082; send modal + full-screen QR; customer fills → materialize; delete a round → renumber; TFP note + button alignment; both themes. (L1 visual gap honestly disclosed — no browser connected this session.)

## Outstanding user-triggered actions
- ⚠ ROTATE LINE/FB secrets (chat_config held OLD — AV195, carried).
- ภูดิท LC-26000151 = unrecoverable by data (session deleted + not in backups) → clinical re-assessment.
