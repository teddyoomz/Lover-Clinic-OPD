---
title: BranchContext + useSelectedBranch
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [react-context, hook, branch-scoped, phase-bs, phase-bsa]
source-count: 0
---

# `src/lib/BranchContext.jsx` + `src/lib/branchSelection.js`

> React Context + hook providing `selectedBranchId` to the entire UI tree. Source-of-truth for the top-right `BranchSelector` dropdown. Paired with a pure-JS sibling module (`branchSelection.js`) so non-React code (data layer, lib helpers, server endpoints) can read the same selection without importing a `.jsx` file.

## API

| Export | Type | Source |
|---|---|---|
| `BranchProvider` | React component (provider) | `src/lib/BranchContext.jsx:53` |
| `useSelectedBranch()` | React hook → `{ branchId, branches, selectBranch, isReady }` | `src/lib/BranchContext.jsx:148` |
| `useUserScopedBranches()` | React hook (filter by staff `branchIds[]`) → `{ branchId, branches, selectBranch, isReady, allBranches }` | `src/lib/BranchContext.jsx:345` |
| `useEffectiveClinicSettings(clinicSettings)` | React hook (merge selected branch into clinic shape) | `src/lib/BranchContext.jsx:279` |
| `resolveBranchName(branchId, branches)` | Pure helper (id → human name) | `src/lib/BranchContext.jsx:196` |
| `mergeBranchIntoClinic(clinicSettings, branch)` | Pure helper (per-branch override merge) | `src/lib/BranchContext.jsx:236` |
| `filterBranchesByStaffAccess(branches, staff)` | Pure helper (soft-gate filter by `staff.branchIds[]`) | `src/lib/BranchContext.jsx:318` |
| `resolveSelectedBranchId()` | Pure-JS sync getter (re-export from `branchSelection.js`) | `src/lib/BranchContext.jsx:162` → `src/lib/branchSelection.js:29` |
| `setSelectedBranchId(id)` | Pure-JS sync setter (re-export) | `src/lib/BranchContext.jsx:171` → `src/lib/branchSelection.js:45` |
| `resetBranchSelection()` | Pure-JS reset (re-export) | `src/lib/BranchContext.jsx:168` → `src/lib/branchSelection.js:56` |
| `STORAGE_KEY` / `FALLBACK_ID` | Constants — `'selectedBranchId'` / `'main'` | `src/lib/branchSelection.js:19-20` |

## State persistence

`selectedBranchId` is mirrored to `window.localStorage` under key `'selectedBranchId'` (`src/lib/branchSelection.js:19`). On boot, `BranchProvider` reads from localStorage in its initial-state lazy initializer (`src/lib/BranchContext.jsx:55-64`) and falls back to `'main'` (FALLBACK_ID) if unavailable or empty.

The pure-JS resolver `resolveSelectedBranchId()` reads the SAME localStorage key (`src/lib/branchSelection.js:29-36`) — keeping React + non-React paths in sync. When a user clicks the BranchSelector dropdown, `selectBranch(id)` (`src/lib/BranchContext.jsx:127-131`) writes both React state AND localStorage in one go. The next non-React caller (e.g. `scopedDataLayer.listProducts()`) will pick up the new value via `resolveSelectedBranchId()` on its next call.

## The 2-layer pattern

This module exists in two coordinated halves to satisfy V36 audit invariant G.51 (no React leak into the data layer):

- **React layer** (`BranchContext.jsx`): `useSelectedBranch()` + `BranchProvider` — for UI components rendering inside the React tree. Subscribes to `be_branches` via `onSnapshot` so admin edits in `BranchesTab` reflect live in the dropdown.
- **Pure-JS layer** (`branchSelection.js`): `resolveSelectedBranchId()` + `setSelectedBranchId()` + `resetBranchSelection()` — for `scopedDataLayer.js`, `backendClient.js`, lib helpers, async handlers, server endpoints unaware of React. NO React import. Just localStorage I/O wrapped in defensive `try/catch` for SSR / sandbox safety.

`BranchContext.jsx` re-exports the pure-JS half for back-compat (`src/lib/BranchContext.jsx:162-171`) so existing component callsites importing from `BranchContext.jsx` keep working without churn.

## Re-render on switch — foundation for Phase 17.0 BS-9

When `selectBranch(newId)` is called inside the React tree:

1. `setSelectedBranchIdState(id)` triggers React re-render of every consumer of `useSelectedBranch()` (`src/lib/BranchContext.jsx:128-130`).
2. `window.localStorage.setItem(STORAGE_KEY, id)` updates the persistent half (`src/lib/BranchContext.jsx:130`).
3. Any `useEffect` / `useCallback` hooks that have `selectedBranchId` in their deps re-fire — this is what Phase 17.0's BS-9 invariant relies on. The 3 marketing tabs (Promotion/Coupon/Voucher) had `useCallback(reload, [])` with EMPTY deps in the Phase BSA Task 6 migration, so the re-render fired but `reload` didn't. Phase 17.0 fix: add `selectedBranchId` to the deps so the closure re-binds + branch switch re-fetches.
4. Concurrently, any non-React caller invoking `resolveSelectedBranchId()` on its next tick reads the fresh localStorage value (no propagation delay since both halves share the same source-of-truth key).

The V36 phantom-branch defensive fallback inside `BranchProvider` (`src/lib/BranchContext.jsx:88-118`) re-validates `selectedBranchId` on EVERY snapshot — if admin deletes the currently-selected branch via the cleanup endpoint, the provider re-resolves to the default branch or `'main'` automatically. Pre-V36 only validated on first snapshot, leading to "Movement log สาขาหายไปหมด" reports.

## Cross-references

- Concept: [Branch-Scope Architecture](../concepts/branch-scope-architecture.md)
- Entity: [scopedDataLayer.js](scoped-data-layer.md) — Layer 2 consumer of `resolveSelectedBranchId()`
- Entity: [useBranchAwareListener](use-branch-aware-listener.md) — Layer 3 hook that re-subscribes on branch switch via `useSelectedBranch()`

## History

- Phase BS V1 (2026-05-04 morning) — initial impl with top-right `BranchSelector` + per-staff `branchIds[]` soft-gate via `useUserScopedBranches()`.
- Phase BSA (2026-05-04 afternoon) — pure-JS `branchSelection.js` extracted as the Layer 2 import target; `BranchContext.jsx` re-exports the pure half for back-compat (V36 audit invariant G.51 — no React leak into the data layer).
- 2026-05-05 — Wiki backfill page created.
