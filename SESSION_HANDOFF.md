# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-04-26 session 5 — Phase 13.2.6-13.2.16 ProClinic schedule replication (10 commits)
- **Branch**: `master`
- **Last commit**: `0c4a90d phase(13.2.16): legacy StaffSchedulesTab cleanup — list-view deleted`
- **Test count**: ~5190 vitest passing (+ 234 schedule-domain tests across SR/DST/EST/MS/TDP/AFC/SC/MM/SD; -105 deleted list-view UI tests; net +129)
- **Build**: clean. BackendDashboard chunk ~925 KB
- **Deploy state**: ⚠️ **14 commits ahead of prod** — production still at `093d4d9` (last V15 deploy EOD session 3); pending "deploy" command per V18 lesson
  - Vercel: `093d4d9` aliased to https://lover-clinic-app.vercel.app
  - Firestore rules: v10 (UNCHANGED — no rules deploy needed)
  - **Pending deploy**: 14 commits (session 4: `02ee2ef → 242107a` — 5 commits + session 5: `3bf9f31 → 0c4a90d` — 10 commits + 1 docs)
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅
- **Chrome MCP**: Browser 1 connected (Windows, deviceId `8bdc85cc-b6e5-47d9-b3cd-56957264819d`)
- **SCHEMA_VERSION**: 15 (auto-upgrades on print-modal open, no manual deploy needed for schema)

---

## What's Done

### Historical (carried over from earlier sessions)
- ✅ **Phase 1-13.6** — base app + master data + finance + quotations + staff/schedule/DF
- ✅ **Phase 12.2b** (2026-04-24) — Course form ProClinic parity, Rule I established, V13 logged
- ✅ **Phase 12.3** — Sale Insurance Claim UI + SaleReport "เบิกประกัน" col wiring
- ✅ **Phase 14.1** — Document Templates System: 13 seeds + CRUD + print engine
- ✅ **V14 + V15 + V16 + V17 logged** — Firestore-undefined-reject + combined-deploy + race-condition + mobile-resume reconnect
- ✅ **Phase 14.2.A-E** — All 16 doc templates (9 with ProClinic-fidelity replication via Chrome MCP, 4 our-own designs, 3 deferred to Phase 16). F1-F16 test banks (255 tests).

### Session 2026-04-26 session 5 (10 commits, `3bf9f31` → `0c4a90d`) — Phase 13.2.6-13.2.16 ProClinic schedule replication
User directive: "ทำให้ระบบนี้ให้เหมือน proclinic เป๊ะๆ ไม่ต้องคิดเอง...ทั้งหน้า /admin/schedule/doctor และ /admin/schedule/employee แบบ 100% และ wiring ไปในส่วนที่จำเป็นเช่นส่วนการนัดหมาย ส่วนที่แจ้งว่าวันนี้หมอเข้ากี่คนห้องไหนบ้าง"

Triangle capture (Phase 0): 3 ProClinic screenshots + opd.js intel + network analysis confirmed:
- /admin/schedule/{doctor,employee} use month-calendar grid + per-staff right sidebar
- Calendar shows ALL staff stacked per cell (color-coded)
- Right sidebar has 3 sections: งานประจำสัปดาห์ (recurring) / งานรายวัน (override) / วันลา (leave)
- /admin/appointment "แพทย์เข้าตรวจ N คน" panel sources from /admin/api/schedule/today (recurring shifts), NOT appointments

What shipped:
- ✅ **Phase 13.2.6** (`3bf9f31`) — schema extension: 'recurring' type + dayOfWeek field + mergeSchedulesForDate + getActiveSchedulesForDate + listenToScheduleByDay; 44 SR tests; checkAppointmentCollision rewired to honor recurring
- ✅ **Phase 13.2.7** (`7ff124d`) — DoctorSchedulesTab calendar view + scheduling/* shared components (MonthCalendarGrid + ScheduleSidebarPanel + ScheduleEntryFormModal); nav entry doctor-schedules + permission gate; 29 DST tests
- ✅ **Phase 13.2.8** (`5b2d4cb`) — EmployeeSchedulesTab calendar view (replaces list-view StaffSchedulesTab); reuses scheduling/*; 25 EST tests
- ✅ **Phase 13.2.9** (`b2e31bc`) — TodaysDoctorsPanel in AppointmentTab, schedule-derived (NOT appointment-derived); fixes the V21-class bug where doctors-with-no-bookings disappeared from the panel; 21 TDP tests
- ✅ **Phase 13.2.10** (`e192b0c`) — AppointmentFormModal collision check honors recurring shifts (drops {startDate,endDate} filter that excluded recurring entries); 15 AFC tests
- ✅ **Phase 13.2.7-bis HOTFIX** (`e574897`) — V22 user correction: calendar shows ALL staff stacked (not filtered to selected); chip text = "HH:MM-HH:MM <name>" per-staff color hash; sidebar still per-selected; 20 MS tests including V21-anti `data-testid` numeric-id-leak guard
- ✅ **Phase 13.2.13** (`326ef6c`) — ProClinic schedule sync: api/proclinic/master action='syncSchedules' + brokerClient.syncSchedules + MasterDataTab "ตารางหมอ + พนักงาน" sync button; 27 SC tests
- ✅ **Phase 13.2.14** (`a7bf674`) — migrateMasterStaffSchedulesToBe: FK-resolves proClinicStaffId via be_doctors first then be_staff; orphan reporting (no crash); MasterDataTab MIGRATE_TARGETS entry; 23 MM tests
- ✅ **Phase 13.2.15** (`14f4feb`) — synced-data wiring E2E: 30 SD tests (pure pipeline simulator) + LIVE preview_eval verifying all 5 consumer paths read synced data correctly (Tue recurring / Wed leave-override-wins / collision-OK on Tue / collision-blocked-ลา on Wed / Sun panel name resolution)
- ✅ **Phase 13.2.16** (`0c4a90d`) — legacy StaffSchedulesTab.jsx deleted (replaced by Doctor + Employee variants); 105 list-view UI tests deleted; 4 references updated

V22 logged: multi-staff calendar correction (user caught: "ของเรามันแยกโชว์เวลาเลือกคนซึ่งผิด"). Source-grep tests previously passed because they only checked time format, not multi-staff render — added MS.C.4 explicit assertion that numeric staffId NEVER renders as visible chip text.

### Session 2026-04-26 session 4 (4 commits, `02ee2ef` → `242107a`) — Polish batch + Phase 13.5 permission system
- ✅ **P1 Polish batch** (`02ee2ef`) — DocumentPrintModal DOMPurify XSS + safeImgTag URL allowlist (27 PX1 tests) + FileUploadField URL.revokeObjectURL leak fix (15 FU1 tests) + RequiredAsterisk amber-500 component migrating 39 inline asterisks across 17 backend modals (14 RA1 tests) + ChartTemplateSelector 19 hardcoded colors → CSS vars (16 CT1 tests). 72 new tests; +21 KB BackendDashboard from dompurify. **NOT YET DEPLOYED.**
- ✅ **Phase 13.5.1 — useTabAccess wired** (`79feb5f`) — replaced stub with real Firebase-backed permission state via new UserPermissionContext (provider + hook + chained listenToUserPermissions debounce 200ms in backendClient.js) + 5-group seedDefaultPermissionGroups (gp-owner / gp-manager / gp-frontdesk / gp-nurse / gp-doctor) + isAdmin via 3 OR-joined paths (bootstrap @loverclinic.com + no staff doc / OWNER GROUP / META PERM permission_group_management) all gated by clinic-email match. 29 PT1 tests. **NOT YET DEPLOYED.**
- ✅ **Phase 13.5.2 — sidebar/palette/deep-link filter** (`1c83dc8`) — BackendSidebar + BackendCmdPalette filter PINNED + sections via canAccess (empty sections collapsed); BackendDashboard redirect useEffect bounces inaccessible deep-links to firstAllowedTab; handleNavigate canAccess defense-in-depth gate. tabPermissions map gained insurance-claims / vendor-sales / document-templates entries (closed default-allow gap). 23 PS1 tests. **NOT YET DEPLOYED.**
- ✅ **Phase 13.5.3 — inline button gates on 9 destructive actions** (`242107a`) — useHasPermission(key) hook + canDelete/canRefund gates on PermissionGroupsTab / StaffTab / DoctorsTab / BranchesTab / HolidaysTab / CouponTab / PromotionTab / VoucherTab / DepositPanel-refund. Each button: disabled={busy || !canDelete} + Thai tooltip. useUserPermission default-fallback flipped to admin-bypass (preserves backward compat with Phase 13.5.0 stub for standalone RTL tests; production always wraps via App.jsx). 44 PB1 tests. **NOT YET DEPLOYED.**

Phase 13.5.4 (server-side Firebase custom claims + firestore.rules hard-gate) DEFERRED — soft gate ships now, hard gate needs Rule B turn.

### Session 2026-04-26 session 3 (5 commits, `7a9c62d` → `b870b40`) — 24h pre-launch pass
- ✅ **Phase 14.7.H Follow-up H** — listener cluster: `listenToHolidays` + bounded `listenToAllSales(opts.since)`; 3 holiday consumer migrations; LC8/LC9 (29 tests) (`b1032bf`) **NOT YET DEPLOYED**
- ✅ **Phase 14.7.H Follow-up I** — pick-at-treatment **reopen-add** (last V12.2b deferred): `addPicksToResolvedGroup` backend helper + `_pickGroupOptions` snapshot on 1st sibling + reopen UI in TFP; F18 (46 tests) (`55b5919`) **NOT YET DEPLOYED**
- ✅ **Phase 14.7.H Follow-up J** — `debugLog` helper + 9 high-value silent-catch wirings across api/proclinic/{customer,appointment,treatment,deposit}.js; DL1-DL3 (35 tests) (`65ba420`) **NOT YET DEPLOYED**
- ✅ **Audit-all sweep + fixes (2026-04-26)** — 22 audits / 237 invariants via 6 parallel agents → docs/audit-2026-04-26-sweep.md. Verified raw findings, downgraded 6 false positives. Shipped: TZ1 P0 (SalePaymentModal paidAt + StockReportTab CSV filename + medicalInstrumentValidation default-today, all to thaiTodayISO), AP1 P1 (server-side appointment collision check w/ AP1_COLLISION error code + Thai message), RP5 P1 (6 TFP + 3 ChartTemplateSelector outer silent catches → debugLog), AV3 P2 (txId/ptxId crypto.getRandomValues with Math.random fallback), C3 P2 (design-intent regression test for deleteBackendTreatment); 54 tests across 2 files (`b870b40`) **NOT YET DEPLOYED**
- ✅ **IIFE JSX refactor (audit P2 RP1/AV1)** — TFP:3287 grand-total + TFP:4589 pick-modal mount extracted from render-time IIFEs to component-scope useMemo. AB6 anti-regression test bank (6 tests) locks "no `{(() => { ... })()}` in TFP". S21.8 regex updated to accept `pickModalCourse` (was `course`) (`5b790e4`) **NOT YET DEPLOYED**
- ✅ **BackendDashboard code-split (audit P2 perf)** — 17 tabs lazy-loaded via React.lazy + single Suspense boundary. Initial chunk **1,216 KB → 899 KB (-26%)**, gzip **224 → 162 KB (-28%)**. Always-on tabs (Clone, CustomerList, MasterData, Sale, Stock, Finance, Appointment, Promotion, Coupon, Voucher, BackendNav, TFP) stay eager. AC1 test bank (39 tests) locks split + always-on classification (`4d4529b`) **NOT YET DEPLOYED**
- **False positives ruled out by verification**: C3 stock orphan (design intent comment 270-281), CL1 dedup (already implemented at cloneOrchestrator:91-116), CL3 silent fail (per-appointment errors[] handled), FF3 scrollToError gap (data-field attrs exist at 4478+4511), RP1 IIFE JSX (CLAUDE.md bug was about CLICK HANDLERS specifically; render-time IIFEs work), PV1-PV5 PDPA (explicitly deferred per user directive)

### Session 2026-04-26 session 2 (3 production commits, `2ee6eeb` → `7a9c62d`)
- ✅ **Phase 14.7.H Follow-up D** — wire branchId in 6 branch-future collections (be_quotations / be_vendor_sales / be_online_sales / be_sale_insurance_claims / be_expenses / be_staff_schedules); 6 form modals refactored + 6 BC2.spread tests + 6 matrix flips; mirrors AppointmentFormModal pattern from 14.7.H-A (`370854a`) **DEPLOYED**
- ✅ **V21 violation entry + fix** — TreatmentTimelineModal lightbox (Chrome blocks `<a href="data:">`) + close-on-edit (modal z-100 was hiding TFP z-80); 15 TL9 tests + lessons (TL2.6+TL5.1 had encoded broken behavior in source-grep) (`791b2de`) **DEPLOYED via V15 combined deploy**
- ✅ **Phase 14.7.H Follow-up E** — period + daysBeforeExpire integer/bound enforcement + buffet-must-have-expiry rule (V12.2b deferred); 32 PD1-PD6 tests + live preview_eval (12/12 cases pass) (`7a9c62d`) **NOT YET DEPLOYED**
- ✅ **Phase 14.7.H Follow-up F** — listenToCustomerFinance bundle (4 inner listeners with coalesce: deposits + wallets + customer-doc-points + memberships); replaces Promise.all in CustomerDetailView; reloadCustomerFinance shim added; 22 LC6+LC7 tests + live preview_eval on customer 2853 (`7a9c62d`) **NOT YET DEPLOYED**
- ✅ **Phase 14.7.H Follow-up G** — JSDoc HOOK-ORDER INVARIANT guard for TreatmentFormPage:1697 dfEntry useEffect (locks ordering vs upstream useMemo); 14 TFP-HG tests including line-number arithmetic guard (`7a9c62d`) **NOT YET DEPLOYED**

### Session 2026-04-26 EOD session 1 (full session, `0735a50` → `39ab33b`)
- ✅ **Phase 14.7.C** AppointmentTab refactor → shared AppointmentFormModal (`5897b59`)
- ✅ **Phase 14.7.D** Treatment-history redesign + 5/page pagination + ProClinic-fidelity colors (`4f9e13e`)
- ✅ **Phase 14.7.E** TreatmentTimelineModal — full ProClinic ดูไทม์ไลน์ replication, 50 TL1-TL8 tests (`f16cce2`) — **had 2 latent bugs fixed in V21**
- ✅ **Phase 14.7.F** Image-only edit stock-reverse permission fix — pure helper + firestore.rules narrow + 36 tests (`93fffca`) **DEPLOYED**
- ✅ **Phase 14.7.G** Treatment listener — onSnapshot real-time refresh on edit (no F5), 21 tests (`772ee8a`)
- ✅ **V19 violation entry** + comprehensive firestore-rules audit (`fc8125b`)
- ✅ **P0 cleanup batch** — window.__auth gated by import.meta.env.DEV + 4 regression tests + handoff refresh (`8eec8dd`)
- ✅ **Phase 14.7.H Follow-up B** — listener cluster: listenToCustomerSales / listenToCustomerAppointments / listenToAppointmentsByDate; closes 3 staleness gaps (multi-tab admin collision risk); 27 tests (`d34d03b`)
- ✅ **Phase 14.7.H Follow-up C** — VendorSalesTab route wiring (G6 was 95% done; closed last 5%); 8 tests (`73fc75e`)
- ✅ **Phase 14.7.H Follow-up A** — multi-branch infrastructure (Option 1: branchId field, ProClinic-style); BranchContext + BranchSelector + 7 consumer refactors; 73 tests; live integration test proves cross-branch transfer attribution + per-branch isolation (`39ab33b`)

### Session 2026-04-25 (carried over, 0735a50 → 2728635)
- ✅ **Phase 14.6 doc-print UX overhaul** (11 commits, c2e3544 → 49682c9)
  - Hide auto-fill HTML fields + checkbox UI for ☑/☐ marks (was emoji-paste)
  - V18 violation logged (vercel-without-asking, V4/V7 third repeat)
  - 6-issue batch: preview scroll, date BE/CE auto-format, fit-to-fly EN gender, patient signature toggle on opinion/PT/thai/chinese, doctor/staff dropdown via 'staff-select' field type
  - Doctor dropdown stuck loading + auto-upgrade Firestore on modal open (was loading forever because list wasn't fetched until template picked)
  - Doctor names compose from prefix+firstname+lastname (was empty because be_doctors raw shape uses firstname/lastname not 'name')
  - ISO date auto-format in user-typed values (restFrom/restTo etc)
  - Hand-drag pan + max-h-80vh + mouse-wheel zoom on preview
  - Text-on-underline (round 1 inline-flex didn't work; round 2 CSS-injected line-height:1 + padding-top works) + 2-col signature centering
  - Multi-line content boxes (chart/cert findings) — flex column + justify-end
  - Rich staff subtitle (6 fields: role/license/nick/dept/phone/email) + white-space:pre-wrap (preserve user newlines on print)
  - Generic auto-fill: `<baseKey><Suffix>` convention populates LicenseNo/Phone/Email/Position/NameEn/Department/Signature on staff pick

- ✅ **Phase 14.7 customer-page appointments** (1 commit, 9677c05)
  - +เพิ่มนัดหมาย / ดูทั้งหมด buttons in CustomerDetailView appointments card
  - AppointmentCard / AppointmentListModal / (initial simple) AppointmentFormModal
  - getCustomerAppointments loader + nextUpcomingAppt computation
  - 30 new tests (F1 selection, F2 list sort, F3 helper shape, F4 wiring, F5 payload)
  - Audit guard caught raw `<input type="date">` → fixed to use shared `DateField`

- ✅ **Phase 14.7.B shared AppointmentFormModal** (1 commit, 2728635)
  - Extracted full form (550 LoC) into `src/components/backend/AppointmentFormModal.jsx`
  - All AppointmentTab fields (advisor/doctor/assistants/channel/expectedSales/preparation/customerNote/appointmentColor/recurring/lineNotify/status)
  - `lockedCustomer` prop + `skipCollisionCheck` prop for customer-page mode
  - Identical payload contract with AppointmentTab.handleSave (verified F5.1-3 tests)
  - CustomerDetailView migrated to shared component (removed 153-line stub)
  - Tests 30 → 34 (+4 covering F5 contract)

---

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

- **Deploy 4 commits** (`02ee2ef → 242107a`): polish batch + Phase 13.5
  permission system. User must say "deploy" THIS turn per V18 lesson.
  V15 combined deploy = vercel + firestore:rules in parallel; rules
  unchanged this session so probe-deploy-probe is idempotent fire (still
  required by Rule B).
- **Permission group customization**: 5 default groups seeded
  (gp-owner / gp-manager / gp-frontdesk / gp-nurse / gp-doctor) with
  hand-tuned permissions. User can edit via PermissionGroupsTab once
  any be_permission_groups doc exists. Initial seed runs on first tab
  open if collection is empty.

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
Resume LoverClinic OPD — continue from 2026-04-26 end-of-session 4.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (cross-session state of truth — master = 242107a, prod = 093d4d9)
3. .agents/active.md (hot state — 4 commits ahead of prod, all soft-gate permission system + polish)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V21)

Status summary:
- master = 242107a, 5061 vitest passing, build clean (BackendDashboard 924 KB)
- Production: 093d4d9 (last V15 deploy 2026-04-26 EOD) — 4 commits behind
- 4 new commits this session: polish batch + Phase 13.5.1/.2/.3 permission system
- Phase 13.5.4 (firestore.rules hard-gate) DEFERRED to a later session

What this session shipped (commits in order):
- 02ee2ef polish: DOMPurify XSS + URL revoke + amber asterisk + ChartTemplateSelector CSS vars (72 tests)
- 79feb5f Phase 13.5.1 wire useTabAccess + UserPermissionContext + 5-group seed (29 tests)
- 1c83dc8 Phase 13.5.2 sidebar/palette/deep-link filter (23 tests)
- 242107a Phase 13.5.3 inline button gates on 9 destructive actions (44 tests)

Next action (when user gives go-ahead):
- If user wants deploy: combined vercel + firestore:rules (V15). Rules unchanged, idempotent fire. Probe-Deploy-Probe still required (Rule B). 4 commits ship.
- If user wants Phase 13.5.4 hard-gate: server-side Firebase custom claims via /api/admin/setUserPermission + firestore.rules narrowing. Needs Rule B turn for rules deploy.
- If user wants more button gates: extend Phase 13.5.3 to SaleTab cancel/refund + TreatmentFormPage delete + CustomerListTab delete (the deeper flows we deferred). Current pattern: useHasPermission(key) + disabled={busy || !canX} + Thai tooltip.
- If user wants Phase 15: Central Stock Conditional planning. Single-branch clinics can skip.
- If user wants TFP refactor: 3200 LOC monolith → 7-8 sub-components (XL effort).

Outstanding user-triggered actions (NOT auto-run):
- DEPLOY 4 commits (02ee2ef → 242107a) — user types "deploy"
- Permission group customization via PermissionGroupsTab (post-deploy, after seed runs)

Rules:
- No deploy unless user says "deploy" THIS turn (V4/V7/V18)
- V15 combined: "deploy" = vercel + firestore:rules in parallel
- Probe-Deploy-Probe with /artifacts/{appId}/public/data prefix (V1/V9/V19)
- Permission soft-gate: useTabAccess.canAccess (sidebar) + useHasPermission (button)
- useUserPermission outside-provider fallback returns admin-true (test compat)
- Multi-branch decision Option 1 locked (V20)
- V21 lesson: source-grep tests can encode broken behavior — pair with runtime
- Every bug → test + audit invariant + V-entry (Rule D + Rule I)

Invoke /session-start to boot context.
```

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~250 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
