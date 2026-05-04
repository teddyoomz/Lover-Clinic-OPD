---
title: Master-data tabs pattern (Phase 11 + branch-scoped)
type: concept
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [phase-11, master-data, backend-tab, branch-scoped, rule-of-3, pattern]
source-count: 0
---

# Master-data tabs pattern

> Seven backend tabs shipped Phase 11 (2026-04-20+) that follow a near-identical structure: list one `be_*` master-data collection, filter/search, CRUD via shared FormModal, branch-scoped read via [scopedDataLayer](../entities/scoped-data-layer.md). All seven are targets for the planned Phase 17.1 cross-branch import feature.

## The 7 tabs

| Tab | Collection | Form modal | Permission | Phase |
|---|---|---|---|---|
| [ProductGroupsTab](../entities/product-groups-tab.md) | `be_product_groups` | ProductGroupFormModal | `product_group_management` | 11.2 |
| [ProductUnitsTab](../entities/product-units-tab.md) | `be_product_unit_groups` | ProductUnitGroupFormModal | `product_unit_management` | 11.3 |
| [MedicalInstrumentsTab](../entities/medical-instruments-tab.md) | `be_medical_instruments` | MedicalInstrumentFormModal | `medical_instrument_management` | 11.4 |
| [HolidaysTab](../entities/holidays-tab.md) | `be_holidays` | HolidayFormModal | `holiday_setting` | 11.5 |
| [ProductsTab](../entities/products-tab.md) | `be_products` | ProductFormModal | `product_management` | 11.7 |
| [CoursesTab](../entities/courses-tab.md) | `be_courses` | CourseFormModal | `course_management` | 11.8 |
| [DfGroupsTab](../entities/df-groups-tab.md) | `be_df_groups` | DfGroupFormModal | `df_group_management` | 13.x |

## The shared structure

Each tab follows ~95% the same shape (Rule of 3 candidate already partially refactored — chrome lives in `MarketingTabShell.jsx`):

```jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { listX, deleteX } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import XFormModal from './XFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';

export default function XTab({ clinicSettings, theme }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const canDelete = useHasPermission('x_management');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await listX({ branchId: selectedBranchId })); }
    catch (e) { setError(e.message); setItems([]); }
    finally { setLoading(false); }
  }, [selectedBranchId]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => /* search + filter */, [items, query, filterStatus]);

  return (
    <MarketingTabShell ...>
      {/* search + filter inputs */}
      {/* filtered list with edit/delete */}
      {/* form modal */}
    </MarketingTabShell>
  );
}
```

Variations:
- [HolidaysTab](../entities/holidays-tab.md) uses `listenToHolidays` + [useBranchAwareListener](../entities/use-branch-aware-listener.md) (real-time multi-tab CRUD support) instead of one-shot `listHolidays`.
- [ProductGroupsTab](../entities/product-groups-tab.md) joins with `be_products` for display (productLookup map).
- [CoursesTab](../entities/courses-tab.md) joins with `be_products` for the course-items rows.

## Branch-scope discipline

All 7 tabs subscribe to [BranchContext](../entities/branch-context.md) and include `selectedBranchId` in `useCallback`/`useEffect` deps per [Branch-switch refresh discipline](branch-switch-refresh-discipline.md) (BS-9). [HolidaysTab](../entities/holidays-tab.md) is the listener-driven exception.

Reads filter by `branchId` via [scopedDataLayer](../entities/scoped-data-layer.md) auto-inject. Writes stamp `branchId` via `_resolveBranchIdForWrite` at Layer 1.

## Why these are the Phase 17.1 targets

The 7 tabs share a property the user wants to leverage: **none of them have ProClinic-origin foreign keys** (unlike [SaleTab](../entities/promotion-tab.md), Treatment, Customer which all reference master-data IDs from ProClinic). They're "primary" master-data — born in OUR Firestore via this UI. Copying them between branches is straightforward: clone the doc, stamp new branchId, write.

The other backend tabs DON'T fit:
- StaffTab, DoctorsTab, BranchesTab, PermissionGroupsTab — universal (no branchId field)
- CustomerListTab — universal (customer.branchId is the patient's home-branch, not master-data scope)
- SaleTab, AppointmentTab, TreatmentTab — transactional records, not master-data; copying them across branches makes no sense
- LineSettingsTab, SystemSettingsTab — singletons or per-branch config, not list-of-entries

## Phase 17.1 anticipation

Per [Cross-branch import pattern](cross-branch-import-pattern.md) (Phase 17.1 planned), all 7 tabs will gain an admin-only "ดึง / Copy ข้อมูลจากสาขาอื่น" button at the tab header. The button opens a shared modal with source-branch picker + selective checkbox UI + import-confirm. Per Rule of 3, the import button + modal will be ONE shared component with per-tab adapter props.

## Cross-references

- Concept: [Branch-Scope Architecture](branch-scope-architecture.md)
- Concept: [Branch-switch refresh discipline (BS-9)](branch-switch-refresh-discipline.md)
- Concept: [Cross-branch import pattern](cross-branch-import-pattern.md) (Phase 17.1)
- Concept: [Iron-clad rules](iron-clad-rules.md) (Rule C1 Rule of 3, Rule H data ownership, Rule H-quater no master_data reads)
- Entities: 7 target tabs (see table above) + [scopedDataLayer.js](../entities/scoped-data-layer.md) + [BranchContext](../entities/branch-context.md)

## History

- 2026-04-20+ — Phase 11.2 to 11.8 ships the 7 master-data tabs + collections. Phase 13.x adds DfGroupsTab.
- 2026-05-04 — Phase BSA Task 6 mass-migrates imports to scopedDataLayer; Task 7 closes Rule H-quater (no `getAllMasterDataItems` in feature code). Phase BS V2 added `_resolveBranchIdForWrite`.
- 2026-05-05 — Wiki backfill page created. Phase 17.1 will add cross-branch import.
