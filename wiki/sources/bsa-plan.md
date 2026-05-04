---
title: "BSA Implementation Plan (2026-05-04)"
type: source
date-created: 2026-05-04
date-updated: 2026-05-04
date-ingested: 2026-05-04
source-type: implementation-plan
location: docs/superpowers/plans/2026-05-04-branch-scope-architecture.md
tags: [bsa, plan, tdd, refactor]
---

# BSA Implementation Plan

> 12-task TDD plan that shipped Phase BSA in a single session. Plan lives at [`docs/superpowers/plans/2026-05-04-branch-scope-architecture.md`](../../docs/superpowers/plans/2026-05-04-branch-scope-architecture.md). This wiki source-page summarizes + cross-references.

## Why this plan exists

Phase BS V2 wired `_resolveBranchIdForWrite` on writers + 12 listers accept `{branchId, allBranches}` opts — but **callsites must pass `{branchId}` manually**. With 84 UI files importing `backendClient`, drift was inevitable. The TFP H-quater bug surfaced + the user asked for an architectural answer instead of more per-callsite churn. The plan is BSA: 3 layers + audit + flow-simulate.

## Tasks (each TDD)

| # | Task | Commit | Tests Δ |
|---|---|---|---|
| 1 | Layer 1 — Promotions/Coupons/Vouchers branch-scope + OR-merge | `e13f3c5` | +12 |
| 2 | Layer 1 — OnlineSales/SaleInsuranceClaims/VendorSales | `802f896` | +12 |
| 3 | Mark universal listeners `__universal__:true` (8 listeners) | `713958b` | +12 |
| 4 | **Layer 2** — `scopedDataLayer.js` + 111 BS2.9 surface tests | `4a297c2` | +159 |
| 5 | **Layer 3** — `useBranchAwareListener` hook | `df48944` | +11 |
| 6 | Migrate **84 UI imports** + 12 sanctioned exception annotations | `dd116b3` | +1 |
| 7 | **🎯 TFP H-quater fix** — replace `getAllMasterDataItems` with `be_*` listers | `6f76ec6` | +10 |
| 8 | Live listeners → hook | `131e378` | +2 |
| 9 | `/audit-branch-scope` skill BS-1..BS-8 + Tier 1 registration | `9401b0b` | +8 |
| 10 | Flow-simulate F1-F9 (Rule I) | `e32e733` | +9 |
| 11 | Remove dev-only sync re-exports from scopedDataLayer | `0d02260` | -26 |
| 12 | Rule L (BSA) + V-entry + active.md | `c5f0a58` | (docs) |

**Net**: 4744 → 4954 tests (+210). Plus subsequent leak-sweeps + Phase BS V3:
- `17f8ca4` — BSA leak sweep (6 staff/doctor UI surfaces) + 22 staff + 27 doctors baseline migration
- `40e9d8e` — Phase BS V3 (LINE per-branch via `be_line_configs/{branchId}` collection)
- `45ad80c` — BSA leak sweep 2 (stock order panel + marketing/deposit data baseline) + 48 doc migration

## Cross-references

- Implements: [Branch-Scope Architecture concept](../concepts/branch-scope-architecture.md)
- Sibling: [BSA design spec](bsa-spec.md)
- Related entities: [scopedDataLayer.js](../entities/scoped-data-layer.md), [useBranchAwareListener](../entities/use-branch-aware-listener.md)

## History

- 2026-05-04 — Plan written via `writing-plans` skill after spec approval.
- 2026-05-04 — Executed via `subagent-driven-development` skill in same session. 12 tasks, 12 commits, 14 commits-ahead-of-prod by end-of-session.
- 2026-05-04 (later) — Leak sweeps revealed by user's manual UI verification → 2 follow-up commits (`17f8ca4`, `45ad80c`).
- 2026-05-04 (later) — Phase BS V3 LINE-per-branch shipped (`40e9d8e`) per user "ใช้คนละ line กัน" directive.
