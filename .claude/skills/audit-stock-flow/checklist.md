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

### S29 — Incoming positive qty MUST repay existing negatives FIRST (Phase 15.7-bis)
**What**: Every batch-creator path (import / transfer-receive / withdrawal-receive) MUST call `_repayNegativeBalances` BEFORE creating a new batch. Negative balances at the same product+branch are repaid FIFO (oldest createdAt first); only the leftover becomes a new batch. The `_repayNegativeBalances` helper writes per-batch tx (batch.qty.remaining += repayAmt + status flip back to 'active' if no longer negative) + a +qty movement marked `negativeRepay: true`.
**Why**: Phase 15.7 introduced negative-stock allowance — a deduct that overshoots pushes the FIFO-last batch into negative. Without auto-repay on incoming, admin importing more stock would create a NEW batch alongside the negative one; the negative would never clear unless admin explicitly Adjust-ADD'd against the negative batch. User report: "ตอนตัดตัดได้ แต่ตอนนำเข้าไปใหม่ ทำไมนำเข้าไปแล้วไม่รวมกับอันเดิม". Auto-repay matches physical reality: imported stock that settles a prior overdraw shouldn't double-count as fresh inventory.
**Where**: `src/lib/backendClient.js` — `_buildBatchFromOrderItem` (used by `createStockOrder` + `receiveCentralStockOrder`), `createStockTransfer._receiveAtDestination`, `createStockWithdrawal._receiveAtDestination`. The pure helper `applyNegativeRepay(batches, incomingQty)` lives in `src/lib/stockUtils.js` (FIFO oldest-first; returns `{repayPlan, leftover}`).
**How**: grep `_repayNegativeBalances` — should appear in 3 batch creator paths. Anti-regression: NO `setDoc(stockBatchDoc(...), {... qty: buildQtyNumeric(item.qty), ...})` directly without first calling `_repayNegativeBalances` (the leftover from the helper is what `buildQtyNumeric` should consume). Reverse path (`_reverseOneMovement`) does NOT call repay — it preserves the FIFO-last negative semantic for sale/treatment cancellation.

### S30 — Repay summary surfaces in admin UX (banner)
**What**: Each call site that triggers a batch-creator path MUST surface `result.repays` to admin via the shared `formatNegativeRepayBanner(repays)` + `hasNegativeRepay(repays)` helpers (in `src/lib/negativeRepayBanner.js`). Banner is rendered inline in OrderPanel + StockTransferPanel + StockWithdrawalPanel + CentralStockOrderPanel.
**Why**: Auto-repay is silent (no admin click required). Without a banner, admin imports +500, sees +500 in the movement log, and may not realize 76 of those went to clearing a negative balance. The banner makes the silent action visible: "✓ มีการเคลียร์สต็อคติดลบอัตโนมัติ N สินค้า รวม X หน่วย".
**Where**: 4 panels + helper module. data-testid="negative-repay-banner" on the rendered div for test assertions.
**How**: grep `formatNegativeRepayBanner` — should appear in OrderPanel + StockTransferPanel + StockWithdrawalPanel + CentralStockOrderPanel + the helper file. grep `data-testid="negative-repay-banner"` — same 4 surfaces. Anti-regression: any new flow that adds stock to a branch (future feature) MUST surface repays via the same shared helper (Rule C1 lock).

### S31 — Calendar grid count == badge count (no silent-drop)
**What**: AppointmentTab time-grid `apptMap` MUST be array-valued (not single-value) so collisions render. Virtual "ไม่ระบุห้อง" room column MUST be added when any dayAppt has `roomName === null`. Result: every appointment in `monthAppts[date]` (counted in the bubble badge) is also rendered in the time grid.
**Why**: User reported (Phase 15.7-bis) that the bubble badge said "4" on 29/4 but the grid showed 1. Two silent-drop bugs: (1) the `apptMap` filter `if (a.startTime && a.roomName)` dropped roomless appts entirely; (2) the map was single-value `{[key]: appt}` so collisions overwrote (last-write-wins). The badge sees ALL appts via `monthAppts[date].length`, but the grid silently lost some — admin can't trust either count.
**Where**: `src/components/backend/AppointmentTab.jsx` — `apptMap` useMemo (array-valued), `rooms` useMemo (virtual-room append), cell render (collision badge + dupe pills), occupied check (uses `effectiveRoom()`).
**How**: grep `if (!map[key]) map[key] = []` + `map[key].push(a)` — confirms array. grep `UNASSIGNED_ROOM` — confirms virtual column. grep `data-testid="appt-collision-badge"` + `data-testid="appt-collision-dupe"` — confirms collision UX. Anti-regression: NO `if (a.startTime && a.roomName)` in `apptMap` build (the filter that hid roomless appts).

### S32 — Multi-batch FIFO deduction MUST retry+re-plan on a concurrency race (V147)
**What**: `_deductOneItem` (the only multi-batch FIFO allocator) reads candidate batches OUTSIDE the per-batch transaction (`listStockBatches` getDocs), plans the allocation, then per-batch `runTransaction` re-reads + guards. A CONCURRENT deduction on the same batch can drain it below the stale plan's `takeQty` between the read and the tx → the in-tx guard MUST throw a `STOCK_RACE_RETRY`-tagged error, and the function MUST catch it and **re-fetch + re-plan** (bounded loop `_DEDUCT_MAX_ATTEMPTS`), NOT propagate it as a save failure. On re-plan the fresh `remaining` is lower → the Phase 15.7 negative-stock push (no-floor) absorbs the race-time shortfall → the deduction SUCCEEDS (goes negative if needed).
**Why**: Phase 15.7's purpose is "ตัดได้เสมอ (ติดลบได้)" — a treatment/sale deduction must NEVER fail because a sibling deduction drained the batch first. Before V147, `_deductOneItem` threw a raw `Batch X raced: available N, need M` (a USER throw — Firestore does NOT auto-retry user throws, only commit-time contention) → the whole treatment/sale SAVE failed non-deterministically under real multi-staff concurrency. The plan-time negative-stock fallback did NOT cover this because `plan.shortfall===0` (the stale snapshot still showed enough). Confirmed Rule Q L2: `scripts/e2e-stock-concurrency-race.mjs` was 6/6 rounds raced→fail before the fix, 6/0 pass after (both treatment + sale; conservation held throughout). User report: "ระบบ Stock ... บั๊คที่ไม่เป็นไปตามจุดประสงค์ของโปรแกรม".
**Where**: `src/lib/backendClient.js` `_deductOneItem` — the `for (let _deductAttempt = 1; ; _deductAttempt++)` retry loop wrapping the `listStockBatches`→`batchFifoAllocate`→tx-loop→negative-push, the 5 `e.code = 'STOCK_RACE_RETRY'` throw tags (vanished / became-cancelled-or-expired / raced / negative-push vanished / negative-push became), the catch `if (err?.code === 'STOCK_RACE_RETRY' && _deductAttempt < _DEDUCT_MAX_ATTEMPTS) continue`. SINGLE-doc-tx ops (`createStockAdjustment`, `_exportFromSource` ×2) read their one batch INSIDE the tx → Firestore's own contention-auto-retry covers them; their `short`/`became`/`not found` throws are deterministic anti-negative (NOT race-fails) and MUST NOT be retry-tagged.
**How**: grep `STOCK_RACE_RETRY` in backendClient.js — must appear ≥5× (throw tags) + 1× catch-check; grep `_DEDUCT_MAX_ATTEMPTS` + `for (let _deductAttempt`. Anti-regression: NO bare `throw new Error(\`Batch ${a.batchId} raced` without an adjacent `code = 'STOCK_RACE_RETRY'`. Behavior lock: `scripts/e2e-stock-concurrency-race.mjs` (C1 treatment + C4 sale = 0 raced rejections; C1.2 conservation every round). Class boundary: only multi-batch read-outside-tx allocators need this; single-doc tx ops do not.

### S33 — The negative-stock debt carrier MUST NOT be an expired/cancelled lot (V150)
**What**: `pickNegativeTargetBatch` (`src/lib/stockUtils.js`) chooses the lot whose `qty.remaining` goes NEGATIVE when a deduct overshoots (Phase 15.7). Its no-allocations candidate set MUST exclude `status===CANCELLED`, `status===EXPIRED`, and `hasExpired(b, now)` lots. If no active, non-expired lot qualifies it returns `null` → the caller (`_deductOneItem` Fallback C) creates a synthetic AUTO-NEG batch to carry the debt. The `allocations`-present path is already expired-safe (batchFifoAllocate excludes expired/cancelled, so allocated lots are valid).
**Why**: pre-V150 the candidate filter checked productId+branchId only ("any status") → for a product whose ONLY lot is expired, a deduct decremented the EXPIRED lot (e.g. 10→7), writing a `negativeOverage` movement that DOCUMENTS "expired units dispensed" — a MOPH-audit violation — and corrupting the expired lot's on-hand count (which should stay intact for separate write-off). A cancelled lot must never be revived as a debt carrier either. Confirmed Rule Q L2 `scripts/e2e-stock-fefo-expiry.mjs` E2 (expired-only deduct left the expired lot at 7 BEFORE, 10 AFTER + debt on a synthetic). Extends S9 (expired skipped in deduction) to the negative-carrier path.
**Where**: `src/lib/stockUtils.js` `pickNegativeTargetBatch` candidate `.filter`.
**How**: grep the function body for `BATCH_STATUS.CANCELLED` + `BATCH_STATUS.EXPIRED` + `hasExpired(b, now)`. Behavior lock: `scripts/e2e-stock-fefo-expiry.mjs` (E1 expired-not-dispensed-when-valid-exists, E2 expired-only-not-consumed, E3 FEFO order) + pure unit `tests/v150-negative-target-excludes-expired.test.js` (V150.1-7). Common-case regression: `scripts/e2e-negative-batch-directions.mjs` D3/D4 (active lot still carries the negative).

### S34 — A reverse MUST restore stock even if the lot VANISHED (re-create, never throw-and-lose) (V151)
**What**: `_reverseOneMovement` (`src/lib/backendClient.js`) restores stock when a sale/treatment is cancelled/edited. If the original lot (`m.batchId`) no longer exists, it MUST RE-CREATE the lot from the movement metadata (`productId`/`productName`/`branchId` + the returned qty as `{total, remaining}`, cost derived from `m.costBasis`, `_recreatedByReverse:true`) — it MUST NOT `throw "Batch X vanished before reverse"`.
**Why**: V144's real-time 0-lot clear (`_clearRedundantZeroLotsForProducts`, S29-adjacent) DELETES a redundant 0-lot post-commit. A sale that drains lot A to 0 while lot B stays live → V144 deletes A. Pre-V151, cancelling that sale → `reverseStockForSale`'s loop (NO try/catch) hit the `tx.get(A)` !exists throw → the WHOLE cancel FAILED and the customer's stock was NEVER returned (conservation broken). Confirmed Rule Q L2 `scripts/e2e-stock-reverse-after-lotclear.mjs`: cancel threw "vanished before reverse" + Σ stayed 5 BEFORE; no-throw + Σ restored to 10 AFTER. A cancel must ALWAYS restore stock (purpose). The re-created lot keeps the audit chain intact (reverse movement.batchId still matches) + carries `_recreatedByReverse` so admin can reconcile the lost expiry/cost metadata.
**Where**: `src/lib/backendClient.js` `_reverseOneMovement` runTransaction body — the `if (!bSnap.exists())` re-create branch + `resolveBatchStatusForRemaining` destructure.
**How**: grep the function body — NO `throw new Error(\`Batch ${m.batchId} vanished before reverse\`)`; MUST contain `_recreatedByReverse: true` + `tx.set(batchRef` + `qty: { total: qtyReturn, remaining: qtyReturn }`. Existing-lot path preserved (`reverseQtyNumeric` + `tx.update`). Behavior lock: `scripts/e2e-stock-reverse-after-lotclear.mjs` (R10) + source-grep `tests/v151-reverse-recreates-vanished-lot.test.js`. Common-case regression: `scripts/e2e-stock-reverse-edit-concurrency.mjs` (R2 normal reverse) + V138 D3/D4.

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
