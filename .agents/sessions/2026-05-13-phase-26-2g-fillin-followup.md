# Session 2026-05-13 EOD — Phase 26.2g-fillin-followup (utils.js Rule-of-3 close)

## Summary

Phase 26.2g-fillin-followup SHIPPED via 6 tasks (5 source/test + 1 verify; session-end docs land next). NEW `UD_LABELS_EN` frozen map + `derivePatientCongenitalDiseaseEnglish` pure helper extracted into `src/lib/patientHealthMapping.js`. `src/utils.js` Thai + English OPD print builders refactored to consume both Thai (existing) + English (new) helpers — 20 inline lines → 4 (2 per builder). Output BYTE-IDENTICAL for OPD print recipients (formal clinical EN labels preserved verbatim, verified via node REPL on full-flags + empty cases). AV40 sanctioned-exception list shrinks 3 → 2 (utils.js removed). V12 multi-reader-sweep class for `patientData.ud_*` fully closed project-wide.

## Current State

- master = `551f5ae` (Task 4) · session-end commit lands next · prod = `ccef3c2` (79+ commits ahead — Phase 26.0 + 26.1 + 26.2 + 26.2f + 26.2g-fillin + 26.2g-fillin-followup all LIVE on master only; NOT deployed)
- 8490 tests + 1 skipped + 0 fail. Build clean.
- 1 known intermittent flake (Phase 17.1 cross-branch-import-rtl under full-suite load).

## Commits this session (spec + 5 tasks; session-end docs commit lands next)

```
551f5ae feat(audit AV40 update Task 4): utils.js dropped from sanctioned list
1995e6e test(Phase 26.2g-fillin-followup Task 3): G3 source-grep regression locks
839aa38 feat(Phase 26.2g-fillin-followup Task 2): utils.js OPD print builders consume helpers
1336bc4 test(Phase 26.2g-fillin-followup Task 1 review fix): comment-vs-code drift
037bcc7 feat(Phase 26.2g-fillin-followup Task 1): derivePatientCongenitalDiseaseEnglish + tests
7b0d421 docs(Phase 26.2g-fillin-followup): design spec for utils.js Rule-of-3 refactor
```

## Files Touched

**Source**:
- MODIFIED `src/lib/patientHealthMapping.js` (+UD_LABELS_EN frozen map +derivePatientCongenitalDiseaseEnglish helper +file-header consumer/test updates, ~35 LOC added; header flipped PENDING → CLOSED at Task 2)
- MODIFIED `src/utils.js` (+1 import block at top, Thai builder 10 → 2 lines, English builder 10 → 2 lines, net -16 LOC)
- MODIFIED `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV40 sanctioned list shrunk 3 → 2; Example entry follow-up added)

**Tests NEW**:
- `tests/phase-26-2g-fillin-followup-english-helper.test.js` (12 assertions L1.1-EN..L1.12-EN)
- `tests/phase-26-2g-fillin-followup-source-grep.test.js` (4 assertions G3.1-G3.4)

**Tests MODIFIED**:
- `tests/phase-26-2g-fillin-source-grep.test.js` (line 56 stale comment updated — Task 4 secondary fix from Task 2 reviewer suggestion)

**Docs**:
- NEW `docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-followup-utils-rule-of-3-design.md`
- NEW `docs/superpowers/plans/2026-05-13-phase-26-2g-fillin-followup-utils-rule-of-3.md`
- MODIFIED `.claude/rules/00-session-start.md` § 2 (Phase 26.2g-fillin-followup V-entry inserted before Phase 26.2g-fillin)
- MODIFIED `.agents/active.md` (rewrite to Phase 26.2g-fillin-followup SHIPPED state)
- MODIFIED `SESSION_HANDOFF.md` (Current State + new session block + Resume Prompt)
- NEW `.agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md` (this file)

## Decisions (one-liner each)

- Approach A locked: mirror helper + caller-side wrap. Existing helper's pure-derivation contract preserved.
- Formal clinical EN labels (current utils.js output) preserved verbatim — zero behavior change for OPD print recipients per user directive.
- `UD_LABELS_EN` frozen + separate from `UD_LABELS` (Thai) → context-appropriate label drift between OPD print (formal) and PatientForm UI (lay-friendly) is intentional.
- Surrounding allergy + currentMedication + pregnancy lines in utils.js preserved as-is (different output shape; not part of this Rule of 3; YAGNI).
- AV40 sanctioned list shrunk 3 → 2 (utils.js dropped); G2.1 grep walk unchanged (only walks src/components + src/pages anyway).
- G3.2 anti-regression locks both first-label + secondary-distinguishing-label per language (Hypertension + Diabetes Mellitus EN; ความดันโลหิตสูง + เบาหวาน TH) — catches any partial refactor.
- Byte-identical OPD output verified via node REPL on full-flags + empty cases (NOT a vitest snapshot — utils.js builders consume more than just chronic; manual verification is sufficient for this small change).
- File-header comment block in patientHealthMapping.js updated to list new consumer (utils.js) + new test files. Header flipped PENDING → CLOSED at Task 2 when refactor actually landed (Task 1 reviewer caught premature CLOSED claim).
- Inter-task state correctness: V21 comment-vs-code drift can fire BETWEEN tasks; Task 1 reviewer caught the drift; Task 2 closed it.

## Lessons (Rule D continuous improvement)

1. **Rule P "ONE class-of-bug at a time" + sanctioned tech-debt + follow-up plan is the canonical rhythm for partial-scope refactors.** Phase 26.2g-fillin shipped the user-visible fix first (TFP create-mode auto-fill gap) + AV40 invariant + sanctioned the utils.js tech-debt. Phase 26.2g-fillin-followup closed the Rule-of-3 cleanly without scope creep.

2. **Byte-identical output is the right contract when refactoring builders shipping to external recipients.** OPD print recipients see no change; the refactor is internal. Caller-side wrapping with original prefix + fallback strings preserves zero behavior change.

3. **Intentional label drift between contexts deserves separate frozen constants.** `UD_LABELS_EN` (formal clinical) vs PatientForm UI labels (lay-friendly) — both legitimate, different audiences. Forcing unification would be wrong; explicit separate constants documents the distinction.

4. **The existing helper's pure-derivation contract was preserved by NOT adding a `lang` param (Approach B rejected).** Separation of concerns intact — helper does derivation, caller does formatting. Future English-locale consumers (if any) just import the mirror helper.

5. **G3.2 anti-regression locks BOTH first + secondary labels per language.** First label (Hypertension / ความดันโลหิตสูง) catches the obvious case; secondary distinguishing label (Diabetes Mellitus / เบาหวาน) catches partial refactor or label-drift introduction.

6. **node REPL verification is sufficient for byte-identical contract on small refactors.** A vitest snapshot would require setting up the full OPD print builder context (parts.push chain, surrounding lines, etc.) — disproportionate to the change. The L1.12-EN unit assertion in the helper test bank + manual REPL verification covers the contract.

7. **V21 comment-vs-code drift can fire BETWEEN tasks of the same phase — inter-task state correctness deserves explicit attention.** Task 1 reviewer caught file header claiming utils.js Rule-of-3 tech-debt CLOSED while utils.js still contained inline derivation (Task 2 hadn't run yet). Inline fix flipped CLOSED → PENDING; Task 2 flipped back to CLOSED when refactor actually landed. Generalizes to any multi-task phase where downstream tasks land state changes — upstream claims about state must reflect ACTUAL state at the SHA, not aspirational state at end of phase.

## Subagent-driven discipline

- **Task 1** (TDD English helper): subagent dispatch + spec reviewer + code-quality reviewer (V21 drift found → inline fix).
- **Task 2** (utils.js refactor): subagent dispatch + spec reviewer + code-quality reviewer (AV40 stale entry flagged → Task 4 closes per plan sequence).
- **Task 3** (G3 source-grep): inline (verbatim plan content; tiny surface).
- **Task 4** (AV40 update): inline (closes Task 2 reviewer finding + reviewer's secondary G2.1 comment suggestion).
- **Task 5** (verify): inline verification only.
- **Task 6** (session-end docs): inline.

## Next Todo

Choose ONE in next chat:

1. **Deploy combined 79+ commits** — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 (combined deploy + Probe-Deploy-Probe Rule B). 4-endpoint probe list post-V50-followup-2.
2. **New phase / feature** — user specifies priority.
3. **Probe-Deploy-Probe maintenance** — investigate probes 2/3/4 false-positive or Phase 17.1 cross-branch-import-rtl flake.

## Resume Prompt

See SESSION_HANDOFF.md "Session 2026-05-13 EOD — Phase 26.2g-fillin-followup SHIPPED" block (master after session-end docs commit).
