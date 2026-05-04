---
title: Cross-branch master-data import (Phase 17.1 anticipation)
type: concept
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [phase-17-1, multi-branch, master-data, admin-only, planned]
source-count: 0
---

# Cross-branch master-data import

> Admin-only "ดึง / Copy ข้อมูลจากสาขาอื่น" feature planned for Phase 17.1. Selectively imports master-data entries from a source branch into the currently-selected target branch. Targets 7 master-data tabs. Designed to ease setting up new branches without re-typing the same product/course/holiday/DF data.

## Status

**Planned.** Phase 17.1 brainstorm + spec not yet complete (queued after Phase 17.0 ships). This page captures the user directive + initial scoping + open design questions so the brainstorm session can start from a wiki-grounded base.

## User directive (verbatim, 2026-05-05)

> "tab ต่อไปนี้ product-groups, product-units, medical-instruments, holidays, products, courses, df-groups ให้ทำการเพิ่มปุ่มที่เห็นเฉพาะ Admin เท่านั้นในทุก Tab สำหรับการ import ดึง Data (หรือจะใช้คำว่า Copy ก็ได้) ของ Tab นั้นๆมาจากสาขาอื่น โดยไม่ใช่กดแล้ว import ทั้งหมด แต่ต้องเลือกได้ว่าจะ import อะไรเข้ามาบ้าง ตามแต่ละข้อมูลของหน้านั้นๆ เพื่อความสะดวกเวลาจะขยายสาขา จะได้ Setting ข้อมูลพื้นฐานเหล่านี้ได้ง่ายขึ้น"

Translation: admin-only button on each of the 7 master-data tabs to import (copy) data of THAT tab from another branch. Selective (not bulk). Convenience for branch expansion.

## Target tabs (7)

| Tab | Collection | Entity page |
|---|---|---|
| ProductGroupsTab | `be_product_groups` | [product-groups-tab.md](../entities/product-groups-tab.md) |
| ProductUnitsTab | `be_product_unit_groups` | [product-units-tab.md](../entities/product-units-tab.md) |
| MedicalInstrumentsTab | `be_medical_instruments` | [medical-instruments-tab.md](../entities/medical-instruments-tab.md) |
| HolidaysTab | `be_holidays` | [holidays-tab.md](../entities/holidays-tab.md) |
| ProductsTab | `be_products` | [products-tab.md](../entities/products-tab.md) |
| CoursesTab | `be_courses` | [courses-tab.md](../entities/courses-tab.md) |
| DfGroupsTab | `be_df_groups` | [df-groups-tab.md](../entities/df-groups-tab.md) |

All 7 are branch-scoped per [Branch-Scope Architecture](branch-scope-architecture.md) — each doc has a `branchId` field, branch-scoped reads filter by it.

## Architecture (anticipated)

Per [Rule of 3](iron-clad-rules.md) (Rule C1), 7 tabs sharing the same import UX MUST extract a shared component. Anticipated structure:

- `src/components/backend/CrossBranchImportButton.jsx` — small admin-only icon button visible at the tab header. Disabled when only one branch exists.
- `src/components/backend/CrossBranchImportModal.jsx` — modal with: source-branch dropdown, search/filter, checkbox list of source-branch items (with target-collision indicators), confirm button. Per-tab adapter passed via props for: source data fetcher (e.g. `listProducts({branchId: sourceBranchId})`), item display row, target writer.
- Per-tab wire — each of the 7 tabs imports `<CrossBranchImportButton tab="products" sourceLister={listProducts} ... />` near the existing "Create" button.

## Design questions to resolve in Phase 17.1 brainstorm

- **Q1 — Copy semantics**: copy with new ID + stamp target `branchId`? Or share doc by appending target `branchIds[]`? Or reuse same ID? Default candidate: copy with new ID, stamp `branchId=target`, preserve `createdAt+createdBy` from source, `updatedAt=now`, `updatedBy=current admin`.
- **Q2 — Foreign-key handling**: when copying a `be_product_group` whose `products[].productId` references products NOT in the target branch — block? Auto-cascade-import dependencies? Allow with orphan warning?
- **Q3 — Dedup behavior**: if target branch already has a doc with the same name/code, skip? Overwrite? Force user choice per row?
- **Q4 — Source-branch picker**: dropdown of all `be_branches` (excluding current target). What about disabled / suspended branches?
- **Q5 — Audit trail**: write a `be_admin_audit/cross-branch-import-{ts}` doc with source branch, target branch, item IDs, admin uid? (Likely yes — mirrors existing admin endpoints like `/api/admin/cleanup-orphan-stock`.)
- **Q6 — Permission gate**: hardcode admin-only? Or a new permission key like `cross_branch_import`?

## Why this is a separate phase (not bundled with 17.0)

Phase 17.0 is bug-fix scope (~12 files, 30-50 tests, no new feature surface). Phase 17.1 is feature scope (~10 new files including shared modal + 7 tab wires + audit endpoint + ~150-200 tests). Bundling would dilute commit clarity and slow review.

The dependency direction also flows correctly: Phase 17.0 closes branch-leak gaps so when Phase 17.1's import modal reads `listProducts({branchId: sourceBranchId})`, it gets exactly the source branch's data (not phantom cross-branch leftovers).

## Cross-references

- Concept: [Branch-Scope Architecture](branch-scope-architecture.md) (the foundation 17.1 builds on)
- Concept: [Branch-switch refresh discipline](branch-switch-refresh-discipline.md) (BS-9 — Phase 17.0 invariant)
- Concept: [Iron-clad rules A-L](iron-clad-rules.md) (Rule C1, Rule H, Rule of 3)
- Entities: 7 target tabs (see table above)

## History

- 2026-05-05 — Created during wiki backfill cycle to capture user directive + initial scoping. Phase 17.1 brainstorm queued after Phase 17.0 ships.
