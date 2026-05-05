# 2026-05-05 — Phase 17 trilogy + 17.2-bis + 17.2-ter

## Summary

Marathon session shipping the Phase 17 trilogy (BS-9 invariant lock / cross-branch master-data import / branch equality "no main") in 3 commits, plus 2 user-reported regression hotfixes (per-user-key resolver + schedule listener branch filter). 5 commits total. Phase 17.2 migration `--apply` ran on prod data (3 writes, idempotent). V15 #18 deployed bundling Phase 17.0 + 17.1 + 17.2 source — but a cross-branch leak surfaced post-deploy that the bis+ter hotfixes resolve. master now 2 commits ahead-of-prod, awaiting V15 #19 explicit deploy.

## Current State

- master = `281c871` = 2 commits ahead-of-prod
- prod = `24aa9e9` (V15 #18 LIVE 2026-05-05; bundles Phase 17.0 + 17.1 + 17.2 source — has cross-branch leak)
- 5199 tests pass · build clean · firestore.rules v25
- Phase 17.2 migration applied to prod data (3 writes — audit doc `be_admin_audit/phase-17-2-remove-main-branch-1777961452972-23486624-68e2-4330-b5e6-4519fa6cb706`)
- Wiki at 16 entities + 9 concepts + 3 sources; index/log updated through Phase 17.0 backfill

## Commits (chronological)

```
281c871 fix(phase-17-2-ter): TodaysDoctorsPanel cross-branch leak via listenToScheduleByDay
0361268 fix(phase-17-2-bis): per-user-key resolver + cross-branch leak guard
24aa9e9 feat(phase-17-2-branch-equality): remove main/default branch concept end-to-end
ff78426 feat(phase-17-1-cross-branch-import): admin-only selective master-data import across branches
5799bd5 fix(phase-17-0-bsa-leak-sweep-3): close 5 branch-leak surfaces + lock BS-9 + wiki backfill
```

## Files touched (top-level, names only)

**Phase 17.0** (38 files): src/lib/{backendClient,scopedDataLayer}.js · src/components/backend/{Promotion,Coupon,Voucher,OnlineSales,VendorSales}Tab.jsx · src/components/TreatmentFormPage.jsx · .claude/skills/audit-branch-scope/{SKILL,patterns}.md · .claude/rules/00-session-start.md · 4 NEW Phase 17.0 test files · ~17 NEW wiki pages
**Phase 17.1** (25 files): NEW api/admin/cross-branch-import.js · NEW src/lib/crossBranchImportAdapters/ (8 files) · NEW src/components/backend/CrossBranchImport{Button,Modal}.jsx · 7 master-data tab wires · 4 NEW test files
**Phase 17.2** (40 files): NEW scripts/phase-17-2-remove-main-branch.mjs · src/App.jsx (hoist BranchProvider) · src/lib/{BranchContext,branchSelection,branchValidation,backendClient,stockUtils}.js · src/components/backend/{BranchFormModal,BranchesTab,BranchSelector,MasterDataTab}.jsx + 6 stock panels · src/components/TreatmentFormPage.jsx · src/pages/BackendDashboard.jsx · 4 NEW Phase 17.2 test files + 12 stale tests updated + 3 deleted
**Phase 17.2-bis** (7 files): src/lib/{branchSelection,scopedDataLayer}.js · 4 test updates
**Phase 17.2-ter** (3 files): src/lib/{backendClient,scopedDataLayer}.js · src/components/backend/AppointmentTab.jsx

## Decisions (one-line each — full reasoning in commit messages + spec/plan files)

- Phase 17 split into trilogy (BS-9 / cross-branch import / branch equality) per dependency-clean decomposition; each gets own brainstorm → spec → plan → execute cycle
- Phase 17.0 wiki backfill bundled to validate "wiki-first" methodology — caught a real spec bug (TFP duplicate import via SELECTED_BRANCH_ID name) pre-implementation
- Phase 17.0 BS-9 invariant locked in 3 places (skill audit + feedback memory + Rule L) per user directive "บันทึกไว้เป็นข้อสำคัญ" — defense in depth
- Phase 17.0 BS-9 audit caught 2 BONUS violations beyond planned scope (VendorSalesTab + OnlineSalesTab); fixed inline via same 3-line pattern
- Phase 17.1 server endpoint (NOT client-side write) chosen for atomicity — single firebase-admin batch covers N entity docs + 1 audit doc; matches existing `/api/admin/cleanup-*` pattern
- Phase 17.1 implementer adjustments vs plan: adapter `displayRow` returns plain `{primary,secondary,tertiary}` (NOT JSX) for SSR safety; courses `dedupKey` uses `courseName||name` fallback for legacy compat; df-groups strips `id`+`groupId`+`dfGroupId` defensively + server re-stamps for legacy reader compat
- Phase 17.2 migration script `--apply` authorized + run on prod (3 writes, idempotent) — admin scope with explicit user confirmation
- Phase 17.2-bis null-guard helpers (`_autoInject` / `_autoInjectPositional`) safer than the prior unconditional spread — wrappers return `[]` instead of leaking when no branch resolved
- Phase 17.2-ter — internal backendClient leaks (unfiltered `onSnapshot(staffSchedulesCol(),...)` + `await listStaffSchedules()`) need branchId opts threaded through; user reported as "แพทย์เข้าตรวจ" phantom data
- Vercel CLI hangs after successful deploys (V15 #18 deploy showed 3 successful builds in `vercel ls` while CLI process hung) — quirk; deploys actually land

## Out-of-scope / follow-up audit (flagged not blocking)

Internal backendClient.js calls/subscriptions that bypass scopedDataLayer + read branch-scoped collections without branchId filter:

- `_resolveProductIdByName` ~line 6132 — `await listProducts()` no opts
- `findProductGroupByName` ~line 8474 — `getDocs(productGroupsCol())` unfiltered
- `saveBankAccount` isDefault mutex ~line 9969 — `getDocs(bankAccountsCol())` unfiltered (cross-branch isDefault unset; minor since bank-account isDefault is intentionally per-branch but unset spans all)
- `listStockTransfers` / `listStockWithdrawals` ~lines 7593, 7888 — cross-tier semantic, may be intentional, needs careful tier review
- `listExpenses` ~line 10057 — `getDocs(expensesCol())` unfiltered then filter in-memory; through scopedDataLayer Fix B safe; direct callers leak

These don't surface as user-reported bugs (internal helpers in audit/lookup paths). Worth a systematic backendClient-internal-call audit in a follow-up.

## Migrations applied to prod data

```
be_admin_audit/phase-17-2-remove-main-branch-1777961452972-23486624-68e2-4330-b5e6-4519fa6cb706
  3 writes:
  - 1 stock batch locationId: 'main' → 'BR-1777873556815-26df6480' (นครราชสีมา)
  - 2 be_branches docs — isDefault field stripped (was set on นครราชสีมา + พระราม 3)
```

Idempotent: re-running script finds 0 docs (verified post-apply).

## Next Todo

- 🚨 **Deploy V15 #19** (awaits explicit user "deploy" THIS turn) — bundles Phase 17.2-bis + 17.2-ter to clear prod cross-branch leak
- Browser smoke verify post-deploy: TFP modals + Promotion/Coupon/Voucher + AppointmentTab TodaysDoctorsPanel show correct per-branch data
- Internal-leak audit follow-up (5 sites flagged above)
- LineSettings พระราม 3 admin entry · Hard-gate Firebase claim · /audit-all readiness

## Resume Prompt

See `SESSION_HANDOFF.md` Resume Prompt block for the canonical message.
