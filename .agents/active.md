---
updated_at: "2026-04-27 (s13 EOD — V33 + V33.2 Customer create page DEPLOYED)"
status: "Production = b4326c3 LIVE. Manual customer creation working end-to-end. Backend full-page takeover; receipt info wired into SalePrintView+QuotationPrintView. 53 test customers cleaned (425→372)."
current_focus: "Idle. All s13 work deployed + verified. Ready for user QA / next feature."
branch: "master"
last_commit: "b4326c3"
tests: 1279
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "b4326c3"
firestore_rules_version: 17
storage_rules_version: 2
---

# Active Context

## State
- master = `b4326c3`, **1279** focused vitest pass (~5200 in `tests/extended/` opt-in)
- Production = `b4326c3` LIVE. **Firestore rules v17 LIVE** (added be_customer_counter). **Storage rules migrated to V26 claim-based isClinicStaff()** (V33.2 catch-up).
- Working tree clean. Build clean. V15 combined deploy verified: pre 7/7 = 200/403 + post 7/7 = 200/403 + storage neg 403 + cleanup 4/4 + smoke 3/3.

## What this session shipped (s13)
2 commits (`1f0faff` → `b4326c3`). Detail in
`.agents/sessions/2026-04-27-session13-customer-create.md` (to be written).

- **V33** (`1f0faff`) — Backend "เพิ่มลูกค้า" Add Customer modal. Full ProClinic /admin/customer/create parity (89 fields, 7 sections, address cascade, profile + gallery uploads, customer-type/receipt toggles). New `addCustomer` orchestrator + HN counter `LC-YY######` + buildPatientDataFromForm camelCase mirror. Storage.rules V26 catch-up to claim-based gating.
- **V33.2** (`b4326c3`) — Five user directives:
  1. Modal → full-page CustomerCreatePage (BackendDashboard `creatingCustomer` takeover)
  2. DateField for birthdate (rule 04)
  3. Blood types simplified to ['', 'A', 'B', 'O', 'AB']
  4. Receipt info snapshot wired through SaleTab + QuotationFormModal → SalePrintView + QuotationPrintView (personal/company/inherit modes)
  5. 53 test customers cleaned via NEW `deleteCustomerDocOnly` helper (425 → 372)
- **183 new tests total** (1096 → 1279): V33 (159) + V33.2 (24).

## Next action
None pending. If user wants to continue:
- **P1 polish**: TEST-/E2E- prefix enforcement on test fixtures (per V33.2 directive — no trace left); receipt-info edit UI on existing customers
- **P2 XL**: TFP 3200 LOC refactor; T5.a full drag-drop designer

## Outstanding user-triggered actions (NOT auto-run)
- Admin: fill LineSettingsTab credentials (still unchanged from s12)
- Admin: paste webhook URL into LINE Console
- Admin: backfill customer IDs via "เลขบัตร" button
- **NEW**: future test customers MUST use 'TEST-' or 'E2E-' doc-id prefix for batch cleanup (rule per V33.2)

## Key decisions (s13 — V33 + V33.2)
1. HN counter `LC-YY######` atomic via runTransaction; mirrors generateInvoiceNumber pattern
2. Doc-id = LC-{HN}; collision-free with ProClinic numeric ids
3. branchId at root of be_customers (matches be_sales/be_appointments shape)
4. patientData camelCase mirror via buildPatientDataFromForm (cloned + manually-created shape-identical)
5. storage.rules migrated email-regex → isClinicStaff() claim-based (V26 catch-up; no legacy paths remain)
6. Modal → page: `creatingCustomer` boolean in BackendDashboard mirrors `viewingCustomer` takeover
7. Receipt info SNAPSHOT (frozen) on sale/quotation create — accounting standard preserves transaction-time data
8. Cleanup helper `deleteCustomerDocOnly` orphans linked records intentionally for fake test data (cascade blocked by append-only audit rules)
