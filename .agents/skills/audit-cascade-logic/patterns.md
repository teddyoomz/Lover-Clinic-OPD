# Grep Patterns — Cascade Logic Audit

---

## C1, C2 — Sale cancel/delete reversal completeness

```
Read src/components/backend/SaleTab.jsx:900-1050
```
Trace handleConfirmCancel + handleDelete. Expected functions called:
- reverseStockForSale
- reverseDepositUsage (in loop per applied deposit)
- refundToWallet (in loop per wallet tx)
- reversePointsEarned
- removeLinkedSaleCourses (inside cancelBackendSale or explicitly)
- cancelBackendSale / deleteBackendSale

Missing any → VIOLATION.

```
Grep: "reverseStockForSale|reverseDepositUsage|refundToWallet|reversePointsEarned|removeLinkedSaleCourses" in src/components/backend/SaleTab.jsx, output_mode=content, -n=true
```

## C3 — Treatment delete reverses stock

```
Read src/lib/backendClient.js:100-130
```
Read deleteBackendTreatment. Check for reverseStockForTreatment call.

```
Grep: "deleteBackendTreatment|reverseStockForTreatment" in src/, output_mode=content, -n=true, -C=3
```
Look for wrapper in BackendDashboard or TreatmentFormPage that reverses stock before delete.

## C4 — Course deduction uses name+product

```
Read src/lib/backendClient.js:145-210
```
Read deductCourseItems. Confirm Step 1 (courseIndex + nameMatch + productMatch) and Step 2 (fallback) both present. Confirm matcher is AND not OR.

## C5 — hasSale flag sync

```
Grep: "hasSale|linkedSaleId" in src/, output_mode=content, -n=true, -C=2
```
Find all reads/writes. Look for code that updates hasSale when a sale is cancelled. If absent → VIOLATION.

## C6 — Medication hasSale split

```
Read src/components/TreatmentFormPage.jsx
```
Specifically the save hook around lines 1540-1680. Find the split logic: `if (hasSale) { ... } else { deduct medications ... }`.

```
Grep: "hasSale|medications" in src/components/TreatmentFormPage.jsx, output_mode=content, -n=true, -B=2 -A=2
```

## C7, C8 — purchasedItems/courseItems not deducted in treatment stock

```
Read src/lib/backendClient.js:2626-2668
```
Read deductStockForTreatment. Confirm `items` parameter is built from medications+consumables+treatmentItems ONLY. purchasedItems and courseItems must NOT be in the list.

```
Grep: "purchasedItems|courseItems" in src/lib/backendClient.js, output_mode=content, -n=true, -C=2
```

## C9 — recalcCustomerDepositBalance call sites

```
Grep: "recalcCustomerDepositBalance" in src/, output_mode=content, -n=true
```
Count call sites. Expected ≥ 4 (create, apply, reverse, cancel).

## C10 — runTransaction scope

```
Grep: "runTransaction" in src/lib/backendClient.js, output_mode=content, -n=true, -A=30
```
For each tx, count doc refs and writes. Use Read with large context if any tx spans > 20 lines.

## C11 — Sale saga loop structure (per-batch tx not wrapped)

```
Read src/lib/backendClient.js:2410-2470
```
Read _deductOneItem. Confirm runTransaction is INSIDE the for-loop over allocations, not wrapping the whole function.

## C12 — Reverse idempotency filter

```
Grep: "includeReversed|reversedByMovementId.*null|reverseOf" in src/lib/backendClient.js, output_mode=content, -n=true, -C=3
```
Confirm each reverse function queries "not already reversed" to guarantee idempotency.

## C13 — Empty catches in mutation paths

```
Grep: "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}|catch\\s*\\([^)]*\\)\\s*\\{\\s*console\\.(error|warn|log)" in src/lib/backendClient.js src/components/, output_mode=content, -n=true, multiline=true, -B=2 -A=1
```
For each match, assess: is the enclosing function a mutation path (sale/treatment/deposit/wallet/points/stock write)? If yes → WARN/VIOLATION.

## C14 — Atomic counter for INV

```
Grep: "INV-|invoiceNumber|runTransaction.*counter" in src/lib/backendClient.js, output_mode=content, -n=true, -C=5
```
Read invoice generation. Confirm tx-based atomic read-update.

## C15 — Soft-delete filter consistency

```
Grep: "isActive" in src/lib/backendClient.js, output_mode=content, -n=true, -C=2
```
For each list API that reads from a collection with isActive field, confirm default filter excludes `isActive: false`. Confirm `{ includeInactive: true }` override exists for audit/admin views.

## Cross-cutting

### All mutation entry points

```
Grep: "^export async function (create|update|delete|cancel|apply|reverse|deduct|refund|topUp|adjust|earn|assign|remove)" in src/lib/backendClient.js, output_mode=content, -n=true
```
Output: catalog of all mutation entry points. For each, trace: does it have a reverse function? Does it update a summary doc? Does it use runTransaction?

### New modals introduced in Phase 8d++

```
Read src/components/backend/OrderDetailModal.jsx
Read src/components/backend/TransferDetailModal.jsx
Read src/components/backend/WithdrawalDetailModal.jsx
```
Check: do they trigger mutations? If so, do those mutations go through backendClient's safe paths (updateStockOrder, cancelStockOrder)?
