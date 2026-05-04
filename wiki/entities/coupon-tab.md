---
title: CouponTab
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [marketing, backend-tab, branch-scoped, phase-9, phase-17-0]
source-count: 0
---

# CouponTab

> Backend dashboard tab listing `be_coupons` from Firestore, filtered by branch via [scopedDataLayer.js](scoped-data-layer.md). Discount-type filter (`percent` / `baht`), Thai-date expiry badge, CRUD via `CouponFormModal`. Deletes gated by the `coupon_management` permission. Phase 9 Marketing entity, Firestore-only per iron-clad Rule E.

## Overview

Source file: [`src/components/backend/CouponTab.jsx`](../../src/components/backend/CouponTab.jsx). The component is the coupon CRUD landing in the marketing tab group. Admins see all coupons for the currently selected branch as a card grid, with optional filtering by discount type and free-text search. The header chrome (title, count, create button, search) is rendered by the shared `MarketingTabShell` (`CouponTab.jsx:7,72-87`). `CouponTab` itself is the thinnest of the three marketing tabs — 149 lines.

The list source is the `be_coupons` Firestore collection, accessed via `listCoupons` re-exported from `src/lib/scopedDataLayer.js` (`CouponTab.jsx:5,31`). Per [Branch-Scope Architecture](../concepts/branch-scope-architecture.md), the wrapper auto-injects the currently selected `branchId` AND OR-merges coupons flagged `allBranches:true` (clinic-level coupons visible across branches). The component is branch-unaware — it calls `listCoupons()` with no arguments and BSA Layer 2 handles the rest.

Filter UX has two axes: free-text query (matches `coupon_name` and `coupon_code`, `CouponTab.jsx:37-47`) and a discount-type dropdown (`percent` / `baht`, `CouponTab.jsx:62-68`). The expiry badge (the dotted "หมดอายุ" pill at `CouponTab.jsx:101-105`) is computed per-card via `expired = c.end_date && c.end_date < thaiTodayISO()` — using the canonical Thai timezone helper from `src/utils.js` (per Rule of 3, no naked `new Date()`).

CRUD flow: create button opens an empty form via `setEditing(null) + setFormOpen(true)` (`CouponTab.jsx:78`). Edit button does the same with the coupon row populated (`CouponTab.jsx:125`). Delete confirms via `window.confirm`, calls `deleteCoupon(id)` from scopedDataLayer, then `reload()` (`CouponTab.jsx:49-59`). Save is delegated to [`CouponFormModal`](../../src/components/backend/CouponFormModal.jsx) (`CouponTab.jsx:141-145`); on `onSaved`, the parent closes the modal and reloads.

Permission gate: `canDelete = useHasPermission('coupon_management')` at `CouponTab.jsx:24`. Delete buttons are `disabled` when false with Thai tooltip (`CouponTab.jsx:129-131`). Edit and create are not gated at this layer. Admin claims bypass via `useHasPermission` internals.

The coupon shape itself includes per-user limits (`is_limit_per_user` at `CouponTab.jsx:116-118` — single-use per customer when true), max-quantity caps (`max_qty` at `CouponTab.jsx:114`), and date ranges (`start_date` / `end_date` from `CouponTab.jsx:119-123`). Note: branch-scoping for coupons can be either branch-bound (default) OR clinic-wide via the `allBranches:true` doc field — the OR-merge fetch in scopedDataLayer ensures clinic coupons surface from any branch view.

## API surface / Key state

State hooks (all at `CouponTab.jsx:15-24`):
- `items` — raw list from `listCoupons()`
- `loading`, `query`, `filterType`, `formOpen`, `editing`, `deleting`, `error`
- `canDelete` — derived from `useHasPermission('coupon_management')`

Memoized derivations:
- `filtered` (`CouponTab.jsx:37-47`) — items matching query + type filter

Functions:
- `reload` (`CouponTab.jsx:29-34`) — `useCallback` with empty deps; awaits `listCoupons()`
- `handleDelete` (`CouponTab.jsx:49-59`) — confirm + `deleteCoupon(id)` + reload
- Inline `onCreate` and `onSaved` on the shell (`CouponTab.jsx:78,143`) — set state to open/close + reload

Imports of note:
- `listCoupons`, `deleteCoupon` from `scopedDataLayer.js` (`CouponTab.jsx:5`)
- `useHasPermission` from `useTabAccess.js` (`CouponTab.jsx:8`)
- `thaiTodayISO` from `utils.js` (`CouponTab.jsx:10`) — Bangkok-TZ "YYYY-MM-DD" for expiry comparison

## Data flow

Mount → `useEffect(() => { reload(); }, [reload])` at `CouponTab.jsx:35` fires.

`reload` calls `listCoupons()` from `scopedDataLayer.js` (`CouponTab.jsx:31`). Inside the wrapper, `resolveSelectedBranchId()` reads the current branch and forwards `{branchId}` to `backendClient.js listCoupons`. For coupons with `allBranches:true`, the shared `_listWithBranchOrMerge` helper does a 2-query OR-merge so clinic-level coupons appear in every branch's view. Deduped array → `setItems`.

Render → cards iterate `filtered`. Per-card actions:
- **Edit** → `setEditing(c) + setFormOpen(true)` → modal mounts
- **Delete** → `handleDelete(c)` → confirm → `deleteCoupon(id)` → reload

Save (within modal) → `saveCoupon(id, payload)` from scopedDataLayer auto-stamps branch via `_resolveBranchIdForWrite` → `onSaved()` → parent closes + reloads (`CouponTab.jsx:143`).

Expiry display → per row, `c.end_date < thaiTodayISO()` flips the "หมดอายุ" badge on (`CouponTab.jsx:92,101-105`). The comparison uses Thai-TZ today (not UTC) so a coupon valid through 2026-12-31 doesn't expire prematurely during the 00:00–07:00 Thai window.

Branch switch → analogous to PromotionTab: empty `useCallback` deps mean tab content is not auto-refreshed on branch change; the next interaction (manual refresh, modal close, etc.) re-runs `reload`.

## Cross-references

- Concept: [Branch-Scope Architecture](../concepts/branch-scope-architecture.md) — Layer 2 wrapper auto-injects branch on read + write
- Entity: [scopedDataLayer.js](scoped-data-layer.md) — re-exports `listCoupons` / `saveCoupon` / `deleteCoupon`
- Entity: [`CouponFormModal.jsx`](../../src/components/backend/CouponFormModal.jsx) — sister CRUD modal (validation via `couponValidation.js`)
- Entity: [`MarketingTabShell.jsx`](../../src/components/backend/MarketingTabShell.jsx) — shared header/empty/loading chrome
- Entity: [`useTabAccess.js`](../../src/hooks/useTabAccess.js) — `useHasPermission` source
- Source: Phase 9 Marketing implementation plan (created 2026-04-19)

## History

- 2026-05-05 — Created during wiki backfill cycle. Phase 17.0 closed branch-switch-refresh gap (was using empty deps in `useCallback(reload, [])` post-Phase BSA Task 6 import migration to `scopedDataLayer.js`).
