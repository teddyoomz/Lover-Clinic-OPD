---
title: HolidaysTab
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [master-data, backend-tab, branch-scoped, phase-11, phase-17-1-target]
source-count: 0
---

# HolidaysTab

> The Phase 11.5 master-data tab that manages **clinic holidays** — both specific calendar dates (e.g. New Year, Songkran) and weekly recurring closures (e.g. "ทุกวันอาทิตย์"). Stored in the branch-scoped `be_holidays` collection. **The only master-data tab in this batch that uses a real-time listener** ([`useBranchAwareListener`](use-branch-aware-listener.md)) instead of one-shot reads. One of seven master-data tabs slated as targets for the Phase 17.1 cross-branch import feature.

## Overview

The tab supports two holiday `type` values, switched on the type-filter dropdown and rendered with distinct iconography ([`HolidaysTab.jsx:24-27`](../../src/components/backend/HolidaysTab.jsx)):

- **`specific`** — array of ISO date strings; card renders the first six dates as mono chips with a "+N" overflow badge
- **`weekly`** — single `dayOfWeek` integer (0-6); card renders "ทุกวัน<dow>" using `DAY_OF_WEEK_LABELS` from the validation module

`HolidaysTab` is the **first and only master-data tab in this batch that uses an onSnapshot listener** instead of one-shot `list*`. The migration to listener happened in **Phase 14.7.H follow-up H (2026-04-26)** — documented inline at [`HolidaysTab.jsx:44-50`](../../src/components/backend/HolidaysTab.jsx). The motivation was multi-window collaborative editing: when admin A creates a holiday in window 1 while admin B has the tab open in window 2, both lists refresh within ~1s without explicit reload. The legacy `reload` callback is preserved as a no-op shim ([`HolidaysTab.jsx:51-53`](../../src/components/backend/HolidaysTab.jsx)) so existing post-mutation callbacks (`handleSaved`, `handleDelete`) don't need refactoring.

The tab is also the **only master-data tab in this batch that gates delete on a permission key** — `useHasPermission('holiday_setting')` provides `canDelete`, which disables the delete button (with explanatory tooltip "ไม่มีสิทธิ์ลบวันหยุด") for users without the permission. Phase 13.5.3 added this gate. Admin bypasses the gate implicitly via the `useHasPermission` admin-claim shortcut ([`HolidaysTab.jsx:42-43`](../../src/components/backend/HolidaysTab.jsx)).

The tab uses the standard `MarketingTabShell` chrome plus two filter dropdowns (type + status). Search hay combines `note + dates + dayOfWeek-label` ([`HolidaysTab.jsx:69-75`](../../src/components/backend/HolidaysTab.jsx)).

## API surface / Key state

- **Imports**: `listenToHolidays`, `deleteHoliday` from [`scopedDataLayer.js`](scoped-data-layer.md) ([`HolidaysTab.jsx:7`](../../src/components/backend/HolidaysTab.jsx))
- **Listener hook**: `useBranchAwareListener` from `src/hooks/useBranchAwareListener.js` ([`HolidaysTab.jsx:9`](../../src/components/backend/HolidaysTab.jsx))
- **Permission hook**: `useHasPermission('holiday_setting')` from `src/hooks/useTabAccess.js` ([`HolidaysTab.jsx:12, 42`](../../src/components/backend/HolidaysTab.jsx))
- **Validation imports**: `STATUS_OPTIONS`, `HOLIDAY_TYPES`, `DAY_OF_WEEK_LABELS` ([`HolidaysTab.jsx:13-17`](../../src/components/backend/HolidaysTab.jsx))
- **Branch hook**: `useSelectedBranch()` ([`HolidaysTab.jsx:31`](../../src/components/backend/HolidaysTab.jsx))
- **State**: `items`, `query`, `filterType`, `filterStatus`, `formOpen`, `editing`, `deleting`, `error`, `canDelete` ([`HolidaysTab.jsx:32-43`](../../src/components/backend/HolidaysTab.jsx))
- **Listener wiring**: `useBranchAwareListener(listenToHolidays, {}, onChange, onError)` ([`HolidaysTab.jsx:59-64`](../../src/components/backend/HolidaysTab.jsx)) — Phase BSA Task 8 pattern; the hook handles `branchId` injection + auto re-subscribe on top-right branch switch

## Data flow

1. Mount → `useSelectedBranch()` reads context.
2. `useEffect` flips `loading=true` + clears error on `selectedBranchId` change ([`HolidaysTab.jsx:58`](../../src/components/backend/HolidaysTab.jsx)).
3. `useBranchAwareListener` subscribes via `listenToHolidays`; the hook auto-injects the current `branchId`, fires `onChange(list)` on every snapshot, and **auto-resubscribes** when the user changes branches via the top-right selector.
4. Mutations call `HolidayFormModal`; the listener picks up the new state automatically — `handleSaved` and `handleDelete` still call the no-op `reload()` shim for compatibility, but the listener is what actually keeps `items` fresh.

## Cross-references

- Concept: [Branch-Scope Architecture (BSA)](../concepts/branch-scope-architecture.md) — explains the three-layer pattern; `useBranchAwareListener` is Layer 3
- Entities:
  - [scopedDataLayer](scoped-data-layer.md) — Layer 2 wrapper module providing `listenToHolidays`
  - [useBranchAwareListener](use-branch-aware-listener.md) — the hook that this tab uses to subscribe
- Sibling tabs:
  - [ProductGroupsTab](product-groups-tab.md), [ProductUnitsTab](product-units-tab.md), [MedicalInstrumentsTab](medical-instruments-tab.md), [ProductsTab](products-tab.md), [CoursesTab](courses-tab.md), [DfGroupsTab](df-groups-tab.md) — co-resident master-data tabs (all currently use one-shot reads, contrast with this tab's listener)
- Validation module: `src/lib/holidayValidation.js` — exports `STATUS_OPTIONS`, `HOLIDAY_TYPES`, `DAY_OF_WEEK_LABELS`
- Form modal: `src/components/backend/HolidayFormModal.jsx`
- Schedule consumer: holidays read by `src/lib/scheduleFilterUtils.js` and feed the appointment calendar's blocked-slot logic

## Phase 17.1 anticipation

This tab is one of the **seven master-data targets** for Phase 17.1 admin-only "import from another branch". Holidays are a special case because **weekly recurring entries are universal by intent** (a Sunday closure usually applies to all branches), while **specific-date entries are often branch-local** (a branch-anniversary closure applies only to that branch). Phase 17.1 should brainstorm a per-type import strategy: "copy weekly only" vs "copy specific only" vs "copy both" — possibly with a follow-up CRUD step for the admin to edit the imported entries before publishing.

## History

- 2026-05-05 — Created during the wiki backfill batch for the seven Phase 11 master-data tabs flagged for Phase 17.1.
