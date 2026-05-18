# Cascade Logic Invariants — Full Checklist

---

## Cancel/Delete cascades (C1–C3)

### C1 — Sale cancel reverses ALL 5 subsystems
**What**: When a sale is cancelled, these run in order:
1. reverseStockForSale(saleId)
2. reverseDepositUsage(deposit, sale) per each deposit used
3. refundToWallet per each wallet tx linked
4. reversePointsEarned(saleId)
5. removeLinkedSaleCourses(saleId)
Plus cancelBackendSale marks the sale doc as 'cancelled'.
**Why**: Miss any one → value ghost (customer has value from a sale that doesn't exist).
**Where**: `src/components/backend/SaleTab.jsx:955+`
**How**: Read cancel flow (handleConfirmCancel). Verify all 5 called. Verify order is rollback-safe: if step N fails, steps 1..N-1 should be un-done.

### C2 — Sale delete (hard) does same reversals + cancelBackendSale path
**What**: Delete is a superset of cancel — calls all 5 reversals then `deleteBackendSale` instead of `cancelBackendSale`.
**Where**: `src/components/backend/SaleTab.jsx:600+` (handleDelete)

### C3 — Treatment delete reverses stock deductions
**What**: `deleteBackendTreatment` must call `reverseStockForTreatment(treatmentId)` before deleting the treatment doc. Otherwise orphaned stock deduction.
**Why**: Treatment's `deductStockForTreatment` deducted meds/consumables/treatmentItems batches. If treatment is deleted without reversal, those batches stay deducted forever.
**Where**: `src/lib/backendClient.js:106–111` (deleteBackendTreatment)
**How**: Read deleteBackendTreatment. Check for reverseStockForTreatment call. If not present → VIOLATION.
**CURRENTLY KNOWN VIOLATION** per Explore agent — this is the flagship C3 bug.

---

## OPD domain rules (C4–C8)

### C4 — Course deduction by name+product, never raw courseIndex alone
**What**: `deductCourseItems` has Step 1 (match courseIndex + name + product) and Step 2 (fallback: name + product scan). The Step 1 index is only a hint; final correctness depends on name+product match.
**Why**: Form dedups courses; the index after dedup won't match the index in Firestore. Using raw index would deduct the wrong course.
**Where**: `src/lib/backendClient.js:151–206`
**How**: Read deductCourseItems. Confirm Step 2 exists and is reached when Step 1 misses.

### C5 — Sale cancel updates linked treatments' hasSale flag to false
**What**: When a sale is cancelled, any treatment with `linkedSaleId === cancelledSaleId` should have `hasSale=false` (or linkedSaleId cleared).
**Why**: Otherwise the next treatment edit still thinks there's a sale → skips medication deduction → ghost medication stock.
**Where**: `src/components/TreatmentFormPage.jsx` + `src/lib/backendClient.js`
**How**: Grep for `hasSale` assignment. Confirm it updates on sale cancel. This may not exist today — potential VIOLATION.

### C6 — Medication hasSale split consistency
**What**: In treatment form, if `hasSale=true`, medications NOT deducted by treatment (linked sale handles it). If `hasSale=false`, treatment deducts.
**Why**: Prevents double-deduct of same medication stock.
**Where**: `src/components/TreatmentFormPage.jsx` (treatment save hook)
**How**: Read the save hook. Confirm split logic. Check edge case: hasSale=true at save time but sale cancelled mid-save.

### C7 — purchasedItems never deducted in treatment
**What**: `detail.purchasedItems[]` should NEVER flow through stock deduction in treatment hook.
**Why**: They're already deducted via the linked auto-sale (they ARE the sale's items). Double-deduct if treatment also deducts.
**Where**: `src/lib/backendClient.js:deductStockForTreatment` + `src/components/TreatmentFormPage.jsx`
**How**: Read deductStockForTreatment. Confirm purchasedItems is NOT in the items list.

### C8 — courseItems never flow through stock hooks
**What**: `detail.courseItems[]` handled by course subsystem (`deductCourseItems`), not stock subsystem.
**Why**: Two separate data worlds. Cross-routing would double-deduct or route to wrong system.
**Where**: Same as C7
**How**: Confirm deductStockForTreatment excludes courseItems.

---

## Concurrency + transactions (C9–C11, C14)

### C9 — recalcCustomerDepositBalance called after every deposit mutation
**What**: Every deposit CRUD path (create, apply, reverse, cancel) calls `recalcCustomerDepositBalance(customerId)` after the mutation.
**Why**: finance.depositBalance is the summary field used for UI "available balance"; drift → over-commit.
**Where**: `src/lib/backendClient.js:742–760`
**How**: Grep for `recalcCustomerDepositBalance` call sites. Expected ≥ 4 calls.

### C10 — No runTransaction exceeds 500 ops
**What**: Firestore hard limit. Each tx can have at most 500 reads+writes.
**Why**: A single runTransaction wrapping a sale with 50 items × 3 batches would hit 150 writes — fine, but if someone adds more work inside (e.g., course deduction too) could approach 500.
**Where**: Grep `runTransaction` across `src/lib/backendClient.js`
**How**: For each runTransaction, count doc refs + reads + writes. Flag any > 100 as WARN, > 400 as VIOLATION.

### C11 — No single tx wraps a sale of N items where N × 3 > 500
**What**: Per-batch tx pattern must stay per-batch; can't collapse into a mega-tx.
**Where**: `src/components/backend/SaleTab.jsx` saga
**How**: Read saga. Confirm deductStockForSale loops batches, each in own tx (not wrapping the whole loop).

### C14 — Atomic counter pattern for monotonic IDs
**What**: Invoice numbers (INV-123) use runTransaction-based atomic counter so no two sales get same INV. Verify similar pattern exists for any other monotonic ID (ORD, WTX, if sequential needed).
**Why**: Non-atomic counter means two concurrent sales could get same INV → audit collision.
**Where**: `src/lib/backendClient.js` (search for invoice/counter)
**How**: Read invoice generation. Confirm runTransaction + read-update pattern. Check other IDs (most are timestamp+rand, which is fine; only sequential IDs need atomic counter).

---

## Idempotency + silent failures (C12, C13, C15)

### C12 — Reverse* functions idempotent
**What**: Calling `reverseStockForSale(X)` twice should produce same result as once. No errors, no double-reversals.
**Why**: Operator retries after network blip shouldn't corrupt state.
**Where**: `src/lib/backendClient.js` — all functions named `reverse*`
**How**: Read each reverse. Confirm filter "not already reversed" (e.g., `reversedByMovementId == null`). Second call finds nothing to reverse → no-op.

### C13 — No empty catch in mutation paths
**What**: `catch (e) { }` or `catch (e) { console.error(e); }` in code paths that perform money/stock mutations is a silent error → audit gap.
**Where**: All files in mutation paths
**How**: Grep for empty catch or console-only catch. For each match in a mutation path, WARN.

### C15 — Soft-delete consistency
**What**: Entities with `isActive` field must be filtered in list APIs (e.g., list shouldn't show soft-deleted items unless explicitly requested).
**Why**: Soft-deleted central warehouse shouldn't show in dropdown. Soft-deleted product shouldn't be selectable in new orders. But movements/batches referencing it must still resolve (display-only).
**Where**: Central warehouses, master data products, bank accounts, etc.
**How**: Grep for `isActive: false`. Confirm list endpoints filter by default, with explicit `{ includeInactive: true }` override.

---

## Accepted risks

- **C10 runTransaction limit**: static check; actual runtime violation depends on input size. Audit logs operations per sale and flags anomalies.
- **Empty catch in NON-mutation paths**: acceptable if the path is display-only (e.g., fetching supplementary data that's fine to miss).

## Severity legend
- **VIOLATION**: cascade demonstrably breaks; orphaned state can occur under normal usage
- **WARN**: fragile; breaks under specific edge cases (concurrency, crash, race)
- **PASS**: verified

## External references
- **Saga pattern (Microservices.io)**: long-lived transactions across multiple services. Each step has a compensating action. LoverClinic implements this for sale lifecycle (reverseX for each deductX). Audit every deduct has a matching reverse.
- **CQRS / Event sourcing** (Fowler): append-only log of events, state derived by replay. Our movement log is event-sourced stock state. Audit that state can be fully reconstructed from log.
- **Firestore best practices (firebase.google.com/docs)**: runTransaction reads before writes; max 500 writes per tx; can't read after write in same tx.
- **Jepsen distributed systems testing**: concurrent operations expose linearizability violations. Our C5 (concurrent reverseStockForSale) is exactly this class.
