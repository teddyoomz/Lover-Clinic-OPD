---
title: CoursesTab
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [master-data, backend-tab, branch-scoped, phase-11, phase-17-1-target]
source-count: 0
---

# CoursesTab

> The Phase 12.2 master-data tab that manages **course catalogue** — bookable treatment packages with sale price, time-allotment, and member-product manifest. Stored in the branch-scoped `be_courses` collection. Seed migration is one-way from `master_data/courses` via [MasterDataTab](../../src/components/backend/MasterDataTab.jsx)'s sanctioned dev-only sync (Rule H-bis). One of seven master-data tabs slated as targets for the Phase 17.1 cross-branch import feature.

## Overview

`be_courses` rows are the catalogue entries the user picks from at sale + treatment time. Fields surfaced in the card preview ([`CoursesTab.jsx:107-113`](../../src/components/backend/CoursesTab.jsx)):

- **Identity**: `courseName`, optional `courseCode` (mono-formatted under the heading), optional `receiptCourseName` (printed on receipts when distinct from internal name)
- **Classification**: `courseCategory` (free-form string), `status` (`ใช้งาน` / `พักใช้งาน`)
- **Pricing**: `salePrice` formatted as Thai-locale Baht (em-dash placeholder when null)
- **Time**: `time` in minutes — used by appointment booking to size calendar slots
- **Composition**: `courseProducts[]` — the manifest of products consumed when the course is performed; the count is surfaced as "สินค้า N รายการ" with a `Package` icon

The tab uses the standard `MarketingTabShell` chrome with a single status filter dropdown. Search hay = `courseName + courseCode + receiptCourseName + courseCategory` ([`CoursesTab.jsx:41`](../../src/components/backend/CoursesTab.jsx)). CRUD via `CourseFormModal` and Firestore-only delete via `deleteCourse` ([`CoursesTab.jsx:54`](../../src/components/backend/CoursesTab.jsx)).

The tab follows **Phase BS V2 branch-scoped reads**: `useSelectedBranch()` provides `branchId` to `listCourses({branchId})` ([`CoursesTab.jsx:31`](../../src/components/backend/CoursesTab.jsx)). One-shot read; no listener. Manual `reload()` after every mutation. Like [ProductsTab](products-tab.md), this tab has not been migrated to `useBranchAwareListener` + `listenToCourses` — it could be if cross-window sync becomes important.

The header comment at [`CoursesTab.jsx:1-2`](../../src/components/backend/CoursesTab.jsx) documents the Firestore-only contract and the `master_data/courses → be_courses` migration path through MasterDataTab — a Rule H-bis sanctioned dev-only sync that ships with the dev build only.

## API surface / Key state

- **Imports**: `listCourses`, `deleteCourse` from [`scopedDataLayer.js`](scoped-data-layer.md) ([`CoursesTab.jsx:6`](../../src/components/backend/CoursesTab.jsx))
- **Validation helpers**: `STATUS_OPTIONS` from `src/lib/courseValidation.js` ([`CoursesTab.jsx:10`](../../src/components/backend/CoursesTab.jsx))
- **Branch hook**: `useSelectedBranch()` ([`CoursesTab.jsx:19`](../../src/components/backend/CoursesTab.jsx))
- **State**: `items`, `query`, `filterStatus`, `formOpen`, `editing`, `deleting`, `error` ([`CoursesTab.jsx:20-27`](../../src/components/backend/CoursesTab.jsx))
- **Reload**: `reload` callback memoized on `selectedBranchId` ([`CoursesTab.jsx:29-34`](../../src/components/backend/CoursesTab.jsx))
- **Filter**: client-side `filtered` memo with multi-field search + status ([`CoursesTab.jsx:37-47`](../../src/components/backend/CoursesTab.jsx))
- **Card derives**: `price = c.salePrice != null ? toLocaleString('th-TH') : '—'` ([`CoursesTab.jsx:90`](../../src/components/backend/CoursesTab.jsx))

## Data flow

1. Mount → `useSelectedBranch()` reads context.
2. `useEffect(() => { reload(); }, [reload])`; `reload` rebuilds on `selectedBranchId` change so top-right branch switch re-fetches automatically.
3. `setItems(await listCourses({branchId: selectedBranchId}))`.
4. Card render iterates `filtered` with status + category badges, price/time/product-count rows ([`CoursesTab.jsx:87-126`](../../src/components/backend/CoursesTab.jsx)).
5. Mutations call `CourseFormModal`; on save, the inline `onSaved` handler ([`CoursesTab.jsx:135`](../../src/components/backend/CoursesTab.jsx)) and `handleDelete` both `reload()`.

## Cross-references

- Concept: [Branch-Scope Architecture (BSA)](../concepts/branch-scope-architecture.md) — explains the branch-scoped reads pattern
- Entity: [scopedDataLayer](scoped-data-layer.md) — Layer 2 wrapper module
- Upstream master-data dependencies (Phase 17.1 import-order implications):
  - [ProductsTab](products-tab.md) — `courseProducts[]` references products by `productId`; products must exist in the target branch before courses can be imported
  - [ProductUnitsTab](product-units-tab.md) — indirectly via products
- Sibling tabs:
  - [ProductGroupsTab](product-groups-tab.md), [MedicalInstrumentsTab](medical-instruments-tab.md), [HolidaysTab](holidays-tab.md), [DfGroupsTab](df-groups-tab.md) — co-resident master-data tabs
- Downstream consumers: TreatmentFormPage (course picker, course-deduct logic), SaleTab (course buy modal), CustomerDetailView (purchased courses list), V13/V14 buffet+expiry+shadow-course logic
- Validation module: `src/lib/courseValidation.js`
- Form modal: `src/components/backend/CourseFormModal.jsx`
- Course-utility helpers: `src/lib/courseUtils.js` — `parseQty`, deduct logic, buffet/expiry semantics

## Phase 17.1 anticipation

This tab is one of the **seven master-data targets** for Phase 17.1 admin-only "import from another branch". Courses sit alongside products in the dependency tree — both must be imported AFTER unit-groups but BEFORE customer-attached state (purchased courses, treatments). Specific Phase 17.1 considerations for this tab:

1. **Member-product references**: every entry in `courseProducts[]` must resolve in the target branch's [ProductsTab](products-tab.md). Run product import first; surface unresolvable references as a hard error per Rule H-quater
2. **Buffet / expiry shape**: courses with `courseType === 'buffet'` + `daysBeforeExpire` carry semantics that affect the patient-facing "คอร์สของฉัน" page. Make sure these fields are preserved across import (V13 lesson — fields silently stripped by import whitelists are V21-class regression bait)
3. **Receipt name**: `receiptCourseName` is a per-branch concept (different ProClinic tax IDs may need different receipt copy) — admin should be able to override during import

## History

- 2026-05-05 — Created during the wiki backfill batch for the seven Phase 11 master-data tabs flagged for Phase 17.1.
