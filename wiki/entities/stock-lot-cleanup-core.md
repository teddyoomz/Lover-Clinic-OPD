---
title: stockLotCleanupCore.js — planLotCleanup
type: entity
date-created: 2026-05-31
date-updated: 2026-05-31
tags: [stock, lot-cleanup, cron, rule-m, av168, v143]
source-count: 0
---

# stockLotCleanupCore.js — `planLotCleanup`

> Branch-agnostic pure helper that decides which spent stock **lots** (batches) to
> delete so the per-product lot list can't grow unbounded ("ล้น"). DELETE-only —
> never mutates `qty`. Shipped V143-quater (2026-05-31).

## Overview

Every stock import creates a `be_stock_batches` doc (a "lot") with `qty:{total,remaining}`.
When a lot drains to 0 it flips to `status:'depleted'` (`resolveBatchStatusForRemaining`,
see [stock-realtime-balance-and-lot-cleanup](../concepts/stock-realtime-balance-and-lot-cleanup.md)).
Depleted lots were never cleaned → they accumulate forever. `planLotCleanup` is the
auto-clear brain that keeps exactly one zero **placeholder** per product so the product
still shows at 0 in ยอดคงเหลือ (V143 show-0 contract) while pruning the rest.

The helper is pure (no Firestore) so the same decision drives the daily cron, the Rule M
CLI, and the test bank — no drift (same discipline as
[chartEditSessionCore](chart-edit-session-core.md) /
[customerLinkPayloadCore](customer-link-payload-core.md)).

## Key facts / claims

- `planLotCleanup(batches)` groups by `lotGroupKey(b) = \`${productId}|${branchId||locationId}\``;
  considers only `status ∈ {active, depleted}` (cancelled/expired ignored).
  `src/lib/stockLotCleanupCore.js`.
- Per group: **if any LIVE lot exists** (`qty.remaining !== 0`) → **delete ALL zero lots**
  (no placeholder needed — the live lots carry the row). **Else** (all zero) → **keep
  `zero[0]` as the placeholder, delete the rest** (product still shows at 0).
- Returns `{ deleteIds, perGroup, keptPlaceholders }`. **DELETE-only** — never writes `qty`.
- Consumed by:
  - `api/cron/stock-lot-cleanup.js` — daily Vercel cron (03:45 BKK, `vercel.json`),
    `CRON_SECRET`-gated, loads all `be_stock_batches`, `batch.delete` in 450-chunks +
    audit doc. Mirrors `stock-movement-retention`.
  - `scripts/stock-lot-cleanup.mjs` — Rule M dry-run / `--apply` / `--branch <id>` CLI.
- **AV168** locks the DELETE-only + one-placeholder contract.

## Cross-references

- Concept: [stock real-time balance + lot cleanup](../concepts/stock-realtime-balance-and-lot-cleanup.md)
- Concept: [Data ops via local + admin SDK (Rule M)](../concepts/data-ops-via-local-sdk.md)
- Entity (sibling pure-SSOT pattern): [chartEditSessionCore.js](chart-edit-session-core.md)
- Tests: `tests/stock-lot-cleanup.test.js` (C1-C9 + SG1-SG5), 14/0.

## History

- 2026-05-31 — Created with V143-quater (auto-clear-lot). Helper 14/0 + dry-run on real prod returned 0 redundant (NK already collapsed to 1 lot/product earlier the same session). Shipped + deployed (`0c607f68`).
