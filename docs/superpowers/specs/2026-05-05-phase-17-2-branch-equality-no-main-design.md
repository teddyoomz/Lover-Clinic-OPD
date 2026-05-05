# Phase 17.2 — Branch Equality (No "Main" Branch)

**Date**: 2026-05-05
**Status**: Design approved (brainstorming complete)
**Predecessor**: Phase 17.1 — Cross-branch master-data import (commit `ff78426`, awaiting V15 #18 deploy)
**Wiki**: [`wiki/concepts/branch-equality-no-main.md`](../../wiki/concepts/branch-equality-no-main.md)

## User directive (verbatim, 2026-05-05)

> "ฝากเพิ่มยกเลิกสาขา Main หรือ สาขาหลัก อะไรก็แล้วแต่ออกไปจาก backend ด้วย ทุกสาขาเป็นสาขาเหมือนกัน สำคัญเท่ากัน ไม่มีสาขาหลัก ไม่มีการติดดาวอะไรทั้งนั้น"

Translation: remove the Main / สาขาหลัก concept from the backend. Every branch is equal, equally important. No main branch. No starring (star indicator) of any kind.

## Approved decisions (locked from brainstorming Q1-Q6)

- **Q1 — Migration target**: Hardcoded default to current `isDefault=true` branch (read BEFORE the field is stripped). Falls back to alphabetically-first branch if no isDefault flag exists. One-shot admin SDK script with `--dry-run` and `--apply` modes.
- **Q2 — Default branch on first load** (3-part rule):
  1. **Per-user persistence**: `localStorage` keyed by `selectedBranchId:${user.uid}` (per-user-per-device).
  2. **First-login default**: newest-created branch among `staff.branchIds[]` (sort `be_branches` by `createdAt DESC`, intersect with accessible, take first).
  3. **Single-branch user**: if `accessibleBranches.length === 1` → BranchSelector hidden; show static label; auto-select.
- **Q3 — TFP outside BranchProvider**: Hoist `<BranchProvider>` to `App.jsx` so AdminDashboard, BackendDashboard, and every overlay inherit it. TFP always uses `useSelectedBranch().branchId`. Drop the `'main'` fallback in TFP comment + behavior.
- **Q4 — `isDefault` field schema**: Strip via the same admin SDK migration script (`FieldValue.delete()` on every `be_branches` doc).
- **Q5 — `includeLegacyMain` opt**: Remove the opt entirely — strip parameter threading + filter logic from 6 stock panels + `src/lib/stockUtils.js`. Migration is one-shot; if anything slips through, re-run the script.
- **Q6 — UI star/badge**: Full removal. Drop the `isDefault` checkbox from `BranchFormModal`; drop any `<Star>` icon / "Default" badge / row highlight in `BranchesTab`. Branches render uniformly.

## Architecture

Phase 17.2 = complete removal of the "main / default branch" concept across 4 surfaces:

1. **Data**: legacy `branchId='main'` docs + `be_branches[].isDefault` field → migrated/stripped via one-shot admin SDK script.
2. **Runtime**: `BranchContext.jsx` rewritten — per-user-uid localStorage key + newest-created default + single-branch-no-picker + no `'main'` fallback. Hoisted to `App.jsx` so all consumers (AdminDashboard, BackendDashboard, overlays) inherit it.
3. **Code cleanup**: `includeLegacyMain` opt + filter logic removed from 6 stock panels; `isDefault` references removed from BranchFormModal + branchValidation + BranchesTab; TFP `'main'` fallback comment + behavior removed.
4. **UI**: BranchFormModal `isDefault` checkbox dropped; BranchesTab star/badge dropped; BranchSelector hides itself when staff has access to only 1 branch.

## Out of scope (locked, do not touch)

- **Bank-account `isDefault`** — separate concept ("default deposit account"). Lives in `src/lib/bankAccountValidation.js` and `src/components/backend/FinanceMasterTab.jsx`. NOT affected by this phase.
- **Customer `branchId`** — immutable patient-home-branch tag from Phase BS V1. NOT migrated.
- **Cross-device branch persistence via Firestore** — deferred to v2 if user requests. v1 = per-device localStorage only.
- **Removing the `kind: 'branch'` shape** in `listStockLocations` (line 7276) — that's a discriminator field used by central-stock vs branch-stock distinction; not a "default" concept.

## Migration script — `scripts/phase-17-2-remove-main-branch.mjs`

One-shot admin SDK script. Run via `node scripts/phase-17-2-remove-main-branch.mjs [--dry-run|--apply]`.

**Default mode**: `--dry-run` — surveys + prints what would change; no writes.
**Apply mode**: `--apply` — atomic chunked batch writes + audit emit.

### Pseudo-flow

```
1. Init firebase-admin (FIREBASE_ADMIN_* env vars per project convention).
2. Read be_branches → find isDefault=true → DEFAULT_TARGET.
   Fallback: if no isDefault=true, alphabetically-first by name (Thai locale).
   Abort: if be_branches empty → exit 1 with "no branches to migrate to".
3. Survey legacy 'main' branchId docs across these collections:
   Branch-scoped (branchId='main'):
     be_treatments, be_sales, be_appointments, be_quotations, be_vendor_sales,
     be_online_sales, be_sale_insurance_claims, be_expenses, be_staff_schedules,
     be_promotions, be_coupons, be_vouchers, be_deposits, be_link_requests,
     be_products, be_courses, be_product_groups, be_product_unit_groups,
     be_medical_instruments, be_holidays, be_df_groups, be_df_staff_rates,
     be_bank_accounts, be_expense_categories
   Stock (locationId='main'):
     be_stock_batches, be_stock_orders, be_stock_movements, be_stock_transfers,
     be_stock_withdrawals, be_stock_adjustments
4. Survey be_branches docs with isDefault field present (any value).
5. PRINT preview:
   - X 'main' branchId docs → will move to DEFAULT_TARGET ({name}, id={id})
   - Y 'main' locationId docs (stock) → will move to DEFAULT_TARGET
   - Z be_branches docs → will have isDefault stripped
6. If --dry-run: stop. Print "DRY RUN — re-run with --apply to commit."
7. If --apply:
   - Chunk all writes into batches of <=500 ops (Firestore limit) via chunkOps500()
   - Per-batch:
     - For each legacy 'main' doc: tx.update(docRef, {branchId: target}) OR
       {locationId: target} for stock
     - For each be_branches doc with isDefault: tx.update(docRef, {isDefault: FieldValue.delete()})
   - Final batch: tx.set(audit doc with V14 maybeTruncate)
   - Sequential commits (one batch at a time; if any fails, abort + log)
   - Print final counts + audit doc id.
8. Exit 0 on success; exit 1 on any error.
```

### Audit doc shape

```js
{
  action: 'phase-17-2-remove-main-branch',
  defaultTargetId: 'BR-...',
  defaultTargetName: 'นครราชสีมา',
  migratedBranchIdCount: 47,
  migratedLocationIdCount: 12,
  strippedIsDefaultCount: 2,
  perCollectionBreakdown: {
    'be_stock_batches': 12,
    'be_promotions': 5,
    // ...
  },
  perCollectionBreakdownTruncated: false,
  dryRun: false,
  adminUid: 'caller-uid',
  ts: '2026-05-05T...Z',
}
```

### Re-run safety

Idempotent: a second run on already-migrated data finds 0 'main' docs + 0 isDefault docs → exits cleanly with summary "Nothing to migrate."

## BranchContext rewrite

### Per-user localStorage key

```js
function localStorageKey(uid) {
  return `selectedBranchId:${uid}`;
}

function readSelected(uid) {
  if (!uid) return null;
  const v = localStorage.getItem(localStorageKey(uid));
  if (v) return v;
  // Phase 17.2 graceful upgrade — read legacy unkeyed value once, migrate to new key, delete old.
  const legacy = localStorage.getItem('selectedBranchId');
  if (legacy) {
    localStorage.setItem(localStorageKey(uid), legacy);
    localStorage.removeItem('selectedBranchId');
    return legacy;
  }
  return null;
}
```

### First-login default selection

```js
function pickFirstLoginDefault({ branches, accessibleBranchIds }) {
  // Filter to accessible.
  const accessible = branches.filter(b => accessibleBranchIds.includes(b.branchId));
  if (accessible.length === 0) return null;
  // Sort by createdAt DESC (newest first).
  accessible.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return accessible[0].branchId;
}
```

### Single-branch UX

```js
function useBranchVisibility() {
  const { branches, accessibleBranchIds } = useBranchState();
  const accessible = branches.filter(b => accessibleBranchIds.includes(b.branchId));
  return {
    showSelector: accessible.length > 1,
    branches: accessible,
  };
}
```

### Hoisting BranchProvider to `App.jsx`

Currently `<BranchProvider>` is wrapped inside `<BackendDashboard>` only. Phase 17.2 moves it ONE level up:

```jsx
// src/App.jsx
function App() {
  return (
    <BranchProvider>
      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/backend" element={<BackendDashboard />} />
        {/* ... other routes ... */}
      </Routes>
    </BranchProvider>
  );
}
```

Remove the `<BranchProvider>` wrap inside `<BackendDashboard>` (becomes redundant).

### TFP `'main'` fallback removal

In `src/components/TreatmentFormPage.jsx`:
- Comment block at lines 20-24 ("Falls back to 'main' when no BranchProvider is mounted") → updated to: "Phase 17.2 — BranchProvider hoisted to App.jsx; SELECTED_BRANCH_ID always resolves to a real branch."
- Existing `useSelectedBranch()` call at line 325 stays — but its fallback semantic in BranchContext.jsx changes from `'main'` to `null` (which the rewrite handles).

## Code cleanup details

### `src/lib/branchValidation.js`

Remove `isDefault: false` from `defaultBranchForm()` (line 99) + `isDefault: !!form.isDefault` from `validateBranch()` (line 121).

### `src/lib/backendClient.js` (4 branch-context sites)

| Line | Change |
|---|---|
| 7276 | `listStockLocations`: drop `isDefault: !!b.isDefault` from returned shape |
| 7287 | Synthetic fallback `[{id:'main', name:'สาขาหลัก (main)', isDefault:true}]` → `[]` |
| 8842-8843 | `saveBranch`: drop the "uncheck other isDefault" mutual-exclusion update batch |
| 9137 | (clone helper) drop `isDefault: !!src.isDefault` |

### `src/components/backend/BranchFormModal.jsx`

Remove the entire `isDefault` checkbox JSX block around line 208 + any conditional rendering.

### `src/components/backend/BranchesTab.jsx`

Remove any `<Star>` icon / "Default" badge / row highlight that references `branch.isDefault`.

### `src/components/backend/BranchSelector.jsx`

Wire `useBranchVisibility().showSelector`; when false, render a static label instead of dropdown:

```jsx
const { showSelector, branches } = useBranchVisibility();
if (!showSelector) {
  return branches[0] ? (
    <span className="branch-static-label">สาขา: {branches[0].name}</span>
  ) : null;
}
return <SelectDropdown ... />;
```

### 6 stock panels — strip `includeLegacyMain`

In each of `StockBalancePanel`, `MovementLogPanel`, `StockAdjustPanel`, `StockTransferPanel`, `StockWithdrawalPanel`, `StockSeedPanel`:
- Remove `includeLegacyMain` opt from `listStockBatches({...})` etc. callsites
- Remove the `(b) => (b.branchId || b.id) === BRANCH_ID && b.isDefault === true` derivation logic at MovementLogPanel:110 + StockBalancePanel:169

### `src/lib/stockUtils.js`

Strip the `includeLegacyMain` helper / threading utility (whatever wires the opt through to backendClient listers).

## Deployment ordering (critical)

1. **Ship source edits FIRST** with the legacy-localStorage-key migration shim in BranchContext (`readSelected()` reads old key + migrates to new key + deletes old). Existing user sessions continue working seamlessly.
2. **Admin runs migration script** `--dry-run` → reviews → `--apply` (separate from deploy; admin-only CLI). Reads `isDefault=true` to find DEFAULT_TARGET BEFORE stripping.
3. Existing `'main'` docs migrate to current-default branch.
4. **Order matters**: script reads `isDefault=true` BEFORE the strip step. Both happen in one apply-run.

## Files to create (5)

| File | Type | Estimated LOC |
|---|---|---|
| `scripts/phase-17-2-remove-main-branch.mjs` | NEW migration script | ~200 |
| `tests/phase-17-2-branch-context-rewrite.test.jsx` | NEW RTL test | ~250 |
| `tests/phase-17-2-migration-script.test.js` | NEW pure-helper test | ~180 |
| `tests/phase-17-2-flow-simulate.test.js` | NEW Rule I test | ~200 |
| `tests/phase-17-2-app-provider-hoist.test.jsx` | NEW provider hoist test | ~80 |

## Files to modify (~12)

- `src/App.jsx` — hoist BranchProvider
- `src/lib/BranchContext.jsx` — rewrite resolver
- `src/lib/branchValidation.js` — strip isDefault
- `src/lib/backendClient.js` — 4 branch-context sites
- `src/lib/stockUtils.js` — strip includeLegacyMain helper
- `src/components/backend/BranchFormModal.jsx` — drop checkbox
- `src/components/backend/BranchesTab.jsx` — drop badge
- `src/components/backend/BranchSelector.jsx` — single-branch hide
- 6 stock panels — strip includeLegacyMain wiring
- `src/components/TreatmentFormPage.jsx` — comment + fallback cleanup

Plus post-ship updates:
- `wiki/concepts/branch-equality-no-main.md` — Status: shipped + commit SHA
- `.agents/active.md` — state update

## Test plan

Total target: ~80-120 new tests (5208 → ~5310).

### `phase-17-2-branch-context-rewrite.test.jsx` (~40 RTL tests)

Mount `<BranchProvider>` with various staff configs:
- BC1.1 — no localStorage value + 1 accessible branch → that branch auto-selected
- BC1.2 — no localStorage + multiple accessible → newest-created selected
- BC1.3 — localStorage `selectedBranchId:${uid}` set → that value used
- BC1.4 — localStorage legacy key `selectedBranchId` set, new key absent → legacy migrated to new key + new key returned + old removed
- BC1.5 — `useBranchVisibility().showSelector === false` when 1 accessible
- BC1.6 — `useBranchVisibility().showSelector === true` when 2+ accessible
- BC1.7 — switching branch writes to `selectedBranchId:${uid}` not legacy key
- BC1.8 — different uid → different localStorage key (per-user isolation)
- BC1.9-BC1.40 — adversarial: empty branches, missing createdAt fields, suspended branches, multi-tab sync, etc.

### `phase-17-2-migration-script.test.js` (~25 tests)

Pure helpers (extract from script body for testability):
- M1 — `surveyLegacyDocs(snap, branchIdField)` returns count + sample IDs
- M2 — `computeMigrationPlan(branches, legacyDocs)` returns `{target, plan: [...]}`
- M3 — `chunkOps500(ops)` chunks at 500 (Firestore batch limit)
- M4 — audit doc shape (V14 maybeTruncate)
- M5 — idempotency: surveyLegacyDocs on already-migrated data returns count: 0
- M6 — fallback: no isDefault=true → alphabetical-first picked
- M7 — abort: empty be_branches → throws
- M8-M25 — adversarial: missing fields, mixed branchId values, concurrent doc updates

### `phase-17-2-flow-simulate.test.js` (~30 tests, Rule I F1-F8)

- F1 — BranchContext source-grep: per-user uid localStorage key present
- F2 — BranchContext: NO `'main'` fallback literal
- F3 — App.jsx: `<BranchProvider>` at root
- F4 — BackendDashboard: NO `<BranchProvider>` wrap (removed)
- F5 — TFP: comment updated, no `'main'` fallback in body
- F6 — BranchValidation: NO `isDefault` field
- F7 — 6 stock panels: NO `includeLegacyMain` references
- F8 — V21 anti-regression: no `'main'` literal in branch-context paths; no `isDefault` reads in BranchFormModal/BranchesTab/BranchSelector; bank-account `isDefault` UNTOUCHED (separate concept verified)

### `phase-17-2-app-provider-hoist.test.jsx` (~10 tests)

- AP1 — render `<App />`, find `<BranchProvider>` ancestor for any descendant
- AP2 — TFP rendered from AdminDashboard overlay path → useSelectedBranch returns real value (not null/'main')
- AP3 — BackendDashboard render does NOT include duplicate `<BranchProvider>`
- AP4-AP10 — adversarial: re-mount, branch switch, single-branch user

## Risks + V-history mitigations

| Risk | Mitigation |
|---|---|
| Atomic batch >500 ops | `chunkOps500()` helper; sequential commits; abort on first failure |
| Re-run idempotency | Survey returns 0 on clean state; clean exit |
| Legacy localStorage value | One-time read-old-key-write-new-key shim in `readSelected()` |
| Customer `branchId` accidentally migrated | Spec calls out + F8 anti-regression test asserts `customer` collections NOT in script's collection list |
| Bank-account `isDefault` accidentally stripped | Spec out-of-scope + F8 anti-regression: `bankAccountValidation.js` retains `isDefault` |
| AdminDashboard overlay broken | F4 + AP2 verify TFP-from-AdminDashboard path works |
| V11 mock-shadowed export | `npm run build` mandatory |
| V12 multi-reader sweep | F6 + F7 source-grep across all readers |
| V14 undefined leaves | Audit doc V14 maybeTruncate |
| V18 deploy auth roll-over | Phase 17.2 commit waits for explicit "deploy" |
| V21 source-grep lock-in | RTL tests verify runtime BranchContext behavior |
| Single-branch admin add-2nd-branch | BranchContext useEffect deps include `branches` length → re-renders + selector reappears |

## Verification (Rule I item b)

- `npm test -- --run` → ~5310 pass
- `npm run build` → clean
- preview_eval READ-ONLY on dev: switch branches, verify localStorage key contains uid; clear localStorage → verify newest-default selected; verify single-branch user sees no dropdown
- Migration script `--dry-run` against prod (read-only) → review counts → wait for explicit user authorization to run `--apply`

## Anti-patterns to avoid

- **DO NOT** touch bank-account `isDefault` (separate concept)
- **DO NOT** touch customer `branchId` (immutable patient-home-branch)
- **DO NOT** add Firestore-based cross-device persistence in v1 (deferred)
- **DO NOT** keep `includeLegacyMain` opt as no-op (locked: full removal per Q5)
- **DO NOT** keep `isDefault` as deprecated tombstone (locked: full strip per Q4)
- **DO NOT** auto-trigger the migration script as part of the deploy (admin runs separately, audit-traceable)

## Success criteria

- [ ] Migration script `--dry-run` surveys + counts correctly
- [ ] Migration script `--apply` migrates `'main'` docs + strips `isDefault` atomically + emits audit
- [ ] Re-run script reports 0 changes (idempotent)
- [ ] BranchContext uses per-user uid localStorage key
- [ ] First-login default = newest-created accessible branch
- [ ] Single-branch user sees no BranchSelector
- [ ] App.jsx has BranchProvider; BackendDashboard does NOT
- [ ] TFP no longer references `'main'`
- [ ] BranchFormModal has no `isDefault` checkbox
- [ ] BranchesTab has no star/badge
- [ ] 6 stock panels: no `includeLegacyMain` references
- [ ] Customer `branchId` UNTOUCHED (verified)
- [ ] Bank-account `isDefault` UNTOUCHED (verified)
- [ ] All 4 test files green
- [ ] `npm test -- --run` passes (~5310)
- [ ] `npm run build` clean
- [ ] Single bundled commit per Rule K
- [ ] No deploy without explicit "deploy"

## Implementation order (Rule K work-first test-last)

1. Migration script `scripts/phase-17-2-remove-main-branch.mjs` (NEW)
2. BranchContext.jsx rewrite (per-user key + newest-default + single-branch helper + legacy-key shim)
3. App.jsx hoist BranchProvider; remove from BackendDashboard
4. branchValidation.js + backendClient.js 4 sites — strip isDefault
5. BranchFormModal + BranchesTab + BranchSelector cleanup
6. 6 stock panels + stockUtils.js — strip includeLegacyMain
7. TFP comment + fallback cleanup
8. Review structure across all edits
9. Test bank — 4 files batch
10. `npm test -- --run` + `npm run build`
11. preview_eval read-only verify on dev
12. Commit + push (single bundled per Rule K)
13. Wiki post-ship update + `.agents/active.md`
14. Migration script `--dry-run` against prod (admin-only, after deploy auth)
