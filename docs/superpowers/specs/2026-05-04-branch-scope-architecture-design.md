# Branch-Scope Architecture (BSA) — Design Spec

**Date**: 2026-05-04
**Author**: Claude Opus 4.7 (1M ctx) + user (oomz.peerapat@gmail.com)
**Status**: DRAFT — pending user review
**Related rules**: Phase BS, Phase BS V2, Rule H (data ownership), Rule H-quater (no master_data reads), V36.G.51 (no React leak in data layer)
**Related sessions**: Phase BS / Phase BS V2 (commits `83d8413`, `cf897f6`)

---

## 1. Problem Statement

The clinic now runs multiple branches (current: นครราชสีมา default + พระราม 3). Top-right `BranchSelector` switches the active `branchId`. Every read/write/listener that touches branch-scoped data must respect this selection — but today only **partial** wiring exists:

- **Writes** ✅ — Phase BS V2 centralized stamping via `_resolveBranchIdForWrite(data)` in `backendClient.js`. New docs auto-stamp current branch; edits preserve existing.
- **One-shot reads** ⚠️ — 12 listers accept `{branchId, allBranches}` opt-args, but **callsites must pass `branchId` manually**. Forgetting = falls back to "no filter" = returns docs from all branches (effectively the dominant branch in the data — นครราชสีมา today).
- **Live listeners** ⚠️ — `listenToAppointmentsByDate` + `listenToAllSales` accept opts (Phase BS V2 commit `aecf3a1`). But components must explicitly add `branchId` to `useEffect` deps to re-subscribe on branch switch — not enforced.
- **Drift / bypass** ❌ — `getAllMasterDataItems('products'|'courses'|'staff'|'doctors')` reads `master_data/*` (Rule H-quater violation, no branch awareness). TFP uses this on every load → branch switch has no effect on the courses/products/DF rates the form shows. **Concrete bug reported 2026-05-04**: select พระราม 3 → open TreatmentForm → all data still pulled from นครราชสีมา.

### Bug class to eliminate

**Any data path in UI code that returns docs from a non-selected branch when the user has clearly chosen a branch.**

This includes:
1. New callsite forgetting `{branchId}` → silently wrong
2. Snapshot listener not re-subscribing on branch change → stale until F5
3. Direct `master_data/*` read bypassing the be_* layer (H-quater violation)
4. Server endpoint reading collections without honoring caller's `branchId`

### Out of scope

- **Server endpoint scope** — `api/admin/*` + `api/proclinic/*` already accept `branchId` from request body where applicable; treated as an existing concern, not part of BSA.
- **Hard-gate via Firestore rules `request.auth.token.branchIds`** — deferred (per `.agents/active.md` outstanding); soft-gate (Phase BS V1) covers user visibility today.
- **Cross-branch report aggregation** — already supported via `{allBranches: true}` opt-out; BSA preserves this.

---

## 2. Architecture — Three Layers + Audit

### Section 2.1 — Layer 1: `backendClient.js` (raw, parameterized) — UNCHANGED

- Full API surface remains as-is.
- Branch-scoped listers continue to accept `{branchId, allBranches}` opts.
- Writes continue to call `_resolveBranchIdForWrite(data)` internally.
- **Allowed importers**: tests, server endpoints (`api/**`), reports that need cross-branch data, migration scripts, `MasterDataTab.jsx` (sanctioned dev-only), `cloneOrchestrator.js`.
- **Forbidden importers**: UI components in `src/components/**` (except whitelist below). New `/audit-branch-scope` skill enforces.

### Section 2.2 — Layer 2: `scopedDataLayer.js` (NEW) — module wrapper

Single file at `src/lib/scopedDataLayer.js`. Re-exports every backendClient function with one of three semantics:

#### (a) Branch-scoped one-shot listers — auto-inject

```js
import * as raw from './backendClient.js';
import { resolveSelectedBranchId } from './branchSelection.js';

// Reads localStorage at every CALL — picks up branch switches automatically.
export const listProducts = (opts = {}) =>
  raw.listProducts({ branchId: resolveSelectedBranchId(), ...opts });
// Caller can override: scopedDataLayer.listProducts({ allBranches: true })
//                  or scopedDataLayer.listProducts({ branchId: 'BR-other' })
```

Coverage (12 listers per Phase BS V2):
- `listProductGroups`, `listProductUnitGroups`, `listMedicalInstruments`, `listHolidays`
- `listProducts`, `listCourses`
- `listDfGroups`, `listDfStaffRates`
- `listBankAccounts`, `listExpenseCategories`, `listExpenses`
- `listStaffSchedules`

Plus collections newly classified in this design (Layer 1 already accepts `{branchId}` — wrapper just auto-injects):
- `getAllSales`, `getAppointmentsByDate(dateStr, opts)`, `getAppointmentsByMonth(yearMonth, opts)` (positional + opts; wrapper preserves the positional shape and only enriches `opts`)
- `listStockBatches({productId, branchId, status, includeLegacyMain})` (auto-inject `branchId`; rest of opts pass through)
- `listStockOrders({branchId, status})`

**Layer 1 extensions required FIRST** (then wrapper):
- `listPromotions` / `listCoupons` / `listVouchers` — currently no `{branchId}` arg. Add `{branchId, allBranches}` matching Phase BS V2 pattern; doc-level `allBranches:true` field merged into the where-clause: `where('branchId','==', current) OR where('allBranches','==', true)` via two queries + client-side merge (Firestore can't OR in a single query). Then wrap.
- `listOnlineSales` / `listSaleInsuranceClaims` / `listVendorSales` / `listQuotations` — add `{branchId, allBranches}`. Then wrap.
- `listExpenses` already has `{branchId, allBranches}` (Phase BS V2) ✅

**Tier-scoped (NOT branch-scoped, special handling)** — `locationId` vs `branchId`:
- `listStockTransfers({locationId, status, includeAll})` — `locationId` is a stock-tier identifier (branchId for branch tier OR centralWarehouseId for central tier). Wrapper auto-injects `locationId = resolveSelectedBranchId()` ONLY when caller doesn't pass one AND is not in central tier context. Central panels (CentralStockTab) explicitly pass centralWarehouseId — bypass injection.
- `listStockWithdrawals({locationId, status})` — same as transfers.
- `listStockMovements(filters)` — filters object passed through; wrapper auto-injects `branchId` if not present.
- `listCentralStockOrders` / `listCentralWarehouses` / `listStockLocations` — universal across central tier; **no branch injection**. Re-export raw via category (b).

#### (b) Universal collections — re-export raw, no scope

```js
export const listStaff = raw.listStaff;
export const listDoctors = raw.listDoctors;
export const listBranches = raw.listBranches;
export const listPermissionGroups = raw.listPermissionGroups;
export const listDocumentTemplates = raw.listDocumentTemplates;
// Customer-attached (universal — patient may visit multiple branches):
export const getCustomer = raw.getCustomer;
export const getAllCustomers = raw.getAllCustomers;
export const getCustomerWallets = raw.getCustomerWallets;
export const getCustomerMembership = raw.getCustomerMembership;
export const getPointBalance = raw.getPointBalance;
export const getPointTransactions = raw.getPointTransactions;
export const listMembershipTypes = raw.listMembershipTypes;
export const listWalletTypes = raw.listWalletTypes;
// Audit / system:
export const listenToUserPermissions = raw.listenToUserPermissions;
// Audiences (filter customers globally — not branch-bound):
export const listAudiences = raw.listAudiences;
```

#### (c) Writes — re-export raw (Phase BS V2 stamping is server-side)

```js
export const saveProduct = raw.saveProduct;     // _resolveBranchIdForWrite stamps internally
export const saveCourse = raw.saveCourse;
export const saveDfGroup = raw.saveDfGroup;
// ... all save/delete fns re-exported unchanged
// Universal collection writes also pass through unchanged
export const saveStaff = raw.saveStaff;
export const saveDoctor = raw.saveDoctor;
```

#### (d) Special-case helpers

```js
// listStaffByBranch — already takes {branchId}; auto-inject
export const listStaffByBranch = (opts = {}) =>
  raw.listStaffByBranch({ branchId: resolveSelectedBranchId(), ...opts });

// listAllSellers — branch-scoped per Phase BS
export const listAllSellers = (opts = {}) =>
  raw.listAllSellers({ branchId: resolveSelectedBranchId(), ...opts });

// listenTo* — handled by Layer 3 hook (NOT re-exported here — would be misleading)
```

**`getAllMasterDataItems` is INTENTIONALLY NOT re-exported.** Callers using it in UI code must migrate to be_* via the appropriate `listX()`. After migration the function is deleted from `backendClient.js`.

### Section 2.3 — Layer 3: React hooks for live data

NEW file `src/hooks/useBranchAwareListener.js`:

```js
import { useEffect, useRef } from 'react';
import { useSelectedBranch } from '../lib/BranchContext.jsx';

/**
 * Generic wrapper around any `listenToX(opts, onChange, onError)` from backendClient.
 * Handles: (a) reading current branchId, (b) injecting it into opts, (c) re-subscribing
 * when branchId changes, (d) cleanup on unmount.
 *
 * Usage:
 *   useBranchAwareListener(listenToAllSales, { startDate, endDate }, setSales, setError);
 *   useBranchAwareListener(listenToAppointmentsByDate, dateStr, setAppts, setError);
 *
 * For listeners with a positional first arg (dateStr, customerId), pass it as `args` directly:
 *   useBranchAwareListener(listenToCustomerSales, customerId, setSales);  // customer-scoped, branchId IGNORED
 *
 * Universal-listener path: when listenerFn is universal (e.g. listenToCustomer), the hook
 * detects via fn.__universal__ marker (set on raw.listenToCustomer = Object.assign(fn, {__universal__:true}))
 * and skips branchId injection. Avoids re-subscribe storms when only branchId changes.
 */
export function useBranchAwareListener(listenerFn, args, onChange, onError) {
  const { branchId } = useSelectedBranch();
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!listenerFn) return;
    const isUniversal = listenerFn.__universal__ === true;
    const enrichedArgs =
      typeof args === 'object' && !Array.isArray(args) && !isUniversal
        ? { ...args, branchId }
        : args;
    const unsub = listenerFn(
      enrichedArgs,
      (data) => onChangeRef.current?.(data),
      (err) => onErrorRef.current?.(err)
    );
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenerFn, branchId, JSON.stringify(args)]);
}
```

Live listener inventory + classification:

| Listener | Scope | Notes |
|---|---|---|
| `listenToAppointmentsByDate` | branch | already takes opts; hook injects branchId |
| `listenToAllSales` | branch | already takes opts |
| `listenToHolidays` | branch | already takes opts |
| `listenToScheduleByDay` | branch | needs opts arg refactor (currently positional staffIdsFilter) |
| `listenToCustomer` | universal | mark `__universal__` |
| `listenToCustomerTreatments` | universal (customer-attached) | mark `__universal__` |
| `listenToCustomerAppointments` | universal | mark `__universal__` |
| `listenToCustomerSales` | universal | mark `__universal__` |
| `listenToCustomerFinance` | universal | mark `__universal__` |
| `listenToCourseChanges` | universal | mark `__universal__` |
| `listenToAudiences` | universal | mark `__universal__` |
| `listenToUserPermissions` | universal | mark `__universal__` |

### Section 2.4 — `/audit-branch-scope` skill (NEW) — invariants

Located at `.agents/skills/audit-branch-scope/SKILL.md`. Greppable invariants (BS-1 through BS-8):

**BS-1**: No UI component imports `backendClient.js` directly.
- Grep: `^import .* from ['"]\.\.+/lib/backendClient` in `src/components/**`, `src/pages/**`, `src/hooks/**`
- Exceptions whitelist (sanctioned): `MasterDataTab.jsx` (dev-only sync), `BackendDashboard.jsx` (root composition), report tabs that need `{allBranches:true}` (file-level annotation comment `// audit-branch-scope: report — uses allBranches=true`)

**BS-2**: No `master_data/*` read in feature code (Rule H-quater enforcement).
- Grep: `'master_data/'` in `src/**` minus MasterDataTab + migrators
- Grep: `getAllMasterDataItems\(` anywhere → must be 0 occurrences after migration

**BS-3**: `getAllMasterDataItems` removed from `backendClient.js` exports.
- Grep: `^export async function getAllMasterDataItems` → must be 0

**BS-4**: Every `listenTo*` callsite in components uses `useBranchAwareListener` (or has explicit `// audit-branch-scope: customer-scoped` annotation for customer-attached listeners).
- Grep: `listenTo[A-Z]\w+\(` in `src/components/**` → match against callsite to verify hook usage

**BS-5**: Every Firestore collection in `firestore.rules` is classified in `tests/branch-collection-coverage.test.js` `COLLECTION_MATRIX` with `scope: 'branch' | 'universal' | 'branch-spread' | 'global'`.
- Test asserts unclassified collection = build fail (existing test — extend with new collections).

**BS-6**: Flow-simulate test exists at `tests/branch-scope-flow-simulate.test.js`.
- Test mocks localStorage with branch A → calls `scopedDataLayer.listProducts()` → asserts `{branchId:A}` passed.
- Test switches localStorage to branch B → calls again → asserts `{branchId:B}` passed.
- Test asserts `useBranchAwareListener` re-subscribes on branchId change.
- Test asserts universal listers ignore branch switch (return same data).

**BS-7**: Universal collection re-exports in `scopedDataLayer.js` match the universal classification in `branch-collection-coverage.test.js`.
- Cross-file consistency check.

**BS-8**: All current Phase BS V2 writers continue to use `_resolveBranchIdForWrite`.
- Grep: every `branchId: _resolveBranchIdForWrite(data)` line preserved.

---

## 3. Data Flow

### Section 3.1 — Read path (one-shot)

```
Component (TFP, etc.)
  └─ import { listCourses } from '../lib/scopedDataLayer.js'
     └─ scopedDataLayer.listCourses()
        └─ resolveSelectedBranchId()  ← reads localStorage 'selectedBranchId'
        └─ raw.listCourses({ branchId: <current>, allBranches: false })
           └─ Firestore query(coursesCol, where('branchId','==', <current>))
              └─ filtered docs returned
```

Switch branch via `BranchSelector` → `selectBranch(newId)` → localStorage updated → next call to `listCourses()` automatically uses new id. **No callsite refactor needed** beyond changing the import path.

**React lifecycle nuance** — wrapper auto-inject only runs on each CALL. If a component loads data via `useEffect(() => { loadData() }, [])` (empty deps), branch switch while the component stays mounted will NOT re-fetch. Two acceptable patterns:

1. **Re-mount on branch change** — component is stateless across mounts (TFP, modal forms). User switching branch typically navigates away and back → component re-mounts → useEffect fires with current branchId. **This covers the user-reported TFP bug** (open TFP after selecting branch = correct data).
2. **Add `branchId` to useEffect deps** — for persistent dashboard tabs that stay mounted across branch switches (AppointmentTab, SaleTab, FinanceTab, etc.). Use `const { branchId } = useSelectedBranch()` + add to deps. For live listeners (the dominant pattern in dashboards), `useBranchAwareListener` (Section 2.3) does this automatically.

Audit BS-9 (deferred to follow-up if false-positive rate high): grep for `useEffect.*list[A-Z]\w+\(.*\).*\[\]` in components that import branch-scoped listers from `scopedDataLayer.js` — flag as "missing branchId dep, add or use useBranchAwareListener". Manual review of report tabs that intentionally use `{allBranches:true}` (annotated with comment).

### Section 3.2 — Read path (live listener)

```
Component
  └─ useBranchAwareListener(listenToAllSales, { startDate }, setSales, setError)
     └─ useEffect deps: [listenerFn, branchId, JSON.stringify(args)]
        ├─ on mount: branchId = A → listenerFn({startDate, branchId:A}, ...) → unsub_A
        ├─ on branch switch: branchId = B
        │  └─ useEffect cleanup: unsub_A()  ← detach old listener
        │  └─ re-run: listenerFn({startDate, branchId:B}, ...) → unsub_B
        └─ on unmount: unsub_B()
```

### Section 3.3 — Write path (UNCHANGED — Phase BS V2)

```
Component
  └─ scopedDataLayer.saveCourse(id, data)  ← re-export of raw.saveCourse
     └─ raw.saveCourse(id, data)
        └─ setDoc({ ...normalized, branchId: _resolveBranchIdForWrite(data) })
           ├─ if data.branchId set → preserve (edit case)
           └─ else → resolveSelectedBranchId() → current selection
```

### Section 3.4 — Universal read path

```
Component
  └─ scopedDataLayer.listStaff()  ← straight re-export, no branch logic
     └─ raw.listStaff() → all staff docs
        └─ component applies soft-gate (filterStaffByBranch via staff.branchIds[]) if needed
```

The soft-gate (`filterStaffByBranch`, `filterDoctorsByBranch`) remains a **component-level** decision because it's a visibility filter, not a data-ownership filter. Phase BS V1 design preserved.

---

## 4. Error Handling

### Section 4.1 — `branchSelection.resolveSelectedBranchId()` failure modes

- **localStorage unavailable** (SSR, sandbox) → returns `'main'` (FALLBACK_ID, V20 single-branch contract).
- **Empty localStorage** (first run before BranchProvider mounts) → returns `'main'` → matches legacy single-branch behavior.
- **Stale branchId** (admin deleted the branch while user's localStorage retained id) → `BranchProvider`'s onSnapshot detects (V36 fallback) + re-resolves to default. `resolveSelectedBranchId` returns the stale id once before the re-resolve commits to localStorage; resulting query returns 0 docs (acceptable transient state).

### Section 4.2 — Listener re-subscribe failure

If `listenerFn` throws synchronously when called with a new branchId (e.g. invalid arg):
- `useBranchAwareListener` does NOT catch — error propagates to React error boundary.
- `onErrorRef.current?.(err)` only fires for async errors (Firestore permission denied, etc.).
- Caller responsibility: pass an `onError` to surface user-facing message ("ไม่สามารถโหลดข้อมูลสาขานี้").

### Section 4.3 — Cross-branch query opt-out validation

- Caller passes `{allBranches: true}` → wrapper preserves it (spread-after-default).
- Caller passes `{branchId: 'BR-X', allBranches: true}` → ambiguous but spec: `allBranches` wins (matches raw lib semantics).
- Caller passes `{branchId: undefined}` explicitly → falls back to `resolveSelectedBranchId()` (treat as "no override").

### Section 4.4 — Test environment

- Vitest setup auto-mocks `localStorage` to empty by default → `resolveSelectedBranchId` returns `'main'`.
- Tests that need a specific branch: `window.localStorage.setItem('selectedBranchId', 'BR-test')` before calling.
- Integration tests for branch-switching: helper `setTestBranch(id)` in `tests/helpers/branch.js`.

---

## 5. Testing Strategy

### Section 5.1 — Unit tests (per-layer)

**Layer 1 (existing)** — `tests/backend-client.test.js` etc. — no changes; existing 4744 tests must remain green.

**Layer 2 — `tests/scopedDataLayer.test.js` (NEW, ~30 tests)**:
- BS2.1: every branch-scoped lister auto-injects from localStorage (12 listers × 1 = 12 tests)
- BS2.2: every universal re-export passes args unchanged (8 tests)
- BS2.3: opt-out `{allBranches:true}` works on every wrapper (1 universal sanity test + 5 representative listers)
- BS2.4: caller-passed `{branchId: 'X'}` overrides resolved (1 test)
- BS2.5: localStorage absence → falls through to FALLBACK_ID (1 test)
- BS2.6: NO React import (V36.G.51 lock — pure JS module) (1 test, source-grep)

**Layer 3 — `tests/useBranchAwareListener.test.jsx` (NEW, ~20 tests)**:
- BS3.1: listener subscribes on mount with current branchId
- BS3.2: branch switch → cleanup + re-subscribe
- BS3.3: universal listener (marked `__universal__`) does NOT re-subscribe on branch switch
- BS3.4: args change → re-subscribe (deps via JSON.stringify)
- BS3.5: unmount → cleanup
- BS3.6: onChange/onError refs update without re-subscribe
- BS3.7-12: positional-arg listeners (customerId, dateStr) work without branchId injection
- BS3.13-20: error paths + edge cases

### Section 5.2 — Flow-simulate (Rule I, mandatory)

`tests/branch-scope-flow-simulate.test.js` — chain switch + read + write, asserts each stage:

- F1: localStorage = นครราชสีมา → `scopedDataLayer.listProducts()` → query.where('branchId','==','นครราชสีมา id')
- F2: localStorage switches to พระราม 3 → next `listProducts()` call → query updates
- F3: `scopedDataLayer.saveProduct(id, data)` → `_resolveBranchIdForWrite(data)` → stamps พระราม 3
- F4: TFP load path simulate — replace `getAllMasterDataItems` with `listCourses()/listProducts()` → asserts H-quater compliance + correct branch
- F5: live listener — switch branch mid-effect → unsubscribe count + new subscribe count both increment by 1
- F6: universal collection — `listStaff()` returns same shape regardless of branch
- F7: `{allBranches:true}` opt-out — works for representative reports
- F8: adversarial — empty localStorage + invalid branch + race (rapid branch switches)
- F9: source-grep regression — no UI file imports `backendClient` (BS-1), no `master_data/` reads (BS-2), no `getAllMasterDataItems` (BS-3)

### Section 5.3 — preview_eval verification

Per Rule I (b) — non-negotiable for branch paths:
- Dev server live → switch branch via top-right selector
- preview_eval calls `scopedDataLayer.listCourses()` and asserts result count matches expected branch
- preview_eval verifies the bug user reported (TFP open → courses match selected branch)
- preview_eval switches mid-flow + verifies snapshot listener detached + reattached

### Section 5.4 — Audit skill `/audit-branch-scope` (BS-1 to BS-8 invariants)

`.agents/skills/audit-branch-scope/SKILL.md` + `.agents/skills/audit-branch-scope/patterns.md`. Pattern:
- Each invariant has a `Grep` recipe + expected output (0 violations)
- Skill output: punch list of violations OR "BS1-BS8 ✅ all green"
- Registered in `/audit-all` Tier 1 (release-blocking)

---

## 6. Migration Plan (single round, ordered commits)

| Step | Commit | Files | Tests | Notes |
|---|---|---|---|---|
| 0 | `refactor(bsa-prep): extend Layer 1 listers w/ {branchId, allBranches}` | `backendClient.js` — listPromotions/Coupons/Vouchers/OnlineSales/SaleInsuranceClaims/VendorSales/Quotations | +14 Layer 1 unit tests | promotions/coupons/vouchers need 2-query OR-merge for `allBranches:true` field; mark with `// audit-branch-scope: BS-2 OR-field` |
| 1 | `feat(bsa): scopedDataLayer.js + branchSelection re-exports` | new `src/lib/scopedDataLayer.js` | +30 (BS2.*) | mechanical wrap of 30+ listers |
| 2 | `feat(bsa): useBranchAwareListener hook` | new `src/hooks/useBranchAwareListener.js` | +20 (BS3.*) | universal-marker on listenToCustomer*; listenToScheduleByDay needs opts-arg refactor |
| 3 | `refactor(bsa): UI imports → scopedDataLayer (84 files)` | mechanical sed of imports | green (Layer 1 unchanged) | report tabs annotated `// audit-branch-scope: report` |
| 4 | `fix(tfp-h-quater): replace getAllMasterDataItems with listX()` | `TreatmentFormPage.jsx` + any other consumers | +10 H-quater regression guards | resolves the user-reported bug |
| 5 | `refactor(bsa): live listeners → useBranchAwareListener` | ~10 components (AppointmentTab/SaleTab/etc.) | covered in BS3 | listenToScheduleByDay needs opts-arg refactor |
| 6 | `feat(bsa): /audit-branch-scope skill (BS-1 to BS-8)` | new skill files + register in /audit-all | self-tests on the skill | |
| 7 | `test(bsa): branch-scope-flow-simulate (F1-F9)` | `tests/branch-scope-flow-simulate.test.js` | +20 (F1-F9) | per Rule I |
| 8 | `chore(bsa): remove getAllMasterDataItems export` | `backendClient.js` line ~3140 | confirm 0 callers | final lock-in |
| 9 | `docs(rules): Rule BSA + V-entry` | `.claude/rules/00-session-start.md` Rule BSA | — | institutional memory |

**Estimated cost**: ~6-8h. Tests: 4744 → ~4824 (+80).

**Rollback path** — every step is incremental + reverts cleanly via `git revert`. Layer 1 unchanged means revert never breaks existing flows.

---

## 7. Open Questions / User Confirmations

User has confirmed (this session):
- ✅ Universal scope: พนักงาน + สิทธิ์ + แพทย์ + เทมเพลต + สาขา + ตั้งค่า + Sync + **ลูกค้า + customer-attached subcollections**
- ✅ Server endpoints stay parameterized as-is — BSA scope is UI only
- ✅ Live listener migration in same round

Defaulted by spec (user override needed if wrong):
- 🟡 `be_promotions` / `be_coupons` / `be_vouchers` → branch-scoped + opt-in `allBranches:true` field on doc
- 🟡 `be_audiences` → universal (filter customers globally)
- 🟡 `be_quotations` → branch-scoped (event at a branch)
- 🟡 `be_vendor_sales` / `be_online_sales` / `be_sale_insurance_claims` → branch-scoped
- 🟡 `be_admin_audit` → universal
- 🟡 `be_course_changes` → universal (customer-attached)
- 🟡 `be_link_requests` → branch-scoped (Phase BS V2 already)

---

## 8. Anti-Patterns (locked by audit + V-entry)

- **DO NOT** add new branch-scoped lister to `backendClient.js` without exporting via `scopedDataLayer.js`.
- **DO NOT** import from `backendClient.js` in `src/components/**` — use `scopedDataLayer.js`.
- **DO NOT** call `getAllMasterDataItems` (deleted post-migration).
- **DO NOT** use raw `useEffect` + `listenTo*` without `useBranchAwareListener` for branch-scoped listeners.
- **DO NOT** read `master_data/*` in feature code (Rule H-quater).
- **DO NOT** weaken `firestore.rules` to "fix" a query — fix the query/scope instead.

---

## 9. Success Criteria

After BSA ships:
1. Switching branch via top-right selector → TFP, SaleTab, AppointmentTab, all reports, all master-data tabs immediately reflect the new branch.
2. Adding a new component that imports `backendClient` directly fails build (audit BS-1).
3. Adding a new branch-scoped collection without classifying it in `branch-collection-coverage.test.js` fails build (existing BC1.1 + new BS-7).
4. Adding a `master_data/*` read in feature code fails build (audit BS-2).
5. Branch switch with active listener does NOT require F5 — listener auto-resubscribes within 1 React render.
6. Tests: 4744 → ~4824, full green, build clean.
7. Production: 1 deploy (Vercel + firebase rules unchanged → idempotent rules deploy still mandatory per V15).

---

**Next step**: user reviews this spec; on approval, invoke `writing-plans` skill to break Migration Plan section 6 into TDD-style tasks with verification gates.
