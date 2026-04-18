# Grep Patterns — Stock Flow Audit

Run each pattern, Read surrounding code, decide severity.

---

## S1 — qty caps (remaining ≤ total)

```
Grep: "qty.*remaining|remaining.*total|buildQtyNumeric" in src/lib/stockUtils.js src/lib/backendClient.js, output_mode=content, -n=true, -A=2
```
Find every place qty is written. Check for caps like `Math.min(remaining + amt, total)`. Specifically look at _reverseOneMovement for the cap.

## S2 — qty floors (remaining ≥ 0)

```
Grep: "deductQtyNumeric|insufficient|remaining < " in src/lib/stockUtils.js src/lib/backendClient.js, output_mode=content, -n=true, -C=3
```

## S3 — No deleteDoc for movements

```
Grep: "deleteDoc.*movement|deleteDoc.*stock_movement" in src/, output_mode=content, -n=true
```
Expected: 0 matches. Any match is VIOLATION.

## S4 + S5 — reversedByMovementId chain

```
Grep: "reversedByMovementId|reverseOf" in src/lib/backendClient.js, output_mode=content, -n=true, -B=2 -A=3
```
Read every place this is set. Verify:
- Forward movement gets `reversedByMovementId` set once (not overwritten)
- Reverse movement gets `reverseOf` set on creation
- Query `includeReversed: false` filters BOTH sides

Also read _reverseOneMovement around line 2527–2558 full context:
```
Read src/lib/backendClient.js:2520-2570
```

## S6 — FEFO sort determinism

```
Grep: "sort|batchFifoAllocate|expiresAt" in src/lib/stockUtils.js, output_mode=content, -n=true, -C=5
```
Read the sort comparator. Confirm stable tie-breaking.

## S7 — exactBatchId override

```
Grep: "preferExactBatchId|exactBatchId" in src/lib/stockUtils.js, output_mode=content, -n=true, -C=3
```

## S8 — Depleted batch skip

```
Grep: "isBatchAvailable|status.*depleted|BATCH_STATUS\\.DEPLETED" in src/lib/stockUtils.js, output_mode=content, -n=true, -C=3
```

## S9 — Expired batch skip

```
Grep: "hasExpired|expiresAt < |today" in src/lib/stockUtils.js, output_mode=content, -n=true, -C=3
```

## S10 — Transfer creates new dest batch

```
Read src/lib/backendClient.js:2949-3106
```
Full read of updateStockTransferStatus. Look at case for next=2 (receive). Confirm `setDoc(stockBatchDoc(newBatchId), ...)` with `sourceBatchId: it.sourceBatchId` field.

## S11 — Withdrawal creates new dest batch

```
Read src/lib/backendClient.js:3201-3332
```
Same check as S10.

## S12 — Every movement has user populated

```
Grep: "stockMovementDoc\\(|setDoc.*movement" in src/lib/backendClient.js, output_mode=content, -n=true, -B=2 -A=10
```
For each site, look for `user:` field. Trace back: where does the user value come from? Is it a real caller?

Also grep callers:
```
Grep: "deductStockForSale|deductStockForTreatment|createStockOrder|createStockAdjustment|createStockTransfer|createStockWithdrawal" in src/components/, output_mode=content, -n=true, -A=1 -B=1
```
Check each caller passes a real `{ user: { userId, userName } }`. If any pass `{ userId: '', userName: '' }` → WARN (audit trail has anonymous entries).

## S13 — sourceDocPath on every movement

```
Grep: "sourceDocPath" in src/lib/backendClient.js, output_mode=content, -n=true, -C=2
```
Count vs count of `stockMovementDoc` create sites. Should match.

## S14 — cancelStockOrder non-import check

```
Read src/lib/backendClient.js:1980-2055
```
Confirm: loops batches, queries movements with `includeReversed: true`, filters to `type !== MOVEMENT_TYPES.IMPORT`, throws if any.

## S15 — updateStockOrder qty block

```
Read src/lib/backendClient.js:2069-2115
```
Confirm: `if (pi.qty != null) throw new Error('Qty edits are blocked post-import');`.

## Cross-cutting greps

### Every runTransaction in stock code — check scope

```
Grep: "runTransaction" in src/lib/backendClient.js, output_mode=content, -n=true, -C=10
```
For each tx: count distinct doc refs. If > 10 → flag (approaching 500-op limit if many items).

### Empty catch in stock mutation paths

```
Grep: "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}" in src/lib/backendClient.js src/components/backend/, output_mode=content, -n=true, multiline=true
```

### Every place branchId is written — validate value shape

```
Grep: "branchId:" in src/lib/backendClient.js, output_mode=content, -n=true, -B=1 -A=1
```
Confirm every write has `branchId` sourced from a location-lookup (not free-form string).
