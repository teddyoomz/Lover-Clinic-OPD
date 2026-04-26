---
updated_at: "2026-04-27 (s13 EOD2 — V33.4 LINE-link redesign + V33.5 Flex bot replies DEPLOYED)"
status: "Production = 231b2f5 LIVE. LINE bot now uses Flex Bubbles (clinic-red theme) for course/appointment replies; appointments include doctor name; smart-display hides empty fields; bare-ID auto-detection (no 'ผูก' prefix needed); customer profile shows สัญชาติ correctly + has Edit/LINE buttons in card."
current_focus: "Idle. All s13 work deployed + verified. Ready for user QA / next feature."
branch: "master"
last_commit: "231b2f5"
tests: 1385
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "231b2f5"
firestore_rules_version: 17
storage_rules_version: 2
---

# Active Context

## State
- master = `231b2f5`, **1385** focused vitest pass (~5200 in `tests/extended/` opt-in)
- Production = `231b2f5` LIVE (vercel `lover-clinic-6mt57qih5` aliased to lover-clinic-app.vercel.app). Firestore rules v17 + storage rules V26 — unchanged since prior deploy.
- V33.4 + V33.5 V15 combined deploy verified: pre 6/6 + 3/3 negative + post 6/6 + 3/3 negative + cleanup 4/4 + smoke 3/3 (incl. /?customer=LC-26000001 → 200).
- Working tree clean. Build clean.

## What this session shipped (s13)
4 commits (`1f0faff` → `2cc67ef`). Detail in
`.agents/sessions/2026-04-27-session13-customer-create.md` (to be written).

- **V33** (`1f0faff`) — Backend "เพิ่มลูกค้า" Add Customer modal. Full ProClinic /admin/customer/create parity. Storage.rules V26 catch-up.
- **V33.2** (`b4326c3`) — Five user directives: modal→page, DateField, blood-types simplified, receipt-info snapshot wired, 53 test customers cleaned.
- **V33.4** (`db8ea42`) — Six directives: nationality InfoRow fix (ไทย derived from customer_type) + LinkLineQrModal→LinkLineInstructionsModal (Copy buttons + suspend/unlink panel) + webhook bare-13-digit/passport detection (no "ผูก" prefix) + LinkRequestsTab "ผูกแล้ว" tab (status badge + suspend/resume/unlink) + bot exact-match keyword whitelist (substring no longer triggers).
- **V33.5** (`231b2f5`) — Three directives: Flex Bubble for course list (3-column table, clinic-red header, 25-row cap) + Flex + text appointment reply now includes 👨‍⚕️ doctor/staff name + smart-display (isMeaningfulValue helper hides empty placeholders for expiry/provider/note).
- **V33.3** (`2cc67ef`) — Four user directives:
  1. Edit Customer page (CustomerCreatePage dual-mode `mode='create'|'edit'` + `initialCustomer` prop)
  2. Old "เลขบัตร" button + EditCustomerIdsModal removed (full-page edit replaces it)
  3. Profile card data binding fixed: nationalId/nationalityCountry/passport read both legacy + canonical shapes
  4. Edit + LINE buttons relocated into profile card (image-1 area)
  - NEW backendClient helpers: `buildFormFromCustomer` (reverse mapper, BE→CE birthdate reconstruction) + `updateCustomerFromForm` (atomic update; preserves hn_no; rebuilds patientData mirror)
  - BackendDashboard.editingCustomer state + takeover branch
- **206 new tests total** (1096 → 1302): V33 (159) + V33.2 (24) + V33.3 (23).

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
