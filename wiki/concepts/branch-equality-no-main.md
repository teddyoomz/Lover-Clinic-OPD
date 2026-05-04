---
title: Branch equality — no "main" branch (Phase 17.2 anticipation)
type: concept
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [phase-17-2, multi-branch, schema-removal, planned]
source-count: 0
---

# Branch equality — no "main" branch

> Per user directive (2026-05-05): **all branches are equal**. No "main" / "สาขาหลัก" / "default" branch. No starring. The legacy `'main'` branchId, the `isDefault:true` flag on `be_branches` docs, and any UI that highlights one branch over others must all be removed. Phase 17.2 scope.

## Status

**Planned.** User directive received 2026-05-05 mid-Phase-17.0 brainstorm. Scope is significant (~20+ files affected) so it's a separate phase, not bundled with 17.0/17.1.

## User directive (verbatim, 2026-05-05)

> "ฝากเพิ่มยกเลิกสาขา Main หรือ สาขาหลัก อะไรก็แล้วแต่ออกไปจาก backend ด้วย ทุกสาขาเป็นสาขาเหมือนกัน สำคัญเท่ากัน ไม่มีสาขาหลัก ไม่มีการติดดาวอะไรทั้งนั้น"

Translation: please also remove the Main / สาขาหลัก concept from the backend. Every branch is equal, equally important. No main branch. No starring (star indicator) of any kind.

## Surfaces touched (initial inventory via grep)

20 files contain `isDefault` / `'main'` / `includeLegacyMain` / `สาขาหลัก` references. Phase 17.2 brainstorm will produce the exact diff plan; this is the inventory to scope from:

**lib + context**:
- `src/lib/backendClient.js` — listStockLocations, _resolveBranchIdForWrite fallback path, includeLegacyMain branches in stock listers
- `src/lib/BranchContext.jsx` — likely has `'main'` fallback / isDefault selection logic
- `src/lib/cloneOrchestrator.js` — clone flow may reference 'main'

**Backend tabs / components**:
- `src/components/backend/BranchesTab.jsx` + `BranchFormModal.jsx` — `isDefault` toggle in the form, possibly a star indicator in the list
- `src/components/backend/MasterDataTab.jsx` — sync target may be hardcoded 'main' or default branch
- `src/components/backend/SaleTab.jsx`, `AppointmentFormModal.jsx`, `OrderDetailModal.jsx` — display layer using default-branch labels
- `src/components/backend/CustomerCreatePage.jsx` — patient assignment to default branch on create
- `src/components/backend/FinanceMasterTab.jsx` — finance-master sync to default
- 6 stock panels (`StockWithdrawalPanel`, `StockTransferPanel`, `StockSeedPanel`, `StockBalancePanel`, `StockAdjustPanel`, `MovementLogPanel`) — `includeLegacyMain` opt for legacy 'main' batches
- `src/components/backend/CentralStockTab.jsx` — central stock vs branch stock distinction may use main
- `src/pages/BackendDashboard.jsx` — root composition + initial branch resolution

**TFP**:
- `src/components/TreatmentFormPage.jsx` — comment at line 23 says "falls back to 'main' when no BranchProvider is mounted, preserving legacy behavior" — that fallback semantics needs to change

## Likely sub-tasks (Phase 17.2 brainstorm will refine)

1. **Schema migration**: remove `isDefault` field from existing `be_branches` docs (migrator). Decide what happens to docs currently marked `isDefault:true` — probably just unset the flag.
2. **UI**: remove any "Default" badge / star icon / highlighted row in BranchesTab. Remove the `isDefault` checkbox from BranchFormModal.
3. **'main' legacy branchId**: existing stock batches (and possibly other docs) may have `branchId:'main'` or `locationId:'main'`. These should be migrated to a real branch (admin chooses) OR a synthetic branch like "นครราชสีมา baseline" gets created and old docs re-stamped.
4. **`includeLegacyMain` opt**: 6 stock panels accept this opt to merge `'main'` legacy results into the current branch view. After migration (#3), this opt should be removable.
5. **TFP fallback**: when TFP renders outside `BranchProvider` (AdminDashboard create-treatment overlay), it currently falls back to `'main'`. Replace with: error / require provider / use a deterministic non-`'main'` default.
6. **BranchContext default selection**: when no branch is in localStorage, BranchContext currently picks the `isDefault:true` branch. With no isDefault concept, it should pick the alphabetically-first branch OR prompt the user.
7. **MasterDataTab sync targets**: ProClinic sync currently writes to a default branch. Decide: prompt for target branch on every sync run, OR per-clinic config sets the sync target branch.
8. **Migration script**: admin SDK script `scripts/phase-17-2-remove-main-branch.mjs` that migrates legacy 'main' docs + clears isDefault flags + creates audit trail in `be_admin_audit/phase-17-2-*`.

## Architectural rationale

The `isDefault` / `'main'` concept is a vestige of single-branch operation. When Phase BS V1 introduced multi-branch (2026-05-04), the migration kept a notion of "default branch" so legacy data + AdminDashboard's create-treatment overlay could keep working without picking a branch. That's served its purpose — every code path that needs a branchId now gets one explicitly via:

- Top-right BranchSelector → `useSelectedBranch()` → `selectedBranchId` (or `SELECTED_BRANCH_ID` in TFP)
- `_resolveBranchIdForWrite(data)` — explicit `data.branchId` first
- `resolveSelectedBranchId()` localStorage fallback

The `'main'` / `isDefault` extra layer is now noise that:
- Suggests false hierarchy ("main vs others") that doesn't reflect business reality
- Creates audit drift (legacy 'main' batches need `includeLegacyMain` opt to surface, easy to forget)
- UI star/badge implies one branch is "more important" — culturally wrong per user directive

## Cross-references

- Concept: [Branch-Scope Architecture](branch-scope-architecture.md)
- Concept: [Iron-clad rules](iron-clad-rules.md) (Rule L BSA)
- Entity: [BranchContext](../entities/branch-context.md) (currently has 'main' fallback)
- Entity: [scopedDataLayer.js](../entities/scoped-data-layer.md) (downstream of BranchContext)
- Entity: [TreatmentFormPage](../entities/treatment-form-page.md) (line 23 comment about 'main' fallback)
- V-entries: V35 #1 (StockBalancePanel `includeLegacyMain` fix — the `includeLegacyMain` opt itself is what Phase 17.2 will retire after migration)

## Open design questions for Phase 17.2 brainstorm

- **Q1 — Migration target for existing 'main' branchId docs**: pick a real branch by ID? Use the lexicographically-first branch? Prompt admin per doc?
- **Q2 — Default branch selection when no localStorage value**: alphabetically-first? Lexicographically-first by branchId? Force user to pick?
- **Q3 — TFP outside BranchProvider**: hard-fail (refuse to render)? Fallback to a synthetic "no branch" mode that disables branch-aware operations? Prompt user?
- **Q4 — Schema: keep `isDefault` field for back-compat but ignore it, or migration-strip the field?
- **Q5 — `includeLegacyMain` opt**: removable after migration, or keep for indefinite-period back-compat?
- **Q6 — UI**: replace the star/badge with what (if anything)? Just remove it? Or replace with "active" indicator showing which branch is currently selected?

## History

- 2026-05-05 — Page created during Phase 17.0 wiki-first review cycle to capture the user directive immediately. Phase 17.2 brainstorm scheduled after Phase 17.0 ships and Phase 17.1 brainstorm runs.
