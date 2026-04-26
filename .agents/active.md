---
updated_at: "2026-04-27 (s14 — V33.6 Flex no-truncation DEPLOYED)"
status: "Production = 380f05d LIVE. V33.6 fixes mobile LINE-OA Flex truncation: courses now stacked-vertical card per row (name top, 'คงเหลือ X · หมดอายุ Y' meta below); appt date+time split to two stacked sub-rows; doctor name #222 dark (Rule 04 spirit). Eliminates truncation as a bug class — no flex math, no wrap:false on data."
current_focus: "Idle. V33.6 verified via 6/6+3/3 P-D-P + 3/3 HTTP smoke. Awaiting user mobile QA on LINE OA."
branch: "master"
last_commit: "380f05d"
tests: 1439
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "380f05d"
firestore_rules_version: 17
storage_rules_version: 2
---

# Active Context

## State
- master = `231b2f5`, **1385** focused vitest pass (~5200 in `tests/extended/` opt-in)
- Production = `231b2f5` LIVE (vercel `lover-clinic-6mt57qih5` aliased to lover-clinic-app.vercel.app). Firestore rules v17 + storage rules V26 — unchanged since prior deploy.
- V33.4 + V33.5 V15 combined deploy verified: pre 6/6 + 3/3 negative + post 6/6 + 3/3 negative + cleanup 4/4 + smoke 3/3 (incl. /?customer=LC-26000001 → 200).
- Working tree clean. Build clean.

## What this session shipped (s14)
1 commit (`380f05d`). Detail follows; full V-entry in
`.claude/rules/v-log-archive.md` (V33.6).

- **V33.6** (`380f05d`) — Mobile LINE-OA Flex truncation fix.
  - Bug: V33.5 horizontal flex:5/2/2 + wrap:false truncated mobile.
    "0 / 3 a..." (vs "0 / 3 ครั้ง"), "เหมาตา..." (vs "เหมาตามจริง"),
    "10:00–10..." (vs "10:00–10:30"), provider in red.
  - Fix: vertical-stacked rows + buildCourseMetaLine helper +
    appt date/time split + provider color #222.
  - Tests: +54 (V33.6.A-G). Total 1385 → 1439.
  - V15 combined deploy: vercel + firestore:rules; pre+post probe
    6/6 + 3/3 GREEN; HTTP smoke 3/3 = 200.

## What s13 shipped (prior session)
8 commits (`1f0faff` → `ea8a09c`). Full detail in
`.agents/sessions/2026-04-27-session13-customer-create-and-line-oa-redesign.md`.

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
- **NEW**: live mobile QA — DM "คอร์ส" / "นัด" to LINE OA; verify stacked layout renders fully (no `…` truncation) on smartphone
- **P1 polish**: TEST-/E2E- prefix enforcement on test fixtures (per V33.2 directive); receipt-info edit UI on existing customers
- **P1 cleanup (24h grace)**: V33.5+ remove orphan QR-token plumbing — api/admin/customer-link.js + customerLinkClient.js + generateLinkToken/consumeLinkToken in webhook + `be_customer_link_tokens` collection
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
