---
title: VoucherTab
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [marketing, backend-tab, branch-scoped, phase-9, phase-17-0]
source-count: 0
---

# VoucherTab

> Backend dashboard tab listing `be_vouchers` from Firestore, filtered by branch via [scopedDataLayer.js](scoped-data-layer.md). Platform-filter dropdown sourced from `VOUCHER_PLATFORMS` (Lazada, Shopee, etc.). CRUD via `VoucherFormModal`. Deletes gated by the `voucher_management` permission. Phase 9 Marketing entity, Firestore-only per iron-clad Rule E.

## Overview

Source file: [`src/components/backend/VoucherTab.jsx`](../../src/components/backend/VoucherTab.jsx). The component is the voucher CRUD landing in the marketing tab group. Vouchers represent third-party platform-issued discount codes (e.g. Lazada vouchers, Shopee vouchers) that the clinic redeems on behalf of customers — distinct from clinic-issued [coupons](coupon-tab.md). Admins see all vouchers for the currently selected branch as a card grid, with platform-filter and free-text search. The header chrome is rendered by `MarketingTabShell` (`VoucherTab.jsx:7,65-80`).

The list source is the `be_vouchers` Firestore collection, accessed via `listVouchers` re-exported from `src/lib/scopedDataLayer.js` (`VoucherTab.jsx:5,29`). Per [Branch-Scope Architecture](../concepts/branch-scope-architecture.md), the wrapper auto-injects the currently selected `branchId` AND OR-merges vouchers flagged `allBranches:true`. The component is branch-unaware.

Filter UX has two axes: free-text query (matches `voucher_name`, `VoucherTab.jsx:35-42`) and a platform dropdown sourced from `VOUCHER_PLATFORMS` (imported from `voucherValidation.js` at `VoucherTab.jsx:9,55-60`). The platform list is the canonical source-of-truth — adding a new third-party platform is done in `voucherValidation.js` and surfaces here automatically.

CRUD flow: create button opens an empty form via `setEditing(null) + setFormOpen(true)` (`VoucherTab.jsx:71`). Edit button does the same with the voucher row populated (`VoucherTab.jsx:106`). Delete confirms via `window.confirm`, calls `deleteVoucher(id)` from scopedDataLayer, then `reload()` (`VoucherTab.jsx:44-53`). Save is delegated to [`VoucherFormModal`](../../src/components/backend/VoucherFormModal.jsx) (`VoucherTab.jsx:122-126`); on `onSaved`, the parent closes the modal and reloads.

Permission gate: `canDelete = useHasPermission('voucher_management')` at `VoucherTab.jsx:22`. Delete buttons are `disabled` when false with Thai tooltip (`VoucherTab.jsx:110-112`). Admin claims bypass via `useHasPermission` internals.

The voucher shape includes a sale price (face value), a commission percentage (the clinic's cut, surfaced at `VoucherTab.jsx:96-98` as "ค่าธรรมเนียม N%"), an optional period range gated by `has_period` (`VoucherTab.jsx:100-103`), and platform metadata. The platform badge renders as a violet pill on each card (`VoucherTab.jsx:88-93`).

## API surface / Key state

State hooks (all at `VoucherTab.jsx:13-22`):
- `items` — raw list from `listVouchers()`
- `loading`, `query`, `filterPlatform`, `formOpen`, `editing`, `deleting`, `error`
- `canDelete` — derived from `useHasPermission('voucher_management')`

Memoized derivations:
- `filtered` (`VoucherTab.jsx:35-42`) — items matching name query + platform filter

Functions:
- `reload` (`VoucherTab.jsx:27-32`) — `useCallback` with empty deps; awaits `listVouchers()`
- `handleDelete` (`VoucherTab.jsx:44-53`) — confirm + `deleteVoucher(id)` + reload
- Inline `onCreate` and `onSaved` on the shell (`VoucherTab.jsx:71,124`) — set state to open/close + reload

Imports of note:
- `listVouchers`, `deleteVoucher` from `scopedDataLayer.js` (`VoucherTab.jsx:5`)
- `VOUCHER_PLATFORMS` from `voucherValidation.js` (`VoucherTab.jsx:9`) — frozen list driving the platform-filter dropdown
- `useHasPermission` from `useTabAccess.js` (`VoucherTab.jsx:8`)

## Data flow

Mount → `useEffect(() => { reload(); }, [reload])` at `VoucherTab.jsx:33` fires.

`reload` calls `listVouchers()` from `scopedDataLayer.js` (`VoucherTab.jsx:29`). Inside the wrapper, `resolveSelectedBranchId()` reads the current branch and forwards `{branchId}` to `backendClient.js listVouchers`. For vouchers with `allBranches:true`, the `_listWithBranchOrMerge` helper does a 2-query OR-merge. Deduped array → `setItems`.

Render → cards iterate `filtered`. Per-card actions:
- **Edit** → `setEditing(v) + setFormOpen(true)` → modal mounts
- **Delete** → `handleDelete(v)` → confirm → `deleteVoucher(id)` → reload

Save (within modal) → `saveVoucher(id, payload)` from scopedDataLayer auto-stamps branch via `_resolveBranchIdForWrite` → `onSaved()` → parent closes + reloads (`VoucherTab.jsx:124`).

Branch switch → analogous to the other marketing tabs: empty `useCallback` deps mean tab content is not auto-refreshed on branch change; the next interaction (manual refresh, modal close, etc.) re-runs `reload`.

## Cross-references

- Concept: [Branch-Scope Architecture](../concepts/branch-scope-architecture.md) — Layer 2 wrapper auto-injects branch on read + write
- Entity: [scopedDataLayer.js](scoped-data-layer.md) — re-exports `listVouchers` / `saveVoucher` / `deleteVoucher`
- Entity: [`VoucherFormModal.jsx`](../../src/components/backend/VoucherFormModal.jsx) — sister CRUD modal (validation via `voucherValidation.js`)
- Entity: [`MarketingTabShell.jsx`](../../src/components/backend/MarketingTabShell.jsx) — shared header/empty/loading chrome
- Entity: [PromotionTab](promotion-tab.md), [CouponTab](coupon-tab.md) — sibling marketing tabs sharing the same shell + BSA semantics
- Entity: [`useTabAccess.js`](../../src/hooks/useTabAccess.js) — `useHasPermission` source
- Source: Phase 9 Marketing implementation plan (created 2026-04-19)

## History

- 2026-05-05 — Created during wiki backfill cycle. Phase 17.0 closed branch-switch-refresh gap (was using empty deps in `useCallback(reload, [])` post-Phase BSA Task 6 import migration to `scopedDataLayer.js`).
