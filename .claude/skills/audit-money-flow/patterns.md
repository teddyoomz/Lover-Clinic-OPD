# Grep Patterns — Money Flow Audit

Run these in order. Each pattern is tied to one or more invariants. For each match, Read the surrounding code to diagnose.

---

## M1 — Deposit usageHistory double-apply guard

```
Grep: "usageHistory" in src/lib/backendClient.js, output_mode=content, -n=true, -A=4
```
Look for guards like `usageHistory.some(u => u.saleId === saleId)`. If absent in `applyDepositToSale`, that's a WARN.

Also grep the caller:
```
Grep: "applyDepositToSale" in src/, output_mode=content, -n=true, -C=3
```
Check SaleTab saga for upstream dedup (e.g., only called when deposit not already linked).

## M2 — usedAmount + usageHistory paired writes

```
Grep: "usedAmount" in src/lib/backendClient.js, output_mode=content, -n=true, -C=2
```
Every assignment to `usedAmount` should co-locate with push/splice on `usageHistory`.

## M3 — recalcCustomerDepositBalance call sites

```
Grep: "recalcCustomerDepositBalance" in src/, output_mode=content, -n=true
```
Expected call sites (all 4):
- After createDeposit
- After applyDepositToSale
- After reverseDepositUsage
- After cancelDeposit
Count calls; if any missing → VIOLATION.

## M4 — Payment channels sum = netTotal

```
Grep: "payment.channels|payment\\.channels" in src/, output_mode=content, -n=true, -A=3
```
Find `updateSalePayment` and any other channels writer. Verify status='paid' only when sum >= netTotal. Verify overpay handling.

```
Grep: "status === 'paid'|status == 'paid'|paid.*channels" in src/, output_mode=content, -n=true, -B=2 -A=2
```

## M5 — Wallet tx/balance atomicity

```
Grep: "runTransaction" in src/lib/backendClient.js, output_mode=content, -n=true, -A=15
```
For each runTransaction in wallet code (lines 1084–1260), check what's inside the tx vs outside. Look for `setDoc(walletTxDoc` AFTER the tx ends → WARN.

Also:
```
Grep: "walletTxDoc|walletTransactionDoc" in src/lib/backendClient.js, output_mode=content, -n=true, -B=3 -A=3
```

## M6 — Balance formula audit

```
Grep: "balance[: =]|balance =|balance:" in src/lib/backendClient.js, output_mode=content, -n=true, -B=1 -A=1
```
Find every place wallet balance is recomputed. Compare assignment to `before + amount` vs `before - amount`.

## M7 — totalUsed refund behavior

```
Grep: "totalUsed" in src/lib/backendClient.js, output_mode=content, -n=true, -C=3
```
In `refundToWallet`, confirm `totalUsed` is NOT modified (intentional per domain rule).

## M8 — loyaltyPoints update in earn/reverse

```
Grep: "loyaltyPoints" in src/lib/backendClient.js, output_mode=content, -n=true, -C=3
```
Verify customer.finance.loyaltyPoints is updated atomically with point tx log.

## M9 — Silent catch on finance update

```
Grep: "catch\\s*\\(\\s*[a-zA-Z_]+\\s*\\)\\s*\\{[^}]*console\\.error" in src/lib/backendClient.js, output_mode=content, -n=true, -B=5 -A=5, multiline=true
```
Look specifically around lines 1640–1680 for catch blocks that only log-and-continue.

## M10 — Discount percent rounding

```
Grep: "billDiscount|discount.*percent|\\* rawDiscount / 100" in src/lib/financeUtils.js, output_mode=content, -n=true, -C=3
```
Check for `Math.round(* 100) / 100` wrapping or `.toFixed(2)` around discount calc.

## M11 — Billing conservation (calcSaleBilling)

```
Read src/lib/financeUtils.js:1-120
```
Full read; derive algebra: subtotal === discount + membershipDiscount + depositUsed + walletUsed + netTotal.

## M12 — Float drift in channels.reduce

```
Grep: "\\.reduce\\s*\\(" in src/lib/backendClient.js, output_mode=content, -n=true, -C=2
```
Look for channel sum, confirm result isn't compared to exact float value.

## M13 — bahtPerPoint safety

```
Grep: "bahtPerPoint|Math\\.floor" in src/lib/financeUtils.js, output_mode=content, -n=true, -C=3
```
Confirm guards for divisor=0, purchase<=0.

## M14 — VAT/tax handling

```
Grep: "tax|vat|VAT|Vat" in src/lib/financeUtils.js src/lib/backendClient.js, output_mode=content, -n=true
```
If no matches: assumption is tax-inclusive. Mark as **documented assumption**.

## M15 — Sale cancel reversal completeness

```
Read src/components/backend/SaleTab.jsx:920-1040
```
Trace the cancel flow. Expected function calls:
- reverseStockForSale(saleId)
- reverseDepositUsage(deposit, sale) (per deposit)
- refundToWallet (per wallet tx)
- reversePointsEarned(saleId)
- removeLinkedSaleCourses(saleId) (via cancelBackendSale or separate)

Missing any → VIOLATION.

## Cross-cutting greps

### Empty catch blocks anywhere in backend
```
Grep: "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}" in src/lib/backendClient.js, output_mode=content, -n=true, multiline=true
```
Empty catch = silent error = audit gap.

### setDoc outside runTransaction for money writes
```
Grep: "setDoc\\(" in src/lib/backendClient.js, output_mode=content, -n=true, -B=3
```
For each setDoc, check if it's inside a runTransaction callback. If it's a money-related doc (deposit, wallet, point) and it's OUTSIDE, that's a WARN.
