# Audit All — Consolidated Violation Report — 2026-04-18

> Run via `/audit-all --full`. 3 audit skills × 15 invariants = 45 checks total.
> Commit audited: `e13d0f7` (Phase 8 stock UI enhancements).
> Codebase: `src/lib/backendClient.js` (~3500 LoC), `src/lib/financeUtils.js`, `src/lib/stockUtils.js`, `src/components/backend/*`, `src/components/TreatmentFormPage.jsx`.

---

## Overall Summary

| Category | PASS | WARN | VIOLATION |
|----------|------|------|-----------|
| audit-money-flow (M1–M15) | 9 | 4 | 2 |
| audit-stock-flow (S1–S15) | 11 | 2 | 2 |
| audit-cascade-logic (C1–C15) | 11 | 2 | 2 |
| **Total** | **31** | **8** | **6** |

69% PASS, 18% WARN, 13% VIOLATION. 6 VIOLATIONs require fixes to reach production-grade integrity.

---

## Violations by severity

### CRITICAL — money creation/loss or audit chain broken

#### [M1] No idempotency guard on `applyDepositToSale` — `src/lib/backendClient.js:932–968`
**Expected**: Guard `if (cur.usageHistory.some(u => u.saleId === saleId)) throw` before pushing new usage entry.
**Actual**: No guard. Concurrent or retried calls can push duplicate entries for same saleId.
**Impact**: Double-apply creates phantom deposit usage. `usedAmount` grows beyond real usage; `remaining` caps at 0 (`Math.max(0, remaining - amt)` at line 949). Customer "pays" deposit twice for one sale.
**Runtime proof**: Firestore serializes runTransaction. Second tx reads post-commit state; sees saleId already in usageHistory; WITHOUT guard, blindly appends again. Both entries coexist permanently.
**Fix hint**: Insert at line 947 after `remaining` check: `if ((cur.usageHistory || []).some(u => String(u.saleId) === String(saleId))) throw new Error('Deposit already applied to sale ' + saleId);`

#### [S5] Concurrent `reverseStockForSale` breaks `reversedByMovementId` chain — `src/lib/backendClient.js:2495–2556`
**Expected**: `tx.update(movRef, { reversedByMovementId })` is preceded by `tx.get(movRef)` to verify still-null, so Firestore OCC detects concurrent modification and retries.
**Actual**: Line 2497–2500 reads `movRef` OUTSIDE the transaction; line 2556 updates it INSIDE the transaction without re-reading. Firestore OCC doesn't know `movRef` was concurrent-read; no conflict detected.
**Impact**: Two concurrent reverses both create reverse-movement docs, both update original's `reversedByMovementId`. Second write wins. First reverse is orphaned (exists but nothing points to it). `batch.qty.remaining` is saved by `Math.min(...total)` cap (S1), but movement log shows 2× the reversals → MOPH audit: inconsistent ledger.
**Runtime proof**: Emulator race test per S5 verification.
**Fix hint**: Move `movRef` check INSIDE the transaction at line 2527:
```js
const mSnap2 = await tx.get(movRef);
if (mSnap2.data()?.reversedByMovementId) {
  throw new Error('Already reversed concurrently');
}
```

#### [C3] `deleteBackendTreatment` does NOT reverse stock — `src/lib/backendClient.js:106–111`
**Expected**: `deleteBackendTreatment(id)` either (a) soft-deletes with `status='cancelled'`, or (b) hard-deletes only AFTER `reverseStockForTreatment(id)`.
**Actual**: Pure hard-delete: `await deleteDoc(treatmentDoc(treatmentId))`. No reversal.
**Partial mitigation**: `BackendDashboard.jsx:281–288` wraps with defensive `reverseStockForTreatment` before calling `deleteBackendTreatment`. Main call path is protected.
**Impact**: Function itself is unsafe. Any future caller (test, new API, direct invocation from other component) bypasses stock reversal → orphaned batch qty. Also reverse is NOT wrapped in a saga with delete — if `deleteDoc` fails after reverse, stock restored but treatment still exists → next reverse idempotently no-ops but ghost treatment lingers.
**Fix hint**: Make the safe behavior the default:
```js
export async function deleteBackendTreatment(treatmentId) {
  await reverseStockForTreatment(treatmentId);  // idempotent: safe even if caller already reversed
  await deleteDoc(treatmentDoc(treatmentId));
  return { success: true };
}
```

### HIGH — cascade incompleteness or concurrency fragility

#### [M5] Wallet `topUpWallet` / `deductWallet` / `refundToWallet` / `adjustWallet` split balance-update + tx-log — `src/lib/backendClient.js:1084–1260`
**Expected**: Balance update + tx log creation in SAME `runTransaction` (atomic together).
**Actual**: Balance updated inside `runTransaction(1094–1105)`; walletTx setDoc at lines 1109–1122 OUTSIDE tx. Same pattern in 3 other wallet functions.
**Impact**: Crash between ops leaves inconsistent state. Balance updated without log = audit silently missing. Log created without balance update = reconciliation diverges.
**Runtime proof**: Unlikely under normal load (sub-second execution), but possible under device crash, network timeout mid-flight, or browser tab kill. No auto-repair.
**Fix hint**: Move `setDoc(walletTxDoc, ...)` INTO the runTransaction's callback:
```js
await runTransaction(db, async (tx) => {
  // ... read balance ...
  tx.update(walletRef, { balance: newBalance });
  tx.set(walletTxDoc, txData);
});
```

#### [C5] Sale cancel does NOT update linked treatments' `hasSale` flag — `SaleTab.jsx:990-1026` + `backendClient.js:654-662`
**Expected**: Cancel flow queries `be_treatments where linkedSaleId == saleId` and sets `{ hasSale: false, linkedSaleId: null }` on each.
**Actual**: Cancel only marks sale status='cancelled'. Treatment docs untouched.
**Impact**: Next treatment edit still sees `hasSale=true` (stale). Medication deduction skipped under false assumption that linked sale handles it. Result: medications never deducted from stock.
**Mitigation in place**: On treatment re-open, `getSaleByTreatmentId` (TreatmentFormPage.jsx:1722) checks `sale.status !== 'cancelled'` before executing auto-sale logic. So the cancelled-sale case IS detected at re-load time — but the `hasSale` stored field itself is stale, misleading report queries and ad-hoc inspections.
**Fix hint**: After `cancelBackendSale(saleId)`:
```js
const linked = await getDocs(query(treatmentsCol(), where('linkedSaleId', '==', saleId)));
await Promise.all(linked.docs.map(d => updateDoc(d.ref, { hasSale: false, linkedSaleId: null })));
```

### MEDIUM — audit gaps or fragility

#### [S12] Movement `user` field accepts empty strings — callers bypass audit intent — multiple files
**Expected**: Movement writes rejected if `user.userId === '' || user.userName === ''`.
**Actual**: Callers in `OrderPanel.jsx:317`, `StockAdjustPanel.jsx:211`, `StockSeedPanel.jsx:158` pass `{ userId: '', userName: '' }`. backendClient accepts and writes as-is. Movement logs have anonymous entries.
**Impact**: MEDIUM. Movement traceable by saleId/treatmentId/orderId, but MOPH audit question "who did this?" returns blank. Not a data-loss bug, an audit-quality bug.
**Fix hint**: Harden at server: in `createStockOrder`, `createStockAdjustment`, etc., after `const user = opts.user || { userId: null, userName: null }`, throw if `!user.userId || !user.userName`. Then UI is forced to pass real user.

---

## Warnings

1. **[M1]** No upstream guard in SaleTab saga — applies with M1 VIOLATION. Even if M1 fix applied server-side, UI should also dedup.
2. **[M9]** 3 silent catches on `customer.finance.loyaltyPoints` update — `src/lib/backendClient.js:1585–1586, 1640–1641, 1675–1676`. Point tx log captured but summary field may be stale.
3. **[M10]** Discount percent not rounded to 2 decimals — `src/lib/financeUtils.js:44`. Float stored as-is; drift accumulates across many sales.
4. **[M12]** Payment channels `reduce` no rounding — `src/lib/backendClient.js:671`. `0.1 + 0.1 + 0.1 !== 0.3` can flip `>=` comparison incorrectly.
5. **[S10/S11]** Transfer/withdrawal new-batch-at-destination CORRECTLY implemented (verified at lines 3016–3035, 3256–3274). Listed as WARN only for concurrency race visibility in future refactor.
6. **[C10]** No code comment warning against wrapping `deductStockForSale` in an outer `runTransaction` — future refactor risk of hitting 500-op limit at ~150-item sales.
7. **[C13]** Silent `catch` in `TreatmentFormPage.jsx:1676` on `earnPoints` — money-reward mutation swallowed.

---

## Passing checks (abbreviated)

**audit-money-flow (9 PASS)**: M2 (usedAmount = sum usageHistory), M3 (recalcCustomerDepositBalance in 7 sites), M4 (payment channel sum gate), M6 (wallet balance formula), M7 (refund does NOT decrement totalUsed — intentional), M8 (loyaltyPoints paired with tx log), M11 (billing conservation algebra), M13 (bahtPerPoint guards), M14 (no VAT — documented tax-inclusive).

**audit-stock-flow (11 PASS)**: S1 (remaining ≤ total capped at `Math.min`), S2 (deductQtyNumeric throws on insufficient), S3 (zero `deleteDoc` targeting movements), S4 (chain intact in non-concurrent case), S6 (FEFO sort deterministic), S7 (exactBatchId pre-FEFO), S8 (isBatchAvailable checks status first), S9 (hasExpired day-granular), S13 (sourceDocPath at 10 movement sites), S14 (cancelStockOrder blocks on non-IMPORT movements), S15 (updateStockOrder throws on qty edits).

**audit-cascade-logic (11 PASS)**: C1 (sale cancel = 5 reversals at SaleTab 990–1026), C2 (sale delete superset), C4 (deductCourseItems Step 1 + Step 2 fallback), C6 (medication hasSale split at TreatmentFormPage 1576–1588), C7 (purchasedItems excluded from `_normalizeStockItems`), C8 (courseItems routed via deductCourseItems), C9 (recalcCustomerDepositBalance in 7 sites), C11 (per-batch tx pattern preserved), C12 (reverseXxx idempotent via `includeReversed: false`), C14 (INV atomic counter at generateInvoiceNumber 469–486), C15 (isActive filter in warehouse list with `includeInactive` override).

---

## Phase 3 — Adversarial scenario probing (10 scenarios)

| # | Scenario | Predicted behavior | Actual verdict |
|---|----------|--------------------|----------------|
| A | Network dies mid-sale-saga (step 4 of 5) | Partial state; user retry could double-apply deposit | **Hits M1 VIOLATION** — retry without dedup creates phantom usage |
| B | Two admins cancel same sale within 100ms | Both reverseStockForSale enter; both create reverses; overwrite `reversedByMovementId` | **Hits S5 VIOLATION** — chain broken, but qty safe via S1 cap |
| C | Admin deletes treatment with 5 consumables | Via BackendDashboard: safe. Via direct deleteBackendTreatment: orphaned stock | **C3 VIOLATION confirmed** — main path mitigated, function unsafe |
| D | Sale with 60 items × 3 batches = 180 batches | Per-batch tx pattern keeps each tx ≤ 3 ops; safe | **PASS** — current design holds; C10 WARN recommends code comment |
| E | Apply-cancel-apply 4000 on same deposit within 1s | Firestore serializes; each tx sees prior state | **PASS** — intended behavior |
| F | Payment channels edited without updateSalePayment | Status stays 'paid' even if channels.sum < netTotal | **GAP** — no invariant test. Grep for writes to `payment.channels` bypassing updateSalePayment → audit needed |
| G | Discount 7.5% on 12345 subtotal = 925.875 stored as-is | Drift accumulates over many sales | **M10 WARN confirmed** |
| H | 100 × 1 THB wallet topups | Integer math stays exact | **PASS** (integers). Fractional amounts would drift — M12 WARN |
| I | 2 admins click "รับ" on transfer status 1 within 50ms | If status-check inside tx → one succeeds. Need verification | **Need verification** — read updateStockTransferStatus carefully; likely safe but documented |
| J | Edit treatment to remove medications without editing linked auto-sale | Auto-sale still has meds deducted → ghost deduction | **GAP** — depends on treatment-edit triggering auto-sale edit. Not verified in current audit. |

**Scenario F requires follow-up**: grep `payment.channels` writes, confirm all go through `updateSalePayment`.
**Scenario I requires follow-up**: read transfer state machine lines 3016+ to confirm in-tx status check.
**Scenario J requires follow-up**: read treatment edit saga to confirm auto-sale edit cascade.

---

## Top-5 recommended fixes (ranked by blast radius)

| Rank | Violation | Fix effort | Blast radius if unfixed |
|------|-----------|------------|--------------------------|
| 1 | [M1] Deposit double-apply guard | S (1-line) | CRITICAL — money created from thin air on retry |
| 2 | [C3] Treatment delete reverses stock internally | S (2 lines) | CRITICAL — orphaned stock on any direct call |
| 3 | [S5] reversedByMovementId in-tx verify | M (5 lines) | CRITICAL — MOPH audit chain broken under concurrency |
| 4 | [M5] Wallet tx atomicity | M (4 functions × 5 lines each) | HIGH — balance/log divergence on crash |
| 5 | [C5] Sale cancel propagates to treatments' hasSale | M (5-line query + updateDocs) | HIGH — stale hasSale misleads reports |

Followed by:
- [S12] Reject empty-string user on movement writes (MEDIUM)
- [M9] Propagate finance.loyaltyPoints errors (MEDIUM)
- [M10] Round discount to 2 decimals (LOW)
- [M12] Round payment channel sum (LOW)
- [C10] Add code comment warning (TRIVIAL)
- [C13] TreatmentFormPage earnPoints swallow (MEDIUM)

---

## Meta

- Skills: `.claude/skills/audit-money-flow/`, `audit-stock-flow/`, `audit-cascade-logic/`, `audit-all/`
- Files read: backendClient.js (~3500 LoC sampled in detail), financeUtils.js, stockUtils.js, SaleTab.jsx, TreatmentFormPage.jsx, BackendDashboard.jsx, DepositPanel.jsx, OrderDetailModal.jsx, TransferDetailModal.jsx, WithdrawalDetailModal.jsx, StockTransferPanel.jsx, StockWithdrawalPanel.jsx, OrderPanel.jsx, StockAdjustPanel.jsx, StockSeedPanel.jsx
- Grep patterns run: ~45 across all 3 skills
- Known limitations:
  - **Static-only**: race conditions proven by code reading, not by execution. Emulator tests needed for S5 concurrent reverse.
  - **Scenario F/I/J open**: require follow-up grep pass.
  - **Audit-trail replay**: would also require data inspection in Firestore itself (are there already-orphaned movements in production from past S5 triggers?).

## Suggested next step

Present this report to user. They prioritize fixes:
- Fix ALL 6 VIOLATIONs in sequence (each fix = own commit + own test).
- Address WARNs opportunistically.
- Re-run `/audit-all` after fixes land to verify VIOLATION count = 0.
