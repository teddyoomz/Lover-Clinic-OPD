---
updated_at: "2026-05-31 EOD+4 — V142 (course-deduct edit-resave symmetry) + held V140 + V141 SHIPPED + DEPLOYED (8c3a9047)."
status: "V142 + V140 + V141 committed (8c3a9047) + DEPLOYED LIVE @ lover-clinic-app.vercel.app. V142 verified by real-prod L2. REMAINING: V142 heal --apply (now appropriate post-deploy) + L1 hands-on."
branch: "master"
last_commit: "8c3a9047 (V142 + V140 + V141 combined) — pushed + deployed. prod code = 8c3a9047."
tests: "Full vitest 15356/0 (+20 V142). V142 unit 20/0 + TRUE-L2 real-prod e2e 10/0 (bug reproduced + fix verified w/ shipped fns) + targeted course/deduct regression 543/0. Build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "8c3a9047 LIVE (V138+V139 + V140+V141+V142). Aliased."
firestore_rules_version: "UNCHANGED — V142 frontend/lib only (no rules/storage/index/cron → no Probe-Deploy-Probe)."
---

# Active Context — V142 (2026-05-31 EOD+4) — SHIPPED + DEPLOYED

## State
- `/systematic-debugging` on a user-reported course-deduction bug (real prod LC-26000115 / BT-1780203508072). DONE + verified by **real-prod L2** (the bug was reproduced AND the fix verified with the SHIPPED `assign/deduct/reverse` functions — NOT mocks/simulate, addressing the exact Rule-Q-honest failure the user was furious about).
- UNCOMMITTED/HELD on top of the held V140 + V141 (3 features in the working tree).

## What this session fixed (detail → checkpoint 2026-05-31-v142-course-deduct-edit-resave-symmetry.md)
- **Root cause**: edit-RESAVE reverse/re-deduct ASYMMETRY. On a 2nd+ save, `handleSubmit` reverses the prior course deduction (`oldPurchased`) but the fresh re-deduct serialization comes up EMPTY for purchased courses (in-session `purchased-…` rowIds regenerate to `be-row-N` → Pass-1 miss; productId stripped → Pass-2 skip; rem=0 → Pass-2 gate). Refund-without-rededuct → balance reverts to full. (Audit kept the stale "0/1"; customer.courses showed "1/1".)
- **Fix**: NEW `buildReDeductListWithCarryForward` (treatmentBuyHelpers.js) re-applies every reversed deduction still selected → reverse + re-deduct symmetric. TFP wires both sites, create-mode bypassed. **AV163**.
- **Stock parallel**: investigated, NOT affected (gated by `hasStockChange` + `_resolveProductIdByName`).

## Next action
Idle / await user. Committed + deployed (8c3a9047 LIVE). REMAINING (user-gated): V142 heal `--apply` (now appropriate, fix is live) + L1 hands-on.

## Outstanding user-triggered actions
- **V142 heal `--apply`** (Rule M — `scripts/heal-course-reverted-by-edit-resave.mjs`; restores LC-26000115 3 courses `1/1→0/1`; LC-26000009 manual review). Now appropriate — the fix is deployed so it won't re-revert. Needs explicit "heal".
- **L1 hands-on** (prod): buy course in TFP → use → save → re-open → save again → course stays deducted. (V140 chat-scroll 50+ thread + lightbox nav; V141 intake visit-reason after V141 heal.)
- **V141 heal `--apply`** (`scripts/heal-visit-reason-from-symptoms.mjs`, 109/113) — separate Rule M, also now deployable-safe.
- Pre-existing (large, NOT deploy-gating): extended-suite 280 stale tests.
