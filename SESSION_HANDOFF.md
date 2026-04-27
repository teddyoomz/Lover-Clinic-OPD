# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-04-27 session 19 — Phase 15.4 polish — 7-item triage SHIPPED (7 commits, NOT deployed)
- **Branch**: `master`
- **Last commit**: `26ee312 fix(stock): Phase 15.4 — batch picker legacy-main fallback (item 2)`
- **Test count**: **2123** focused (+218 since s18: 1905 → 2123)
- **Build**: clean. BackendDashboard chunk ≈ 924 KB (unchanged)
- **Deploy state**: ⏳ **PRODUCTION = `75bbc38`** (V33.10 LIVE) · master **17 commits ahead** (10 s18 + 7 s19), awaiting V15 combined deploy
  - Phase 15.2 (s18) has firestore.rules update (`be_central_stock_orders` + counter blocks) → Probe-Deploy-Probe + extend probe list 6→8 endpoints required
  - Phase 15.4 (s19) is data-shape + dual-query only — no new rules, but Probe still mandatory per Rule B
  - User chose strict rule discipline: deploy requires explicit "deploy" THIS turn (V18)
- **Rule B probe list permanent**: 6 positive + 3 negative (extends to 8 positive + 4 negative on next deploy)
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅
- **SCHEMA_VERSION**: 16 (next deploy bumps to 17 — central stock orders)

### Session 2026-04-27 session 19 (7 commits, `0792359` → `26ee312`) — Phase 15.4 polish — 7 user-EOD items SHIPPED

User pasted refined 7-item list at start of s19 ("ทำภายใต้กฎของเราอย่างเคร่งครัด").
All 7 mapped 1:1 to commits. Tests 1905 → 2123 (+218). NOT deployed.

**7 commits**:
```
0792359 — Phase A.1 extract UnitField + getUnitOptionsForProduct (+40 tests)
84ce7b0 — Phase A.2 shared Pagination + usePagination hook (+37 tests)
541ad0b — Phase B  pagination 20/page across 6 panels — item 1 (+44 tests)
3bf01c2 — Phase C  transfer + withdrawal 3-role split — items 5+6 (+35 tests)
95336a5 — Phase D  auto-show unit on batch row across 4 forms — item 7 (+23 tests)
94626c8 — Phase E  movement log cross-branch visibility — items 3+4 (+23 tests)
26ee312 — Phase F  batch picker legacy-main fallback — item 2 (+16 tests)
```

**7 items → fix path**:
1. Pagination 20/page recent-first → shared `usePagination` + `<Pagination>` + 6-panel rollout
2. Batch picker bug → `listStockBatches` opt-in `includeLegacyMain: true` (legacy `branchId='main'` fallback)
3. Transfer movements not in stock log → writer adds `branchIds: [src, dst]`; reader dual-queries
4. Withdrawal movements not in stock log → same as 3
5. Transfer detail modal needs ผู้สร้าง+ผู้ส่ง+ผู้รับ → schema +4 fields (dispatchedByUser/At + receivedByUser/At)
6. Withdrawal detail modal 3 roles → schema +4 fields (approvedByUser/At + receivedByUser/At)
7. Auto-show unit on batch row → CentralPO smart UnitField; Adjust/Transfer/Withdrawal read-only unit cell

**Pre-rollout extracts (Rule C1 Rule of 3)**: UnitField + Pagination both extracted to shared modules before being applied across all consumers. OrderPanel migrated; other panels reuse.

**V14 lock everywhere**: `_normalizeAuditUser` for actor fields, `.filter(Boolean)` for branchIds[], no undefined leaves to setDoc.

**V31 no-silent-swallow**: composite-index soft-fails (dual-query Q2) use `console.warn` not silent.

**V21 anti-regression**: every new test file pairs source-grep guards with NEW pattern assertion (not OLD locked-in). One earlier test (`order-panel-branch-id-and-unit-dropdown.test.js` O3.5-.8) flipped from "function UnitField inline" to "import from ./UnitField.jsx" per V21 lesson.

Detail: `.agents/sessions/2026-04-27-session19-phase15.4-7-items.md`



### Session 2026-04-27 session 18 (9 commits, `dba27ad` → `1066711`) — Phase 15.1-15.3 + 5 bug fixes + actor tracking

User directive: "แพลน phase 15 ได้เลย แบบ Multi-branch ภายใต้กฎของเราอย่างเคร่งครัด"
+ multiple bug reports through the day. Day-long arc, 9 commits, 5 bug
classes squashed in flight, +310 tests (1595 → 1905). NOT deployed.

**9 commits**:
```
dba27ad — Phase 15.1 read-only CentralStockTab + V20 multi-branch foundation (+46 tests)
a4307e3 — Phase 15.2 Central PO write flow + Rule C1 _buildBatchFromOrderItem helper (+86 tests)
22cf0b9 — chore: untrack scheduled_tasks.lock
7550c10 — chore: gitignore for lock file
88a2174 — V22-bis seller numeric-id leak fix + resolveSellerName helper (+33 tests)
e65d335 — Phase 15.3 Central adjustments + AdjustForm scope-bug fix (+19 tests)
12d6081 — product picker p.name regression sweep (Phase 14.10-tris fallout, +19 tests)
74985b8 — OrderPanel BRANCH_ID scope + smart unit dropdown (+25 tests)
ece1868 — OrderDetailModal raw branchId → resolveBranchName helper (+20 tests)
1066711 — actor tracking: ActorPicker + ActorConfirmModal + 5 forms + 6 state-flips + MovementLogPanel ผู้ทำ column (+62 tests)
```

**3 entity-name resolver helpers extracted (Rule of 3 trending)**: resolveSellerName · productDisplayName · resolveBranchName — all return `''` (never raw IDs); pattern locked across 9+ render sites.

**Phase 15 status**: 15.1-15.3 ✅ shipped. 15.4 (central→branch dispatch) + 15.5 (withdrawal approval admin endpoint + manual fallback) queued.

**7 user-reported items queued for next session** (Phase 15.4+ + UX):
1. Pagination 20/page recent-first — all stock+central tabs
2. Batch picker bug in StockAdjustPanel (legacy branchId='main' vs new BR-XXX)
3. Transfer/Withdrawal movements not appearing in Stock Movement Log (only Central)
4. Same as 3 for withdrawals
5. Transfer detail modal needs ผู้สร้าง+ผู้ส่ง+ผู้รับ (3 actor roles)
6. Auto-show unit on batch row in all create forms (extend OrderPanel pattern from 74985b8)
7. ActorPicker dropdown filter by `staff.branchIds[]`/`doctor.branchIds[]` (schema exists)

Detail: `.agents/sessions/2026-04-27-session18-phase15-1-2-3-plus-fixes.md`

### Session 2026-04-27 session 17 (1 commit, `75bbc38`) — V33.9 orphan QR cleanup + V33.10 prefix enforcement + Live QA runbook

User authorized "เก็บให้หมดเตรียมไป 15 เลย ทำภายใต้กฎอย่างเคร่งครัด"
(clean it all up, prepare for Phase 15, strictly under the rules) — chose
"Everything" scope (orphan QR + prefix enforcement + QA prep).

**V33.9 — Orphan QR-token plumbing cleanup**:
DELETED:
- `api/admin/customer-link.js` (token mint endpoint)
- `src/lib/customerLinkClient.js` (token mint client)

REMOVED:
- `lineBotResponder.js`: generateLinkToken function + LINK-`<token>` regex
  in interpretCustomerMessage + intent type 'link' + LINK_SUCCESS /
  LINK_FAIL_INVALID / LINK_FAIL_EXPIRED / LINK_FAIL_ALREADY_LINKED messages
  (TH + EN dicts) + formatLinkSuccessReply + formatLinkFailureReply functions
- `api/webhook/line.js`: consumeLinkToken function + intent === 'link' branch
  + 2 stale imports
- `firestore.rules`: be_customer_link_tokens match block (default-deny applies
  to ghost docs; client SDK still locked)
- `tests/branch-collection-coverage.test.js`: be_customer_link_tokens entry
  in COLLECTION_MATRIX

PRESERVED (V33.4 admin-mediated id-link flow):
- id-link-request intent + payload (national-id + passport detection)
- be_link_requests + be_link_attempts collections + rules
- LinkRequestsTab admin queue UI + LinkLineInstructionsModal
- formatLinkRequestApprovedReply + formatLinkRequestRejectedReply

Behavior change: customers DM'ing old "LINK-<token>" QR codes hit 'unknown'
intent → silent ignore. The window of issued QR codes was tiny (<24h between
V33.4 redesign launch and this cleanup); admin-mediated id-link is now sole
linking mechanism.

**V33.10 — TEST-/E2E- customer ID prefix enforcement**:
- NEW `tests/helpers/testCustomer.js`: createTestCustomerId({prefix, suffix,
  timestamp}) + isTestCustomerId + getTestCustomerPrefix +
  TEST_CUSTOMER_PREFIXES (frozen). Codifies V33.2 directive after 53
  untagged test customers polluted production data.
- NEW section in `.claude/rules/02-workflow.md` — convention + helper
  usage example + anti-pattern lock.
- Drift catcher: tests/v33-10-test-customer-prefix.test.js E1+E2 assert
  the rule + helper file are present.

**Live QA runbook**:
- NEW `.agents/qa/2026-04-27-line-oa-checklist.md` — structured tick-off
  for V33.6 + V33.7 + V33.8 + V33.9 mobile verification. Sections:
  pre-flight + V33.6 no-truncation + V33.7 i18n + V33.8 zero-remaining
  + V33.9 orphan regression + admin "ผูกแล้ว" actions + smoke +
  failure-report template.

**Tests**: NEW v33-9-orphan-qr-cleanup.test.js (37 tests, A-G groups)
+ v33-10-test-customer-prefix.test.js (21 tests). Plus carry-over fixups
in v32-tris-ter-line-bot-flow + v32-tris-ter-line-bot-fix +
v33-7-line-bot-i18n + v33-4-line-bot-bare-id-and-exact-match +
v32-tris-quater-id-link-request (drop V33.5 token-flow assertions).
Total: 1576 → 1595 (+19 net).

**Verification**:
- npm test --run: 1595/1595 green
- npm run build: clean, BD 995.30 KB (≈ unchanged)
- Pre-probe 6/6 + 3 negative GREEN
- Post-probe 6/6 + 3 negative GREEN
- HTTP smoke 3/3 = 200

**1 commit**: `75bbc38`

Detail: this V-entry + commit body.

### Session 2026-04-27 session 16 (1 commit, `14396ab`) — V33.8 zero-remaining filter

User report (mobile screenshot 12:03): bot's "Active Courses" bubble
showed "Acne Tx 12 ครั้ง / Remaining 0 / 3 amp." + "HIFU 500 Shot... /
Remaining 0 / 1 Shot" + "Allergan 100 unit / Remaining 0 / 100 U" — courses
with 0 remaining were leaking into the active list AND the "199 รายการ"
header count.

**Root cause**: ProClinic doesn't auto-flip course.status to 'ใช้หมดแล้ว'
when remaining hits 0/X — status stays 'กำลังใช้งาน'. V33.5/.6/.7 active
filter checked status only, so consumed courses leaked through.

**Fix** (numeric guard on top of status filter):
- NEW exported pure helpers in `lineBotResponder.js`:
  - `parseRemainingCount(qty)` — parses leading number from "0/3 amp.",
    "100 / 100 U", "0.5/1", single "5", numeric `0`, or buffet patterns
    ("เหมาตามจริง" / "buffet" → null = uncountable)
  - `isCourseConsumed(course)` — checks qty first, falls back to remaining
- `formatCoursesReply` + `buildCoursesFlex` filter:
  ```
  statusOk && !isCourseConsumed(c)
  ```
- Header count "N รายการ" / "N items" reflects FILTERED active set
- Buffet courses + unparseable strings keep through (defensive)

**Tests**: +46 in V33.8.A-F (parseRemainingCount + isCourseConsumed +
formatCoursesReply hides + buildCoursesFlex hides + screenshot-regression
+ source-grep guards).

**Carry-over test fixups** (qty='0/X' patterns now filtered):
- V33.5.C4: Course B `0/3` → `1/3`
- V33.6 SAMPLE: Acne Tx `0/3` → `2/3`
- V33.6.B9: meta line assertion to `2 / 3 ครั้ง`
- V33.6.E6: array generator `i+1/i+6` (skip i=0 case)
- V33.6.E9: flipped — qty=0 numeric now FILTERS as consumed (was rendered)

**Verification**:
- npm test --run: 1530 → 1576, all green
- npm run build: clean, BD 995.30 KB (≈ unchanged)
- Pre+Post probes 6/6 + 3/3 GREEN; HTTP smoke 3/3 = 200

**1 commit**: `14396ab`

### Session 2026-04-27 session 15 (1 commit, `2ff8803`) — V33.7 TH/EN i18n + full-date + admin language toggle

User shipped 3 directives in one go (post-V33.6 mobile success):
1. **Date format**: appointment bubble + replies use full weekday +
   full month name. TH `อังคาร 28 เมษายน 2569` / EN `Tuesday 28 April 2026`.
2. **Auto-language**: foreign customers (`customer_type === 'foreigner'`)
   auto-receive EN bot replies. Default 'th'. Stored `lineLanguage` field
   wins over auto-derive.
3. **Admin toggle**: TH/EN segmented pill in 2 surfaces:
   - LinkLineInstructionsModal (CustomerDetailView "ผูก LINE")
   - LinkRequestsTab "ผูกแล้ว" sub-tab — per-row inline

Plus V33.6 follow-up: "หมดอายุ -" leak fix (formatThaiDate output now
also filtered via isMeaningfulValue, so non-ISO inputs like "6/2027"
no longer render dangling suffix).

**Architecture**:
- Single `MESSAGES = { th: {...}, en: {...} }` dict in lineBotResponder.js
- `getLanguageForCustomer(c)` priority: `lineLanguage` > `customer_type='foreigner'` > 'th'
- `formatLongDate(iso, lang)` via `Intl.DateTimeFormat` + Buddhist calendar;
  Thai output normalized (strip "วัน" prefix + "พ.ศ." suffix)
- 13 reply functions + 3 Flex builders all accept language param (default 'th')
- Webhook threads `lang` from customer doc; pre-link paths default 'th'

**Rule C1 extract**: NEW `LangPillToggle.jsx` reusable segmented pill.
3rd consumer (LinkLineInstructionsModal + LinkRequestsTab + DocumentPrintModal)
triggered the extract; old inline pattern in DocumentPrintModal refactored.

**Tests**: +91 new
- `tests/v33-7-line-bot-i18n.test.js` (76): A getLanguageForCustomer +
  B formatLongDate + C reply funcs + D Flex i18n + E หมดอายุ smart-hide +
  F webhook threading + G customer-line-link action + H client helper +
  I customerValidation + J UI source-grep
- `tests/v33-7-lang-pill-toggle.test.jsx` (21): LP1 render + LP2 active +
  LP3 onChange + LP4 disabled + LP5 adversarial + LP6 labelFn
- Updated v33-6 C2 + v32-tris-ter L4.3/L4.4/L4.6 (long-form date assertions)

**Files**:
- src/lib/lineBotResponder.js — MESSAGES + helpers + 13 reply + 3 Flex refactor
- src/lib/customerValidation.js — FIELD_BOUNDS lineLanguage + normalize coerce
- src/lib/customerLineLinkClient.js — updateLineLinkLanguage helper
- api/admin/customer-line-link.js — 'update-language' action + list-linked exposes lineLanguage
- api/webhook/line.js — getLanguageForCustomer + lang threading on 3 sites
- src/components/backend/LangPillToggle.jsx — NEW shared pill
- src/components/backend/LinkLineInstructionsModal.jsx — toggle at top
- src/components/backend/LinkRequestsTab.jsx — per-row toggle in "ผูกแล้ว"
- src/components/backend/DocumentPrintModal.jsx — refactor to shared toggle

**Verification**:
- npm test --run: 1439 → 1530, all green
- npm run build: clean, BD 995.30 KB (≈ unchanged)
- Pre+Post probes 6/6 + 3/3 GREEN
- Production HTTP smoke 3/3 = 200

**1 commit**:
```
2ff8803 feat(line-oa): V33.7 — TH/EN i18n + full-date format + admin language toggle
```

### Session 2026-04-27 session 14 (1 commit, `380f05d`) — V33.6 mobile Flex no-truncation

User reported via mobile screenshots (03:33): V33.5 Flex Bubbles
truncated critical data on mobile LINE viewer:
- Course "คงเหลือ" col: "0 / 3 a..." (vs "0 / 3 ครั้ง")
- Course "หมดอายุ" cell: "เหมาตา..." (vs "เหมาตามจริง")
- Appointment "เวลา": "10:00–10..." (vs "10:00–10:30")
- Doctor name in red (Rule 04 spirit: red on names = ชื่อคนตายฯ)

User constraint: "ไม่อยากแก้หลายรอบเพราะ deploy มันเสียตังทุกครั้ง" —
fix must be definitive, no V33.7 round 2.

**Root cause**: horizontal table flex:5/2/2 + wrap:false on data cells.
Mega bubble ~290px - padding → cols ~[116, 47, 47]px. wrap:false +
narrow column made LINE auto-truncate Thai/Latin mixed strings.

**Fix**: eliminate truncation as a bug CLASS (not patch one ratio):
- Course rows: horizontal 3-col table → vertical-stacked card per row.
  Name (bold, full width, wrap:true) on top; "คงเหลือ X · หมดอายุ Y"
  inline meta below. NEW exported helper `buildCourseMetaLine()`.
- Appointment date+time: combined horizontal row → two stacked sub-rows
  (📅 own line, 🕐 own line). Time always full width, never truncates.
- Provider color: `accentColor` (#dc2626 red) → `#222222` dark. Rule 04
  spirit; clinic-red preserved on header band only.
- Column-header table row dropped (data is self-labeled inline).

**Tests** (Rule I full-flow simulate): +54 across V33.6.A-G:
- A buildCourseMetaLine pure helper — 10 tests
- B course bubble structural contract — 10 tests
- C appt date+time split layout — 7 tests
- D provider color #222 (Rule 04) — 5 tests
- E adversarial inputs (no truncation possible) — 12 tests
- F source-grep regression guards — 6 tests
- G backward compat (existing exports + empty paths) — 4 tests
Plus 5 V33.5 shape-lock updates (C6/D1/D2/D3/E5).

**Verification**:
- npm test --run: 1385 → 1439, all green
- npm run build: clean, BD 994 KB (≈ unchanged)
- Pre-probe 6/6 + 3/3 GREEN, post 6/6 + 3/3 GREEN
- Production HTTP smoke: 3/3 = 200

**1 commit**:
```
380f05d feat(line-oa): V33.6 — Flex bubble vertical-stacked rows (mobile no-truncation)
```

Detail: this V-entry + commit body.

### Session 2026-04-27 session 13 EOD2 (8 commits, `1f0faff` → `ea8a09c`) — Customer create/edit + LINE-OA full redesign

Three deploys to production via V15 combined: V33+V33.2 (b4326c3), V33.3
(2cc67ef), V33.4+V33.5 (231b2f5). Five V-entries across one session.

**8 commits**:
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

**5 V-entries** (V33 → V33.5) — full detail in
`.agents/sessions/2026-04-27-session13-customer-create-and-line-oa-redesign.md`.

**Tests**: 1096 → 1385 (+289 across V33 159 + V33.2 24 + V33.3 23 + V33.4 42 + V33.5 41).

**Probe-Deploy-Probe** (each of 3 deploys): pre 6/6 + 3/3 negative GREEN,
post 6/6 + 3/3 negative GREEN, cleanup 4/4 = 200, smoke 3/3 = 200.

### Session 2026-04-27 session 12 EOD (4 commits, `203581f` → `66ab18b`) — V32-tris-ter-fix + V32-tris-quater LINE OA completion
User chain across the session: production-test bug reports → CORS-proxy fix
+ webhook admin SDK switch → user-asked easier-link options → built
admin-mediated "ผูก [เลขบัตร]" flow + edit-customer-IDs modal → deployed
both via V15 combined Probe-Deploy-Probe.

**4 commits**:
```
203581f fix(line-oa): V32-tris-ter-fix — CORS proxy + webhook admin SDK
cb387c3 feat(line-oa): V32-tris-quater — admin-mediated ID link request
66ab18b docs(handoff): V32-tris-quater deployed (cb387c3 LIVE; rules v16)
```

**2 user-reported production bugs fixed**:
1. **"ทดสอบการเชื่อมต่อ" Failed to fetch** — browser CORS block on
   api.line.me. Fixed via `api/admin/line-test.js` proxy + Firebase
   ID-token wrapper.
2. **LINK token always rejected** — webhook unauth REST blocked by rules.
   Fixed by switching webhook to firebase-admin SDK for be_* paths.

**1 net-new feature (V32-tris-quater)** — admin-mediated approval flow:
- Customer DM `ผูก 1234567890123` (Thai ID) or `ผูก AA1234567` (passport)
- Bot rate-limit (5/24h) + customer lookup via admin SDK + same-reply
  anti-enumeration ack regardless of match
- Admin queue UI (LinkRequestsTab) with filter tabs + approve/reject
  buttons + batch atomic write (customer.lineUserId + request.status)
- LINE Push notifications on approve/reject
- New EditCustomerIdsModal (focused nationalId + passport editor)
  reachable from CustomerDetailView "เลขบัตร" button
- 71 adversarial tests + 3 cascade fixes (nav count, COLLECTION_MATRIX)

**107 new tests** (1025 → 1096): V32-tris-ter-fix 36 + V32-tris-quater 71

**2 deploys via V15 combined**:
- `203581f` — Vercel `lover-clinic-blbt9szsh` + rules v15
- `cb387c3` — Vercel `lover-clinic-ow7hhv2lk` + rules v16 (NEW collections)

**Probe-Deploy-Probe verification (cb387c3 deploy)**:
- Pre 6/6 = 200, Post 6/6 = 200
- Negative 4/4 = 403 (be_customer_link_tokens + be_course_changes +
  be_link_requests + be_link_attempts all locked down)
- Cleanup 4/4 = 200, Production HTTP smoke 3/3 = 200

Detail: `.agents/sessions/2026-04-27-session12-line-oa-completion.md`

### Session 2026-04-26 session 11 (P1-P3 ALL: T3.e + T4 + T5.b + T5.a — pending commit)
User: "ทำทั้งหมด" (do all P1-P3 from session 10's queue). Shipped 4 deferred Tier 3 features in one session:

**T3.e — Email + LINE document delivery** (was BLOCKED on user config in session 9):
- New `api/admin/send-document.js` (admin-gated POST). Body `{type:'email'|'line', recipient, pdfBase64, ...}`.
  - Email path: nodemailer SMTP — config from `clinic_settings/email_config` (host/user/pass/from)
  - LINE path: reuses existing `chat_config.line.channelAccessToken` from webhook/send.js
  - 503 + `code:'CONFIG_MISSING'` when admin hasn't configured yet (UI surfaces friendly Thai error)
  - 10 MB PDF cap; nodemailer dynamically imported (Vercel function size)
- New `src/lib/sendDocumentClient.js` (Firebase ID-token auth wrapper + blob→base64 helper).
- DocumentPrintModal: 2 new buttons "ส่ง Email" + "แจ้ง LINE" with progress + success/error banner. PDF render is intercepted (suppress download click) so the same engine path can both download AND email.
- Tests: 26 in `tests/t3e-send-document.test.js` (helper unit + modal source-grep + server source-grep guards).

**T4 — Course exchange + refund** (Phase 14.4 G5):
- New `src/lib/courseExchange.js` — pure helpers: `findCourseIndex`, `applyCourseExchange`, `applyCourseRefund`, `buildChangeAuditEntry`.
- New `backendClient.exchangeCustomerCourse(...)` + `refundCustomerCourse(...)` — atomic via runTransaction; both write `be_course_changes` audit entry inside the same tx so the customer.courses[] mutation + audit log can never diverge.
- New `backendClient.listCourseChanges(customerId)` — for showing exchange/refund history per customer.
- New `firestore.rules` block for `be_course_changes` (append-only — read+create OK for clinic staff, update+delete forbidden — mirrors be_document_prints / be_stock_movements).
- Tests: 39 in `tests/t4-course-exchange-refund.test.js` (T4.A-F: helpers, exchange, refund, audit, backendClient wiring, firestore rule shape).

**T5.b — TreatmentFormPage refactor** (4676 LOC tech debt):
- Extracted billing math + BMI + baht formatter into `src/lib/treatmentBilling.js` — `computeTreatmentBilling()`, `computeBmi()`, `formatBaht()`. Pure functions, easy to unit-test without mounting the 119-useState component.
- TFP `useMemo(() => billing-calc...)` block went from 40+ LOC inline to a 1-call delegation.
- Tests: 35 in `tests/t5b-treatment-billing.test.js` covering subtotal/medSubtotal/medDisc/billDisc/insurance/membership/deposit/wallet/clamp branches in BOTH backend mode + legacy mode + adversarial inputs.

**T5.a — Visual template designer MVP** (mega XL drag-drop deferred to follow-up):
- DocumentTemplateFormModal gained: live preview pane (sample-data render via DOMPurify-sanitized), quick-insert placeholder bar (clicks insert at textarea cursor with cursor restore), reorder up/down buttons per field row (disabled at edges).
- Tests: 21 in `tests/t5a-template-designer-mvp.test.jsx` (source-grep + RTL: insert at cursor, toggle preview, reorder, edge cases).

**Test fix this session**:
- `tests/branch-collection-coverage.test.js` BC1.1 — added `be_course_changes` to COLLECTION_MATRIX (scope: 'global'); without this the new collection would fail the matrix-spans-rules invariant.

**Production deploy**: 7 commits unpushed-to-prod (b2784cf is prod). Awaiting "deploy".

### Session 2026-04-26 session 10 (V32-tris + M9 reconciler — pending commit)
4 user-reported issues fixed this session:
1. **V32 base** — Bulk PDF blank 2nd page + text floating above underline (V21-class regression — round 1+2)
2. **V32-tris rounds 3+4** — date alignment STILL not right after inline-flex; user "ต้องเอาขึ้นอีกนิด" → switched to position:absolute inner span at bottom:10px + CSS padding-bottom:10px for ~10px clear breathing room
3. **Smart staff picker missing in BulkPrintModal** — user "ทำแบบฉลาดๆ smart อะ" → extracted `StaffSelectField` + `documentFieldAutoFill.js` shared module; both modals now use them; **bonus fix**: original DocumentPrintModal's auto-fill never fired (onChange called with 1 arg instead of 2)
4. **M9 admin reconciler button** — P1 polish queue item; admin-gated card in PermissionGroupsTab with progress + success/failure UI
- New files: `src/lib/documentFieldAutoFill.js`, `src/components/backend/StaffSelectField.jsx`, 4 new test files
- Modified: documentPrintEngine.js (direct html2canvas+jspdf, applyPdfAlignmentInline wrapper approach), DocumentPrintModal.jsx (uses shared module), BulkPrintModal.jsx (smart picker + auto-fill), PermissionGroupsTab.jsx (M9 card)
- package.json: html2canvas + jspdf promoted from transitive to direct deps
- Tests: 5984 → 6005 (+21 new test files / +105 tests, all green); 9/9 e2e public-links pass; build clean

---

### Older sessions (1-line summaries — full detail in `.agents/sessions/*` checkpoints)

| Date | Session | Highlights |
|---|---|---|
| 2026-04-26 | s9 EOD | 8 commits, V31 + Phase 14.8/9/10 + 20-file master_data → be_* migration. `.agents/sessions/2026-04-26-session9-V31-phase14.8-10-master-data-migration.md` |
| 2026-04-26 | s8 EOD | 27 commits — Phase 13.5.4 hard-gate END-TO-END (V23-V30) + UC1 + Tier 2 |
| 2026-04-26 | s7 | 2 commits — Phase 13.5.4 Deploy 1 + V24 schedule sync fix |
| 2026-04-26 | s6 | 1 commit — V23 P0 hotfix anon QR/link patient submit |
| 2026-04-26 | s5 | 10 commits — Phase 13.2.6-13.2.16 ProClinic schedule replication |
| 2026-04-26 | s4 | 4 commits — Polish batch + Phase 13.5 permission system |
| 2026-04-26 | s3 | 5 commits — 24h pre-launch pass |
| 2026-04-26 | s2 | 3 commits — Phase 14.7.H follow-ups D-G |
| 2026-04-26 | s1 EOD | full session — Phase 14.7.C-G + V19 + multi-branch infra (V20) |
| 2026-04-25 | s0 | Phase 14.6 doc-print UX overhaul + Phase 14.7 customer-page appointments |

## What's Next

### Primary: ALL DEPLOYED — production at `093d4d9` ✅
V15 combined deploy completed 2026-04-26 EOD. 11 commits shipped (`7a9c62d`
→ `093d4d9`). Pre+post probes 200/200/200/200. master 1 commit ahead with
V16 anti-regression public-link spec only — no production code change.

If user wants to extend: see P1/P2 polish below.

### P1 polish queue — drained this session
- ✅ Pick-at-treatment partial-pick reopen — DONE (`55b5919`)
- ✅ `listenToHolidays` + bounded `listenToAllSales` — DONE (`b1032bf`)
- ✅ Debug-level logging for ProClinic API silent-catch — DONE (`65ba420` + extended in `b870b40`)
- (deferred) TreatmentTimelineModal virtualization — only if 122-row customer reports lag (not observed yet)

### P2 polish remaining (defer until next pre-launch pass)
- ✅ IIFE JSX refactor at TFP — DONE (`5b790e4`)
- ✅ BackendDashboard code-split — DONE (`4d4529b`, -26% bundle)
- (skip) Remaining brokerClient silent catches (lines 54, 233, 245, 253) — verified false positive: sessionStorage/extension-postMessage best-effort caching with zero functional impact; logging would be noise
- TFP 3200 LOC refactor — split into 7-8 sub-components (high leverage, M-XL effort, defer)
- UC1 weekend red labels in calendar — cultural review (borderline, calendar weekend coloring is global convention)
- M9 customer doc summary drift — mitigated by tx-log; nightly reconciler implicit
- Doc 10/11/12 ProClinic-fidelity sweep — our-own designs; no immediate ProClinic-parity demand
- Permission system end-to-end (Phase 13.5 deferred) — `hasPermission(user, key)` gate at every tab render entry. Needs user input on permission group definitions before implementation.

### P3 explicitly out-of-scope
- PV1-PV5 PDPA (consent UI / audit log / data-export / data-erasure) — user-deferred per CLAUDE.md memory
- AV6 open Firestore rules — all justified by webhook/extension/public-link needs (locked by Rule B comments)

### Phase 15 readiness — UNBLOCKED ✓
- `be_branches` collection ✓
- ProductGroups + Units ✓
- BRANCH_ID hardcode REMOVED ✓
- Multi-branch reports filtering ✓ (queries accept branchId filter)
- **All 13 branch-aware collections wired** (7 from 14.7.H-A + 6 from 14.7.H-D) ✓
- **Period enforcement (V12.2b deferred)** ✓
- **Real-time finance listener** ✓
- **Phase 15 Central Stock can now be planned + started.** Skip if clinic stays single-branch.

### Phase 14 Doc verification queue (10 done / 6 remaining)
- [x] Doc 1/16 — treatment-history Medical History ✅
- [x] Doc 2/16 — medical-certificate (5 โรค) ✅
- [x] Doc 3/16 — medical-certificate-for-driver-license ✅
- [x] Doc 4/16 — medical-opinion (ลาป่วย) ✅
- [x] Doc 5/16 — physical-therapy-certificate ✅
- [x] Doc 6/16 — thai-traditional-medicine-cert ✅
- [x] Doc 7/16 — chinese-traditional-medicine-cert ✅
- [x] Doc 8/16 — fit-to-fly ✅
- [x] Doc 9/16 — patient-referral ✅
- [x] Doc 14/16 — consent (5846e05 — F12 fix landed)
- [x] Doc 16/16 — sale-cancelation (5846e05)
- [ ] Doc 10/16 — treatment-referral A5 (our own design, already ProClinic-style)
- [ ] Doc 11/16 — course-deduction (our own design)
- [ ] Doc 12/16 — medicine-label (our own 57x32mm label printer design)
- [ ] Doc 13/16 — chart **DEFER Phase 16** (graphical face/body chart)
- [ ] Doc 15/16 — treatment template **DEFER Phase 16** (graphical dental chart)

### Phase 14 follow-up phases (memory: project_print_form_world_class_roadmap.md)
- **14.8** — pre-flight required-field validation + digital signature canvas + PDF export (html2pdf)
- **14.9** — audit log + watermark + email/LINE delivery
- **14.10** — bulk print + QR embed + saved drafts
- **14.11** — visual template designer (big lift, defer)

### After Phase 14
- Phase 14.3 G6 vendor-sale wire to nav + tests + ship
- Phase 14.4 G5 customer-product-change (NOT STARTED — complex)
- Phase 15 Central Stock Conditional

---

## Outstanding User Actions (NOT auto-run)

None code-side. Production at `9169363` LIVE + verified (vercel +
firestore rules deployed; pre+post-probe 200/200/200/200; production
HTTP 200 on all 3 routes).

Optional follow-ups (not blockers):
- **Permission group customization**: 5 default groups seeded
  (gp-owner / gp-manager / gp-frontdesk / gp-nurse / gp-doctor). User
  can edit via PermissionGroupsTab; assignments via StaffFormModal.
- **ProClinic schedule sync**: now LIVE in production. User can click
  MasterDataTab → "ดูดตารางหมอ + พนักงาน จาก ProClinic" → "นำเข้า
  master_data → be_staff_schedules" to populate real schedule data.
  Today's-Doctors panel + DoctorSchedulesTab calendar will reflect
  immediately via the live listener.

---

## Blockers

None. Production at `093d4d9` LIVE + verified.

---

## Known Limitations / Tech Debt (carry over)

- **Doc 13/15 deferred to Phase 16** — chart (canvas drawing) / treatment-template (dental chart) are graphical surfaces beyond seed templates.
- **Phase 14.4 G5 customer-product-change NOT STARTED** — bigger feature (course exchange + refund). XL effort.
- ~~Pick-at-treatment partial-pick reopen~~ — ✅ **DONE** in `55b5919` (Phase 14.7.H-I) — last V12.2b deferred item closed.
- ~~Period enforcement (V12.2b)~~ — ✅ **DONE** in `7a9c62d` (Phase 14.7.H-E).
- ~~Hook-order TDZ JSDoc guard~~ — ✅ **DONE** in `7a9c62d` (Phase 14.7.H-G).
- ~~Bundle listenToCustomerFinance~~ — ✅ **DONE** in `7a9c62d` (Phase 14.7.H-F).
- ~~ProClinic API silent-catch logging~~ — ✅ **DONE** in `65ba420` (Phase 14.7.H-J) — debugLog helper + 9 highest-value sites wired; remaining brokerClient catches verified false-positive (sessionStorage best-effort).
- **Phase 14.8/9/10/11 print-form roadmap** — pre-flight + signature canvas + PDF export + audit log + watermark + email/LINE delivery + bulk print + QR embed + visual designer. Tracked in `~/.claude/projects/F--LoverClinic-app/memory/project_print_form_world_class_roadmap.md`. XL each, defer.
- **DocumentPrintModal `dangerouslySetInnerHTML`** — XSS risk if admin types hostile template HTML. Need DOMPurify. Audit P1.
- **FileUploadField URL.createObjectURL** — never revoked → memory leak on repeated uploads. Audit P1.

---

## Violations This Session

None new. Session 3 built on prior V13/V14/V18/V19/V20/V21 lessons:
- **V13** helper-tests-not-enough → applied via Rule I full-flow simulate
- **V14** undefined-reject → no Firestore writes added
- **V18** deploy-without-asking-third-repeat → user said "deploy" verbatim before V15 combined deploy
- **V19** rule-vs-callers → no firestore.rules changes this session
- **V20** multi-branch decision (Option 1) → no re-debate; honored
- **V21** source-grep-locks-broken-behavior → AB6 IIFE refactor tests pair shape grep with runtime outcome via preview_eval

---

## Resume Prompt

Paste this into the next Claude session (or invoke `/session-start`):

```
Resume LoverClinic — continue from 2026-04-27 s19 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=26ee312, prod=75bbc38 — 17 commits unpushed-to-prod)
3. .agents/active.md (2123 tests pass; Phase 15.4 7-items SHIPPED)
4. .claude/rules/00-session-start.md (iron-clad A-I + V-summary)
5. .agents/sessions/2026-04-27-session19-phase15.4-7-items.md

Status: master=26ee312, 2123/2123 tests pass, prod=75bbc38 LIVE (V33.10 baseline)
Phase 15.4 — all 7 user-EOD items shipped this session (pagination · batch
picker · 2× movement log visibility · 2× detail modal 3-roles · auto-unit)
— NOT deployed.

Next: Decide V15 combined deploy (17 commits = 10 s18 + 7 s19). Phase 15.2
(s18) has rules update; Phase 15.4 is shape-only but Probe-Deploy-Probe
required. Probe list: 6→8 endpoints (`be_central_stock_orders` + counter).

Then ActorPicker branchIds filter (deferred from s19's refined list);
Phase 15.5 central dispatch + withdrawal approval admin endpoint.

Outstanding (user-triggered):
  - V15 combined deploy 17 pending commits
  - Admin: fill LineSettingsTab credentials + webhook URL · backfill customer IDs · TEST-/E2E- prefix
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe

/session-start
```

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~250 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
