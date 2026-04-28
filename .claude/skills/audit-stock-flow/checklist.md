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

---

## V34 invariants (S16–S20, added 2026-04-28)

> Origin: V34 (silent qty-cap on ADJUST_ADD when batch at full capacity)
> revealed gaps in the S1–S15 catalog. These invariants close those gaps.

### S16 — Per-tier per-product conservation (sum-check)
**What**: For every (productId, branchId) tuple, sum(batches.qty.remaining) at that tier must equal sum(movements.signed-delta) for the same tuple — assuming no orphan batches.
**Why**: V34 shipped because no test reconciled the snapshot against the movement ledger. ADJUST_ADD wrote +20 movements but the batch qty stayed at 10 → sum-check would have fired immediately.
**Where**: `src/lib/backendClient.js` (every read of be_stock_batches + be_stock_movements) + `tests/v34-stock-invariants.test.js INV.1`
**How**: After any stock-write change, run `assertConservation(batchSnapshot, movements)` against fresh Firestore data. Drift > 0 = VIOLATION.

### S17 — Time-travel / replay consistency
**What**: For any historical timestamp T, replaying movements ≤ T gives the batch's qty.remaining at T.
**Why**: Auditor question "what was stock on Mar 1?" requires this. Drift here means audit log can't reconstruct historical state.
**Where**: `tests/helpers/stockInvariants.js:replayBalanceAtTime` + `tests/v34-stock-invariants.test.js INV.8`
**How**: Pick 3 historical timestamps + verify replay matches snapshot at each. WARN if no test exists; VIOLATION if replay diverges.

### S18 — Concurrent-write tx safety + writeBatch atomicity
**What**: Every code path that writes to ≥ 2 stock-related Firestore docs MUST use either `runTransaction` (for read-then-write) or `writeBatch` (for blind writes). Never sequential `await updateDoc(...); await setDoc(...)`.
**Why**: Sequential writes can crash mid-loop, leaving system in inconsistent state. V34 found cancelStockOrder + updateStockOrder cost cascade with this pattern; both fixed via writeBatch.
**Where**: `src/lib/backendClient.js` — all stock mutations
**How**: Grep `await updateDoc(stockBatchDoc` and `await setDoc(stockMovementDoc` outside `runTransaction` / `writeBatch`. Each hit = candidate VIOLATION.

### S19 — Component listener alignment
**What**: Every component that displays stock state (StockBalancePanel, MovementLogPanel, StockAdjustPanel, OrderPanel, *CentralStock*Panel) must use either an `onSnapshot` listener (live updates) OR a refresh trigger after sibling-component mutations.
**Why**: V34's user complaint "ยอดไม่เปลี่ยน" had two layers — the qty math bug (real) AND the panel re-mount-required staleness (latent UX). If qty had updated correctly, user STILL would have seen stale balance until subtab nav.
**Where**: `src/components/backend/StockBalancePanel.jsx`, `MovementLogPanel.jsx`, `OrderPanel.jsx`, `CentralStock*Panel.jsx`
**How**: For each, grep `onSnapshot` OR `useEffect.*load` with proper deps. WARN if read-once + no refresh trigger.

### S20 — Test data prefix discipline (V33.11 mirror)
**What**: Every stock test file that writes to `be_stock_batches` / `be_stock_movements` / `be_stock_adjustments` / `be_central_stock_orders` (real Firestore, not mocked) MUST use TEST- or E2E- prefixed branchId / warehouseId / productId. No production IDs (no 'main', no real WH-XXX, no real BR-XXX) in test fixtures.
**Why**: Test pollution is invisible until it accumulates. V33.10 cleaned 53 untagged customer test docs. V33.11 mirrors the convention for stock so cleanup is predictable.
**Where**: `tests/**` writing real Firestore via firebase-admin SDK or preview_eval
**How**: Grep stock-write call sites in tests. Verify every branchId / warehouseId is `TEST-` or `E2E-` prefixed. VIOLATION if production IDs found.

---

## Phase 15.5 invariants (S21–S25, added 2026-04-28)

> Origin: Phase 15.5 four-feature bundle — 15.5A ActorPicker `branchIds[]`
> filter (5 stock-mutation forms) + 15.5B Withdrawal approval admin endpoint
> + Item 1 per-product balance warnings + Item 2 unit dropdown enrichment.
> These invariants lock the new patterns so future regressions get caught.

### S21 — Per-product warning thresholds drive balance panel
**What**: `StockBalancePanel.jsx` reads `alertDayBeforeExpire`, `alertQtyBeforeOutOfStock`, `alertQtyBeforeMaxStock` from each product's master record (via `productThresholdMap`) and uses them to drive (a) per-row badges (b) filter checkbox visibility (c) expiry text color. Products without a configured threshold show no warning for that dimension — admin opt-in policy.
**Why**: User directive 2026-04-28 — warnings must be per-product, not global. If a future refactor reverts to hardcoded thresholds, admins lose control over per-product policy. Per-product config is the legal authority for "near-expiry / near-out / over-stock" alerts.
**Where**: `src/components/backend/StockBalancePanel.jsx` (eager-load useEffect → productThresholdMap state → aggregator pass-through → 3 helpers `isExpiryWarning`/`isLowStockWarning`/`isOverStockWarning` → 3 filter checkboxes → 4 row badges)
**How**: Grep `productThresholdMap` + `isExpiryWarning|isLowStockWarning|isOverStockWarning`. Confirm 3 fields read from product. The 3 helpers must EACH return false if their respective threshold is null/undefined.

### S22 — No hardcoded ≤30/≤5 thresholds (anti-regression)
**What**: balance panel's filter logic must NOT contain raw `<= 30` (days) or `<= 5` (qty) comparisons. All filtering goes through per-product helpers.
**Why**: Easy regression vector — someone "improving" the filter could re-introduce a default. Locked by source-grep test B6/B7 in `tests/phase15.5-item1-balance-warnings.test.js`. Default fallbacks would defeat the per-product opt-in design.
**Where**: `src/components/backend/StockBalancePanel.jsx` displayed-memo + render block
**How**: grep `<=\s*30\|<=\s*5` in displayed/render block. Should match ZERO IN FILTER LOGIC. Display-only contexts (e.g. expiryClass color logic for visual cue) are exempt — filter must use per-product helpers exclusively.

### S23 — ActorPicker `branchIds[]` filter wired on 5 stock-mutation forms
**What**: `listAllSellers({branchId})` filter is invoked from StockAdjustPanel + OrderPanel + CentralStockOrderPanel + StockTransferPanel + StockWithdrawalPanel — each passes the appropriate branch context (`BRANCH_ID` / `centralWarehouseId` / `filterLocationId`). Pure helper `mergeSellersWithBranchFilter` exists for testability.
**Why**: Multi-branch clinic Phase 15 requirement — admin recording stock movement should pick from sellers assigned to current branch only (legacy fallback for empty `branchIds[]` preserved so pre-V20 staff data isn't hidden).
**Where**: 5 panel files in `src/components/backend/` + `src/lib/backendClient.js:mergeSellersWithBranchFilter` (pure helper) + `listAllSellers({branchId})` (Firestore wrapper)
**How**: grep `listAllSellers\s*\(\s*\{\s*branchId:` in 5 panels. Each must match. No `listAllSellers()` (no args) call in stock-mutation panels. Reports/sale tab/customer detail intentionally NO filter (need historical seller name lookups).

### S24 — Withdrawal approval admin endpoint pattern
**What**: `api/admin/stock-withdrawal-approve.js` follows audit-firebase-admin-security FA1-FA12 + Phase 15.5B-specific contracts:
- verifyAdminToken gate (admin claim or bootstrap UID)
- POST-only method gate, OPTIONS preflight handled
- Atomic `db.batch()` per action (withdrawal update + audit movement together)
- type=15 WITHDRAWAL_APPROVE / type=16 WITHDRAWAL_REJECT (qty=0 audit-only, ride V19 movement-update rule)
- Approve = SOFT (status STAYS at 0; warehouse still does dispatch)
- Reject = flips status 0→3 + audit + reason
- Input bound 500 chars on note/reason
- Idempotent approve (alreadyApproved early-return)
- V14 lock: normalizeAuditUser ensures no undefined user fields
**Why**: New admin endpoints carry stock-mutation potential — must follow the existing privileged-endpoint contract. FA1-FA12 catch most patterns; S24 specifically tests the approve-soft / reject-hard semantics so a future "let's auto-flip status on approve" doesn't skip the warehouse dispatch + bypass `_exportFromSource`.
**Where**: `api/admin/stock-withdrawal-approve.js`
**How**: grep `verifyAdminToken|type:\s*15|type:\s*16|skipped:\s*true|db\.batch\(\)|status:\s*3|alreadyApproved` — all must match. Confirm approve's `batch.update(withdrawalRef, ...)` payload does NOT include `status:`.

### S25 — Product unit dropdown merges master + existing product units
**What**: ProductFormModal datalist `#product-unit-list` populated from `listProductUnitGroups()` AND `listProducts()` (extracts `mainUnitName` from existing products), deduped + Thai-locale sorted, master takes precedence on collision. Pure helper `unitDatalistOptions` useMemo locks the merge algorithm.
**Why**: Admin productivity (Item 2 user directive 2026-04-28) — typed-once units immediately available on next form open without round-trip through ProductUnitsTab. Closed loop: admin types "ขวด" once + saves → next product creation sees "ขวด" in dropdown.
**Where**: `src/components/backend/ProductFormModal.jsx` `unitDatalistOptions` useMemo + datalist render
**How**: grep `unitDatalistOptions\s*=\s*useMemo` + `listProducts\(\)\.catch` + `localeCompare\(b,\s*['\"]th['\"]\)`. All must match. Anti-regression: NO `units\.flatMap\(u\s*=>` in datalist render block (old shape removed).

### S26 — Default-branch view passes includeLegacyMain to listStockBatches (V35)
**What**: Every UI consumer of `listStockBatches` that runs on a default-branch view (locationId='main' OR be_branches.isDefault===true) MUST pass `includeLegacyMain: true`. Pre-V20 batches written with branchId='main' would otherwise be filtered out → admin sees movement entries but blank balance row.
**Why**: Phase 15.4 commit 26ee312 added this opt-in to AdjustCreateForm + TransferCreateForm + WithdrawalCreateForm but MISSED StockBalancePanel. V35 closes that gap. Multi-reader sweep (V12 lesson) applies to flag-additions: when adding an opt-in flag, audit ALL readers + add the flag everywhere needed. Don't assume "only the create forms need it".
**Where**: `src/components/backend/StockBalancePanel.jsx` (V35 fix), `StockAdjustPanel.jsx`, `StockTransferPanel.jsx`, `StockWithdrawalPanel.jsx` (all 4 sites currently audited)
**How**: grep `listStockBatches\([^)]*\)` in `src/components/backend/Stock*.jsx` + assert each call has `includeLegacyMain` key. Pair with logic check: `currentLocation.kind === 'central'` excludes legacy fallback. New UI consumers MUST be added to this list OR use a different (non-batch) reader.

### S27 — FK validation: every batch creator validates productId before setDoc (V35)
**What**: NEW shared `_assertProductExists(productId, contextLabel)` async function declaration in backendClient.js. Throws `PRODUCT_NOT_FOUND` if productId doesn't resolve to a be_products doc. Called BEFORE `setDoc(stockBatchDoc, ...)` in 3 sites: `_buildBatchFromOrderItem` (purchase order receive — used by createStockOrder + receiveCentralStockOrder), `updateStockTransferStatus._receiveAtDestination`, `updateStockWithdrawalStatus._receiveAtDestination`.
**Why**: be_stock_batches stores DENORMALIZED `productName`. Without FK validation at write, deleted/typo'd productIds accumulate as orphan batches that StockBalancePanel renders as "ghost products" (e.g. "Acetin 6", "Aloe gel 010" from Phase 8 + ProClinic seed). Reader-side resilience hides the bug. Cleanup endpoint (`/api/admin/cleanup-orphan-stock`) handles existing pollution; this audit prevents new orphans.
**Where**: `src/lib/backendClient.js` `_assertProductExists` helper + 3 call sites
**How**: grep `setDoc\(stockBatchDoc\(` in `src/lib/backendClient.js` — every match MUST be preceded (within ~4000 chars look-back) by `await _assertProductExists\(`. Helper itself: grep `^async function _assertProductExists\b` (declaration, not const — must be hoisted). Anti-regression: any future setDoc(stockBatchDoc) without an upstream FK guard is a violation.

### S28 — ProductSelectField extracted + sourced everywhere (Rule C1 lock, V35 Phase D)
**What**: NEW shared `src/components/backend/ProductSelectField.jsx` typeahead picker (mirror of StaffSelectField shape) + `src/lib/productSearchUtils.js` `filterProductsByQuery` helper. Replaces inline `<select>` product pickers across stock + non-stock backend forms. Tier-scoped filtering via `options` prop (passed pre-filtered by caller).
**Why**: 253 products in plain `<select>` dropdowns is unusable. Rule C1 Rule of 3 trigger: 4+ stock pickers + 4+ non-stock backend forms = 8+ call sites for the same UX → extract once.
**Where**: `src/components/backend/ProductSelectField.jsx` (new), `src/lib/productSearchUtils.js` (new), call sites: OrderPanel.jsx (mobile + desktop), CentralStockOrderPanel.jsx, StockAdjustPanel.jsx, CourseFormModal.jsx, PromotionFormModal.jsx, QuotationFormModal.jsx, SaleTab.jsx, +any others discovered via grep.
**How**: grep `import\s+ProductSelectField` in backend forms — N matches expected. Anti-regression: NO bare `<select>...{products.map(...)}</select>` blocks for product picking in `src/components/backend/**` (except where the selector binds to non-product entities). New backend forms with product pickers MUST use ProductSelectField.

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
