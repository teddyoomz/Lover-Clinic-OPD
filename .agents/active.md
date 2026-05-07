---
updated_at: "2026-05-08 EOD #4 — Rule P (Spec #1) + Per-branch Settings (Spec #2) Phase 1+2 SHIPPED via merge 3ca2c30"
status: "master=POST-MERGE 3ca2c30 (Rule P + per-branch settings Phase 1+2) · prod=c92f924 (18 commits behind) · 109/109 targeted tests PASS · build clean"
branch: "master"
last_commit: "merge: Spec #1 (Rule P) + Spec #2 (per-branch settings) feature branch (3ca2c30)"
tests: 109
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State (post-merge)
- master = `3ca2c30` (merge commit) · prod = `c92f924` (18 commits behind, pending `vercel --prod`)
- 109/109 targeted tests GREEN: per-branch-settings 49/49 + audit-branch-scope BS-1..10 16/16 + audit-class-of-bug-discipline CB-1..5 18/18 + V50 AV28 26/26
- Build clean: BackendDashboard 933 KB · AdminDashboard 383 KB
- 5 pre-existing TFP failures (BSA T6.1 + phase-17-2-septies S3) — NOT touched this session
- **Iron-clad Rule P locked**: class-of-bug expansion at every bug discovery (7-step + Tier 1/2/3 artifacts)
- **NEW**: BS-10 invariant in audit-branch-scope (per-branch settings reads via useEffectiveClinicSettings)
- **NEW**: AV29 invariant in audit-anti-vibe-code (V51 multi-reader-sweep classifier)
- **NEW**: CB-1..CB-5 invariants in audit-class-of-bug-discipline (Rule P compliance audit)

## What this session shipped (Spec #1 + Spec #2 combined merge — 7 commits + merge commit)

**Spec #1 — Rule P (Class-of-bug expansion)** — IN-REPO COMPLETE:
- Rule P body in `.claude/rules/01-iron-clad.md` (verbatim 7-step discipline + Tier 1/2/3 + interactions with Rule N/D/I + 7 anti-patterns + lesson lock V42-V49 saga)
- Compact Rule P entries in `00-session-start.md §1` + `CLAUDE.md` "Iron-clad ย่อ"
- NEW `/audit-class-of-bug-discipline` skill at `.agents/skills/` (CB-1 V→AV mapping + CB-2 AV→test + CB-3 classifier doc + CB-4 architectural rule + CB-5 sanctioned exception catalog)
- 18-test bank `tests/audit-class-of-bug-discipline.test.js`
- Registered in `/audit-all` Tier 5 (alongside audit-anti-vibe-code as methodology-enforcement companion)

**Spec #2 — Per-branch Settings Migration** — PHASES 1+2 SHIPPED:
- **Phase 1**: Extended `mergeBranchIntoClinic` in `BranchContext.jsx` with 13-field 3-source cascade (settings.X > flat branch.X > cs.X). Swept 7 actual consumers (spec projected 17 — most are pass-through forwarders): branchBackupCore.js + PatientDashboard.jsx tagged BS-10 sanctioned. BS-10 invariant + AV29 invariant. 49-test bank.
- **Phase 2**: Shared `TimeSelect24` component extracted (Rule of 3). BranchFormModal 4 new sections (Email + LINE OA + Cooldown + openHours + chatHours). ClinicSettingsPanel 7-section deletion (610→324 LOC). branchValidation.js extended with full settings defaults + validation rules. **NEW** `scripts/v51-migrate-clinic-settings-to-branch.mjs` (Rule M canonical two-phase script).

**Commits on master since prior state**:
```
3ca2c30 merge: Spec #1 + Spec #2 feature branch
8c112d2 feat(phase 2): per-branch settings — UI ship + migration script
a2618b5 feat(phase 1): per-branch settings — helper + 7-consumer multi-reader-sweep
98e2f34 docs(audit): register audit-class-of-bug-discipline in /audit-all Tier 5
67efc98 test(audit): tests/audit-class-of-bug-discipline.test.js
03fea77 feat(audit): NEW /audit-class-of-bug-discipline skill (CB-1..CB-5)
a80ca65 docs(rules): Rule P compact entries
47a7315 docs(rule): land Rule P
02a371d chore: add .worktrees/ + worktrees/ to .gitignore
51ebb53 docs(plans): implementation plans for Spec #1 + Spec #2
398c9e2 docs(spec): per-branch settings migration design (Spec #2)
e7fe1e8 docs(spec): Rule P class-of-bug expansion design (Spec #1)
f1f8b00 docs(agents): EOD 2026-05-08 #3 — V50 saga COMPLETE
```

## Outstanding (user-triggered)

### 🚨 1. Migration `--apply` (Rule M, runs LOCALLY)
```bash
cd F:/LoverClinic-app
# Pull production env (if not already this session)
vercel env pull .env.local.prod --environment=production
# Dry-run first (verify plan)
node scripts/v51-migrate-clinic-settings-to-branch.mjs
# Apply
node scripts/v51-migrate-clinic-settings-to-branch.mjs --apply
# Verify: all branches have settings._migratedAt set; clinic_settings/main has migrated fields deleted; audit doc emitted
```

### 🚨 2. Combined `vercel --prod` for 18 commits ahead (V18 — needs explicit "deploy" THIS turn)
Includes V49 + V50.Phase 1-7 + EOD #3 docs + Spec #1 + Spec #2 + Plans + Rule P + per-branch settings Phase 1+2 + merge commit.

### 3. Plan #2 Phase 3 cleanup (after migration converged)
1-line change in `mergeBranchIntoClinic`: remove `branch.X` flat-fallback for 5 deduplicated fields. Plus remove `emptyBranchForm` flat fields + simplify BranchFormModal handleSave. Ships as standalone commit AFTER user verifies migration converged on prod.

### 4. Plan #1 user-level files (Tasks 3+4+8 — NOT in repo, deferred)
- `~/.claude/skills/systematic-debugging/SKILL.md` — apply Δ1-Δ5 deltas per Spec #1 §4
- `~/.claude/skills/verification-before-completion/SKILL.md` — apply Δ1-Δ8 deltas per Spec #1 §5
- `~/.claude/projects/F--LoverClinic-app/memory/MEMORY.md` — add Rule P pointer
- `~/.claude/projects/F--LoverClinic-app/memory/feedback_class_of_bug_expansion.md` — NEW feedback file

### 5. Pre-existing TFP test failures
5 failures (BSA T6.1 + phase-17-2-septies S3) — separate task; not blocking.

## Next session resume

```
Resume LoverClinic — Rule P + per-branch settings Phase 1+2 SHIPPED to master.

Read in order:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=3ca2c30, prod=c92f924 — 18 commits behind)
3. .agents/active.md (this file)
4. .claude/rules/00-session-start.md (Rule P body — added 2026-05-08)

Tests: 109/109 GREEN. Build clean.

Outstanding (user-triggered):
- 🚨 Migration --apply (Rule M, run from F:/LoverClinic-app; not deploy-coupled)
- 🚨 vercel --prod for 18 commits behind (V18 explicit "deploy")
- Plan #2 Phase 3 cleanup (after migration converged)
- Plan #1 user-level Tasks 3+4+8 (apply ~/.claude/skills/ + memory file changes)
- 5 pre-existing TFP failures (separate task)

Spec/plan refs:
- docs/superpowers/specs/2026-05-08-rule-p-class-of-bug-expansion-design.md
- docs/superpowers/specs/2026-05-08-per-branch-settings-migration-design.md
- docs/superpowers/plans/2026-05-08-rule-p-class-of-bug-expansion.md
- docs/superpowers/plans/2026-05-08-per-branch-settings-migration.md
```
