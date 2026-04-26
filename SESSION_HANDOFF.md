# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-04-26 session 8 EOD — Phase 13.5.4 + V23-V30 + UC1 + Tier 2 closed end-to-end
- **Branch**: `master`
- **Last commit**: `6480083 docs(handoff): V30 LIVE + Tier 2 closed + Tier 3 status`
- **Test count**: ~5400 vitest passing (175+ permission/security/E2E across 8 test files)
- **Build**: clean. BackendDashboard chunk ~925 KB
- **Deploy state**: ✅ **DEPLOYED** — production at `5b3a89b` (V30 V15 combined deploy session 8 EOD)
  - Vercel: `lover-clinic-jbx0eyf11` aliased to https://lover-clinic-app.vercel.app (27s)
  - Firestore rules: v13 (V27-tris narrow on opd_sessions delete)
  - Pre+post probes 7/7 = 200; cleanup OK; production smoke 2/2 = 200
- **Rule B probe list permanent**: 7 endpoints (5 baseline + V23 anon-update CREATE + V27-tris anon-DELETE)
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅ (handoff commit pending in this turn)
- **Chrome MCP**: Browser 1 connected (Windows, deviceId `8bdc85cc-b6e5-47d9-b3cd-56957264819d`)
- **SCHEMA_VERSION**: 15

---

## What's Done

### Historical (carried over from earlier sessions)
- ✅ **Phase 1-13.6** — base app + master data + finance + quotations + staff/schedule/DF
- ✅ **Phase 12.2b** (2026-04-24) — Course form ProClinic parity, Rule I established, V13 logged
- ✅ **Phase 12.3** — Sale Insurance Claim UI + SaleReport "เบิกประกัน" col wiring
- ✅ **Phase 14.1** — Document Templates System: 13 seeds + CRUD + print engine
- ✅ **V14 + V15 + V16 + V17 logged** — Firestore-undefined-reject + combined-deploy + race-condition + mobile-resume reconnect
- ✅ **Phase 14.2.A-E** — All 16 doc templates (9 with ProClinic-fidelity replication via Chrome MCP, 4 our-own designs, 3 deferred to Phase 16). F1-F16 test banks (255 tests).

### Session 2026-04-26 session 8 EOD (27 commits, `0a0b9f5` → `6480083`) — Phase 13.5.4 hard-gate END-TO-END (V23-V30) + UC1 + Tier 2

The biggest single session in project history. Started with patient form
submit broken (V23). Shipped 27 commits closing the chicken-and-egg admin
loop end-to-end + adding comprehensive auto-sync + removing all manual
buttons + Thai cultural calendar polish.

V-entries shipped: V23, V24, V25, V25-bis, V26, V27, V27-bis, V27-tris,
V28, V28-bis, V28-tris, V29, V30 (13 V-entries) + UC1.

System is now Perfect 100% auto:
- Owner email login (loverclinic OR OWNER_EMAILS) → auto-bootstrap admin
  claim → sidebar populates → can call /api/admin
- Staff added via StaffFormModal → claims set at creation via setPermission
  (auto-grants admin if gp-owner OR meta-perm group)
- Group change mid-session → UPC re-sync useEffect updates claims without
  re-login
- Manual buttons (Bootstrap self / Sync claims / Cleanup probes) ALL
  REMOVED per user directive — auto-sync handles everything
- listenToUserPermissions queries by firebaseUid field (V30) so newly-
  created staff are visible to soft-gate immediately

Detail: see `.agents/sessions/2026-04-26-session8-phase13.5.4-end-to-end-V23-V30.md`

Tier 2 status: Doc 10/11/12 covered by F12 tests; UC1 shipped (Sun rose +
Sat violet weekend colors per Thai paper-calendar tradition); M9 reconciler
deferred (substantial cron feature, low impact for current state).

Tier 3 status: Phase 14.8.A pre-flight ALREADY IMPLEMENTED in
DocumentPrintModal:173-176. Remaining T3.b-f + T4 + T5 = XL features each,
need focused sessions.

### Session 2026-04-26 session 7 (2 commits, `6799a58` + `884f6cc`) — Phase 13.5.4 Deploy 1 + V24 schedule sync fix
User directives: "ตอนนี้ก่อน phase 15 เหลืออะไรนะ" → "เริ่มทั้งหมดเลย ลำดับความสำคัญก่อนหลังเอา แต่ทำทั้งหมดที่นายแนะนำก่อน 15" → "tab sync proclinic คือ tab ที่ใช้แค่ช่วง develop app ของเรานะ" → "ตอนนี้ทำไม sync หรือ นำเข้า ตารางมาได้แค่แพทย์ ฝากแก้ตรงนี้ก่อน deploy" → "deploy".

#### Commit `6799a58` — Phase 13.5.4 Deploy 1 (hard-gate MVP foundation)
2-phase deploy plan: Deploy 1 ships endpoint + auto-sync + migration button (rules unchanged). User runs migration button. Deploy 2 ships rules claim-only check.

Implementation:
- `api/admin/users.js` — adds `setPermission` + `clearPermission` actions (mirrors grantAdmin/revokeAdmin pattern). serializeUser exposes `isClinicStaff` + `permissionGroupId` from customClaims. Self-protection: clearPermission cannot remove caller's own claim unless bootstrap admin.
- `src/lib/adminUsersClient.js` — `setUserPermission` + `clearUserPermission` wrappers (named-arg pattern, V11-safe).
- `src/components/backend/StaffFormModal.jsx` — auto-sync claims after `saveStaff`. Wrapped in try/catch (non-fatal — Firestore save already landed). Skips when no firebaseUid.
- `src/components/backend/PermissionGroupsTab.jsx` — "Sync ทุก staff → Claims" button (top-right). Loops every be_staff with firebaseUid; per-user error caught; result UI shows synced/skipped/failed + Deploy 2 readiness hint.
- Tests: `tests/phase13.5.4-hard-gate-claims.test.js` 28/28 in H1-H5.

Per Rule H-bis user reaffirmation 2026-04-26 ("ทุกปุ่มใน tab นั้นจะถูกลบทั้งหมด"): migration button placed in PermissionGroupsTab (production-bound), NOT MasterDataTab (dev-only).

#### Commit `884f6cc` — V24 schedule sync fix
User report mid-session: "ตอนนี้ทำไม sync หรือ นำเข้า ตารางมาได้แค่แพทย์ ช่องตารางพนักงานเหมือนไม่มีข้อมูลเลย ฝากแก้ตรงนี้ก่อน deploy".

Root cause: `api/proclinic/master.js handleSyncSchedules` fetched `/admin/api/schedule/today` — comment claimed "covers all staff" but ProClinic actually exposes TWO separate FullCalendar feeds (one per role) with URL-encoded Thai role names:
- `/admin/api/schedule/แพทย์?start=...&end=...`
- `/admin/api/schedule/พนักงาน?start=...&end=...`

Verified via `docs/proclinic-scan/detailed-adminscheduleemployee.json` capture.

Fix:
- New helper `buildScheduleDateRange()` — start/end query window (-180d back, +365d forward, +07:00 TZ).
- `handleSyncSchedules` rewritten: parallel `Promise.all` fetch of both endpoints with `.catch(()=>null)` per endpoint (one-failure tolerant); throws only when BOTH fail; merges + dedupes by `proClinicId` via Set.
- Return shape adds `rawDoctor` + `rawEmployee` count fields for diagnostics.
- Tests: `tests/proclinic-schedule-sync.test.js` SC.E.2 + SC.E.3 updated; NEW SC.G group (7 tests) locks the fix shape.
- V24 V-entry logged in `.claude/rules/00-session-start.md` with 4 lessons.

#### Combined V15 deploy verification (session 7 EOD)
- Pre-probe (5 endpoints): 200/200/200/200/200 ✓ (V23 still LIVE)
- Vercel: deployed in 32s, aliased to lover-clinic-app.vercel.app
- Firebase rules: idempotent fire (rules unchanged this turn)
- Post-probe (5): 200/200/200/200/200 ✓ — V24 fix code is now LIVE; V23 anon UPDATE still 200
- Cleanup: pc_appointments DELETE x 2 + proclinic_session* strip — 4/4 200
- Production HTTP smoke: backend / ?session= / ?patient= — 3/3 200

#### Outstanding user-triggered actions
1. **Verify V24 in production**: MasterDataTab → "ดูดตารางหมอ + พนักงาน" → expect to receive BOTH doctor + employee entries → "นำเข้า master_data → be_staff_schedules" → verify EmployeeSchedulesTab calendar populated.
2. **Run Phase 13.5.4 migration button**: PermissionGroupsTab → "Sync ทุก staff → Claims" (one-time backfill).
3. **After migration**: tell me to ship Phase 13.5.4 Deploy 2 (firestore.rules → claim-only `isClinicStaff()` check).

### Session 2026-04-26 session 6 (1 commit, `0a0b9f5`) — V23 P0 HOTFIX: anon QR/link patient submit
User report (verbatim): "ตอนนี้กดส่งข้อมูลคนไข้ผ่านลิ้งหรือ QR code แล้วขึ้นผิดพลาดตลอดส่งไม่ได้" + "เช็คให้หมดทั้ง frontend แบบ 100% จริงๆ ว่าจะไม่มีบั๊คแบบนี้หรือใกล้เคียงกับแบบนี้อีกแล้ว" + "ทำเสร็จ test แล้ว deploy เลย เพราะใช้จริงอยู่"

Root cause: firestore.rules opd_sessions had `allow update: if isClinicStaff()` since INITIAL commit (`554506b`, 2026-03-23) — **live for entire project history**. Anon patients (signInAnonymously) hit PERMISSION_DENIED. V16 fix (2026-04-25) only made the page LOAD without flashing — never tested SUBMIT path.

100% frontend sweep (per user "เช็คให้หมดทั้ง"): EXACTLY 3 anon-reachable Firestore writes, all opd_sessions:
- `src/pages/PatientForm.jsx:372` (visible alert)
- `src/pages/PatientDashboard.jsx:403` (silent fail .catch)
- `src/pages/PatientDashboard.jsx:410` (silent fail console.warn)
Adjacent surfaces (Storage, Cloud Functions, /api/*) verified safe.

Fix (single rule narrow + V21-paired test bank):
- ✅ **firestore.rules** opd_sessions update narrowed to `isClinicStaff() OR (isSignedIn() AND affectedKeys().hasOnly([11-field whitelist]))`. Mirrors V19 pattern.
- ✅ **`.claude/rules/01-iron-clad.md` Rule B** extended 4 → 5 probe endpoints permanently (NEW: anon-auth opd_sessions PATCH). Future deploys catch this regression class automatically.
- ✅ **NEW** `tests/firestore-rules-anon-patient-update.test.js` — 24 tests in A1-A5 groups (rule shape, writer↔rule contract, Rule B documented, 8 staff-only-field bypass guards, V-entry+handoff updated)
- ✅ **EXTEND** `tests/public-link-auth-race.test.js` R7 group — 5 writer-side regression tests
- ✅ **EXTEND** `tests/e2e/public-links-no-auth.spec.js` V23-lock — 2 runtime no-PERMISSION_DENIED tests for ?session= and ?patient=
- ✅ **V23 entry** added to `.claude/rules/00-session-start.md` § 2

Live verification (this session):
- Pre-deploy probes 1-4: 200/200/200/200 baseline ✓
- Pre-deploy V23 probe: anon CREATE 200 + UPDATE 403 = bug confirmed LIVE
- V15 combined deploy: vercel + firebase rules in parallel, both exit 0
- Post-deploy probes 1-4: 200/200/200/200 (no regression) ✓
- Post-deploy V23 probe: anon CREATE 200 + UPDATE 200 = **fix LIVE** ✓
- Cleanup: pc_appointments DELETE x 2 + proclinic_session* probe-field strip — all 200
- Production HTTP smoke: backend / ?session= / ?patient= all 200 ✓

Key lessons logged in V23 entry:
1. Probe list must cover EVERY auth state that writes (unauth REST, anon-auth client, etc.)
2. Render tests aren't write tests — V16 lock missed SUBMIT path
3. Source-grep tests can lock in working OR broken behavior — pair with runtime
4. Long-lived bugs are the most dangerous — they pass every audit because they were never tested

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
Resume LoverClinic OPD — continue from 2026-04-26 session 8 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (cross-session state of truth — master = 6480083, prod = 5b3a89b)
3. .agents/active.md (hot state — Phase 13.5.4 + V25-V30 + UC1 + Tier 2 closed end-to-end)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V30)
5. .agents/sessions/2026-04-26-session8-phase13.5.4-end-to-end-V23-V30.md (this session detail — 27 commits)

Status summary:
- master = 6480083, ~5400 vitest passing
- Production at 5b3a89b LIVE (V30 deployed via V15 combined). Vercel: lover-clinic-jbx0eyf11
- This session shipped 27 commits + 14 V-entries (V23 → V30) closing chicken-and-egg admin loop end-to-end
- Auto-sync universal: every id, every email, every permission group works automatically
- 175+ permission/security/E2E tests + adversarial coverage
- All 3 manual admin buttons removed per user directive
- Tier 2 closed: Doc 10/11/12 covered by F12; UC1 weekend colors shipped; M9 deferred

Next action (when user gives go-ahead):
- Tier 3 XL features remaining (each needs focused 3-4h session):
  * T3.b Phase 14.8.B signature canvas (react-signature-canvas + new field type)
  * T3.c Phase 14.8.C PDF export (html2pdf.js)
  * T3.d/e Phase 14.9 audit log + watermark + email/LINE delivery
  * T3.f Phase 14.10 bulk print + QR + saved drafts
  * T4 Phase 14.4 G5 customer-product-change (course exchange + refund)
  * T5 Phase 14.11 visual designer + TFP 3200 LOC refactor

Outstanding user-triggered actions (NOT auto-run):
- None code-side. Production verified working end-to-end.

Rules:
- No deploy unless user explicitly says "deploy" THIS turn (V4/V7/V18)
- V15 combined: "deploy" = vercel + firestore:rules in parallel
- Rule B Probe-Deploy-Probe with 5 endpoints + V23 anon-CREATE/UPDATE + V27-tris anon-DELETE = 7 endpoints
- V27 lesson: probe artifacts must use isArchived=true CREATE pattern (not 'pending')
- V28 lesson: soft-gate isAdmin trusts group, not email (drop isAuthorizedAccount prefix)
- V29 lesson: no manual buttons; auto-sync via UPC useEffect + sync-self endpoint
- V30 lesson: be_staff doc IDs = staffId; query by firebaseUid FIELD not uid as doc ID
- Every bug → test + audit invariant + V-entry (Rule D + Rule I)

Invoke /session-start to boot context.
```

---

## Archived Resume Prompt (session 7 — superseded)

```
Resume LoverClinic OPD — continue from 2026-04-26 session 6 (V23 hotfix DEPLOYED).

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (master = 0a0b9f5, prod = 0a0b9f5 LIVE)
3. .agents/active.md (hot state — V23 fix DEPLOYED + verified end-to-end)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V23)

Status summary:
- master = 0a0b9f5, ~5239 vitest passing (49 new V23 tests)
- Production at 0a0b9f5 LIVE — V23 P0 hotfix deployed via V15 combined (vercel + firestore:rules)
- Pre-deploy V23 probe confirmed bug live (anon UPDATE 403); post-deploy 5 probes all 200
- Production HTTP 200 on backend + ?session= + ?patient=
- Rule B probe-list extended permanently 4 → 5 endpoints

V23 fix shape (summarised — full V-entry in 00-session-start.md):
- firestore.rules opd_sessions update narrowed to `isClinicStaff() OR (isSignedIn() AND hasOnly([11-field whitelist]))`
- Whitelist: status, patientData, submittedAt, updatedAt, isUnread, lastCoursesAutoFetch, coursesRefreshRequest, brokerStatus, brokerError, brokerJob, latestCourses
- Anon attacker who guesses sessionId can only modify those 11 fields (V19 hasOnly pattern)
- Test bank: NEW firestore-rules-anon-patient-update.test.js (24) + EXTEND public-link-auth-race R7 (5) + EXTEND e2e V23-lock (2)

Next action (when user gives direction):
- If user verifies in production: open `?session=<id>` from incognito → fill → submit → success expected (was "เกิดข้อผิดพลาดของระบบ" pre-V23)
- If user wants Phase 13.5.4 hard-gate: server-side Firebase custom claims + firestore.rules narrowing
- If user wants Phase 15 Central Stock: skip if single-branch
- If user wants TFP refactor: 3200 LOC → 7-8 sub-components (XL effort)
- If user wants permission group customization: edit via PermissionGroupsTab + assign via StaffFormModal

Outstanding user actions (NOT auto-run):
- (Optional) Admin can manually archive `opd_sessions/test-probe-anon-1777184257` and `opd_sessions/test-probe-anon-1777184370` from queue if they show as noise. They don't affect any real flow.

Rules:
- No deploy unless user says "deploy" THIS turn (V4/V7/V18)
- V15 combined: "deploy" = vercel + firestore:rules in parallel
- Rule B Probe-Deploy-Probe — NOW 5 ENDPOINTS (V23 added anon-auth opd_sessions PATCH permanently)
- V20 multi-branch Option 1 locked
- V21 lesson: source-grep tests can encode broken behavior — pair with runtime
- V22 lesson: multi-instance render must have multi-instance test fixtures
- V23 lesson: probe list must cover every auth state that writes (anon-auth ≠ unauth-REST)
- Every bug → test + audit invariant + V-entry (Rule D + Rule I)

Invoke /session-start to boot context.
```

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~250 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
