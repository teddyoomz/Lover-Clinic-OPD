# 2026-04-27 (session 18 EOD) — Phase 15.1-15.3 + 5 bug fixes + actor tracking

## Summary

Day-long session shipped Phase 15 slices 1-3 (Central Stock Conditional
multi-branch foundation + Central PO write flow + central adjustments)
plus 5 bug fixes squashed in flight (V22-bis seller leak, Phase 14.10-tris
product display fallout, OrderPanel BRANCH_ID scope + smart unit dropdown,
OrderDetailModal raw branchId leak, comprehensive actor tracking). 9 commits
master=`1066711`, 1905/1905 tests pass, build clean — **NOT deployed**.

## Current State

- master = `1066711` · 1905/1905 focused tests pass (1595 → 1905, +310)
- Production = `75bbc38` LIVE (V33.10 baseline) · master 9 commits ahead
- Phase 15.2 has firestore.rules update — V15 combined deploy needs Probe-Deploy-Probe + extend probe list 6→8 endpoints
- 7 user-reported items queued for next session (see Next Todo)
- Working tree clean

## Commits (9, this session)

```
1066711 feat(stock): actor tracking — every state-flip records ผู้ทำรายการ
ece1868 fix(stock): OrderDetailModal branchId code → human-readable name (V22 lock)
74985b8 fix(stock): OrderPanel BRANCH_ID scope + smart unit dropdown
12d6081 fix(stock): product picker p.name regression — Phase 14.10-tris sweep
e65d335 feat(stock): Phase 15.3 — Central adjustments sub-tab + AdjustForm scope-bug fix
88a2174 fix(sale): V22-bis — seller numeric-id leak in view modal + PDF print
7550c10 chore: add .claude/scheduled_tasks.lock to .gitignore
22cf0b9 chore: untrack .claude/scheduled_tasks.lock (runtime lock file)
a4307e3 feat(stock): Phase 15.2 — Central PO write flow + Rule C1 helper extraction
dba27ad feat(stock): Phase 15.1 — Central Stock Tab read-only UI + V20 multi-branch foundation
```

## Files Touched (cumulative)

NEW:
- `src/components/backend/CentralStockTab.jsx` (15.1)
- `src/components/backend/CentralStockOrderPanel.jsx` (15.2)
- `src/components/backend/ActorPicker.jsx` (1066711)
- `src/components/backend/ActorConfirmModal.jsx` (1066711)
- `src/lib/centralStockOrderValidation.js` (15.2)
- `tests/phase15.1-central-stock-read-only-flow-simulate.test.js` (+46)
- `tests/phase15.2-central-po-flow-simulate.test.js` (+86)
- `tests/phase15.3-central-adjust-flow-simulate.test.js` (+19)
- `tests/v22-bis-seller-numeric-id-leak.test.js` (+33)
- `tests/product-display-name-regression.test.js` (+19)
- `tests/order-panel-branch-id-and-unit-dropdown.test.js` (+25)
- `tests/branch-name-display-regression.test.js` (+20)
- `tests/stock-actor-tracking.test.js` (+62)

MODIFIED (heavy):
- `src/lib/backendClient.js` — `_buildBatchFromOrderItem` Rule C1 helper (extracted from createStockOrder); `createCentralStockOrder` + `receiveCentralStockOrder` (idempotent partial) + `cancelCentralStockOrder` (V19-style movement-trail check) + `listCentralStockOrders` + `generateCentralOrderId` (atomic counter); `linkedCentralOrderId` mapField
- `src/lib/stockUtils.js` — `LOCATION_TYPE` + `deriveLocationType` + `CENTRAL_ORDER_STATUS` + `MOVEMENT_TYPES.WITHDRAWAL_APPROVE=15`/`REJECT=16` (audit-only)
- `src/lib/productValidation.js` — NEW `productDisplayName` helper (Phase 14.10-tris fallout)
- `src/lib/documentFieldAutoFill.js` — NEW `resolveSellerName` helper (V22-bis)
- `src/lib/BranchContext.jsx` — NEW `resolveBranchName` helper (V22-bis pattern)
- `firestore.rules` — `be_central_stock_orders` + counter blocks
- 8 backend panels: OrderPanel, StockAdjustPanel, StockTransferPanel, StockWithdrawalPanel, StockBalancePanel, MovementLogPanel, CentralWarehousePanel, CentralStockOrderPanel — picker wired + many smaller fixes

## Decisions (1-line each — full reasoning to v-log-archive.md)

1. Phase 15 schema = Option B-lite (extend `be_stock_batches` with optional `locationType` + `locationId`; NO new collection for batches; V12-safe)
2. Phase 15.2 = ONE new collection (`be_central_stock_orders`) + counter; mirror `generateInvoiceNumber` pattern
3. Phase 15.2 = REUSE existing movement types 1/8/9/10/13/14 (no type 11); ADD only audit-only 15+16 for Phase 15.5 approval
4. Permission keys = 4 (production RBAC: `central_stock`, `central_stock_movement`, `central_stock_approval`, `central_stock_setting`)
5. Stock fallback at sale shortfall = manual workflow (cashier sees error + button to auto-create withdrawal); never auto-deduct cross-tier
6. CentralStockTab always visible (single-branch + central is real shape)
7. V22-bis lock: 3rd entity-name resolver pattern (resolveSellerName + productDisplayName + resolveBranchName) — never display raw IDs
8. Actor tracking scope = ALL state-flips that emit movements (strictest user-chosen option) + force-pick UX
9. Pre-existing scope bugs found + fixed: AdjustCreateForm + OrderCreateForm both referenced `BRANCH_ID` in sibling-function scope (silent-undefined runtime bug)

## Next Todo

User EOD message itemized 7 items for next session (verbatim from chat):

1. **Pagination 20/page recent-first** — all stock + central tabs (Order list, Adjust list, Transfer list, Withdrawal list, Movement Log, Central PO list)
2. **Batch picker bug** — `ปรับสต็อคไม่ได้ ติด Batch/Lot เลือกไม่ได้`. Likely legacy `branchId='main'` data vs `BRANCH_ID='BR-XXX'` from BranchContext after V20 multi-branch wired. Investigation: try listStockBatches without branchId filter as fallback, OR migrate legacy batches.
3. **Transfer movements missing in Stock Movement Log** — show only in Central tab. Bug: `MovementLogPanel` filtered by `branchId` (current branch); EXPORT_TRANSFER movements have source-branch's branchId, RECEIVE has destination's. Fix: include both sides for the current branch.
4. **Withdrawal same** — same root cause as 3.
5. **Transfer detail modal** — must show ผู้สร้าง + ผู้ส่ง + ผู้รับ (3 distinct actor roles per state). Currently only generic `user`. Need to capture actor at status 0 create vs status 0→1 dispatch vs status 1→2 receive.
6. **Auto-show unit on batch rows** — extend OrderPanel pattern (74985b8 `getUnitOptionsForProduct` + `UnitField` smart dropdown) to: AdjustCreateForm, TransferCreateForm, WithdrawalCreateForm, CentralStockOrderPanel.
7. **ActorPicker branch-access filter** — only show staff/doctors with `branchIds[]` including current branch. Schema already in `staffValidation.js` line 75 + `doctorValidation.js` line 84. Need: `listAllSellers({branchId})` filter param; UI hooks current branchId.

Plus ongoing: V15 combined deploy when ready (9 commits pending; Phase 15.2 rules update).

Phase 15.4+15.5 still queued after the 7-item triage.

## Resume Prompt

```
Resume LoverClinic — continue from 2026-04-27 s18 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=1066711, prod=75bbc38 — 9 commits unpushed-to-prod)
3. .agents/active.md (1905 focused tests pass; 7 outstanding items queued)
4. .claude/rules/00-session-start.md (iron-clad A-I + V-summary)
5. .agents/sessions/2026-04-27-session18-phase15-1-2-3-plus-fixes.md

Status: master=1066711, 1905/1905 tests pass, prod=75bbc38 LIVE (V33.10)
Phase 15.1+15.2+15.3 + 5 bug fixes + actor tracking shipped — NOT deployed.

Next: triage 7 user-reported items (pagination · batch picker · 2x missing
movements · transfer detail roles · auto-unit · branch-access filter).
Then V15 combined deploy 9 pending commits (Probe-Deploy-Probe + extend
probe list 6→8 — Phase 15.2 has rules update).

Outstanding user-triggered: V15 deploy authorization · admin LineSettings
creds + webhook URL · backfill customer IDs · TEST-/E2E- prefix.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined.

/session-start
```
