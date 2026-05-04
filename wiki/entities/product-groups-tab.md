---
title: ProductGroupsTab
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [master-data, backend-tab, branch-scoped, phase-11, phase-17-1-target]
source-count: 0
---

# ProductGroupsTab

> The Phase 11.2 master-data tab that manages **product groups** — bundles of products with per-product quantities. Stored in the branch-scoped `be_product_groups` collection. One of seven master-data tabs slated as targets for the Phase 17.1 cross-branch import feature.

## Overview

Product groups are a master-data primitive used by sales / treatment forms to ship multiple products together as a named bundle (e.g. "Skin Drip Kit" = Vit C 1 ampoule + saline 1 bag). Each group has a `productType` discriminator (modern: `ยากลับบ้าน` / `สินค้าสิ้นเปลือง`; legacy 4-option types preserved for display compatibility per [`ProductGroupsTab.jsx:22-29`](../../src/components/backend/ProductGroupsTab.jsx)).

The tab follows the standard master-data shell pattern: top filter bar (search + product-type + status) + responsive grid of cards. Cards preview group name, type/status badges, member-product count, and the first 4 product names with their quantities (with "+ N more" overflow indicator).

CRUD wiring uses the `ProductGroupFormModal` for create/edit and a Firestore-only delete via `deleteProductGroup` ([`ProductGroupsTab.jsx:95`](../../src/components/backend/ProductGroupsTab.jsx)). Permission is implicit through the master-data tab section — no explicit `useHasPermission` gate (contrast with [HolidaysTab](holidays-tab.md), which gates delete on `holiday_setting`).

The tab follows **Phase BS V2 branch-scoped reads**: `useSelectedBranch()` provides the current `branchId`, which is passed to both `listProductGroups` and `listProducts` (the latter feeds the in-card product preview lookup map, [`ProductGroupsTab.jsx:50-52`](../../src/components/backend/ProductGroupsTab.jsx)). Both reads use one-shot `list*` (not `listenTo*`), so a manual `reload()` is invoked after every mutation.

## API surface / Key state

- **Imports**: `listProductGroups`, `deleteProductGroup`, `listProducts` from [`scopedDataLayer.js`](scoped-data-layer.md) ([`ProductGroupsTab.jsx:11`](../../src/components/backend/ProductGroupsTab.jsx))
- **Branch hook**: `useSelectedBranch()` ([`ProductGroupsTab.jsx:33`](../../src/components/backend/ProductGroupsTab.jsx))
- **State**: `items`, `productLookup` (Map keyed by `productId` for in-card preview), `query`, `filterType`, `filterStatus`, `formOpen`, `editing`, `deleting`, `error` ([`ProductGroupsTab.jsx:34-43`](../../src/components/backend/ProductGroupsTab.jsx))
- **Reload**: `reload` callback memoized on `selectedBranchId` ([`ProductGroupsTab.jsx:45-67`](../../src/components/backend/ProductGroupsTab.jsx))
- **Filter**: client-side `filtered` memo over name / note / productType search and type / status drop-downs ([`ProductGroupsTab.jsx:71-83`](../../src/components/backend/ProductGroupsTab.jsx))
- **Card preview**: `groupProducts` derives from canonical `g.products[{productId,qty}]` (Phase 11.9 shape) with `g.productIds[]` legacy fallback ([`ProductGroupsTab.jsx:147-149`](../../src/components/backend/ProductGroupsTab.jsx))

## Data flow

1. Mount → `useSelectedBranch()` reads `selectedBranchId` from context.
2. `useEffect(() => { reload(); }, [reload])` fires; `reload` re-creates whenever `selectedBranchId` changes (so top-right branch switch triggers re-fetch automatically).
3. `Promise.all([listProductGroups({branchId}), listProducts({branchId}).catch(()=>[])])` — products are fetched in parallel only to build the in-card preview lookup; failure to load products does NOT block the groups list.
4. `setItems(groups)` + `setProductLookup(...)`; render proceeds.
5. CRUD mutations call the modal; on save, `handleSaved` calls `reload()` again. Since the tab uses one-shot reads, no `useBranchAwareListener` is needed.

## Cross-references

- Concept: [Branch-Scope Architecture (BSA)](../concepts/branch-scope-architecture.md) — explains the `useSelectedBranch` + `scopedDataLayer` pattern this tab uses
- Entity: [scopedDataLayer](scoped-data-layer.md) — the Layer 2 wrapper module the tab imports from
- Sibling tabs:
  - [ProductsTab](products-tab.md) — group members reference `be_products` rows; the in-card preview is fed from `listProducts`
  - [MedicalInstrumentsTab](medical-instruments-tab.md), [ProductUnitsTab](product-units-tab.md), [HolidaysTab](holidays-tab.md), [CoursesTab](courses-tab.md), [DfGroupsTab](df-groups-tab.md) — co-resident master-data tabs
- Validation module: `src/lib/productGroupValidation.js` — exposes `PRODUCT_TYPES` and `STATUS_OPTIONS` consumed by filter dropdowns ([`ProductGroupsTab.jsx:15`](../../src/components/backend/ProductGroupsTab.jsx))
- Form modal: `src/components/backend/ProductGroupFormModal.jsx`
- Shared chrome: `MarketingTabShell` — Rule C1 reuse (4th use of the shell as of Phase 11.2 per file header note)

## Phase 17.1 anticipation

This tab is one of the **seven master-data targets** for the upcoming Phase 17.1 admin-only "import from another branch" feature. The migration story will be: admin selects a source branch + target branch, picks specific groups to copy (or "copy all"), and the importer rewrites the `branchId` field on each cloned doc while preserving structural references (member `productId`s remain stable across branches because product migration runs first). Member-product references must be reconciled at import time — a group whose `productId` doesn't exist in the target branch should fail loud per Rule H-quater (no silent fallback to `master_data`).

## History

- 2026-05-05 — Created during the wiki backfill batch for the seven Phase 11 master-data tabs flagged for Phase 17.1.
