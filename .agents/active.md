---
updated_at: "2026-05-04 EOD — Phase BS V2 master-data branch-scoped; V15 #16 pending"
status: "master=cf897f6 · prod=83d8413 LIVE (V15 #15) · 4744 tests pass · 3 commits ahead-of-prod"
current_focus: "Phase BS V2 shipped to master (data + 3 code commits). Awaiting V15 #16 deploy auth."
branch: "master"
last_commit: "cf897f6"
tests: 4744
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "83d8413"
firestore_rules_version: 24
storage_rules_version: 2
---

# Active Context

## State
- master = `cf897f6` · production = `83d8413` (V15 #15 LIVE 2026-05-06) · **3 commits ahead-of-prod**
- 4744/4744 tests pass · build clean · firestore.rules v24 (unchanged — idempotent next deploy)
- Phase BS V2: data backfilled via admin SDK (LIVE on prod NOW); UI/lister code on master awaiting V15 #16

## What this session shipped
- **2103 untagged docs migrated to นครราชสีมา via admin SDK** (be_sales 76, be_treatments 1185, be_appointments 27, be_quotations 8, be_staff_schedules 110, be_stock_orders 12, be_stock_batches 266, be_stock_movements 411, be_stock_adjustments 8). Audit: `be_admin_audit/branch-baseline-apply-1777888816125`.
- **730 master-data docs migrated**: be_products 323, be_courses 368, be_df_groups 8, be_df_staff_rates 22, be_product_groups 6, be_product_units 2, be_medical_instruments 1. Audit: `be_admin_audit/branch-baseline-apply-1777889916504`. (LIVE on prod NOW.)
- **`da57c08`** fix(stock): `listStockLocations` now pulls be_branches → shows "นครราชสีมา"/"พระราม 3" name not raw ID
- **`aecf3a1`** fix(branch): `listenToAppointmentsByDate` + `listenToAllSales` accept {branchId, allBranches}. AppointmentTab day-grid re-subscribes on branch switch.
- **`cf897f6`** feat(bs-v2): 9 master-data tabs branch-scoped (ProductGroups/Units/MedicalInstruments/Holidays/Products/Courses/DfGroups/DoctorSchedules/EmployeeSchedules/FinanceMaster bank+category/LinkRequests). 11 listers + 8 writers refactored via `_resolveBranchIdForWrite` helper. /api/admin/link-requests now accepts {branchId, allBranches} with legacy untagged fallback.
- See checkpoint: `.agents/sessions/2026-05-04-phase-bs-v2.md`

## Decisions (this session)
- Source = target identity bug discovered: BR-1777873556815-26df6480 IS "นครราชสีมา"; user confusion came from stock page raw-ID display bug → fixed listStockLocations.
- Universal (NOT branch-scoped per user spec): พนักงาน / สิทธิ์การใช้งาน / เทมเพลตเอกสาร / แพทย์ & ผู้ช่วย / สาขา / ตั้งค่าระบบ / Sync ProClinic.
- LineSettingsTab deferred (single global doc; needs schema redesign for per-branch chat config).
- Migration policy: empty/missing/'main'/V35-phantom branchIds → migrate to นครราชสีมา. ADV-/TEST-/etc test prefixes preserved (separate cleanup).

## Next action
**V15 #16 combined deploy** — vercel + firebase rules with Probe-Deploy-Probe Rule B. Idempotent (no rules change). Awaiting explicit "deploy" THIS turn (V18).

## Outstanding user-triggered actions
- **V15 #16 deploy** (3 commits ahead-of-prod: stock-name fix + listener branch-scope + Phase BS V2 master-data)
- **LineSettingsTab per-branch redesign** (single config doc → branchOverrides[] map OR move to be_line_configs collection keyed by branchId)
- **be_link_requests writers branchId stamp** — webhook /api/webhook/line creates new requests untagged. Currently surfaced via legacy-fallback shim in handleList. Stamp on create for cleaner long-term.
- **Hard-gate via Firebase custom claim** (Phase BS-future)
- 16.8 `/audit-all` orchestrator-only readiness check
- Phase 17 plan TBD

## Rules in force
- V18 deploy auth (per-turn explicit "deploy"; no roll-over)
- V15 combined deploy (vercel + firestore:rules + Probe-Deploy-Probe Rule B)
- Rule J brainstorming HARD-GATE + ORTHOGONAL plan-mode
- Rule K work-first, test-last for multi-stream cycles
- Rule H-quater no master_data reads in feature code
- Phase BS branchId IMMUTABILITY contract on customer doc
- V36.G.51 lock: data layer MUST NOT import BranchContext.jsx — pure JS via branchSelection.js
- NO real-action clicks in preview_eval
- V31 silent-swallow lock
