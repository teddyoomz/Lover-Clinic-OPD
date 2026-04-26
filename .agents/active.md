---
updated_at: "2026-04-27 (session 12 EOD — V32-tris-ter-fix + V32-tris-quater LINE OA full feature DEPLOYED)"
status: "master = 66ab18b. Production = cb387c3 LIVE at lover-clinic-app.vercel.app (rules v16). LINE OA flow end-to-end working: customer DM 'ผูก <ID>' → admin queue → approve → bot reply. 1096 focused tests + ~5200 extended."
current_focus: "LINE OA full feature complete. Customer + admin flows live. No outstanding bugs reported. Ready for user QA / next feature."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "66ab18b"
tests: 1096
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "cb387c3"
firestore_rules_version: 16
last_deploy: "cb387c3 via V15 combined (vercel lover-clinic-ow7hhv2lk + firestore rules v16). Pre 6/6=200, Post 6/6=200, Negative 4/4=403 (be_customer_link_tokens + be_course_changes + be_link_requests + be_link_attempts all locked down). Cleanup 4/4=200, smoke 3/3=200."
bundle: "BackendDashboard ~963 KB (LinkRequestsTab + LineSettingsTab + LinkLineQrModal lazy-loaded)"
---

# Active Context

## Objective

Session 12 closed the LINE OA flow end-to-end. Started with V32-tris-ter
shipped from session 11 EOD-2 + 2 production bugs the user found in
real testing. Ended with full Option-2 admin-mediated approval flow +
production verified.

## What this session shipped (4 commits, all deployed)

```
203581f fix(line-oa): V32-tris-ter-fix — CORS proxy + webhook admin SDK
cb387c3 feat(line-oa): V32-tris-quater — admin-mediated ID link request
66ab18b docs(handoff): V32-tris-quater deployed (cb387c3 LIVE; rules v16)
```

(Earlier: `b61c298 chore(tests): reduce default suite 6205 → 989` was
session 11; carried through.)

## Bugs fixed (live production)

1. **"ทดสอบการเชื่อมต่อ" Failed to fetch** — browser CORS block on
   api.line.me. Fixed via new `api/admin/line-test.js` proxy + Firebase
   ID-token wrapper. (commit 203581f)
2. **LINK token always rejected** — webhook used unauth REST against
   `be_customer_link_tokens: read,write: if false`. Fixed by switching
   webhook to firebase-admin SDK for ALL be_* paths
   (consumeLinkToken + findCustomerByLineUserId +
   findUpcomingAppointmentsForCustomer). (commit 203581f)

## Features added

### V32-tris-ter-fix (203581f)
- NEW `api/admin/line-test.js` — admin-gated proxy for LINE bot/info
- NEW `src/lib/lineTestClient.js` — Firebase ID-token wrapper
- `api/webhook/line.js` — switched be_* ops to firebase-admin SDK
- `LineSettingsTab.jsx` — calls backend proxy
- 36 adversarial tests + 4 legacy fixes

### V32-tris-quater (cb387c3) — FULL feature
- NEW `src/lib/lineBotResponder.js` (extended) — `id-link-request`
  intent: "ผูก 1234567890123" (Thai ID) or "ผูก AA1234567" (passport)
- NEW `api/webhook/line.js` (extended) — id-link-request handler:
  rate-limit (5/24h via be_link_attempts) + admin SDK customer lookup
  by patientData.nationalId / patientData.passport + same-reply
  anti-enumeration + createLinkRequest entry
- NEW `api/admin/link-requests.js` — list / approve / reject with
  batch atomic write + LINE Push notifications
- NEW `src/lib/linkRequestsClient.js` — Firebase ID-token wrapper
- NEW `src/components/backend/LinkRequestsTab.jsx` — admin queue UI
  with filter tabs (pending/approved/rejected) + approve/reject buttons
- NEW `src/components/backend/EditCustomerIdsModal.jsx` — focused
  nationalId + passport editor with strict validation; Firestore
  dotted-path update preserves siblings
- NEW `firestore.rules` blocks — `be_link_requests` +
  `be_link_attempts` both `read,write: if false` (admin SDK only)
- NAV: link-requests tab in master section (now 18 items)
- 71 adversarial tests + 3 cascade fixes (nav count, COLLECTION_MATRIX)

## Current state vs production

- master = `66ab18b` (handoff doc commit, no code change)
- Production = `cb387c3` (V32-tris-quater code shipped + LIVE)
- All session-12 commits deployed. No pending push.
- Firestore rules v16 LIVE.

## Outstanding user-triggered actions

None code-side — all this session's work is deployed + verified.

**Optional admin setup** (not blockers):
1. **LINE Settings tab** → Admin needs to fill `Channel Secret` +
   `Channel Access Token` + `Bot Basic ID` from LINE Developers Console
2. **Webhook URL** → Admin needs to paste
   `https://lover-clinic-app.vercel.app/api/webhook/line` into LINE
   Developers Console → Channel → Messaging API → Webhook URL
3. **Customer ID backfill** → Admins use new "เลขบัตร" button on
   each customer to set nationalId/passport (some customers cloned
   from ProClinic may have empty IDs)

## Decisions (non-obvious — preserve reasoning)

### D1 — Webhook + admin SDK hybrid (not pure REST)
Rules `be_*: if isClinicStaff()` block webhook unauth REST. Switching
to firebase-admin SDK bypasses rules — exactly what server-side
privileged code is supposed to do. Defense-in-depth: rules stay
`if false` for client SDK; only the webhook+admin endpoints can read
the locked collections via admin SDK.

### D2 — Same-reply anti-enumeration on id-link-request
`formatIdRequestAck` returns identical text whether customer matches
or not. Without this, attacker DMs random IDs to the OA + observes
which get a "match" reply → builds a customer-DB enumeration. The
admin sees the real match in LinkRequestsTab + decides to approve.

### D3 — Rate limit 5/24h via be_link_attempts collection
Per-lineUserId enforcement (not per-IP). LINE userIds are stable
identifiers we control; IP would require X-Forwarded-For trust which
LINE doesn't reliably provide.

### D4 — "ผูก" prefix REQUIRED (not bare 13-digit detection)
User directive: "ให้พิมพ์ ผูก [เลขบัตร]". Plain 13-digit could be a
phone number, HN, treatment code, etc. Requiring "ผูก" prefix prevents
false-positive bot triggers + makes intent explicit.

### D5 — Last-4 of ID stored only (privacy)
`be_link_requests.idValueLast4` keeps audit info without storing the
full ID anywhere. Full ID is only in customer.patientData.nationalId
which is rule-protected.

### D6 — EditCustomerIdsModal uses Firestore dotted-path
`updateCustomer(id, { 'patientData.nationalId': X, 'patientData.passport': Y })`
preserves all OTHER patientData fields (firstname, lastname, phone, etc.).
Using `{ patientData: {nationalId, passport} }` would WIPE everything else.

### D7 — Approval is BATCH atomic (customer + request together)
`db.batch().update(cRef, ...).update(reqRef, ...).commit()` so customer
.lineUserId + request.status='approved' can never diverge — if either
fails, both roll back. Same pattern as runTransaction without the
read-then-write requirement.

### D8 — Test reduction reversible (move to tests/extended/, not delete)
Session 11 user directive cut 6205 → 989 tests but the moved files
stay in git for `npm run test:extended` (opt-in pre-release suite).
Session 12 added 36+71+3 = 110 new tests bringing focused to 1096.
User confirmed >1000 OK from now on.

## Key tests added this session (107 new)

- `tests/v32-tris-ter-line-bot-fix.test.js` — 36 (CORS proxy + admin SDK)
- `tests/v32-tris-quater-id-link-request.test.jsx` — 71 (Q1-Q10 covering
  intent + reply formatters + webhook handler + admin endpoint +
  EditCustomerIdsModal RTL flow + LinkRequestsTab + nav + lockdown)

## Next todo (when user resumes)

### P0 — User decision
None. Production is stable + LIVE. Wait for user QA feedback or new feature ask.

### P1 — Polish queue (if continuing LINE work)
- (a) Detection warning in LinkLineQrModal when Bot Basic ID empty
  ("QR จะเป็น text แทน auto-link")
- (b) Help text in LineSettingsTab for Bot Basic ID (where to find in
  LINE Developers Console)
- (c) Welcome message customization → already in LineSettingsTab as
  `welcomeMessage` field but not used by webhook yet (LINK approval
  uses formatLinkRequestApprovedReply hard-coded; admin override hook
  point exists but not wired)

### P2 — Tier 3 deferred (each 3-6h focused)
- T5.a Phase 14.11 visual template designer FULL drag-drop (current
  MVP has live preview + reorder; full drag-drop is mega XL)
- TFP refactor — split 3200 LOC TreatmentFormPage into 7-8 sub-
  components (T5.b billing extracted; rest pending)

### P3 — Out of scope (user-deferred)
- PDPA suite (PV1-PV5)
- Phase 15 Central Stock (multi-branch only)

## Detail checkpoint

`.agents/sessions/2026-04-27-session12-line-oa-completion.md`
