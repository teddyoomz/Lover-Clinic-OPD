# Plan: V52 Report Tabs Branch-Scope (BS-11)

> Spec: `docs/superpowers/specs/2026-05-08-report-tabs-branch-scope-design.md`
> Status: Approved (user pre-authorized)
> Implementation date: 2026-05-08

This plan executes per-file with autonomous decisions (user said "ไม่ต้องถามอะไรผมเลย เลือกที่นาย recommend ทั้งหมด").

---

## Phase 1 — Foundation: `reportsLoaders.js`

Add `branchId` param (and `allBranches` opt-out) to 7 loaders in `src/lib/reportsLoaders.js`.

### Pattern

For each Firestore-query loader, the pattern is:

```js
export async function loadXxxByDateRange({ from = '', to = '', branchId = '', allBranches = false } = {}) {
  try {
    const conds = [];
    if (from) conds.push(where('dateField', '>=', from));
    if (to) conds.push(where('dateField', '<=', to));
    // V52 (BS-11): branch filter at Firestore-query level when caller provides it
    if (!allBranches && branchId) conds.push(where('branchId', '==', branchId));
    const q = conds.length > 0
      ? query(col(), ...conds, orderBy('dateField', 'desc'))
      : query(col(), orderBy('dateField', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch {
    // Fallback when composite index hasn't built yet — client-side filter
    const snap = await getDocs(col());
    let items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (from) items = items.filter(x => (x.dateField || '') >= from);
    if (to) items = items.filter(x => (x.dateField || '') <= to);
    if (!allBranches && branchId) items = items.filter(x => x.branchId === branchId);
    items.sort(...);
    return items;
  }
}
```

### Per-loader changes (7 total)

| Loader | branchId field | Filter mode | Notes |
|---|---|---|---|
| `loadSalesByDateRange` | `branchId` on be_sales | Firestore-where (fast path) + client fallback | Composite index may need rebuild; fallback covers gap |
| `loadAppointmentsByDateRange` | `branchId` on be_appointments | Firestore-where + client fallback | Same |
| `loadAllCustomersForReport` | `branchId` on be_customers | Client filter only (no date filter exists) | Add `branchId` + `allBranches` opt; preserve sort |
| `loadExpensesByDateRange` | `branchId` on be_expenses | Firestore-where + client fallback | Already supports `branchIds` (array) for expense-report; add `branchId` (single) too — when both passed, `branchIds` wins |
| `loadSaleInsuranceClaimsByDateRange` | `branchId` on be_sale_insurance_claims | Firestore-where + client fallback | Same pattern |
| `loadTreatmentsByDateRange` | `branchId` on be_treatments | Client filter (no Firestore index — function already does full-collection read) | Add branchId to existing client-side filter chain |
| `loadStockMovementsByDateRange` | `branchId` on be_stock_movements | Client filter (function does full-collection read) | Add branchId param |

Loaders that already support `branchId` (no change):
- `loadStockBatches({ branchId })` ✓
- `loadAllStockBatchesForReport({ branchId })` ✓

### Edge case: `loadExpensesByDateRange` already used by `expenseReportAggregator`

ExpenseReport's hook (`useExpenseReport`) builds a filter object with `branchIds: [array]` (multi-select) and passes the whole filter to `expenseReportAggregator`. The aggregator filters internally. The loader does NOT see `branchIds`.

V52 keeps that contract: `loadExpensesByDateRange` accepts `branchId` (single, NEW) AND `branchIds` (array — for future use; not yet used). The aggregator's `branchIds` array filtering remains in-aggregator. New behavior: when `branchId` is passed alone (single-branch view), filter at Firestore level (faster).

When `expense-report` calls `loadExpensesByDateRange` (which it does internally via `useExpenseReport`), the `useExpenseReport` hook stays unchanged for V52 — it pre-fetches all expenses and does the filtering in the aggregator. NO V52 change to ExpenseReport functionality. Just the param accepts `branchId` for callers that want it.

---

## Phase 2 — Per-tab updates (13 broken tabs)

### Canonical change shape per tab

**Add 1 import line:**
```js
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';
```

**Add 1 hook call (top of component body, before useState):**
```js
const { branchId: selectedBranchId } = useSelectedBranch();
```

**Modify load* call sites — add `branchId: selectedBranchId`:**
```js
loadSalesByDateRange({ from, to, includeCancelled, branchId: selectedBranchId })
```

**Modify useEffect / useCallback deps — add `selectedBranchId`:**
```js
useEffect(() => { ... }, [from, to, /* ... */, selectedBranchId, reloadKey]);
```

**Strip stale top-of-file annotation if present:**
```js
// audit-branch-scope: report — uses {allBranches:true} for cross-branch aggregation  ← REMOVE
```

**Add new top-of-file marker (above existing module comment):**
```js
// V52 (2026-05-08, BS-11) — branch-scoped per top-right BranchSelector.
```

### Per-tab specific notes

#### 2.1 SaleReportTab.jsx
- Loaders: `loadSalesByDateRange` + `loadAllCustomersForReport` + `loadSaleInsuranceClaimsByDateRange`
- All 3 get `branchId: selectedBranchId`
- Note: `loadSaleInsuranceClaimsByDateRange({})` passes empty object (no date filter — claim could be filed AFTER sale). After V52: pass `{ branchId: selectedBranchId }`. Claims have a branchId field on the doc (per existing schema).
- Deps: `[from, to, includeCancelled, selectedBranchId, reloadKey]`

#### 2.2 CustomerReportTab.jsx
- Loaders: `loadAllCustomersForReport` + `loadSalesByDateRange({})`
- `loadAllCustomersForReport({ branchId: selectedBranchId })` — narrow customer list to branch
- `loadSalesByDateRange({ branchId: selectedBranchId })` — narrow sales (date filter happens in aggregator, not here)
- Deps: `[selectedBranchId, reloadKey]`

#### 2.3 AppointmentReportTab.jsx
- Loaders: `loadAppointmentsByDateRange` + `loadAllCustomersForReport`
- Strip stale `// audit-branch-scope: report — uses {allBranches:true}` line 1
- Switch `import { listAllSellers } from '../../../lib/backendClient.js'` → `from '../../../lib/scopedDataLayer.js'`
- Deps: `[from, to, selectedBranchId, reloadKey]`

#### 2.4 StockReportTab.jsx
- Loader: `loadAllStockBatchesForReport` (already accepts branchId) + `listProducts`
- Strip stale annotation
- Pass `branchId: selectedBranchId` to `loadAllStockBatchesForReport`
- Switch `listProducts` import to scopedDataLayer
- Deps: `[selectedBranchId, reloadKey]`

#### 2.5 CRMInsightTab.jsx
- Loaders: `loadSalesByDateRange({})` + `loadAllCustomersForReport()`
- Pass `branchId: selectedBranchId` to both
- Deps: `[selectedBranchId, reloadKey]`

#### 2.6 RevenueAnalysisTab.jsx
- Loaders: `loadSalesByDateRange` + `listCourses`
- Strip stale annotation
- Switch `listCourses` from backendClient → scopedDataLayer
- Deps: `[from, to, selectedBranchId, reloadKey]`

#### 2.7 AppointmentAnalysisTab.jsx
- Loaders: `loadAppointmentsByDateRange` + `loadSalesByDateRange` + `listAllSellers`
- Strip stale annotation
- Switch `listAllSellers` → scopedDataLayer
- Deps: `[from, to, selectedBranchId, reloadKey]`

#### 2.8 DailyRevenueTab.jsx
- Loader: `loadSalesByDateRange`
- Pass `branchId: selectedBranchId`
- Deps: `[from, to, selectedBranchId, reloadKey]`

#### 2.9 StaffSalesTab.jsx
- Loaders: `loadSalesByDateRange` + `listStaff` + `listDoctors`
- Strip stale annotation
- Switch `listStaff/listDoctors` → scopedDataLayer (universal pass-through; consistency)
- Deps: `[from, to, selectedBranchId, reloadKey]`

#### 2.10 PnLReportTab.jsx
- Loaders: `loadSalesByDateRange` + `loadExpensesByDateRange`
- Pass `branchId: selectedBranchId` to both
- Deps: `[from, to, selectedBranchId, reloadKey]`

#### 2.11 DfPayoutReportTab.jsx
- Loaders: `loadSalesByDateRange` + `loadTreatmentsByDateRange` + `loadExpensesByDateRange`
- Branch-scoped list*: `listDfGroups` + `listDfStaffRates` + `listCourses` + `listStaffSchedules`
- Universal list*: `listDoctors` + `listStaff` (also moved to scopedDataLayer for consistency)
- Strip stale annotation
- All branch-scoped loaders + listers receive `selectedBranchId` (loaders explicit; listers via scopedDataLayer auto-inject)
- Deps: `[from, to, selectedBranchId, reloadKey]`

#### 2.12 PaymentSummaryTab.jsx
- Loader: `loadSalesByDateRange`
- Pass `branchId: selectedBranchId`
- Deps: `[from, to, selectedBranchId, reloadKey]`

#### 2.13 RemainingCourseTab.jsx (special — already partial)
- Already imports `useSelectedBranch` ✓
- Already filters client-side via `filterCourses({...,branchId})` ✓
- ADD: pass `branchId: selectedBranchId` to `loadAllCustomersForReport` for server-side narrowing
- KEEP: client-side filter (defense-in-depth — branchId can vary per row inside `customer.courses[]`)
- Strip stale annotation
- Deps: `[selectedBranchId]` (the existing `reload` useCallback has empty deps; needs selectedBranchId added)

---

## Phase 3 — Exempted tab annotations

### 3.1 ExpenseReportTab.jsx
- Replace line 1 `// audit-branch-scope: report — uses {allBranches:true} for cross-branch aggregation` with:
- `// audit-branch-scope: BS-11 in-page-selector — has multi-branch checkbox UI in-page`

### 3.2 ClinicReportTab.jsx
- Replace line 2 stale annotation with same `BS-11 in-page-selector` line.

### 3.3 ReportsHomeTab.jsx
- Add at top of file: `// audit-branch-scope: BS-11 navigation-only — no data load`

---

## Phase 4 — Audit invariant BS-11

### 4.1 Update `.agents/skills/audit-branch-scope/SKILL.md`

Add BS-11 row to the invariants table:

```markdown
| **BS-11** | **Report-tab branch-refresh discipline** — every file in `src/components/backend/reports/**/*Tab.jsx` that calls a `load*` from `reportsLoaders.js` OR a `list*` from `scopedDataLayer.js` MUST either subscribe `useSelectedBranch` + pass `branchId` + include `selectedBranchId` in deps, OR be annotated `// audit-branch-scope: BS-11 in-page-selector` (sanctioned: ExpenseReportTab + ClinicReportTab) OR `// audit-branch-scope: BS-11 navigation-only` (sanctioned: ReportsHomeTab). V52 / 2026-05-08 | grep tabs that import reportsLoaders or scopedDataLayer; verify file imports `useSelectedBranch` or has the BS-11 annotation |
```

Add to sanctioned annotations table:

```markdown
| `// audit-branch-scope: BS-11 in-page-selector` | Report tab has its own multi-branch checkbox UI | ExpenseReportTab.jsx, ClinicReportTab.jsx ONLY |
| `// audit-branch-scope: BS-11 navigation-only` | Report tab is a navigation-only landing page (no data load) | ReportsHomeTab.jsx ONLY |
```

### 4.2 Update `.agents/skills/audit-branch-scope/patterns.md`

Add BS-11 grep recipe section.

### 4.3 Extend `tests/audit-branch-scope.test.js`

Add new `describe` block `BS-11 — report-tab branch-refresh discipline` with sub-tests:

- **BS-11.1** every report tab importing reportsLoaders or scopedDataLayer also imports useSelectedBranch (or has BS-11 annotation)
- **BS-11.2** every such tab includes `selectedBranchId` in data-loading hook deps
- **BS-11.3** SaleReportTab passes BS-11.1+11.2 (regression guard)
- **BS-11.4** RemainingCourseTab passes BS-11.1+11.2 (regression guard for partial fix)
- **BS-11.5** sanctioned exception annotation pattern works (ExpenseReportTab passes via annotation)
- **BS-11.6** sanctioned exception list is closed — only 3 files have BS-11 annotation
- **BS-11.7** stale `audit-branch-scope: report — uses {allBranches:true}` annotation does NOT exist in any report tab (regression lock against V52 reverting)
- **BS-11.8** every report tab imports from scopedDataLayer (no raw backendClient imports — BS-1 mirror at report scope)

---

## Phase 5 — Tests

### 5.1 NEW `tests/v52-reports-loaders-branch-id.test.js` (Rule N targeted unit)

Mock Firestore to capture `where` clauses; assert each loader includes `where('branchId','==',<id>)` when called with `branchId`. Cover:
- Backward compat (no branchId → no filter; results unchanged from pre-V52)
- branchId provided → filter applied
- `allBranches: true` → no filter even if branchId provided
- empty string branchId → no filter (treated like undefined)

### 5.2 NEW `tests/v52-report-tabs-source-grep.test.js` (V12 multi-reader-sweep regression)

Per-tab source-grep assertions. For each of the 13 fixed tabs:
- Asserts `import { useSelectedBranch }` line present
- Asserts `useSelectedBranch()` call present
- Asserts `branchId: selectedBranchId` appears in load* call sites
- Asserts `selectedBranchId` appears in deps array
- Asserts NO stale `// audit-branch-scope: report — uses {allBranches:true}` line
- Asserts no raw `from '../../../lib/backendClient'` imports (BS-1 mirror)

### 5.3 NEW `tests/v52-report-tabs-branch-scope-flow-simulate.test.js` (Rule I full-flow)

Full chain simulation per tab:
- Render BranchProvider with 2 mock branches
- Render the tab inside provider
- Wait for initial load — assert loader called with branchId == default-selected-branch
- Switch branch via `selectBranch()`
- Assert loader called again with new branchId

Use lightweight render via React Testing Library; mock `reportsLoaders.js` with vi.fn() to capture calls. One test per fixed tab (F1-F13). Plus F14: ExpenseReportTab + F15: ClinicReportTab — assert they DO NOT re-load on branch switch (in-page selector is independent).

### 5.4 Update existing tests

- `tests/audit-branch-scope.test.js` — add BS-11 block as outlined in Phase 4.3
- Possibly: existing per-tab tests may need mocks updated to provide BranchContext provider in render. If a test renders a tab that now calls `useSelectedBranch`, the test needs `<BranchProvider>` wrapper or a manual `BranchContext.Provider value={{...}}` mock. Survey existing tests to find affected files.

---

## Phase 6 — Verification

### 6.1 Targeted (per Rule N — small bugfix discipline)

```bash
npm test -- --run tests/audit-branch-scope.test.js
npm test -- --run tests/v52-reports-loaders-branch-id.test.js
npm test -- --run tests/v52-report-tabs-source-grep.test.js
npm test -- --run tests/v52-report-tabs-branch-scope-flow-simulate.test.js
```

All 4 must be green before proceeding.

### 6.2 Targeted impact (modules grep)

```bash
# Find tests that import any of the 13 modified tabs
grep -rln "SaleReportTab\|CustomerReportTab\|AppointmentReportTab\|StockReportTab\|CRMInsightTab\|RevenueAnalysisTab\|AppointmentAnalysisTab\|DailyRevenueTab\|StaffSalesTab\|PnLReportTab\|DfPayoutReportTab\|PaymentSummaryTab\|RemainingCourseTab" tests/
```

Run any matched test files to verify no regressions.

### 6.3 Full vitest (end-of-batch)

```bash
npm test -- --run
```

All ~7333 tests must remain green (V52 adds new ones; pre-existing pass).

### 6.4 Build clean

```bash
npm run build
```

No MISSING_EXPORT, no syntax errors, no unused imports.

### 6.5 Source-grep manual verify

```bash
# No raw backendClient imports in report tabs
git grep -nE "from ['\"]\\.\\./\\.\\./\\.\\./lib/backendClient" src/components/backend/reports/

# No stale annotations
git grep -nE "audit-branch-scope: report" src/components/backend/reports/

# 3 sanctioned BS-11 annotations
git grep -nE "audit-branch-scope: BS-11" src/components/backend/reports/
```

Expected: first two empty; third returns 3 hits (Reports, Expense, Clinic).

---

## Phase 7 — Commit

```
git add src/lib/reportsLoaders.js \
        src/components/backend/reports/*.jsx \
        .agents/skills/audit-branch-scope/SKILL.md \
        .agents/skills/audit-branch-scope/patterns.md \
        tests/audit-branch-scope.test.js \
        tests/v52-*.test.js \
        docs/superpowers/specs/2026-05-08-* \
        docs/superpowers/plans/2026-05-08-*
```

(Per Rule V37 — NEVER `git add -A`; explicit file list only.)

```
git commit -m "feat(V52/BS-11): every report tab respects top-right BranchSelector

User report: 'Tab ย่อยของหน้ารายงานทั้งหมดต้องแสดงรายละเอียดของสาขานั้นๆ
ที่เลือกไว้ใน branch selector ยกเว้น tab=expense-report และ tab=clinic-report'

13 of 14 report sub-tabs were ignoring the top-right BranchSelector — admin
saw cross-branch aggregated data regardless of selected branch. Same V12
multi-reader-sweep class-of-bug as Phase 17.0 (BS-9 promotion/coupon/voucher),
at a different layer (report tabs use reportsLoaders.js, not scopedDataLayer).

Fix surfaces:
- src/lib/reportsLoaders.js: 7 loaders gain {branchId, allBranches} params
  (additive, backward-compat preserved)
- 13 report tabs: subscribe useSelectedBranch + pass branchId to loaders
  + selectedBranchId in deps + switch raw backendClient imports to
  scopedDataLayer (BS-1 compliance)
- 9 stale annotations stripped (' uses {allBranches:true}' was a
  documentation lie — flag wasn't actually being passed)
- 2 EXEMPTED tabs (expense-report + clinic-report) get new
  'BS-11 in-page-selector' annotation + ReportsHomeTab gets
  'BS-11 navigation-only'

New audit invariant BS-11 (parallel to BS-9):
- Every src/components/backend/reports/**/*Tab.jsx that calls load* or list*
  MUST subscribe useSelectedBranch + pass branchId + include in deps,
  OR be annotated BS-11 sanctioned (3 closed-list files only)
- 8 sub-tests in tests/audit-branch-scope.test.js (BS-11.1..11.8)
- Source-grep regression locks per tab in
  tests/v52-report-tabs-source-grep.test.js
- Rule I full-flow simulate in
  tests/v52-report-tabs-branch-scope-flow-simulate.test.js
  (chain: BranchProvider switch → tab reload → loader receives new branchId)
- Rule N targeted unit tests in tests/v52-reports-loaders-branch-id.test.js

Iron-clad rule trail:
- Rule J brainstorming HARD-GATE: spec written + user pre-authorized
- Rule P 7-step class-of-bug expansion: BS-11 invariant locks pattern
  permanently (Tier 2 default artifacts; Tier 3 V-entry escalation
  because architectural — same as Phase 17.0/BS-9 was)
- Rule N targeted-test-only: per-loader unit + per-tab source-grep
- Rule I full-flow simulate: BranchProvider → branch switch → reload chain
- Rule V37 git add explicit files only

Spec: docs/superpowers/specs/2026-05-08-report-tabs-branch-scope-design.md
Plan: docs/superpowers/plans/2026-05-08-report-tabs-branch-scope.md
V-entry: see .claude/rules/v-log-archive.md V52 + 00-session-start.md § 2

NO DEPLOY — local + commits only. User authorizes vercel --prod separately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

```
git push origin master
```

---

## Phase 8 — State updates

- `.claude/rules/00-session-start.md` § 2 — V52 compact entry (single row in violation table)
- `.claude/rules/v-log-archive.md` — V52 verbose entry (~150 lines, mirror Phase 17.0/V41 style)
- `SESSION_HANDOFF.md` — current state section: master = post-V52 commit, NO deploy yet, awaiting user authorization
- `.agents/active.md` — focus: V52 shipped; next action: "awaiting user wake-up + deploy authorization if desired"

---

## Phase 9 — Final autonomous report

A summary message at the END of execution (for user wake-up):

```
✅ V52 COMPLETE — Report tabs branch-scope wired (BS-11)

State:
- master = <new-sha> (NOT yet deployed)
- 13 report tabs updated · 7 loaders extended · BS-11 invariant added
- 4 new test files + 1 extended (BS-11.x in audit-branch-scope.test.js)
- All targeted tests green; full vitest --run green; build clean
- Spec + plan + V-entry committed

Verify yourself:
- Switch branch in top-right BranchSelector on any report tab
- Sale/Customer/Appointment/Stock/RFM/Revenue/Daily/Staff/PnL/DF/Payment/RemainingCourse all should refetch immediately
- Expense + Clinic reports keep their in-page multi-branch UI (untouched)

Awaiting deploy authorization. Say "deploy" if you want vercel --prod.
```

---

**Plan approved by:** User pre-authorization
**Implementation:** autonomous, in single commit
**Estimated total work:** ~3-4 hours of edits + tests + verify (overnight job within autonomous window)
