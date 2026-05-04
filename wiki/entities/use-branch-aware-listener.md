---
title: useBranchAwareListener
type: entity
entity-type: hook
date-created: 2026-05-04
date-updated: 2026-05-04
tags: [bsa, layer-3, react-hook, onsnapshot, branch-scope]
source-count: 2
---

# `useBranchAwareListener` — BSA Layer 3 React hook

> Wraps any `listenToX(args, onChange, onError)` from `backendClient.js`. Handles branchId injection into the args, automatic re-subscribe on branch switch, ref-stable callbacks, and clean unmount. Universal listeners (marked `__universal__:true`) bypass branch logic entirely.

## Location

`F:/LoverClinic-app/src/hooks/useBranchAwareListener.js` — ~60 lines.

## Why a hook (not just a wrapper)

Layer 2 (`scopedDataLayer.js`) auto-injects branchId AT CALL TIME — perfect for one-shot reads. But onSnapshot listeners need lifecycle handling that a wrapper can't provide:
- Unsubscribe the OLD subscription when branch changes
- Re-subscribe with the NEW branchId
- Don't tear-down on every render (stable callbacks via refs)
- Skip re-subscribe entirely for universal listeners (customer-attached data spans branches; pointless to tear down)

A React hook owns the `useEffect` lifecycle. Layer 3.

## Signature

```js
useBranchAwareListener(listenerFn, args, onChange, onError);
```

| Arg | Shape | Notes |
|---|---|---|
| `listenerFn` | function or null | Backendclient `listenToX`. Null/undefined → no-op. |
| `args` | object OR positional | If object: branchId merged in via spread. If string/number/array: pass-through (positional listeners). |
| `onChange` | (data) => void | Stored in ref — updates without re-subscribe. |
| `onError` | (err) => void | Same. |

## Internal logic

```js
const { branchId } = useSelectedBranch();
const onChangeRef = useRef(onChange);
const onErrorRef = useRef(onError);
useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
useEffect(() => { onErrorRef.current = onError; }, [onError]);

const isUniversal = listenerFn?.__universal__ === true;
// Universal listeners ignore branchId — exclude from deps so no re-subscribe.
const effectiveBranchId = isUniversal ? null : branchId;

useEffect(() => {
  if (!listenerFn) return;
  let enrichedArgs;
  if (isUniversal) enrichedArgs = args;
  else if (typeof args === 'object' && !Array.isArray(args)) enrichedArgs = { ...args, branchId };
  else enrichedArgs = args; // positional pass-through
  const unsub = listenerFn(enrichedArgs, ...);
  return () => { try { unsub?.(); } catch {} };
}, [listenerFn, effectiveBranchId, JSON.stringify(args)]);
```

## Listener classification (Phase BSA Task 3)

| Listener | Marker | Rationale |
|---|---|---|
| `listenToCustomer` | `__universal__:true` | Customer doc is universal — switching branch shouldn't tear down customer detail listener |
| `listenToCustomerTreatments` | `__universal__:true` | Customer-attached |
| `listenToCustomerAppointments` | `__universal__:true` | Customer-attached |
| `listenToCustomerSales` | `__universal__:true` | Customer-attached |
| `listenToCustomerFinance` | `__universal__:true` | Customer-attached |
| `listenToCourseChanges` | `__universal__:true` | Customer-attached audit trail |
| `listenToAudiences` | `__universal__:true` | Smart segments span branches |
| `listenToUserPermissions` | `__universal__:true` | Per-user permissions |
| `listenToAppointmentsByDate` | (no marker) | Branch-scoped — calendar grid filtered by current branch |
| `listenToAllSales` | (no marker) | Branch-scoped |
| `listenToHolidays` | (no marker) | Branch-scoped (holidays differ per branch) |
| `listenToScheduleByDay` | (no marker) | Branch-scoped (positional args — annotated `listener-direct` exception) |

## Usage examples

### Branch-scoped listener (re-subscribes on switch)

```jsx
import { useBranchAwareListener } from '../../hooks/useBranchAwareListener.js';
import { listenToAllSales } from '../../lib/backendClient.js';
// audit-branch-scope: listener-direct — wired via useBranchAwareListener

useBranchAwareListener(listenToAllSales, { startDate, endDate }, setSales, setError);
```

When admin switches branch via top-right BranchSelector → hook detaches old listener → re-subscribes with new branchId → 1 React render cycle.

### Universal listener (no re-subscribe)

```jsx
useBranchAwareListener(listenToCustomer, customerId, setCustomer, setError);
```

Customer doc is universal — switching branch leaves the listener intact. Eliminates wasteful unsub/sub thrashing on customer-detail pages.

## Audit invariant

**BS-4** (in `/audit-branch-scope`): every branch-scoped `listenTo*` callsite in components MUST be wrapped in `useBranchAwareListener` OR have `// audit-branch-scope: listener-direct` annotation (for positional-arg listeners that don't fit the hook's args contract).

## Cross-references

- Concept: [Branch-Scope Architecture](../concepts/branch-scope-architecture.md) — the pattern this hook embodies
- Sibling: [`scopedDataLayer.js`](scoped-data-layer.md) — Layer 2 (one-shot reads)
- Source: [BSA design spec](../sources/bsa-spec.md) §2.3 (Layer 3)
- Source: [BSA implementation plan](../sources/bsa-plan.md) Task 5

## Limitations + follow-up

- Positional-arg listeners (`listenToAppointmentsByDate(dateStr, opts)`) don't fit the hook's `args`-as-object contract and use the listener-direct annotation pattern (raw `useEffect` with branchId in deps). Acceptable but inconsistent.
- File-level annotation `audit-branch-scope: listener-direct` is broad — once present, every direct call in that file is exempt. Per-line annotation would be tighter (deferred per Task 8 review).
- `T8.1` test only verifies the hook is imported, not actively called — could be tightened to `useBranchAwareListener\(` (call form). Deferred.

## History

- 2026-05-04 — Created (Task 5, commit `df48944`). 11 BS3.* tests cover subscribe/re-subscribe/unmount/refs/universal-bypass/edge cases.
- 2026-05-04 — Used by 3 components after Task 8 migration: HolidaysTab, AppointmentTab (listenToHolidays), AppointmentFormModal (listenToHolidays). 2 listener-direct annotations on AppointmentTab for positional listeners.
