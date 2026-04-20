---
updated_at: "2026-04-21 (end-of-session)"
status: "production-live — Phase 11.9 complete + claude-guardrails v0.1 shipped"
current_focus: "Phase 13.1 Quotations — START Friday 2026-04-24 (Triangle pre-scanned)"
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "5a7687e"
tests: 2865
production_url: "https://lover-clinic-app.vercel.app"
guardrails_repo: "F:/claude-guardrails (v0.1 MVP, local only, commit 49a61b0)"
---

# Active Context

## Objective
Phase 13 — 6 sub-tasks sequential starting Friday 2026-04-24. Begin with **13.1 Quotations** (Triangle artifacts already captured; see `.agents/sessions/2026-04-24-phase13-prep.md`).

## Phase 13 Status Check (2026-04-20)
- **13.0a** be_staff CRUD — ✅ DONE in Phase 12.1 (commit `c1ff9f2`)
- **13.0b** be_doctors CRUD — ✅ DONE in Phase 12.1 (commit `c1ff9f2`)
- **13.0c** Firebase Admin SDK `/api/admin/users` — ✅ DONE in Phase 12.0 (commit `a908fdb`)
- **13.1** be_quotations + convert-to-sale — 🟡 NOT STARTED (Triangle pre-scanned for Friday)
- **13.2** be_staff_schedules + AppointmentTab collision — 🟡 NOT STARTED
- **13.3** be_df_groups + be_df_staff_rates matrix — 🟡 NOT STARTED (High risk: 420+ matrix cells)
- **13.4** DF Payout Report — 🟡 NOT STARTED
- **13.5** Permission tab-gate wiring — 🟡 NOT STARTED (building blocks ready: `hasPermission()` at `permissionGroupValidation.js:320` + `be_staff/be_doctors.permissionGroupId` + be_permission_groups CRUD. Missing: BackendDashboard gate + navConfig permission keys + current-user context hook)
- **13.6** Treatment validator + schema — 🟡 NOT STARTED (3200-line form)

## Current State (end of 2026-04-21 session)
- **Phase 11.9 DONE + deployed** — product-group full rewrite (2-type + products[] qty + wiring), full-field sync (JSON API), adapter expansion 4→13, buy-modal NaN guard, treatment med-group wiring to be_product_groups.
- **Last commit**: `5a7687e docs: import claude-guardrails methodology + grep-pair hook`
- **Tests**: 2865 passing
- **Build**: clean
- **firestore.rules**: unchanged (no deploy needed this session)
- **Vercel production**: DEPLOYED via `lover-clinic-eg6mk2cgd` (last deploy: commit `c72fd0e`). Latest `5a7687e` = docs + hook only, no deploy required.
- **Env vars on Vercel**: ✅ all Phase 12 set
- **`/api/admin/users` smoke**: HTTP 401 OK

## claude-guardrails (sibling repo)
- Location: `F:/claude-guardrails` (local git, NOT pushed to GitHub)
- Version: v0.1 MVP (commit `49a61b0`, 25 files, 2909 lines)
- Self-use only — install via `bash F:/claude-guardrails/install.sh <new-project>`
- Feedback loop: `project_claude_guardrails_feedback.md` memory file tracks 5 pending insights to batch-port

## Blockers
None. Phase 12 production-live. Phase 13.1 ready to start Friday.

## Phase 13 Execution Order (all 6 tasks, ~23h, +230 tests)

| # | Scope | Est | Tests | Risk | Triangle pre-scanned? |
|---|---|---:|---:|---|---|
| 13.1 | be_quotations + convert-to-sale | 4h | +40 | Medium | ✅ Friday-ready |
| 13.2 | be_staff_schedules + AppointmentTab collision | 4h | +40 | Medium | Pending |
| 13.3 | be_df_groups + be_df_staff_rates matrix | 5h | +50 | High (420+ cells) | Pending |
| 13.4 | DF Payout Report | 3h | +30 | Low | N/A (read-only) |
| 13.5 | Permission tab-gate wiring | 3h | +30 | Low | N/A (internal) |
| 13.6 | Treatment validator + schema | 4h | +40 | Medium | Pending |

**Start Friday with 13.1** per user directive "ทำเรียงจาก 13.0" (13.0 already done → next sequential = 13.1).

## Phase 13.1 Prep Summary (captured 2026-04-20)

**Entity:** `be_quotations`
**ProClinic POST URL:** `/admin/quotation`
**ID format:** `QUO` + MMYY + 4-digit sequential (e.g. `QUO04260004`)
**Triangle artifacts:**
- `docs/proclinic-scan/admin-quotation-intel-phase13_1.json` (25.9KB — list + filter + nav)
- `docs/proclinic-scan/detailed-adminquotationcreate.json` (21KB — 6 forms w/ full field detail)
- `docs/proclinic-scan/admin-quotation-edit-intel-phase13_1.json` (2.3KB — 404 for ID=1, use QUO* IDs instead)

**Main form fields:** `customer_id` (required, select2), `quotation_date` (required, dd/mm/yyyy), `discount` + `discount_type` (%/บาท radio), `note` (textarea), `seller_id` (single seller — NOT 5-seller like sale/deposit)

**Sub-item categories (4 arrays on quotation doc):**
1. **Courses** — course_name, qty, price, item_discount + type, is_vat_included
2. **Products** — product_name, qty, is_premium, price, item_discount + type, is_vat_included
3. **Promotions** — promotion_name, qty, price, item_discount + type, is_vat_included
4. **Takeaway meds** — takeaway_product_id, qty, is_premium, price + discount, is_vat_included + full medication instructions (generic_name, indications, dosage_amount, dosage_unit, times_per_day, administration_method, administration_times[])

**Convert-to-sale:** OUR addition (not a ProClinic feature). Button in QuotationTab detail → creates `be_sales` doc with same line items + customer + seller_id → updates quotation.convertedToSaleId ref. One-way, idempotent.

## Notes
- `.agents/` layer active as of 2026-04-20. Trust priority in `.agents/AGENTS.md`: iron-clad rules (.claude/rules/) always win on conflict.
- Phase 12.11 adapter is a bridge — Phase 16 Polish still scheduled to do the full caller rewire + migrate be_wallet_types/be_membership_types/be_medication_groups/be_consumable_groups.
- Pre-release strip list (rule H-bis) expanded in Phase 12: MasterDataTab [A3] "ล้าง master_data" section + `clearMasterDataItems` helper are dev-only.
- Phase 13.1 selles_id uses existing be_staff/be_doctors with `has_sales=true` — NO new collection.
