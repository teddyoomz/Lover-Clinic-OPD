---
title: scopedDataLayer.js
type: entity
entity-type: file
date-created: 2026-05-04
date-updated: 2026-05-05
tags: [bsa, layer-2, data-layer, wrapper, branch-scope, phase-17-0]
source-count: 2
---

# `src/lib/scopedDataLayer.js` — BSA Layer 2

> Pure-JS wrapper module that re-exports `backendClient.js` with auto-injection of the currently-selected `branchId` for every UI lister call. The architectural answer to "how do we make `branchId` correct by default for hundreds of buttons" — change the import path, get correct semantics for free.

## Location

`F:/LoverClinic-app/src/lib/scopedDataLayer.js` — 396 lines after Task 11 trim.

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

- **V36.G.51 lock**: NO React imports. NO `BranchContext.jsx` import. Pure JS. Reads `branchId` via `resolveSelectedBranchId()` from `branchSelection.js` (`scopedDataLayer.js:32`).
- **Lazy refactor (Task 6 fix-up)**: every `raw.X` access converted from module-load eager eval to call-time lazy `(opts={}) => raw.X({...})`. Required for vitest strict-namespace partial mocks to work without breaking.
- **`__universal__` listener marker preserved**: listeners tagged in Task 3 (e.g. `listenToCustomer.__universal__ = true`) propagate through the wrapper via `_makeUniversalListener` helper (`scopedDataLayer.js:127-131`) so `useBranchAwareListener` (Layer 3 hook) can detect + bypass branch logic.

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

## Function reference

Every exported symbol classified by branch-scope category. Source line cites `src/lib/scopedDataLayer.js`.

### Branch-scoped (auto-inject) — 26 listers

| Function | Signature | Underlying Layer 1 | Line |
|---|---|---|---|
| `listProducts` | `(opts = {}) => Promise<Array>` | `raw.listProducts` | 37 |
| `listCourses` | `(opts = {}) => Promise<Array>` | `raw.listCourses` | 38 |
| `listProductGroups` | `(opts = {}) => Promise<Array>` | `raw.listProductGroups` | 39 |
| `listProductUnitGroups` | `(opts = {}) => Promise<Array>` | `raw.listProductUnitGroups` | 40 |
| `listMedicalInstruments` | `(opts = {}) => Promise<Array>` | `raw.listMedicalInstruments` | 41 |
| `listHolidays` | `(opts = {}) => Promise<Array>` | `raw.listHolidays` | 42 |
| `listDfGroups` | `(opts = {}) => Promise<Array>` | `raw.listDfGroups` | 43 |
| `listDfStaffRates` | `(opts = {}) => Promise<Array>` | `raw.listDfStaffRates` | 44 |
| `listBankAccounts` | `(opts = {}) => Promise<Array>` | `raw.listBankAccounts` | 47 |
| `listExpenseCategories` | `(opts = {}) => Promise<Array>` | `raw.listExpenseCategories` | 48 |
| `listExpenses` | `(opts = {}) => Promise<Array>` | `raw.listExpenses` | 49 |
| `listStaffSchedules` | `(opts = {}) => Promise<Array>` | `raw.listStaffSchedules` | 52 |
| `listOnlineSales` | `(opts = {}) => Promise<Array>` | `raw.listOnlineSales` | 60 |
| `listSaleInsuranceClaims` | `(opts = {}) => Promise<Array>` | `raw.listSaleInsuranceClaims` | 61 |
| `listVendorSales` | `(opts = {}) => Promise<Array>` | `raw.listVendorSales` | 62 |
| `listQuotations` | `(opts = {}) => Promise<Array>` | `raw.listQuotations` | 63 |
| `getAllDeposits` | `(opts = {}) => Promise<Array>` | `raw.getAllDeposits` | 67 |
| `listAllSellers` | `(opts = {}) => Promise<Array>` | `raw.listAllSellers` | 70 |
| `listStaffByBranch` | `(opts = {}) => Promise<Array>` | `raw.listStaffByBranch` | 71 |
| `getAllSales` | `(opts = {}) => Promise<Array>` | `raw.getAllSales` | 74 |
| `getAppointmentsByDate` | `(positional, opts = {}) => Promise<Array>` | `raw.getAppointmentsByDate` | 75 |
| `getAppointmentsByMonth` | `(positional, opts = {}) => Promise<Array>` | `raw.getAppointmentsByMonth` | 76 |
| `listStockBatches` | `(opts = {}) => Promise<Array>` | `raw.listStockBatches` | 79 |
| `listStockOrders` | `(opts = {}) => Promise<Array>` | `raw.listStockOrders` | 80 |
| `listStockMovements` | `(opts = {}) => Promise<Array>` | `raw.listStockMovements` | 81 |

### Marketing (OR-merge) — handled inside Layer 1

These three call `_listWithBranchOrMerge` inside `backendClient.js` — Layer 1 emits a 2-query OR-merge that returns docs where `branchId === selected` UNION docs where `allBranches === true`. The Layer 2 wrapper just auto-injects the selected `branchId`.

| Function | Signature | Underlying Layer 1 | Line |
|---|---|---|---|
| `listPromotions` | `(opts = {}) => Promise<Array>` | `raw.listPromotions` (OR-merge inside) | 55 |
| `listCoupons` | `(opts = {}) => Promise<Array>` | `raw.listCoupons` (OR-merge inside) | 56 |
| `listVouchers` | `(opts = {}) => Promise<Array>` | `raw.listVouchers` (OR-merge inside) | 57 |

### Universal (pass-through, no inject) — sanctioned

These collections are NOT branch-scoped by design — staff/doctors/customers/templates/branches/permissions/audiences are universal across the clinic. Customer-attached subcollections (wallets/memberships/treatments/sales/appointments/deposits) follow the customer, which itself is universal.

| Function | Signature | Underlying Layer 1 | Line |
|---|---|---|---|
| `listStaff` / `listDoctors` / `listBranches` / `listPermissionGroups` / `listDocumentTemplates` | `(...args) => Promise<Array>` | `raw.X` | 86-90 |
| `getCustomer` / `getAllCustomers` / `customerExists` / `buildFormFromCustomer` | `(...args) => Promise<...>` | `raw.X` | 93-94, 300-301 |
| `getCustomerWallets` / `getWalletBalance` / `getWalletTransactions` / `ensureCustomerWallet` / `topUpWallet` / `adjustWallet` / `deductWallet` / `refundToWallet` | `(...args) => Promise<...>` | `raw.X` | 95-97, 367-371 |
| `getCustomerMembership` / `getAllMemberships` / `getCustomerMembershipDiscount` / `createMembership` / `cancelMembership` / `renewMembership` / `deleteMembership` | `(...args) => Promise<...>` | `raw.X` | 98-100, 377-379, 292 |
| `getCustomerBahtPerPoint` / `getPointBalance` / `getPointTransactions` / `adjustPoints` / `earnPoints` / `reversePointsEarned` | `(...args) => Promise<...>` | `raw.X` | 101-103, 372-374 |
| `getCustomerTreatments` / `getCustomerSales` / `getCustomerAppointments` / `getCustomerDeposits` / `getActiveDeposits` | `(...args) => Promise<...>` | `raw.X` | 104-108 |
| `listMembershipTypes` / `listWalletTypes` / `listCourseChanges` | `(...args) => Promise<...>` | `raw.X` | 109-111 |
| `listenToCustomer` / `listenToCustomerTreatments` / `listenToCustomerAppointments` / `listenToCustomerSales` / `listenToCustomerFinance` / `listenToCourseChanges` / `listenToAudiences` / `listenToUserPermissions` | `(...args) => Unsubscribe` | `raw.X` (with `__universal__:true` marker via `_makeUniversalListener`) | 133-140 |
| `listAudiences` / `getAudience` / `newAudienceId` | `(...args) => Promise<...>` | `raw.X` | 152-155 |
| `getDocumentTemplate` / `listDocumentDrafts` / `listDocumentPrints` / `getDocumentDraft` / `getNextCertNumber` | `(...args) => Promise<...>` | `raw.X` | 158-162 |
| `seedDocumentTemplatesIfEmpty` / `upgradeSystemDocumentTemplates` / `findResumableDraft` / `recordDocumentPrint` | `(...args) => Promise<...>` | `raw.X` | 165-168 |
| `listVendors` | `(...args) => Promise<Array>` | `raw.listVendors` | 171 |
| `listCentralStockOrders` / `listCentralWarehouses` / `listStockLocations` / `getCentralStockOrder` | `(...args) => Promise<...>` | `raw.X` | 174-177 |
| Single-doc gets (29 total) — `getProduct`, `getCourse`, `getProductGroup`, `getProductUnitGroup`, `getMedicalInstrument`, `getHoliday`, `getDfGroup`, `getDfStaffRates`, `getBankAccount`, `getExpense`, `getOnlineSale`, `getSaleInsuranceClaim`, `getQuotation`, `getStaff`, `getDoctor`, `getBranch`, `getPermissionGroup`, `getStaffSchedule`, `getCoupon`, `getVoucher`, `getPromotion`, `getTreatment`, `getBackendSale`, `getDeposit`, `getSaleByTreatmentId`, `getMasterDataMeta`, `getActiveSchedulesForDate`, `getBeBackedMasterTypes` | `(...args) => Promise<...>` | `raw.X` | 193-222 |
| All writers (saveX/deleteX/updateX/cancelX/createX/transitionX) — Phase BS V2 stamping handled inside Layer 1 via `_resolveBranchIdForWrite` | `(...args) => Promise<...>` | `raw.X` | 226-379 |
| `beCourseToMasterShape` (master shape conversion) | `(...args) => Object` | `raw.beCourseToMasterShape` | 382 |
| `reconcileAllCustomerSummaries` (admin reconciler) | `(...args) => Promise<...>` | `raw.reconcileAllCustomerSummaries` | 395 |

### Stock-tier pass-through (caller passes `locationId` explicitly) — 4 functions

`listStockTransfers` and `listStockWithdrawals` span TWO tiers (central WH ↔ branch); auto-injecting `branchId` would silently filter out central-tier views. Caller chooses which side to query via `locationId`.

| Function | Signature | Underlying Layer 1 | Line |
|---|---|---|---|
| `listStockTransfers` | `(...args) => Promise<Array>` | `raw.listStockTransfers` | 183 |
| `listStockWithdrawals` | `(...args) => Promise<Array>` | `raw.listStockWithdrawals` | 184 |
| `getStockBatch` / `getStockOrder` / `getStockTransfer` / `getStockWithdrawal` / `getStockAdjustment` | `(...args) => Promise<...>` | `raw.X` | 185-189 |

### Branch-scoped listeners (raw — `useBranchAwareListener` injects branchId) — 4 listeners

| Function | Signature | Underlying Layer 1 | Line |
|---|---|---|---|
| `listenToAppointmentsByDate` | `(...args) => Unsubscribe` | `raw.listenToAppointmentsByDate` | 146 |
| `listenToAllSales` | `(...args) => Unsubscribe` | `raw.listenToAllSales` | 147 |
| `listenToHolidays` | `(...args) => Unsubscribe` | `raw.listenToHolidays` | 148 |
| `listenToScheduleByDay` | `(...args) => Unsubscribe` | `raw.listenToScheduleByDay` | 149 |

Layer 3 hook (`useBranchAwareListener`, Task 5) wraps these for branchId injection + re-subscribe on branch change. Re-exported RAW here — listeners need re-subscribe lifecycle that a wrapper-at-call-time can't provide.

### KNOWN GAP — pass-through (no inject) — Phase 17.0 fix target

| Function | Signature | Underlying Layer 1 | Line | Status |
|---|---|---|---|---|
| `listProductGroupsForTreatment` | `(...args) => Promise<Array>` | `raw.listProductGroupsForTreatment` | 392 | **GAP — Phase 17.0 closes this** |

This Layer 2 wrapper at line 392 was added as a pass-through during BSA but does NOT auto-inject the selected `branchId`. Result: TFP's product-group dropdown loaded across all branches regardless of selection. Phase 17.0 promotes it to the `branch-scoped (auto-inject)` category and adds a new audit invariant `BS-9` to prevent the regression class.

## Audit invariants enforced

| ID | Rule |
|---|---|
| BS-1 | UI components in `src/components/**`, `src/pages/**`, `src/hooks/**`, `src/contexts/**` MUST import from `scopedDataLayer.js`, NOT `backendClient.js` directly (annotated whitelist for reports + sanctioned exceptions) |
| BS-7 | Universal collection re-exports must remain `= raw.X` (no `_scoped` wrap) |
| **BS-9 (Phase 17.0)** | **Every Layer 2 wrapper for a branch-scoped Layer 1 lister must auto-inject `branchId: resolveSelectedBranchId()`. Pass-through wrappers for branch-scoped collections are forbidden.** |

See [/audit-branch-scope skill](../sources/bsa-spec.md) for the full BS-1..BS-9 list.

## Phase 17.0 context

Phase 17.0 (2026-05-05) closes two latent BSA gaps that survived the Phase BSA mass migration:

1. **Marketing tabs empty-deps regression** — the 3 marketing tabs (`PromotionsTab.jsx`, `CouponsTab.jsx`, `VouchersTab.jsx`) imported `listPromotions` / `listCoupons` / `listVouchers` from `scopedDataLayer` during Phase BSA Task 6 mass migration. The auto-inject works correctly at call time, BUT each tab kept a `useCallback(reload, [])` with empty dependency arrays. `selectedBranchId` was never in the closure → switching the top-right BranchSelector dropdown did not re-fetch. Tab data stayed pinned to whatever branch was active on first mount.

2. **`listProductGroupsForTreatment` pass-through** — the Layer 2 wrapper at `scopedDataLayer.js:392` was a pass-through that didn't auto-inject. TFP's product-group dropdown loaded across all branches regardless of selection — orthogonal to bug #1 but same root cause class (missed wrap during BSA).

Phase 17.0 closes both:
- 3 marketing tabs gain `selectedBranchId` in their `useCallback` deps (or use `useBranchAwareListener`-style re-subscription).
- `listProductGroupsForTreatment` is rewritten as a branch-scoped auto-inject wrapper.
- New audit invariant **BS-9** enforces: every Layer 2 wrapper for a branch-scoped Layer 1 lister must auto-inject; bare `(...args) => raw.X(...args)` for a branch-scoped collection fails the build.

## Sanctioned exceptions (file-level annotation `// audit-branch-scope: ...`)

- `MasterDataTab.jsx` — Rule H-bis dev-only sync (BS-1 exception)
- `BackendDashboard.jsx` — root composition (BS-1 exception)
- 9 report tabs + `SmartAudienceTab.jsx` — `{allBranches:true}` cross-branch reads
- `clinicReportAggregator.js` / `cloneOrchestrator.js` / `expenseReportAggregator.js` — lib-level cross-branch helpers

## Cross-references

- Concept: [Branch-Scope Architecture](../concepts/branch-scope-architecture.md) — the pattern this file embodies
- Sibling: [`useBranchAwareListener` hook](use-branch-aware-listener.md) — Layer 3 (live listeners)
- Sibling: [`BranchContext + useSelectedBranch`](branch-context.md) — Layer 0 (React state + persistence)
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
- 2026-05-05 — Wiki extended with function reference table + Phase 17.0 context (BS-9 invariant).
