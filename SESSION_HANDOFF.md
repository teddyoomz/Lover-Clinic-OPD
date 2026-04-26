# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-04-27 session 13 — V33.3 Edit Customer page + profile card surgery DEPLOYED
- **Branch**: `master`
- **Last commit**: `2cc67ef feat(customer): V33.3 — Edit Customer page + profile card surgery`
- **Test count**: **1302** focused (+206 since s12: V33 159 + V33.2 24 + V33.3 23)
- **Build**: clean. BackendDashboard chunk ~987 KB
- **Deploy state**: ✅ **PRODUCTION = `2cc67ef`** (V15 combined deploy session 13 final — V33.3 LIVE)
  - Vercel: `lover-clinic-ncn9butvf-teddyoomz-4523s-projects` aliased to https://lover-clinic-app.vercel.app (55s)
  - Firestore rules: v17 LIVE (unchanged since V33 — re-deployed for Console-drift safety per V1/V9)
  - Storage rules: V26 claim-based (unchanged — re-deployed)
  - Probe-Deploy-Probe: pre 6/6 + 3 negative = GREEN, post 6/6 + 3 negative = GREEN, cleanup 4/4 = 200, smoke 3/3 = 200 (incl. /?customer=LC-26000001 = 200)
- **Rule B probe list permanent**: 7 endpoints + 3 negative
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅
- **SCHEMA_VERSION**: 16

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
Resume LoverClinic OPD — continue from 2026-04-27 session 12 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (cross-session state of truth — master = 66ab18b, prod = cb387c3)
3. .agents/active.md (hot state — 1096 focused tests, prod LIVE)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V32-tris-quater)
5. .agents/sessions/2026-04-27-session12-line-oa-completion.md (this session detail — 4 commits, 107 new tests, 2 deploys, V32-tris-ter-fix + V32-tris-quater shipped)

Status summary:
- master = 66ab18b, 1096 vitest passing (focused; ~5200 in tests/extended/ opt-in), build clean, working tree clean
- Production = cb387c3 LIVE at https://lover-clinic-app.vercel.app (V15 combined deploy verified: pre 6/6 + post 6/6 + neg 4/4=403 + cleanup 4/4 + smoke 3/3)
- Firestore rules v16 LIVE (be_course_changes + be_customer_link_tokens + be_link_requests + be_link_attempts all admin-SDK only)
- LINE OA flow end-to-end LIVE: customer DM "ผูก <ID>" → admin queue → approve → bot reply
- Extended test bank (~5200 tests in tests/extended/) opt-in via `npm run test:extended`

This session shipped 4 commits + 107 new tests covering V32-tris-ter-fix
(CORS proxy + webhook admin SDK for be_*) and V32-tris-quater (admin-
mediated ID-link approval flow + edit-customer-IDs modal). 2 user-
reported production bugs fixed. 1 net-new feature.

Next action (when user gives go-ahead):
- LIKELY no immediate work — all session-12 work deployed + verified
- If polish wanted: P1 items
  * LinkLineQrModal warning when botBasicId empty (QR will be text-only)
  * LineSettingsTab help text for finding Bot Basic ID in LINE Console
  * Wire welcomeMessage override (LineSettingsTab field exists but webhook
    hardcodes formatLinkSuccessReply / formatLinkRequestApprovedReply)
- If new feature: T5.a full drag-drop designer OR TFP refactor (each XL)

Outstanding user-triggered actions (NOT auto-run):
- Admin needs to fill LineSettingsTab credentials (Channel Secret +
  Channel Access Token + Bot Basic ID) ONCE in production
- Admin needs to paste webhook URL into LINE Developers Console:
  https://lover-clinic-app.vercel.app/api/webhook/line
- Admin can backfill customer IDs via new "เลขบัตร" button on each
  customer page (ProClinic-cloned customers may have empty nationalId)

Rules:
- No deploy unless user explicitly says "deploy" THIS turn (V4/V7/V18)
- V15 combined: "deploy" = vercel + firestore:rules in parallel
- Rule B Probe-Deploy-Probe = 7 endpoints + 4 negative-path lockdowns
  (be_customer_link_tokens + be_course_changes + be_link_requests + be_link_attempts)
- V32-tris-ter-fix lesson: server-side privileged code (admin SDK) is
  the correct way to read rule-locked collections — keep client SDK locked
- V32-tris-quater lesson: same-reply anti-enumeration is required when
  the threat model says no enumeration; customer doc edits MUST use
  Firestore dotted-path; customer + audit MUST be batch atomic
- V31 lesson: silent-swallow try/catch console.warn(continuing) is anti-V21
- Rule H: backend 100% be_* canonical, NO master_data reads outside MasterDataTab
- Every bug → test + audit invariant + V-entry (Rule D + Rule I)

Invoke /session-start to boot context.
```

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~250 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
