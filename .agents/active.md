---
updated_at: "2026-04-28 (s22+s23 EOD — central tab wiring + tier-scoped product filter; 2 commits unpushed-to-prod)"
status: "Production = e46eda2 LIVE (V15 #2). Master = 93c71d6 with 2 commits ready (s22 + s23). Awaiting V15 #3 deploy authorization."
current_focus: "Awaiting deploy auth for s22 + s23 fixes; live QA on central tab adjust flow"
branch: "master"
last_commit: "93c71d6"
tests: 2275
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "e46eda2"
firestore_rules_version: 19
storage_rules_version: 2
---

# Active Context

## State
- master = `93c71d6` · **2275/2275** focused vitest pass · build clean
- Production = `e46eda2` LIVE (V15 #2). 2 commits unpushed-to-prod (s22 + s23)
- Working tree clean

## What this session shipped (s22+s23 — 2026-04-28)
2 commits ([detail](.agents/sessions/2026-04-28-session22-23-central-tab-wiring-and-tier-filter.md))
- `25ed70a` s22 — central tab wiring (4 user reports): StockBalancePanel "ปรับ"/"+" buttons wired, CentralStockOrderPanel prefillProduct, NEW CentralOrderDetailModal + row-click + inline product summary in both Order panels (+39 tests)
- `93c71d6` s23 — tier-scoped product filter in AdjustCreateForm: dropdown now shows ONLY products with batches at current tier (was showing all master products → user confusion). Empty-state CTA + loading state. Same legacy-main gate preserved (+22 tests)

Tests: 2214 → 2275 (+61).

## Next action
**Awaiting user "deploy" authorization** for V15 #3 combined deploy (vercel + firestore:rules + Probe-Deploy-Probe). 2 commits pending.

## Outstanding user-triggered actions (NOT auto-run)
- V15 #3 combined deploy auth (per V18, doesn't roll over)
- Live QA on central tab adjust: dropdown should show ONLY central-stocked products + clear empty-state CTA
- Carry-over: admin LineSettings creds + webhook URL · backfill customer IDs · TEST-/E2E- prefix
- Deferred to Phase 15.5+: ActorPicker branchIds[] filter; Phase 15.4 central→branch dispatch; Phase 15.5 withdrawal approval admin endpoint
