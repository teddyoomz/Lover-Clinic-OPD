---
updated_at: "2026-05-13 EOD — Phase 26.2g-fillin-followup SHIPPED (utils.js Rule-of-3 close + UD_LABELS_EN + AV40 shrink 3→2)"
status: "master=551f5ae · prod=ccef3c2 · 78+ commits ahead · 8490 passed · build clean"
branch: "master"
last_commit: "551f5ae feat(audit AV40 update Task 4): utils.js dropped from sanctioned list"
tests: 8490
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `551f5ae` (pre session-end docs commit) · prod = `ccef3c2` (78+ commits ahead — Phase 26.0 + 26.1 + 26.2 + 26.2f + 26.2g-fillin + 26.2g-fillin-followup all LIVE on master only; NOT deployed)
- 8490 tests + 1 skipped + 0 fail. Build clean.
- Phase 26.2g-fillin-followup shipped via 6 subagent-driven tasks with 2-stage review on Tasks 1 + 2.

## What this session shipped
- NEW `UD_LABELS_EN` frozen map + `derivePatientCongenitalDiseaseEnglish` pure helper in `src/lib/patientHealthMapping.js` (~30 LOC added).
- `src/utils.js` Thai + English OPD print builders refactored to consume helpers (20 inline lines → 4; OPD output BYTE-IDENTICAL).
- 2 NEW test files (~16 assertions): English helper unit L1.1-EN..L1.12-EN (12) + G3 source-grep regression (4).
- AV40 sanctioned-exception list shrunk 3 → 2 (utils.js removed; PatientForm.jsx writer + AdminDashboard.jsx display chips remain).
- V12 multi-reader-sweep class fully closed for `patientData.ud_*` project-wide.
- 5 task commits: `037bcc7` Task 1 helper TDD → `1336bc4` Task 1 review fix → `839aa38` Task 2 utils refactor → `1995e6e` Task 3 G3 source-grep → `551f5ae` Task 4 AV40 update.
- Spec: `docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-followup-utils-rule-of-3-design.md` (commit `7b0d421`).
- Detail: `.agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md`

## Next action
Choose ONE in next chat:
1. **Deploy combined 79+ commits** — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 + Rule B Probe-Deploy-Probe.
2. **New phase / feature** — user specifies priority.
3. **Probe-Deploy-Probe maintenance** — investigate probes 2/3/4 false-positive or Phase 17.1 flake.

## Outstanding user-triggered actions
- **Deploy auth**: 79+ commits ahead. Combined deploy per V15 + Rule B (4-endpoint probe list post-V50-followup-2).
- (Optional) Phase 17.1 cross-branch-import-rtl flake (intermittent under full-suite load).

## Carried institutional memory
- saveMode='vitals' = 5th locked-X family member (Phase 26.2f AV37 extension).
- Panel + Mirror co-exist for TimelineModal vs TFP split-screen (Phase 26.2f AV38 + AV39).
- `extractDisplayString` = canonical fix for [object Object] rendering (Phase 26.2).
- `toDateSafely` = canonical fix for Firestore Timestamp → React child crash (Phase 26.2f3).
- `derivePatientCongenitalDisease` (Thai) + `derivePatientCongenitalDiseaseEnglish` (formal clinical EN) + `derivePatientTreatmentHistory` = canonical helpers for patientData health-info derivation. Both Thai and EN OPD print builders + TFP create-mode auto-fill consume the same lib.
- `UD_LABELS_EN` formal-clinical labels intentionally distinct from PatientForm UI labels (lay-friendly); context-appropriate label drift documented.
- 3-stage save workflow: vitals → doctor → null/complete (Phase 26.2f).
- AV40 = patientData.ud_* / hasUnderlying / currentMedication / pregnancy reads centralized via patientHealthMapping.js. Sanctioned list = 2 entries (PatientForm.jsx + AdminDashboard.jsx). V12 multi-reader-sweep class fully closed.
- V21-class regex windows drift when comments expand — bump windows + V21 marker comment.
- Rule P "ONE class-of-bug at a time" + sanctioned tech-debt + follow-up plan = canonical rhythm for partial-scope refactors.
- V21 comment-vs-code drift can fire BETWEEN tasks of the same phase — inter-task state correctness deserves attention (Phase 26.2g-fillin-followup Task 1 reviewer caught CLOSED prematurely; flipped to PENDING in fix, then Task 2 flipped back to CLOSED when refactor landed).
