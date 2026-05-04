# Phase 17.0 — BSA Leak Sweep 3 + Branch-Refresh Invariant Lock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 3 branch-leak surfaces (Promotion/Coupon/Voucher tabs no-refresh + TFP phantom-data on 3 buttons + branch-blind `listProductGroupsForTreatment`) and codify a project-wide "every tab refreshes immediately on branch switch" invariant via skill BS-9 + memory + Rule L.

**Architecture:** Three-track surgical fix on top of Phase BSA — (A) wire `useSelectedBranch` + `selectedBranchId` deps into 3 marketing tabs that missed the BSA migration, (B) make `listProductGroupsForTreatment` accept `{branchId, allBranches}` opts + auto-inject in scopedDataLayer + clear TFP modal cache state on branch switch, (C) lock the invariant in 3 places: audit-branch-scope BS-9 + feedback memory + Rule L sub-bullet.

**Tech Stack:** React 19 hooks + Firestore SDK (query/where/getDocs) + Vitest + RTL + scopedDataLayer auto-inject + BranchContext.

**Spec:** `docs/superpowers/specs/2026-05-05-phase-17-0-bsa-leak-sweep-3-design.md`

**Predecessor:** Phase BSA (12 tasks `e13f3c5..c5f0a58`) + leak sweeps 1-2 (`17f8ca4`, `45ad80c`).

**Successor:** Phase 17.1 — Cross-Branch Master-Data Import (separate spec).

**Order:** Per Rule K (work-first, test-last) — implementation Tasks 1-9 → review structure → test bank Tasks 10-12 → verify Tasks 13-14 → single bundled commit Task 15. NO commits between tasks.

---

## File Structure

| File | Track | Action |
|---|---|---|
| `src/lib/backendClient.js` | B1 | Modify — `listProductGroupsForTreatment` signature + filtered queries |
| `src/lib/scopedDataLayer.js` | B1 | Modify — wrapper auto-injects branchId |
| `src/components/backend/PromotionTab.jsx` | A | Modify — useSelectedBranch + dep |
| `src/components/backend/CouponTab.jsx` | A | Modify — useSelectedBranch + dep |
| `src/components/backend/VoucherTab.jsx` | A | Modify — useSelectedBranch + dep |
| `src/components/TreatmentFormPage.jsx` | B2 | Modify — useSelectedBranch + cache-reset useEffect |
| `.claude/skills/audit-branch-scope/SKILL.md` | Lock(a) | Modify — BS-9 row in invariant table |
| `.claude/skills/audit-branch-scope/patterns.md` | Lock(a) | Modify — BS-9 grep recipe |
| `.claude/rules/00-session-start.md` | Lock(c) | Modify — Rule L sub-bullet |
| `~/.claude/projects/F--LoverClinic-app/memory/feedback_branch_switch_refresh.md` | Lock(b) | Create — feedback memory |
| `~/.claude/projects/F--LoverClinic-app/memory/MEMORY.md` | Lock(b) | Modify — index line |
| `tests/audit-branch-scope.test.js` | Test | Modify — BS-9 group |
| `tests/phase-17-0-bsa-leak-sweep-3-flow-simulate.test.js` | Test | Create — F1-F5 |
| `tests/phase-17-0-marketing-tabs-rtl.test.jsx` | Test | Create — RTL × 3 |

---

## Task 1: Track B1 — `listProductGroupsForTreatment` accepts `{branchId, allBranches}` opts

**Files:**
- Modify: `src/lib/backendClient.js:8429-8435` (function signature + query refs)

- [ ] **Step 1: Read the current function shape**

Run: `grep -n "listProductGroupsForTreatment" src/lib/backendClient.js`
Expected: line 8429 declaration; multiple internal references in the function body.

- [ ] **Step 2: Edit the function signature + query construction**

Use Edit tool on `src/lib/backendClient.js`. Replace this exact block:

```js
export async function listProductGroupsForTreatment(productType) {
  const targetType = String(productType || '').trim();
  if (!targetType) return [];
  const [groupsSnap, productsSnap] = await Promise.all([
    getDocs(productGroupsCol()),
    getDocs(productsCol()),
  ]);
```

with:

```js
export async function listProductGroupsForTreatment(productType, { branchId, allBranches = false } = {}) {
  const targetType = String(productType || '').trim();
  if (!targetType) return [];
  // Phase 17.0 — accept branchId opts + filter both queries when present.
  // No opts (test/back-end paths) preserves cross-branch behavior.
  const useFilter = branchId && !allBranches;
  const groupsRef = useFilter
    ? query(productGroupsCol(), where('branchId', '==', String(branchId)))
    : productGroupsCol();
  const productsRef = useFilter
    ? query(productsCol(), where('branchId', '==', String(branchId)))
    : productsCol();
  const [groupsSnap, productsSnap] = await Promise.all([
    getDocs(groupsRef),
    getDocs(productsRef),
  ]);
```

- [ ] **Step 3: Verify the edit landed correctly**

Run: `grep -n "listProductGroupsForTreatment\|useFilter\|groupsRef\|productsRef" src/lib/backendClient.js | head -20`
Expected: function declaration with `{ branchId, allBranches = false } = {}` opts; `useFilter` constant; `groupsRef` and `productsRef` query bindings.

NOTE: `query` and `where` are already imported at line 6 of backendClient.js — no additional import needed.

---

## Task 2: Track B1 — scopedDataLayer wrapper auto-injects branchId

**Files:**
- Modify: `src/lib/scopedDataLayer.js:392`

- [ ] **Step 1: Read the current wrapper**

Run: `grep -n "listProductGroupsForTreatment" src/lib/scopedDataLayer.js`
Expected: line 392 — `export const listProductGroupsForTreatment = (...args) => raw.listProductGroupsForTreatment(...args);`

- [ ] **Step 2: Replace pass-through with auto-inject wrapper**

Use Edit tool on `src/lib/scopedDataLayer.js`. Replace:

```js
// ─── Treatment context-specific helper (be_product_groups for TFP modal) ───
export const listProductGroupsForTreatment = (...args) => raw.listProductGroupsForTreatment(...args);
```

with:

```js
// ─── Treatment context-specific helper (be_product_groups for TFP modal) ───
// Phase 17.0 — was a pass-through; now auto-injects branchId so TFP modal
// shows only current-branch product-groups + products. Layer 1 underlying
// lister was extended in same phase to accept opts.
export const listProductGroupsForTreatment = (productType, opts = {}) =>
  raw.listProductGroupsForTreatment(productType, { branchId: resolveSelectedBranchId(), ...opts });
```

- [ ] **Step 3: Verify**

Run: `grep -A 4 "Treatment context-specific" src/lib/scopedDataLayer.js`
Expected: see the new wrapper signature + `resolveSelectedBranchId()` injection.

---

## Task 3: Track A — `PromotionTab.jsx` branch-refresh wire

**Files:**
- Modify: `src/components/backend/PromotionTab.jsx:8-57`

- [ ] **Step 1: Add `useSelectedBranch` import**

Use Edit tool. Replace:

```js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Tag, Calendar, Loader2 } from 'lucide-react';
import { listPromotions, deletePromotion } from '../../lib/scopedDataLayer.js';
import PromotionFormModal from './PromotionFormModal.jsx';
```

with:

```js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Tag, Calendar, Loader2 } from 'lucide-react';
import { listPromotions, deletePromotion } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import PromotionFormModal from './PromotionFormModal.jsx';
```

- [ ] **Step 2: Subscribe to branch context + add to reload deps**

Replace this block:

```js
export default function PromotionTab({ clinicSettings, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  // Phase 13.5.3 — gate promotion delete on promotion_management. Admin
  // bypasses (clinic_promotion_management is the broader admin scope).
  const canDelete = useHasPermission('promotion_management');

  const ac = clinicSettings?.accentColor || '#dc2626';
  const isDark = resolveIsDark(theme);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listPromotions();
      setItems(data);
    } catch (e) {
      setError(e.message || 'โหลดข้อมูลโปรโมชันล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);
```

with:

```js
export default function PromotionTab({ clinicSettings, theme }) {
  // Phase 17.0 (BS-9) — subscribe to branch context so reload re-fires
  // immediately when the user switches the top-right BranchSelector.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  // Phase 13.5.3 — gate promotion delete on promotion_management. Admin
  // bypasses (clinic_promotion_management is the broader admin scope).
  const canDelete = useHasPermission('promotion_management');

  const ac = clinicSettings?.accentColor || '#dc2626';
  const isDark = resolveIsDark(theme);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listPromotions();
      setItems(data);
    } catch (e) {
      setError(e.message || 'โหลดข้อมูลโปรโมชันล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
    // Phase 17.0 (BS-9) — selectedBranchId in deps; listPromotions reads
    // resolveSelectedBranchId() from localStorage internally.
  }, [selectedBranchId]);
```

- [ ] **Step 3: Verify**

Run: `grep -n "useSelectedBranch\|selectedBranchId\|BS-9" src/components/backend/PromotionTab.jsx`
Expected: import line + destructure inside the component + dep + 2 marker comments.

---

## Task 4: Track A — `CouponTab.jsx` branch-refresh wire

**Files:**
- Modify: `src/components/backend/CouponTab.jsx:1-35`

- [ ] **Step 1: Add `useSelectedBranch` import**

Use Edit tool. Replace:

```js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Ticket, Calendar, Loader2 } from 'lucide-react';
import { listCoupons, deleteCoupon } from '../../lib/scopedDataLayer.js';
import CouponFormModal from './CouponFormModal.jsx';
```

with:

```js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Ticket, Calendar, Loader2 } from 'lucide-react';
import { listCoupons, deleteCoupon } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import CouponFormModal from './CouponFormModal.jsx';
```

- [ ] **Step 2: Subscribe + add to deps**

Replace:

```js
export default function CouponTab({ clinicSettings, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  // Phase 13.5.3 — gate coupon delete on coupon_management.
  const canDelete = useHasPermission('coupon_management');

  const ac = clinicSettings?.accentColor || '#dc2626';
  const isDark = resolveIsDark(theme);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await listCoupons()); }
    catch (e) { setError(e.message || 'โหลดคูปองล้มเหลว'); setItems([]); }
    finally { setLoading(false); }
  }, []);
```

with:

```js
export default function CouponTab({ clinicSettings, theme }) {
  // Phase 17.0 (BS-9) — subscribe to branch context so reload re-fires
  // immediately when the user switches the top-right BranchSelector.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  // Phase 13.5.3 — gate coupon delete on coupon_management.
  const canDelete = useHasPermission('coupon_management');

  const ac = clinicSettings?.accentColor || '#dc2626';
  const isDark = resolveIsDark(theme);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await listCoupons()); }
    catch (e) { setError(e.message || 'โหลดคูปองล้มเหลว'); setItems([]); }
    finally { setLoading(false); }
    // Phase 17.0 (BS-9) — listCoupons reads resolveSelectedBranchId() internally.
  }, [selectedBranchId]);
```

- [ ] **Step 3: Verify**

Run: `grep -n "useSelectedBranch\|selectedBranchId\|BS-9" src/components/backend/CouponTab.jsx`
Expected: import + destructure + dep + 2 marker comments.

---

## Task 5: Track A — `VoucherTab.jsx` branch-refresh wire

**Files:**
- Modify: `src/components/backend/VoucherTab.jsx`

- [ ] **Step 1: Read VoucherTab structure first**

Run: `head -45 src/components/backend/VoucherTab.jsx`

Expected: similar structure to PromotionTab/CouponTab — top-of-file imports + `export default function VoucherTab(...)` with `reload = useCallback(..., [])`.

- [ ] **Step 2: Add `useSelectedBranch` import + subscribe + add to deps**

Use Edit tool. Locate the import block and add `useSelectedBranch` import on a new line right after the scopedDataLayer import:

```js
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
```

Then locate the function body — the first `const` after `export default function VoucherTab(...)` — and prepend:

```js
  // Phase 17.0 (BS-9) — subscribe to branch context so reload re-fires
  // immediately when the user switches the top-right BranchSelector.
  const { branchId: selectedBranchId } = useSelectedBranch();
```

Then locate the `useCallback` defining `reload` and change its deps from `[]` to `[selectedBranchId]`. Add a marker comment above the deps:

```js
    // Phase 17.0 (BS-9) — listVouchers reads resolveSelectedBranchId() internally.
  }, [selectedBranchId]);
```

- [ ] **Step 3: Verify**

Run: `grep -n "useSelectedBranch\|selectedBranchId\|BS-9" src/components/backend/VoucherTab.jsx`
Expected: import + destructure + dep + 2 marker comments.

---

## Task 6: Track B2 — TFP modal cache reset on branch change

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx`

> **🚨 Wiki-first review correction (2026-05-05)** — TFP **already** imports `useSelectedBranch` at line 25 (Phase 14.7.H follow-up A — branch-aware sale + stock writes) AND destructures at line 325 as `SELECTED_BRANCH_ID` (uppercase snake-case). 7 existing usage sites use this name. The fix is JUST a new useEffect that uses the EXISTING `SELECTED_BRANCH_ID` variable. DO NOT add a duplicate import. DO NOT introduce a parallel `selectedBranchId` destructure.

- [ ] **Step 1: Verify current state matches wiki claim**

Run: `grep -n "useSelectedBranch\|SELECTED_BRANCH_ID" src/components/TreatmentFormPage.jsx | head -10`

Expected output: line 25 (import), line 325 (destructure), and 7+ usage sites at 672, 673, 2325, 2335, 2405, 2566, 2707. If this doesn't match, STOP and re-verify before proceeding.

- [ ] **Step 2: Locate existing `SELECTED_BRANCH_ID` destructure**

Run: `grep -n "const { branchId: SELECTED_BRANCH_ID }" src/components/TreatmentFormPage.jsx`

Expected: ONE match at approximately line 325. (If line number drifted slightly due to other edits, take the actual line number — call it `L_destructure`.)

- [ ] **Step 3: Insert cache-reset useEffect AFTER the existing destructure**

Use Edit tool. Find the exact line at line 325 (or the matching line from Step 2):

```js
  const { branchId: SELECTED_BRANCH_ID } = useSelectedBranch();
```

Replace it with:

```js
  const { branchId: SELECTED_BRANCH_ID } = useSelectedBranch();

  // Phase 17.0 (BS-9) — clear modal caches on branch switch so subsequent
  // opens re-fetch fresh data for the new branch instead of returning stale
  // cached results from the previous branch. Mirrors PromotionTab/CouponTab/
  // VoucherTab BS-9 pattern. The modal openers (openMedModal /
  // openMedGroupModal / openConsModal / openConsGroupModal) preserve their
  // `if (cache.length > 0) return;` early-return for cheap re-opens within
  // a branch. Uses the EXISTING SELECTED_BRANCH_ID (Phase 14.7.H wiring) —
  // do not introduce a parallel selectedBranchId.
  useEffect(() => {
    setMedAllProducts([]);
    setMedGroupData([]);
    setConsAllProducts([]);
    setConsGroupData([]);
  }, [SELECTED_BRANCH_ID]);
```

NOTE: If `useEffect` is not yet imported in TFP, add it to the existing `react` import. Check via `grep "^import.*from 'react'" src/components/TreatmentFormPage.jsx` — if `useEffect` not in the list, add it.

- [ ] **Step 4: Verify**

Run: `grep -n "Phase 17.0\|setMedAllProducts(\[\])\|setMedGroupData(\[\])\|setConsAllProducts(\[\])\|setConsGroupData(\[\])\|\\[SELECTED_BRANCH_ID\\]" src/components/TreatmentFormPage.jsx`

Expected: new useEffect block with all 4 setState calls + `[SELECTED_BRANCH_ID]` deps + Phase 17.0 marker comment.

- [ ] **Step 5: Build sanity-check**

Run: `npm run build 2>&1 | tail -20`

Expected: clean. Catches duplicate imports / undefined identifiers / syntax errors that grep can't.

---

## Task 7: Invariant lock (a) — `audit-branch-scope` skill BS-9 entry

**Files:**
- Modify: `.claude/skills/audit-branch-scope/SKILL.md`
- Modify: `.claude/skills/audit-branch-scope/patterns.md`

- [ ] **Step 1: Read current SKILL.md to understand structure**

Run: `head -80 .claude/skills/audit-branch-scope/SKILL.md`

Expected: front-matter + invariant table BS-1..BS-8 with description + grep target + sanctioned exception annotation.

- [ ] **Step 2: Add BS-9 row to SKILL.md invariant table**

Find the BS-8 row in the invariant table. Add a new row directly after it:

```markdown
| **BS-9** | Branch-switch refresh discipline | Every backend tab importing `list*` from `scopedDataLayer.js` must also import `useSelectedBranch` and include `selectedBranchId` in `useCallback`/`useEffect` deps. Sanctioned exception for tabs using `useBranchAwareListener` (auto re-subscribes). | `// audit-branch-scope: BS-9 listener-driven` |
```

If the table format differs, match the existing column headers exactly (Description / Trigger / Annotation / etc.).

- [ ] **Step 3: Add BS-9 grep recipe to patterns.md**

Append to `.claude/skills/audit-branch-scope/patterns.md`:

```markdown

---

## BS-9 — Branch-switch refresh discipline

### Bash
```bash
# Find all backend tab files that import a branch-scoped lister from scopedDataLayer.
git grep -lE "from ['\"](\\.\\./)+lib/scopedDataLayer" -- "src/components/backend/" \
  | xargs -I {} sh -c '
      # For each file, check whether it imports useSelectedBranch OR has
      # the BS-9 listener-driven sanctioned annotation.
      if grep -qE "useSelectedBranch|audit-branch-scope: BS-9 listener-driven" "{}"; then
        :  # OK
      else
        echo "BS-9 violation: {} imports scopedDataLayer but missing useSelectedBranch + dep"
      fi
    '
```

### PowerShell
```powershell
git grep -lE "from ['\""](\.\./)+lib/scopedDataLayer" -- "src/components/backend/" |
  ForEach-Object {
    $file = $_
    $content = Get-Content -Path $file -Raw -ErrorAction SilentlyContinue
    if ($content -notmatch "useSelectedBranch|audit-branch-scope: BS-9 listener-driven") {
      "BS-9 violation: $file imports scopedDataLayer but missing useSelectedBranch + dep"
    }
  }
```

**Expected**: empty (or only annotated listener-driven tabs).

**If non-empty**: the new tab imports a branch-scoped lister but won't re-fetch when the user switches branches. Either (a) add `useSelectedBranch` import + `selectedBranchId` in `useCallback`/`useEffect` deps, or (b) if the tab uses `useBranchAwareListener`, add `// audit-branch-scope: BS-9 listener-driven` annotation at file top.

**Why**: Phase 17.0 (2026-05-05) closed Promotion/Coupon/Voucher branch-leak gap. Without BS-9, future tabs can silently regress — `scopedDataLayer.js` auto-injects branchId at call time but React only re-runs `reload` when a dep changes; without `selectedBranchId` in deps, the tab never re-fetches after a branch switch.
```

- [ ] **Step 4: Verify**

Run: `grep -n "BS-9" .claude/skills/audit-branch-scope/SKILL.md .claude/skills/audit-branch-scope/patterns.md`

Expected: at least 5 hits across both files (table row + recipe section + headings).

---

## Task 8: Invariant lock (c) — Rule L sub-bullet in `00-session-start.md`

**Files:**
- Modify: `.claude/rules/00-session-start.md`

- [ ] **Step 1: Locate Rule L block**

Run: `grep -n "^**L\.\|Rule L" .claude/rules/00-session-start.md | head -3`

Expected: line number of the existing Rule L heading.

- [ ] **Step 2: Append BS-9 sub-bullet to Rule L**

Use Edit tool. Locate the END of the existing Rule L block (last bullet before the next iron-clad rule heading or before the `---` separator). Add a new sub-bullet at the end:

```markdown
- **Branch-refresh discipline (BS-9, 2026-05-05)**: every branch-scoped tab importing `list*` from `scopedDataLayer.js` MUST subscribe to `useSelectedBranch` AND include `selectedBranchId` in the data-loading hook's deps array (`useCallback`/`useEffect`). Phase 17.0 closed Promotion/Coupon/Voucher gap (PromotionTab/CouponTab/VoucherTab were imported from scopedDataLayer but had `useCallback(..., [])` empty deps → branch switch never triggered re-fetch). `useBranchAwareListener` is a sanctioned exception (auto-handles re-subscribe) — annotate `// audit-branch-scope: BS-9 listener-driven`. Audit BS-9 enforces.
```

- [ ] **Step 3: Verify**

Run: `grep -n "BS-9\|Branch-refresh discipline" .claude/rules/00-session-start.md`

Expected: at least 1 hit — the new sub-bullet.

---

## Task 9: Invariant lock (b) — feedback memory + MEMORY.md index

**Files:**
- Create: `~/.claude/projects/F--LoverClinic-app/memory/feedback_branch_switch_refresh.md`
- Modify: `~/.claude/projects/F--LoverClinic-app/memory/MEMORY.md`

- [ ] **Step 1: Create the feedback memory file**

Use Write tool. Path: `C:\Users\oomzp\.claude\projects\F--LoverClinic-app\memory\feedback_branch_switch_refresh.md`

Content:

```markdown
---
name: branch-switch refresh discipline
description: Every branch-scoped backend tab MUST refresh data immediately when the user switches the top-right BranchSelector. Locked Phase 17.0 (2026-05-05) after PromotionTab/CouponTab/VoucherTab silently failed to re-fetch on branch switch.
type: feedback
---

# Branch-switch refresh discipline (Phase 17.0 lock)

**Rule:** Every backend tab that imports a branch-scoped lister from `src/lib/scopedDataLayer.js` MUST also (a) import `useSelectedBranch` from `src/lib/BranchContext.jsx`, (b) destructure `selectedBranchId`, and (c) include `selectedBranchId` in the dep array of the `useCallback`/`useEffect` that loads data.

**Why:** `scopedDataLayer.js` auto-injects `resolveSelectedBranchId()` AT CALL TIME by reading localStorage. But React only re-runs `reload` when a dep changes. Without `selectedBranchId` in deps, the call never happens again after mount → branch switch is silent.

**How to apply:** When creating or editing a backend tab that loads branch-scoped data, mirror the canonical pattern from `ProductGroupsTab.jsx:32-67`:

```js
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
...
const { branchId: selectedBranchId } = useSelectedBranch();
...
const reload = useCallback(async () => { ... }, [selectedBranchId]);
useEffect(() => { reload(); }, [reload]);
```

Sanctioned exception: tabs that use `useBranchAwareListener` already auto-handle re-subscribe on branch switch — annotate the file with `// audit-branch-scope: BS-9 listener-driven` at the top.

**Audit:** BS-9 in `.claude/skills/audit-branch-scope/SKILL.md` + `patterns.md`. Build-blocking via `tests/audit-branch-scope.test.js` BS-9 group.

**Project rule mirror:** `.claude/rules/00-session-start.md` Rule L sub-bullet (Phase 17.0).

**Past violations:** Phase 17.0 — PromotionTab/CouponTab/VoucherTab missed the BSA migration (Phase BSA Task 6 mass import migration changed the import path to scopedDataLayer but did NOT add `useSelectedBranch` because the original tabs didn't use it). User reported: "เปลี่ยนสาขาข้างบนขวาแล้ว ไม่ refresh ข้อมูล". Fixed in Phase 17.0.
```

- [ ] **Step 2: Add index line to MEMORY.md**

Read `~/.claude/projects/F--LoverClinic-app/memory/MEMORY.md`. Find the section listing feedback_*.md memories (search for `feedback_anti_vibe_code` or `feedback_continuous_improvement` to anchor). Add this line in alphabetical / contextual placement near the BSA-related feedback memories:

```markdown
- **[feedback_branch_switch_refresh.md](feedback_branch_switch_refresh.md)** — 🆕 **Every branch-scoped tab MUST re-fetch on top-right BranchSelector switch**. Locked Phase 17.0 (2026-05-05) after PromotionTab/CouponTab/VoucherTab silently failed. Audit BS-9 + Rule L sub-bullet enforce.
```

- [ ] **Step 3: Verify**

Run:
```
ls ~/.claude/projects/F--LoverClinic-app/memory/feedback_branch_switch_refresh.md
grep -n "feedback_branch_switch_refresh" ~/.claude/projects/F--LoverClinic-app/memory/MEMORY.md
```

Expected: file exists; one index entry hit.

---

## Task 10: Test bank — BS-9 audit group in `tests/audit-branch-scope.test.js`

**Files:**
- Modify: `tests/audit-branch-scope.test.js`

- [ ] **Step 1: Read existing test structure**

Run: `head -50 tests/audit-branch-scope.test.js && echo '---' && grep -n "^describe\|BS-[0-9]" tests/audit-branch-scope.test.js | head -20`

Expected: Vitest describe blocks for BS-1..BS-8 + helper imports.

- [ ] **Step 2: Append BS-9 describe block**

Use Edit tool. At the END of the file (just before any final closing brace), append a new `describe` block:

```javascript
// ─── BS-9 — Branch-switch refresh discipline (Phase 17.0, 2026-05-05) ──────
//
// Every backend tab that imports a branch-scoped lister from
// scopedDataLayer.js MUST also import useSelectedBranch + include
// selectedBranchId in the data-loading hook's deps.
//
// Sanctioned exception: tabs using useBranchAwareListener (auto-handles
// re-subscribe) — annotate `// audit-branch-scope: BS-9 listener-driven`.

describe('BS-9 — branch-switch refresh discipline', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const glob = require('glob');

  const backendTabFiles = glob.sync('src/components/backend/**/*Tab.jsx', { cwd: process.cwd() });

  function tabImportsScopedLister(content) {
    return /from\s+['"](\.\.\/)+lib\/scopedDataLayer/.test(content);
  }

  function tabHasBranchSubscription(content) {
    return /useSelectedBranch/.test(content)
      || /audit-branch-scope:\s*BS-9 listener-driven/.test(content);
  }

  function tabHasSelectedBranchInDeps(content) {
    // Look for at least one useCallback or useEffect with selectedBranchId in deps.
    return /useCallback\([\s\S]+?\},\s*\[[^\]]*selectedBranchId[^\]]*\]/.test(content)
      || /useEffect\([\s\S]+?\},\s*\[[^\]]*selectedBranchId[^\]]*\]/.test(content)
      || /audit-branch-scope:\s*BS-9 listener-driven/.test(content);
  }

  it('BS-9.1 every tab importing scopedDataLayer also subscribes to useSelectedBranch', () => {
    const violations = [];
    for (const f of backendTabFiles) {
      const content = fs.readFileSync(f, 'utf8');
      if (tabImportsScopedLister(content) && !tabHasBranchSubscription(content)) {
        violations.push(f);
      }
    }
    expect(violations, `BS-9.1 violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-9.2 every such tab includes selectedBranchId in data-loading hook deps', () => {
    const violations = [];
    for (const f of backendTabFiles) {
      const content = fs.readFileSync(f, 'utf8');
      if (tabImportsScopedLister(content) && tabHasBranchSubscription(content) && !tabHasSelectedBranchInDeps(content)) {
        violations.push(f);
      }
    }
    expect(violations, `BS-9.2 violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it('BS-9.3 PromotionTab passes BS-9.1+9.2 (regression guard)', () => {
    const content = fs.readFileSync('src/components/backend/PromotionTab.jsx', 'utf8');
    expect(tabImportsScopedLister(content)).toBe(true);
    expect(tabHasBranchSubscription(content)).toBe(true);
    expect(tabHasSelectedBranchInDeps(content)).toBe(true);
  });

  it('BS-9.4 CouponTab passes BS-9.1+9.2 (regression guard)', () => {
    const content = fs.readFileSync('src/components/backend/CouponTab.jsx', 'utf8');
    expect(tabImportsScopedLister(content)).toBe(true);
    expect(tabHasBranchSubscription(content)).toBe(true);
    expect(tabHasSelectedBranchInDeps(content)).toBe(true);
  });

  it('BS-9.5 VoucherTab passes BS-9.1+9.2 (regression guard)', () => {
    const content = fs.readFileSync('src/components/backend/VoucherTab.jsx', 'utf8');
    expect(tabImportsScopedLister(content)).toBe(true);
    expect(tabHasBranchSubscription(content)).toBe(true);
    expect(tabHasSelectedBranchInDeps(content)).toBe(true);
  });

  it('BS-9.6 sanctioned exception annotation pattern works', () => {
    // HolidaysTab uses useBranchAwareListener — audit accepts via annotation.
    const content = fs.readFileSync('src/components/backend/HolidaysTab.jsx', 'utf8');
    // Either has useSelectedBranch OR has the listener-driven annotation.
    expect(tabHasBranchSubscription(content)).toBe(true);
  });

  it('BS-9.7 BS-9 marker comments present in the 3 fixed marketing tabs', () => {
    const tabs = ['PromotionTab', 'CouponTab', 'VoucherTab'];
    for (const tab of tabs) {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content).toMatch(/Phase 17\.0|BS-9/);
    }
  });

  it('BS-9.8 source-grep traversal emits zero violations across all backend tabs', () => {
    const allViolations = [];
    for (const f of backendTabFiles) {
      const content = fs.readFileSync(f, 'utf8');
      if (tabImportsScopedLister(content)) {
        if (!tabHasBranchSubscription(content)) allViolations.push(`${f} BS-9.1`);
        if (!tabHasSelectedBranchInDeps(content)) allViolations.push(`${f} BS-9.2`);
      }
    }
    expect(allViolations).toEqual([]);
  });
});
```

NOTE: If the test file uses `import` (ESM) rather than `require`, replace `require('node:fs')` with `import fs from 'node:fs'` at the top of the file. Check the existing file's import style first; match it.

- [ ] **Step 3: Verify the file parses**

Run: `npm test -- --run tests/audit-branch-scope.test.js`
Expected: BS-1..BS-9 all green; if any FAIL, that's a real violation surfaced — fix the source file (not the test).

---

## Task 11: Test bank — flow-simulate F1-F5

**Files:**
- Create: `tests/phase-17-0-bsa-leak-sweep-3-flow-simulate.test.js`

- [ ] **Step 1: Create the file**

Use Write tool. Path: `tests/phase-17-0-bsa-leak-sweep-3-flow-simulate.test.js`

Content:

```javascript
// ─── Phase 17.0 — BSA Leak Sweep 3 + Branch-Refresh Invariant ─────────────
// Rule I full-flow simulate. Five F-groups:
//   F1 marketing tab branch-switch (Promotion/Coupon/Voucher source-grep)
//   F2 listProductGroupsForTreatment branchId filter (4 cases via mock)
//   F3 scopedDataLayer auto-inject (wrapper passes resolveSelectedBranchId)
//   F4 TFP cache reset on branch change (source-grep useEffect shape)
//   F5 source-grep regression guards (V21 mitigation)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

// ─── F1 — Marketing tab branch-switch ─────────────────────────────────────

describe('F1 — Marketing tab branch-switch', () => {
  const tabs = ['PromotionTab', 'CouponTab', 'VoucherTab'];

  for (const tab of tabs) {
    it(`F1.${tab}.1 imports useSelectedBranch from BranchContext`, () => {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content).toMatch(/import\s+\{[^}]*useSelectedBranch[^}]*\}\s+from\s+['"](\.\.\/)+lib\/BranchContext/);
    });

    it(`F1.${tab}.2 destructures branchId: selectedBranchId`, () => {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content).toMatch(/const\s*\{\s*branchId:\s*selectedBranchId\s*\}\s*=\s*useSelectedBranch\(\)/);
    });

    it(`F1.${tab}.3 includes selectedBranchId in reload useCallback deps`, () => {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content).toMatch(/reload[\s\S]+?useCallback\([\s\S]+?\},\s*\[[^\]]*selectedBranchId[^\]]*\]/);
    });

    it(`F1.${tab}.4 useEffect calls reload`, () => {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content).toMatch(/useEffect\(\s*\(\s*\)\s*=>\s*\{\s*reload\(\)\s*;?\s*\}\s*,\s*\[reload\]\s*\)/);
    });
  }
});

// ─── F2 — listProductGroupsForTreatment branchId filter ───────────────────

describe('F2 — listProductGroupsForTreatment branchId filter', () => {
  it('F2.1 declaration accepts {branchId, allBranches} opts', () => {
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    expect(content).toMatch(/listProductGroupsForTreatment\s*\(\s*productType\s*,\s*\{\s*branchId\s*,\s*allBranches\s*=\s*false\s*\}\s*=\s*\{\s*\}\s*\)/);
  });

  it('F2.2 builds groupsRef + productsRef via query+where when branchId set', () => {
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    expect(content).toMatch(/const\s+useFilter\s*=\s*branchId\s*&&\s*!\s*allBranches/);
    expect(content).toMatch(/const\s+groupsRef\s*=\s*useFilter[\s\S]+?query\(productGroupsCol\(\),\s*where\(['"]branchId['"]/);
    expect(content).toMatch(/const\s+productsRef\s*=\s*useFilter[\s\S]+?query\(productsCol\(\),\s*where\(['"]branchId['"]/);
  });

  it('F2.3 falls back to cross-branch when no branchId (back-compat)', () => {
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    // useFilter is FALSE when branchId is empty/null → groupsRef/productsRef = bare col() ref
    expect(content).toMatch(/const\s+groupsRef\s*=\s*useFilter[\s\S]+?:\s*productGroupsCol\(\)/);
    expect(content).toMatch(/const\s+productsRef\s*=\s*useFilter[\s\S]+?:\s*productsCol\(\)/);
  });

  it('F2.4 honors allBranches:true override', () => {
    // Same code path as F2.3 — `allBranches=true` makes useFilter false even with branchId set.
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    expect(content).toMatch(/useFilter\s*=\s*branchId\s*&&\s*!\s*allBranches/);
  });
});

// ─── F3 — scopedDataLayer auto-inject ─────────────────────────────────────

describe('F3 — scopedDataLayer wrapper auto-inject', () => {
  it('F3.1 wrapper signature accepts (productType, opts)', () => {
    const content = fs.readFileSync('src/lib/scopedDataLayer.js', 'utf8');
    expect(content).toMatch(/listProductGroupsForTreatment\s*=\s*\(\s*productType\s*,\s*opts\s*=\s*\{\s*\}\s*\)\s*=>/);
  });

  it('F3.2 wrapper passes resolveSelectedBranchId() as branchId opt', () => {
    const content = fs.readFileSync('src/lib/scopedDataLayer.js', 'utf8');
    expect(content).toMatch(/listProductGroupsForTreatment[\s\S]+?branchId:\s*resolveSelectedBranchId\(\)/);
  });

  it('F3.3 wrapper preserves explicit opts override (spread after default)', () => {
    const content = fs.readFileSync('src/lib/scopedDataLayer.js', 'utf8');
    // Pattern: { branchId: resolveSelectedBranchId(), ...opts }
    expect(content).toMatch(/\{\s*branchId:\s*resolveSelectedBranchId\(\)\s*,\s*\.\.\.opts\s*\}/);
  });
});

// ─── F4 — TFP cache reset on branch change ────────────────────────────────
//
// IMPORTANT: TFP uses SELECTED_BRANCH_ID (uppercase snake-case) per the
// existing Phase 14.7.H wiring at line 325. Marketing tabs use
// `selectedBranchId` per BS-9 canonical pattern. Both forms are valid;
// the F4 regex specifically targets TFP's existing form to avoid
// false-positive failures during Phase 17.0.

describe('F4 — TFP modal cache reset on branch change', () => {
  let tfpContent;
  beforeEach(() => {
    tfpContent = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
  });

  it('F4.1 imports useSelectedBranch', () => {
    expect(tfpContent).toMatch(/import\s+\{[^}]*useSelectedBranch[^}]*\}\s+from\s+['"](\.\.\/)+lib\/BranchContext/);
  });

  it('F4.2 destructures branchId as SELECTED_BRANCH_ID (Phase 14.7.H wiring)', () => {
    expect(tfpContent).toMatch(/const\s*\{\s*branchId:\s*SELECTED_BRANCH_ID\s*\}\s*=\s*useSelectedBranch\(\)/);
  });

  it('F4.3 useEffect clears all 4 modal caches keyed on SELECTED_BRANCH_ID', () => {
    const blockMatch = tfpContent.match(/useEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]+?\}\s*,\s*\[SELECTED_BRANCH_ID\]\s*\)/g) || [];
    const hasResetBlock = blockMatch.some(b =>
      /setMedAllProducts\(\[\]\)/.test(b) &&
      /setMedGroupData\(\[\]\)/.test(b) &&
      /setConsAllProducts\(\[\]\)/.test(b) &&
      /setConsGroupData\(\[\]\)/.test(b)
    );
    expect(hasResetBlock).toBe(true);
  });

  it('F4.4 useEffect deps include [SELECTED_BRANCH_ID]', () => {
    expect(tfpContent).toMatch(/setConsGroupData\(\[\]\)\s*;?\s*\}\s*,\s*\[SELECTED_BRANCH_ID\]/);
  });

  it('F4.5 NO duplicate selectedBranchId destructure introduced (anti-regression)', () => {
    // Spec originally called for adding a parallel selectedBranchId destructure;
    // wiki-first review corrected this. Guard the correction.
    expect(tfpContent).not.toMatch(/const\s*\{\s*branchId:\s*selectedBranchId\s*\}\s*=\s*useSelectedBranch\(\)/);
  });
});

// ─── F5 — Source-grep regression guards (V21 mitigation) ─────────────────

describe('F5 — Source-grep regression guards', () => {
  it('F5.1 listProductGroupsForTreatment declaration accepts opts param (Layer 1)', () => {
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    expect(content).toMatch(/listProductGroupsForTreatment\s*\([^)]*\{\s*branchId/);
  });

  it('F5.2 scopedDataLayer wrapper passes opts as 2nd arg (Layer 2)', () => {
    const content = fs.readFileSync('src/lib/scopedDataLayer.js', 'utf8');
    expect(content).toMatch(/raw\.listProductGroupsForTreatment\(\s*productType\s*,\s*\{[^}]*branchId/);
  });

  it('F5.3 TFP imports useSelectedBranch', () => {
    const content = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(content).toMatch(/useSelectedBranch/);
  });

  it('F5.4 BS-9 marker comments in PromotionTab/CouponTab/VoucherTab', () => {
    for (const tab of ['PromotionTab', 'CouponTab', 'VoucherTab']) {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content, tab).toMatch(/Phase 17\.0|BS-9/);
    }
  });

  it('F5.5 anti-regression — no useCallback(...,[]) empty deps in fixed marketing tabs', () => {
    for (const tab of ['PromotionTab', 'CouponTab', 'VoucherTab']) {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      // The reload useCallback must NOT have empty deps array.
      const reloadBlock = content.match(/reload\s*=\s*useCallback\([\s\S]+?\},\s*\[[^\]]*\]/);
      expect(reloadBlock?.[0], `${tab} reload useCallback deps`).toMatch(/selectedBranchId/);
    }
  });
});
```

- [ ] **Step 2: Run the new test file**

Run: `npm test -- --run tests/phase-17-0-bsa-leak-sweep-3-flow-simulate.test.js`

Expected: all F1-F5 groups green (~25 tests pass).

If FAIL: surface real violations — re-check the corresponding source file edits from Tasks 1-6.

---

## Task 12: Test bank — RTL × 3 marketing tabs

**Files:**
- Create: `tests/phase-17-0-marketing-tabs-rtl.test.jsx`

- [ ] **Step 1: Read existing RTL patterns**

Run: `ls tests/*.test.jsx | head -10 && grep -l 'BranchProvider\|BranchContext' tests/ 2>/dev/null | head -5`

Expected: existing RTL tests + at least one example using BranchContext (find the canonical mock-and-mount pattern in this repo).

- [ ] **Step 2: Create the RTL test file**

Use Write tool. Path: `tests/phase-17-0-marketing-tabs-rtl.test.jsx`

Content:

```jsx
// ─── Phase 17.0 — Marketing Tabs RTL — V21 mitigation ─────────────────────
// Source-grep tests can lock in broken behavior. RTL mount + simulated
// branch switch verifies Promotion/Coupon/Voucher tabs ACTUALLY re-fetch
// when the user switches branch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';

// Mock scopedDataLayer with spy listers BEFORE component imports.
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listPromotions: vi.fn(async () => []),
  deletePromotion: vi.fn(async () => {}),
  listCoupons: vi.fn(async () => []),
  deleteCoupon: vi.fn(async () => {}),
  listVouchers: vi.fn(async () => []),
  deleteVoucher: vi.fn(async () => {}),
}));

// Mock BranchContext to expose a controllable selectedBranchId.
const branchState = { branchId: 'BR-A', branches: [{ branchId: 'BR-A', name: 'A' }, { branchId: 'BR-B', name: 'B' }] };
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: branchState.branchId }),
  BranchProvider: ({ children }) => children,
}));

// Mock useTabAccess hooks (PromotionTab uses useHasPermission).
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useHasPermission: () => true,
}));

// Mock MarketingTabShell to render its children directly so RTL queries work.
vi.mock('../src/components/backend/MarketingTabShell.jsx', () => ({
  default: ({ children }) => <div data-testid="marketing-shell">{children}</div>,
}));

// Mock form modals (we don't exercise them).
vi.mock('../src/components/backend/PromotionFormModal.jsx', () => ({ default: () => null }));
vi.mock('../src/components/backend/CouponFormModal.jsx', () => ({ default: () => null }));
vi.mock('../src/components/backend/VoucherFormModal.jsx', () => ({ default: () => null }));
vi.mock('../src/lib/marketingUiUtils.js', () => ({ resolveIsDark: () => true }));

import * as scopedDataLayer from '../src/lib/scopedDataLayer.js';
import PromotionTab from '../src/components/backend/PromotionTab.jsx';
import CouponTab from '../src/components/backend/CouponTab.jsx';
import VoucherTab from '../src/components/backend/VoucherTab.jsx';

const settings = { accentColor: '#dc2626' };

beforeEach(() => {
  branchState.branchId = 'BR-A';
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Phase 17.0 RTL — PromotionTab branch refresh', () => {
  it('R1.1 calls listPromotions on initial mount', async () => {
    render(<PromotionTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listPromotions).toHaveBeenCalledTimes(1));
  });

  it('R1.2 calls listPromotions again after branch switch', async () => {
    const { rerender } = render(<PromotionTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listPromotions).toHaveBeenCalledTimes(1));
    // Simulate branch switch by mutating the mocked state and re-rendering.
    await act(async () => {
      branchState.branchId = 'BR-B';
      rerender(<PromotionTab clinicSettings={settings} theme="dark" />);
    });
    await waitFor(() => expect(scopedDataLayer.listPromotions).toHaveBeenCalledTimes(2));
  });

  it('R1.3 does NOT re-fetch when branch unchanged', async () => {
    const { rerender } = render(<PromotionTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listPromotions).toHaveBeenCalledTimes(1));
    rerender(<PromotionTab clinicSettings={settings} theme="dark" />);
    // No state change → no re-fetch. (Note: React strict mode or other re-renders could spuriously
    // trigger; this assertion is loose — we accept up to 1 extra call from harmless React behavior.)
    await waitFor(() => expect(scopedDataLayer.listPromotions.mock.calls.length).toBeLessThanOrEqual(2));
  });

  it('R1.4 marketing-shell renders', async () => {
    render(<PromotionTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId('marketing-shell')).toBeTruthy());
  });
});

describe('Phase 17.0 RTL — CouponTab branch refresh', () => {
  it('R2.1 calls listCoupons on initial mount', async () => {
    render(<CouponTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listCoupons).toHaveBeenCalledTimes(1));
  });

  it('R2.2 calls listCoupons again after branch switch', async () => {
    const { rerender } = render(<CouponTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listCoupons).toHaveBeenCalledTimes(1));
    await act(async () => {
      branchState.branchId = 'BR-B';
      rerender(<CouponTab clinicSettings={settings} theme="dark" />);
    });
    await waitFor(() => expect(scopedDataLayer.listCoupons).toHaveBeenCalledTimes(2));
  });
});

describe('Phase 17.0 RTL — VoucherTab branch refresh', () => {
  it('R3.1 calls listVouchers on initial mount', async () => {
    render(<VoucherTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listVouchers).toHaveBeenCalledTimes(1));
  });

  it('R3.2 calls listVouchers again after branch switch', async () => {
    const { rerender } = render(<VoucherTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listVouchers).toHaveBeenCalledTimes(1));
    await act(async () => {
      branchState.branchId = 'BR-B';
      rerender(<VoucherTab clinicSettings={settings} theme="dark" />);
    });
    await waitFor(() => expect(scopedDataLayer.listVouchers).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 3: Run the RTL test file**

Run: `npm test -- --run tests/phase-17-0-marketing-tabs-rtl.test.jsx`

Expected: ~10 tests pass. If a tab's mock doesn't work due to a missing dep import, add the missing mock above the imports.

Note: this is a V21-mitigation test — DO NOT relax assertions to match broken source. If a test fails, the source is broken.

---

## Task 13: Verify — full test suite + build

- [ ] **Step 1: Run full test suite**

Run: `npm test -- --run 2>&1 | tail -30`

Expected: all tests pass. Target ~5045 (was 4997).

If new tests fail, fix the source (NOT the test) per Rule I + V21 lock. If existing tests fail (unrelated to Phase 17.0 changes), report in plain text — do NOT modify test files outside the Phase 17.0 scope without explicit user authorization.

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -20`

Expected: clean build. No `MISSING_EXPORT` or syntax errors.

V11 lock: `npm run build` is mandatory — focused tests can pass with mock-shadowed imports while the real bundle errors. If build fails on a missing export, grep the export name in the source module + verify the import path.

---

## Task 14: Verify — preview_eval read-only on dev server

- [ ] **Step 1: Start dev server**

Run: `npm run dev` (background)

Wait until `localhost:5173` is reachable (~10s).

- [ ] **Step 2: Verify Promotion/Coupon/Voucher branch switch via preview_eval (READ-ONLY)**

Use the Claude_Preview MCP if available, or open a browser tab manually. Steps:

1. Navigate to `http://localhost:5173/admin` and log in.
2. Switch top-right BranchSelector to a branch with promotions (e.g. นครราชสีมา) → verify Promotion list renders.
3. Switch to a branch without promotions (e.g. พระราม 3) → verify list goes empty WITHIN ~500ms.
4. Same for Coupon + Voucher tabs.
5. Open TFP (create new treatment) → click "กลุ่มยากลับบ้าน" → verify modal shows ONLY current-branch product-groups.
6. Without closing TFP, switch to a different branch → re-open the same modal → verify NEW branch's data (or empty if no data).
7. Repeat for "กลุ่มสินค้าสิ้นเปลือง" and "สินค้าสิ้นเปลือง".

NO clicks on save/delete/cancel buttons on real customer/sale/treatment data per locked rule `feedback_no_real_action_in_preview_eval.md`. READ ONLY.

- [ ] **Step 3: Stop dev server**

Run: `kill <pid>` or terminate the background process.

---

## Task 15: Commit + push (single bundled commit per Rule K)

- [ ] **Step 1: Review git status**

Run: `git status`

Expected: 8 modified files + 4 created files (not counting MEMORY.md if memory dir is git-tracked — it isn't on this project; just the project files).

Verify no unexpected files.

- [ ] **Step 2: Stage Phase 17.0 files explicitly (no `git add -A`)**

```bash
git add \
  src/lib/backendClient.js \
  src/lib/scopedDataLayer.js \
  src/components/backend/PromotionTab.jsx \
  src/components/backend/CouponTab.jsx \
  src/components/backend/VoucherTab.jsx \
  src/components/TreatmentFormPage.jsx \
  .claude/skills/audit-branch-scope/SKILL.md \
  .claude/skills/audit-branch-scope/patterns.md \
  .claude/rules/00-session-start.md \
  tests/audit-branch-scope.test.js \
  tests/phase-17-0-bsa-leak-sweep-3-flow-simulate.test.js \
  tests/phase-17-0-marketing-tabs-rtl.test.jsx \
  docs/superpowers/specs/2026-05-05-phase-17-0-bsa-leak-sweep-3-design.md \
  docs/superpowers/plans/2026-05-05-phase-17-0-bsa-leak-sweep-3.md
```

The `feedback_branch_switch_refresh.md` + MEMORY.md updates live in `~/.claude/projects/F--LoverClinic-app/memory/` — that directory is NOT git-tracked in this repo. They are committed only via Claude's auto-memory mechanism, not git.

- [ ] **Step 3: Commit with HEREDOC message**

```bash
git commit -m "$(cat <<'EOF'
fix(phase-17-0-bsa-leak-sweep-3): close 3 branch-leak surfaces + lock BS-9 invariant

Track A — Promotion/Coupon/Voucher tabs missed Phase BSA Task 6 import-migration
follow-up: imported list* from scopedDataLayer but had useCallback(reload,[])
empty deps → branch switch never re-fetched. User report: "เปลี่ยนสาขาแล้ว ไม่
refresh".

Fix: import useSelectedBranch + add selectedBranchId to reload deps. Mirror
ProductGroupsTab.jsx:32-67 canonical pattern. ~3 LOC × 3 files.

Track B — TFP phantom-data on 3 buttons (กลุ่มยากลับบ้าน / กลุ่มสินค้าสิ้นเปลือง /
สินค้าสิ้นเปลือง):
- B1: listProductGroupsForTreatment was branch-blind (getDocs(productGroupsCol())
  + getDocs(productsCol()) with no where('branchId')). scopedDataLayer wrapper
  was a pass-through that didn't auto-inject. Fix: lister accepts {branchId,
  allBranches} opts + filters both queries; wrapper auto-injects.
- B2: TFP modal cache early-returns (if (cachedState.length > 0) return) never
  invalidated on branch switch. Fix: useEffect on selectedBranchId resets all 4
  caches (medAllProducts/medGroupData/consAllProducts/consGroupData). Early-
  return preserved for cheap re-opens within a branch.

Project-wide invariant lock (defense in depth):
- Audit BS-9 in .claude/skills/audit-branch-scope/{SKILL.md,patterns.md} —
  build-blocking grep that every backend tab importing from scopedDataLayer
  also imports useSelectedBranch + has selectedBranchId in deps.
- feedback_branch_switch_refresh.md memory (cross-session reminder).
- Rule L sub-bullet in .claude/rules/00-session-start.md (always-loaded).

Tests (+~45):
- audit-branch-scope.test.js BS-9 group (8 tests)
- phase-17-0-bsa-leak-sweep-3-flow-simulate.test.js F1-F5 (~25 tests)
- phase-17-0-marketing-tabs-rtl.test.jsx (V21 mitigation, ~10 tests)

Verification:
- npm test -- --run → ~5045 pass (was 4997)
- npm run build → clean
- preview_eval READ-ONLY against prod Firestore via dev server:
  branch switch → marketing tabs reload; TFP modals show fresh per-branch data

Spec: docs/superpowers/specs/2026-05-05-phase-17-0-bsa-leak-sweep-3-design.md
Plan: docs/superpowers/plans/2026-05-05-phase-17-0-bsa-leak-sweep-3.md
Predecessor: Phase BSA (e13f3c5..c5f0a58) + leak sweeps 1-2 (17f8ca4, 45ad80c).
Successor: Phase 17.1 — Cross-Branch Master-Data Import (separate spec).

Closes user reports:
- "โปรโมชั่น คูปอง vorcher เวลาเปลี่ยนสาขาข้างบนขวาแล้ว ไม่ refresh ข้อมูล"
- "ปุ่ม กลุ่มยากลับบ้าน, กลุ่มสินค้าสิ้นเปลือง, สินค้าสิ้นเปลือง ในหน้าสร้างการ
  รักษาใหม่ยังหลอน"

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push to master**

```bash
git push origin master
```

Expected: clean push. master moves from `f39760b` to a new commit that bundles all Phase 17.0 changes.

- [ ] **Step 5: Verify post-commit**

Run: `git log --oneline -3 && git status`

Expected: Phase 17.0 commit at HEAD; working tree clean; no unpushed commits.

- [ ] **Step 6: Update SESSION_HANDOFF.md + .agents/active.md**

Per `/session-end` skill convention. Will be done in the wrap-up turn AFTER user verifies the deploy is wanted (or not). Phase 17.0 commit should be marked "ahead-of-prod" until the next "deploy" command.

NO `vercel --prod` or `firebase deploy` this turn unless user explicitly says "deploy" THIS turn (V18 lock).

---

## Self-review checklist (run at end before user hand-off)

- [ ] All 8 modified files have BS-9 / Phase 17.0 markers as specified
- [ ] All 4 created files (3 tests + 1 memory) exist and match the spec
- [ ] Audit BS-9 covered in BOTH SKILL.md (table row) AND patterns.md (recipe)
- [ ] Rule L sub-bullet in 00-session-start.md is at end of Rule L block
- [ ] feedback memory has type:feedback frontmatter + Why + How to apply lines per global memory schema
- [ ] No `npm test` failures unrelated to Phase 17.0 (if any, surface in plain text)
- [ ] `npm run build` clean
- [ ] preview_eval verified READ-ONLY (no destructive clicks)
- [ ] Single bundled commit per Rule K (no per-task commits)
- [ ] Push complete, commit visible at master HEAD
- [ ] No deploy ran (V18 lock)

---

## Risks + V-history mitigations applied

| Risk | Mitigation |
|---|---|
| V11 mock-shadowed export | Build mandatory in Task 13 |
| V12 multi-reader sweep | listProductGroupsForTreatment back-compat: no opts → cross-branch (existing test/back-end paths still work) |
| V14 undefined leaves | No setDoc writes in this phase. N/A |
| V18 deploy without auth | Task 15 explicitly stops at push; deploy gated on user "deploy" THIS turn |
| V21 source-grep lock-in | RTL tests in Task 12 verify runtime re-fetch, not just code shape |
| V36-class missing test | All listers under change have F2 tests; all UI under change has RTL test |
| Rule J brainstorming HARD-GATE | Satisfied — spec written + approved BEFORE this plan |
| Rule K work-first test-last | Tasks 1-9 source first; Tasks 10-12 tests batch; Task 15 single commit |
| Rule L BSA discipline | This phase IS the BSA discipline — closing leaks + locking BS-9 |

---

## Spec coverage check

Spec sections traced to tasks:

| Spec section | Tasks |
|---|---|
| Track A fix shape (3 files) | Tasks 3, 4, 5 |
| Track B1 — Layer 1 lister opts | Task 1 |
| Track B1 — Layer 2 wrapper auto-inject | Task 2 |
| Track B2 — TFP cache reset | Task 6 |
| Invariant lock (a) skill BS-9 | Task 7 |
| Invariant lock (b) feedback memory | Task 9 |
| Invariant lock (c) Rule L extension | Task 8 |
| BS-9 audit tests | Task 10 |
| Flow-simulate F1-F5 | Task 11 |
| RTL × 3 marketing tabs | Task 12 |
| Verification (npm test + build) | Task 13 |
| preview_eval read-only verify | Task 14 |
| Commit + push (no deploy) | Task 15 |

All spec sections covered. No gaps.
