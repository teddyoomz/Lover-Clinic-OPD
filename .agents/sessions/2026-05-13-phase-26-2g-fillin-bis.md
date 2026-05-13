# Session 2026-05-13 EOD — Phase 26.2g-fillin-bis (canonical resolvers; corrects no-op)

## Summary

Phase 26.2g-fillin-bis SHIPPED via 9 tasks. NEW 3 `resolvePatient*` helpers in `src/lib/patientHealthMapping.js` read CANONICAL `be_customers.patientData` fields directly. TFP swaps Phase 26.2g-fillin's `derivePatient*` calls (V21 architectural-error no-op — read kiosk-shape fields that don't exist on be_customers) → `resolvePatient*` (correct canonical reads). User's reported bug closed: admin-edited LC-26000001 with ง่วง/พารา/ขนมถ้วย now auto-fills correctly on TFP create. Existing `derivePatient*` helpers UNTOUCHED — legitimate consumer is `src/utils.js` OPD print (kiosk-shape from `opd_sessions.patientData`).

## Current State

- master = `b6c6253` (Task 7 head) · session-end commit lands next · prod = `ccef3c2` (91+ commits ahead — Phase 26.0/26.1/26.2/26.2f/26.2g-fillin/26.2g-fillin-followup/26.2g-fillin-bis all LIVE on master; NOT deployed)
- 8552 tests + 1 skipped + 0 fail. Build clean (2.48s).
- 1 known intermittent flake (Phase 17.1 cross-branch-import-rtl under full-suite load).

## Commits this session

```
b6c6253 feat(audit AV40 Phase 26.2g-fillin-bis Task 7): extend forbidden-read list to canonical fields
<Task 6> test(Phase 26.2g-fillin-bis Task 6): live admin-SDK e2e script (Rule M, dry-run verified)
<Task 5> test(Phase 26.2g-fillin-bis Task 5): RTL auto-fill scenarios (7 cases incl. LC-26000001 fixture)
<Task 4> test(Phase 26.2g-fillin-bis Task 4): Rule I full-flow simulate FB1-FB6
<Task 3> test(Phase 26.2g-fillin-bis Task 3): G4 source-grep regression locks (NEW bis-named suite)
<T2 fix> test(Phase 26.2g-fillin-bis Task 2 review): V21 fixup — G1 group locks resolve* pattern post-bis
<Task 2> feat(Phase 26.2g-fillin-bis Task 2): TFP auto-fill swaps derive→resolve canonical reads
<T1 fix> test(Phase 26.2g-fillin-bis Task 1 review): M1+M2 minor follow-ups
<Task 1> feat(Phase 26.2g-fillin-bis Task 1): resolvePatient* canonical helpers + unit tests
<spec> docs(Phase 26.2g-fillin-bis): design spec — canonical resolver helpers (corrects no-op)
```

## Files Touched

**Source**:
- MODIFIED `src/lib/patientHealthMapping.js` (+3 resolver helpers + 3 label-prefix constants + file-header consumer update, ~70 LOC added)
- MODIFIED `src/components/TreatmentFormPage.jsx` (swap derive→resolve imports; refactor auto-fill block lines 1017-1041; remove pre-existing setDrugAllergy(patientData.allergiesDetail) no-op)
- MODIFIED `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV40 extension — canonical fields added to forbidden-direct-reads pattern + two-family architecture documented)
- MODIFIED `tests/phase-26-2g-fillin-source-grep.test.js` (G1 V21 fixup + G2.1 PATTERN extended to canonical fields)

**Tests NEW**:
- `tests/phase-26-2g-fillin-bis-resolver-helpers.test.js` (30 assertions R1-R4)
- `tests/phase-26-2g-fillin-bis-source-grep.test.js` (6 assertions G4)
- `tests/phase-26-2g-fillin-bis-flow-simulate.test.js` (19 assertions FB1-FB6 — Rule I full chain)
- `tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx` (7 assertions incl. LC-26000001 user fixture R-SC5)
- `scripts/e2e-phase-26-2g-fillin-bis.mjs` (Rule M canonical pattern, 6 scenarios — dry-run verified)

**Docs**:
- NEW `docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-bis-canonical-resolver-design.md`
- NEW `docs/superpowers/plans/2026-05-13-phase-26-2g-fillin-bis-canonical-resolver.md`
- MODIFIED `.claude/rules/00-session-start.md` § 2 (Phase 26.2g-fillin-bis V-entry inserted before Phase 26.2g-fillin-followup)
- MODIFIED `.agents/active.md` (rewrite to Phase 26.2g-fillin-bis SHIPPED state)
- MODIFIED `SESSION_HANDOFF.md` (Current State + new session block + Resume Prompt)
- NEW `.agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md` (this file)

## Decisions (one-liner each)

- Approach A locked: NEW resolvePatient* helpers reading canonical fields. derivePatient* untouched (legitimate consumer is utils.js OPD print).
- Q1 admin wins via canonical pre-derive (no explicit merge needed — buildPatientDataFromForm always writes canonical; kiosk pre-derives BEFORE customer doc).
- Q2 compose drugAllergy+foodAllergy with asymmetric prefix (drug-only raw / food-only prefix / both prefixed).
- Q3 compose beforeTreatment+pregnanted with locked prefixes; currentMedication is OUT OF SCOPE (lost to note via clinicalSummary).
- 5-layer test bank: unit + source-grep + flow-simulate (Rule I REAL helper chain) + RTL + live admin-SDK e2e.
- AV40 extended to BOTH shapes (kiosk + canonical) with bloodType exempt (legitimate identity field).
- V-entry transparently documents Phase 26.2g-fillin as V21 architectural-error no-op — institutional memory permanent.
- Task 1 M1+M2 review fixes: R2.6b branch-coverage completeness + JSDoc strict-boolean precision.
- Task 2 V21 fixup: G1 group in phase-26-2g-fillin-source-grep.test.js rewritten to lock resolve* + anti-regression on derive*.
- Live e2e --apply user-gated per Rule M; dry-run 6/6 PASS already validates the chain.

## Lessons (Rule D continuous improvement)

1. **V21 architectural error — helpers reading fields that don't exist on target doc shape ALWAYS return '' silently.** Source-grep + unit tests verify code shape but not runtime correctness against actual data. Only Rule I flow-simulate (chaining REAL helpers across REAL data paths) OR a 1-line preview_eval (`Object.keys(realCustomer.patientData)`) BEFORE shipping the helper-consumer pairing can catch it. Phase 26.2g-fillin shipped because that step was skipped.

2. **be_customers.patientData has ONE shape regardless of write path.** opd_sessions.patientData has the KIOSK shape. Different consumer surfaces; different helpers. Phase 26.2g-fillin mistakenly applied kiosk-shape helpers to canonical-shape consumer. Phase 26.2g-fillin-followup (utils.js refactor) was legitimate because utils.js DOES consume kiosk-shape.

3. **5-layer test bank with live admin-SDK e2e is the architectural verification layer.** Unit + source-grep verify the helper. Flow-simulate verifies the data chain. RTL verifies component render. Live admin-SDK e2e verifies the REAL Firestore round-trip + REAL helper composition. Each layer catches different failure modes.

4. **End-of-sub-phase Rule I IS the canonical guard.** When a fix introduces a new helper, the flow-simulate test that proves the helper works against REAL data shape is mandatory. Helper unit tests in isolation can pass while the helper is pointed at the wrong consumer surface.

5. **V21 anti-pattern can fire at task boundaries.** Task 2 swap from derive→resolve invalidated Task 1's pre-existing G1 source-grep tests (which locked the broken derive* pattern). Caught by Task 2 code reviewer; fixed inline with anti-regression guards on the removed patterns. Mirror of Phase 26.2g-fillin-followup Task 1 lesson at file-header level (premature CLOSED claim).

6. **Transparent V-entry acknowledgment of mistakes is essential for institutional memory.** Phase 26.2g-fillin no-op gets a permanent V-entry that future reviewers can find via grep. Hiding the mistake would let it recur. The V-entry's "Lessons" section codifies the architectural-error class so future helper-consumer pairings get the preview_eval check.

## Subagent-driven discipline

- **Task 1** (TDD resolver helpers): subagent dispatch + spec reviewer + code-quality reviewer (M1 branch-coverage + M2 JSDoc precision found → inline fix).
- **Task 2** (TFP refactor): subagent dispatch + spec reviewer + code-quality reviewer (Critical V21 anti-pattern found on existing G1 → inline fix).
- **Task 3** (G4 source-grep): inline (verbatim plan content; tiny surface).
- **Task 4** (FB Rule I flow-simulate): inline (verbatim plan content).
- **Task 5** (RTL scenarios): inline (verbatim plan content).
- **Task 6** (live admin-SDK e2e): inline (Rule M canonical; --apply user-gated).
- **Task 7** (AV40 extension + G2.1 fixup): inline (structured doc + test patch).
- **Task 8** (Rule N verify): inline verification only.
- **Task 9** (session-end docs): inline.

## Next Todo

Choose ONE in next chat:

1. **Deploy combined 91+ commits** — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 (combined deploy + Probe-Deploy-Probe Rule B).
2. **Run `--apply` live e2e** — `node scripts/e2e-phase-26-2g-fillin-bis.mjs --apply` (Rule M; 6 TEST-prefixed customer docs + audit doc; cleanup automatic). Validates the chain against real prod Firestore.
3. **New phase / feature** — user specifies priority.
4. **kioskPatientToCanonical Rule-of-3 close** (deferred follow-up) — replace inline `ud_*` derivation at lines 47-55 with `derivePatientCongenitalDisease` helper call.
5. **Probe-Deploy-Probe maintenance** — probes 2/3/4 false-positive or Phase 17.1 flake.

## Resume Prompt

See SESSION_HANDOFF.md "Session 2026-05-13 EOD — Phase 26.2g-fillin-bis SHIPPED" block (master after session-end commit).
