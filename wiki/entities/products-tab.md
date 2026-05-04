---
title: ProductsTab
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [master-data, backend-tab, branch-scoped, phase-11, phase-17-1-target]
source-count: 0
---

# ProductsTab

> The Phase 12.2 master-data tab that manages the **product catalogue** — the core SKU table for inventory, point-of-sale, and treatment forms. Stored in the branch-scoped `be_products` collection. The seed migration is one-way from `master_data/products` via [MasterDataTab](../../src/components/backend/MasterDataTab.jsx)'s sanctioned dev-only sync (Rule H-bis). One of seven master-data tabs slated as targets for the Phase 17.1 cross-branch import feature.

## Overview

`be_products` rows hold the canonical SKU record: identity (`productName`, `productCode`, `genericName`), classification (`categoryName`, `productType` — one of `ยา / สินค้าหน้าร้าน / สินค้าสิ้นเปลือง / บริการ` per the `TYPE_BADGE` map at [`ProductsTab.jsx:16-21`](../../src/components/backend/ProductsTab.jsx)), unit reference (`mainUnitName` — denormalised from the unit-group selected at edit time), pricing (`price`), and `status`.

`productType` here uses the legacy 4-option set, distinct from the modern 2-option set on [ProductGroupsTab](product-groups-tab.md). The two stayed disjoint because product groups were re-typed in Phase 11.9 while individual products kept the older 4-option semantics — both are valid in different contexts (group classification vs SKU classification).

The tab uses the standard `MarketingTabShell` chrome with two filter dropdowns (status + product-type). Search hay = `productName + productCode + genericName + categoryName + mainUnitName` ([`ProductsTab.jsx:48`](../../src/components/backend/ProductsTab.jsx)). CRUD via `ProductFormModal` and Firestore-only delete via `deleteProduct` ([`ProductsTab.jsx:62`](../../src/components/backend/ProductsTab.jsx)).

The tab follows **Phase BS V2 branch-scoped reads**: `useSelectedBranch()` provides `branchId` to `listProducts({branchId})` ([`ProductsTab.jsx:38`](../../src/components/backend/ProductsTab.jsx)). One-shot read — no listener subscription — so manual `reload()` after every mutation. ProductsTab is NOT one of the listener-migrated tabs; if cross-window sync becomes important, follow the [HolidaysTab](holidays-tab.md) precedent and migrate to `useBranchAwareListener` + `listenToProducts`.

The header comment at [`ProductsTab.jsx:1-3`](../../src/components/backend/ProductsTab.jsx) explicitly documents the Firestore-only contract and the `master_data/products → be_products` migration path through MasterDataTab — a Rule H-bis sanctioned dev-only sync.

## API surface / Key state

- **Imports**: `listProducts`, `deleteProduct` from [`scopedDataLayer.js`](scoped-data-layer.md) ([`ProductsTab.jsx:6`](../../src/components/backend/ProductsTab.jsx))
- **Validation helpers**: `STATUS_OPTIONS`, `PRODUCT_TYPE_OPTIONS` from `src/lib/productValidation.js` ([`ProductsTab.jsx:10`](../../src/components/backend/ProductsTab.jsx))
- **Branch hook**: `useSelectedBranch()` ([`ProductsTab.jsx:25`](../../src/components/backend/ProductsTab.jsx))
- **State**: `items`, `query`, `filterStatus`, `filterType`, `formOpen`, `editing`, `deleting`, `error` ([`ProductsTab.jsx:26-34`](../../src/components/backend/ProductsTab.jsx))
- **Reload**: `reload` callback memoized on `selectedBranchId` ([`ProductsTab.jsx:36-41`](../../src/components/backend/ProductsTab.jsx))
- **Filter**: client-side `filtered` memo over multi-field search + status + type ([`ProductsTab.jsx:44-55`](../../src/components/backend/ProductsTab.jsx))

## Data flow

1. Mount → `useSelectedBranch()` reads context.
2. `useEffect(() => { reload(); }, [reload])`; the `reload` callback is rebuilt on `selectedBranchId` change so the top-right branch switch triggers a re-fetch automatically.
3. `setItems(await listProducts({branchId: selectedBranchId}))`.
4. Card render iterates `filtered` with type + status badge styling driven by `TYPE_BADGE` and `STATUS_BADGE` maps ([`ProductsTab.jsx:12-21`](../../src/components/backend/ProductsTab.jsx)).
5. Mutations call `ProductFormModal`; `handleSaved` (inline at [`ProductsTab.jsx:147`](../../src/components/backend/ProductsTab.jsx)) and `handleDelete` both `reload()`.

## Cross-references

- Concept: [Branch-Scope Architecture (BSA)](../concepts/branch-scope-architecture.md) — explains the branch-scoped reads pattern and Rule H-bis sanctioned sync
- Entity: [scopedDataLayer](scoped-data-layer.md) — Layer 2 wrapper module
- Upstream master-data dependencies (Phase 17.1 import-order implications):
  - [ProductUnitsTab](product-units-tab.md) — products reference unit-groups by `unitGroupId`; unit-groups must exist in target branch before products can be imported
  - [ProductGroupsTab](product-groups-tab.md) — groups reference products by `productId`; products must exist in target branch before groups can be imported
- Sibling tabs:
  - [MedicalInstrumentsTab](medical-instruments-tab.md), [HolidaysTab](holidays-tab.md), [CoursesTab](courses-tab.md), [DfGroupsTab](df-groups-tab.md) — co-resident master-data tabs
- Downstream consumers: every sale form, treatment form, stock module, and product-picker reads from this collection via `scopedDataLayer.listProducts` (Rule H-quater forbids `master_data/*` reads in feature code)
- Validation module: `src/lib/productValidation.js`
- Form modal: `src/components/backend/ProductFormModal.jsx`
- Shared chrome: `MarketingTabShell`

## Phase 17.1 anticipation

This tab is one of the **seven master-data targets** for Phase 17.1 admin-only "import from another branch", and likely the highest-stakes entry in the batch because **`be_products` is the most cross-referenced master-data collection** in the system. A cross-branch import must:

1. Resolve `unitGroupId` references in the target branch first (so [ProductUnitsTab](product-units-tab.md) imports come first in the dependency order)
2. Decide whether `productCode` should be unique-per-branch or globally unique — currently the field is per-branch by virtue of branch-scoped reads, but Phase 17.1 should clarify whether codes can collide across branches
3. Skip orphan-creation: if a referenced product is missing in the target branch, fail loud per Rule H-quater rather than silently fall back to `master_data` reads

## History

- 2026-05-05 — Created during the wiki backfill batch for the seven Phase 11 master-data tabs flagged for Phase 17.1.
