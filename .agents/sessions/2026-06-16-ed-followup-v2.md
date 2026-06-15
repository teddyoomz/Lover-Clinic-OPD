# Checkpoint — 2026-06-16 — ED follow-up v2 (confirm card / latest-link-only / round dates) + intake-date preserve (B) + 🔴 province fix

## Summary
A 4-request improvement to the ED follow-up assessment flow (`/brainstorming`→spec→`/writing-plans`→`/executing-plans`, 8 tasks) plus a thoroughness pass (B) and a live prod bug found while reading the submit path. SHIPPED to master (10 commits), Rule-M backfill APPLIED to prod, **NOT deployed** (awaiting "deploy"; frontend-only, no rules change → no Probe-Deploy-Probe).

## Current State
- master HEAD `9f2870f9` (=origin); tree clean. prod = frontend `019df953` (PRE-v2) — backfill DATA is live, but the date DISPLAY needs the v2 deploy.
- Full vitest **16542/0** + build clean + Rule Q **L1** (anon link: confirm card + province-submit success) + **L2 13/0** real prod + Rule I flow-sim 6/0.
- Rule-M backfill APPLIED: 154 customers stamped `patientData.assessmentDate` (29 from exact intake-session date, 125 from createdAt); idempotent (re-run 0); audit `backfill-assessmentdate-1781546629477-1cbbacc8`; LC-26000082 → 2026-05-20.
- Honest gap (Rule Q): backend-authed pixel render (CDV ED box + TFP "วันนี้" badge) = USER hands-on after deploy — no staff creds for an automated backend L1 (the anon-link confirm-card + province-submit WERE L1-verified).
- No firestore.rules / Cloud Function / index change. The intake-date IS findable (proven: LC-82 intake session `BL-1779253531712` assessmentDate "2026-05-20" === createdAt).

## Commits (this session, on master)
```
9f2870f9 docs(agents): active.md — B intake-date preserve + backfill applied
6d3b35fc feat(ed-followup): R4 consistency — CDV ED box also shows round date + วันนี้
f4bf18d7 feat(ed-followup): preserve intake assessmentDate through customer projection (B)
ec06e81c docs(agents): active.md — v2 SHIPPED local + Rule Q L1/L2 verified
c2278190 test(ed-followup): Rule Q L2 e2e on real prod (supersede + confirmInfo + materialize 13/0)
4db1dbac test(ed-followup): Rule I v2 flow-simulate + V21 fixups
506c2b96 feat(ed-followup): R4 TFP note shows each round date + วันนี้ badge
dd6ab10b feat(ed-followup): R1 confirm card (+fallback) + R2 remove pill + 🔴 fix province blocking submit
d832f3db feat(ed-followup): modal supersedes prior pending link + snapshots confirmInfo from CDV
2c7e7a9f feat(ed-followup): R1 confirmInfo on session + R3 supersedePendingFollowups
(+ 4fb37cf3 docs spec+plan)
```

## Files Touched
- SRC: `src/lib/edScoreDisplay.js` (maskPhone/buildConfirmInfo/formatRoundDate) · `src/lib/backendClient.js` (shouldSupersedeSession/supersedePendingFollowups + confirmInfo param + assessmentDate carry in buildPatientDataFromForm/buildFormFromCustomer + addCustomer stamp) · `src/lib/scopedDataLayer.js` (supersede pass-through) · `src/lib/kioskPatientToCanonical.js` (preserve snake assessment_date) · `src/components/backend/EDFollowupModal.jsx` (supersede+confirmInfo) · `src/components/backend/CustomerDetailView.jsx` (buildConfirmInfo + intakePerf merge + customerCreatedISO) · `src/components/backend/EDScoreBox.jsx` (formatRoundDate + วันนี้) · `src/pages/PatientForm.jsx` (R1 card + R2 pill + province gate) · `src/components/TreatmentFormPage.jsx` (R4 date + วันนี้ + intake-date)
- TESTS (new): ed-confirm-and-date-helpers · ed-supersede-and-confirminfo-source · ed-followup-modal-supersede-rtl · patientform-followup-confirm-card-source · tfp-ed-round-date-source · ed-followup-v2-flow-simulate · ed-intake-assessmentdate-preserve
- TEST fixups (V21/contract): cdv-ed-box-wire · tfp-ed-note-layout · ed-followup-modal-rtl · v55-1-snapshot-byte-identical (+assessment_date) · v136-course-stock-flow-simulate (CRLF normalize) · TFP H-quater comment reword
- SCRIPTS: e2e-ed-followup-v2 (L2 13/0) · backfill-customer-intake-assessment-date (Rule M, applied) · diag-ed-followup-data-reality · diag-ed-intake-date-source
- DOCS: docs/superpowers/specs|plans/2026-06-15-ed-followup-confirm-supersede-date*

## Decisions (1-line each)
- R1 confirm card: name + age + masked-phone (NO HN — customers don't know it), passive (no gate button); `confirmInfo` snapshotted into the session (anon-readable, no rule change); editable fallback when confirmInfo absent.
- R3 supersede: hard-delete prior PENDING follow-up session + its linked pending round per customer+branch; best-effort + no lock (manual flow); single-field `where(linkedCustomerId)` query (auto-indexed).
- R4 date: dd/mm/yyyy พ.ศ. + "วันนี้" when == today; shown in BOTH TFP note AND CDV ED box (consistency).
- 🔴 province: the unconditional check shipped a customer-unsubmittable follow-up form; only L1 real-browser submit caught it (L2/admin-SDK e2e bypasses client handleSubmit validation) — gate `isIntake`.
- B intake-date: projection dropped `assessmentDate` for ALL customers (0/154) — preserve as SNAKE `assessment_date` in the canonical form (no camelCase leak, Phase 23.0) → camel on patientData; addCustomer stamps once at CREATE; edit round-trips; Rule-M backfill of existing (intake-session date where derivable, else createdAt).
- Pre-existing flakes surfaced by the full-suite: v136 L5 + H-quater regression-guard fail on the Windows CRLF working tree (`indexOf` LF-literal / `//.*$` vs trailing `\r`) — fixed (CRLF-normalize / comment reword); not my regressions.

## Next Todo
- USER: say "deploy" → frontend-only `vercel --prod` (no rules → no Probe-Deploy-Probe). Then optional USER L1 of the CDV box + TFP "วันนี้" date (backend-authed).
- Candidate V-entries: (1) L2/admin-SDK e2e bypasses client validation → unsubmittable province-block; only L1 caught it (Rule Q). (2) patientData field-drop recurs in the customer projection (assessmentDate, after AV194 perf + V141 visit_reasons) — projection needs a preserved-field audit.
- Carried: ROTATE LINE/FB secrets (AV195); ภูดิท LC-26000151 unrecoverable → clinical re-assess.

## Resume Prompt
```text
Resume LoverClinic — continue from 2026-06-16 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=9f2870f9, prod=019df953)
3. .agents/active.md (16542 tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-06-16-ed-followup-v2.md

Status: master=9f2870f9 (=origin, 10 commits), 16542/0 pass, prod=019df953 (PRE-v2) — ED follow-up v2 SHIPPED local + Rule-M backfill APPLIED, NOT deployed
Next: USER says "deploy" → vercel --prod (frontend-only, no rules → no Probe-Deploy-Probe); then optional USER L1 of CDV box + TFP "วันนี้" date
Outstanding (user-triggered): ROTATE LINE/FB secrets (AV195); ภูดิท LC-26000151 unrecoverable → clinical re-assess
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe (Rule B)
/session-start
```
