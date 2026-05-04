---
updated_at: "2026-05-04 EOD — Phase BSA shipped (12 tasks, 3 layers + audit + flow-simulate); V15 #16+#17 deploys pending"
status: "master=0d02260 · prod=83d8413 LIVE (V15 #15) · 4954 tests pass · BSA shipped (Phase BS V2 → BSA migration complete) · 14 commits ahead-of-prod"
current_focus: "Phase BSA shipped to master across 12 sub-tasks. Awaiting V15 #16 combined deploy auth (vercel + idempotent firestore:rules per V15 convention)."
branch: "master"
last_commit: "0d02260"
tests: 4954
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "83d8413"
firestore_rules_version: 24
storage_rules_version: 2
---

# Active Context

## State
- master = `0d02260` · production = `83d8413` (V15 #15 LIVE 2026-05-06) · **14 commits ahead-of-prod**
- 4954/4954 tests pass · build clean · firestore.rules v24 (unchanged — idempotent next deploy)
- Phase BS V2 + Phase BSA: data backfilled (LIVE on prod NOW); UI/lib/hook/audit code on master awaiting V15 #16

## What this session shipped
- **2103 untagged docs migrated to นครราชสีมา via admin SDK** (be_sales 76, be_treatments 1185, be_appointments 27, be_quotations 8, be_staff_schedules 110, be_stock_orders 12, be_stock_batches 266, be_stock_movements 411, be_stock_adjustments 8). Audit: `be_admin_audit/branch-baseline-apply-1777888816125`.
- **730 master-data docs migrated**: be_products 323, be_courses 368, be_df_groups 8, be_df_staff_rates 22, be_product_groups 6, be_product_units 2, be_medical_instruments 1. Audit: `be_admin_audit/branch-baseline-apply-1777889916504`. (LIVE on prod NOW.)
- **`da57c08`** fix(stock): `listStockLocations` now pulls be_branches → shows "นครราชสีมา"/"พระราม 3" name not raw ID
- **`aecf3a1`** fix(branch): `listenToAppointmentsByDate` + `listenToAllSales` accept {branchId, allBranches}. AppointmentTab day-grid re-subscribes on branch switch.
- **`cf897f6`** feat(bs-v2): 9 master-data tabs branch-scoped (ProductGroups/Units/MedicalInstruments/Holidays/Products/Courses/DfGroups/DoctorSchedules/EmployeeSchedules/FinanceMaster bank+category/LinkRequests). 11 listers + 8 writers refactored via `_resolveBranchIdForWrite` helper. /api/admin/link-requests now accepts {branchId, allBranches} with legacy untagged fallback.
- **Phase BSA (12 tasks, 14 commits) — Branch-Scope Architecture**:
  - Task 1 (e13f3c5): Layer 1 — Promotions/Coupons/Vouchers branch-scope + 2-query OR-merge helper
  - Task 2 (802f896): Layer 1 — OnlineSales/SaleInsuranceClaims/VendorSales branch-scope
  - Task 3 (713958b): __universal__ markers on 8 customer-attached listeners
  - Task 4 (4a297c2): Layer 2 — scopedDataLayer.js + 111 BS2.9 surface completeness tests
  - Task 5 (df48944): Layer 3 — useBranchAwareListener hook
  - Task 6 (dd116b3): Mass-migrated 84 UI imports backendClient → scopedDataLayer + 12 sanctioned exception annotations
  - Task 7 (6f76ec6): TFP H-quater fix — replaced getAllMasterDataItems with listProducts/Courses/Staff/Doctors. **USER-REPORTED BUG CLOSED.**
  - Task 8 (131e378): Live listener migration → useBranchAwareListener hook
  - Task 9 (9401b0b): /audit-branch-scope skill BS-1..BS-8 + Tier 1 registration
  - Task 10 (e32e733): tests/branch-scope-flow-simulate.test.js F1-F9
  - Task 11 (0d02260): Removed dev-only sync re-exports from scopedDataLayer
  - Task 12 (this commit): Rule L (BSA) + Phase BSA V-entry + active.md update
- See checkpoint: `.agents/sessions/2026-05-04-phase-bs-v2.md`

## Decisions (this session)
- Source = target identity bug discovered: BR-1777873556815-26df6480 IS "นครราชสีมา"; user confusion came from stock page raw-ID display bug → fixed listStockLocations.
- Universal (NOT branch-scoped per user spec): พนักงาน / สิทธิ์การใช้งาน / เทมเพลตเอกสาร / แพทย์ & ผู้ช่วย / สาขา / ตั้งค่าระบบ / Sync ProClinic.
- LineSettingsTab deferred (single global doc; needs schema redesign for per-branch chat config).
- Migration policy: empty/missing/'main'/V35-phantom branchIds → migrate to นครราชสีมา. ADV-/TEST-/etc test prefixes preserved (separate cleanup).
- BSA architectural choice over per-callsite refactor — central wrapper module + audit invariants + universal-marker pattern eliminates branch-leak bug class at the import boundary instead of every callsite.
- Listeners stay raw in scopedDataLayer; useBranchAwareListener hook handles re-subscribe.
- Master-data sync helpers stay in backendClient (MasterDataTab dev-only consumer); not re-exported to scopedDataLayer.

## Next action
**V15 #16 combined deploy** — vercel + firebase rules with Probe-Deploy-Probe Rule B. Idempotent (no rules change). Awaiting explicit "deploy" THIS turn (V18).

## Outstanding user-triggered actions
- **V15 #16 deploy** — vercel + firebase rules with Probe-Deploy-Probe Rule B. Idempotent (no rules change). 14 commits ahead-of-prod (Phase BS V2 + Phase BSA).
- **LineSettingsTab per-branch redesign** (deferred since Phase BS V2)
- **be_link_requests writers branchId stamp** (deferred since Phase BS V2)
- **Hard-gate via Firebase custom claim** (Phase BS-future)
- 16.8 `/audit-all` orchestrator readiness check
- Phase 17 plan TBD

## Rules in force
- V18 deploy auth (per-turn explicit "deploy"; no roll-over)
- V15 combined deploy (vercel + firestore:rules + Probe-Deploy-Probe Rule B)
- Rule J brainstorming HARD-GATE + ORTHOGONAL plan-mode
- Rule K work-first, test-last for multi-stream cycles
- Rule H-quater no master_data reads in feature code
- Rule L BSA (Phase BSA — `/audit-branch-scope` BS-1..BS-8)
- Phase BS branchId IMMUTABILITY contract on customer doc
- V36.G.51 lock: data layer MUST NOT import BranchContext.jsx — pure JS via branchSelection.js
- NO real-action clicks in preview_eval
- V31 silent-swallow lock
