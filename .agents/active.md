---
updated_at: "2026-05-05 EOD — Phase 17 trilogy + 17.2-bis + 17.2-ter; 5199 tests pass; 2 commits ahead-of-prod"
status: "master=281c871 · prod=24aa9e9 (V15 #18, LEAKING) · 2 commits ahead-of-prod · 5199 tests pass"
current_focus: "Awaits explicit deploy to ship V15 #19 + clear cross-branch leak (TFP modals + marketing tabs + AppointmentTab TodaysDoctorsPanel)"
branch: "master"
last_commit: "281c871"
tests: 5199
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "24aa9e9"
firestore_rules_version: 25
storage_rules_version: 2
---

# Active Context

## State
- master = `281c871` = 2 commits ahead-of-prod (V15 #18 = `24aa9e9` is LEAKING)
- 5199/5199 tests pass · build clean · firestore.rules v25
- Phase 17.2 migration ALREADY APPLIED to prod data (3 writes: 1 stock locationId + 2 isDefault strips, audit `phase-17-2-remove-main-branch-1777961452972-...`)

## What this session shipped
- **Phase 17.0** (`5799bd5`): BSA leak sweep 3 + BS-9 invariant lock + 17-page wiki backfill — V15 #17 LIVE
- **Phase 17.1** (`ff78426`): cross-branch master-data import on 7 tabs (NEW button + shared modal + 7 adapters + admin endpoint) — V15 #18 LIVE
- **Phase 17.2** (`24aa9e9`): branch equality (no main/default) — code V15 #18 LIVE + migration `--apply` ran on prod
- **Phase 17.2-bis** (`0361268`): per-user-key resolver + scopedDataLayer null-guard helpers (`_autoInject`/`_autoInjectPositional`) — fixes cross-branch leak when `resolveSelectedBranchId()` returns null
- **Phase 17.2-ter** (`281c871`): TodaysDoctorsPanel leak — `getActiveSchedulesForDate` + `listenToScheduleByDay` accept branchId, safe-by-default; AppointmentTab passes `selectedBranchId` to listener + adds to deps
- Checkpoint: `.agents/sessions/2026-05-05-phase-17-trilogy-and-leak-fixes.md`

## Decisions (this session)
- Phase 17 split into trilogy (BS-9 / cross-branch import / branch equality) per dependency-clean decomposition
- Phase 17.2 migration `--apply` authorized + run on prod (3 writes, idempotent)
- Phase 17.2-bis null-guard helpers safer than the prior unconditional spread — wrappers return `[]` instead of leaking when no branch resolved
- Phase 17.2-ter — internal backendClient leaks (unfiltered onSnapshot/getDocs) need branchId opts threaded through; mirrors wrapper-level fix from 17.2-bis
- Wiki-first review (R2) caught a real spec bug pre-implementation (TFP duplicate import / SELECTED_BRANCH_ID name) — methodology validated

## Next action
Awaits explicit user "deploy" → V15 #19 ships 17.2-bis + 17.2-ter together to clear the cross-branch leak in prod.

## Outstanding user-triggered actions
- 🚨 **Deploy V15 #19** — bundle Phase 17.2-bis + 17.2-ter; combined vercel + firestore:rules + Probe-Deploy-Probe (Rule B)
- **Browser smoke verify** post-deploy: switch branches → confirm TFP modals / marketing tabs / AppointmentTab TodaysDoctorsPanel show correct per-branch data
- **Internal-leak audit** follow-up: `_resolveProductIdByName`, `findProductGroupByName`, `saveBankAccount` isDefault mutex, `listStockTransfers/Withdrawals` cross-tier — flagged in 17.2-ter commit message
- LineSettings พระราม 3 admin entry; Hard-gate Firebase claim; /audit-all readiness pass
