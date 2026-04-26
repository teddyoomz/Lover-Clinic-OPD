# 2026-04-27 (session 13 EOD2) — Customer create/edit pages + LINE-OA full UX redesign

## Summary

Massive session covering 5 V-entries: built the missing backend "เพิ่มลูกค้า" (Add Customer) page from scratch with full ProClinic parity (V33), then iterated 4 more times based on user feedback — modal→page conversion + receipt wiring + 53 test customers cleaned (V33.2), Edit Customer page + profile card surgery (V33.3), LINE-link UX redesign (V33.4: bare-ID detection, exact-match keywords, suspend/unlink, "ผูกแล้ว" tab), Flex Message bot replies + smart-display (V33.5). Three deploys to production via V15 combined.

## Current State

- **HEAD**: `ea8a09c docs(handoff): V33.4 + V33.5 deployed — LINE-OA full redesign LIVE (231b2f5)`
- **Tests**: 1385 / 1385 focused passing (1096 baseline → +289 across 5 V-entries)
- **Build**: clean. BackendDashboard chunk ~995 KB
- **Production**: `231b2f5` LIVE at https://lover-clinic-app.vercel.app (vercel `lover-clinic-6mt57qih5`, firestore.rules v17, storage rules V26 claim-based)
- **Working tree**: clean

## Commits (8, this session in chronological order)

```
1f0faff feat(customer): V33 — Add Customer modal + 89 fields + HN counter + storage rules V26
b4326c3 feat(customer): V33.2 — modal→page + DateField + blood types + receipt wiring + 53 cleanup
b2193b3 docs(handoff): V33+V33.2 deployed (b4326c3 LIVE)
2cc67ef feat(customer): V33.3 — Edit Customer page + profile card surgery
1516786 docs(handoff): V33.3 deployed (2cc67ef LIVE)
db8ea42 feat(line-oa): V33.4 — bot exact-match + bare-ID + LinkLineInstructions + suspend/unlink
231b2f5 feat(line-oa): V33.5 — Flex bot replies + doctor in appointments + smart-display
ea8a09c docs(handoff): V33.4+V33.5 deployed (231b2f5 LIVE)
```

## Files Touched (names only)

- NEW: CustomerCreatePage.jsx, customer-form/ThaiAddressSelect.jsx, customerLineLinkState.js, customerLineLinkClient.js, customerLineLinkClient.js, customerReceiptInfo.js, customerLineLinkState.js, scrollToFieldError.js, thaiAddressData.js, api/admin/customer-line-link.js, LinkLineInstructionsModal (renamed from LinkLineQrModal)
- MOD: backendClient.js, customerValidation.js, BackendDashboard.jsx, CustomerListTab.jsx, CustomerDetailView.jsx, SaleTab.jsx, SalePrintView.jsx, QuotationFormModal.jsx, QuotationPrintView.jsx, LinkRequestsTab.jsx, lineBotResponder.js, api/webhook/line.js, firestore.rules, storage.rules, branch-collection-coverage.test.js, firestore-rules-anon-patient-update.test.js, v32-tris-quater test, v32-tris-ter-line-bot-flow test
- Tests added: 11 NEW test files covering V33→V33.5

## Decisions (1-line each — full reasoning in commits)

- HN counter `LC-YY######` atomic via runTransaction; doc-id = HN
- branchId at root of be_customers; patientData camelCase mirror via buildPatientDataFromForm
- storage.rules V26 catch-up to claim-based isClinicStaff()
- Receipt info SNAPSHOT (frozen) on sale/quotation create — accounting standard
- Modal → full-page takeover via BackendDashboard `creatingCustomer` / `editingCustomer` states
- 53 test customers cleaned via NEW `deleteCustomerDocOnly` helper (cascade blocked by audit-immutable rules)
- Future test customers MUST use TEST-/E2E- doc-id prefix
- `lineLinkStatus: 'active' | 'suspended'` enum on be_customers (missing/null = legacy active)
- Bare 13-digit / passport DM auto-triggers id-link-request (no "ผูก" prefix); silent drop on no-match
- Bot keyword whitelist EXACT-match (substring no longer triggers — eliminates "อยากดูคอร์ส" false positives)
- Suspend = `findCustomerByLineUserId` filters out suspended → bot silent + chat still stored
- Unlink = ตัดเงียบ (no LINE push to customer)
- LINE Flex Bubble (single, mega size) for courses + appointments; clinic-red header
- Smart-display: `isMeaningfulValue(v)` hides null/'-'/'ไม่มี'/'ไม่ระบุ'/'N/A' placeholders
- Doctor name read from `appt.doctorName` (denormalized — no FK lookup)
- altText = text formatter output (graceful fallback for LINE < 8.11)

## Outstanding (user-triggered, not auto)

- LIVE QA: customer DM "คอร์ส" / "นัด" / bare-13-digit to verify Flex bubbles render + bare-ID detection works
- Admin: test "ผูกแล้ว" tab + suspend/resume/unlink actions
- Pending V33.5+ cleanup: remove orphan QR-token plumbing (api/admin/customer-link.js, customerLinkClient.js, generateLinkToken, consumeLinkToken in webhook, be_customer_link_tokens collection) — 24h grace period for in-flight tokens

## Next Todo

None pending. Idle until next user direction.

## Resume Prompt

```
Resume LoverClinic — continue from 2026-04-27 EOD2.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=ea8a09c, prod=231b2f5)
3. .agents/active.md (1385 focused tests pass)
4. .claude/rules/00-session-start.md (iron-clad A-I + V-summary)
5. .agents/sessions/2026-04-27-session13-customer-create-and-line-oa-redesign.md

Status: master=ea8a09c, 1385 / 1385 tests pass, prod=231b2f5 LIVE
Next: idle — awaiting user direction
Outstanding (user-triggered):
  - Live QA bot Flex replies in LINE OA
  - Admin test suspend/resume/unlink in "ผูกแล้ว" tab
  - V33.5+ cleanup: remove orphan QR-token plumbing after 24h grace
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe (7+3 endpoints)

/session-start
```
