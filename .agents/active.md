---
updated_at: "2026-05-31 EOD+4 LATE+2 — stock cluster: V143 (show-0) + V143-ter (real-time) + V143-quater (auto-clear lots); NK reset+collapse APPLIED. Awaiting deploy."
status: "V142 family (course-deduct) + V143 stock family DONE. NK stock reset to 0 (1 lot/product) APPLIED on prod. Real-time balance + auto-clear-lot system built+verified. Awaiting user 'deploy'."
branch: "master"
last_commit: "b5e4b8eb V143-bis collapse. UNCOMMITTED: V143-ter (real-time listener) + V143-quater (lot-cleanup cron+helper+script). prod LIVE = 8c3a9047 (lacks V142-quater/quinquies + ALL V143)."
tests: "Full suite running. stock-lot-cleanup 14/0 + v143-show-depleted 24/0; real-time L2 e2e scripts/e2e-stock-balance-realtime 5/0 real prod; lot-cleanup dry-run 0-redundant real prod. Build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "8c3a9047 LIVE. PENDING DEPLOY: V142-quater+quinquies (course double-deduct) + V143/ter/quater (stock show-0 + real-time + auto-clear cron). vercel.json adds stock-lot-cleanup cron."
firestore_rules_version: "UNCHANGED. vercel.json adds 1 cron (stock-lot-cleanup, 03:45 BKK) — activates on deploy. No rules/storage/index → no Probe-Deploy-Probe."
---

# Active Context — stock cluster (2026-05-31 EOD+4 LATE+2)

## Done this session (two families)
### V142 family (course-deduct) — committed
- V142 edit-resave symmetry · V142-bis create-flow · V142-quater over-credit · **V142-quinquies
  finalize→doctor→finalize DOUBLE-DEDUCT** (persisted `_courseDeducted` flag). Verified: matrix 30/0 +
  flag-roundtrip/fuzz/stock e2e 30/0 + full vitest. Committed, NOT deployed.

### V143 stock family — Request 1 committed, Task A/B uncommitted
- **Request 1 (V143, committed `32a59605`)**: StockBalancePanel showed only `status:'active'` → a batch
  drained/cleared to exactly 0 flips to 'depleted' → product VANISHED. Fix: load status ∈ {active,depleted}.
  AV166. (7 NK products were hidden.)
- **Request 2 (Rule M, APPLIED on prod)**: `scripts/v143-nakhon-stock-reset.mjs --apply` reset นครราชสีมา —
  51 batches → 0/0 active, deleted 364 transactional docs (movements/orders/adjustments). Then
  `v143-collapse-nk-multilot.mjs --apply` → 53 products = 53 batches (1 lot each at 0). Idempotent + audited.
- **Task B real-time (V143-ter, uncommitted)**: panel was one-shot getDocs → not live. NEW
  `listenToStockBatchesByBranch` (Layer 1 onSnapshot BS-13 safe-by-default + Layer 2 wrapper); panel
  migrated to the live listener. AV167. **Verified L2 5/0 real prod** (`e2e-stock-balance-realtime.mjs` —
  create/deduct/drain-0/delete from another surface push LIVE to the subscriber).
- **Task A auto-clear lots (V143-quater, uncommitted)**: depleted lots never cleaned → accumulate ("ล้น").
  NEW pure `planLotCleanup` (per product×location: keep live + ≤1 zero placeholder, DELETE-only) +
  daily cron `api/cron/stock-lot-cleanup.js` (03:45 BKK, vercel.json) + Rule M `scripts/stock-lot-cleanup.mjs`.
  AV168. Helper 14/0 + dry-run real prod (0 redundant — state already clean post-reset).

## Next action
Commit V143-ter + V143-quater (once full suite green) → then user authorizes DEPLOY (frontend + the new
cron). The deploy ships: V142 course fixes + V143 stock show-0 + real-time + the auto-clear cron.

## Outstanding user-triggered actions
- **DEPLOY** (frontend-only + 1 new cron; no rules → no Probe-Deploy-Probe). User rejected deploy twice
  while finding the stock issues; now stock cluster is complete.
- Post-deploy: cron `stock-lot-cleanup` activates (daily 03:45 BKK). Optional: hit it once with CRON_SECRET
  to verify live (like V122). L1: open ยอดคงเหลือ on 2 devices → deduct on one → both update instantly.
- Pre-existing (NOT deploy-gating): extended-suite ~280 stale tests.
