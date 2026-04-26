# 2026-04-27 (session 12 EOD) — LINE OA full feature COMPLETE + 2 production bug fixes + admin-mediated link approval

## Summary

Session 12 closed the LINE Official Account flow end-to-end. Started with
V32-tris-ter base shipped from session 11 EOD-2 + 2 user-found production
bugs. Ended with full Option-2 admin-mediated approval flow live on
production. 2 deploys, 4 commits, 107 new tests, no V-class regressions.

## Current State

- **Branch**: `master`
- **HEAD**: `66ab18b docs(handoff): V32-tris-quater deployed (cb387c3 LIVE; rules v16)`
- **Tests**: 1096 / 1096 focused passing (~5200 in tests/extended/ opt-in)
- **Build**: clean. BackendDashboard ~963 KB (LinkRequestsTab + LineSettingsTab + LinkLineQrModal lazy-loaded)
- **Production**: `cb387c3` LIVE at https://lover-clinic-app.vercel.app
- **Firestore rules**: v16 LIVE
- **Working tree**: clean. No pending commits/pushes.

## V-entries shipped this session

| V# | Bug | Fix | Lesson |
|---|---|---|---|
| **V32-tris-ter-fix** | (1) Browser CORS block on api.line.me; (2) Webhook unauth REST blocked by `be_*: read,write: if false` rules | Backend proxy `/api/admin/line-test` for LINE test connection + webhook switched to firebase-admin SDK for ALL be_* paths | Server-side privileged code (admin SDK) is the correct way to read rule-locked collections — keep client SDK locked for defense-in-depth |
| **V32-tris-quater** | (gap, not regression) Customer self-service link missing — only QR worked, lacked DM-based "ผูก <ID>" | Full Option-2 admin-mediated approval flow: webhook intent + rate-limit + admin queue UI + edit-customer-IDs modal | When the threat model says no enumeration: same-reply ack regardless of match. When customer doc is multi-field: dotted-path update preserves siblings. When customer + audit must agree: batch atomic write. |

## Commits (this session, 4 total in chronological order)

```
203581f fix(line-oa): V32-tris-ter-fix — production bug fixes (CORS proxy + admin SDK)
cb387c3 feat(line-oa): V32-tris-quater — admin-mediated ID link request flow + edit-customer-ids modal
66ab18b docs(handoff): V32-tris-quater deployed (cb387c3 LIVE; rules v16)
```

(`66ab18b` is the post-deploy handoff doc; deployment itself ran inside the previous shell turn.)

## User-reported bugs fixed (2)

1. **"ทดสอบการเชื่อมต่อ" Failed to fetch** — LINE Messaging API doesn't
   send Access-Control-Allow-Origin headers → browser CORS preflight fails
   → "Failed to fetch" reaches the user. Fixed via new
   `api/admin/line-test.js` proxy that calls api.line.me server-side
   where CORS doesn't apply.

2. **"พิมพ์ token... ไม่พบรหัสผูกบัญชีนี้ในระบบ"** — webhook used
   unauth REST GET on `be_customer_link_tokens/{token}` but the rule
   was `read,write: if false` → 403 → null → "invalid". Same root cause
   meant ALL be_* webhook ops were broken. Fixed by switching webhook
   to firebase-admin SDK for: `consumeLinkToken` (read+delete token),
   `findCustomerByLineUserId`, `findUpcomingAppointmentsForCustomer`,
   and the customer-doc update of `lineUserId/lineLinkedAt`.

## New features (V32-tris-quater)

### Customer self-service link (LINE OA chat)
- Add OA as friend → DM `ผูก 1234567890123` (Thai national ID, 13 digits)
  or `ผูก AA1234567` (passport, 6-12 alphanumeric letter+digit)
- Bot validates format → on invalid, replies with format hint
- On valid: rate-limit check (5/24h) → admin SDK customer lookup by
  `patientData.nationalId` or `patientData.passport` → if matched,
  creates `be_link_requests` pending entry → bot replies SAME ack
  message regardless of match (anti-enumeration)

### Admin queue (LinkRequestsTab in master section)
- Filter: pending / approved / rejected
- Each request shows: customer name + HN + ID-type-with-last-4 +
  LINE displayName + timestamp
- "อนุมัติ" → `db.batch()` atomic: customer.lineUserId + customer
  .lineLinkedAt + request.status='approved' + push LINE notification
  "🎉 อนุมัติการผูกบัญชี"
- "ปฏิเสธ" → request.status='rejected' + push polite apology

### Edit customer IDs modal (CustomerDetailView header)
- New "เลขบัตร" button next to "ผูก LINE" / "พิมพ์เอกสาร"
- Focused fields: nationalId (13 digits) + passport (6-12 alphanumeric
  with letter+digit)
- Strict validation; strips dashes/dots/spaces; uppercases passport
- Save via `updateCustomer(id, { 'patientData.nationalId': X,
  'patientData.passport': Y })` — Firestore dotted path preserves
  ALL OTHER patientData fields (phone, address, emergency, etc.)

## Decisions (non-obvious — preserve reasoning)

### D1 — Webhook + admin SDK hybrid (not pure REST)
Rules `be_*: if isClinicStaff()` + `if false` block webhook unauth REST.
Switching to firebase-admin SDK bypasses rules — exactly what server-
side privileged code is supposed to do. Client SDK stays locked.

### D2 — Same-reply anti-enumeration on id-link-request
`formatIdRequestAck()` returns identical text whether customer matches
or not. Without this, attacker DMs random IDs + observes which get a
"match" reply → builds an enumeration. Admin sees the real match in
LinkRequestsTab + decides to approve.

### D3 — "ผูก" prefix REQUIRED (not bare 13-digit detection)
User directive: "ให้พิมพ์ ผูก [เลขบัตร]". Plain 13-digit could be a
phone number, HN, treatment code. Requiring "ผูก" prefix prevents
false-positive bot triggers + makes intent explicit.

### D4 — Last-4 of ID stored in audit log only (privacy)
`be_link_requests.idValueLast4` keeps audit info without storing the
full ID anywhere outside customer.patientData (rule-protected).

### D5 — Firestore dotted-path update on edit-IDs modal
`updateCustomer(id, { 'patientData.nationalId': X })` updates ONE field.
`updateCustomer(id, { patientData: { nationalId: X } })` would WIPE
firstname/lastname/phone/etc. Critical to use dotted path for nested
object field edits.

### D6 — Approval is BATCH atomic (customer + request together)
`db.batch().update(cRef, ...).update(reqRef, ...).commit()` so customer
.lineUserId + request.status='approved' can never diverge — if either
fails, both roll back.

### D7 — Rate limit 5/24h via be_link_attempts collection
Per-lineUserId enforcement (not per-IP). LINE userIds are stable
identifiers we control; IP would require X-Forwarded-For trust which
LINE doesn't reliably provide.

### D8 — JSX file extension required for RTL tests
`tests/v32-tris-quater-id-link-request.test.js` initially failed because
the file used JSX in EditCustomerIdsModal RTL tests but had `.js`
extension. Vite's oxc parser needs `.jsx` to enable JSX syntax. Renamed
to `.test.jsx` → tests passed.

## Files Touched

### NEW
- `api/admin/line-test.js` — admin proxy for api.line.me/v2/bot/info
- `api/admin/link-requests.js` — list/approve/reject queue endpoint
- `src/lib/lineTestClient.js` — Firebase ID-token wrapper for line-test
- `src/lib/linkRequestsClient.js` — Firebase ID-token wrapper for link-requests
- `src/components/backend/LinkRequestsTab.jsx` — admin queue UI
- `src/components/backend/EditCustomerIdsModal.jsx` — focused ID editor
- `tests/v32-tris-ter-line-bot-fix.test.js` — 36 adversarial guards
- `tests/v32-tris-quater-id-link-request.test.jsx` — 71 adversarial guards

### Modified
- `api/webhook/line.js` — firebase-admin SDK for be_* + id-link-request handler + rate-limit
- `src/lib/lineBotResponder.js` — id-link-request intent + 6 reply formatters
- `src/components/backend/LineSettingsTab.jsx` — backend proxy for test connection
- `src/components/backend/CustomerDetailView.jsx` — "เลขบัตร" button + EditCustomerIdsModal wiring
- `src/components/backend/nav/navConfig.js` — link-requests nav entry
- `src/lib/tabPermissions.js` — link-requests adminOnly:true
- `src/pages/BackendDashboard.jsx` — LinkRequestsTab lazy import + dispatch
- `firestore.rules` — be_link_requests + be_link_attempts (both `read,write: if false`)
- `tests/v32-tris-ter-line-bot-flow.test.js` — L8.7-9 + L9.6 updated for admin SDK shape
- `tests/branch-collection-coverage.test.js` — added 2 new collections to COLLECTION_MATRIX
- `tests/backend-nav-config.test.js` — link-requests in master section array
- `tests/phase11-master-data-scaffold.test.jsx` — count 17 → 18, MASTER_STUB_IDS + 'link-requests'
- `SESSION_HANDOFF.md` + `.agents/active.md` (this session-end commit)

## Live verification done this session

### Probe-Deploy-Probe (V15 combined deploy of cb387c3)
- Pre-probe 6 endpoints: 200/200/200/200/200/200 ✓
- Vercel deployed: 55s (lover-clinic-ow7hhv2lk-teddyoomz-4523s-projects)
- Firebase rules deployed: v16 LIVE
- Post-probe 6 endpoints: 200/200/200/200/200/200 ✓
- Negative-path probes: be_customer_link_tokens 403 + be_course_changes 403
  + be_link_requests 403 + be_link_attempts 403 (all 4 lockdown verified)
- Cleanup pc_appointments + clinic_settings strip: 4/4 = 200
- Production HTTP smoke (/, /?session=, /?patient=): 3/3 = 200

### Earlier deploy (V32-tris-ter-fix at 203581f)
- Same probe pattern, all green
- Vercel: lover-clinic-blbt9szsh-teddyoomz-4523s-projects (49s)
- Negative probe: be_customer_link_tokens 403 verified

## Blockers

None. Production stable + LIVE. Awaiting user QA / new feature ask.

## Iron-clad rules invoked

- **A revert**: not invoked
- **B Probe-Deploy-Probe**: 2 deploys, both with full 6-endpoint pre+post +
  4-endpoint negative + cleanup + smoke
- **C1 Rule of 3**: shared `getAdminFirestore()` pattern in api/admin/* +
  api/webhook/line.js (mirror, not extracted — 4 small instances acceptable)
- **C2 Security**: tokens stored in admin-only collections; same-reply
  anti-enumeration; rate-limit; last-4-only audit storage
- **C3 lean schema**: be_link_requests + be_link_attempts justified
  (audit + rate-limit traceability)
- **D Continuous Improvement**: V32-tris-ter-fix + V32-tris-quater logged
- **E Backend Firestore-only**: api/admin/* exception preserved; webhook
  (api/webhook/) is allowed to use admin SDK for server-side reads
- **H Data ownership**: be_link_requests + be_link_attempts owned by us;
  no ProClinic mirror
- **I Full-flow simulate**: EditCustomerIdsModal RTL test (Q5) chains
  mount → fill → click save → verify updateCustomer payload + verify
  error/success states (real flow, not source-grep only)

## Commands run

```
# V32-tris-ter-fix deploy (203581f)
vercel --prod --yes  → 49s, aliased lover-clinic-blbt9szsh
firebase deploy --only firestore:rules  → v15

# V32-tris-quater deploy (cb387c3)
vercel --prod --yes  → 55s, aliased lover-clinic-ow7hhv2lk
firebase deploy --only firestore:rules  → v16

# Test bank
npx vitest run  → 1096/1096 pass, ~12s focused
npm run build  → clean, BackendDashboard ~963 KB

# Probes (both deploys, 7 probes pre+post each, 4 negative on 2nd)
curl -X POST chat_conversations  → 200
curl -X PATCH pc_appointments  → 200
curl -X PATCH proclinic_session  → 200
curl -X PATCH proclinic_session_trial  → 200
curl -X POST opd_sessions (anon)  → 200
curl -X PATCH opd_sessions (anon)  → 200
curl -X PATCH be_customer_link_tokens (anon)  → 403  (lockdown)
curl -X PATCH be_course_changes (anon)  → 403  (lockdown)
curl -X PATCH be_link_requests (anon)  → 403  (lockdown — NEW)
curl -X PATCH be_link_attempts (anon)  → 403  (lockdown — NEW)
```

## Next todo (ranked by risk + value)

### P0 — User decision
None pending. Wait for user QA / new feature ask.

### P1 — LINE OA polish (if continuing)
1. **LinkLineQrModal warning** — show "Bot Basic ID empty → QR will be
   text only" when admin tries to generate QR without botBasicId set
2. **LineSettingsTab help text** — explain how to find Bot Basic ID in
   LINE Developers Console (basicId vs userId vs channelId confusion)
3. **Wire welcomeMessage override** — LineSettingsTab has the field but
   webhook hardcodes formatLinkSuccessReply / formatLinkRequestApprovedReply.
   Hook them up so admin's customized message goes out instead.

### P2 — Tier 3 deferred (each 3-6h focused)
- T5.a Phase 14.11 visual template designer FULL drag-drop (current MVP
  has live preview + field reorder; full drag-drop is mega XL)
- TFP refactor — split 3200 LOC TreatmentFormPage into 7-8 sub-
  components (T5.b billing extracted; rest pending)

### P3 — Out of scope
- PDPA suite (PV1-PV5) — user-deferred
- Phase 15 Central Stock — multi-branch only

## Resume Prompt

```
Resume LoverClinic OPD — continue from 2026-04-27 session 12 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (cross-session state of truth — master = 66ab18b, prod = cb387c3)
3. .agents/active.md (hot state — 1096 tests, prod LIVE)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V32-tris-quater)
5. .agents/sessions/2026-04-27-session12-line-oa-completion.md (this session detail — 4 commits, 107 new tests, V32-tris-ter-fix + V32-tris-quater shipped)

Status summary:
- master = 66ab18b, 1096 vitest passing, build clean, working tree clean
- Production = cb387c3 LIVE at https://lover-clinic-app.vercel.app (V15 combined deploy verified: pre 6/6 + post 6/6 + neg 4/4 = 403 + cleanup 4/4 + smoke 3/3)
- Firestore rules v16 LIVE (be_course_changes + be_customer_link_tokens + be_link_requests + be_link_attempts all admin-SDK only)
- LINE OA flow end-to-end LIVE: customer DM "ผูก <ID>" → admin queue → approve → bot reply
- Extended test bank (~5200 tests in tests/extended/) opt-in via `npm run test:extended`

This session shipped 4 commits + 107 new tests (V32-tris-ter-fix CORS+adminSDK + V32-tris-quater ID-link request) + 2 user-reported production bugs fixed + 1 net-new feature (admin-mediated ID-link approval flow).

Next action (when user gives go-ahead):
- LIKELY no immediate work — all session-12 work deployed + verified
- If polish wanted: P1 items (LinkLineQrModal warning when botBasicId empty + LineSettingsTab help text + wire welcomeMessage override)
- If new feature: T5.a full drag-drop designer OR TFP refactor (each XL)

Outstanding user-triggered actions (NOT auto-run):
- Admin needs to fill LineSettingsTab credentials (Channel Secret + Access Token + Bot Basic ID) ONCE
- Admin needs to paste webhook URL into LINE Developers Console: https://lover-clinic-app.vercel.app/api/webhook/line
- Admin can backfill customer IDs via new "เลขบัตร" button (ProClinic-cloned customers may have empty IDs)

Rules:
- No deploy unless user explicitly says "deploy" THIS turn (V4/V7/V18)
- V15 combined: "deploy" = vercel + firestore:rules in parallel
- Rule B Probe-Deploy-Probe = 7 endpoints + negative-path lockdown (now 4 collections to verify)
- Bot reply MUST happen AFTER chat-message storage (V32-tris-ter)
- One-time tokens MUST be in client-blocked collection (V32-tris-ter)
- Same-reply anti-enumeration on id-link flow (V32-tris-quater)
- Customer doc edits MUST use Firestore dotted-path (V32-tris-quater D5)
- Customer + audit log MUST be batch atomic (V32-tris-quater D6)
- Every bug → test + audit invariant + V-entry (Rule D + Rule I)

Invoke /session-start to boot context.
```
