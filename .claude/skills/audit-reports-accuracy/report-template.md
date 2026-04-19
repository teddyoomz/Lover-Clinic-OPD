# Report Template — Reports Accuracy Audit

Use this format. Print directly to chat — do NOT write to disk.

---

## Header

```
# Reports Accuracy Audit — <YYYY-MM-DD>
**Scope**: <full | quick | tab=<id>>
**Tabs covered**: <list of *.jsx report tabs scanned>
**Aggregators covered**: <list of *Aggregator.js files scanned>
```

## Summary line

```
Result: <N> VIOLATION · <M> WARN · <P> PASS
```

If 0 VIOLATION + 0 WARN → "✅ Reports accuracy CLEAN."

## Per-invariant entries (severity-sorted: VIOLATION → WARN → PASS)

For each non-PASS:

```
### AR<N> — <invariant name>
**Severity**: VIOLATION | WARN
**Where**: <file>:<line>
**Expected**: <one sentence>
**Actual**: <one sentence — what the code does>
**Impact**: <one sentence — real-world money/trust consequence>
**Fix hint**: <one sentence — what to change>
```

For PASS (abbreviated):

```
- AR1 ✅ date filter inclusive
- AR2 ✅ empty range returns zero
- AR3 ✅ cancelled excluded by default
... (all 15 if --full)
```

## Trailing checklist (cut-paste as a TODO if violations exist)

```
- [ ] Fix AR<N> at <file>:<line>
- [ ] Add test: <scenario>
- [ ] Re-run /audit-reports-accuracy to confirm
```
