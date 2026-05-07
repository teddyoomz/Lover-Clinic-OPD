---
updated_at: "2026-05-08 EOD #2 — V50 ProClinic strip Phase 1+2 SHIPPED (4 commits, -12K LOC)"
status: "master=98e5105 · prod=c92f924 (V42-V50.Phase1-2 NOT yet deployed) · 7125/7131 tests PASS · build clean"
branch: "master"
last_commit: "98e5105"
tests: 7125
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = `98e5105` · prod = `c92f924` (V49 + V50.Phase1-2 ALL pending one combined `vercel --prod`)
- 7125/7131 tests PASS · 5 fail = PRE-EXISTING TFP regressions (BSA T6.1 + phase-17-2-septies S3, confirmed via stash-test) NOT V50-caused
- Build clean. BackendDashboard chunk 1018→933KB. AdminDashboard 398→383KB.

## What this session shipped (V50 ProClinic strip — 4 commits)
Detail: `.agents/sessions/2026-05-08-v50-proclinic-strip.md`

- **Phase 1** (`121507b`): runtime broker.* migration — 5 frontend files (ChartTemplate + ChartCanvas + TreatmentTimeline + PatientDashboard + TFP) → be_* via scopedDataLayer. TFP `saveTarget` default flipped `'proclinic'` → `'backend'` + PROCLINIC MODE block deleted (-177 LOC) + 9 conditional broker.* sites stripped.
- **Phase 2.1** (`91b044c`): ClinicSettingsPanel 3 sections deleted (Image 1 doctors/rooms classify + Image 2 Master Data Sync + ProClinic Integration credentials).
- **Phase 2.2** (`b1ecf59`): infrastructure DELETED (-10,318 LOC) — brokerClient.js + cloneOrchestrator.js + customerBranchBaselineClient.js + CloneTab.jsx + MasterDataTab.jsx + api/proclinic/** (14 files) + cookie-relay/** (5 files). nav + BackendDashboard wiring updated.
- **Phase 2.3** (`98e5105`): test cleanup — 3 test files updated (V50 anti-regression assertions) + 6 obsolete test files DELETED.
- Preserved per user: auto-link flows + cascade-delete + move-appointment + BSA branch isolation untouched.
- AdminDashboard + BackendDashboard now UNIFIED on be_* (no proclinic mode).

## Next action
**Phase 3** — add `be_customers.creationBranchId` field + verify cross-branch booking flow on dev server (preview_eval AdminDashboard appointment + deposit creation across 3 branches). Then Phase 4 (e2e bank), Phase 5-7 (verify + Rule M data ops + V50 V-entry/AV28/H-bis EXECUTED + final commit). Realistic: 2-4 more hours.

## Outstanding (user-triggered)
- 🚨 V49 + V50.Phase1-2 `vercel --prod` (V18 — explicit "deploy" THIS turn). 5 commits ahead of prod.
- V50 Phase 3-7 still pending (next session — see Next action).
- 5 pre-existing TFP test failures (BSA T6.1 + phase-17-2-septies S3) — not caused by V50, separate fix.
