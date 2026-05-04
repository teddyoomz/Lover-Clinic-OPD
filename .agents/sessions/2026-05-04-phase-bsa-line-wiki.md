# 2026-05-04 — Phase BSA + LINE per-branch + Wiki bootstrap

## Summary

Marathon session that shipped Phase BSA (Branch-Scope Architecture, 12 tasks) closing user-reported branch-leak bug, plus 2 follow-up leak-sweep commits, Phase BS V3 LINE-per-branch infrastructure, complete wiki bootstrap per Karpathy LLM Wiki pattern, and V15 #16 production deploy. master = prod = `f39760b`. 18 commits shipped across the session.

## Current State (post-session)

- master = `f39760b` = prod LIVE (V15 #16) — 0 commits ahead-of-prod
- 4744 → 4997 tests (+253 net), build clean, firestore.rules v25 (be_line_configs added)
- 3 BSA layers live, /audit-branch-scope BS-1..BS-8 enforced, flow-simulate F1-F9 green
- 8 universal listeners marked `__universal__:true` per Phase BSA Task 3
- `~/.claude/skills/llm-wiki/` installed as base skill — auto-loads at session boot
- 12-page wiki at `wiki/` (sources/entities/concepts) seeded from Karpathy gist + BSA docs

## Commits (chronological)

```
f39760b docs(wiki): bootstrap LoverClinic codebase wiki (Karpathy LLM Wiki pattern)
45ad80c fix(bsa-leak-sweep-2): stock-order leak + marketing/deposits branch baseline
40e9d8e feat(phase-bs-v3-line): per-branch LINE OA configuration
17f8ca4 fix(bsa-leak-sweep): plug 6 staff/doctor branch-leak surfaces + baseline migration
c5f0a58 docs(bsa-task12): Rule L (BSA) + Phase BSA V-entry + active.md update
0d02260 chore(bsa-task11): remove dev-only sync re-exports from scopedDataLayer
e32e733 test(bsa-task10): branch-scope flow-simulate F1-F9 (Rule I)
9401b0b feat(bsa-task9): /audit-branch-scope skill — BS-1..BS-8 invariants
131e378 refactor(bsa-task8): migrate branch-scoped listeners → useBranchAwareListener
6f76ec6 fix(bsa-task7): TFP H-quater — replace getAllMasterDataItems with be_* listers
dd116b3 refactor(bsa-task6-cr): migrate 3 dynamic-import stragglers + source-grep guard
2c236d2 refactor(bsa-task6): migrate UI imports backendClient → scopedDataLayer
df48944 feat(bsa-task5): useBranchAwareListener hook — Layer 3
4a297c2 refactor(bsa-task4-cr): scopedDataLayer surface completion + BS2.4 tightening
dabd8e8 feat(bsa-task4): scopedDataLayer.js — Layer 2 wrapper for auto-inject
713958b feat(bsa-task3): mark universal listeners __universal__:true
802f896 refactor(bsa-task2-cr): tighten T2.D writer tests + JSDoc legacy-doc gotcha
5fe7316 feat(bsa-task2): branch-scope listOnlineSales/SaleInsuranceClaims/VendorSales + writers
e13f3c5 refactor(bsa-task1-cr): extract _listWithBranchOrMerge helper + test hardening
9e54e08 feat(bsa-task1): branch-scope listPromotions/Coupons/Vouchers + writer stamps
```

## Files Touched (top-level, names only)

- `src/lib/scopedDataLayer.js` (NEW) — Layer 2 auto-inject
- `src/lib/branchSelection.js` (existed) — pure-JS branchId resolver
- `src/lib/lineConfigClient.js` (NEW) — Phase BS V3 client helper
- `src/lib/branchScopeUtils.js` (existed) — filterStaffByBranch / filterDoctorsByBranch
- `src/hooks/useBranchAwareListener.js` (NEW) — Layer 3 hook
- `src/lib/backendClient.js` — Layer 1 (extended Tasks 1-3 + Phase BS V3 + leak sweep 2)
- `api/admin/_lib/lineConfigAdmin.js` (NEW)
- `api/webhook/line.js` — branch-aware routing
- `api/admin/{line-test,send-document,link-requests}.js` — branch-aware
- `src/components/{TreatmentFormPage,backend/AppointmentTab,DepositPanel,DoctorSchedulesTab,EmployeeSchedulesTab,BulkPrintModal,DocumentPrintModal,CustomerDetailView,LineSettingsTab,OrderPanel}.jsx` — leak fixes + BS V3 wiring
- `~84 UI files` — Task 6 mass import migration backendClient → scopedDataLayer
- `firestore.rules` — be_line_configs/{branchId} block added
- `.claude/skills/audit-branch-scope/{SKILL.md,patterns.md}` (NEW) — BS-1..BS-8
- `tests/{audit-branch-scope,branch-scope-flow-simulate,phase-bs-v3-line-per-branch,scopedDataLayer,useBranchAwareListener,bsa-task[1-3,7,8]-*}.test.{js,jsx}` (NEW or extended)
- `scripts/{staff-doctors-branch-baseline,staff-doctors-audit-fixup,staff-doctors-branch-filter-smoke-test,line-config-migrate,bsa-leak-sweep-2-marketing-deposits-baseline,probe-deploy-probe}.mjs` (NEW)
- `docs/superpowers/specs/2026-05-04-branch-scope-architecture-design.md` (NEW)
- `docs/superpowers/plans/2026-05-04-branch-scope-architecture.md` (NEW)
- `wiki/{CLAUDE,index,log}.md` + `wiki/{sources,entities,concepts}/*.md` (NEW — 12 files)
- `~/.claude/skills/llm-wiki/{SKILL.md,reference.md}` (NEW — global)
- `~/.claude/CLAUDE.md` — added llm-wiki to SESSION BOOT
- `.claude/rules/00-session-start.md` — Rule L (BSA) added
- `.claude/rules/v-log-archive.md` — Phase BSA verbose entry

## Decisions (one-line each — full reasoning in v-log-archive Phase BSA entry)

- BSA architectural choice over per-callsite refactor — central wrapper at import boundary scales better with 84 UI files
- Universal vs branch-scoped collection list locked: see Rule L in `.claude/rules/00-session-start.md`
- LINE config = collection (`be_line_configs/{branchId}`), not single-doc with branchOverrides; webhook routes by `event.destination`
- Listeners stay raw in scopedDataLayer; useBranchAwareListener hook handles re-subscribe at React layer
- Master-data sync helpers (getAllMasterDataItems / migrateMaster*ToBe) stay in backendClient.js for MasterDataTab; NOT re-exported via scopedDataLayer (Task 11 lockdown)
- be_deposits added to branch-scoped set; getCustomerDeposits / getActiveDeposits stay universal (customer-attached lookup)
- llm-wiki = always-on default mode for knowledge work per "ใช้เป็นหลักเหมือนอากาศหายใจ"
- Task 7 + leak sweeps + Phase BS V3 ALL forced data backfills (existing data lacked branchId field) — total 49+1+48 = 98 docs migrated to นครราชสีมา baseline
- Probe-Deploy-Probe protocol formalized in `scripts/probe-deploy-probe.mjs` (5 endpoints + admin-SDK cleanup) — first reusable script for future deploys

## Migrations (admin SDK against prod)

```
be_admin_audit/staff-doctors-branch-baseline-1777908142954    — 22 staff + 27 doctors
be_admin_audit/line-config-migrate-1777910315350              — chat_config.line → be_line_configs/{NAKHON_ID}
be_admin_audit/bsa-leak-sweep-2-marketing-deposits-baseline-1777919425995  — 18 promotions + 17 coupons + 9 vouchers + 4 deposits
```

## Next Todo

- Idle — Phase 17 plan TBD
- Wiki ingest on demand (Phase plans, V-entries, major files, master collections)
- Hard-gate via Firebase custom claim (Phase BS-future)
- /audit-all orchestrator readiness pass

## Resume Prompt

See `~/.claude/projects/F--LoverClinic-app/memory/SESSION_HANDOFF.md` for the canonical Resume Prompt block.
