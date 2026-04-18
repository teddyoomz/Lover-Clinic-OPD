# Money Flow Invariants — Full Checklist

Each invariant has: **What** (the rule), **Why** (real-world rationale), **Where** (file:line), **How** (how to check), **Expected violation class** (VIOLATION / WARN if different path found).

---

## Deposits (M1–M3)

### M1 — Unique usageHistory per saleId
**What**: For every deposit doc, `usageHistory[*].saleId` values are unique. No deposit can be applied to the same sale twice.
**Why**: Applying a 1000-THB deposit twice to the same sale means the customer "pays" 2000 via deposit for a 1000 sale. Money created from nothing. Double-entry bookkeeping violation.
**Where**: `src/lib/backendClient.js:937–968` (`applyDepositToSale`)
**How**:
1. Read `applyDepositToSale`
2. Check whether it guards against `existing usageHistory.some(u => u.saleId === saleId)` before pushing
3. Check whether `reverseDepositUsage` removes the entry (so re-apply after reverse is OK)
**Acceptable**: Guard exists and throws, OR guard is intentional absence because caller (SaleTab) already ensures uniqueness via saga. Document which.

### M2 — usedAmount = sum(usageHistory.amount)
**What**: `deposit.usedAmount === usageHistory.reduce((s, u) => s + u.amount, 0)`
**Why**: If these drift, `remaining = amount - usedAmount` is wrong → future applies can over-withdraw or leak.
**Where**: `src/lib/backendClient.js:742–760` (deposit recalc path)
**How**: Find every place that writes `usedAmount`. Confirm each is paired with push/splice to `usageHistory`.

### M3 — customer.finance.depositBalance = sum(active deposits).remaining
**What**: The summary field on the customer doc matches the sum computed from deposit docs.
**Why**: UI reads the summary for "available balance" display. If stale, customer sees wrong balance; admin over-commits.
**Where**: `src/lib/backendClient.js:742–760` (`recalcCustomerDepositBalance`)
**How**: Confirm recalc is called after EVERY deposit mutation: createDeposit, applyDepositToSale, reverseDepositUsage, cancelDeposit. Grep for `recalcCustomerDepositBalance` — count calls.

---

## Wallet (M5–M7)

### M5 — Wallet tx and balance atomicity
**What**: For every walletTx doc that exists, the corresponding wallet balance update also happened (and vice-versa).
**Why**: Current pattern at `topUpWallet` is `runTransaction(update balance)` + `setDoc(txLog)` as two separate ops. If server crashes between, balance updated but no audit log (or log exists but balance isn't).
**Where**: `src/lib/backendClient.js:1084–1125, 1128–1170, 1173–1214, 1217–1260`
**How**: Read each of topUp/deduct/refund/adjust. Confirm the critical writes are in the SAME transaction. If split, mark WARN (orphan risk).

### M6 — wallet.balance = lifetime(topUp) − deduct + refund + adjust
**What**: Net balance == accumulation of all tx types.
**Why**: Lifetime math drift would indicate missed tx logs or missed balance updates.
**Where**: 4 mutation functions. Plus `wallet` summary doc.
**How**: Grep for `balance: ` assignments in wallet code. Verify formula.

### M7 — Refund does NOT decrement totalUsed
**What**: `refundToWallet` adds to balance but does NOT decrement `totalUsed` (a lifetime stat for reporting).
**Why**: Intentional — `totalUsed` reports "money customer has ever used" (gross, not net). Refunds don't erase history.
**Where**: `src/lib/backendClient.js:1190–1191`
**How**: Read refundToWallet. Confirm intentional, document in comment. If it DOES decrement → report as unexpected deviation.

---

## Points (M8–M9)

### M8 — loyaltyPoints consistency
**What**: `customer.finance.loyaltyPoints === sum(point tx log deltas)`
**Why**: If they drift, customer UI shows wrong points or admin gives wrong redemption.
**Where**: `src/lib/backendClient.js:1640, 1675` (earnPoints, reversePointsEarned)
**How**: Read both functions. Confirm finance.loyaltyPoints write is in same tx (or at least called every time).

### M9 — Silent catch on customer doc update
**What**: Catch blocks on finance.loyaltyPoints update at lines 1641, 1676 silently swallow errors.
**Why**: If customer doc doesn't exist (race, soft-delete), tx log captures but summary is stale. Audit trail says "earned 50", summary says 0.
**Where**: `src/lib/backendClient.js:1641, 1676`
**How**: Read both catch blocks. If they just `console.error`, that's a WARN. If they propagate, no issue.

---

## Billing math (M4, M10–M14)

### M4 — Payment channels sum == netTotal
**What**: `sale.payment.channels.reduce((s,c) => s + c.amount, 0) === sale.billing.netTotal` when status is 'paid'.
**Why**: Otherwise report says customer paid 2500, receipt prints 2400, cash drawer off.
**Where**: `src/lib/backendClient.js:665–680` (updateSalePayment)
**How**: Read updateSalePayment. Check whether status='paid' is set only when channels.sum >= netTotal. Check for over/underpay handling.

### M10 — Discount percent rounded to 2 decimals
**What**: `billDiscount = subtotal * rawPercent / 100` must be rounded before storage.
**Why**: 12345 × 7.5% = 925.875. Stored as-is, next recalc can drift: 925.875 vs parseFloat(serialized → 925.87 or 925.88).
**Where**: `src/lib/financeUtils.js:44`
**How**: Read calcSaleBilling. Check whether result is wrapped in `Math.round(* 100) / 100` or similar.

### M11 — Billing conservation
**What**: `subtotal === discount + membershipDiscount + depositUsed + walletUsed + netTotal` (+/- pre-tax offsets if any)
**Why**: If the pieces don't add up, the netTotal is wrong (either customer over- or under-charged).
**Where**: `src/lib/financeUtils.js:33–68`
**How**: Read calcSaleBilling. Derive the formula. Verify algebra.

### M12 — Float accumulation in channels.reduce
**What**: `parseFloat(c.amount).reduce((+))` can drift (0.1 + 0.2 !== 0.3)
**Why**: If customer pays 3× 0.10 THB cash, totalPaid can be 0.30000000000000004, not 0.3. `>= netTotal` comparison might flip to false.
**Where**: `src/lib/backendClient.js:671`
**How**: Read reduce call. Check whether result is rounded before comparison.

### M13 — bahtPerPoint divisor safety
**What**: `points = Math.floor(purchase / bahtPerPoint)` — never negative, never fractional, 0 for purchases < bahtPerPoint.
**Why**: Negative points would cause wallet-like double-entry imbalance. NaN/Infinity would propagate.
**Where**: `src/lib/financeUtils.js:74–79`
**How**: Read calcPointsEarned. Check guards for bahtPerPoint=0, purchase<0, purchase=0.

### M14 — VAT handling documented
**What**: The codebase must be explicit about whether prices are tax-inclusive or tax-exclusive (Thai VAT is 7%).
**Why**: If ever added, VAT must be computed on net-of-discount, not subtotal, per Thai Revenue Code. Silent addition later would change invoice amounts.
**Where**: `src/lib/financeUtils.js` (search for 'tax', 'vat', 'VAT')
**How**: Grep financeUtils for tax. If absent, mark as **documented assumption**: "system is tax-inclusive; VAT not broken out".

---

## Cascade completeness (M15)

### M15 — Sale cancel reverses ALL money flows
**What**: When a sale is cancelled, these must ALL run: reverseStockForSale, reverseDepositUsage (per deposit applied), refundToWallet (per wallet tx), reversePointsEarned, removeLinkedSaleCourses. Order matters for compensating partial failures.
**Why**: Miss any one → customer got value from a sale that no longer exists.
**Where**: `src/components/backend/SaleTab.jsx:930–1020` (cancel modal flow)
**How**: Read cancel flow. Confirm ALL 5 reversals present. Check for short-circuit on error (should compensate, not abort leaving half-done).

---

## Accepted risks (document, don't flag)

- M7's refund-not-decrementing-totalUsed is INTENTIONAL. Confirm in code comment.
- Float arithmetic in M12 is a documented Firestore/JS limitation. If the codebase uses Decimal.js for money, great; if not, acceptable at THB 2-decimal precision IF inputs are always rounded. Audit to confirm no sub-cent inputs.

## How severity is assigned

- **VIOLATION**: current code behavior demonstrably breaks the invariant. E.g., no call to `recalcCustomerDepositBalance` after `cancelDeposit` → deposit balance can drift.
- **WARN**: invariant holds in happy path but is vulnerable. E.g., 2-step wallet tx (balance tx + separate log setDoc) holds 99.99% of the time but orphans possible on crash.
- **PASS**: invariant holds across all code paths analyzed.

## External references embedded here

- **Stripe's idempotency-key pattern** (https://stripe.com/docs/api/idempotent_requests): every `reverseXxx` function should be callable twice with same input and produce same result. Our reversals rely on filtering by `reversedByMovementId IS NULL` — equivalent idempotency, but audit that this actually holds.
- **Double-entry bookkeeping** (Pacioli, 1494): every debit has a matching credit. In our system: every wallet deduct has a matching wallet tx log entry. Every deposit apply has a matching usageHistory entry. Audit the pairings.
- **Thai MOPH controlled-substance audit** (ข้อ 9 พ.ร.บ.ยาเสพติด): movement log retained ≥ 5 years, immutable, must capture time/actor/batch/qty/purpose. Our movement has all these; audit userId+userName are non-null.
- **Banker's rounding** (IEEE 754 round-half-to-even): not required for THB 2-decimal; `Math.round(x * 100) / 100` sufficient. But consistency is key — mixing rounding strategies across functions causes drift.
