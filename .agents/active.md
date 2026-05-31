---
updated_at: "2026-05-31 EOD+4 LATE+3 — V142 (course double-deduct) + V143 (stock show-0 + real-time + auto-clear) SHIPPED + DEPLOYED @ 0c607f68. Idle."
status: "DEPLOYED. V142 family (course-deduct) + V143 stock family LIVE on prod. NK stock reset to 0 (1 lot/product) applied. No open work — awaiting next directive."
branch: "master"
last_commit: "0c607f68 V21 fixup v34 INV.11.4 (balance-reader grep → listener). Prod LIVE = 0c607f68 (was 8c3a9047)."
tests: "Full suite 15418/0 (JSON-reporter run, this session) + build clean (✓ 2.82s). NOT re-run at session-end (per rule)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0c607f68 LIVE (deployed this session). Ships V142-quater/quinquies (course double-deduct) + V143/ter/quater (stock show-0 + real-time balance + auto-clear-lot cron)."
firestore_rules_version: "UNCHANGED. vercel.json registered 1 NEW cron (stock-lot-cleanup, 03:45 BKK) — activated on deploy. No rules/storage/index → no Probe-Deploy-Probe."
---

# Active Context — V142 + V143 stock/course cluster SHIPPED+DEPLOYED (2026-05-31 EOD+4 LATE+3)

## State
- Prod LIVE = `0c607f68`. Working tree clean. Full suite 15418/0 + build clean.
- Two families shipped + deployed: V142 (course double-deduct) + V143 (stock show-0 / real-time / auto-clear).
- NK stock reset to 0 (53 products = 53 lots) applied on prod earlier this session (Rule M, audited).

## What this session shipped (detail → checkpoint 2026-05-31-v142-v143-deploy.md)
- **V142-quinquies** course finalize→doctor→finalize DOUBLE-DEDUCT → persisted `_courseDeducted` flag. Verified matrix 30/0 + flag-roundtrip/fuzz/stock L2 e2e 30/0.
- **V143** StockBalancePanel show products drained/cleared to exactly 0 (status∈{active,depleted}). AV166.
- **V143-ter** real-time balance: NEW `listenToStockBatchesByBranch` (BS-13 safe-by-default + Layer-2). AV167. L2 e2e 5/0 real prod.
- **V143-quater** auto-clear-lot: `planLotCleanup` + daily cron `stock-lot-cleanup` (03:45 BKK) + Rule M script. AV168. 14/0 + dry-run 0-redundant.
- 3 V21 test-fixups (v143 SG1 + v138 N10.7 + v34 INV.11.4) — same V143-ter migration class; full suite confirmed no 4th.

## Next action
- None pending. Awaiting next user directive.

## Outstanding user-triggered actions
- **L1 hands-on (user)**: open ยอดคงเหลือ on 2 devices → deduct on one → both update live; confirm NK products show at 0. (Code is L2-verified; L1 = user gold-standard.)
- Cron `stock-lot-cleanup` now active (daily 03:45 BKK). Optional: hit once with CRON_SECRET to verify live (like V122).
- Pre-existing (NOT deploy-gating): extended-suite ~280 stale tests.
