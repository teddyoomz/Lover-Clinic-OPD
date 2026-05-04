---
title: Branch-Scope Architecture (BSA)
type: concept
date-created: 2026-05-04
date-updated: 2026-05-04
tags: [bsa, multi-branch, refactor, layer, audit, phase-bsa]
source-count: 2
---

# Branch-Scope Architecture (BSA)

> 3-layer wrapper + audit pattern that makes `branchId` default-correct for every UI read in LoverClinic. Solves the user-reported "branch leak" bug class where switching branch via the top-right BranchSelector left UI surfaces showing data from the previous branch. Shipped as Phase BSA in 12 tasks (2026-05-04).

## Problem

The clinic runs multiple branches (currently นครราชสีมา default + พระราม 3). Phase BS V2 added `_resolveBranchIdForWrite` to writers + 12 listers accept `{branchId, allBranches}` opts — **but callsites had to pass `{branchId}` manually**. With 84 UI files importing `backendClient`, drift was inevitable.

User-reported bug (verbatim, 2026-05-04 brainstorming):
> "เลือกเป็นสาขาพระราม 3 ไว้ แล้วไปเปิดหน้าสร้างการรักษาใหม่ ทุกปุ่มแม่งยังดึงของสาขา นครราชสีมา มาอยู่เลย ทั้งคอร์ส ยา ค่ามือ แพทย์ ผู้ช่วย"

Bug class to eliminate:
1. New callsite forgets `{branchId}` → silently wrong
2. Snapshot listener doesn't re-subscribe on branch switch → stale until F5
3. Direct `master_data/*` read bypassing the be_* layer (Rule H-quater violation)
4. Server endpoint reads collections without honoring caller's branchId

## Solution — 3 layers + audit

| Layer | File | Purpose |
|---|---|---|
| **Layer 1** | `src/lib/backendClient.js` (existing) | Raw, parameterized — every lister accepts `{branchId, allBranches}` |
| **Layer 2** | [`src/lib/scopedDataLayer.js`](../entities/scoped-data-layer.md) | UI-only wrapper. Auto-injects `resolveSelectedBranchId()`. Pure JS — V36.G.51 lock. |
| **Layer 3** | [`src/hooks/useBranchAwareListener.js`](../entities/use-branch-aware-listener.md) | onSnapshot listeners auto-resubscribe on branch switch. `__universal__` marker bypass. |
| **Audit** | `/audit-branch-scope` (BS-1..BS-8) | Build-blocking source-grep regressions. Tier 1 in `/audit-all`. |

The wrapper layer is the architectural answer to "how do we make branchId correct by default for hundreds of buttons" — change the import path, get correct semantics for free.

## Universal vs branch-scoped collections (locked)

### Universal (NOT branch-scoped)

- `be_staff` — branch access via per-staff `branchIds[]` field (Phase BS V1 soft-gate)
- `be_doctors` — same
- `be_customers` + customer-attached: wallets, memberships, points, treatments, sales, appointments, deposits (per-record, lookup), course-changes
- `be_branches`, `be_permission_groups`, `be_document_templates`, `be_audiences`
- `be_admin_audit`, `be_central_stock_*`, `be_vendors`, `be_link_tokens`
- `system_config` / `clinic_settings`, `chat_conversations`

### Branch-scoped (filtered by selected branchId)

- `be_treatments`, `be_sales`, `be_appointments`, `be_quotations`
- `be_vendor_sales`, `be_online_sales`, `be_sale_insurance_claims`
- All `be_stock_*` (`locationId` field)
- `be_products`, `be_courses`, `be_product_groups`, `be_product_units`, `be_medical_instruments`, `be_holidays`
- `be_df_groups`, `be_df_staff_rates`
- `be_bank_accounts`, `be_expense_categories`, `be_expenses`
- `be_staff_schedules`, `be_link_requests`
- `be_promotions`, `be_coupons`, `be_vouchers` — plus `allBranches:true` doc-field OR-merge
- `be_line_configs` — Phase BS V3 added; one doc per branch
- `be_deposits` — added by BSA leak sweep 2 (commit `45ad80c`)

### List-scoped only (customer-attached lookups remain universal)

`getCustomerDeposits(customerId)` and `getActiveDeposits(customerId)` stay universal even though `getAllDeposits` is branch-scoped — customers can have deposits at any branch and customer-detail views aggregate across all.

## Anti-patterns (build-blocked via audit)

| ID | Anti-pattern | Detector |
|---|---|---|
| BS-1 | UI component imports `backendClient.js` directly | `git grep "from '../../lib/backendClient'"` minus annotated whitelist |
| BS-2 | `master_data/*` reads in feature code (Rule H-quater) | `git grep "master_data/"` minus MasterDataTab + migrators |
| BS-3 | `getAllMasterDataItems` referenced anywhere outside MasterDataTab | `git grep "getAllMasterDataItems\("` |
| BS-4 | Branch-scoped `listenTo*` not wrapped in `useBranchAwareListener` | grep direct calls minus annotation |
| BS-5 | New collection unclassified | `tests/branch-collection-coverage.test.js` matrix lookup |
| BS-6 | Flow-simulate test missing | `tests/branch-scope-flow-simulate.test.js` existence |
| BS-7 | scopedDataLayer wraps a universal collection | source-grep universal exports remain `= raw.X` |
| BS-8 | Writer loses `_resolveBranchIdForWrite` stamp | grep count ≥17 in backendClient.js |

## Annotation comments (sanctioned exceptions)

| Comment | Meaning |
|---|---|
| `// audit-branch-scope: report — uses {allBranches:true}` | Cross-branch reports/aggregators (BS-1 exception) |
| `// audit-branch-scope: listener-direct — wired via useEffect` | Positional-args listeners (BS-4 exception) |
| `// audit-branch-scope: sanctioned exception — Rule H-bis` | MasterDataTab dev-only sync |
| `// audit-branch-scope: sanctioned exception — root composition` | BackendDashboard.jsx |
| `// audit-branch-scope: BS-2 OR-field` | Marketing collection with `allBranches:true` doc-level field |
| `// audit-branch-scope: BS-3 dev-only` | `getAllMasterDataItems` callsite reserved (none currently) |
| `// audit-branch-scope: cross-branch — <reason>` | Customer-attached entity lookup needs all-branch (e.g. CustomerDetailView doctor name map) |

## Lessons

1. **Per-callsite migration patterns scale linearly with callsite count** — 84 UI files is too many. Centralize at the import boundary.
2. **Auto-inject by default is safer than explicit-required** — for the COMMON path. Explicit opt-out covers rare cross-branch cases. Default-correct + explicit-opt-out flips the failure mode from silent-wrong to loud-no-data.
3. **Listener re-subscribe needs a hook** — call-time injection works for one-shots; lifecycle handling is a separate concern.
4. **Universal-marker pattern (`fn.__universal__ = true`)** lets the same hook handle branch-scoped + universal listeners without exposing the distinction at every callsite.
5. **Rule H-quater enforcement at the lib level** (delete `getAllMasterDataItems`) prevents fallback-by-temptation.
6. **Audit at the import boundary** is the most ergonomic invariant — easy to grep, easy to fix, hard to bypass.

## Follow-up bugs caught after Phase BSA shipped

User's manual UI verification revealed surfaces that the pure-helper smoke missed:

- `17f8ca4` BSA leak sweep: AppointmentTab calendar / DepositPanel sellers / Doctor + Employee Schedules / BulkPrintModal + DocumentPrintModal print signers — all called `listStaff()/listDoctors()` without applying `filterStaffByBranch` / `filterDoctorsByBranch`. Plus baseline migration: 22 staff + 27 doctors → `branchIds: [นครราชสีมา]` to enable RAMA3 = empty smoke.
- `45ad80c` BSA leak sweep 2: Stock OrderPanel didn't include `BRANCH_ID` in `useCallback` deps (stale closure on switch). `getAllDeposits` was universal pass-through but should be branch-scoped. Plus baseline migrations for be_promotions (18) / be_coupons (17) / be_vouchers (9) / be_deposits (4) — 48 docs total → `branchId: นครราชสีมา` (had been invisible because Phase BSA Task 1 OR-merge filter excludes docs without branchId+allBranches).
- `40e9d8e` Phase BS V3: LINE OA settings + link requests are now per-branch via `be_line_configs/{branchId}` collection. Webhook routes by `event.destination`. Migration: existing `clinic_settings/chat_config.line` → `be_line_configs/{NAKHON_ID}`.

Lesson: Phase BSA design was correct, but data-baseline migrations were needed across many collections beyond what the original Phase BS V2 migration covered. Whenever a new auto-inject lister lands, audit existing data for missing branchId field.

## Cross-references

- Source: [BSA design spec](../sources/bsa-spec.md)
- Source: [BSA implementation plan](../sources/bsa-plan.md)
- Layer 2 entity: [scopedDataLayer.js](../entities/scoped-data-layer.md)
- Layer 3 entity: [useBranchAwareListener](../entities/use-branch-aware-listener.md)
- Related rule: [Rule H-quater](rule-h-quater.md) — no master_data reads in feature code
- Related rule: [Rule L (BSA codified)](iron-clad-rules.md) — iron-clad rule that locks this architecture
- Related concept: [LoverClinic architecture](lover-clinic-architecture.md) — top-level system context

## History

- 2026-05-04 — BSA shipped in 12 tasks (commits `e13f3c5`..`c5f0a58`).
- 2026-05-04 (later) — BSA leak sweep + LINE per-branch + leak sweep 2: commits `17f8ca4`, `40e9d8e`, `45ad80c`.
- 2026-05-04 — Wiki concept page created.
