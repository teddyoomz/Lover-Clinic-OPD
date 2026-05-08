# Report Tabs Branch-Scope (V52 / BS-11) — Design

> **Status:** Approved (user pre-authorized autonomous execution)
> **Date:** 2026-05-08
> **Spec author:** Claude (autonomous)
> **Iron-clad triggers:** Rule J (Superpowers brainstorming) · Rule P (class-of-bug expansion) · Rule N (targeted tests) · Rule I (full-flow simulate)

---

## 1. Problem statement

User reported (verbatim):

> "Tab ย่อยของหน้ารายงานทั้งหมดต้องแสดงรายละเอียดของสาขานั้นๆที่เลือกไว้ใน branch selector ยกเว้น tab=expense-report และ tab=clinic-report แสดงแบบ universal ได้ เพราะมีให้ติ๊กเลือกสาขาในหน้านั้นๆแล้ว"

= "ALL report sub-tabs must show details for the branch selected in the branch selector, EXCEPT `tab=expense-report` and `tab=clinic-report` which can show universal/cross-branch (because they have their own in-page branch-tick UI)."

**Current state (audit, 2026-05-08):**

| Tab id | File | Branch wiring | Verdict |
|---|---|---|---|
| `reports` | `ReportsHomeTab.jsx` | navigation only, no data load | N/A |
| `reports-sale` | `SaleReportTab.jsx` | NO `useSelectedBranch`; loaders ignore branchId | **BROKEN** |
| `reports-customer` | `CustomerReportTab.jsx` | NO `useSelectedBranch`; loaders ignore branchId | **BROKEN** |
| `reports-appointment` | `AppointmentReportTab.jsx` | stale annotation `{allBranches:true}`; no actual support | **BROKEN** |
| `reports-stock` | `StockReportTab.jsx` | stale annotation; loader supports branchId but tab never passes it | **BROKEN** |
| `reports-rfm` | `CRMInsightTab.jsx` | NO `useSelectedBranch` | **BROKEN** |
| `reports-revenue` | `RevenueAnalysisTab.jsx` | stale annotation; raw `listCourses` import | **BROKEN** |
| `reports-appt-analysis` | `AppointmentAnalysisTab.jsx` | stale annotation; raw `listAllSellers` import | **BROKEN** |
| `reports-daily-revenue` | `DailyRevenueTab.jsx` | NO `useSelectedBranch` | **BROKEN** |
| `reports-staff-sales` | `StaffSalesTab.jsx` | stale annotation; raw `listStaff/listDoctors` (universal — OK but inconsistent) | **BROKEN** |
| `reports-pnl` | `PnLReportTab.jsx` | NO `useSelectedBranch` | **BROKEN** |
| `reports-df-payout` | `DfPayoutReportTab.jsx` | stale annotation; raw branch-scoped imports | **BROKEN** |
| `reports-payment` | `PaymentSummaryTab.jsx` | NO `useSelectedBranch` | **BROKEN** |
| `reports-remaining-course` | `RemainingCourseTab.jsx` | uses `useSelectedBranch` BUT only for client-side filtering (loader fetches all) | **BROKEN (partial)** |
| `expense-report` | `ExpenseReportTab.jsx` | has in-page multi-branch checkbox UI | **EXEMPTED** |
| `clinic-report` | `ClinicReportTab.jsx` | has in-page multi-branch checkbox UI | **EXEMPTED** |

**13 of 14 substantive report tabs ignore the top-right `BranchSelector`.** Switching the selected branch has zero effect on report contents — admin sees cross-branch aggregated data regardless of branch context. This is the same V12 multi-reader-sweep pattern as Phase 17.0 (BS-9 promotion/coupon/voucher) but at a different layer (report tabs use `reportsLoaders.js` intermediate, not `scopedDataLayer.js` directly — so existing BS-9 audit doesn't catch them).

---

## 2. Goal

Every report sub-tab respects the top-right `BranchSelector` immediately on switch — except `expense-report` + `clinic-report` which keep their in-page multi-branch UI for legitimate cross-branch aggregation.

Lock the contract permanently via a new audit invariant **BS-11** so future drift is caught at build time.

---

## 3. Architecture decisions (locked, no questions to user)

### Decision 1 — Loader API: `branchId` param, optional, default = no filter

```js
// All 9 loaders in src/lib/reportsLoaders.js gain `branchId` param.
// If branchId is a non-empty string → filter `where('branchId','==',branchId)`.
// If branchId is empty/undefined → no filter (legacy behavior preserved).
// If `allBranches: true` is passed → no filter (explicit opt-out).
loadSalesByDateRange({ from, to, includeCancelled, branchId, allBranches })
loadAppointmentsByDateRange({ from, to, branchId, allBranches })
loadAllCustomersForReport({ branchId, allBranches })
loadExpensesByDateRange({ from, to, branchId, branchIds, allBranches })  // branchIds for expense-report multi-select
loadSaleInsuranceClaimsByDateRange({ from, to, branchId, allBranches })
loadTreatmentsByDateRange({ from, to, includeCancelled, branchId, allBranches })
loadStockBatches({ branchId })          // already has it ✓
loadAllStockBatchesForReport({ branchId })  // already has it ✓
loadStockMovementsByDateRange({ from, to, branchId, allBranches })
```

**Backward compat:** existing call sites that pass no branchId continue to return all-branches data. New tab code passes `branchId: selectedBranchId`. Tests for legacy callers (e.g. expense-report aggregator) preserved.

### Decision 2 — Tab signature pattern (canonical):

```js
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';

export default function FooReportTab({ clinicSettings, theme }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  // ... existing state ...

  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadXyzByDateRange({ from, to, branchId: selectedBranchId }),
      // ...
    ])
      .then(([x, y]) => { /* ... */ })
      .finally(() => { /* ... */ });
    return () => { abort = true; };
  }, [from, to, /* other filters */, selectedBranchId, reloadKey]);
  //                                  ^^^^^^^^^^^^^^^^^ NEW

  // ... rest unchanged ...
}
```

### Decision 3 — Aggregators stay pure

Branch filtering happens at the loader / Firestore-query layer. Aggregators receive pre-filtered rows and stay branch-blind. No aggregator changes needed for V52.

**Exception:** Aggregators that internally pull related collections (e.g. DF payout aggregator joins doctors/staff/df_groups) — those internal pulls happen at the tab level via `scopedDataLayer.js`, which auto-injects branchId. Aggregators receive the already-pulled arrays.

### Decision 4 — Switch raw `backendClient.js` imports → `scopedDataLayer.js`

For BS-1 compliance, every report tab importing from `backendClient.js` directly (e.g. `RevenueAnalysisTab` imports `listCourses`, `DfPayoutReportTab` imports `listDfGroups` etc.) must switch to `scopedDataLayer.js`. Universal listers (`listStaff`, `listDoctors`) can also come from scopedDataLayer (pass-through re-export).

Sanctioned exceptions (kept on raw backendClient): NONE for report tabs.

### Decision 5 — New audit invariant **BS-11** (parallel to BS-9)

```
BS-11 — Report-tab branch-refresh discipline (V52, 2026-05-08)
       Every file in src/components/backend/reports/**/*Tab.jsx that
       calls a `load*` from reportsLoaders.js OR `list*` from
       scopedDataLayer.js MUST either:
       (a) import useSelectedBranch + destructure branchId + pass
           branchId to every load* call + include selectedBranchId in
           the data-loading useEffect/useCallback deps array, OR
       (b) be annotated `// audit-branch-scope: BS-11 in-page-selector`
           — sanctioned ONLY for `ExpenseReportTab.jsx` + `ClinicReportTab.jsx`,
       OR
       (c) be annotated `// audit-branch-scope: BS-11 navigation-only`
           — sanctioned ONLY for `ReportsHomeTab.jsx` (no data load).

Sanctioned exception list is closed: only the 3 files above. Any
fourth file with this annotation fails BS-11.6 (sanctioned-list lock).
```

This is parallel to BS-9 (which guards tabs importing scopedDataLayer directly). Both run in `tests/audit-branch-scope.test.js`.

### Decision 6 — Strip stale annotations

The 9 tabs currently annotated `// audit-branch-scope: report — uses {allBranches:true} for cross-branch aggregation` were never actually passing `{allBranches:true}` (that flag exists on scopedDataLayer, not on reportsLoaders). The annotation is a documentation lie. Strip it from all 9 files; replace with a top-of-file `// Phase 24.1 (BS-11) — branch-scoped per top-right BranchSelector (V52)` comment for institutional memory.

For the 2 exempted tabs (`expense-report`, `clinic-report`), replace with `// audit-branch-scope: BS-11 in-page-selector — has multi-branch checkbox UI in-page`.

For `ReportsHomeTab.jsx` (navigation only, no data load), add `// audit-branch-scope: BS-11 navigation-only — no data load`.

### Decision 7 — Branch-blind / null branchId behavior

When `useSelectedBranch()` returns `branchId: null` (initial mount before snapshot resolves, or no branches in Firestore), report tabs MUST NOT auto-fall-back to "all branches". Instead, the loader's optional `branchId` param treats `null/undefined/empty` as "no filter applied" — preserving backward compat AND avoiding a UI flash where the report shows cross-branch data for ~50ms before snapshot resolves.

Rationale: if branchId is null, branchSelector is not yet ready → showing all branches is "OK loading state" because the user hasn't selected anything yet. Once branchId resolves, the deps dependency triggers re-fetch with the new branchId. Identical behavior to scopedDataLayer's pattern (which returns `Promise.resolve([])` when branchId is null — but loaders pre-V52 returned all data, and we preserve that for backward compat).

**Future hardening (deferred, not V52 scope):** make loaders also return `[]` on null branchId — but that requires audit of every legacy caller (e.g. `useExpenseReport` which uses `branchIds:[]` to mean "all"). V52 is a forward-extension, not a legacy break.

---

## 4. Files to modify

### Source (3 + 13 + 2 + 1 = 19 files):

**Loader (1 file):**
- `src/lib/reportsLoaders.js` — add `branchId` + `allBranches` params to 7 loaders (2 already have branchId).

**Broken report tabs (13 files):**
- `src/components/backend/reports/SaleReportTab.jsx`
- `src/components/backend/reports/CustomerReportTab.jsx`
- `src/components/backend/reports/AppointmentReportTab.jsx`
- `src/components/backend/reports/StockReportTab.jsx`
- `src/components/backend/reports/CRMInsightTab.jsx`
- `src/components/backend/reports/RevenueAnalysisTab.jsx`
- `src/components/backend/reports/AppointmentAnalysisTab.jsx`
- `src/components/backend/reports/DailyRevenueTab.jsx`
- `src/components/backend/reports/StaffSalesTab.jsx`
- `src/components/backend/reports/PnLReportTab.jsx`
- `src/components/backend/reports/DfPayoutReportTab.jsx`
- `src/components/backend/reports/PaymentSummaryTab.jsx`
- `src/components/backend/reports/RemainingCourseTab.jsx`

**Exempted tabs (2 files) — annotation cleanup:**
- `src/components/backend/reports/ExpenseReportTab.jsx`
- `src/components/backend/reports/ClinicReportTab.jsx`

**Navigation tab (1 file) — annotation:**
- `src/components/backend/reports/ReportsHomeTab.jsx`

### Audit + skill (2 files):

- `.agents/skills/audit-branch-scope/SKILL.md` — add BS-11 row + sanctioned annotations table entry
- `.agents/skills/audit-branch-scope/patterns.md` — add BS-11 grep recipe

### Tests (3 new + 1 updated):

- `tests/audit-branch-scope.test.js` — add BS-11 test block (BS-11.1..BS-11.7)
- `tests/v52-report-tabs-branch-scope-flow-simulate.test.js` — NEW Rule I full-flow simulate
- `tests/v52-reports-loaders-branch-id.test.js` — NEW unit tests per loader (Rule N targeted)
- `tests/v52-report-tabs-source-grep.test.js` — NEW V12 multi-reader-sweep regression locks per tab

### Docs (4 files):

- `docs/superpowers/specs/2026-05-08-report-tabs-branch-scope-design.md` — THIS file
- `docs/superpowers/plans/2026-05-08-report-tabs-branch-scope.md` — implementation plan
- `.claude/rules/00-session-start.md` § 2 — V52 compact entry
- `.claude/rules/v-log-archive.md` — V52 verbose entry
- `SESSION_HANDOFF.md` + `.agents/active.md` — state update

---

## 5. Implementation order

1. **Foundation:** update `reportsLoaders.js` (additive — branchId param, no breaking change)
2. **Per-tab fixes (parallelizable):** 13 broken tabs, identical pattern (use `Edit` per file)
3. **Annotation cleanup:** 3 tabs (2 exempted + 1 nav)
4. **Audit + skill:** BS-11 row + grep + sanctioned-exception lock
5. **Tests:** 3 new + 1 updated, all in single batch
6. **Verify:** targeted (Rule N) + full vitest --run + npm run build clean
7. **Commit + push:** single commit with V52 message + V-entry references
8. **Docs:** SESSION_HANDOFF + active.md + v-log-archive entry
9. **Final report:** ready for user wake-up

---

## 6. Risk assessment

### Low risk
- **Loader changes:** purely additive — existing callers pass no `branchId` and get current behavior.
- **Tab pattern:** mechanical, mirrors Phase 17.0 PromotionTab/CouponTab/VoucherTab proof-tested pattern.
- **Audit invariant:** new test bank, doesn't modify existing tests.

### Medium risk
- **`RemainingCourseTab` already uses `useSelectedBranch`** — fix needs to convert client-side filter to server-side (loader-passed branchId). Existing client-side filter must be preserved as defense-in-depth (since `customer.branchId` is creation-branch — a customer could exist in branch A but have a course purchased at branch B; flatten step inside `flattenCustomerCourses` already handles per-row branchId).

  **Resolution:** keep client-side `branchId` filter inside `filterCourses` AS-IS (it filters at the row level, not customer level). ALSO pass `branchId` to `loadAllCustomersForReport` to narrow the customer pull. Both filters are correct in their own scope.

### Higher risk (acceptable)
- **DF Payout multi-collection load:** `DfPayoutReportTab` pulls 9 collections (sales, treatments, expenses, doctors, staff, df_groups, df_staff_rates, courses, schedules). Each branch-scoped one (treatments, expenses, df_groups, df_staff_rates, courses, schedules) needs branchId pass-through. Doctors+staff are universal (no change needed but still re-route through scopedDataLayer for BS-1 compliance).

  **Resolution:** DfPayoutReportTab gets the most invasive change but the pattern is identical — pass `branchId: selectedBranchId` to every load* + use scopedDataLayer for list*.

### Out of scope (V52 explicitly excludes)
- Migrating `loadStockMovementsByDateRange` callers (no current report tab uses it; reserved for future)
- Migrating `loadStockBatches` callers (currently only called outside reports)
- Aggregator semantics for "active customers in branch" (e.g. CRM Insight customer list — should it also filter customers by `customer.branchId`? Yes, via loader; but RFM aggregator is branch-blind and that's correct because it computes RFM per-customer regardless of branch)
- Frontend public-link pages (already exempted via BS-10 sanctioned annotation)

---

## 7. Verify (acceptance criteria)

Per Rule N (targeted) + Rule I (flow simulate) + verification-before-completion:

1. **Targeted tests pass** (no full suite needed during iteration):
   - `npm test -- --run tests/audit-branch-scope.test.js` (BS-11 block green)
   - `npm test -- --run tests/v52-reports-loaders-branch-id.test.js` (loader unit tests green)
   - `npm test -- --run tests/v52-report-tabs-source-grep.test.js` (per-tab regression locks green)
   - `npm test -- --run tests/v52-report-tabs-branch-scope-flow-simulate.test.js` (Rule I full-flow green)

2. **Full vitest at end of batch:** `npm test -- --run` — all green (no regressions in 7333 existing tests).

3. **Build clean:** `npm run build` — no MISSING_EXPORT or syntax errors.

4. **Source-grep manual verify:**
   - `git grep -nE "from '\\.\\./\\.\\./\\.\\./lib/backendClient" src/components/backend/reports/` → returns empty (every report tab uses scopedDataLayer)
   - `git grep -nE "audit-branch-scope: report" src/components/backend/reports/` → returns empty (stale annotations stripped)
   - `git grep -nE "audit-branch-scope: BS-11" src/components/backend/reports/` → returns exactly 3 files (ReportsHomeTab + ExpenseReportTab + ClinicReportTab)

5. **Class-of-bug expansion (Rule P 7-step) trail:** V52 V-entry in `00-session-start.md` § 2 references the lesson + sanctioned-exception list + cross-link to BS-11 + AV invariant.

---

## 8. Out-of-scope follow-ups (separate spec when needed)

- Wire `loadStockMovementsByDateRange` to a report tab (no current consumer; deferred until needed)
- Add a "Show all branches" override in tabs other than expense/clinic reports (not requested; user explicitly excluded)
- Smart Audience tab (`smart-audience` — separately classified, not under reports menu)
- ProClinic legacy data migration to backfill `branchId` field on old `be_customers` / `be_sales` docs without it (already done in V20-era and V50.Phase 6; no action needed)

---

**Approved:** User pre-authorized via "ไม่ต้องถามอะไรผมเลย เลือกที่นาย recommend ทั้งหมด และ ผมให้ผ่าทุกการรีวิว code ของนาย" (2026-05-08, this turn).

Implementation begins immediately.
