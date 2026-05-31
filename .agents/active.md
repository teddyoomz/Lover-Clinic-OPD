---
updated_at: "2026-05-31 EOD+4 — V142 (course-deduct edit-resave symmetry) DONE+verified via real-prod L2. UNCOMMITTED/HELD on top of V140+V141."
status: "V142 fix done + REAL-PROD L2 verified (bug reproduced + fix proven with SHIPPED functions). NOT committed/deployed/healed (all gated). prod = 3342a9f0 (V138+V139)."
branch: "master"
last_commit: "0d5e278f (EOD+3 docs). prod code = 3342a9f0. V140 + V141 + V142 SOURCE uncommitted in working tree."
tests: "Full vitest 15356/0 (+20 V142). V142 unit 20/0 + TRUE-L2 real-prod e2e 10/0 (bug reproduced + fix verified w/ shipped fns) + targeted course/deduct regression 543/0. Build clean. Heal dry-run: LC-26000115 (3 courses) healable + LC-26000009 (1) ambiguous-manual."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "3342a9f0 LIVE (V138 + V139). V140 + V141 + V142 NOT deployed."
firestore_rules_version: "UNCHANGED — V142 frontend/lib only (no rules/storage/index/cron → no Probe-Deploy-Probe)."
---

# Active Context — V142 (2026-05-31 EOD+4) — HELD

## State
- `/systematic-debugging` on a user-reported course-deduction bug (real prod LC-26000115 / BT-1780203508072). DONE + verified by **real-prod L2** (the bug was reproduced AND the fix verified with the SHIPPED `assign/deduct/reverse` functions — NOT mocks/simulate, addressing the exact Rule-Q-honest failure the user was furious about).
- UNCOMMITTED/HELD on top of the held V140 + V141 (3 features in the working tree).

## What this session fixed (detail → checkpoint 2026-05-31-v142-course-deduct-edit-resave-symmetry.md)
- **Root cause**: edit-RESAVE reverse/re-deduct ASYMMETRY. On a 2nd+ save, `handleSubmit` reverses the prior course deduction (`oldPurchased`) but the fresh re-deduct serialization comes up EMPTY for purchased courses (in-session `purchased-…` rowIds regenerate to `be-row-N` → Pass-1 miss; productId stripped → Pass-2 skip; rem=0 → Pass-2 gate). Refund-without-rededuct → balance reverts to full. (Audit kept the stale "0/1"; customer.courses showed "1/1".)
- **Fix**: NEW `buildReDeductListWithCarryForward` (treatmentBuyHelpers.js) re-applies every reversed deduction still selected → reverse + re-deduct symmetric. TFP wires both sites, create-mode bypassed. **AV163**.
- **Stock parallel**: investigated, NOT affected (gated by `hasStockChange` + `_resolveProductIdByName`).

## Next action
Idle / await user. When authorized: commit (V140+V141+V142) → `vercel --prod` (frontend-only) → heal `--apply` (LC-26000115, AFTER deploy) → L1.

## Outstanding user-triggered actions
- **Commit + push** V140 + V141 + V142 (ask if split desired).
- **Deploy** (`vercel --prod`; V18 needs "deploy").
- **V142 heal `--apply`** (Rule M — LC-26000115 3 courses → 0/1; LC-26000009 manual review). Run AFTER deploy.
- **L1 hands-on**: buy course in TFP → use → save → re-open → save again → course stays deducted.
- Pre-existing (large, NOT deploy-gating): extended-suite 280 stale tests.
