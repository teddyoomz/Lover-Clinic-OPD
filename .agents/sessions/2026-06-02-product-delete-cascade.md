# Checkpoint — 2026-06-02 EOD+3 · B (be_products cleanup) APPLIED + product delete-cascade/guard (AV176) + adversarial hunt

## Summary
Did the deferred **B** (be_products data cleanup) on prod, then `/systematic-debugging` the user's reported orphan-on-delete bug ("deleted product still shows in stock + should leave courses"), then ran a user-driven **loop-until-dry adversarial hunt** that found **2 more real bugs** ("ผมมีกลิ่น ... ระบบ stock สำคัญมากๆ"). Code is COMMITTED LOCAL (`6cff6905`) but **NOT deployed** — the data cleanups ARE applied to prod (admin-SDK); the cascade CODE needs a deploy to protect prod deletes.

## Current State
- master = `6cff6905` (feat) + EOD docs commit; prod bundle UNCHANGED `85063e5d` (cascade code LOCAL — deploy needed).
- NO firestore.rules change → frontend-only deploy, no Probe-Deploy-Probe.
- Prod DATA cleaned (Rule M): V145 junk strip+restore (35 docs) + V146 orphan batches (5) + 2 dedups — verified gone + idempotent + audit docs (`v145-product-cleanup-dd52679aeed6`, `v146-orphan-dedup-cleanup-17ba5ae92756`).
- Tests: product-delete 25/0 + e2e 124/0 (3 branches × every scenario) + affected-area 230/0 + build clean. Full suite green modulo known `cross-branch-import-rtl` flake (intermittent 15860/1; JSON-reporter run = 0 failed; isolated 7/0 — NOT a regression).
- Original 3rd task (dropdown หมวดหมู่) NOT started; debug expanded into the multi-round hunt.

## Commits (this session)
```
6cff6905 feat(stock): product delete-cascade + guard (AV176) — orphan-on-delete fix + Rule M data cleanups
```
(B's --apply data ops ran via admin-SDK scripts, not code commits.)

## Files Touched
- NEW src/lib/productDeleteCascade.js (pure: evaluateProductDeleteGuards + planProductCascade + batchDeleteAction + isPendingOp + opReferencesProduct + TERMINAL_OP_STATUSES)
- NEW src/lib/productDeleteClient.js (client cascade — mirrors customerDeleteClient; loads batches[where productId] + courses/groups[where branchId] + orders[where branchId] + transfers/withdrawals/central[UNFILTERED])
- src/components/backend/ProductsTab.jsx (preview→block-or-confirm→cascade) · StockBalancePanel.jsx (productsLoaded + orphan backstop)
- NEW tests/product-delete-cascade.test.js (25) · tests/phase-24-0-vicies-novies-novies-list-spread-order.test.js (S7.3 V21-fixup)
- NEW scripts: e2e-product-delete-cascade.mjs (124/0) · v146-cleanup-orphan-stock-and-dedup.mjs (Rule M) · diag-{b-product-restore-and-fk,orphan-stock-and-course-refs,product-delete-deeper-risks,product-reference-map}.mjs (Rule R)
- scripts/v145-cleanup-polluted-product-junk.mjs (restore phase added) · .agents/skills/audit-anti-vibe-code/SKILL.md (AV176)

## Decisions (1-line each — full reasoning to v-log-archive.md V147, deferred)
- B = non-destructive (strip junk + restore cat/unit/type from clean copies; 7 manual inferred values user-approved); dedup-deletes deferred to the cascade-safe path.
- Mechanism = CLIENT-SIDE cascade (not server endpoint) — `/api/admin/*` unreachable on `npm run dev`; mirrors the reshaped customerDeleteClient precedent. Server endpoint draft deleted.
- Negative batches: CANCEL (status='cancelled') not delete — V144 keeps negatives client-undeletable; admin-SDK cleanup deletes them outright.
- Guard = BLOCK on stock>0 / course-mainProductId / pending-inbound-op (user chose Guard+cascade over force/soft-delete).
- Completeness extended to be_product_groups + central batches + all 4 op types after the user's "cascade ขึ้นครบจริงไหม" challenge.
- History kept (movements/sales/treatments/completed ops) — Rule O denormalized names; only "current-state" surfaces cascaded.

## Bugs found by the adversarial hunt (user's "smell" was right)
1. **pending-op un-receivable** — deleting a product in a PENDING order/transfer/withdrawal/central-PO → its receive throws `_assertProductExists` forever (139 products in active orders). Added guard.
2. **op-schema heterogeneity (V66 fixture-vs-reality in my OWN guard)** — `where branchId` MISSED transfers/withdrawals (no branchId, NUMERIC status 0/1/2/3) + central (centralWarehouseId). Fixed: load unfiltered + `isPendingOp` numeric+string.
- Disproven (code-read, NOT bugs): purchased-course deduction breaks treatment → NO (graceful `!tracked` skip, V36-bis; no ghost-recreate); productId-field≠doc-id → 0/611; marketing productId refs → none.

## Next Todo
- **DEPLOY the cascade code** (frontend-only; user-triggered "deploy"). Until then prod product-delete still orphans.
- **Dropdown หมวดหมู่** (3rd original ask): Edit-Product modal category dropdown — but be_product_groups is EMPTY (1 junk doc) → source must be distinct `categoryName` values on be_products. Needs `/brainstorming`.
- Continue Round 3 hunt if user wants (marketing clean; quotations / be_df_* / >450-batch chunk-atomicity / course-price-recompute-on-pull reasoned-not-tested).
- Neuramis merge (38764 keep ↔ 9B1DEFF7) + junk test-course "หฟแฟ" (deferred data ops). V147 verbose v-log-archive entry.

## Resume Prompt
See SESSION_HANDOFF.md Current State (top) + .agents/active.md. master=6cff6905, prod bundle=85063e5d (cascade LOCAL — deploy needed). product delete-cascade/guard (AV176) built + B cleanup APPLIED on prod. Next: deploy cascade (frontend-only), then dropdown task. Hunt found 2 bugs (pending-op + op-schema); Round 3 optional.
