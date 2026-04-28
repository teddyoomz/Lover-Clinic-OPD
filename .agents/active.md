---
updated_at: "2026-04-28 EOD — Phase 15.6 / V35 stock bug sweep + V15 #4 deploy + production cleanup (82 docs)"
status: "Production = 79a974c LIVE (V15 #4). 5 user-reported stock issues fixed. 82 docs cleaned."
current_focus: "Phase 15.6 / V35 deployed + cleaned. Awaiting next directive."
branch: "master"
last_commit: "79a974c"
tests: 2740
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "79a974c"
firestore_rules_version: 20
storage_rules_version: 2
---

# Active Context

## State
- master = `79a974c` · production = `79a974c` (V15 #4 LIVE) · in sync
- **2740/2740** focused vitest pass · build clean
- Working tree clean

## What this session shipped (2026-04-28 — V35)
2 commits ([detail](.agents/sessions/2026-04-28-session24-phase15-5-bundle.md) + V35 commit bodies)
- `6075136` Phase 15.6 P0 — Issues 1+2+3+5: StockBalancePanel includeLegacyMain fix; SaleTab handleDelete try/catch; 3 cleanup endpoints (orphan-stock + test-products + test-sales) with be_admin_audit collection lockdown; FK validation via _assertProductExists at 3 batch creators; capacity tooltip + per-row target sub-label; V33.12 testSale.js prefix discipline; V35 entry + audit-stock-flow S26-S28; +170 tests
- `79a974c` Phase 15.6 Phase D — Issue 4: shared ProductSelectField (typeahead, outside-click, 50-cap, Thai-locale aware) + productSearchUtils helpers; migrated 4 stock pickers (OrderPanel mobile+desktop, CentralStockOrderPanel, StockAdjustPanel — preserves tier-scope upstream); 43 tests + flipped 4 V21 anti-regression tests for V35 architecture

Test count 2527 → 2740 (+213).

## V15 #4 deploy + production cleanup
- Pre-probe: 6/6 positive + 5/5 negative (be_admin_audit added) ✓
- Vercel + Firebase rules deployed in parallel ✓
- Post-probe: 6/6 + 5/5 ✓; cleanup 4/4 + strip 2/2 ✓; HTTP smoke 200/200/401 ✓
- **Cleanup deleted 82 docs**:
  - 31 orphan batches (cleanup-orphan-stock endpoint)
  - 9 cascade batches (direct admin SDK — productIds were in be_products so orphan endpoint didn't catch them)
  - 40 test products ADVS-/ADVT-* (cleanup-test-products endpoint)
  - 2 user-named test sales (direct admin SDK — saleId stored as FIELD inside INV-20260425-0004/0005 docs, not as doc.id)
- All deletes audited in `be_admin_audit` collection

## Outstanding (carry-over)
- Non-stock product picker migrations (CourseFormModal, PromotionFormModal, QuotationFormModal, SaleTab line items) — same ProductSelectField, just bigger surface. Deferred to follow-up sub-phase.
- Admin tasks: LineSettings creds + webhook URL · backfill customer IDs · TEST-/E2E- prefix adoption · session checkpoint write at .agents/sessions/2026-04-28-session25-phase15-6-v35-deploy.md
