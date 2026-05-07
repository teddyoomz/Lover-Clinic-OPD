---
updated_at: "2026-05-08 EOD #3 — V50 ProClinic strip COMPLETE (7 phases shipped, H-bis EXECUTED)"
status: "master=POST-V50 · prod=c92f924 (7 commits behind: V49 + V50.Phase 1+2 + V50.Phase 3 + V50.Phase 4 + V50.Phase 7) · 7261/7266 tests PASS · build clean · 2,599 prod docs cleaned"
branch: "master"
last_commit: "POST-V50.Phase7 (committed end of session)"
tests: 7261
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = POST-V50.Phase7 · prod = `c92f924` (7 commits ahead pending `vercel --prod`)
- 7261/7266 tests PASS (5 pre-existing TFP failures: BSA T6.1 + phase-17-2-septies S3 — NOT V50-caused, confirmed via stash-test)
- Build clean: BackendDashboard chunk 1018→933 KB, AdminDashboard 398→383 KB
- **Iron-clad Rule H-bis = EXECUTED** (was "IN PROGRESS"; V50 closes the dev-only-scaffolding strip)
- V50 V-entry locked in `.claude/rules/00-session-start.md` § 2 above V49

## What V50 shipped (7 phases, ~12K LOC removed, 2,599 prod docs deleted)

**Phases 1-2** (commits `121507b` + `91b044c` + `b1ecf59` + `98e5105`): runtime broker.* migration + ClinicSettingsPanel sections strip + infrastructure DELETED + test bank cleanup. AdminDashboard + BackendDashboard now UNIFIED on be_*; BSA branch isolation preserved.

**Phase 3** (commit `1c67baf`): cross-branch booking contract verified (existing be_customers.branchId already serves creation-branch role — Option A, no schema change). 46 vitest + 30 e2e on real prod.

**Phase 4** (commit `59f7aa8`): kiosk → OPD-save auto-link cascade PROF-GRADE bank — 64 vitest + 53 e2e covering 10 chaos scenarios (no-deposit visibility, kiosk-delete cascade, OPD-save auto-link, deposit-pair both halves, 3-branch matrix, delete appt mid-flow, delete deposit mid-flow, duplicate name+phone, idempotency, branch-switch sharp-edge).

**Phase 5**: full suite verify — 7235/7240 PASS + build clean.

**Phase 6** (`scripts/v50-phase6-cleanup-proclinic-residue.mjs --apply`): Rule M two-phase cleanup of ProClinic residue. **2,599 docs DELETED on real prod**:
- pc_* mirror (10 collections): 2,097 docs (pc_treatments=1132, pc_customers=450, pc_courses=244, pc_treatment_history=247, etc.)
- master_data/* (12 type subcollections + 11 parent docs): 502 docs
- clinic_settings/proclinic_session{,_trial}: 2 docs
- broker_jobs/*: 0 (already empty)
- Audit doc: `be_admin_audit/v50-phase6-cleanup-proclinic-residue-1778182611077-a2452825`

**Phase 7** (final commit): AV28 audit invariant added (no broker.* / cloneOrchestrator / /api/proclinic/* / runtime pc_*/master_data/broker_jobs reads in src/) + 26 regression tests in `tests/v50-av28-no-proclinic-imports.test.js` + V50 V-entry locked + SESSION_HANDOFF + active.md update.

## Next action

**No new feature work** — V50 is closed. Outstanding items are:

1. 🚨 **Combined `vercel --prod` for 7 commits ahead** (V18 — needs explicit "deploy" THIS turn from user; auth never rolls over)
2. **Optional follow-up**: delete the dead master_data CRUD helpers in backendClient.js + scopedDataLayer.js (orphan exports, zero callers — sanctioned exception in AV28.4). Could land in a focused refactor commit later.
3. **Optional follow-up**: clean `firestore.rules` of pc_* / master_data / broker_jobs / proclinic_session match blocks (rules deploy + Probe-Deploy-Probe per Rule B). Defer until rules redeploy is scheduled.
4. **Pre-existing TFP test failures** (5 — BSA T6.1 + phase-17-2-septies S3) — separate task; not V50-caused.

## Outstanding (user-triggered)

- 🚨 V49 + V50.Phase 1-7 `vercel --prod` (7 commits behind prod)
- 5 pre-existing TFP test failures — separate task
