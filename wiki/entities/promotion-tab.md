---
title: PromotionTab
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [marketing, backend-tab, branch-scoped, phase-9, phase-17-0]
source-count: 0
---

# PromotionTab

> Backend dashboard tab listing `be_promotions` from Firestore, filtered by branch via [scopedDataLayer.js](scoped-data-layer.md). CRUD wraps `PromotionFormModal`; deletes are gated by the `promotion_management` permission. Phase 9 Marketing entity, Firestore-only per iron-clad Rule E.

## Overview

Source file: [`src/components/backend/PromotionTab.jsx`](../../src/components/backend/PromotionTab.jsx). The component is the marketing-section landing surface for promotions — admins land here, see all promotions for the currently selected branch as a card grid, search/filter them, and open the form modal to create or edit. The header chrome (title + count + create button + search) is delegated to the shared `MarketingTabShell` component (referenced at `PromotionTab.jsx:12,118-134`); `PromotionTab` only owns the data layer wiring + per-card rendering.

The list source is the `be_promotions` Firestore collection, accessed exclusively through `listPromotions` re-exported from `src/lib/scopedDataLayer.js` (`PromotionTab.jsx:10,47`). Per [Branch-Scope Architecture](../concepts/branch-scope-architecture.md) Layer 2, the wrapper auto-injects the currently selected `branchId` (resolved via `resolveSelectedBranchId()` inside `scopedDataLayer.js`) PLUS performs an OR-merge fetch for promotions flagged `allBranches:true` (clinic-level promotions visible from any branch). The component itself is unaware of branch — it just calls `listPromotions()` with no args. This is the architectural goal of BSA — UI files cannot accidentally cross-leak data because the import path is the boundary.

The filter UX has three axes: free-text query (matches `promotion_name`, `promotion_code`, `category_name`, see `PromotionTab.jsx:65-77`), category dropdown built from the union of seen `category_name` values (`PromotionTab.jsx:59-63`), and status dropdown (`active` / `suspended`, `PromotionTab.jsx:107-112`). All three filters compose via the `filtered` `useMemo` over `items`. The grid renders 1/2/3 columns by Tailwind breakpoints (`PromotionTab.jsx:135`).

CRUD flow: `handleCreate` opens an empty form, `handleEdit` opens the form with `editingPromotion` populated, `handleDelete` confirms via `window.confirm`, calls `deletePromotion(id)` from scopedDataLayer (`PromotionTab.jsx:82-96`), then `reload()`. Save is delegated to [`PromotionFormModal`](../../src/components/backend/PromotionFormModal.jsx) (`PromotionTab.jsx:210-218`), which emits `onSaved` → the parent flips `formOpen=false` and re-runs `reload()` (`PromotionTab.jsx:98`). No optimistic update — every mutation is followed by a fresh fetch.

Permission gate: `canDelete = useHasPermission('promotion_management')` at `PromotionTab.jsx:38`. Delete buttons are `disabled` when the gate is false and surface a Thai tooltip (`PromotionTab.jsx:198-202`). Edit + create are not gated at this layer (legacy — the gate could be tightened in a future sub-phase). Admin claims (`admin:true`) bypass the per-permission gate via `useHasPermission` internals.

## API surface / Key state

State hooks (all at `PromotionTab.jsx:27-38`):
- `items` — raw list returned by `listPromotions()`
- `loading` — true during fetch
- `query`, `filterCategory`, `filterStatus` — filter inputs
- `formOpen` — whether `PromotionFormModal` is mounted
- `editingPromotion` — null for create mode, populated promotion for edit
- `deleting` — id of the promotion currently being deleted (for spinner)
- `error` — Thai user-facing error message
- `canDelete` — derived from `useHasPermission('promotion_management')`

Memoized derivations:
- `categoryOptions` (`PromotionTab.jsx:59-63`) — unique sorted `category_name` values from `items`
- `filtered` (`PromotionTab.jsx:65-77`) — items matching all three filter axes

Functions:
- `reload` (`PromotionTab.jsx:43-55`) — `useCallback` with empty deps; awaits `listPromotions()`, sets state
- `handleCreate` / `handleEdit` (`PromotionTab.jsx:79-80`) — open form modal in respective modes
- `handleDelete` (`PromotionTab.jsx:82-96`) — confirm + `deletePromotion(id)` + reload
- `handleSaved` (`PromotionTab.jsx:98`) — close modal + reload

## Data flow

Mount → first `useEffect(() => { reload(); }, [reload])` at `PromotionTab.jsx:57` fires.

`reload` calls `listPromotions()` from `scopedDataLayer.js` (`PromotionTab.jsx:47`). Inside the wrapper, `resolveSelectedBranchId()` reads the currently selected `branchId` from the BranchContext / localStorage and forwards it to the underlying `backendClient.js` `listPromotions({branchId})`. For promotions with the `allBranches:true` doc-level field, the shared `_listWithBranchOrMerge` helper does a 2-query OR-merge so clinic-wide promotions appear in every branch's view. Result is a deduped array; `setItems(data)` populates state.

Render → cards iterate `filtered`. Per-card actions:
- **Edit** → `handleEdit(p)` → `setEditingPromotion(p) + setFormOpen(true)` → modal opens
- **Delete** → `handleDelete(p)` → `confirm()` + `deletePromotion(id)` + `reload()`

Save (within modal) → `savePromotion(id, payload)` from scopedDataLayer (which auto-stamps `branchId` via `_resolveBranchIdForWrite` in `backendClient.js`) → `onSaved()` → parent `handleSaved` closes modal + calls `reload()`.

Branch switch → currently `reload` does NOT auto-refire when the user picks a new branch from the top-right selector. The list is refreshed by the next mount or manual interaction. Phase 17.0 closed the gap on writers (auto-stamp at write time) and listers (auto-inject at fetch time); Tab-level branch-switch refresh is tracked separately (see `useCallback(reload, [])` empty deps at `PromotionTab.jsx:55`).

## Cross-references

- Concept: [Branch-Scope Architecture](../concepts/branch-scope-architecture.md) — Layer 2 wrapper `scopedDataLayer.js` auto-injects branch on read + write
- Entity: [scopedDataLayer.js](scoped-data-layer.md) — re-exports `listPromotions` / `savePromotion` / `deletePromotion` with branch-aware semantics
- Entity: [`PromotionFormModal.jsx`](../../src/components/backend/PromotionFormModal.jsx) — sister CRUD modal (validation, master-data sub-item picker via `listCourses`/`listProducts`)
- Entity: [`MarketingTabShell.jsx`](../../src/components/backend/MarketingTabShell.jsx) — shared header/empty/loading chrome (Rule of 3, AV10)
- Entity: [`useTabAccess.js`](../../src/hooks/useTabAccess.js) — `useHasPermission` source
- Source: Phase 9 Marketing implementation plan (created 2026-04-19); deferred V2 covered in V36-class V-entries

## History

- 2026-05-05 — Created during wiki backfill cycle. Phase 17.0 closed branch-switch-refresh gap (was using empty deps in `useCallback(reload, [])` post-Phase BSA Task 6 import migration to `scopedDataLayer.js`).
