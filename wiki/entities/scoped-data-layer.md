---
title: scopedDataLayer.js
type: entity
entity-type: file
date-created: 2026-05-04
date-updated: 2026-05-04
tags: [bsa, layer-2, data-layer, wrapper, branch-scope]
source-count: 2
---

# `src/lib/scopedDataLayer.js` — BSA Layer 2

> Pure-JS wrapper module that re-exports `backendClient.js` with auto-injection of the currently-selected `branchId` for every UI lister call. The architectural answer to "how do we make `branchId` correct by default for hundreds of buttons" — change the import path, get correct semantics for free.

## Location

`F:/LoverClinic-app/src/lib/scopedDataLayer.js` — 413 lines after Task 11 trim.

## Purpose

Phase BS V2 (commit `cf897f6`) wired `_resolveBranchIdForWrite` on writers + 12 listers accept `{branchId, allBranches}` opts — but **callsites had to pass `{branchId}` manually**. With 84 UI files, drift was inevitable. `scopedDataLayer.js` centralizes the injection at the IMPORT BOUNDARY: UI components import from this module, get correctly-scoped data automatically.

## Three categories of exports

```js
// (a) Branch-scoped one-shot listers — auto-inject current branchId
export const listProducts = (opts = {}) =>
  raw.listProducts({ branchId: resolveSelectedBranchId(), ...opts });
// ... 25 more wrappers

// (b) Universal collections — re-export raw, no branch logic
export const listStaff = raw.listStaff;          // staff are universal (Phase BS V1 soft-gate)
export const listDoctors = raw.listDoctors;
export const getCustomer = raw.getCustomer;
// ... ~30 more

// (c) Stock-tier — re-export raw (caller passes locationId explicitly)
export const listStockTransfers = raw.listStockTransfers;
export const listStockWithdrawals = raw.listStockWithdrawals;
```

## Key invariants

- **V36.G.51 lock**: NO React imports. NO `BranchContext.jsx` import. Pure JS. Reads `branchId` via `resolveSelectedBranchId()` from `branchSelection.js`.
- **Lazy refactor (Task 6 fix-up)**: every `raw.X` access converted from module-load eager eval to call-time lazy `(opts={}) => raw.X({...})`. Required for vitest strict-namespace partial mocks to work without breaking.
- **`__universal__` listener marker preserved**: listeners tagged in Task 3 (e.g. `listenToCustomer.__universal__ = true`) propagate through the wrapper via `_makeUniversalListener` helper so `useBranchAwareListener` (Layer 3 hook) can detect + bypass branch logic.

## Override semantics

```js
import { listProducts } from '../lib/scopedDataLayer.js';

// 1. Default — auto-inject current branch
await listProducts();
// → raw.listProducts({ branchId: 'BR-NAKHON' })

// 2. Cross-branch (reports / aggregators) — opt-out
await listProducts({ allBranches: true });
// → raw.listProducts({ branchId: 'BR-NAKHON', allBranches: true })
// listProducts impl reads `useFilter = branchId && !allBranches` → no filter

// 3. Explicit branch override (rare — admin tools)
await listProducts({ branchId: 'BR-OTHER' });
// → raw.listProducts({ branchId: 'BR-OTHER' })  // spread-after-default lets caller win
```

## Audit invariants enforced

| ID | Rule |
|---|---|
| BS-1 | UI components in `src/components/**`, `src/pages/**`, `src/hooks/**`, `src/contexts/**` MUST import from `scopedDataLayer.js`, NOT `backendClient.js` directly (annotated whitelist for reports + sanctioned exceptions) |
| BS-7 | Universal collection re-exports must remain `= raw.X` (no `_scoped` wrap) |

See [/audit-branch-scope skill](../sources/bsa-spec.md) for the full BS-1..BS-8 list.

## Sanctioned exceptions (file-level annotation `// audit-branch-scope: ...`)

- `MasterDataTab.jsx` — Rule H-bis dev-only sync (BS-1 exception)
- `BackendDashboard.jsx` — root composition (BS-1 exception)
- 9 report tabs + `SmartAudienceTab.jsx` — `{allBranches:true}` cross-branch reads
- `clinicReportAggregator.js` / `cloneOrchestrator.js` / `expenseReportAggregator.js` — lib-level cross-branch helpers

## Cross-references

- Concept: [Branch-Scope Architecture](../concepts/branch-scope-architecture.md) — the pattern this file embodies
- Sibling: [`useBranchAwareListener` hook](use-branch-aware-listener.md) — Layer 3 (live listeners)
- Source: [BSA design spec](../sources/bsa-spec.md) §2.2 (Layer 2)
- Source: [BSA implementation plan](../sources/bsa-plan.md) Task 4
- Related concept: [Rule H-quater](../concepts/rule-h-quater.md) — `getAllMasterDataItems` is intentionally NOT re-exported (Task 11 lockdown)

## History

- 2026-05-04 — Created (Task 4, commit `4a297c2`). 27 wrappers + 30 universal re-exports + writers re-exported.
- 2026-05-04 — Surface-completion fix-up (commit `4a297c2`): added 22 missing UI-consumed exports (listenTo*, customer ops, sale ops, stock analysis, etc.) totaling 168 exports.
- 2026-05-04 — Lazy refactor on Task 6 import migration (commit `2c236d2`): every `raw.X` read deferred to call time for vitest strict-mock compatibility.
- 2026-05-04 — Master-data sync helpers removed (Task 11, commit `0d02260`): 23 dev-only re-exports stripped (those stay in backendClient for MasterDataTab consumption only).
- 2026-05-04 — Phase BS V3 LINE per-branch (commit `40e9d8e`): no scopedDataLayer changes (LINE config has its own client `lineConfigClient.js`).
- 2026-05-04 — BSA leak sweep 2 (commit `45ad80c`): `getAllDeposits` moved from universal pass-through to branch-scoped auto-inject.
