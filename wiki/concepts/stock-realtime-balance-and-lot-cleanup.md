---
title: Stock balance — show-0, real-time, auto-clear-lot (V143 cluster)
type: concept
date-created: 2026-05-31
date-updated: 2026-05-31
tags: [stock, balance, real-time, bs-13, lot-cleanup, av166, av167, av168, v143]
source-count: 0
---

# Stock balance — show-0 + real-time + auto-clear-lot (V143 cluster)

> Three coordinated fixes to the ยอดคงเหลือ (stock balance) surface, shipped together
> as V143 / V143-ter / V143-quater (2026-05-31, deployed `0c607f68`): (1) products
> drained/cleared to exactly 0 stay visible, (2) the balance updates live across every
> device/page, (3) spent lots auto-clean so the lot list can't overflow.

## Overview

`StockBalancePanel` (`src/components/backend/StockBalancePanel.jsx`) aggregates
`be_stock_batches` by product for the selected branch. Three independent problems were
fixed in one cluster because they all touch how that panel reads + presents batches.

### V143 — show products at exactly 0 (AV166)

`resolveBatchStatusForRemaining(remaining)` flips a batch to `status:'depleted'` at
`remaining===0` (e.g. clearing a negative AUTO-NEG balance to 0, or draining a lot). The
panel loaded only `status:'active'` → depleted-at-0 batches were excluded → the **product
VANISHED** from ยอดคงเหลือ. NK had 7 such products hidden (Acetin, Betadine, Ibuprofen,
Paracetamol, Augmentin, Neuramis Deep, Soft Cream). **Fix**: keep `status ∈ {active,
depleted}` (exclude `cancelled` = voided import, `expired` = past-expiry). Any product
ever keyed into stock shows a row, even at 0 — user directive
*"สินค้าไหนที่เคยคีย์เข้าระบบสต็อค ต้องแสดงจำนวนเสมอแม้เป็น 0"*.

### V143-ter — real-time balance (AV167, BS-13)

The panel was a one-shot `listStockBatches` getter → not live; a deduction on another
device/page didn't show until reload. **Fix**: NEW `listenToStockBatchesByBranch` —
a Layer-1 `onSnapshot` listener that follows the [BS-13 safe-by-default
pattern](branch-switch-refresh-discipline.md) (resolve branchId; return empty if none +
`!allBranches`; never whole-collection fallback) + a Layer-2 auto-inject wrapper in
[scopedDataLayer.js](../entities/scoped-data-layer.md) (mirror of the V76 chat-history
listener). The panel subscribes via the wrapper (`{ branchId: locationId }`) and filters
`status ∈ {active, depleted}` client-side. User directive: *"ทุกคนที่เปิดหน้านี้ต้องเห็น
เหมือนกันแบบ real time ทันที"*.

### V143-quater — auto-clear-lot (AV168)

Depleted lots never got cleaned → accumulate forever. **Fix**: pure
[planLotCleanup](../entities/stock-lot-cleanup-core.md) (per product×location: keep all
LIVE lots + ≤1 zero placeholder, DELETE the rest — DELETE-only, never mutate qty) + a
daily cron `api/cron/stock-lot-cleanup.js` (03:45 BKK) + a Rule M CLI. The real-time
listener (V143-ter) means a cron delete shows up live too.

## Key facts / claims

- The three are one cluster because they share the same reader (`StockBalancePanel`) +
  the same `be_stock_batches` shape.
- **One migration, three stale source-greps**: switching the panel from `listStockBatches`
  → `listenToStockBatchesByBranch` invalidated three source-grep test assertions
  (`v143 SG1`, `v138 N10.7`, `v34 INV.11.4`) — the classic V21 "test asserts the old
  literal" family. The full-suite **JSON reporter** named the third (`v34 INV.11.4`) that
  the token-filtered summary had hidden — Rule Q-honest win (didn't assume "FAIL(1) =
  flake"). All three fixed; full suite confirmed exactly 3, no 4th.
- **Rule M applied on prod (same session)**: NK reset (`v143-nakhon-stock-reset.mjs`:
  51 batches→0/0, 364 transactional docs deleted) + multi-lot collapse
  (`v143-collapse-nk-multilot.mjs`: 53 products = 53 lots at 0). Idempotent + audited.

## Cross-references

- Entity: [stockLotCleanupCore.js — planLotCleanup](../entities/stock-lot-cleanup-core.md)
- Entity: [scopedDataLayer.js](../entities/scoped-data-layer.md) (Layer-2 `listenToStockBatchesByBranch` wrapper)
- Concept: [Branch-switch refresh discipline (BS-9 / BS-13)](branch-switch-refresh-discipline.md)
- Concept: [Data ops via local + admin SDK (Rule M)](data-ops-via-local-sdk.md)
- Concept: [V12 shape-drift bug class](v12-shape-drift.md) (the 3 V21 test-fixups are this family at the source-grep layer)

## History

- 2026-05-31 — Created with the V143 cluster ship + deploy (`0c607f68`). Verified: full vitest 15418/0 + build clean + V143-ter L2 e2e 5/0 real prod (`scripts/e2e-stock-balance-realtime.mjs`). Honest gap: 2-device real-browser live-balance = user L1.
