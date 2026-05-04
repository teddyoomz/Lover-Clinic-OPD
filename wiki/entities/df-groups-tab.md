---
title: DfGroupsTab
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [master-data, backend-tab, branch-scoped, phase-11, phase-17-1-target]
source-count: 0
---

# DfGroupsTab

> The Phase 13.3.3 master-data tab that manages **DF (doctor fee / "ค่ามือ") groups** — payout-rate templates that determine how much commission a doctor or nurse earns per service. Stored in the branch-scoped `be_df_groups` collection. Firestore-only per Rule E. One of seven master-data tabs slated as targets for the Phase 17.1 cross-branch import feature.

## Overview

A DF group is a named bundle of payout rates — typically one rate per service-type (e.g. "Standard Senior Doctor" group with rates for laser / RF / drip / surgical). Each group carries a `name`, optional `note`, `status` (`active` / `disabled`), and a `rates[]` array. The card preview surfaces just the group name + rate count ([`DfGroupsTab.jsx:103`](../../src/components/backend/DfGroupsTab.jsx)) with detailed editing pushed into `DfGroupFormModal`.

This tab differs visually from the other six master-data tabs in the batch: instead of a 3-column responsive **card grid**, it uses a single-column **list-row layout** ([`DfGroupsTab.jsx:88`](../../src/components/backend/DfGroupsTab.jsx)) — closer to a table than a gallery. The choice fits the data shape (groups are short identifiers; rate detail belongs in the modal).

The `status` column uses **English enum values** (`active` / `disabled`) with Thai labels rendered through the `STATUS_BADGE` map ([`DfGroupsTab.jsx:12-15`](../../src/components/backend/DfGroupsTab.jsx)) — a deliberate departure from the `ใช้งาน` / `พักใช้งาน` Thai-string pattern used by the other six tabs in this batch. The English enums are useful when query-filtering on Firestore where Thai string equality can be locale-fragile.

CRUD via `DfGroupFormModal`, Firestore-only delete via `deleteDfGroup` ([`DfGroupsTab.jsx:53`](../../src/components/backend/DfGroupsTab.jsx)). The delete confirm includes a friendly reminder to re-assign affected doctors first — orphan-prevention by social cue rather than hard FK enforcement ([`DfGroupsTab.jsx:51`](../../src/components/backend/DfGroupsTab.jsx)).

The tab follows **Phase BS V2 branch-scoped reads**: `useSelectedBranch()` provides `branchId` to `listDfGroups({branchId})` ([`DfGroupsTab.jsx:31`](../../src/components/backend/DfGroupsTab.jsx)). One-shot read; no listener subscription. Manual `reload()` after every mutation.

## API surface / Key state

- **Imports**: `listDfGroups`, `deleteDfGroup` from [`scopedDataLayer.js`](scoped-data-layer.md) ([`DfGroupsTab.jsx:6`](../../src/components/backend/DfGroupsTab.jsx))
- **Validation helpers**: `STATUS_OPTIONS` from `src/lib/dfGroupValidation.js` ([`DfGroupsTab.jsx:10`](../../src/components/backend/DfGroupsTab.jsx))
- **Branch hook**: `useSelectedBranch()` ([`DfGroupsTab.jsx:19`](../../src/components/backend/DfGroupsTab.jsx))
- **State**: `items`, `query`, `filterStatus`, `formOpen`, `editing`, `deleting`, `error` ([`DfGroupsTab.jsx:20-27`](../../src/components/backend/DfGroupsTab.jsx))
- **Reload**: `reload` callback memoized on `selectedBranchId` ([`DfGroupsTab.jsx:29-34`](../../src/components/backend/DfGroupsTab.jsx))
- **Filter**: client-side `filtered` memo over name / note search + status ([`DfGroupsTab.jsx:38-45`](../../src/components/backend/DfGroupsTab.jsx))
- **Card derives**: `rateCount = (g.rates || []).length` ([`DfGroupsTab.jsx:93`](../../src/components/backend/DfGroupsTab.jsx))

## Data flow

1. Mount → `useSelectedBranch()` reads context.
2. `useEffect(() => { reload(); }, [reload])`; `reload` rebuilds on `selectedBranchId` change so top-right branch switch re-fetches automatically.
3. `setItems(await listDfGroups({branchId: selectedBranchId}))`.
4. List render iterates `filtered` as horizontal rows with status badge + name + rate count + edit/delete icons ([`DfGroupsTab.jsx:96-116`](../../src/components/backend/DfGroupsTab.jsx)).
5. Mutations call `DfGroupFormModal`; `handleSaved` and `handleDelete` both `reload()`.

## Cross-references

- Concept: [Branch-Scope Architecture (BSA)](../concepts/branch-scope-architecture.md) — explains the branch-scoped reads pattern
- Entity: [scopedDataLayer](scoped-data-layer.md) — Layer 2 wrapper module
- Companion entity: `be_df_staff_rates` — separate per-staff override collection (managed via DfStaffRatesTab) that lets specific doctors deviate from the group baseline. Phase 13.3.3 made the group-then-override split canonical
- Sibling tabs:
  - [ProductGroupsTab](product-groups-tab.md), [ProductUnitsTab](product-units-tab.md), [MedicalInstrumentsTab](medical-instruments-tab.md), [HolidaysTab](holidays-tab.md), [ProductsTab](products-tab.md), [CoursesTab](courses-tab.md) — co-resident master-data tabs
- Downstream consumers: Phase 13.4 DF Payout Report (`dfPayoutAggregator`), TreatmentFormPage (auto-applies group rate when seller is set), SaleTab (DF lookup at sale-save time)
- Validation module: `src/lib/dfGroupValidation.js`
- Form modal: `src/components/backend/DfGroupFormModal.jsx`
- Shared chrome: `MarketingTabShell` (header chrome only — body uses a list-row layout instead of the standard card grid)

## Phase 17.1 anticipation

This tab is one of the **seven master-data targets** for Phase 17.1 admin-only "import from another branch". DF groups are interesting Phase 17.1 candidates because **payout rates are a business-policy decision that often DOES vary by branch** (cost of living, market rate, partnership terms). The default Phase 17.1 import flow (copy + branchId rewrite) is correct, but the admin should expect to edit imported groups before publishing — possibly with a clear "imported from <branch>, review before activating" status flag distinct from the `disabled` state. The companion `be_df_staff_rates` overrides should NOT be imported by default (per-staff overrides are inherently per-branch because staff have a `branchId`).

## History

- 2026-05-05 — Created during the wiki backfill batch for the seven Phase 11 master-data tabs flagged for Phase 17.1.
