# 2026-05-08 EOD #4 FINAL — Rule P + Per-branch Settings Phase 1+2+3 + TFP fixes DEPLOYED

## Summary

Continuation of EOD #4. Started with 2 brainstorming asks pending from EOD #3 (Rule P methodology + per-branch settings migration). Full flow: brainstorming → specs → plans → subagent-driven execution → merge → deploy. All shipped + deployed to prod (`2318557`). Migration applied locally per Rule M. 5 pre-existing TFP failures eliminated as first application of just-shipped Rule P (eat-our-own-dogfood).

## Current State

- master = prod = `2318557` LIVE at `https://lover-clinic-app.vercel.app`
- 109+/109 targeted tests GREEN (no pre-existing failures left)
- Iron-clad Rule P locked + AV29 + BS-10 + CB-1..5 invariants permanent
- Per-branch settings migration applied: 3 prod branches (นครราชสีมา + พระราม 3 + ทดลอง 1)
- 0 outstanding blocking items; only optional follow-ups deferred

## Commits this session (chronological top→bottom)

```
e7fe1e8 docs(spec): Rule P class-of-bug expansion design (Spec #1)
398c9e2 docs(spec): per-branch settings migration design (Spec #2)
51ebb53 docs(plans): implementation plans for Spec #1 + Spec #2
02a371d chore: add .worktrees/ + worktrees/ to .gitignore
47a7315 docs(rule): land Rule P (class-of-bug expansion at every bug discovery)
a80ca65 docs(rules): Rule P compact entries in 00-session-start §1 + CLAUDE.md
03fea77 feat(audit): NEW /audit-class-of-bug-discipline skill (CB-1..CB-5)
67efc98 test(audit): tests/audit-class-of-bug-discipline.test.js (CB-1..CB-5 + meta)
98e2f34 docs(audit): register audit-class-of-bug-discipline in /audit-all Tier 5
a2618b5 feat(phase 1): per-branch settings — helper extension + 7-consumer multi-reader-sweep
8c112d2 feat(phase 2): per-branch settings — UI ship + migration script
3ca2c30 merge: Spec #1 + Spec #2 feature branch
502f5d3 docs(agents): EOD #4 — Rule P + Per-branch Settings Phase 1+2 SHIPPED
72bc885 feat(phase 3): per-branch settings — cleanup dual-shape fallback (V51)
7ce9b7a fix: 5 pre-existing TFP test failures (BSA T6.1 + Phase 17.2-septies S3.1-S3.4)
2318557 fix(vercel): drop api/proclinic/*.js functions config (V50 strip cleanup)
```

## Files Touched (highlights)

**NEW**:
- `.claude/rules/01-iron-clad.md` (Rule P body — full 7-step + Tier 1/2/3 + interactions + 7 anti-patterns)
- `.agents/skills/audit-class-of-bug-discipline/{SKILL.md,patterns.md}` (CB-1..5 invariants)
- `tests/audit-class-of-bug-discipline.test.js` (18-test bank)
- `tests/per-branch-settings-multi-reader-sweep.test.js` (54-test bank including S11 cleanup regression)
- `src/components/ui/TimeSelect24.jsx` (extracted shared component, Rule of 3)
- `scripts/v51-migrate-clinic-settings-to-branch.mjs` (Rule M canonical two-phase script)
- `docs/superpowers/specs/2026-05-08-{rule-p-class-of-bug-expansion,per-branch-settings-migration}-design.md`
- `docs/superpowers/plans/2026-05-08-{rule-p-class-of-bug-expansion,per-branch-settings-migration}.md`

**MODIFIED**:
- `.claude/rules/00-session-start.md` + `CLAUDE.md` (Rule P compact entries)
- `src/lib/BranchContext.jsx` (`mergeBranchIntoClinic` extended cascade → Phase 3 cleanup 2-arg)
- `src/lib/branchValidation.js` (settings sub-object defaults + validation rules + Phase 3 top-level cleanup)
- `src/components/backend/BranchFormModal.jsx` (4 new sections + UI bound to settings.X + dual-write removed)
- `src/components/ClinicSettingsPanel.jsx` (610 → 324 LOC; 7 migrated sections deleted)
- `src/components/TreatmentFormPage.jsx` (audit-branch-scope first-line annotation)
- `.agents/skills/audit-branch-scope/{SKILL.md,patterns.md}` (BS-10 invariant)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV29 invariant + classifier)
- `.agents/skills/audit-all/SKILL.md` (registered audit-class-of-bug-discipline Tier 5)
- `tests/phase-17-2-septies-tfp-schema-reader.test.js` (S3.1-S3.4 updated to lock post-V49 mapper-delegation pattern)
- `vercel.json` (dropped dead api/proclinic/*.js functions config)

**USER-LEVEL** (outside repo):
- `~/.claude/skills/systematic-debugging/SKILL.md` (Δ1-Δ5)
- `~/.claude/skills/verification-before-completion/SKILL.md` (Δ1-Δ8)
- `~/.claude/projects/F--LoverClinic-app/memory/MEMORY.md` (Rule P pointer)
- `~/.claude/projects/F--LoverClinic-app/memory/feedback_class_of_bug_expansion.md` (NEW)

## Decisions (1-line each — full reasoning → v-log-archive.md if added later)

- Rule P body location: alphabetical Rule P (after Rule O); compact summary in §1 supports "ข้อต้นๆ" priority via marker, not letter position
- Tier 3 expansion depth: full V42-V49 methodology (escalate iron-clad rule when architectural)
- Tier 2 default artifacts: regression test + AVxx + classifier doc (V-entry only when architectural)
- Trigger discrimination: strict — every red triggers (LoverClinic doesn't practice TDD strictly per Rule K)
- Trigger scope: broad — bug discovery ทุกประเภท (test red + user-report + claude-noticed + audit-red)
- Per-branch settings schema: nested `be_branches.settings.{...}` sub-object
- Migration strategy: single Rule M one-shot script (clinic_settings → branches.settings + flat → nested in same `--apply`)
- ClinicSettingsPanel post-deletion: clean delete of 7 migrated sections (no hint card per user "ลบ sections ทิ้งไม่มี hint")
- Audit invariant placement: BS-10 in audit-branch-scope + AV29 in audit-anti-vibe-code (Rule P Tier 2 companion)
- 3-phase batched approach (Phase 1 helper+sweep+invariants / Phase 2 UI+script / Phase 3 cleanup)
- Eat-our-own-dogfood: applied Rule P 7-step to fix 5 pre-existing TFP failures within hours of shipping the rule

## Bug surfaced + fixed during deploy

`vercel.json` `functions` config still referenced `api/proclinic/*.js` — deleted by V50 Phase 2.2 (`b1ecf59`). Build failed first deploy attempt; classified per Rule P as audit-red equivalent (deploy-time validation surface); cross-file grep confirmed isolated; 1-line fix; redeployed clean.

## Next Todo

Idle. Awaiting user directive.

Optional follow-ups (deferred, low priority):
1. Clean `firestore.rules` of pc_*/master_data/broker_jobs/proclinic_session legacy match blocks (rules deploy + Probe-Deploy-Probe per Rule B)
2. Delete dead orphan `master_data/*` CRUD helpers in backendClient.js + scopedDataLayer.js (AV28.4 sanctioned exception)

## Resume Prompt

```
Resume LoverClinic — idle; Rule P + per-branch settings shipped + DEPLOYED.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=2318557, prod=2318557 — in sync)
3. .agents/active.md (109+/109 targeted tests PASS · idle)
4. .claude/rules/00-session-start.md (iron-clad A-P + V42-V50 V-summary; Rule P locked 2026-05-08)
5. (if needed) .agents/sessions/2026-05-08-rule-p-and-per-branch-settings-shipped.md

Status: master=prod=`2318557` LIVE. Per-branch settings live on 3 prod branches. Rule P + AV29 + BS-10 + CB-1..5 invariants permanent.

Next: idle. Awaiting user directive.

Rules: explicit "deploy" THIS turn for vercel; Rule P 7-step on every bug discovery; V37 NEVER `git add -A`; preview_eval prod uses TEST-prefixed fixtures.

/session-start
```
