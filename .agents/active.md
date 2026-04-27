---
updated_at: "2026-04-27 (s17 — V33.9 orphan QR cleanup + V33.10 prefix enforcement DEPLOYED)"
status: "Production = 75bbc38 LIVE. V33.9 stripped pre-V33.4 QR-token plumbing (api/admin/customer-link.js + customerLinkClient.js DELETED; generateLinkToken + consumeLinkToken + LINK-<token> regex + LINK_*/LINK_FAIL_* messages + formatLinkSuccess/FailureReply REMOVED; be_customer_link_tokens rule block REMOVED). V33.10 codified TEST-/E2E- prefix enforcement (createTestCustomerId helper + workflow rule note + tests). Live QA runbook ready in .agents/qa/."
current_focus: "Idle. V33.9 + V33.10 verified via 6/6+3/3 P-D-P + 3/3 HTTP smoke. Phase 15 (Central Stock Conditional) prereqs all green; awaiting user QA pass via .agents/qa/2026-04-27-line-oa-checklist.md + Phase 15 go-ahead."
branch: "master"
last_commit: "75bbc38"
tests: 1595
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "75bbc38"
firestore_rules_version: 17
storage_rules_version: 2
---

# Active Context

## State
- master = `75bbc38`, **1595** focused vitest pass (~5200 in `tests/extended/` opt-in)
- Production = `75bbc38` LIVE (vercel `lover-clinic-9p89gvv6h` aliased to lover-clinic-app.vercel.app). Firestore rules v18 (be_customer_link_tokens block REMOVED) + storage rules V26.
- V33.9 + V33.10 V15 combined deploy verified: pre 6/6 + 3/3 negative + post 6/6 + 3/3 negative + smoke 3/3 (root + /?customer=LC-26000001 + /?backend=1).
- Working tree clean. Build clean.

## What this session shipped (s17)
1 commit (`75bbc38`) — V33.9 + V33.10 + Live QA runbook in one chore commit.

- **V33.9** — Orphan QR-token plumbing cleanup. DELETED:
  api/admin/customer-link.js + src/lib/customerLinkClient.js. REMOVED:
  generateLinkToken / consumeLinkToken / intent='link' / LINK regex /
  LINK_SUCCESS+LINK_FAIL_* messages / formatLinkSuccessReply +
  formatLinkFailureReply / be_customer_link_tokens rule + matrix entry.
  PRESERVED V33.4 admin-mediated id-link request flow.
- **V33.10** — TEST-/E2E- customer ID prefix enforcement.
  NEW tests/helpers/testCustomer.js (createTestCustomerId +
  isTestCustomerId + getTestCustomerPrefix + TEST_CUSTOMER_PREFIXES).
  Workflow rule note in .claude/rules/02-workflow.md.
- **Live QA runbook** — .agents/qa/2026-04-27-line-oa-checklist.md
  (structured tick-off for V33.6/V33.7/V33.8/V33.9 mobile verification).
- Tests: 1576 → 1595 (+19 net; -38 token tests, +57 V33.9/10).
- V15 combined deploy: pre+post probe 6/6 + 3/3 GREEN; smoke 3/3 = 200.
- Vercel: lover-clinic-9p89gvv6h aliased; firestore.rules v18.

## What s16 shipped (prior)
1 commit (`14396ab`) — V33.8 zero-remaining filter (parseRemainingCount +
isCourseConsumed; both formatCoursesReply + buildCoursesFlex extended).

## What s15 shipped (prior)
- **V33.7** (`2ff8803`) — TH/EN i18n + full-date + admin language toggle.
  - 3 user directives: full weekday/month date, auto-EN for foreign
    customers, manual TH/EN toggle in 2 UI surfaces.
  - 1 V33.6 follow-up: หมดอายุ - smart-hide leak (formatThaiDate '-'
    output also filtered now).
  - Architecture: MESSAGES = { th, en } dict in lineBotResponder.js
    + getLanguageForCustomer (lineLanguage > customer_type > 'th') +
    formatLongDate (Intl.DateTimeFormat + Buddhist calendar normalized).
  - Rule C1 extract: NEW LangPillToggle.jsx (3rd consumer triggers extract;
    DocumentPrintModal refactored to use shared component).
  - Backend: api/admin/customer-line-link.js + 'update-language' action;
    api/webhook/line.js threads lang from customer; customerValidation.js
    + lineLanguage FIELD_BOUNDS + normalizer coerce.
  - Tests: +91 (V33.7.A-J + LP1-LP6). Total 1439 → 1530.
  - V15 combined deploy: vercel + firestore:rules; pre+post probe
    6/6 + 3/3 GREEN; HTTP smoke 3/3 = 200.

## What s14 shipped (prior session)
1 commit (`380f05d`). V33.6 mobile Flex no-truncation.

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
- **NEW (V33.7)**: live mobile QA — Thai customer DM "คอร์ส" / "นัด" → confirm full-weekday date; admin toggle a foreign customer to EN → that customer DMs → confirm English replies
- **P1 polish**: TEST-/E2E- prefix enforcement on test fixtures (per V33.2 directive); receipt-info edit UI on existing customers
- **P1 cleanup (24h grace eligible)**: V33.5+ remove orphan QR-token plumbing — api/admin/customer-link.js + customerLinkClient.js + generateLinkToken/consumeLinkToken in webhook + `be_customer_link_tokens` collection
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
