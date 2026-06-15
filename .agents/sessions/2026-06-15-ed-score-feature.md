# Checkpoint — 2026-06-15 EOD+2 — ED Score box + follow-up assessment (SHIPPED + DEPLOYED)

## Summary
A new **"สมรรถภาพ · ED Score" box** in CustomerDetailView shows a customer's ED scores (ADAM/IIEF/MRS/PE) with the latest round as a hero + expandable **deletable** history, and a button that opens a round-aware modal generating a **per-round link + full-screen mobile QR** so the clinic can send a follow-up assessment to the customer's phone. The customer fills it via the existing PatientForm follow-up render; a Cloud Function materializes the answers into a durable `be_assessments` collection. **Round 1 is derived LIVE from intake patientData → zero migration** (works immediately for current customers); round numbers are **date-rank derived (never stored) so deleting a round renumbers**. Shipped via `/brainstorming`→`/writing-plans`→`/executing-plans` (14 tasks) + `/audit` design; DEPLOYED (vercel + firestore.rules + functions).

## Current State
- master HEAD `3cf4b01b` (= origin/master; the probe #17 commit is a non-bundled diag script). Tree clean.
- prod = frontend `019df953` LIVE (vercel, lover-clinic-app.vercel.app HTTP 200) + firestore.rules **+be_assessments** DEPLOYED (Probe-Deploy-Probe) + functions `sendPushOnSubmit` (materialize CF) DEPLOYED.
- Full vitest **16482/0** + build clean + **Rule Q L2 12/0 on REAL prod** + flow-simulate 6/0.
- Zero-migration: LC-26000082 (just backfilled this session) shows its round-1 ED scores immediately — no data migration ran.
- Honest L1 gap (Rule Q): rendered-pixel verification (the box on a real authed customer, send modal+QR, materialize round-trip, delete-renumber, both themes) = USER hands-on; no browser was connected this session.

## Commits (this session, on master)
```
3cf4b01b chore(ed-score): Rule B probe #17 — be_assessments anon-lockdown (3/3 DENIED post-deploy)
019df953 fix(ed-score): audit-design a11y — modal role=dialog/aria-modal/aria-labelledby + icon aria-labels
12d3d215 fix(ed-score): regressions from full-suite + adversarial hunt — stripScreening exact-header, neutral formType, basePath
3b3ef798 test(ed-score): Rule I flow-simulate 6/0 + Rule Q L2 e2e real prod 12/0
2c360fc2 feat(ed-score): TFP หมายเหตุทั่วไป strips ED + shows clean ED latest-2; DX/Tx/Plan 2x + health-info enlarge
70474daf feat(ed-score): generateClinicalSummary includeScreening param — stop baking ED into customer note
e385d34c feat(ed-score): PatientForm renders multiple assessment sections per session.types[] + expiresAt gate
8287c671 feat(ed-score): materialize follow-up assessment into be_assessments via sendPushOnSubmit CF (durable)
(+ earlier ED-score commits: cores, backendClient, scopedDataLayer, EDScoreBox, EDFollowupModal, CDV wire, firestore.rules)
```

## Files Touched
- NEW: `src/lib/assessmentRoundsCore.js`, `src/lib/edScoreDisplay.js`, `src/components/backend/EDScoreBox.jsx`, `src/components/backend/EDFollowupModal.jsx`, `functions/assessmentMaterialize.js`
- MOD: `src/lib/backendClient.js` (assessmentsCol/Doc + listenToAssessments + create/deleteAssessmentRound + createAssessmentSession), `src/lib/scopedDataLayer.js` (universal listener + pass-throughs), `firestore.rules` (be_assessments), `src/components/backend/CustomerDetailView.jsx` (box wire + note strip), `src/components/TreatmentFormPage.jsx` (ED note + DX/Tx/Plan + health-info layout), `src/pages/PatientForm.jsx` (types[] multi-section gate + expiresAt), `src/utils.js` (generateClinicalSummary includeScreening), `src/lib/kioskPatientToCanonical.js` (note builder includeScreening=false), `functions/index.js` (materialize in sendPushOnSubmit)
- TESTS (new, all green): assessment-rounds-core (18), ed-score-display (12), be-assessments-crud (150), ed-score-box-rtl (6), ed-followup-modal-rtl (6), cdv-ed-box-wire (6), materialize-assessment (7), patientform-types-gate (4), note-no-screening (5), tfp-ed-note-layout (6), ed-assessment-flow-simulate (6)
- TEST V21 fixups: eod7-opd-review-modal (M1.1 expiry regex), phase-26-2-split-screen-source-grep (Item-E.4 note gate), v83-modal-explicit-close-only (M2.1 named handlers), branch-collection-coverage (be_assessments classified)
- SCRIPTS: diag-lc82-candidates, backfill-lc82-perf (LC-82 heal, applied), e2e-ed-assessment (L2 12/0), diag-be-assessments-anon-probe (probe #17)
- DOCS: docs/superpowers/specs|plans/2026-06-15-ed-score-box-followup-assessment*

## Decisions (1-line each)
- be_assessments = durable collection (not singleton) so history survives; round# DERIVED by date-rank → delete renumbers (no stored counter).
- Round 1 = virtual record from intake patientData → zero migration (immediate for current customers).
- `formType: 'followup_assessment'` is NEUTRAL — PatientForm gates by `types[]`, NOT formType (P1 fix: `'followup_ed'` had forced IIEF regardless of picked types).
- `stripScreeningSection` matches header by EXACT `ln.trim() === h` (P1 fix: `.startsWith` would eat a note line containing the screening word as content).
- `generateClinicalSummary(...,includeScreening=false)` ONLY for the note builder; print + intake-view keep ED (user Q11) — the AdminDashboard/PrintTemplates default-true "false positives" are correct by-design (Rule Q-honest).
- firestore.rules: be_assessments DELETE is ALLOWED (staff) — unlike append-only be_course_changes — because the user requires deletable rounds.
- audit-design a11y: modal role=dialog/aria-modal/aria-labelledby + icon-button aria-labels (P1 from `/audit`); named close handlers also sidestep AV78 backdrop-close regex.

## Next Todo
- USER hands-on L1 on live prod: box on LC-26000082; send modal + full-screen QR (scan on a phone); customer fills → materialize round; delete a round → renumber; TFP note + button alignment; both dark/light themes.

## Resume Prompt
```text
Resume LoverClinic — continue from 2026-06-15 EOD+2.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=3cf4b01b, prod=019df953)
3. .agents/active.md (16482 tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-06-15-ed-score-feature.md

Status: master=3cf4b01b (=origin), 16482/0 pass, prod frontend=019df953 LIVE + rules(be_assessments) + functions(materialize CF) DEPLOYED
Next: USER hands-on L1 of the ED Score box on lover-clinic-app.vercel.app (box on LC-26000082, send modal+QR, materialize, delete-renumber, TFP note+button-align, both themes)
Outstanding (user-triggered): ROTATE LINE/FB secrets (AV195); ภูดิท LC-26000151 unrecoverable → clinical re-assess
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe (Rule B)
/session-start
```
