# Report Template — Cascade Logic Audit

Chat output only. Do NOT write to disk.

---

```
# Audit Report — audit-cascade-logic — <YYYY-MM-DD HH:MM>

## Summary
- Checked: 15 invariants (C1–C15)
- ✅ PASS: {X}
- ⚠️  WARN: {Y}
- ❌ VIOLATION: {Z}
- Scope: {--quick | --full}

## Violations

### [C3] Treatment delete does NOT reverse stock — src/lib/backendClient.js:106–111
**Expected**: `deleteBackendTreatment(id)` calls `reverseStockForTreatment(id)` BEFORE `deleteDoc(treatmentDoc(id))`.
**Actual**: Hard-delete only. Stock movements remain, batch qty stays deducted permanently.
**Impact**: CRITICAL. Orphaned stock deduction. Every deleted treatment silently evaporates inventory from the movement log's perspective but leaves deducted qty in batches. Physical count will not match Firestore.
**Fix hint**: Wrap delete in a mini-saga:
```
await reverseStockForTreatment(id);
await deleteDoc(treatmentDoc(id));
```
OR (safer) keep treatment doc with `status='cancelled'` instead of hard-deleting (soft-delete), so stock reversal + audit trail both preserved.
**Test recommendation**: New test: create treatment with medications → verify batch deducted → deleteBackendTreatment → verify batch restored.

### [C5] Sale cancel does NOT update linked treatments' hasSale flag — src/components/backend/SaleTab.jsx + TreatmentFormPage.jsx
**Expected**: When sale is cancelled, any treatment where `linkedSaleId === cancelledSaleId` has `hasSale=false` (or `linkedSaleId=null`) set.
**Actual**: No such code found.
**Impact**: HIGH. On next treatment edit, the split logic still thinks the sale exists → skips medication deduction → next deduct fails or silently drops medications.
**Fix hint**: In SaleTab.jsx cancel flow, after `cancelBackendSale`, query `be_treatments where linkedSaleId == saleId` and update each: `{ hasSale: false, linkedSaleId: null }`. OR trigger reversal from the treatment side when next edit detects linkedSaleId no longer exists.

## Warnings

### [C13] Silent catches in backendClient.js:1641, 1676 — finance.loyaltyPoints update
**Rationale**: `try { updateDoc(customerDoc, { 'finance.loyaltyPoints': after }) } catch (e) { console.error(e); }` swallows errors. Point tx log still captures delta; customer summary field may be stale.
**Risk scenario**: Customer soft-deleted while sale in-flight. Summary doesn't get updated. Audit shows mismatch.
**Recommendation**: Propagate the error (fail the sale) OR emit a repair-queue entry.

### [C10] Potential runTransaction bloat in future refactors
**Rationale**: Current per-batch tx pattern is safe. But if someone wraps `deductStockForSale` in an outer runTransaction for "atomicity", the 500-op limit will bite at ~150 items.
**Recommendation**: Add a code comment warning against wrapping the whole saga. Current implementation spans many small tx's — that's intentional.

## Passing (abbreviated)
- [C1] Sale cancel reverses stock+deposits+wallet+points+courses — all 5 calls present
- [C2] Sale delete same as cancel + deleteBackendSale
- [C4] deductCourseItems has Step 1 (index+name+product) + Step 2 (name+product fallback)
- [C6] Medication hasSale split logic present in TreatmentFormPage
- [C7] purchasedItems excluded from deductStockForTreatment
- [C8] courseItems routed to course subsystem, not stock
- [C9] recalcCustomerDepositBalance called in 4 sites (create, apply, reverse, cancel)
- [C11] Per-batch tx pattern preserved (not wrapping)
- [C12] All reverseXxx functions filter `reversedByMovementId: null` or `includeReversed: false`
- [C14] Invoice counter uses runTransaction atomic read-update
- [C15] isActive filter present in warehouse list API

## Meta
- Mutation entry points catalogued: {N}
- Files read: SaleTab.jsx, TreatmentFormPage.jsx, backendClient.js, BackendDashboard.jsx, DepositPanel.jsx, OrderDetailModal.jsx
- Grep patterns run: ~15
- Known limitations: C10 is static; actual runtime violation depends on sale size
```

---

## Severity legend
- **VIOLATION**: cascade demonstrably breaks
- **WARN**: fragile under edge cases
- **PASS**: verified

## Do NOT
- Auto-fix (separate session)
- Write to disk
- Re-check PASS items
