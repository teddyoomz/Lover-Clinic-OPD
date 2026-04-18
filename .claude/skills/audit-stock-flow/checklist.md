# Stock Flow Invariants — Full Checklist

Each invariant: **What**, **Why**, **Where**, **How**, **Severity if violated**.

---

## Batch integrity (S1–S3)

### S1 — remaining ≤ total always
**What**: `batch.qty.remaining ≤ batch.qty.total` at all times.
**Why**: `remaining > total` means stock created from nothing. Could happen if reverse runs too aggressively after partial deduct.
**Where**: `src/lib/stockUtils.js` (all mutations) + `src/lib/backendClient.js` (every updateDoc that writes qty)
**How**: Grep all writes to `batch.qty`. Look for `Math.min(remaining + amt, total)` style caps in reverse paths. If any direct `remaining + amt` without cap → VIOLATION.

### S2 — remaining ≥ 0 always
**What**: Non-negative stock. `remaining < 0` is impossible-state.
**Why**: Negative stock would mean selling what doesn't exist. Usually caught by deduct-guard but could slip through via adjustment.
**Where**: `src/lib/stockUtils.js:deductQtyNumeric` + adjustment code
**How**: Read deductQtyNumeric — confirms `throw if remaining < takeQty`. Read createStockAdjustment (type='reduce') — confirms same guard.

### S3 — Movement log append-only
**What**: No `deleteDoc` call ever targets `be_stock_movements/*`. Only setDoc (create) and updateDoc (reverse back-ref).
**Why**: MOPH audit immutability requirement. A deleted movement is a deleted audit trail.
**Where**: `src/lib/backendClient.js` — all code
**How**: Grep `deleteDoc.*stockMovementDoc` or `deleteDoc\(.*stock_movements`. Should return zero hits.

---

## Movement chain (S4–S5)

### S4 — reversedByMovementId chain intact
**What**: Every movement that has been reversed has `reversedByMovementId` pointing to a valid reverse movement. Every reverse movement has `reverseOf` pointing back to the original.
**Why**: Auditor follows the chain to reconstruct "what happened to this batch". Broken chain = broken audit.
**Where**: `src/lib/backendClient.js:2527–2558` (_reverseOneMovement)
**How**: Read _reverseOneMovement. Confirm both forward and backward pointers are set, and that `reverseOf` is queryable.

### S5 — Concurrent reverse safety
**What**: Two concurrent calls to `reverseStockForSale(saleId)` should not corrupt the chain.
**Why**: Current pattern queries movements-not-yet-reversed, then for each calls `tx.update(movRef, { reversedByMovementId: newRev })`. If two concurrent reverses read the same unreviewed set, both attempt tx.update on the same movRef. Second wins, first loses the back-ref → audit chain broken OR both succeed with different reverseIds → two reverse movements for one forward.
**Where**: `src/lib/backendClient.js:2556` + `reverseStockForSale:2668–2679`
**How**: Read both. Confirm the tx contains a read-verify of `reversedByMovementId === null` BEFORE writing. If not, WARN.

---

## FIFO/FEFO (S6–S9)

### S6 — FEFO ordering monotonic
**What**: Sort is `expiresAt asc, receivedAt asc, nulls last`. No ties broken randomly.
**Why**: Non-monotonic sort means nondeterministic allocation → audit can't reproduce.
**Where**: `src/lib/stockUtils.js:batchFifoAllocate`
**How**: Read the sort comparator. Confirm deterministic tie-breaking.

### S7 — exactBatchId override works
**What**: When caller passes `{ preferExactBatchId: X }`, that batch is used FIRST regardless of FEFO order (as long as it's available).
**Why**: Common case: cancel a sale that used batch A, edit sale to use batch A again — must hit the same batch to keep audit-trail symmetric.
**Where**: `src/lib/stockUtils.js:batchFifoAllocate`
**How**: Read the function. Confirm exactBatchId filter happens before FEFO sort.

### S8 — Depleted batch skipped
**What**: Batches with `status === 'depleted'` must not be allocated from (even if `remaining > 0` by data drift).
**Why**: Depleted status means "batch officially used up"; allocating from it after that is a ghost allocation.
**Where**: `src/lib/stockUtils.js:isBatchAvailable`
**How**: Read isBatchAvailable. Confirm status check comes before remaining check.

### S9 — Expired batch skipped
**What**: Batches with `expiresAt < today` are skipped in FIFO allocation.
**Why**: Selling expired medication is illegal in Thailand. Auditor will pull a "sold batch X on date Y after expiry Z" query.
**Where**: `src/lib/stockUtils.js:hasExpired`
**How**: Read hasExpired. Confirm day-granularity comparison (not ms).

---

## Transfer & Withdrawal (S10–S11)

### S10 — Transfer creates NEW batch at destination
**What**: Transfer status 1→2 creates a new batch doc at destination with `sourceBatchId` back-reference. Does NOT re-parent the source batch.
**Why**: Re-parenting would orphan the source branch's movement history (movements ref oldBranchId but batch.branchId now different). New batch keeps both branches' histories intact.
**Where**: `src/lib/backendClient.js:2949+` (updateStockTransferStatus case 1→2)
**How**: Read the 1→2 branch. Confirm `setDoc(newBatchDoc, {...})` not `updateDoc(sourceBatchDoc, { branchId: newBranch })`.

### S11 — Withdrawal creates NEW batch at destination (same as S10)
**Where**: `src/lib/backendClient.js:3201+`
**How**: Same pattern check.

---

## Audit fields (S12–S13)

### S12 — Every movement has user {userId, userName}
**What**: `movement.user.userId !== null && movement.user.userName !== null` for ALL movements.
**Why**: MOPH requires actor attribution. Null user = anonymous movement = audit failure.
**Where**: `src/lib/backendClient.js:2180–2200` (movement write) + all callers
**How**: Grep every `stockMovementDoc` / `setDoc.*movement`. Check what's passed as `user`. Trace callers: do SaleTab and TreatmentFormPage always pass a valid user?

### S13 — sourceDocPath queryable
**What**: Every movement has `sourceDocPath` set to the full Firestore path of the triggering doc (sale / treatment / order).
**Why**: When auditor asks "why was this batch deducted on Mar 5?", sourceDocPath lets us jump to the exact sale/treatment.
**Where**: `src/lib/backendClient.js:2180–2200`
**How**: Grep for `sourceDocPath`. Confirm every movement-creating function sets it.

---

## Order lifecycle (S14–S15)

### S14 — cancelStockOrder blocked on consumed batches
**What**: If any batch from an order has been consumed (movement type ≠ IMPORT exists), `cancelStockOrder` throws.
**Why**: Otherwise: admin cancels order, batches flip to cancelled, but outgoing sales already happened → downstream inventory is wrong.
**Where**: `src/lib/backendClient.js:1990–2001`
**How**: Read cancelStockOrder. Confirm non-IMPORT movement check throws.

### S15 — updateStockOrder blocks qty edits
**What**: `updateStockOrder` throws if `patch.items[].qty != null`. Only cost/expiresAt editable.
**Why**: Qty changes post-import would desync `batch.qty.total` from movement log.
**Where**: `src/lib/backendClient.js:2091`
**How**: Read updateStockOrder. Confirm explicit throw on qty.

---

## Accepted risks

- Decimal precision for qty (e.g., 0.01 U, 0.5 mg). JavaScript number type sufficient at 2-decimal precision per Phase 8 tests (0.01 round-trips exact). Audit no code paths introduce cumulative drift.
- `includeReversed: false` filter shows "live" movements only. Default for display. When AUDITING, always use `includeReversed: true` to see full chain.

## Severity legend
- **VIOLATION**: invariant demonstrably broken. Stock can vanish/dupe. Fix ASAP.
- **WARN**: holds in happy path, fragile under concurrency or edge cases.
- **PASS**: verified.

## External references
- **Firestore transaction limits**: 500 ops, 10 MB doc size, can't read after write in same tx. Our per-batch tx pattern sidesteps the 500-op limit (each batch = 3 ops: read+update+movement-write).
- **ISO 22000 FEFO traceability**: earliest-expiry-first is the industry norm for cosmetic/medical products. Our default is FEFO with `preferNewest` override for in-session batches (for symmetry with cancel flow).
- **Thai MOPH drug audit (พ.ร.บ.ยา พ.ศ. 2510)**: movement log ≥ 5 years, includes date/actor/batch/qty/purpose. Our movement has all 5 fields.
- **Stripe idempotency pattern** applied to reversals: reverseStockForSale(X) called twice ≡ called once, by filtering `includeReversed: false`. Audit this actually holds.
