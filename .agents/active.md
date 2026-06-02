---
updated_at: "2026-06-02 EOD+3 — B (be_products cleanup) APPLIED + product delete-cascade/guard (AV176) built + adversarial hunt (2 real bugs found). Code LOCAL — not deployed."
status: "Code committed local (6cff6905). Prod DATA cleaned (V145 junk + V146 orphans/dedup applied via admin-SDK). Cascade CODE not yet deployed → prod product-delete still uses old bare delete until deploy."
branch: "master"
last_commit: "6cff6905 (feat product delete-cascade) — EOD docs commit follows."
tests: "product-delete-cascade 25/0 + e2e 124/0 (3 branches × every scenario, real prod TEST fixtures) + affected-area 230/0 + build clean. Full suite green MODULO the known cross-branch-import-rtl flake (15860/1 intermittent; JSON-reporter run = 0 failed; passes isolated — NOT a regression). NOT re-run at session-end."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "85063e5d (V145+V146) — UNCHANGED this session. The cascade code is LOCAL only; deploy needed to protect prod deletes."
firestore_rules_version: "UNCHANGED — cascade is frontend-only client-side (fits existing be_products/be_courses/be_product_groups/be_stock_batches write rules + V144 ==0-delete). NO rules change → no Probe-Deploy-Probe."
---

# Active — 2026-06-02 EOD+3

## State
- **B (be_products cleanup) DONE on prod** (Rule M admin-SDK): V145 junk strip+restore (35 docs) + V146 orphan batches (5, incl. screenshot's ยาทาจี้หูด/Buscopan-ฉีด) + 2 safe dedups. Verified gone + idempotent. Audit docs emitted.
- **Product delete-cascade + guard (AV176) built + committed local** (`6cff6905`) — NOT deployed.
- **Adversarial hunt found 2 REAL bugs** (user's "smell" was right). Suite green modulo known flake.

## What this session shipped (detail → checkpoint 2026-06-02-product-delete-cascade.md)
- Cascade fix: bare `deleteProduct` → Guard+cascade via NEW `productDeleteCascade.js` (pure) + `productDeleteClient.js` (client-side, works on `npm run dev`); ProductsTab routes through it; StockBalancePanel orphan backstop.
- **Bug 1 (pending-op guard)**: delete a product in a PENDING inbound op → its receive throws `_assertProductExists` forever (139 products were in active orders). Added guard.
- **Bug 2 (op-schema heterogeneity, the big one)**: my guard's `where branchId` MISSED transfers/withdrawals (no branchId, numeric status) + central orders (centralWarehouseId). Fixed: load those unfiltered; `isPendingOp` handles numeric+string status.
- Completeness: cascade clears stock batches (branch+central) + courseProducts[] (main-block) + be_product_groups; history kept (Rule O). Verified e2e 124/0 across 3 branches.
- Disproven (NOT bugs, code-read): purchased-course deduction (graceful skip, V36-bis); id-mismatch (0/611); marketing refs (none).

## Next action
- **DEPLOY the cascade code** (frontend-only, no Probe-Deploy-Probe) — user-triggered. Until then prod deletes still orphan.
- THEN the **dropdown หมวดหมู่** task (3rd original ask — NOT started: Edit-Product modal category dropdown from be_product_groups… but be_product_groups is empty → source = distinct categoryName; brainstorm needed).

## Outstanding (user-triggered)
- Deploy cascade code · dropdown task · continue Round 3 hunt (marketing clean; quotations/DF/>450-chunk-atomicity/course-price-recompute reasoned-not-exhaustively-tested) · Neuramis merge + junk test-course "หฟแฟ" (deferred data) · V-log-archive verbose entry for this fix (V147) unwritten (carryover).
