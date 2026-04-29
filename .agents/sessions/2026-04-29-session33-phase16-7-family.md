# Session 33 — 2026-04-29 EOD — Phase 16.7 Expense Report family + 16.7-quinquies plan

## Summary

Shipped 5 commits closing the Phase 16.7 Expense Report family (NEW tab + 4 follow-up fixes), then designed + planned Phase 16.7-quinquies (payroll + hourly + commission auto-computed). Two new iron-clad rule extensions locked (J expansion + K addition).

## Current State

- master = `31e2d79` · production = `f4e6127` (V15 #9 LIVE) · 10 commits unpushed-to-prod
- 4121/4121 tests pass · build clean · firestore.rules version 21 unchanged this session
- Phase 16.7 Expense Report tab LIVE-verified (รายจ่ายรวม ฿14,710 reconciles)
- Phase 16.7-quinquies spec + plan committed, ready for execution next session

## Commits

```
31e2d79 docs(plan): Phase 16.7-quinquies — payroll + hourly + commission implementation plan
a57b4e4 docs(spec): Phase 16.7-quinquies — payroll + hourly + commission design (brainstorming output)
f698ed7 fix(df-aggregator): Phase 16.7-quater — schema robustness for sale.sellers fallback
0e5b9ac fix(reports): Phase 16.7-ter — unlinked-treatment DF + branch sidebar empty state
088e784 feat(reports): Phase 16.7-bis — DfPayoutReportTab 4-column extension + QuotationFormModal seller fix
0daf6dd feat(reports): Phase 16.7 — Expense Report tab (รายจ่ายทั้งหมด) replicating ProClinic /admin/report/expense
e2e46f7 fix(clinic-report): Phase 16.2-bis — inline explanations + per-metric audit + 5 wiring bugs
```

## Files Touched (names only)

- src/components/backend/reports/widgets/MetricExplanationPopover.jsx (NEW)
- src/components/backend/reports/widgets/ExpenseSectionTable.jsx (NEW)
- src/components/backend/reports/ExpenseReportTab.jsx (NEW)
- src/lib/clinicReportMetricSpecs.js (NEW)
- src/lib/expenseReportAggregator.js (NEW)
- src/lib/expenseReportHelpers.js (NEW)
- src/lib/expenseReportMetricSpecs.js (NEW)
- src/hooks/useExpenseReport.js (NEW)
- src/lib/clinicReportAggregator.js (extended — enrichSalesWithDoctorIdFromTreatments + 5 wiring fixes)
- src/lib/clinicReportHelpers.js (extended — filterExpensesForReport + branchIds passthrough)
- src/components/backend/reports/ClinicReportTab.jsx (extended — metricSpec props + branch sidebar fallback)
- src/components/backend/reports/widgets/{KpiTile,RankedTableWidget,RetentionHeatmapWidget,BranchComparisonWidget}.jsx (metricSpec prop)
- src/components/backend/reports/DfPayoutReportTab.jsx (extended — 4-col + unlinked DF merge)
- src/lib/dfPayoutAggregator.js (extended — sellerId‖id + percent‖share + equal-split fallback)
- src/components/backend/QuotationFormModal.jsx (listStaff → listAllSellers)
- src/components/backend/nav/navConfig.js (expense-report nav entry)
- src/lib/tabPermissions.js (expense-report gate)
- src/pages/BackendDashboard.jsx (lazy import + render case)
- .claude/rules/00-session-start.md (Rule J extension + Rule K addition)
- CLAUDE.md (mirror)
- tests/phase16.2-bis-{4 files} (NEW — 171 cases)
- tests/phase16.7-{aggregator,helpers,tab,flow-simulate} (NEW — 80 cases)
- tests/phase16.7-bis-followups.test.jsx (NEW — 14 cases)
- tests/phase16.7-ter-unlinked-df.test.js (NEW — 29 cases)
- tests/phase16.7-quater-seller-percent-fix.test.js (NEW — 13 cases)
- tests/phase16.3-flow-simulate.test.js (count adjusted 47→48 for new tab)
- docs/superpowers/specs/2026-04-29-phase16-7-quinquies-payroll-design.md (NEW)
- docs/superpowers/plans/2026-04-29-phase16-7-quinquies-payroll.md (NEW)
- docs/proclinic-scan/_phase0-intel.log (gitignored — Phase 0 intel)

## Decisions (1-line each)

- **Phase 16.2-bis fix strategy**: orchestrator-level enrichment (no aggregator signature change per Phase 16.2 "ห้ามเปลี่ยน wiring เดิม" pact) for TOP-10 DOCTORS + 4 branch-awareness gaps
- **Phase 16.7 architecture**: 4 sections per ProClinic intel (Doctors / Staff+Assistants / Categories / Products placeholder); reuse Phase 14 dfPayoutAggregator; reuse existing `report_expense` permission key (no new key)
- **Phase 16.7-ter unlinked-DF**: helper handles baht-type direct + percent-type via course price lookup; idempotent with dfPayoutAggregator via `alreadyCountedSaleIds` set; totalAll = totalCategory + totalUnlinkedDf
- **Phase 16.7-quater fallback robustness**: accept seller.id‖seller.sellerId; accept seller.percent‖seller.share*100; equal-split when sum-of-percents=0 (43/57 production sales would be all-zero pre-fix); preventive — user's data has no DF rates configured so doesn't surface NEW DF
- **Rule J extension**: Plan-mode is ORTHOGONAL to brainstorming — both must run. Drift caught session 33 (entered plan mode for clinic-report follow-ups without `Skill(brainstorming)`). Locked in 00-session-start.md.
- **Rule K added**: Work-first, Test-last for multi-stream cycles. Build all structure across all streams → review → test bank as single final pass. Don't interleave (V21-class lock-in risk).
- **Phase 16.7-quinquies design** (brainstorming locked 3 Qs): trigger=computed-on-read AUTO (no approval); hourly=be_staff_schedules; commission=sale.sellers[].percent × sale.netTotal

## Next Todo

Execute Phase 16.7-quinquies plan (`docs/superpowers/plans/2026-04-29-phase16-7-quinquies-payroll.md`):
- 22 tasks across 6 phases (A schema/UI / B sync / C payrollHelpers / D wiring / E tests / F ship)
- Rule K-ordered: code first, tests as Phase E batch, single commit at end
- Pick subagent-driven-development (recommended) OR executing-plans

Standing items:
- V15 #10 deploy auth — 10 commits unpushed
- 16.5 RemainingCourse 2nd-pass / 16.1 SmartAudience / 16.4 Order parity pending

## Resume Prompt

```
Resume LoverClinic — continue from 2026-04-29 EOD (session 33).
Read: CLAUDE.md → SESSION_HANDOFF.md (master=31e2d79, prod=f4e6127) →
  .agents/active.md (4121 tests; 10 unpushed-to-prod) →
  .claude/rules/00-session-start.md →
  .agents/sessions/2026-04-29-session33-phase16-7-family.md

Next: execute docs/superpowers/plans/2026-04-29-phase16-7-quinquies-payroll.md
  (22 tasks A1-F3; Rule K work-first-test-last; subagent-driven OR executing-plans)

Outstanding: V15 #10 deploy auth · 16.5/16.1/16.4 pending · H-bis OFF
/session-start
```
