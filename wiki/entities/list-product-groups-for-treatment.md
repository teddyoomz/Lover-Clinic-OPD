---
title: listProductGroupsForTreatment
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [function, branch-scoped, treatment, phase-17-0]
source-count: 0
---

# listProductGroupsForTreatment

> Async helper used by TFP medication-group + consumable-group modals. Reads `be_product_groups` + `be_products`, joins them, returns the grouped shape the modal renders. Currently branch-blind — Phase 17.0 will fix.

## TL;DR

Two callsites only — both inside [TreatmentFormPage](treatment-form-page.md). When the admin clicks "เพิ่มกลุ่มยา" or "เพิ่มกลุ่มสินค้า" on a treatment form, this function fetches every active product group of the requested type, enriches each group's `products[]` with name/unit/price/label fields from `be_products`, and returns the grouped shape ready for the modal table.

## Signature

At time of writing (pre-Phase 17.0):

```js
listProductGroupsForTreatment(productType: 'ยากลับบ้าน' | 'สินค้าสิ้นเปลือง'): Promise<Array<{
  id: string,
  name: string,
  productType: string,
  products: Array<{
    id: string,
    name: string,
    unit: string,
    price: number,
    qty: number,
    isVatIncluded: 0 | 1,
    category: string,
    label: { genericName, indications, dosageAmount, ... } | null
  }>
}>>
```

Defined at [`backendClient.js:8429`](../../src/lib/backendClient.js).

Post-Phase 17.0 (planned), the function will accept a second arg `{ branchId, allBranches }` matching the Layer 1 lister convention from Phase BSA Tasks 1-2:

```js
listProductGroupsForTreatment(productType, opts?: { branchId?: string, allBranches?: boolean })
```

## Implementation

The function reads two collections in parallel and joins them client-side ([`backendClient.js:8432-8435`](../../src/lib/backendClient.js)):

```js
const [groupsSnap, productsSnap] = await Promise.all([
  getDocs(productGroupsCol()),  // be_product_groups
  getDocs(productsCol()),        // be_products
]);
```

`productGroupsCol()` resolves to `collection(db, ...basePath(), 'be_product_groups')` ([`backendClient.js:8347`](../../src/lib/backendClient.js)) and `productsCol()` resolves to `collection(db, ...basePath(), 'be_products')` ([`backendClient.js:9722`](../../src/lib/backendClient.js)). Both are `be_*` collections — Rule H-quater compliant on the source side.

It then builds a `productLookup` Map keyed by productId ([`backendClient.js:8436-8470`](../../src/lib/backendClient.js)). Phase 11.9 stored label fields flat (`genericName`, `dosageAmount`, etc.) — this lookup reconstructs the nested `label` object the TFP medication modal expects.

Group filtering happens at [`backendClient.js:8472-8482`](../../src/lib/backendClient.js): only groups with `status === 'ใช้งาน'` pass, and `productType` is matched directly OR via the legacy 4-option normalization (`'ยากลับบ้าน'` matches legacy `'ยา'`; `'สินค้าสิ้นเปลือง'` matches legacy `'สินค้าหน้าร้าน'` or `'บริการ'`).

For each surviving group, the function walks `g.products[]` (or falls back to the legacy `g.productIds[]` at [`backendClient.js:8487-8488`](../../src/lib/backendClient.js)), enriches each entry from the lookup map, and synthesizes a placeholder `(สินค้า ${pid})` entry if the lookup misses ([`backendClient.js:8496-8505`](../../src/lib/backendClient.js)). Final shape returned at [`backendClient.js:8507-8513`](../../src/lib/backendClient.js).

## Layer 2 wrapper

[scopedDataLayer.js:392](../../src/lib/scopedDataLayer.js):

```js
export const listProductGroupsForTreatment = (...args) => raw.listProductGroupsForTreatment(...args);
```

Pure pass-through. Does NOT auto-inject `branchId`. This is the Phase 17.0 gap — every other branch-scoped lister in scopedDataLayer.js has an auto-inject wrapper, but this one was added pre-BSA and never got the upgrade.

## Bug pattern (Phase 17.0 root cause)

Two layers cooperate to leak cross-branch data:

1. **Layer 1** (`backendClient.js:8429`) reads ALL product groups + ALL products without `where('branchId', '==', X)` clauses. The Promise.all at the top of the function pulls every doc in both collections. Returned data therefore reflects whichever branch's data happens to be in the index — typically nothing per-branch since both collections ARE branch-scoped per the BSA matrix in `branch-collection-coverage.test.js` (be_products + be_product_groups are both classified `branch-scoped`).
2. **Layer 2** (`scopedDataLayer.js:392`) doesn't inject branchId either, so it cannot rescue a branch-blind Layer 1 call.

Phase 17.0 fix: Layer 1 accepts `{ branchId, allBranches }` opts and applies the BSA `_listWithBranch` helper pattern (single query with `where('branchId')`), Layer 2 wrapper auto-injects `resolveSelectedBranchId()` like every other branch-scoped lister.

## Callers

Two only — both in TreatmentFormPage:

- [`TreatmentFormPage.jsx:1254`](../../src/components/TreatmentFormPage.jsx) — `openMedGroupModal` opener for the medication-group modal (`'ยากลับบ้าน'`)
- [`TreatmentFormPage.jsx:1380`](../../src/components/TreatmentFormPage.jsx) — `openConsGroupModal` opener for the consumable-group modal (`'สินค้าสิ้นเปลือง'`)

Both call sites cache the result on a `length > 0` early-return guard, which is the second half of the Phase 17.0 fix (cache-reset on branch switch — see [TreatmentFormPage entity page](treatment-form-page.md#the-4-phantom-data-modals-phase-17-0-context)).

## Cross-references

- Entity: [TreatmentFormPage](treatment-form-page.md)
- Entity: [scopedDataLayer.js](scoped-data-layer.md)
- Concept: [Branch-Scope Architecture](../concepts/branch-scope-architecture.md)
- Concept: [Rule H-quater](../concepts/rule-h-quater.md)

## History

- ~2026-04-20 (Phase 11.9) — created when migrating from `master_data/medication_groups` + `master_data/consumable_groups` (separate per-type sync caches) to a single canonical `be_product_groups` collection. Comment at [`backendClient.js:8425`](../../src/lib/backendClient.js) reads "Single collection (be_product_groups) is canonical."
- 2026-05-04 — Phase BSA Task 7 pointed TFP callsites through `scopedDataLayer.js` instead of importing from `backendClient.js` directly. The Layer 2 wrapper was added as a pass-through; auto-inject upgrade was deferred.
- 2026-05-05 — Wiki backfill page created. Phase 17.0 will rewrite both layers: Layer 1 to accept `{ branchId, allBranches }` opts and filter via `where('branchId')`, Layer 2 wrapper to auto-inject `resolveSelectedBranchId()`.
