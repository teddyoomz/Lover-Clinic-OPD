---
updated_at: "2026-04-28 EOD — Phase 15.5 complete (4 features) + audit S21-S25 + coverage spot-check; awaiting V15 #4 deploy auth"
status: "Production = da15849 LIVE (V15 #3). Master = ac75ad0 with 4 commits unpushed-to-prod (15.5A + 15.5B + Item1+2 + audit)."
current_focus: "Awaiting user 'deploy' auth for V15 #4 combined deploy"
branch: "master"
last_commit: "ac75ad0"
tests: 2527
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "da15849"
firestore_rules_version: 19
storage_rules_version: 2
---

# Active Context

## State
- master = `ac75ad0` · production = `da15849` (V15 #3 LIVE) · 4 commits unpushed-to-prod
- **2527/2527** focused vitest pass · build clean
- Working tree clean

## What this session shipped (2026-04-28)
4 commits ([detail](.agents/sessions/2026-04-28-session24-phase15-5-bundle.md))
- `d037cf0` Phase 15.5A ActorPicker branchIds[] filter (5 stock-mutation forms; pure helper `mergeSellersWithBranchFilter`; 28 tests) + Phase 15.5B Withdrawal approval admin endpoint (`/api/admin/stock-withdrawal-approve` + client wrapper + WithdrawalDetailModal admin UI; 51 tests)
- `89c5607` Item 1 per-product balance warnings (alertDayBeforeExpire/QtyBeforeOutOfStock/QtyBeforeMaxStock drive StockBalancePanel badges + filters; hardcoded ≤30/≤5 removed; 38 tests) + Item 2 unit dropdown enrichment (ProductFormModal datalist merges master + existing product units, Thai-locale sort; 21 tests)
- `ac75ad0` audit-stock-flow S1-S20 → S1-S25 (Phase 15.5 pattern lock) + Phase H coverage spot-check (admin endpoint 89.47% lines / client 100% / pure helpers 85-100%; UI render gaps documented as acceptable)
- Test count 2417 → 2527 (+110)

## Next action
**Awaiting user "deploy" authorization** for V15 #4 combined deploy (vercel + firestore:rules + Probe-Deploy-Probe).

## Outstanding user-triggered actions (NOT auto-run)
- V15 #4 deploy auth (per V18, doesn't roll over). 4 commits ready: 248416e + d037cf0 + 89c5607 + ac75ad0
- Live QA after deploy: 4 features (15.5A actor filter, 15.5B approve/reject buttons, Item 1 per-product warnings on balance panel, Item 2 unit dropdown shows existing product units)
- Carry-over: admin LineSettings creds + webhook URL · backfill customer IDs · TEST-/E2E- prefix
