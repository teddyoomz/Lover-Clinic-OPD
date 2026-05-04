---
title: Branch-switch refresh discipline (BS-9)
type: concept
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [branch-scoped, audit, invariant, phase-17-0, bs-9]
source-count: 0
---

# Branch-switch refresh discipline (BS-9)

> Every backend tab that imports a branch-scoped lister from `scopedDataLayer.js` MUST also import `useSelectedBranch` and include `selectedBranchId` in the data-loading hook's dep array, OR delegate re-subscription to `useBranchAwareListener` (annotated `// audit-branch-scope: BS-9 listener-driven`). Without this, switching the top-right BranchSelector silently fails to re-fetch.

## Why this rule exists

[Branch-Scope Architecture](branch-scope-architecture.md) (Phase BSA, 2026-05-04) introduced [scopedDataLayer.js](../entities/scoped-data-layer.md) as the import boundary that auto-injects `branchId` for every UI lister at call time. The auto-inject works correctly: `scopedDataLayer.listPromotions()` reads `resolveSelectedBranchId()` from `localStorage` and passes it to Layer 1 every time it's invoked.

The gap: **React only re-runs `reload` when a dep changes**. If a tab declares `useCallback(reload, [])` with empty deps, the function is stable across renders — even if the user switches the top-right BranchSelector, the `useEffect(() => reload(), [reload])` won't re-fire because `reload` itself never changes. The auto-inject is invoked once at mount with the initial branch, never again.

Phase BSA Task 6 mass-migrated 84 UI files from `import ... from backendClient` to `import ... from scopedDataLayer`. The migration changed the import path but didn't add `useSelectedBranch` to tabs that previously didn't import branch context. Three marketing tabs ([PromotionTab](../entities/promotion-tab.md), [CouponTab](../entities/coupon-tab.md), [VoucherTab](../entities/voucher-tab.md)) ended up with the import-path migration but kept their pre-BSA empty deps → branch-leak surfaced in production V15 #16.

## The rule

For every `src/components/backend/**/*Tab.jsx` file that imports any `list*` (or `getAll*` / `getAppointments*`) function from [scopedDataLayer.js](../entities/scoped-data-layer.md), one of the following MUST be true:

1. **Hook-deps form** — file imports `useSelectedBranch` from [BranchContext](../entities/branch-context.md), destructures `const { branchId: selectedBranchId } = useSelectedBranch();`, and includes `selectedBranchId` in the deps array of the `useCallback` / `useEffect` that calls the lister.

2. **Listener-driven form** — file delegates branch awareness to [useBranchAwareListener](../entities/use-branch-aware-listener.md) (which auto-resubscribes on branch change). Annotate file-top with `// audit-branch-scope: BS-9 listener-driven`.

The hook-deps form is the canonical pattern (used by [ProductGroupsTab](../entities/product-groups-tab.md), [ProductsTab](../entities/products-tab.md), and most master-data tabs). The listener-driven form is the right choice when you want real-time refresh on multi-tab CRUD (used by [HolidaysTab](../entities/holidays-tab.md)).

## Canonical pattern (hook-deps form)

```jsx
import { useState, useEffect, useCallback } from 'react';
import { listPromotions } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

export default function PromotionTab(props) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);

  const reload = useCallback(async () => {
    setItems(await listPromotions());
    // selectedBranchId in deps so reload re-fires on branch switch.
    // listPromotions reads resolveSelectedBranchId() internally.
  }, [selectedBranchId]);

  useEffect(() => { reload(); }, [reload]);
  ...
}
```

## Audit invariant (BS-9)

Codified in [.claude/skills/audit-branch-scope/SKILL.md](../../.claude/skills/audit-branch-scope/SKILL.md) + `patterns.md`. Build-blocking via `tests/audit-branch-scope.test.js` BS-9 group (8 tests).

Grep recipe (Bash):

```bash
git grep -lE "from ['\"](\.\./)+lib/scopedDataLayer" -- "src/components/backend/" \
  | xargs -I {} sh -c '
      if grep -qE "useSelectedBranch|audit-branch-scope: BS-9 listener-driven" "{}"; then
        :
      else
        echo "BS-9 violation: {} imports scopedDataLayer but missing useSelectedBranch + dep"
      fi
    '
```

Expected output: empty (or only annotated listener-driven tabs).

## Project-wide invariant lock (defense in depth)

Per Phase 17.0 design, the rule is locked in three places so a single artifact going stale doesn't silently weaken enforcement:

1. **Skill audit BS-9** — [.claude/skills/audit-branch-scope/SKILL.md](../../.claude/skills/audit-branch-scope/SKILL.md) + `patterns.md`. Build-blocking.
2. **Feedback memory** — `~/.claude/projects/F--LoverClinic-app/memory/feedback_branch_switch_refresh.md`. Cross-session reminder, auto-loaded by Claude Code.
3. **Iron-clad rule** — `.claude/rules/00-session-start.md` Rule L sub-bullet. Always-loaded session boot context.

## Sanctioned exceptions

| Pattern | When | Annotation |
|---|---|---|
| Hook-deps form | Default for one-shot fetches | (none) |
| Listener-driven form | Real-time multi-tab CRUD | `// audit-branch-scope: BS-9 listener-driven` |
| Cross-branch report | Aggregator that reads ALL branches | `// audit-branch-scope: report — uses {allBranches:true}` |

Direct `backendClient.js` imports remain BS-1 violations — BS-9 only applies to imports already going through `scopedDataLayer`.

## Cross-references

- Concept: [Branch-Scope Architecture](branch-scope-architecture.md)
- Concept: [Iron-clad rules A-L](iron-clad-rules.md) (Rule L)
- Entity: [scopedDataLayer.js](../entities/scoped-data-layer.md)
- Entity: [BranchContext + useSelectedBranch](../entities/branch-context.md)
- Entity: [useBranchAwareListener](../entities/use-branch-aware-listener.md)
- Entity: [PromotionTab](../entities/promotion-tab.md), [CouponTab](../entities/coupon-tab.md), [VoucherTab](../entities/voucher-tab.md) — the 3 tabs Phase 17.0 fixed

## History

- 2026-05-05 — Created during wiki backfill cycle, anticipating Phase 17.0 implementation. Page documents the rule + grep recipe + canonical pattern + 3-place lock. Phase 17.0 implements the BS-9 audit invariant + the 3-tab fix; this page co-evolves with that implementation.
