# Session 2026-05-08 EOD #2 — V50 ProClinic strip Phase 1+2 SHIPPED

## Summary

User-driven mega-session executing the H-bis pre-launch ProClinic strip. After V49 picker dropdown fix earlier in the day, user authorized full removal of ProClinic (UI + backend + extension) per directive: "ย้ายทุกอย่างไปเชื่อม backend เราแบบ seamlessly + เสร็จแล้วก็ลบไอ้ที่เกี่ยวกับ proclinic ออกไปอย่างสมบูรณ์". Phase 1 + 2 complete (4 commits, ~12K LOC removed). Phase 3-7 (creationBranchId + cross-branch e2e + Rule M data ops + memory) pending follow-up session.

## Current State
- master = `98e5105` · prod = `c92f924` (5 commits ahead — V49 + V50.Phase1-2)
- 7125/7131 tests PASS · 5 fail PRE-EXISTING (BSA T6.1 + phase-17-2-septies S3) — not V50-caused
- Build clean. BackendDashboard chunk 1018→933KB.
- AdminDashboard + BackendDashboard now UNIFIED on be_* (no proclinic mode); BSA branch-isolation preserved.

## Commits this session

```
98e5105 refactor(V50 Phase 2.3): test bank cleanup post-ProClinic strip
b1ecf59 refactor(V50 Phase 2.2): DELETE ProClinic infrastructure (-10,318 LOC)
91b044c refactor(V50 Phase 2.1): strip ClinicSettingsPanel ProClinic sections
121507b refactor(V50 Phase 1): migrate runtime broker.* callers to be_* canonical
```

## Files Touched

**Migrated (Phase 1 — 5 files)**:
- src/components/ChartTemplateSelector.jsx (ProClinic source tab + loadPcTemplates removed)
- src/components/ChartCanvas.jsx (ProClinic image proxy branch removed)
- src/components/TreatmentTimeline.jsx (3 broker calls → be_treatments equivalents)
- src/pages/PatientDashboard.jsx (broker.getCourses → getCustomer + getCustomerAppointments)
- src/components/TreatmentFormPage.jsx (saveTarget default 'proclinic'→'backend', PROCLINIC MODE block deleted, 9 conditional broker.* sites stripped, broker.update/createTreatment in handleSubmit replaced with throw)

**Sections stripped (Phase 2.1 — 1 file, -329 LOC)**:
- src/components/ClinicSettingsPanel.jsx (3 sections + 12 state vars + masterDataSyncCard IIFE + 7 broker imports)

**DELETED (Phase 2.2 — 24 files, -10,318 LOC)**:
- src/lib/{brokerClient,cloneOrchestrator,customerBranchBaselineClient}.js
- src/components/backend/{CloneTab,MasterDataTab}.jsx
- api/proclinic/** (14 files: master, connection, explore, customer, appointment, treatment, courses, deposit, _lib/{auth,fields,retry,scraper,session,appointmentTypeProClinic})
- cookie-relay/** (5 files)

**Wiring updates (Phase 2.2)**:
- src/pages/BackendDashboard.jsx (CloneTab + MasterDataTab imports + tab routes removed; default 'clone'→'customers')
- src/components/backend/nav/navConfig.js ('clone' + 'masterdata' nav items removed)

**Test cleanup (Phase 2.3 — 9 files, -1,168 LOC)**:
- Updated: tests/{backend-nav-config, phase11-master-data-scaffold, course-skip-stock-deduction}.test.{js,jsx}
- DELETED: tests/{phase-24-0-vicies-novies-{ter-sync-source-switch, octies-migrate-stamps-branchid, decies-migrate-button-coverage}, branch-selector-bs-{c-customer-schema, g-baseline-migration}, phase-19-0-proclinic-translator}.test.js

## Decisions (1-line each)

- Surgical strip = Image scope (Option A) — chosen over Image-literal (C) and Full-runtime-broker (B) per user "หลอมรวมเป็นระบบเดียวกัน + ทำงานไม่ซับซ้อน + ตาม flow ที่บอก"
- TFP saveTarget default `'proclinic'` → `'backend'` (line 298) — AdminDashboard inherits default; only callsite passing 'backend' is BackendDashboard. Both now use be_* path.
- PROCLINIC MODE block in TFP useEffect (line 879+ ~177 LOC) DELETED — was unreachable post-default-flip
- Conditional broker.* sites: `if (saveTarget === 'backend') {...} else {broker.*}` → kept backend body, stripped else
- broker.updateTreatment + createTreatment in handleSubmit → replaced with `throw new Error('V50: saveTarget must be "backend"')` (defensive guard if saveTarget non-backend)
- be_customers docId === proClinicId for ProClinic-cloned (PatientDashboard public-link assumption holds — gated upstream by `sessionData?.brokerProClinicId`)
- Test strategy: V50-caused failures → flip assertions to V50 anti-regression OR delete obsolete test files. Pre-existing failures (TFP block-extract regex + BSA T6.1) — leave as separate task.
- Preserve auto-link / cascade-delete / move-appointment flows untouched per user — all be_*-based already
- BSA branch isolation: be_appointments / be_deposits stamp branchId via `_resolveBranchIdForWrite` (already in place per V49 work) — frontend cross-branch booking correctness preserved

## Next Todo

1. **Phase 3** (next session) — Add `be_customers.creationBranchId` field stamp at `addCustomer` (in `backendClient.js:saveCustomer`). Verify cross-branch booking flow on dev server via preview_eval (AdminDashboard appointment + deposit creation across 3 branches × 2 fixture types). Verify auto-link + cascade-delete still work.
2. **Phase 4** — World-class cross-branch frontend booking e2e bank (12-cat prof-grade per V48 pattern: source-grep + property-based mulberry32×100 + cross-branch identity + adversarial Thai/Unicode + idempotency + forward-compat + class-of-bug classifier + user-report repro + future-branch fixture). Live admin-SDK e2e against real prod with TEST-prefixed fixtures.
3. **Phase 5** — Final verify (build, full suite, preview_eval real-prod confirm 3 branches each book to correct branchId).
4. **Phase 6** — Rule M data ops: delete `master_data/*` + `broker_jobs/*` + `pc_*` + `clinic_settings/proclinic_session*` via admin-SDK 2-phase script + audit doc.
5. **Phase 7** — V50 V-entry in `.claude/rules/00-session-start.md` + NEW AV28 audit invariant (no broker.*/api/proclinic imports allowed) + Rule H-bis flipped to **EXECUTED** state + SESSION_HANDOFF + active.md update + final commit + deploy auth (V18).
6. **Outstanding from prior**: Pre-existing TFP test failures (BSA T6.1 dynamic-import annotation + phase-17-2-septies S3 block-regex) — separate task.

## Resume Prompt

```
Resume LoverClinic — continue V50 ProClinic strip from 2026-05-08 EOD #2.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=98e5105, prod=c92f924 — 5 commits ahead)
3. .agents/active.md (7125/7131 tests PASS)
4. .claude/rules/00-session-start.md (iron-clad A-O + V42-V49 V-summary)
5. .agents/sessions/2026-05-08-v50-proclinic-strip.md

Status: master=98e5105, 7125 tests pass, prod=c92f924
Next: V50 Phase 3 — be_customers.creationBranchId + cross-branch booking verify
Outstanding (user-triggered):
- 🚨 V49+V50.Phase1-2 vercel --prod (V18 — explicit "deploy" THIS turn)
- V50 Phase 3-7 still pending (creationBranchId + e2e + Rule M data ops + V-entry/AV28/H-bis EXECUTED)
- 5 pre-existing TFP test failures (BSA T6.1 + phase-17-2-septies S3) — separate
Rules: V18 deploy auth never rolls over; AV20-AV27 invariant set; Rule H-bis IN PROGRESS (Phase 1+2 done, 3-7 pending)
/session-start
```
