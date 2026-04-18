# Report Template — Stock Flow Audit

Use this format. Chat output only. Do NOT write to disk.

---

```
# Audit Report — audit-stock-flow — <YYYY-MM-DD HH:MM>

## Summary
- Checked: 15 invariants (S1–S15)
- ✅ PASS: {X}
- ⚠️  WARN: {Y}
- ❌ VIOLATION: {Z}
- Scope: {--quick | --full}

## Violations

### [S5] Concurrent reverseStockForSale breaks reversedByMovementId chain — src/lib/backendClient.js:2556
**Expected**: Reverse tx reads movement, verifies `reversedByMovementId === null`, then writes. Second concurrent call fails the verify and throws; only one reverse succeeds.
**Actual**: `tx.update(movRef, { reversedByMovementId: reverseMovementId })` at line 2556 has no verify. Two concurrent reverses both succeed; the second overwrites reversedByMovementId from the first reverse's ID to the second reverse's ID.
**Impact**: HIGH. Audit trail broken. If auditor queries "what reversed this movement?", the answer points to the wrong reverse. Both reverse-movement docs exist, but only one is pointed-to by the original.
**Fix hint**: Wrap in tx: read, verify reversedByMovementId null, then update. OR (simpler) check in reverseStockForSale before dispatching: reject if already being reversed via a sentinel flag.
**Test recommendation**: Emulator-based race test: 2 concurrent reverseStockForSale on same sale; verify exactly one succeeds, or both succeed with consistent chain.

## Warnings

### [S12] Movement user field can be empty string, not null — src/lib/backendClient.js callers
**Rationale**: Callers in SaleTab and TreatmentFormPage may pass `{ user: { userId: '', userName: '' } }` when no seller is selected. Not null, but empty — still passes naive `if (user.userId)` check but violates audit intent.
**Risk scenario**: Admin creates sale without selecting a seller (accident). Stock deducts. Movement logged with empty user. MOPH audit later flags "anonymous drug movement".
**Recommendation**: Enforce at server: reject movements with empty user.userId. OR enforce at UI: require seller selection before save.

## Passing (abbreviated)
- [S1] qty caps present in _reverseOneMovement via Math.min
- [S2] deductQtyNumeric throws on insufficient
- [S3] No deleteDoc targeting be_stock_movements anywhere
- [S4] reversedByMovementId paired with reverseOf back-ref
- [S6] FEFO sort deterministic (expiresAt asc, receivedAt asc, nulls last)
- [S7] exactBatchId filter pre-FEFO
- [S8] isBatchAvailable checks status first
- [S9] hasExpired uses day-granularity
- [S10] Transfer creates new batch at dest with sourceBatchId back-ref
- [S11] Withdrawal creates new batch at dest (same pattern)
- [S13] sourceDocPath set at every movement create site
- [S14] cancelStockOrder loops batches + blocks on non-IMPORT
- [S15] updateStockOrder throws on qty edits

## Meta
- Mutation paths examined: {N}
- Files read: src/lib/backendClient.js, src/lib/stockUtils.js, src/components/backend/*
- Grep patterns run: ~15
- Known limitations: runtime concurrency bugs may not surface in static audit
```

---

## Severity legend
- **VIOLATION**: stock integrity demonstrably broken
- **WARN**: holds in happy path; fragile
- **PASS**: verified

## Do NOT
- Auto-fix. Fixes are a separate session.
- Write to disk. Chat only.
- Re-examine PASS items in detail.
