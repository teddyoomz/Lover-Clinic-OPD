# Phase 17.0 — BSA Leak Sweep 3 + Branch-Refresh Invariant Lock

**Date**: 2026-05-05
**Status**: Design approved (brainstorming complete)
**Predecessors**: Phase BSA (commits e13f3c5..c5f0a58, 12 tasks) · BSA leak sweep 1 (17f8ca4) · Phase BS V3 LINE (40e9d8e) · BSA leak sweep 2 (45ad80c)
**Successor**: Phase 17.1 — Cross-Branch Master-Data Import (separate spec)

## Problem statement

User on prod (V15 #16, master = `f39760b`) reports three branch-leak symptoms after switching the top-right BranchSelector from นครราชสีมา → พระราม 3:

1. **Marketing tabs (Promotion/Coupon/Voucher) do not refresh** — list still shows นครราชสีมา data until F5.
2. **TreatmentFormPage modals show phantom data** on the 3 buttons "กลุ่มยากลับบ้าน", "กลุ่มสินค้าสิ้นเปลือง", "สินค้าสิ้นเปลือง" — even though พระราม 3 has no data for these.
3. **User-codified directive**: "ต่อไปต้องเปลี่ยนแล้วแสดงทันทีกับทุก tab บันทึกไว้เป็นข้อสำคัญในการเขียนโปรเจ็คนี้ด้วย" — every tab must reflect branch switch immediately. Lock as project-wide invariant.

This phase closes all three with surgical fixes plus a defense-in-depth invariant lock so future tabs can't regress.

## Root causes

### Track A — Marketing tabs no branch refresh
- `PromotionTab.jsx:43-57`, `CouponTab.jsx:29-35`, `VoucherTab.jsx` use `await listX()` (one-shot fetch through `scopedDataLayer.js`) wrapped in `useEffect(() => reload(), [reload])` where `reload` is a `useCallback(..., [])` with NO branch dep.
- scopedDataLayer auto-injects `resolveSelectedBranchId()` AT CALL TIME, but the call never happens again after mount because nothing tells React to re-run `reload`.
- 25 other backend tabs already follow the correct pattern (e.g. `ProductGroupsTab.jsx:32-67` imports `useSelectedBranch` and includes `selectedBranchId` in `useCallback` deps). The 3 marketing tabs missed this.
- No `listenToPromotions/Coupons/Vouchers` listeners exist → migrating to `useBranchAwareListener` would require new infra. Cheapest fix is to mirror the established one-shot+deps pattern.

### Track B — TFP phantom data on 3 buttons
Two distinct contributing bugs:

- **B1 — `listProductGroupsForTreatment` is branch-blind**:
  - `src/lib/backendClient.js:8429` reads `getDocs(productGroupsCol())` + `getDocs(productsCol())` with NO `where('branchId')` filter.
  - `src/lib/scopedDataLayer.js:392` wrapper is a pass-through: `(...args) => raw.listProductGroupsForTreatment(...args)`. Does not auto-inject branchId.
  - Result: every TFP call to `listProductGroupsForTreatment('ยากลับบ้าน')` or `listProductGroupsForTreatment('สินค้าสิ้นเปลือง')` returns ALL groups across ALL branches.
  - This violates the BSA contract (Rule L) — every branch-scoped lister at Layer 1 must accept `{branchId, allBranches}` opts and the Layer 2 wrapper must auto-inject.

- **B2 — TFP modal cache early-return never invalidates on branch switch**:
  - `openMedModal` at line 1139: `if (medAllProducts.length > 0) return;`
  - `openMedGroupModal` at line 1247: `if (medGroupData.length > 0) return;`
  - `openConsModal` at line 1313: `if (consAllProducts.length > 0) return;`
  - `openConsGroupModal` at line 1379: `if (consGroupData.length > 0) return;`
  - These caches persist for the lifetime of the TFP page. Switching branches via the top-right selector does NOT clear them. Even if Track B1 is fixed, the modal will still show stale data because the early-return prevents the new fetch.

### Track C — Project-wide invariant gap
The audit-branch-scope skill (BS-1..BS-8) catches direct backendClient imports, master_data reads, and listener wiring patterns. It does NOT catch the "useEffect with no branch dep" pattern that hit the 3 marketing tabs. A new BS-9 invariant closes that gap.

## Approved decisions (locked from brainstorming Q1-Q3)

- **Q1 — Decomposition**: Phase 17.0 (Track A + B + invariant lock) ships as one cohesive bug-fix commit. Phase 17.1 (cross-branch master-data import) is a separate cycle with its own brainstorming + spec + plan.
- **Q2 — Invariant lock placement**: Defense in depth — (a) `audit-branch-scope` skill BS-9 invariant (build-blocking), (b) `feedback_branch_switch_refresh.md` memory (cross-session reminder), (c) `.claude/rules/00-session-start.md` Rule L extension (always-loaded boot context).
- **Q3 — TFP modal cache strategy**: Reset cache on branch change via `useEffect(() => { setMedAllProducts([]); setMedGroupData([]); setConsAllProducts([]); setConsGroupData([]); }, [selectedBranchId])`. Preserves the existing early-return → cheap re-opens within a branch, fresh fetch after a switch.

## Architecture

### Track A fix shape (3 files)

```diff
+ import { useSelectedBranch } from '../../lib/BranchContext.jsx';
  ...
  export default function PromotionTab({ clinicSettings, theme }) {
+   const { branchId: selectedBranchId } = useSelectedBranch();
    ...
-   const reload = useCallback(async () => { ... }, []);
+   const reload = useCallback(async () => { ... }, [selectedBranchId]);
    useEffect(() => { reload(); }, [reload]);
```

The `selectedBranchId` is referenced silently — `listPromotions()` reads `resolveSelectedBranchId()` from localStorage internally — but it MUST be in the deps array so React re-runs `reload` when the branch changes. Same shape applied verbatim to CouponTab and VoucherTab.

### Track B fix shape (3 files)

**B1 — Layer 1 lister accepts opts:**
```diff
- export async function listProductGroupsForTreatment(productType) {
+ export async function listProductGroupsForTreatment(productType, { branchId, allBranches = false } = {}) {
    const targetType = String(productType || '').trim();
    if (!targetType) return [];
+   const useFilter = branchId && !allBranches;
+   const groupsRef = useFilter
+     ? query(productGroupsCol(), where('branchId', '==', String(branchId)))
+     : productGroupsCol();
+   const productsRef = useFilter
+     ? query(productsCol(), where('branchId', '==', String(branchId)))
+     : productsCol();
    const [groupsSnap, productsSnap] = await Promise.all([
-     getDocs(productGroupsCol()),
-     getDocs(productsCol()),
+     getDocs(groupsRef),
+     getDocs(productsRef),
    ]);
```

**B1 — Layer 2 wrapper auto-injects:**
```diff
- export const listProductGroupsForTreatment = (...args) => raw.listProductGroupsForTreatment(...args);
+ export const listProductGroupsForTreatment = (productType, opts = {}) =>
+   raw.listProductGroupsForTreatment(productType, { branchId: resolveSelectedBranchId(), ...opts });
```

**B2 — TFP modal cache reset:**

**IMPORTANT — wiki-first review correction (2026-05-05)**: TFP ALREADY imports `useSelectedBranch` at line 25 (Phase 14.7.H follow-up A — branch-aware sale + stock writes) AND destructures it at line 325 as `SELECTED_BRANCH_ID` (uppercase snake-case). 7 existing usage sites use this exact name. The fix is therefore JUST the cache-reset useEffect using the EXISTING variable:

```diff
  // Existing at line 25 (do not duplicate):
  // import { useSelectedBranch } from '../lib/BranchContext.jsx';

  // Existing at line 325 (do not duplicate):
  // const { branchId: SELECTED_BRANCH_ID } = useSelectedBranch();

+ // Phase 17.0 — clear modal caches on branch switch so subsequent opens
+ // fetch from the new branch instead of returning stale cached data.
+ // Uses the EXISTING SELECTED_BRANCH_ID destructured at line 325 (Phase
+ // 14.7.H follow-up A) — do not introduce a parallel selectedBranchId.
+ useEffect(() => {
+   setMedAllProducts([]);
+   setMedGroupData([]);
+   setConsAllProducts([]);
+   setConsGroupData([]);
+ }, [SELECTED_BRANCH_ID]);
```

### Project-wide invariant lock (3 artifacts)

**(a) `.claude/skills/audit-branch-scope/SKILL.md` + `patterns.md`** — add invariant:

```
BS-9 — Branch-switch refresh discipline (Phase 17.0, 2026-05-05)

Every backend tab that imports a branch-scoped lister from scopedDataLayer.js
MUST also import useSelectedBranch from BranchContext.jsx AND include
selectedBranchId in the useCallback/useEffect dep array of the data-loading
hook.

Sanctioned exception: tabs using useBranchAwareListener auto-handle re-subscribe
on branch switch — annotate `// audit-branch-scope: BS-9 listener-driven`.

Greppable: source-grep over src/components/backend/**Tab.jsx for any line
matching `from '.*scopedDataLayer'` must be paired with `useSelectedBranch`
import OR a BS-9 listener-driven annotation.
```

**(b) `~/.claude/projects/F--LoverClinic-app/memory/feedback_branch_switch_refresh.md`** — frontmatter + 1-paragraph rule citing Phase 17.0 + BS-9 + the 3 fixed tabs as institutional memory. Indexed in MEMORY.md.

**(c) `.claude/rules/00-session-start.md`** Rule L extension — append sub-bullet:

```
**Branch-refresh discipline (BS-9, 2026-05-05)**: every branch-scoped tab
importing from scopedDataLayer.js MUST subscribe to useSelectedBranch +
include selectedBranchId in data-loading deps. Phase 17.0 closed
Promotion/Coupon/Voucher gap. Audit BS-9 enforces.
```

## Files to modify (8)

| File | Type | Estimated LOC |
|------|------|---------------|
| `src/components/backend/PromotionTab.jsx` | Track A | ~3 |
| `src/components/backend/CouponTab.jsx` | Track A | ~3 |
| `src/components/backend/VoucherTab.jsx` | Track A | ~3 |
| `src/lib/backendClient.js` | Track B1 | ~12 |
| `src/lib/scopedDataLayer.js` | Track B1 | ~3 |
| `src/components/TreatmentFormPage.jsx` | Track B2 | ~8 (useEffect only — useSelectedBranch already wired Phase 14.7.H) |
| `.claude/skills/audit-branch-scope/SKILL.md` + `patterns.md` | Invariant lock | ~30 |
| `.claude/rules/00-session-start.md` | Invariant lock | ~3 |

## Files to create (4)

| File | Purpose | Estimated LOC |
|------|---------|---------------|
| `tests/audit-branch-scope.test.js` (extend) | BS-9 group (8 tests) | ~80 |
| `tests/phase-17-0-bsa-leak-sweep-3-flow-simulate.test.js` | Rule I F1-F5 | ~150 |
| `tests/phase-17-0-marketing-tabs-rtl.test.jsx` | V21-mitigation RTL × 3 tabs | ~120 |
| `~/.claude/projects/F--LoverClinic-app/memory/feedback_branch_switch_refresh.md` | Memory + MEMORY.md index | ~40 |

## Test plan

### `tests/audit-branch-scope.test.js` BS-9 group (~8 tests)

- BS-9.1 — every backend tab importing `list*` from `scopedDataLayer.js` also imports `useSelectedBranch` (or annotates `BS-9 listener-driven`)
- BS-9.2 — every such tab includes `selectedBranchId` in `reload` `useCallback` deps
- BS-9.3 — `PromotionTab.jsx` specifically passes BS-9.1+9.2 (regression guard)
- BS-9.4 — `CouponTab.jsx` specifically passes BS-9.1+9.2 (regression guard)
- BS-9.5 — `VoucherTab.jsx` specifically passes BS-9.1+9.2 (regression guard)
- BS-9.6 — sanctioned exception annotation pattern works (HolidaysTab uses BS-9 listener-driven annotation, audit accepts)
- BS-9.7 — V21-mitigation: BS-9 marker comment present in fixed tabs (institutional memory)
- BS-9.8 — source-grep traversal over all `src/components/backend/**Tab.jsx` files emits zero violations

### `tests/phase-17-0-bsa-leak-sweep-3-flow-simulate.test.js` F1-F5 (Rule I)

- **F1 — Marketing tab branch-switch (3 tabs)**: source-grep that each tab has `useSelectedBranch` import + `selectedBranchId` in deps + `useEffect(() => reload, [reload])` shape.
- **F2 — `listProductGroupsForTreatment` branchId filter**: 4 cases:
  - F2.1: `({branchId: 'X'})` calls `where('branchId','==','X')` on BOTH groups + products
  - F2.2: `({allBranches: true})` skips filter on both
  - F2.3: `()` (no opts) falls back to cross-branch (back-compat for back-end / test paths)
  - F2.4: `({branchId: 'X', allBranches: true})` honors allBranches override
- **F3 — scopedDataLayer auto-inject**: wrapper passes `resolveSelectedBranchId()` through; explicit `branchId` in opts overrides; explicit `allBranches:true` is preserved.
- **F4 — TFP cache reset on branch change**: source-grep that the `useEffect` calls all 4 setState functions and has `[SELECTED_BRANCH_ID]` in deps. (Note: TFP uses `SELECTED_BRANCH_ID` from existing Phase 14.7.H wiring at line 325 — NOT `selectedBranchId`. Marketing tabs use `selectedBranchId` per BS-9 canonical pattern.)
- **F5 — Source-grep regression guards** (V21 mitigation):
  - F5.1: `listProductGroupsForTreatment` declaration accepts opts param
  - F5.2: scopedDataLayer wrapper passes opts as 2nd arg
  - F5.3: TFP imports `useSelectedBranch`
  - F5.4: BS-9 marker comments in PromotionTab/CouponTab/VoucherTab
  - F5.5: anti-regression — no `useCallback(...,[])` with empty deps in branch-scoped tabs that load from scopedDataLayer

### `tests/phase-17-0-marketing-tabs-rtl.test.jsx` (V21-mitigation, ~12 tests)

For each of PromotionTab, CouponTab, VoucherTab:
- mount with mocked `listX` + BranchContext provider with `branchId='A'`
- assert `listX` called once at mount
- update BranchContext to `branchId='B'`
- assert `listX` called again (second call)
- assert tab re-renders with the new data

This is the V21 mitigation: source-grep alone could lock-in broken behavior (a green test for code shape with no actual re-fetch). RTL mount + simulated branch switch verifies the runtime behavior.

### Total test target

- Existing: 4997 pass
- New: ~30-50 across 3 files
- Target: ~5045 pass post-Phase 17.0

## Verification (Rule I item b)

`preview_eval` against running dev server (`localhost:5173`) connected to prod Firestore — **READ ONLY** per locked feedback memory `feedback_no_real_action_in_preview_eval.md`:

1. Boot dev server, log in as admin.
2. Switch top-right BranchSelector to a branch with promotions/coupons → verify items render.
3. Switch to a branch with NO promotions → verify items list goes empty (not stale).
4. Open TFP (create new treatment) → click "กลุ่มยากลับบ้าน" → assert modal shows ONLY current branch's groups.
5. Without closing TFP, switch BranchSelector to a different branch → re-open the same modal → assert NEW branch's data (not phantom).
6. Repeat for "กลุ่มสินค้าสิ้นเปลือง" and "สินค้าสิ้นเปลือง" buttons.

NO clicks on save/delete/cancel buttons during verification (locked rule).

## Risks

1. **TFP cache reset useEffect runs once per mount even on first render** — initial state already empty arrays; setState to empty is a React no-op. Harmless.
2. **`listProductGroupsForTreatment` semantic change**: passing `{}` keeps cross-branch behavior (back-compat for back-end paths and tests). Only callers passing `{branchId}` get filtered. scopedDataLayer wrapper opts in by default, so all UI callers get filtered.
3. **BS-9 audit may flag unrelated tabs**: preview the audit before locking; tabs using `useBranchAwareListener` (already auto-handles re-subscribe) get a `// audit-branch-scope: BS-9 listener-driven` annotation. Run audit; iterate.
4. **`feedback_branch_switch_refresh.md` MEMORY.md index update**: this is a manual file edit on the user's home directory. Per `feedback_no_prelaunch_cleanup_without_explicit_ask.md`, ANY pre-launch H-bis cleanup is user-only. This memory file is NOT pre-launch cleanup (it's an additive feedback memory) but still must be additive — never delete or rewrite existing memories.

## Anti-patterns to avoid (V-history)

- **V12 multi-reader sweep**: when changing `listProductGroupsForTreatment` shape, ensure all callers (TFP × 2: openMedGroupModal + openConsGroupModal) work with the new shape. Both currently pass only `productType` → still works (opts has default `{}`).
- **V21 source-grep lock-in**: BS-9 source-grep tests COMBINED with RTL mount-and-test prevent locking in broken behavior.
- **V14 undefined leaves**: no setDoc writes in this phase. Skip.
- **V18 deploy auth**: NO deploy without explicit "deploy" this turn. Phase 17.0 commit + push only. Deploy gated on user.

## Out of scope (defer to Phase 17.1)

- Cross-branch master-data import on 7 tabs (product-groups, product-units, medical-instruments, holidays, products, courses, df-groups) — separate spec.
- LineSettingsTab พระราม 3 admin entry — outstanding user-triggered action, not part of this phase.
- Hard-gate Firebase custom claim — Phase BS-future.

## Success criteria

- [ ] PromotionTab/CouponTab/VoucherTab visibly re-fetch within ~500ms of branch switch (RTL test asserts re-fetch fires)
- [ ] TFP 3 phantom buttons show fresh per-branch data after branch switch (preview_eval read-only verify)
- [ ] `listProductGroupsForTreatment` accepts and respects `{branchId, allBranches}` opts (F2 tests)
- [ ] BS-9 audit invariant present in skill + green on full codebase + flags violations on regression
- [ ] `feedback_branch_switch_refresh.md` exists in memory + indexed in MEMORY.md
- [ ] Rule L extension sub-bullet present in `.claude/rules/00-session-start.md`
- [ ] `npm test -- --run` passes (target ~5045 from 4997)
- [ ] `npm run build` clean
- [ ] Commit + push (no deploy without "deploy" this turn)

## Implementation order (Rule K work-first test-last)

Per Rule K — multi-stream cycle: complete all source edits → review structure → write tests last as one batch.

**Phase 17.0 stream order**:
1. Track B1 — `listProductGroupsForTreatment` opts + scopedDataLayer wrapper (foundational; tests need this)
2. Track A — Promotion/Coupon/Voucher tab edits (3 files, mechanical)
3. Track B2 — TFP cache reset useEffect (1 file)
4. Invariant lock (a) — audit-branch-scope BS-9 entry in skill + patterns
5. Invariant lock (c) — Rule L extension in 00-session-start.md
6. Invariant lock (b) — feedback memory + MEMORY.md index
7. Review structure across all edits
8. Write tests batch — BS-9 audit group + flow-simulate F1-F5 + RTL × 3 tabs
9. `npm test -- --run` + `npm run build`
10. preview_eval verify on dev server (read-only)
11. Commit + push

Tests are batch-final per Rule K. The brainstorming HARD-GATE (Rule J) was satisfied by this spec; writing-plans is next.
