# Report Template — Money Flow Audit

Use this format. Output to chat only. Do NOT write to disk.

---

```
# Audit Report — audit-money-flow — <YYYY-MM-DD HH:MM>

## Summary
- Checked: 15 invariants (M1–M15)
- ✅ PASS: {X}
- ⚠️  WARN: {Y}
- ❌ VIOLATION: {Z}
- Scope: {--quick | --full}

## Violations

### [M15] Sale cancel does NOT reverse loyalty points — src/components/backend/SaleTab.jsx:988
**Expected**: `reversePointsEarned(saleId)` called in cancel flow
**Actual**: No call present; only deposits+wallet+courses+stock reversed
**Impact**: CRITICAL. Customer keeps points from a cancelled sale. Over time: points inflation, free redemptions for services never paid.
**Fix hint**: Add `await reversePointsEarned(saleId)` between wallet refund and course removal, within the same try/catch rollback scope.
**Test recommendation**: New adversarial test: create sale, earn 100 points, cancel, assert customer.finance.loyaltyPoints back to baseline.

### [M5] Wallet topUp splits balance update and tx log across transactions — src/lib/backendClient.js:1094–1122
**Expected**: balance write + tx log write atomic (single runTransaction)
**Actual**: balance in runTransaction (line 1094–1105); tx log in separate setDoc (line 1109–1122)
**Impact**: HIGH. Server crash between ops leaves balance updated without log, or log without balance update. No auto-repair.
**Fix hint**: Move `setDoc(walletTxDoc, ...)` INTO the runTransaction callback. Both writes succeed or both fail.
**Test recommendation**: Emulator test with forced transaction abort mid-way; confirm neither doc exists.

## Warnings

### [M1] No idempotency guard on applyDepositToSale — src/lib/backendClient.js:937
**Rationale**: Function does not check whether usageHistory already has an entry for saleId before pushing. Relies on caller (SaleTab) to ensure uniqueness.
**Risk scenario**: Concurrent UI clicks from 2 tabs apply same deposit to same sale twice. usedAmount drifts; remaining goes negative (or caps at 0, depending on Math.max).
**Recommendation**: Add guard: `if (usageHistory.some(u => u.saleId === saleId)) throw new Error('Already applied');` OR document in code that caller must ensure uniqueness (currently no such comment).

### [M9] Silent catch on customer.finance.loyaltyPoints update — src/lib/backendClient.js:1641, 1676
**Rationale**: `try { updateDoc(customer, { 'finance.loyaltyPoints': after }) } catch (e) { console.error(e); }` swallows the exception. Point tx log captures delta; customer summary may be stale.
**Risk scenario**: Admin deletes customer while sale is being closed. updateDoc throws "not found". Point tx log still created. Summary never updated. Audit reports disagree.
**Recommendation**: Either propagate (fail the sale) or emit a dead-letter queue entry (retry later). Current silent swallow is only safe if we have a recovery cron — verify that exists.

## Passing (abbreviated)
- [M2] usedAmount = sum(usageHistory.amount) — recalc path correct at line 748
- [M3] recalcCustomerDepositBalance called in all 4 expected sites
- [M4] Payment channel sum check present, status='paid' gated correctly
- [M6] Wallet balance formula correct (topUp+refund+adjust − deduct)
- [M7] refundToWallet does NOT decrement totalUsed (intentional; documented)
- [M8] loyaltyPoints updated in same function as tx log
- [M10] Discount percent calc: no rounding wrapper (see note in M11 about downstream drift)
- [M11] Billing conservation formula holds algebraically
- [M12] Float reduce: no exact-equality compares found
- [M13] bahtPerPoint guarded (Math.floor)
- [M14] No VAT logic found — **documented assumption: tax-inclusive**

## Meta
- Total mutation paths examined: {N}
- Files read: src/lib/backendClient.js, src/lib/financeUtils.js, src/components/backend/SaleTab.jsx, src/components/backend/DepositPanel.jsx, src/components/backend/WalletTab.jsx
- Grep patterns run: ~15
- Known limitations: this audit doesn't execute code, only reads it. Runtime-only bugs (e.g., race condition that depends on Firestore latency) may be missed.
```

---

## Severity legend
- **VIOLATION** — invariant demonstrably broken. Real money could be lost/created. Fix ASAP.
- **WARN** — invariant holds in tested paths but code shape is fragile. Add tests, add guards, or accept risk with doc.
- **PASS** — invariant verified in code. No action needed.

## Do NOT
- Suggest fixes beyond a single "fix hint" line. Fixing is a separate session.
- Write the report to disk. Chat output only.
- Repeat PASS items in detail — abbreviated list suffices.
