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

---

## V34 patterns (S16-S20, added 2026-04-28)

### S16 — Per-tier per-product conservation

```
Grep: "listStockBatches|listStockMovements" in src/lib/backendClient.js, output_mode=content, -n=true, -C=3
```
For every reader, confirm branchId filter is applied. Then in tests:
```
Grep: "assertConservation\\(" in tests/, output_mode=content
```
Expected: at least one test per tier (branch, central, cross-tier) calls assertConservation.

### S17 — Time-travel / replay consistency

```
Grep: "replayBalanceAtTime|replayMovementsToBalance" in tests/, output_mode=content
```
Expected: at least one test asserts replay balance matches snapshot at midpoint timestamp.

### S18 — Concurrent-write atomicity (writeBatch / runTransaction)

```
Grep: "await updateDoc\\(stockBatchDoc|await setDoc\\(stockMovementDoc" in src/lib/backendClient.js, output_mode=content, -n=true, -B=10
```
Each hit MUST be inside a `runTransaction` callback OR replaced with `wb.update(...)` / `wb.set(...)` inside a `writeBatch`. Naked `await updateDoc(stockBatchDoc(...))` outside a tx is a candidate VIOLATION (V34-class).

### S19 — Component listener alignment

```
Grep: "listStockBatches|listStockMovements" in src/components/backend/, output_mode=content, -n=true, -B=2 -A=5
```
For every read in a component, confirm either `onSnapshot` (live) OR a refresh trigger (state change forces useEffect re-run after sibling-component mutation). Single read on mount with no refresh = WARN (V34's UX layer).

### S20 — Test data prefix discipline

```
Grep: "createStockAdjustment|createStockOrder|createStockTransfer|createStockWithdrawal|createCentralStockOrder|deductStockFor" in tests/, output_mode=content, -n=true, -B=3 -A=2
```
For every call site in tests, the branchId / warehouseId / customerId / productId fixture should be `TEST-` or `E2E-` prefixed. Production IDs (`'main'`, real `'WH-{ts}-{slug}'` from prod data, real `'BR-...'`) = WARN (V33.11 prefix discipline).

### V34 marker grep

```
Grep: "AUDIT-V34" in src/, output_mode=content, -n=true
```
Locate every deferred-bug flag added during V34 systemic audit (Phase 2). Future maintainers can pick these up + close them in V35.

---

## Phase 15.5 patterns (S21-S25, added 2026-04-28)

### S21 — Per-product warning thresholds wired to balance panel

```
Grep: "alertDayBeforeExpire|alertQtyBeforeOutOfStock|alertQtyBeforeMaxStock" in src/components/backend/StockBalancePanel.jsx, output_mode=content, -n=true
```
Expected: each field name appears ≥ 2× (in `productThresholdMap` setter + aggregator pass-through). The 3 helpers `isExpiryWarning` / `isLowStockWarning` / `isOverStockWarning` must each return `false` when their threshold is `null`.

```
Grep: "isExpiryWarning|isLowStockWarning|isOverStockWarning" in src/components/backend/StockBalancePanel.jsx, output_mode=content, -n=true, -C=2
```
Read the panel's useEffect that calls `listProducts()` → builds `productThresholdMap`. Confirm 3 fields are read.

### S22 — No hardcoded thresholds (anti-regression)

```
Grep: "<=\\s*30\\b|<=\\s*5\\b" in src/components/backend/StockBalancePanel.jsx, output_mode=content, -n=true
```
Expected: matches ONLY in display-only contexts (e.g. expiryClass color logic for visual cue), NOT in `displayed`-memo filter logic. If a match is inside `if (showExpiringOnly|showLowStockOnly|showOverStockOnly)` block → VIOLATION.

```
Grep: "showExpiringOnly|showLowStockOnly|showOverStockOnly" in src/components/backend/StockBalancePanel.jsx, output_mode=content, -A=2
```
Each filter branch must call the per-product helper, NOT inline threshold math.

### S23 — ActorPicker branchIds[] filter (5 panels)

```
Grep: "listAllSellers\\s*\\(\\s*\\{\\s*branchId:" in src/components/backend/, output_mode=files_with_matches
```
Expected: 5 hits — StockAdjustPanel + OrderPanel + CentralStockOrderPanel + StockTransferPanel + StockWithdrawalPanel.

Anti-regression:
```
Grep: "listAllSellers\\s*\\(\\s*\\)" in src/components/backend/Stock*Panel.jsx src/components/backend/OrderPanel.jsx src/components/backend/CentralStockOrderPanel.jsx, output_mode=content
```
Expected: ZERO hits. Bare `listAllSellers()` call in any stock-mutation panel = filter bypass.

```
Grep: "mergeSellersWithBranchFilter" in src/lib/backendClient.js, output_mode=content, -n=true
```
Expected: pure helper exported + invoked by `listAllSellers`.

### S24 — Withdrawal approval endpoint contract

```
Read: api/admin/stock-withdrawal-approve.js (full file)
```
Confirm ALL of:
- `verifyAdminToken` imported + called with `(req, res)` + `if (!caller) return`
- `req.method !== 'POST'` → 405
- `req.method === 'OPTIONS'` → 204
- `db.batch()` invoked per action + `batch.commit()` per action (≥ 2 each)
- `type: 15` (handleApprove) + `type: 16` (handleReject)
- `qty: 0` + `skipped: true` on both audit movements
- Approve `batch.update(withdrawalRef, ...)` payload does NOT include `status:` (soft approval)
- Reject payload includes `status: 3` (CANCELLED)
- `.slice(0, 500)` cap on note + reason
- `alreadyApproved: true` idempotent return on duplicate approve
- `Number(data.status) !== 0` status guard before action

```
Grep: "stock-withdrawal-approve" in src/, output_mode=files_with_matches
```
Expected: src/lib/stockWithdrawalApprovalClient.js (Bearer ID-token wrapper) + src/components/backend/WithdrawalDetailModal.jsx (UI buttons gated by `useTabAccess().isAdmin`).

### S25 — Unit dropdown master + product merge

```
Grep: "unitDatalistOptions" in src/components/backend/ProductFormModal.jsx, output_mode=content, -n=true, -B=1 -A=3
```
Expected: `useMemo` declaration with deps `[units, productUnits]` + datalist render iterating it. Master loop iterates `units` first (source: 'master'), product loop iterates `productUnits` second (source: 'product'), both check `seen.has(name)` for dedup.

Anti-regression:
```
Grep: "units\\.flatMap\\(u\\s*=>" in src/components/backend/ProductFormModal.jsx, output_mode=content
```
Expected: ZERO (old shape removed; new merged form replaces it).

```
Grep: "listProducts\\(\\)\\.catch" in src/components/backend/ProductFormModal.jsx, output_mode=content
```
Expected: 1 match (non-fatal product fetch — degrades to empty array without breaking the form if listProducts fails).
