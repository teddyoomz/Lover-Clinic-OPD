---
updated_at: "2026-05-15 LATE — V66 BRANCH make-fresh fix DEPLOYED ✓ + orphan cleanup APPLIED ✓ (2,477 docs deleted)"
status: "master=ef680eb · prod=ef680eb · in-sync · build clean · cleanup audit doc emitted"
branch: "master"
last_commit: "ef680eb fix(branch-make-fresh): V66 — BRANCH_BUCKETS filter fields for transfers/withdrawals (sourceLocationId OR destinationLocationId)"
tests: "9883+ vitest GREEN + 123 V66 + 12 skipped + 4 pre-existing failures"
playwright_e2e: 14
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef680eb"
firestore_rules_version: 31
storage_rules_version: 2
---

# Active Context

## State

- master = prod = `ef680eb` · in sync · build clean
- V66 central fix DEPLOYED ✓ (from `25cdb41`)
- V66 BRANCH fix DEPLOYED ✓ (from `ef680eb` — this session)
- Stock orphans CLEANED ✓ (2,477 docs deleted; audit doc `cleanup-stock-orphans-1778787069629-d98ca95c`)

## What this session shipped

1. **V66 BRANCH make-fresh fix** — `branchBackupBuckets.js` adds BUCKET_FILTER_FIELDS side-table + 3 helpers; `branch-make-fresh.js` + `branch-backup-export.js` + 2 CLIs use spec-aware OR-merge for `be_stock_transfers` + `be_stock_withdrawals` (source/destinationLocationId). BUCKETS string-shape preserved (B1.x tests unchanged).
2. **V66 regression test** — `tests/branch-backup-buckets-v66-filter-fields.test.js` V66.B1-B11 + V66.Q1-Q5 (66 assertions, mirrors central V66.1-V66.7).
3. **Rule Q L2 e2e** — `scripts/e2e-v66-branch-make-fresh-transfer-withdrawal.mjs --apply` on real prod 13/13 PASS (3 transfers + 2 withdrawals + 4 controls deleted; negative-control intact; cleanup zero orphans).
4. **Orphan cleanup script** — `scripts/cleanup-stock-orphans.mjs` Rule M two-phase + Rule R diag; --apply commit deleted 2,477 stock orphans + emitted audit doc.
5. **Rule R diag** — `scripts/diag-branch-make-fresh-field-names.mjs` (canonical field-name verification).
6. **Combined deploy** — vercel --prod after explicit user "deploy" verb (Rule V18 honored).

## Pre-deploy state (before this session)
- 1,064 transfers + 9 withdrawals survived make-fresh-on-นครราชสีมา (V66 BRANCH bug)
- 2,477 stock orphans accumulated from V14/V20/V34/V35-era test fixtures (ADVB-/ADVX-/ADVW-/OTHER-/STK-BR-/ADVSA-BR- prefixes)

## Post-deploy state
- 91 VALID stock docs total (21 batches + 39 movements + 1 order + 15 transfers + 5 withdrawals + 8 adjustments + 2 central orders)
- Make-Fresh now correctly wipes ALL 6 stock collections for the target branch
- 2,477 historical orphans cleared from prod Firestore

## Next action

**Rule Q L1 final verification** (user hands-on):
1. Visit https://lover-clinic-app.vercel.app
2. Click Make-Fresh on นครราชสีมา branch (or any branch)
3. Confirm every sub-tab (Balance / Orders / Adjustments / Transfer / Withdrawal / Central / Movement Log) shows 0 records for that branch
4. Report back if anything still remains

Also: try Central Make-Fresh — verified earlier via Rule Q L2 on `25cdb41` but the live UI button is the L1 confirmation.

## Outstanding

- (user-triggered) Hands-on L1 verification on live URL
- (none) — V66 saga 100% architecturally + operationally closed
