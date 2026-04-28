---
updated_at: "2026-04-28 (post V15 #3 deploy — V34 + s22 + s23 LIVE; Phase 15.5 next)"
status: "Production = da15849 LIVE (V15 #3). V34 ADJUST_ADD silent qty-cap fix + s22/s23 central tab UX fixes shipped. Master = production. Awaiting Phase 15.5A+B implementation."
current_focus: "Phase 15.5A — ActorPicker branchIds[] filter; Phase 15.5B — withdrawal approval admin endpoint"
branch: "master"
last_commit: "da15849"
tests: 2389
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "da15849"
firestore_rules_version: 19
storage_rules_version: 2
---

# Active Context

## State
- master = `da15849` · production = `da15849` LIVE (V15 #3, deployed 2026-04-28 ~12:42)
- **2389/2389** focused vitest pass · build clean
- Working tree clean

## V15 #3 deploy summary (just completed)
- **Vercel**: `lover-clinic-9cama0xir-teddyoomz-4523s-projects.vercel.app` aliased to `lover-clinic-app.vercel.app` (44s deploy)
- **Firestore rules**: released to `cloud.firestore` (no rule changes; idempotent re-publish)
- **Pre-probe**: 6/6 positive = 200, 4/4 negative = 403 ✓ (incl. be_central_stock_orders, be_customer_link_tokens, be_link_requests, be_link_attempts negative)
- **Post-probe**: same 6/6 + 4/4 ✓
- **Cleanup**: pc_appointments probe docs deleted (4/4 = 200), clinic_settings probe field stripped (2/2 = 200)
- **HTTP smoke**: root 200, /admin 200, /api/webhook/line 401 (LINE sig check on empty body — expected, not 5xx)

## Production code shipped this deploy
- `da15849` V34 — `adjustAddQtyNumeric` helper (soft-cap math) fixes ADJUST_ADD silent qty-cap on full-capacity batches; cancelStockOrder + updateStockOrder cost cascade migrated to writeBatch (atomicity); audit-stock-flow upgraded S1-S15 → S1-S20; V33.11 stock-test prefix discipline; 4 AUDIT-V34 deferred concurrency flags for V35
- `93c71d6` s23 — central adjust dropdown tier-scoped product filter
- `25ed70a` s22 — central tab "ปรับ"/"+" buttons wired + CentralOrderDetailModal + inline product summary

## Next action
**Phase 15.5 implementation**:
- **A**: ActorPicker `branchIds[]` filter — staff/doctor dropdown filtered by current branch (legacy fallback for empty branchIds[])
- **B**: Withdrawal approval admin endpoint — `/api/admin/stock-withdrawal-approve` (POST, Bearer ID-token, admin-gated, calls updateStockWithdrawalStatus 0→1 or 0→3)

Phase 15.5 ships as V15 #4 deploy (awaits new "deploy" auth per V18).

## Outstanding user-triggered actions (NOT auto-run)
- Live QA on production V15 #3:
  - V34 fix: ลอง ADJUST_ADD บน batch ที่ remaining===total → ต้องเห็น qty เพิ่มจริง
  - s22/s23: central tab "ปรับ"/"+" navigate, dropdown filter, vendor PO detail modal
- Carry-over: admin LineSettings creds + webhook URL · backfill customer IDs · TEST-/E2E- prefix
- After Phase 15.5: V15 #4 deploy auth

## V34 historical artifacts in production (recoverable via V35 migration)
- 4 zero-effect ADJUST_ADD movements on chanel batch (3 user yesterday + 1 V34 verify earlier today)
- Movement log shows +N entries but batch.qty unchanged
- Recoverable via replay-with-new-logic migration script (deferred to V35)
