---
title: ProductUnitsTab
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [master-data, backend-tab, branch-scoped, phase-11, phase-17-1-target]
source-count: 0
---

# ProductUnitsTab

> The Phase 11.3 master-data tab that manages **product unit-groups** — sets of related units with conversion factors back to a single base unit (e.g. "1 box = 10 strips", "1 strip = 10 tablets"). Stored in the branch-scoped `be_product_unit_groups` collection. One of seven master-data tabs slated as targets for the Phase 17.1 cross-branch import feature.

## Overview

A **unit group** is a tree of unit-of-measure conversions anchored on a single base unit. The first entry in the `units[]` array is the base; subsequent entries declare an `amount` representing how many base units they contain. The card preview shows up to three non-base units in the conversion chain (each as `1 <unitName> → <amount> <baseName>`) with a "+ N more" indicator if the group has more than four entries ([`ProductUnitsTab.jsx:131-153`](../../src/components/backend/ProductUnitsTab.jsx)).

Unit-groups are referenced by `be_products` (each product has a `unitGroupId` plus selected `mainUnitName`) and used at point-of-sale to convert quantity inputs across units. Unlike product groups, this entity has no member-product preview — it stands alone as a conversion library.

The tab is a near-mirror of [ProductGroupsTab](product-groups-tab.md) in shell + CRUD flow: `MarketingTabShell` chrome, status-only filter dropdown, search across `groupName` + `note` + nested unit `name`s, `ProductUnitFormModal` for create/edit, Firestore-only delete via `deleteProductUnitGroup` ([`ProductUnitsTab.jsx:70`](../../src/components/backend/ProductUnitsTab.jsx)). The file header explicitly documents itself as the **5th reuse** of `MarketingTabShell` per Rule C1 ([`ProductUnitsTab.jsx:6-7`](../../src/components/backend/ProductUnitsTab.jsx)).

The tab follows **Phase BS V2 branch-scoped reads**: `useSelectedBranch()` provides `branchId` for `listProductUnitGroups({branchId})` ([`ProductUnitsTab.jsx:37`](../../src/components/backend/ProductUnitsTab.jsx)). One-shot read; no `useBranchAwareListener`, no listener.

## API surface / Key state

- **Imports**: `listProductUnitGroups`, `deleteProductUnitGroup` from [`scopedDataLayer.js`](scoped-data-layer.md) ([`ProductUnitsTab.jsx:10`](../../src/components/backend/ProductUnitsTab.jsx))
- **Branch hook**: `useSelectedBranch()` ([`ProductUnitsTab.jsx:23`](../../src/components/backend/ProductUnitsTab.jsx))
- **State**: `items`, `query`, `filterStatus`, `formOpen`, `editing`, `deleting`, `error` ([`ProductUnitsTab.jsx:24-31`](../../src/components/backend/ProductUnitsTab.jsx))
- **Reload**: `reload` callback memoized on `selectedBranchId` ([`ProductUnitsTab.jsx:33-44`](../../src/components/backend/ProductUnitsTab.jsx))
- **Filter**: search hay derived from `groupName + note + units[].name` joined ([`ProductUnitsTab.jsx:48-58`](../../src/components/backend/ProductUnitsTab.jsx))
- **Card derives**: `units = Array.isArray(g.units) ? g.units : []`; `base = units[0]` ([`ProductUnitsTab.jsx:113-114`](../../src/components/backend/ProductUnitsTab.jsx))

## Data flow

1. Mount → `useSelectedBranch()` reads context.
2. `useEffect(() => { reload(); }, [reload])`; `reload` is rebuilt whenever `selectedBranchId` flips, triggering re-fetch on top-right branch switch.
3. `setItems(await listProductUnitGroups({branchId: selectedBranchId}))` — single fetch, no parallel auxiliary calls (no preview lookup map needed).
4. Card render iterates `g.units` to draw the conversion chain.
5. Mutations call `ProductUnitFormModal`; `handleSaved` and `handleDelete` both call `reload()` to pick up changes.

## Cross-references

- Concept: [Branch-Scope Architecture (BSA)](../concepts/branch-scope-architecture.md) — explains the `useSelectedBranch` + branch-scoped reads pattern
- Entity: [scopedDataLayer](scoped-data-layer.md) — Layer 2 wrapper module
- Sibling tabs:
  - [ProductsTab](products-tab.md) — products reference unit-groups by `unitGroupId`; this tab feeds that picker
  - [ProductGroupsTab](product-groups-tab.md), [MedicalInstrumentsTab](medical-instruments-tab.md), [HolidaysTab](holidays-tab.md), [CoursesTab](courses-tab.md), [DfGroupsTab](df-groups-tab.md) — co-resident master-data tabs
- Validation module: `src/lib/productUnitValidation.js` — exposes `STATUS_OPTIONS` consumed by the filter dropdown ([`ProductUnitsTab.jsx:14`](../../src/components/backend/ProductUnitsTab.jsx))
- Form modal: `src/components/backend/ProductUnitFormModal.jsx`
- Shared chrome: `MarketingTabShell` — explicitly documented as the **5th reuse** in this file's header

## Phase 17.1 anticipation

This tab is one of the **seven master-data targets** for Phase 17.1 admin-only "import from another branch". For unit-groups specifically, the import is structurally simple — each group is self-contained (no foreign-key references out to other entities at the unit-group level), so cross-branch copy is mostly a `branchId` rewrite + de-duplicate by `groupName`. The real complexity lives downstream in [ProductsTab](products-tab.md), where each product references a `unitGroupId` that must resolve in the target branch first. Phase 17.1 will likely sequence `ProductUnitsTab → ProductsTab → ProductGroupsTab` in dependency order.

## History

- 2026-05-05 — Created during the wiki backfill batch for the seven Phase 11 master-data tabs flagged for Phase 17.1.
