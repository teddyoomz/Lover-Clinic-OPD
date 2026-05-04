---
title: MedicalInstrumentsTab
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [master-data, backend-tab, branch-scoped, phase-11, phase-17-1-target]
source-count: 0
---

# MedicalInstrumentsTab

> The Phase 11.4 master-data tab that manages **medical instruments** (clinic-owned hardware: laser machines, RF probes, autoclaves, etc.) along with their cost basis, purchase date, and recurring maintenance schedule. Stored in the branch-scoped `be_medical_instruments` collection. One of seven master-data tabs slated as targets for the Phase 17.1 cross-branch import feature.

## Overview

This tab is the closest the master-data suite gets to an asset-tracking module. Each instrument card surfaces:

- **Identity**: name, optional code (rendered as a `#code` mono badge), status (`ใช้งาน` / `พักใช้งาน` / `ซ่อมบำรุง` — three values, one more than the other master-data tabs because instruments can be temporarily out for repair)
- **Financials**: `costPrice` formatted as Thai-locale Baht via the local `formatBaht` helper ([`MedicalInstrumentsTab.jsx:22-25`](../../src/components/backend/MedicalInstrumentsTab.jsx)), purchase date
- **Maintenance schedule**: `maintenanceIntervalMonths` + `nextMaintenanceDate` driving a colour-coded badge from the `maintenanceBadge(days)` helper ([`MedicalInstrumentsTab.jsx:27-32`](../../src/components/backend/MedicalInstrumentsTab.jsx)) — red "เลยกำหนด N วัน" if overdue, amber "เหลือ N วัน" if ≤ 30 days, sky "อีก N วัน" otherwise
- **Service history**: `maintenanceLog[]` length surfaced as "ประวัติซ่อม: N ครั้ง"

The tab uses the standard `MarketingTabShell` chrome with a single `filterStatus` dropdown (search hay = `name + code + note`). CRUD via `MedicalInstrumentFormModal` and Firestore-only delete via `deleteMedicalInstrument` ([`MedicalInstrumentsTab.jsx:83`](../../src/components/backend/MedicalInstrumentsTab.jsx)).

The tab follows **Phase BS V2 branch-scoped reads**: `useSelectedBranch()` provides `branchId` to `listMedicalInstruments({branchId})` ([`MedicalInstrumentsTab.jsx:50`](../../src/components/backend/MedicalInstrumentsTab.jsx)). One-shot read; no listener subscription.

## API surface / Key state

- **Imports**: `listMedicalInstruments`, `deleteMedicalInstrument` from [`scopedDataLayer.js`](scoped-data-layer.md) ([`MedicalInstrumentsTab.jsx:7`](../../src/components/backend/MedicalInstrumentsTab.jsx))
- **Validation helpers**: `STATUS_OPTIONS`, `daysUntilMaintenance` from `src/lib/medicalInstrumentValidation.js` ([`MedicalInstrumentsTab.jsx:11-14`](../../src/components/backend/MedicalInstrumentsTab.jsx))
- **Branch hook**: `useSelectedBranch()` ([`MedicalInstrumentsTab.jsx:36`](../../src/components/backend/MedicalInstrumentsTab.jsx))
- **State**: `items`, `query`, `filterStatus`, `formOpen`, `editing`, `deleting`, `error` ([`MedicalInstrumentsTab.jsx:37-44`](../../src/components/backend/MedicalInstrumentsTab.jsx))
- **Reload**: `reload` callback memoized on `selectedBranchId` ([`MedicalInstrumentsTab.jsx:46-57`](../../src/components/backend/MedicalInstrumentsTab.jsx))
- **Card derives**: `days = daysUntilMaintenance(g.nextMaintenanceDate)`; `maint = maintenanceBadge(days)`; `logCount = g.maintenanceLog?.length || 0` ([`MedicalInstrumentsTab.jsx:126-128`](../../src/components/backend/MedicalInstrumentsTab.jsx))

## Data flow

1. Mount → `useSelectedBranch()` reads context.
2. `useEffect(() => { reload(); }, [reload])`; `reload` re-binds on `selectedBranchId` change so the top-right branch switch re-fetches automatically.
3. `setItems(await listMedicalInstruments({branchId: selectedBranchId}))`.
4. Card render computes `days`, picks the corresponding badge variant, renders `<maint.icon>` (capitalised local alias for the JSX tag, [`MedicalInstrumentsTab.jsx:155-159`](../../src/components/backend/MedicalInstrumentsTab.jsx)).
5. Mutations call `MedicalInstrumentFormModal`; `handleSaved` and `handleDelete` both `reload()`.

## Cross-references

- Concept: [Branch-Scope Architecture (BSA)](../concepts/branch-scope-architecture.md) — explains the branch-scoped reads pattern
- Entity: [scopedDataLayer](scoped-data-layer.md) — Layer 2 wrapper module
- Sibling tabs:
  - [ProductGroupsTab](product-groups-tab.md), [ProductUnitsTab](product-units-tab.md), [HolidaysTab](holidays-tab.md), [ProductsTab](products-tab.md), [CoursesTab](courses-tab.md), [DfGroupsTab](df-groups-tab.md) — co-resident master-data tabs
- Validation module: `src/lib/medicalInstrumentValidation.js` — exports `STATUS_OPTIONS` and the `daysUntilMaintenance` pure helper used to drive the maintenance badge
- Form modal: `src/components/backend/MedicalInstrumentFormModal.jsx`
- Shared chrome: `MarketingTabShell`

## Phase 17.1 anticipation

This tab is one of the **seven master-data targets** for Phase 17.1 admin-only "import from another branch". Instruments are mostly self-contained (no FK references out to other master-data entities), so cross-branch import is a `branchId` rewrite + dedupe-by-name. One nuance specific to this tab: `maintenanceLog[]` entries are timestamped audit history — the importer should decide whether to copy them (preserve service history) or strip them (treat as a fresh-instance copy). That decision should be a Phase 17.1 brainstorming question alongside the per-tab import strategy.

## History

- 2026-05-05 — Created during the wiki backfill batch for the seven Phase 11 master-data tabs flagged for Phase 17.1.
